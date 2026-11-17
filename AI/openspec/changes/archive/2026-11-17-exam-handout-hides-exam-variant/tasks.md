## 1. Views under the handout override

- [x] 1.1 `utils.js` `hasRoles`: under `req[handoutViews]`, grant `#exam` iff `handout.exam === true`, `#practice` iff `handout.exam !== true`, `#answer` iff `handout.answer === true` (design D1); update the comment above it
- [x] 1.2 `permission-context.js`: document the override's shape as `{ exam, answer }`, a missing field reading as hidden
- [x] 1.3 `exam/handout.js` and `exam/routes-handout.js`: set `{ exam: false, answer: false }` for the participant's handout and the teacher's preview, `{ exam: true, answer: true }` for the solution deck; `handoutAttachmentCheck` sets `{ exam: teacher, answer: teacher }` (design D4)

## 2. Solution button

- [x] 2.1 `exam/handout.js`: replace `hasAnswers` by `hasSolution`, true for a `@@@` directive line naming `#exam` or `#answer`; rename the handout field to `hasSolution` (design D3)
- [x] 2.2 `exam/client/tests.js`: offer the solution button on `handout.hasSolution`

## 3. Tests

- [x] 3.1 `test/exam-offline.test.js`: the participant's render shows `PRACTICE-VARIANT`, hides `EXAM-VARIANT`, `ANSWER-TEXT`, `TEACHER-HINT`, also with the student's stored `ve` and `va` on; the preview matches it; the solution deck shows `EXAM-VARIANT` and `ANSWER-TEXT` and hides `PRACTICE-VARIANT` and `TEACHER-HINT`
- [x] 3.2 `test/exam-offline.test.js`: a participant is no longer served `POS/exam-only.png`; a teacher's check still is; the override without an `exam` field hides the exam variant
- [x] 3.3 `test/exam-offline.test.js`: `hasSolution` is true for a file with only `#exam` blocks, only `#answer` blocks, and false for neither
- [x] 3.4 Check `md/test-exam-handout*.md` and `test/checks/permissions.js` for content that relied on the exam variant in the handout, and adjust
- [x] 3.5 Run the affected unit tests and the browser permission checks, then the full `npm test` once at the end

## 4. Docs

- [x] 4.1 `docs-exam-module.md` (what a student sees, the solution deck) and `docs-permissions.md` (the handout's fixed views): practice shown, exam and answers hidden for participants; the deck shows exam and answers
- [x] 4.2 `AI/architecture.md`: the override's shape and the dropped `#exam` exception
- [x] 4.3 Check the Obsidian plugin docs and README for the old handout wording and correct it
