Archive this change after `exam-online-tests`: its spec adds a requirement to `online-test`, which only reaches the main specs when `exam-online-tests` is archived.

## 1. Page and element

- [ ] 1.1 `GET /exam/my` (`exam/routes-attempts.js`): wrap the results heading and placeholder in `<section class="sl-exam-my-results">`. Render it with `hidden` when the session's student has a running attempt, using the same query as `/api/my/tests` (design D2). Skip the query for a teacher
- [ ] 1.2 `WriteTest` (`exam/client/attempt.js`): dispatch `sl-exam-writing` on `window` with `detail.writing` per design D1. True in `writingPage()` for a real attempt only (D4). False in `resultPage()`, in `openTests()` and in `disconnectedCallback()`
- [ ] 1.3 `exam/client/exam-client.js`: a listener sets `hidden` on every `.sl-exam-my-results` from the event. On a change from writing to not writing it calls `reload()` on the `sl-results` element inside (D3)
- [ ] 1.4 `docs-exam-module.md`: one sentence on the student page, saying that the results are hidden while a test is written

## 2. Verification

- [ ] 2.1 Harness check in `test/exam.test.js`, next to "a student writes a test…": a student opens `/exam/my` and sees `.sl-exam-my-results` visible. After **Start** it is hidden. After a reload during the attempt it is hidden from the first paint, because the server rendered `hidden`. After submitting (two clicks) it is visible again and its list holds the test's result
- [ ] 2.2 Harness check: an attempt reaching its deadline with the page open (short sitting, or the deadline moved in the test database as the existing deadline check does) shows the result and the results section again without a reload
- [ ] 2.3 Harness check: on `md/test-exam-embedding.md`, which places both a `safelearn-test` and a `safelearn-results` block, the results element stays visible while the student writes
- [ ] 2.4 Run `npm test` in full and record the result here
