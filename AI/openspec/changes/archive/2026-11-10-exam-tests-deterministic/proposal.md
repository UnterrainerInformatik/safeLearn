## Why

Three checks of the exam suites fail on every run on a fresh checkout. None of them is timing noise of the browser. They came to light during `hot-reload-without-paths` (2026-11-10), whose full run could not go green because of them, and they fail on HEAD as well.

- `test/exam.test.js:4275` asserts that the handout's starter archive `md/assets/handout/test-handout-starter.zip` is served. The file was never committed: `.gitignore` excludes `*.zip`, so commit `7665445` carried only the two images beside it. The check passes only on the machine that still has the file lying around.
- `test/exam-offline.test.js:333` and `:427` start an offline sitting and end it right away. `startSitting` sets `opens_at` to now and `endSitting` sets `closes_at` to now. When both land in the same millisecond, the row breaks `CHECK (opens_at < closes_at)` and SQLite raises. Each test takes about 25 ms, so on a fast machine this happens every time.

The second case also shows a gap in the product: an end at the very moment of the start reaches the database and comes back as a raw constraint error instead of a refusal the teacher can read.

## What Changes

- The starter archive is committed, through a `.gitignore` exception for exactly that file. Its content stays a small placeholder; no check reads it.
- `endSitting` refuses an end that is not after the window's opening with a `ConflictError` (new key `exam.errors.tests.sittingEndBeforeOpen`, German and English) and changes nothing. The database constraint is no longer the thing that says no.
- The two offline tests start their sitting at an explicit moment a few seconds in the past, so start and end can no longer coincide. A new test asserts the refusal for an end at the opening's millisecond.

## Capabilities

### New Capabilities

### Modified Capabilities
- `offline-test`: ending a started sitting at the moment it opened is refused, with a message, and leaves the sitting as it was.
- `content-verification`: a file a check reads from `md/`, assets included, is part of the repository, so a fresh checkout verifies the same corpus.

## Impact

- `exam/tests.js`: `endSitting`.
- `i18n/de.json`, `i18n/en.json`: one new error key.
- `test/exam-offline.test.js`: two tests get an explicit start, one new test.
- `.gitignore`, `md/assets/handout/test-handout-starter.zip`.
- No new dependency. secureLectures gets the change through the usual merge; its `md/` does not contain the fixture.
