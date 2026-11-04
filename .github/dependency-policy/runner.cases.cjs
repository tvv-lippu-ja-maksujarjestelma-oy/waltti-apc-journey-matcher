/* CommonJS is required by the trusted github-script loader. */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const run = require("./run.cjs");
const activation = require("./activation.json");
const { repositoryFixture } = require("./fixtures.cjs");

function mock({
  held = false,
  state = "APPROVED",
  head = "head",
  ci = "success",
  missing = false,
  changed = false,
  fixture,
  encoding = "base64",
  cached = [],
  userLogin = "dependabot[bot]",
  targetBranch = "main",
  prState = "open",
  stale = false,
  apiError,
  reviewHead = "head",
} = {}) {
  const pr = {
    number: 1,
    state: prState,
    user: { login: userLogin },
    base: { ref: targetBranch, sha: "base" },
    head: { sha: head },
    labels: held ? [{ name: "hold" }] : [],
    draft: false,
    mergeable: true,
    changed_files: fixture ? 2 : 1,
  };
  const written = [];
  let pullGets = 0;
  const methods = {
    get: async () => {
      pullGets += 1;
      if (apiError === "pull") throw Error("pull unavailable");
      return {
        data:
          changed || (stale && pullGets > 1)
            ? { ...pr, head: { sha: `changed-${pullGets}` } }
            : pr,
      };
    },
    list: () => {},
    listFiles: () => {},
    listCommits: () => {},
    listReviews: () => {},
    listForRef: () => {},
    listCommitStatusesForRef: () => {},
    listPullRequestsAssociatedWithCommit: () => {},
    getContent: async ({ ref, path }) => ({
      data: {
        encoding,
        content: Buffer.from(
          JSON.stringify(
            (ref === "base" ? fixture.before : fixture.after)[
              path === "package.json" ? 0 : 1
            ]
          )
        ).toString("base64"),
      },
    }),
    getCombinedStatusForRef: async () => ({ data: { statuses: [] } }),
    createCommitStatus: async (s) => {
      written.push(s);
      cached.unshift({
        ...s,
        creator: { login: "github-actions[bot]" },
      });
      return { data: cached[0] };
    },
  };
  const repoMethods = {
    ...methods,
    get: async () => {
      if (apiError === "repo") throw Error("repository unavailable");
      return { data: { default_branch: "main" } };
    },
  };
  const github = {
    rest: { pulls: methods, repos: repoMethods, checks: methods },
    paginate: async (fn) => {
      if (fn === methods.listPullRequestsAssociatedWithCommit) {
        if (apiError === "associations")
          throw Error("associations unavailable");
        return [];
      }
      if (fn === methods.listCommitStatusesForRef) {
        if (apiError === "statuses") throw Error("statuses unavailable");
        return cached.slice();
      }
      if (fn === methods.listFiles && fixture) return fixture.files;
      if (fn === methods.listFiles)
        return [{ filename: "Dockerfile", status: "modified" }];
      if (fn === methods.listCommits) return fixture?.commits || [];
      if (fn === methods.listReviews)
        return [
          {
            user: { login: "pnupu", type: "User" },
            state,
            commit_id: reviewHead,
          },
        ];
      if (fn === methods.listForRef)
        return missing
          ? []
          : ["CodeQL", "Build, check, test, push"].map((name) => ({
              name,
              status: "completed",
              conclusion: ci,
            }));
      throw Error("Unexpected pagination");
    },
  };
  return {
    github,
    context: {
      repo: { owner: "owner", repo: "repo" },
      payload: { pull_request: pr },
    },
    core: { info: () => {}, warning: () => {}, setFailed: () => {} },
    written,
  };
}
const final = (m) =>
  m.written.filter((s) => s.context === "Dependency policy").at(-1).state;
test("fresh non-Dependabot PRs get only the general manual-policy success", async () => {
  const m = mock({ userLogin: "alice" });
  await run(m);
  const general = m.written.filter(
    (status) => status.context === "Dependency policy"
  );
  assert.equal(general.length, 1);
  assert.equal(general[0].state, "success");
  assert.match(general[0].description, /Manual merge process applies/);
  assert.equal(
    m.written.some((status) => status.context === "Dependency policy AUTO"),
    false
  );
});
test("stale, unsupported and API-error manual PR states never receive success", async () => {
  for (const options of [
    { userLogin: "alice", stale: true },
    { userLogin: "alice", targetBranch: "release" },
    { userLogin: "alice", prState: "closed" },
    { userLogin: "alice", apiError: "repo" },
    { userLogin: "alice", apiError: "pull" },
    { userLogin: "alice", apiError: "statuses" },
  ]) {
    const m = mock(options);
    await run(m).catch(() => {});
    assert.equal(
      m.written.some(
        (status) =>
          status.context === "Dependency policy" && status.state === "success"
      ),
      false,
      JSON.stringify(options)
    );
    assert.equal(
      m.written.some((status) => status.context === "Dependency policy AUTO"),
      false,
      JSON.stringify(options)
    );
  }
});
test("same-SHA manual status cannot overwrite Dependabot readiness", async () => {
  activation.enabled = true;
  try {
    const m = mock({
      head: "shared-head",
      state: "APPROVED",
      reviewHead: "old-head",
    });
    await run(m);
    const botStatus = () =>
      m.written
        .filter((status) => status.context === "Dependency policy Dependabot")
        .at(-1);
    assert.equal(botStatus().state, "failure");
    m.context.payload.pull_request.user.login = "fork-author";
    await run(m);
    assert.equal(final(m), "success");
    assert.equal(botStatus().state, "failure");
    assert.equal(
      m.written.some(
        (status) =>
          status.context === "Dependency policy Dependabot" &&
          status.state === "success"
      ),
      false
    );
    assert.equal(
      m.written.some(
        (status) =>
          status.context === "Dependency policy AUTO" &&
          status.state === "success"
      ),
      false
    );
  } finally {
    activation.enabled = false;
  }
});
test("actual runner fails closed while activation is disabled", async () => {
  const m = mock();
  await run(m);
  assert.equal(final(m), "failure");
  assert.equal(
    m.written.find(
      (status) => status.context === "Dependency policy Dependabot"
    ).state,
    "failure"
  );
  assert.match(m.written.at(-1).description, /Activation blocked/);
});
test("actual HUMAN runner checks current pnupu approval, CI and mutable state", async () => {
  activation.enabled = true;
  try {
    const good = mock();
    await run(good);
    assert.equal(final(good), "success");
    assert.equal(
      good.written.find(
        (status) => status.context === "Dependency policy Dependabot"
      ).state,
      "success"
    );
    for (const options of [
      { held: true },
      { state: "DISMISSED" },
      { head: "new" },
      { ci: "failure" },
      { ci: "pending" },
      { missing: true },
      { changed: true },
    ]) {
      const m = mock(options);
      await run(m);
      assert.equal(final(m), "failure", JSON.stringify(options));
    }
  } finally {
    activation.enabled = false;
  }
});
test("API errors revoke cached success on the known candidate head", async () => {
  const cached = [
    {
      context: "Dependency policy",
      state: "success",
      creator: { login: "github-actions[bot]" },
    },
    {
      context: "Dependency policy Dependabot",
      state: "success",
      creator: { login: "github-actions[bot]" },
    },
  ];
  const m = mock({ cached });
  m.github.rest.pulls.get = async () => {
    throw Error("unavailable");
  };
  await run(m);
  assert.equal(final(m), "failure");
  assert.equal(
    cached.find((s) => s.context === "Dependency policy").state,
    "failure"
  );
  assert.equal(
    cached.find((s) => s.context === "Dependency policy Dependabot").state,
    "failure"
  );
});
test("actual AUTO runner decodes both real repository manifests/locks", async () => {
  activation.enabled = true;
  try {
    const m = mock({ fixture: repositoryFixture() });
    await run(m);
    assert.equal(final(m), "success");
    assert.equal(
      m.written.find((s) => s.context === "Dependency policy AUTO").state,
      "success"
    );
    assert.equal(
      m.written.find((s) => s.context === "Dependency policy Dependabot").state,
      "success"
    );
    const oversized = mock({ fixture: repositoryFixture(), encoding: "none" });
    await run(oversized);
    assert.equal(final(oversized), "failure");
  } finally {
    activation.enabled = false;
  }
});
test("unchanged reconciliation publishes no duplicate statuses", async () => {
  const m = mock();
  await run(m);
  const count = m.written.length;
  await run(m);
  assert.equal(m.written.length, count);
});
test("real historical AUTO payload traverses runner blob and metadata checks", async () => {
  activation.enabled = true;
  try {
    const fixture = require("./prettier-group.fixture.json");
    const m = mock({ fixture, head: fixture.head });
    await run(m);
    assert.equal(final(m), "success");
    assert.equal(
      m.written.find((s) => s.context === "Dependency policy AUTO").state,
      "success"
    );
  } finally {
    activation.enabled = false;
  }
});
test("foreign publisher cannot suppress authoritative AUTO failure", async () => {
  const cached = [
    {
      context: "Dependency policy AUTO",
      state: "success",
      description: "Immutable diff classification; never authorizes HUMAN",
      creator: { login: "foreign-app[bot]" },
    },
  ];
  const m = mock({ cached });
  await run(m);
  assert.equal(
    m.written.find((s) => s.context === "Dependency policy AUTO").state,
    "failure"
  );
});
test("failure on one PR does not stop reconciliation of later PRs", async () => {
  const m = mock();
  const first = m.context.payload.pull_request;
  const second = { ...first, number: 2 };
  m.context.payload = {};
  const paginate = m.github.paginate;
  m.github.paginate = async (fn, args) =>
    fn === m.github.rest.pulls.list ? [first, second] : paginate(fn, args);
  m.github.rest.pulls.get = async ({ pull_number }) => {
    if (pull_number === 1) throw Error("first unavailable");
    return { data: second };
  };
  await run(m);
  assert.ok(m.written.some((s) => s.description.startsWith("Fail closed")));
  assert.ok(
    m.written.some((s) => s.description.startsWith("Activation blocked"))
  );
});
test("failed policy publication revokes a newly written AUTO result", async () => {
  activation.enabled = true;
  try {
    const cached = [
      {
        context: "Dependency policy AUTO",
        state: "failure",
        description: "Fail closed: write failed",
        creator: { login: "github-actions[bot]" },
      },
    ];
    const m = mock({ fixture: repositoryFixture(), cached });
    const write = m.github.rest.repos.createCommitStatus;
    m.github.rest.repos.createCommitStatus = async (s) => {
      if (s.context === "Dependency policy" && s.state === "success")
        throw Error("write failed");
      return write(s);
    };
    await run(m);
    assert.equal(
      cached.find((s) => s.context === "Dependency policy AUTO").state,
      "failure"
    );
    assert.equal(
      cached.find((s) => s.context === "Dependency policy Dependabot").state,
      "failure"
    );
  } finally {
    activation.enabled = false;
  }
});

test("500 shared-head reconciliations preserve bot ownership and recover with current approval", async () => {
  activation.enabled = true;
  try {
    const m = mock({ head: "shared", reviewHead: "old" });
    const bot = m.context.payload.pull_request;
    const human = {
      ...structuredClone(bot),
      number: 2,
      user: { login: "fork-author" },
    };
    const paginate = m.github.paginate;
    let approved = false;
    let reverse = false;
    m.context.payload = {};
    m.github.rest.pulls.get = async ({ pull_number }) => ({
      data: pull_number === 1 ? bot : human,
    });
    m.github.paginate = async (fn, args) => {
      if (
        fn === m.github.rest.pulls.list ||
        fn === m.github.rest.repos.listPullRequestsAssociatedWithCommit
      )
        return reverse ? [human, bot] : [bot, human];
      if (fn === m.github.rest.pulls.listReviews)
        return [
          {
            user: { login: "pnupu", type: "User" },
            state: "APPROVED",
            commit_id: approved ? "shared" : "old",
          },
        ];
      return paginate(fn, args);
    };
    const failures = [];
    m.core.setFailed = (message) => failures.push(message);
    const write = m.github.rest.repos.createCommitStatus;
    m.github.rest.repos.createCommitStatus = async (status) => {
      if (m.written.filter((s) => s.context === status.context).length >= 1000)
        throw Error("1000 statuses per SHA/context cap");
      return write(status);
    };
    for (let scan = 0; scan < 500; scan += 1) {
      reverse = scan % 2 === 1;
      await run(m);
    }
    assert.equal(
      m.written.filter((s) => s.context === "Dependency policy").length,
      1
    );
    assert.equal(final(m), "failure");
    assert.equal(m.written.length, 3);
    m.context.payload = { pull_request: human };
    await run(m);
    assert.equal(
      m.written.length,
      3,
      "manual signals do not write any shared-head status"
    );
    approved = true;
    m.context.payload = {};
    await run(m);
    assert.equal(final(m), "success");
    assert.match(m.written.at(-1).description, /^HUMAN:/);
    assert.equal(
      m.written
        .filter((s) => s.context === "Dependency policy Dependabot")
        .at(-1).state,
      "success"
    );
    assert.equal(m.written.length, 5);
    await run(m);
    assert.equal(m.written.length, 5);
    assert.deepEqual(failures, []);
  } finally {
    activation.enabled = false;
  }
});
test("manual ownership uses fresh active bot association, not historical closed heads", async () => {
  for (const [state, head, base, defer] of [
    ["open", "head", "main", true],
    ["closed", "head", "main", false],
    ["open", "older", "main", false],
    ["open", "head", "release", false],
  ]) {
    const m = mock({ userLogin: "alice" });
    const manual = m.context.payload.pull_request;
    const bot = {
      ...structuredClone(manual),
      number: 2,
      user: { login: "dependabot[bot]" },
      state,
      head: { sha: head },
      base: { ref: base, sha: "base" },
    };
    const paginate = m.github.paginate;
    m.github.paginate = async (fn, args) =>
      fn === m.github.rest.repos.listPullRequestsAssociatedWithCommit
        ? [{ ...bot, state: state === "open" ? "closed" : "open" }]
        : paginate(fn, args);
    m.github.rest.pulls.get = async ({ pull_number }) => ({
      data: pull_number === 2 ? bot : manual,
    });
    await run(m);
    assert.equal(
      m.written.length,
      defer ? 0 : 1,
      JSON.stringify({ state, head, base })
    );
    assert.ok(
      m.written.every((status) => status.context === "Dependency policy")
    );
    if (!defer) assert.equal(final(m), "success");
  }
});
test("association API failure cannot grant manual status or change bot readiness", async () => {
  for (const failure of ["associations", "associated PR"]) {
    const m = mock({ userLogin: "alice", apiError: failure });
    if (failure === "associated PR") {
      const manual = m.context.payload.pull_request;
      const bot = {
        ...structuredClone(manual),
        number: 2,
        user: { login: "dependabot[bot]" },
      };
      const paginate = m.github.paginate;
      m.github.paginate = async (fn, args) =>
        fn === m.github.rest.repos.listPullRequestsAssociatedWithCommit
          ? [bot]
          : paginate(fn, args);
      m.github.rest.pulls.get = async ({ pull_number }) => {
        if (pull_number === 2) throw Error("associated PR unavailable");
        return { data: manual };
      };
    }
    const failures = [];
    m.core.setFailed = (message) => failures.push(message);
    await run(m);
    assert.deepEqual(m.written, []);
    assert.equal(failures.length, 1);
  }
});
test("manual error defers all writes when a fresh active bot owns the head", async () => {
  const m = mock({ userLogin: "alice", apiError: "statuses" });
  const manual = m.context.payload.pull_request;
  const bot = {
    ...structuredClone(manual),
    number: 2,
    user: { login: "dependabot[bot]" },
  };
  const paginate = m.github.paginate;
  m.github.paginate = async (fn, args) =>
    fn === m.github.rest.repos.listPullRequestsAssociatedWithCommit
      ? [bot]
      : paginate(fn, args);
  m.github.rest.pulls.get = async ({ pull_number }) => ({
    data: pull_number === 2 ? bot : manual,
  });
  await run(m);
  assert.deepEqual(m.written, []);
});

/* eslint-enable @typescript-eslint/no-require-imports */
