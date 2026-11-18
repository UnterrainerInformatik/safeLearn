## 1. Evidence on failure

- [ ] 1.1 Attach a console-error listener per session when the harness creates it (`test/harness.js`), keeping the errors since the start of the current test; verify with a unit check that a page logging `console.error` reports exactly that message for the current test and nothing from the previous one
- [ ] 1.2 Add the evidence hook (D2): on a failed test, write URL, full-page screenshot, `outerHTML` and console errors per open session to `test/.evidence/<file>/<test-slug>/`, empty the directory at the start of the run, and print one line naming the directory; add `test/.evidence/` to `.gitignore`; verify with a deliberately failing throwaway check (not committed) that the four files appear, and that a green run leaves the directory empty
- [ ] 1.3 Register the hook in every browser test file; verify `git status` stays clean after a run with a failure, and that no token or cookie value appears in the written files (`grep` for `access_token`, `refresh_token`, `Bearer`)

## 2. Diagnosis

- [ ] 2.1 Run `test/exam.test.js` three times with evidence on, and record every red check with its run number and its evidence in this task; verify that every red check of the three runs is listed
- [ ] 2.2 Classify each recorded check by cause (check acts too early, state leaks between checks, application race or regression, identity-provider load) from its evidence, and group checks that share a cause; verify every entry from 2.1 has a cause written next to it
- [ ] 2.3 Review link (D5): from the evidence and a manual try with the demo student, decide whether a reader can click the link on `/exam/my` once the sitting is over; record the decision and its reason here; verify it names the side (application or check) that is fixed in 4.1

## 3. Navigation that waits for visible

- [ ] 3.1 Add `openPage(session, path, readySelector)` to `test/harness.js` (D3): navigate, wait for `readySelector` to be visible and still, fail naming path, selector and final URL; verify with a unit check against a page whose element appears hidden and is shown after a delay (passes), and one that stays hidden (fails with the named message within the bound)
- [ ] 3.2 Migrate the `goto` + `waitForSelector` pairs and the local `open()` helpers of `test/exam.test.js` to `openPage`, describe by describe; verify each migrated describe passes on its own (after 5.2) and within the file
- [ ] 3.3 Add a convention check that fails any `page.goto(` in a browser test file outside `test/harness.js`, naming file and line, built like the existing check against direct clicks; verify it fails on a planted call and passes on the migrated tree

## 4. Fix the causes

- [ ] 4.1 Fix the review-link failure on the side 2.3 named, keeping every assertion of "the review opens once the sitting is over …"; if the application is fixed, check it against `exam-attempt-review`; verify the check passes three times in a row
- [ ] 4.2 Fix each cause group from 2.2 that 3.x has not already removed (attendance note, gradebook, tree drag, question editor, and any other found), each in the place where the cause lives, without retries or raised global timeouts; verify each affected check passes three times in a row on its own

## 5. Describes run on their own

- [ ] 5.1 Add an idempotent `examFixture(teacher)` to `test/exam.test.js` (D4) that finds or creates the current year, class `9xgb` with its GB course and the shared pool questions; verify that calling it twice yields the same records and creates nothing the second time
- [ ] 5.2 Switch every `before` hook that reads a record created by another describe to `examFixture`, and rewrite checks that count absolute totals so they count what they created; verify each of the 18 describes passes when run alone with its name as `--test-name-pattern`, and that "the review opens once the sitting is over …" runs (not cancelled) with its own name as the filter

## 6. Proof and wrap-up

- [ ] 6.1 Run `test/exam.test.js` three times in a row; verify all three runs are green with no repeated test, and record the pass and fail counts here (D6)
- [ ] 6.2 Run the full `npm test` once; verify it is green and record the counts here
- [ ] 6.3 Document the evidence directory and `openPage` in `docs-testing.md`; verify the text matches the delta spec of `browser-verification`
- [ ] 6.4 Remove the entry "Instabile Checks in der vollen Suite" from `AI/open-proposals.md` and update the "Wackelige Checks" memory with the causes found; verify the entry is gone and the memory names the date and the causes
