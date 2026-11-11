Source: AI/open-proposals.md, entry **Testlauf schneller: gezielt laufen lassen und Suite aufteilen**. Tests are not to be removed: they cover real requirements and found three real regressions on 2026-11-11. The goal is that a change no longer pays for the whole suite every time. Parallelisation (`--test-concurrency` > 1) is out of scope.

## Why

A full `npm test` now takes 13–15 minutes (2026-11-11: 1,047 tests, 799 s and 869 s; on 2026-10-24 it was 732 tests in 369 s). Most of the growth came from browser tests that log in for real against the shared Keycloak demo realm. Pure unit tests cost milliseconds, but today there is no way to run them alone, and no way to run only the checks that guard the files a change touched. Every change therefore pays for the whole suite, often several times while the work is in progress.

`test/coverage-map.json` already records which check guards which file, and the edit hook already names those checks. Nothing turns that record into a run yet.

## What Changes

- **`npm run test:unit`** runs every test file that needs no browser and no server: every `test/*.test.js` that does not use the server harness `test/harness.js`. It finishes in seconds and needs no network, apart from the plugin checkout the directive-grammar check already needs.
- **`npm run test:browser`** runs the remaining test files, which do use the server harness (today `smoke`, `content`, `exam`, `anonymous`).
- The split is derived from the files themselves (whether they import `./harness.js`), not from a hand-kept list, so a new test file lands in the correct group automatically. Together the two groups are exactly what `npm test` runs. A check asserts that.
- **`npm run test:changed`** reads the changed files and starts only the checks that `test/coverage-map.json` names for them. "Changed" means the working tree against `HEAD`, including untracked files. If the tree is clean, it means the last commit. Paths can also be given explicitly. A dry-run mode prints the plan without running anything. Changed files that no check guards are named, not silently dropped.
- **The content suite can run a selection of its modules.** `test/content.test.js` keeps importing every module in the full run. With a selection (an environment variable naming modules), it imports only those, in the same order, and `deployment-surface.js` stays last. The login assertion keeps its meaning for a selection: one login per role the selected modules actually used, plus the own sessions of the selected modules, and never more than one per role.
- `npm test` stays the full run, unchanged.
- **The edit hook** `AI/claude/hooks/name-covering-checks.mjs` offers `npm run test:changed` as the next step instead of `npm test`. It still starts nothing.
- **Documentation:** `docs-testing.md` describes the three commands and the convention: during the work, run unit tests and the targeted checks, and run the full suite once at the end or before the push.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `browser-verification`: "Verification is a single documented command" gains the unit/browser split and the targeted run next to the full run. "A run does not multiply authentications" is restated so that it holds for a run of selected content modules too.
- `content-verification`: "A change to guarded code names the checks that cover it" is extended: the record also drives a run of exactly those checks, and the command offered after an edit is that targeted run.

## Impact

- `package.json`: new scripts `test:unit`, `test:browser`, `test:changed`. `test` is unchanged.
- New `tools/test-run.mjs`: classification of test files, change detection via `git`, mapping through `test/coverage-map.json`, and the `node --test` invocation. It lives in `tools/` so that `test/coverage.test.js` does not count it as a check.
- `test/content.test.js`: module selection via the environment, and the login assertion for a selection.
- `test/harness.js`: reports which roles the shared sessions were actually opened for, so the assertion can count them.
- New `test/test-run.test.js` (unit, no browser): asserts that unit and browser together are exactly the files `npm test` runs, and checks the planning rules against fixed inputs.
- `test/coverage-map.json`: an entry for the new test, guarding `tools/test-run.mjs`.
- `AI/claude/hooks/name-covering-checks.mjs`, `docs-testing.md`.
- No change to the application itself, its deployment, or what any check asserts.
