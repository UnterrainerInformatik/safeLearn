## 1. Checks first

- [x] 1.1 In `test/coverage.test.js`, add a test that runs `git ls-files --others --ignored --exclude-standard -- md/` from the repository root and asserts empty output, naming each file it finds; skip with a message when git or the repository is not available. Verify: with a `md/assets/handout/test-handout-starter.zip` present and the current `.gitignore`, the test fails naming it.
- [x] 1.2 In `test/exam-offline.test.js`, add a test in "an offline sitting": start a sitting, call `endSitting(db, id, started.opensAt)`, assert the key `exam.errors.tests.sittingEndBeforeOpen`, and that `getSitting` still reports `open` with the unchanged `closesAt`. Verify: it fails on the current code with the SQLite constraint error.

## 2. Fixture

- [x] 2.1 Create `md/assets/handout/test-handout-starter.zip` as a minimal valid ZIP with one short text file, and add `!md/assets/handout/test-handout-starter.zip` right after `*.zip` in `.gitignore`. Verify: `git check-ignore` no longer reports it, `git status` lists it, and check 1.1 passes.

## 3. Server

- [x] 3.1 In `endSitting` (`exam/tests.js`), after `requireOpen`, refuse `at <= row.opens_at` with `ConflictError("exam.errors.tests.sittingEndBeforeOpen")` before any write. Add the key to `i18n/de.json` and `i18n/en.json` beside `sittingNotOpen`. Verify: check 1.2 passes.

## 4. The two offline tests

- [x] 4.1 In `test/exam-offline.test.js:333` and `:427`, start the sitting at an explicit moment a few seconds in the past. Verify: both pass ten runs in a row (`node --test test/exam-offline.test.js`).

## 5. Docs and full run

- [x] 5.1 Describe the new checks in `docs-testing.md` (coverage test and offline row) and update `test/coverage-map.json` where it lists what `test/exam-offline.test.js` and `test/coverage.test.js` cover. Verify: `node --test test/coverage.test.js` is green.
- [x] 5.2 Run `npm test`. Verify: green, apart from the known flaky checks (AI/memory/flaky-content-checks.md), which are re-run. Then resume `hot-reload-without-paths` at 4.2.
