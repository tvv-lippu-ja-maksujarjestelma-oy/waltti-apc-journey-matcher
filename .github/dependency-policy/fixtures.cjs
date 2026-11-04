/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
// Exercise this repository's actual npm lockfile shape, including legacy entries when present.
// Change only prettier, with the exact grouped trailer grammar used by Dependabot.
function repositoryFixture(
  lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"))
) {
  const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const nextManifest = structuredClone(manifest),
    nextLock = structuredClone(lock);
  const old = lock.packages["node_modules/prettier"].version;
  const next = old.replace(/\d+$/, (n) => String(Number(n) + 1));
  nextManifest.devDependencies.prettier = `^${next}`;
  nextLock.packages[""].devDependencies.prettier = `^${next}`;
  for (const entry of [
    nextLock.packages["node_modules/prettier"],
    nextLock.dependencies?.prettier,
  ].filter(Boolean)) {
    entry.version = next;
    entry.resolved = `https://registry.npmjs.org/prettier/-/prettier-${next}.tgz`;
    entry.integrity = "sha512-fixture-only";
  }
  return {
    head: "head",
    files: ["package.json", "package-lock.json"].map((filename) => ({
      filename,
      status: "modified",
    })),
    before: [manifest, lock],
    after: [nextManifest, nextLock],
    commits: [
      {
        sha: "head",
        author: { login: "dependabot[bot]" },
        committer: { login: "web-flow" },
        commit: {
          verification: { verified: true },
          message: `build(deps-dev): Bump prettier in the prettier group\n\nUpdates \`prettier\` from ${old} to ${next}\n\n---\nupdated-dependencies:\n- dependency-name: prettier\n  dependency-version: ${next}\n  dependency-type: direct:development\n  update-type: version-update:semver-patch\n  dependency-group: prettier\n...\n`,
        },
      },
    ],
  };
}
module.exports = { repositoryFixture };
/* eslint-enable @typescript-eslint/no-require-imports */
