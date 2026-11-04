/* CommonJS is required by the trusted github-script loader. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { classify, eligible, CONTEXT } = require("./policy.cjs");
const activation = require("./activation.json");
const PUBLISHER = "github-actions[bot]";

module.exports = async ({ github, context, core }) => {
  const repo = context.repo;
  const configured = activation.enabled;
  const { data: repository } = await github.rest.repos.get(repo);
  const defaultBranch = repository.default_branch;
  const pulls = context.payload.pull_request
    ? [context.payload.pull_request]
    : await github.paginate(github.rest.pulls.list, {
        ...repo,
        state: "open",
        base: defaultBranch,
        per_page: 100,
      });
  // Commit statuses are SHA-scoped. Active bot PRs own the shared general
  // context; manual PRs must not alternate it with bot eligibility results.
  const botOwnsHead = async (sha) => {
    const associated = await github.paginate(
      github.rest.repos.listPullRequestsAssociatedWithCommit,
      { ...repo, commit_sha: sha, per_page: 100 }
    );
    for (const association of associated) {
      if (!association.user?.login || !Number.isInteger(association.number))
        throw new Error("Incomplete associated PR inventory");
      if (association.user.login !== "dependabot[bot]") continue;
      // Read closed associations too: a historical PR can be reopened, while
      // a freshly closed bot PR must not permanently reserve a manual head.
      const { data: bot } = await github.rest.pulls.get({
        ...repo,
        pull_number: association.number,
      });
      if (
        bot.state === "open" &&
        bot.user.login === "dependabot[bot]" &&
        bot.base.ref === defaultBranch &&
        bot.head.sha === sha
      )
        return true;
    }
    return false;
  };
  for (const candidate of pulls) {
    if (candidate.user.login !== "dependabot[bot]") {
      const number = candidate.number;
      let verifiedSha;
      try {
        const { data: first } = await github.rest.pulls.get({
          ...repo,
          pull_number: number,
        });
        if (
          first.state !== "open" ||
          first.user.login === "dependabot[bot]" ||
          first.base.ref !== defaultBranch
        )
          continue;
        verifiedSha = first.head.sha;
        const cached = await github.paginate(
          github.rest.repos.listCommitStatusesForRef,
          { ...repo, ref: verifiedSha, per_page: 100 }
        );
        const [{ data: fresh }, { data: freshRepository }] = await Promise.all([
          github.rest.pulls.get({ ...repo, pull_number: number }),
          github.rest.repos.get(repo),
        ]);
        if (
          fresh.state !== "open" ||
          fresh.user.login === "dependabot[bot]" ||
          fresh.head.sha !== verifiedSha ||
          fresh.base.sha !== first.base.sha ||
          fresh.base.ref !== defaultBranch ||
          freshRepository.default_branch !== defaultBranch
        )
          continue;
        if (await botOwnsHead(verifiedSha)) continue;
        const description =
          "Manual merge process applies; no dependency auto-approval or merge";
        const previous = cached.find(
          (status) =>
            status.context === CONTEXT && status.creator?.login === PUBLISHER
        );
        if (
          previous?.state === "success" &&
          previous.description === description
        )
          continue;
        await github.rest.repos.createCommitStatus({
          ...repo,
          sha: verifiedSha,
          context: CONTEXT,
          state: "success",
          description,
        });
      } catch (error) {
        core.warning(`Manual PR ${number}: ${error.message}`);
        if (verifiedSha) {
          try {
            // Unknown ownership must not overwrite a bot result, even on errors.
            if (await botOwnsHead(verifiedSha)) continue;
            const description =
              `Manual PR verification failed: ${error.message}`.slice(0, 140);
            let statuses = [];
            try {
              statuses = await github.paginate(
                github.rest.repos.listCommitStatusesForRef,
                { ...repo, ref: verifiedSha, per_page: 100 }
              );
            } catch (statusError) {
              core.warning(
                `Cannot deduplicate manual failure: ${statusError.message}`
              );
            }
            const previous = statuses.find(
              (status) =>
                status.context === CONTEXT &&
                status.creator?.login === PUBLISHER
            );
            if (
              previous?.state === "failure" &&
              previous.description === description
            )
              continue;
            await github.rest.repos.createCommitStatus({
              ...repo,
              sha: verifiedSha,
              context: CONTEXT,
              state: "failure",
              description,
            });
          } catch (writeError) {
            core.setFailed(
              `Cannot block manual PR ${number}: ${writeError.message}`
            );
          }
        }
      }
      continue;
    }
    const number = candidate.number;
    let sha = candidate.head.sha;
    let cached;
    const publish = async (name, state, description) => {
      description = description.slice(0, 140);
      const previous = cached?.find(
        (s) => s.context === name && s.creator?.login === PUBLISHER
      );
      if (previous?.state === state && previous.description === description)
        return;
      const { data: written } = await github.rest.repos.createCommitStatus({
        ...repo,
        sha,
        context: name,
        state,
        description,
      });
      cached ||= [];
      cached.unshift(written);
    };
    try {
      const { data: pr } = await github.rest.pulls.get({
        ...repo,
        pull_number: number,
      });
      sha = pr.head.sha;
      if (
        pr.state !== "open" ||
        pr.user.login !== "dependabot[bot]" ||
        pr.base.ref !== defaultBranch
      )
        continue;
      cached = await github.paginate(
        github.rest.repos.listCommitStatusesForRef,
        { ...repo, ref: sha, per_page: 100 }
      );
      const files = await github.paginate(github.rest.pulls.listFiles, {
        ...repo,
        pull_number: number,
        per_page: 100,
      });
      if (files.length !== pr.changed_files)
        throw new Error("Incomplete file inventory");
      const commits = await github.paginate(github.rest.pulls.listCommits, {
        ...repo,
        pull_number: number,
        per_page: 100,
      });
      const read = async (ref, path) => {
        const { data } = await github.rest.repos.getContent({
          ...repo,
          ref,
          path,
        });
        if (data.encoding !== "base64" || !data.content)
          throw new Error("Unsupported file content");
        return JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
      };
      let before, after;
      if (
        files.every((f) =>
          ["package.json", "package-lock.json"].includes(f.filename)
        )
      ) {
        // Compare to current base: base drift fails conservatively to HUMAN.
        [before, after] = await Promise.all(
          [pr.base.sha, pr.head.sha].map((ref) =>
            Promise.all(
              ["package.json", "package-lock.json"].map((path) =>
                read(ref, path)
              )
            )
          )
        );
      }
      const classification = classify({
        files,
        before,
        after,
        commits,
        head: sha,
      });
      const reviews = await github.paginate(github.rest.pulls.listReviews, {
        ...repo,
        pull_number: number,
        per_page: 100,
      });
      const runs = await github.paginate(github.rest.checks.listForRef, {
        ...repo,
        ref: sha,
        per_page: 100,
      });
      const { data: combined } =
        await github.rest.repos.getCombinedStatusForRef({ ...repo, ref: sha });
      const checks = ["CodeQL", "Build, check, test, push"].map((name) => {
        const run = runs.find((c) => c.name === name);
        const legacy = combined.statuses.find((c) => c.context === name);
        return run
          ? run.status === "completed"
            ? run.conclusion
            : "pending"
          : legacy?.state;
      });
      const { data: fresh } = await github.rest.pulls.get({
        ...repo,
        pull_number: number,
      });
      const { data: latestRepository } = await github.rest.repos.get(repo);
      if (
        fresh.head.sha !== sha ||
        fresh.base.sha !== pr.base.sha ||
        fresh.base.ref !== defaultBranch ||
        fresh.user.login !== "dependabot[bot]" ||
        latestRepository.default_branch !== defaultBranch
      )
        throw new Error(
          "Head/base/author/default branch changed during evaluation"
        );
      const allowed = eligible({
        pr: fresh,
        classification,
        reviews,
        checks,
        activated: configured,
      });
      core.info(
        JSON.stringify({
          number,
          head: sha,
          ...classification,
          activated: configured,
          allowed,
        })
      );
      await publish(
        `${CONTEXT} AUTO`,
        configured && classification.lane === "AUTO" ? "success" : "failure",
        "Immutable diff classification; never authorizes HUMAN"
      );
      await publish(
        `${CONTEXT} Dependabot`,
        allowed ? "success" : "failure",
        `Dependabot ${classification.lane}: ${classification.reason}`
      );
      await publish(
        CONTEXT,
        allowed ? "success" : "failure",
        !configured
          ? "Activation blocked: complete required-status and token-permission adoption"
          : `${classification.lane}: ${classification.reason}`
      );
    } catch (error) {
      // Revoke cached success on the known head even when the first GET fails.
      // A rejected write cannot be made fail-closed by repository code alone.
      core.warning(`PR ${number}: ${error.message}`);
      for (const name of [
        `${CONTEXT} AUTO`,
        `${CONTEXT} Dependabot`,
        CONTEXT,
      ]) {
        try {
          await publish(name, "failure", `Fail closed: ${error.message}`);
        } catch (writeError) {
          core.setFailed(
            `Cannot revoke PR ${number} ${name}: ${writeError.message}`
          );
        }
      }
    }
  }
};
/* eslint-enable @typescript-eslint/no-require-imports */
