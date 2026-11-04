/* CommonJS is required by the trusted github-script loader. */
/* eslint-disable @typescript-eslint/no-require-imports */
const { isDeepStrictEqual: equal } = require("node:util");

const APPROVER = "pnupu";
const CONTEXT = "Dependency policy";
const HOLDS = ["help wanted", "help-wanted", "hold"];
// Audited ordinary libraries only. Unlisted packages, including transitives,
// are HUMAN. Review additions to these catalogs as policy changes.
const ORDINARY = new Set(["pino"]);
const DEVELOPMENT = new Set(["prettier", "eslint-config-prettier"]);

function bump(before, after) {
  const parse = (v) =>
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(v)?.slice(1).map(Number);
  const a = parse(before),
    b = parse(after);
  if (!a || !b) return "unknown";
  if (
    b[0] < a[0] ||
    (b[0] === a[0] && (b[1] < a[1] || (b[1] === a[1] && b[2] <= a[2])))
  )
    return "unknown";
  if (b[0] !== a[0]) return "major";
  if (b[1] !== a[1]) return a[0] === 0 ? "breaking" : "minor";
  return "patch";
}

// Only parse the small signed Dependabot trailer grammar we understand.
// No PR title, body, label, branch name, or unsigned input authorizes AUTO.
function metadata(message) {
  const trailer = message.match(
    /^---\nupdated-dependencies:\n([\s\S]*?)\n\.\.\.$/m
  );
  if (!trailer) return [];
  const entries = [];
  for (const line of trailer[1].split("\n")) {
    const m = line.match(
      /^(- | {2})(dependency-name|dependency-version|dependency-type|update-type|dependency-group): ([\w@./:+-]+|"[\w@./:+-]+")$/
    );
    if (!m) return [];
    if (m[1] === "- ") {
      if (m[2] !== "dependency-name") return [];
      entries.push({});
    }
    const entry = entries.at(-1);
    if (!entry || Object.hasOwn(entry, m[2])) return [];
    entry[m[2]] = m[3].replace(/^"|"$/g, "");
  }
  return entries;
}

function classify({ files, before, after, commits, head }) {
  const human = (reason) => ({ lane: "HUMAN", reason });
  if (
    !files.length ||
    files.some(
      (f) =>
        !["package.json", "package-lock.json"].includes(f.filename) ||
        f.status !== "modified"
    )
  )
    return human(
      "Uncovered file or ecosystem (Actions, runtime and base images require pnupu)"
    );
  if (
    commits.length !== 1 ||
    commits[0].sha !== head ||
    commits[0].author?.login !== "dependabot[bot]" ||
    commits[0].committer?.login !== "web-flow" ||
    !commits[0].commit?.verification?.verified
  )
    return human("Missing authenticated, current Dependabot metadata");
  const meta = metadata(commits[0].commit.message);
  if (!meta.length || !before || !after)
    return human("Missing metadata or manifests");
  const [oldManifest, oldLock] = before,
    [newManifest, newLock] = after;
  if (
    ![2, 3].includes(oldLock.lockfileVersion) ||
    newLock.lockfileVersion !== oldLock.lockfileVersion ||
    !oldLock.packages ||
    !newLock.packages
  )
    return human("Unsupported lock format");
  const strip = (object, keys) =>
    Object.fromEntries(
      Object.entries(object).filter(([key]) => !keys.includes(key))
    );
  if (
    !equal(
      strip(oldManifest, ["dependencies", "devDependencies"]),
      strip(newManifest, ["dependencies", "devDependencies"])
    )
  )
    return human("Non-version manifest changes");
  const lockKeys =
    oldLock.lockfileVersion === 2 ? ["packages", "dependencies"] : ["packages"];
  if (!equal(strip(oldLock, lockKeys), strip(newLock, lockKeys)))
    return human("Uncovered lockfile metadata");
  for (const [manifest, lock] of [
    [oldManifest, oldLock],
    [newManifest, newLock],
  ]) {
    if (
      !lock.packages[""] ||
      !equal(lock.packages[""].dependencies, manifest.dependencies) ||
      !equal(lock.packages[""].devDependencies, manifest.devDependencies)
    )
      return human("Manifest/lock root mismatch");
  }
  if (
    !equal(
      strip(oldLock.packages[""], ["dependencies", "devDependencies"]),
      strip(newLock.packages[""], ["dependencies", "devDependencies"])
    )
  )
    return human("Uncovered root lock delta");
  const changed = new Map();
  for (const section of ["dependencies", "devDependencies"]) {
    const a = oldManifest[section] || {},
      b = newManifest[section] || {};
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[name] === b[name]) continue;
      if (!a[name] || !b[name] || changed.has(name))
        return human("Added, removed or ambiguous dependency");
      changed.set(name, { section, oldRange: a[name], newRange: b[name] });
    }
  }
  if (
    !changed.size ||
    meta.length !== changed.size ||
    new Set(meta.map((m) => m["dependency-name"])).size !== meta.length
  )
    return human("Missing, extra or duplicate dependency metadata");
  const changedPaths = new Set();
  for (const path of new Set([
    ...Object.keys(oldLock.packages),
    ...Object.keys(newLock.packages),
  ])) {
    if (path === "" || equal(oldLock.packages[path], newLock.packages[path]))
      continue;
    const name = path.replace(/^node_modules\//, ""),
      entry = changed.get(name);
    const a = oldLock.packages[path],
      b = newLock.packages[path];
    if (!entry || path !== `node_modules/${name}` || !a || !b)
      return human(`Uncovered transitive/addition/removal: ${path}`);
    if (
      !equal(
        strip(a, ["version", "resolved", "integrity"]),
        strip(b, ["version", "resolved", "integrity"])
      )
    )
      return human(`Non-version lock delta: ${name}`);
    if (
      a.hasInstallScript ||
      b.hasInstallScript ||
      a.link ||
      b.link ||
      a.optional ||
      b.optional
    )
      return human(`Native/install/optional dependency: ${name}`);
    if (
      typeof a.integrity !== "string" ||
      typeof b.integrity !== "string" ||
      !a.integrity.startsWith("sha512-") ||
      !b.integrity.startsWith("sha512-")
    )
      return human("Missing integrity");
    const tarball = (v) =>
      `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${v}.tgz`;
    if (a.resolved !== tarball(a.version) || b.resolved !== tarball(b.version))
      return human("Non-registry source");
    const type = bump(a.version, b.version);
    const m = meta.find((item) => item["dependency-name"] === name);
    const dev = entry.section === "devDependencies";
    if (
      !m ||
      m["dependency-version"] !== b.version ||
      m["dependency-type"] !== `direct:${dev ? "development" : "production"}` ||
      m["update-type"] !== `version-update:semver-${type}`
    )
      return human("Inconsistent metadata");
    const range = (v) =>
      /^(?:\^|~)?\d+\.\d+\.\d+$/.test(v) ? v.replace(/^[~^]/, "") : null;
    if (
      range(entry.oldRange) !== a.version ||
      range(entry.newRange) !== b.version ||
      entry.oldRange.replace(a.version, "") !==
        entry.newRange.replace(b.version, "")
    )
      return human("Unsupported or inconsistent ranges");
    if (
      !["patch", "minor"].includes(type) ||
      !(dev ? DEVELOPMENT : ORDINARY).has(name) ||
      Boolean(b.dev) !== dev
    )
      return human(`Sensitive, unknown or breaking dependency: ${name}`);
    changedPaths.add(name);
  }
  // npm v2 duplicates the complete tree in dependencies. Account for every
  // legacy delta independently; nested/transitive edits cannot hide there.
  if (oldLock.lockfileVersion === 2) {
    const a = oldLock.dependencies,
      b = newLock.dependencies;
    if (!a || !b) return human("Missing legacy dependency tree");
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (equal(a[name], b[name])) continue;
      if (
        !changedPaths.has(name) ||
        !a[name] ||
        !b[name] ||
        !equal(
          strip(a[name], ["version", "resolved", "integrity"]),
          strip(b[name], ["version", "resolved", "integrity"])
        )
      )
        return human(`Uncovered legacy dependency delta: ${name}`);
    }
    for (const name of changedPaths) {
      for (const [legacy, lock] of [
        [a, oldLock],
        [b, newLock],
      ]) {
        if (
          !legacy[name] ||
          ["version", "resolved", "integrity"].some(
            (key) =>
              legacy[name][key] !== lock.packages[`node_modules/${name}`][key]
          )
        )
          return human(`Legacy/package lock mismatch: ${name}`);
      }
    }
  }
  if (changedPaths.size !== changed.size)
    return human("Manifest changes without matching locked changes");
  return {
    lane: "AUTO",
    reason:
      "All changed dependencies and lock deltas meet the audited patch/minor policy",
  };
}

function currentApproval(reviews, head) {
  const states = new Map();
  for (const review of reviews) {
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state))
      states.set(review.user.login, review);
  }
  if ([...states.values()].some((r) => r.state === "CHANGES_REQUESTED"))
    return false;
  const approval = states.get(APPROVER);
  return (
    approval?.user.type === "User" &&
    approval.state === "APPROVED" &&
    approval.commit_id === head
  );
}

function eligible({ pr, classification, reviews, checks, activated }) {
  if (
    !activated ||
    pr.state !== "open" ||
    pr.draft ||
    pr.mergeable !== true ||
    pr.base.ref !== "main" ||
    pr.user.login !== "dependabot[bot]" ||
    pr.labels.some((l) => HOLDS.includes(l.name.toLowerCase()))
  )
    return false;
  if (!checks.every((c) => c === "success") || checks.length < 2) return false;
  const latest = new Map();
  for (const r of reviews)
    if (["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state))
      latest.set(r.user.login, r.state);
  if ([...latest.values()].includes("CHANGES_REQUESTED")) return false;
  return (
    classification.lane === "AUTO" || currentApproval(reviews, pr.head.sha)
  );
}
module.exports = {
  classify,
  metadata,
  bump,
  currentApproval,
  eligible,
  CONTEXT,
  HOLDS,
};

/* eslint-enable @typescript-eslint/no-require-imports */
