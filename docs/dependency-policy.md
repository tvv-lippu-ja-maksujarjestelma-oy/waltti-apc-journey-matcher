# Dependency approval contract (Option A)

Approver: **pnupu**. Scope: this repository only. No approval or merge is
performed by the policy workflow. Mergify is the only configured automatic
merge executor. No bot approval is created.

## Activation is blocked

`activation.json` is deliberately disabled. The trusted evaluator still runs for
all pull requests: a freshly verified non-Dependabot PR to the current default
branch receives the general `Dependency policy` success for the manual merge
path, with no AUTO status or merge authorization. Dependabot PRs remain blocked
until a separately authorized adoption verifies settings and enables AUTO in
trusted base code. This change does not alter repository settings or authorize
its own merge.
Existing branch protections and required checks are not changed by this policy.
Repository settings must be inspected and adoption prerequisites verified before
activation.

Before activation, require **Dependency policy**, bound to the `github-actions`
GitHub App, alongside every existing required check. Retain strict up-to-date CI,
admin enforcement and branch protections. Audit all bypass actors; none may
merge dependencies outside this contract. Restrict policy/workflow/config edits
through the organization's trusted review process. Then enable activation in a
separately reviewed commit. Do not grant write tokens to PR head code.

The trusted evaluator uses the GitHub Actions token with statuses write.
Both Mergify policy conditions are qualified to `@github-actions/`; a third-party
integration or personal token cannot satisfy them. All jobs that execute PR
code must explicitly lack status/check writes, and their checkout credentials
must not confer writes. The build workflow uses `contents: read`
and disables persisted checkout credentials. CodeQL and Trivy already declare
permissions without status/check writes; their security-event uploads remain.
The review signal has no permissions. The evaluator alone can publish policy
statuses and runs only trusted default-branch code, never PR artifacts/scripts.

The threat boundary covers Dependabot changes, compromised dependency execution
and stale or bot approvals. Repository writers intentionally changing trusted
workflows or granting new credentials are trusted administrative actors; that
requires an additional organization-level security design if later in scope.
No dedicated app, service, environment or new secret is needed for this boundary.
The evaluator always runs; there is no repository-variable activation gate.
After separately authorized required-status adoption, verification of untrusted
execution token permissions, and live hold/review-revocation checks, change only
`activation.json.enabled` to `true` in a separately reviewed trusted-base commit.
Keep every existing protection and required check. This task leaves activation
false and changes no remote settings, variables or protections.

Native GitHub auto-merge is **not supported for activation by this seed alone**.
A required asynchronous status cannot atomically veto a hold or withdrawn review
at merge time. Native adopters need a trusted merge executor with live vetoes
(or equivalent GitHub App/ruleset enforcement), and must disable legacy native
auto-merge until that is verified. Do not treat an optional check as enforcement.
No settings were changed here, and no other application was modified.

## Classification

AUTO requires an authentic, GitHub-verified single Dependabot commit, its signed
metadata trailer, and full manifest/lock agreement. Titles, bodies and labels
never authorize a lane. Multiple commits, missing/unknown/inconsistent metadata,
unsupported files/formats/ranges, additions/removals, and uncovered transitive
changes all require HUMAN. This intentionally trades automation coverage for
review safety. Signed metadata is parsed with a restricted grammar; unknown
trailers require HUMAN. The trusted runner reads immutable blobs through GitHub's
API and never checks out, installs or executes PR content.

npm lockfile v2 and v3 are supported; v2 legacy and packages trees must agree.
Grouped trailers and quoted names are supported by the restricted parser.

The initial audited catalog is production `pino` and development `prettier` and
`eslint-config-prettier`. Only patch/minor changes qualify; 0.x patches are allowed, while 0.x minors
require HUMAN. Every changed
lock entry must independently qualify; changed transitives are HUMAN. Expanding
the catalog requires explicit security review of production impact and the full
transitive graph. Native/install-script/optional packages, non-registry sources,
compilers, schema generators, shipped-output tools, runtime/base images, Actions,
all majors, pre-1.0 minors, and unlisted packages require HUMAN. Thus `undici`,
`pulsar-client`, TypeScript and ts-jest always require pnupu. Security fixes keep
these boundaries; expedite pnupu review rather than bypassing it.

## Approval and merge

HUMAN requires a non-dismissed APPROVED review by the User `pnupu` with
`commit_id` exactly equal to the current head. Other humans and bots do not
substitute. New head commits invalidate this approval independently of GitHub's
stale-dismissal setting. COMMENTED reviews do not withdraw approvals; GitHub's
DISMISSED state does. Any outstanding request for changes blocks both lanes.

The trusted workflow reevaluates PR changes, labels and review signals, plus a
five-minute reconciliation schedule. It publishes only changed status results (no periodic pending churn),
fails closed on API/content errors, and checks head/base stability before success.
Concurrency can supersede pending event runs; new heads then wait for scheduled
reconciliation and remain blocked meanwhile. Review signals execute no checkout and have no write permissions; their
workflow_run consumer trusts no artifacts or event-supplied policy results.

The single-PR Mergify queue repeats identical conditions at entry and merge,
including manual queue commands: live holds (`help wanted`, `help-wanted`,
`hold`, case insensitive), draft, conflict, open state, current policy status,
Build and CodeQL, and no outstanding changes request. HUMAN also needs Mergify's
live `approved-reviews-by=pnupu`; AUTO requires its separate diff-classification
status. This prevents cached approval success from surviving dismissal. The
`Dependency policy Dependabot` status is mandatory on every bot queue path and
is published only by Dependabot evaluation. A general manual status from a
same-SHA PR cannot change bot readiness. A fresh associated-PR lookup reserves
the general context for an active Dependabot PR targeting the current default
branch at that head. Manual signals defer all writes, including failures, while
that bot PR is active. Closed historical bot associations do not reserve a head.
Unchanged scans deduplicate statuses, preserving the per-SHA/context write cap
and allowing recovery after current-head approval. All three statuses are app-qualified.
There is no label-based approval path or generic bot approval. GitHub's required checks remain additional constraints.

GitHub webhooks/checks are asynchronous. Mergify's live conditions supply the
merge-time mutable-state veto; the workflow supplies diff classification and
current-head approval. Do not reuse only the workflow as a native merge gate.
A Mergify-authored update/rebase head is conservatively HUMAN; ask Dependabot
to rebase to recover AUTO. Base drift also falls back to HUMAN. Live queued hold/dismissal tests are required during adoption before enabling
unattended merges. This task does not execute real merges to test them.

## Acceptance and validation

Run `node --test .github/dependency-policy/policy.cases.cjs` and
`node --test .github/dependency-policy/runner.cases.cjs`. The tests cover stable
updates, high-risk updates and transitives, mixed groups, metadata/diff failures,
current-head pnupu approval, other humans/bots, dismissal, new heads, late holds,
CI failures/absence, and activation. Wiring tests check queue and merge parity,
manual-queue conditions, trusted checkout and removal of broad auto-approval.
Run the repository's existing `npm run check-and-build` without production
services. Validate workflows and Mergify with their official schema tools.

## Reuse in the other ten applications

1. Transfer committed policy source, tests, workflows and this contract through
   Git. Start each repository disabled. Keep its existing CI/security checks.
2. Inventory every manifest/lockfile, ecosystem, hold label and merge executor.
   Python and other lock formats require tested adapters; they stay HUMAN until
   full delta coverage exists. Never copy the npm AUTO catalog blindly.
3. Replace all generic bot approvals and ungated merge paths. For Mergify, use
   the queue-level conditions at entry and merge, not only PR automation rules.
4. Substitute each repository's default branch and required check names in the
   runner/config. Keep exact current-head pnupu approval and trusted base code.
5. Obtain separate authorization for required policy status/app binding, bypass
   restrictions and native executor changes. Verify settings read-only afterward.
6. Run this acceptance suite plus repository checks and live queue veto tests.
   Review independently, enable only after prerequisites pass, then seek Ilkka's
   per-repository merge approval. Do not install Mergify in native-only apps.

Sources: [Mergify queue rules](https://docs.mergify.com/merge-queue/rules/),
[manual queue](https://docs.mergify.com/commands/queue/),
[conditions](https://docs.mergify.com/configuration/conditions/),
[GitHub review API](https://docs.github.com/en/rest/pulls/reviews),
[trusted workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
[Dependabot verification contract](https://github.com/dependabot/fetch-metadata/blob/main/src/dependabot/verified_commits.ts).
