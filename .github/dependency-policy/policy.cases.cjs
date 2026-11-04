/* CommonJS is required by the trusted github-script loader. */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const mergifyPath = fs.existsSync(".mergify.yml")
  ? ".mergify.yml"
  : ".github/mergify.yml";
assert.equal(
  fs.existsSync(".mergify.yml") && fs.existsSync(".github/mergify.yml"),
  false
);
const { classify, bump, currentApproval, eligible } = require("./policy.cjs");

function fixture(name = "pino", old = "1.0.0", next = "1.1.0", dev = false) {
  const section = dev ? "devDependencies" : "dependencies";
  const manifest = (v) => ({ name: "app", [section]: { [name]: `^${v}` } });
  const lock = (v) => ({
    lockfileVersion: 3,
    packages: {
      "": manifest(v),
      [`node_modules/${name}`]: {
        version: v,
        resolved: `https://registry.npmjs.org/${name}/-/${name}-${v}.tgz`,
        integrity: "sha512-test",
        ...(dev ? { dev: true } : {}),
      },
    },
  });
  const level = bump(old, next);
  return {
    head: "head",
    files: ["package.json", "package-lock.json"].map((filename) => ({
      filename,
      status: "modified",
    })),
    before: [manifest(old), lock(old)],
    after: [manifest(next), lock(next)],
    commits: [
      {
        sha: "head",
        author: { login: "dependabot[bot]" },
        committer: { login: "web-flow" },
        commit: {
          verification: { verified: true },
          message: `Bumps x from ${old} to ${next}.\n\n---\nupdated-dependencies:\n- dependency-name: ${name}\n  dependency-version: ${next}\n  dependency-type: direct:${dev ? "development" : "production"}\n  update-type: version-update:semver-${level}\n...\n`,
        },
      },
    ],
  };
}
const review = (
  login = "pnupu",
  state = "APPROVED",
  commit_id = "head",
  type = "User"
) => ({ user: { login, type }, state, commit_id });
const request = () => ({
  activated: true,
  classification: { lane: "AUTO" },
  reviews: [],
  checks: ["success", "success"],
  pr: {
    state: "open",
    draft: false,
    mergeable: true,
    base: { ref: "main" },
    user: { login: "dependabot[bot]" },
    labels: [],
    head: { sha: "head" },
  },
});

for (const [name, old, next, dev, lane] of [
  ["pino", "1.0.0", "1.0.1", false, "AUTO"],
  ["pino", "1.0.0", "1.1.0", false, "AUTO"],
  ["prettier", "3.0.0", "3.1.0", true, "AUTO"],
  ["pino", "1.0.0", "2.0.0", false, "HUMAN"],
  ["pino", "0.1.0", "0.2.0", false, "HUMAN"],
  ["undici", "1.0.0", "1.0.1", false, "HUMAN"],
  ["pulsar-client", "1.0.0", "1.0.1", false, "HUMAN"],
  ["node", "1.0.0", "1.0.1", false, "HUMAN"],
  ["prettier", "3.0.0", "4.0.0", true, "HUMAN"],
  ["typescript", "5.0.0", "5.0.1", true, "HUMAN"],
  ["protobufjs-cli", "1.0.0", "1.0.1", true, "HUMAN"],
  ["unknown", "1.0.0", "1.0.1", false, "HUMAN"],
])
  test(`${name} ${old} -> ${next} ${dev ? "dev" : "prod"} is ${lane}`, () =>
    assert.equal(classify(fixture(name, old, next, dev)).lane, lane));
for (const [description, mutate] of [
  [
    "Actions",
    (f) =>
      f.files.push({
        filename: ".github/workflows/ci.yml",
        status: "modified",
      }),
  ],
  [
    "Docker runtime",
    (f) => f.files.push({ filename: "Dockerfile", status: "modified" }),
  ],
  ["missing metadata", (f) => (f.commits[0].commit.message = "Bump pino")],
  ["stale head", (f) => (f.head = "new")],
  ["unsigned", (f) => (f.commits[0].commit.verification.verified = false)],
  ["foreign author", (f) => (f.commits[0].author.login = "someone")],
  ["extra commits", (f) => f.commits.push(f.commits[0])],
  [
    "inconsistent metadata",
    (f) =>
      (f.commits[0].commit.message = f.commits[0].commit.message.replace(
        "dependency-version: 1.1.0",
        "dependency-version: 9.0.0"
      )),
  ],
  [
    "transitive native patch",
    (f) => {
      f.before[1].packages["node_modules/native"] = {
        version: "1.0.0",
        hasInstallScript: true,
      };
      f.after[1].packages["node_modules/native"] = {
        version: "1.0.1",
        hasInstallScript: true,
      };
    },
  ],
  [
    "integrity-only transitive",
    (f) => {
      f.before[1].packages["node_modules/native"] = { integrity: "old" };
      f.after[1].packages["node_modules/native"] = { integrity: "new" };
    },
  ],
  [
    "native marker",
    (f) => (f.after[1].packages["node_modules/pino"].hasInstallScript = true),
  ],
  [
    "manifest script injection",
    (f) => (f.after[0].scripts = { postinstall: "evil" }),
  ],
  [
    "lock mismatch",
    (f) => (f.after[1].packages[""].dependencies.pino = "^9.0.0"),
  ],
  [
    "mixed prod/dev",
    (f) => {
      f.before[0].devDependencies = { typescript: "^5.0.0" };
      f.after[0].devDependencies = { typescript: "^5.1.0" };
    },
  ],
  [
    "registry substitution",
    (f) =>
      (f.after[1].packages["node_modules/pino"].resolved =
        "https://evil.test/pkg.tgz"),
  ],
  [
    "missing lock version delta",
    (f) =>
      (f.after[1].packages["node_modules/pino"] =
        f.before[1].packages["node_modules/pino"]),
  ],
])
  test(`${description} fails closed to HUMAN`, () => {
    const f = fixture();
    mutate(f);
    assert.equal(classify(f).lane, "HUMAN");
  });
test("security updates do not exempt sensitive packages", () => {
  const f = fixture("undici", "1.0.0", "1.0.1");
  f.commits[0].commit.message = "Security fix\n" + f.commits[0].commit.message;
  assert.equal(classify(f).lane, "HUMAN");
});
test("current pnupu approval only", () => {
  assert.equal(currentApproval([review()], "head"), true);
  for (const reviews of [
    [review("other")],
    [review("bot", "APPROVED", "head", "Bot")],
    [review("pnupu", "APPROVED", "head", "Bot")],
    [review("pnupu", "APPROVED", "old")],
    [review(), review("pnupu", "DISMISSED")],
    [review(), review("other", "CHANGES_REQUESTED")],
  ])
    assert.equal(currentApproval(reviews, "head"), false);
  assert.equal(
    currentApproval([review(), review("pnupu", "COMMENTED")], "head"),
    true
  );
});
test("same eligibility is reevaluated after queue entry", () => {
  const r = request();
  assert.equal(eligible(r), true);
  for (const hold of ["hold", "help wanted", "help-wanted", "HOLD"]) {
    r.pr.labels = [{ name: hold }];
    assert.equal(eligible(r), false);
  }
  r.pr.labels = [];
  r.classification.lane = "HUMAN";
  assert.equal(eligible(r), false);
  r.reviews = [review()];
  assert.equal(eligible(r), true);
  r.reviews.push(review("pnupu", "DISMISSED"));
  assert.equal(eligible(r), false);
  r.reviews = [review()];
  r.pr.head.sha = "new";
  assert.equal(eligible(r), false);
});
for (const [name, mutate] of [
  ["draft", (r) => (r.pr.draft = true)],
  ["conflict", (r) => (r.pr.mergeable = false)],
  ["unknown mergeability", (r) => (r.pr.mergeable = null)],
  ["CI failure", (r) => (r.checks = ["success", "failure"])],
  ["CI pending", (r) => (r.checks = ["success", "pending"])],
  ["CI missing", (r) => (r.checks = ["success"])],
  ["activation missing", (r) => (r.activated = false)],
  [
    "changes request",
    (r) => (r.reviews = [review("other", "CHANGES_REQUESTED")]),
  ],
])
  test(name + " blocks both lanes", () => {
    for (const lane of ["AUTO", "HUMAN"]) {
      const r = request();
      r.classification.lane = lane;
      r.reviews = [review()];
      mutate(r);
      assert.equal(eligible(r), false);
    }
  });
test("manual queue and merge wiring use identical conditions", () => {
  const y = fs.readFileSync(mergifyPath, "utf8");
  assert.match(y, /queue_conditions: &eligibility/);
  assert.match(y, /merge_conditions: \*eligibility/);
  assert.match(y, /conditions: \*eligibility/);
  for (const required of [
    "approved-reviews-by=pnupu",
    "check-success=@github-actions/Dependency policy AUTO",
    "check-success=@github-actions/Dependency policy Dependabot",
    "check-success=@github-actions/Dependency policy",
    "help wanted|help-wanted|hold",
    "check-success=CodeQL",
    "check-success=Build, check, test, push",
  ])
    assert.ok(y.includes(required));
  assert.doesNotMatch(y, /#approved-reviews-by>=1/);
  assert.match(y, /batch_size: 1/);
});
test("privileged workflow uses trusted base only; no approval/native bypass", () => {
  const y = fs.readFileSync(
    ".github/workflows/dependabot-auto-merge.yml",
    "utf8"
  );
  assert.match(y, /pull_request_target:/);
  assert.match(y, /ref: \$\{\{ github.event.repository.default_branch \}\}/);
  assert.doesNotMatch(y, /DEPENDENCY_POLICY_ENABLED/);
  assert.match(y, /persist-credentials: false/);
  assert.doesNotMatch(
    y,
    /gh pr (review|merge)|pull_request.head|npm (ci|install)|contents: write|pull-requests: write/
  );
  assert.equal(
    JSON.parse(fs.readFileSync(".github/dependency-policy/activation.json"))
      .enabled,
    false
  );
});

test("real repository lock and grouped metadata qualify", () => {
  const { repositoryFixture } = require("./fixtures.cjs");
  const f = repositoryFixture();
  assert.equal(classify(f).lane, "AUTO");
});
test("quoted scoped metadata is parsed without trusting unknown YAML", () => {
  const { metadata } = require("./policy.cjs");
  assert.equal(
    metadata(
      '---\nupdated-dependencies:\n- dependency-name: "@types/node"\n  dependency-group: eslint\n...\n'
    )[0]["dependency-name"],
    "@types/node"
  );
});
test("historical signed grouped update fixture is AUTO", () => {
  const f = structuredClone(require("./prettier-group.fixture.json"));
  assert.equal(classify(f).lane, "AUTO");
  f.after[1].dependencies.prettier.integrity = "different";
  assert.equal(classify(f).lane, "HUMAN");
});
test("privileged publisher is isolated from PR execution credentials", () => {
  const y = fs.readFileSync(
    ".github/workflows/dependabot-auto-merge.yml",
    "utf8"
  );
  assert.match(y, /^ {2}statuses: write$/m);
  assert.doesNotMatch(
    y,
    /create-github-app-token|environment: dependency-policy/
  );
  const ci = fs.readFileSync(".github/workflows/ci-cd.yml", "utf8");
  assert.match(ci, /permissions:\n {2}contents: read/);
  assert.match(ci, /persist-credentials: false/);
  const mergify = fs.readFileSync(mergifyPath, "utf8");
  assert.doesNotMatch(mergify, /check-success=Dependency policy/);
  assert.match(
    mergify,
    /check-success=@github-actions\/Dependency policy AUTO/
  );
  assert.match(
    mergify,
    /check-success=@github-actions\/Dependency policy Dependabot/
  );
});
test("repository fixture remains valid after npm v3 migration", () => {
  const { repositoryFixture } = require("./fixtures.cjs");
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  lock.lockfileVersion = 3;
  delete lock.dependencies;
  assert.equal(classify(repositoryFixture(lock)).lane, "AUTO");
});
test("every workflow filename rejects retained broad bot approval and fictional activation gates", () => {
  for (const filename of fs
    .readdirSync(".github/workflows")
    .filter((name) => /\.ya?ml$/.test(name))) {
    const workflow = fs.readFileSync(`.github/workflows/${filename}`, "utf8");
    assert.doesNotMatch(
      workflow,
      /gh\s+pr\s+review\b[\s\S]*?--approve/,
      filename
    );
  }
  const contract = fs.readFileSync("docs/dependency-policy.md", "utf8");
  assert.doesNotMatch(contract, /DEPENDENCY_POLICY_ENABLED/);
});

/* eslint-enable @typescript-eslint/no-require-imports */
