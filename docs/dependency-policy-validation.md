# Dependency policy validation

Task: c3b2f03f-c0c2-4fee-8ade-1ce6a6705a9c. Scope: waltti-apc-journey-matcher.
Source policy: http-pulsar-poller commit f1422645c6fa930e615613227c4bb2e25b696423.
Base: `16a245847c2609bdeb40a491a70c4bf8f5b355b6`, branch `codex/policy-a-c3b2f03f`.

## Checks

- `node --test .github/dependency-policy/*.cases.cjs`: 63 passing tests, including fresh manual PR status, stale/unsupported target and API error cases.
- Real repository manifest and lockfile shape exercised by the fixture builder.
- Tests verify the active single Mergify configuration path, identical queue
  entry/merge conditions, publisher-qualified policy statuses, CI policy-test
  wiring, trusted-base evaluation, disabled activation and PR checkout credentials.
- Focused Prettier 3.9.10, repository-locked ESLint and official Mergify
  Draft 2020-12 schema validation pass. Queue, merge and PR-rule conditions match.
- Live GitHub settings, Mergify service semantics, queues and merge-time vetoes
  remain unverified. Activation remains disabled.

No repository settings, production services, or other applications were changed.

## Manual PR status availability correction

- The trusted evaluator runs while dependency AUTO activation is disabled.
- Fresh GitHub reads confirm the non-Dependabot author, open state, current
  default branch, head SHA and base SHA before publishing general policy success.
- Regression tests cover manual success without AUTO status, stale heads,
  unsupported targets/states, and repository, pull and status API errors.
- Manual policy success states that the manual merge process applies; it does
  not approve or merge the PR.

- Bot API/publication error paths revoke AUTO, Dependabot readiness and general bot status.

## Final focused static validation

Actionlint 1.7.12 passes for all changed workflows.

Changed policy scripts pass Node syntax and repository-locked ESLint. Changed
JS, YAML, Markdown and JSON pass Prettier 3.9.10 after formatting-only fixes.
Focused policy suites pass 63 tests, including S1 manual reporting and S2 shared
SHA isolation. No app build or production service was needed for this pass.

## Round 4 availability and contract corrections

The actual runner reproduced 1,000 general-context writes across 500 unchanged
shared-head bot/manual scans before the fix. With active bot ownership, the same
500 scans make one general-context write; valid current-head pnupu approval then
recovers readiness without exhausting the status cap. Tests also cover closed
bot associations, wrong heads/targets, lookup errors, and manual error deferral.
All workflow filenames are scanned for the old broad approval path; the six
retained legacy approval workflows are removed. Adoption uses only the trusted
activation file after host prerequisites and live-veto checks.
