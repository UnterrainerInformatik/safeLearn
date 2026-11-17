## 1. Texts

- [x] 1.1 `i18n/de.json`: set `exam.bar.tests` and `exam.pages.tests` to "Tests", `exam.attempt.onlineTests` to "Tests", `exam.tests.noTestYet` to "Noch kein Test.", `exam.my.openTests` to "Offene Tests", `exam.attempt.noneOpen` to "Gerade ist für dich kein Test offen.", `app.topbar.examsTitle` to "Meine Tests und Ergebnisse", and "Online-Tests {tests}" in `exam.errors.classes.courseInUse` to "Tests {tests}"; keep `exam.categories.onlineTests`, `exam.attempt.teacherHint` and `exam.retention.attempts_*`; verify with `git diff i18n/de.json` that only those values changed
- [x] 1.2 `i18n/en.json`: the same keys ("Tests", "No test yet.", "Open tests", "No test is open for you right now.", "My tests and results", "tests {tests}"); verify that `test/i18n-catalog.test.js` passes, so both files keep the same keys

## 2. Tests and docs

- [x] 2.1 Search `test/` for literal "Online-Tests" / "Online tests" / "Offene Online-Tests" and adjust every assertion that meant the renamed texts; verify that `test/exam.test.js` and the affected browser checks pass
- [x] 2.2 `docs-exam-module.md` (the bar's buttons, the test list, the student's page) and `AI/architecture.md`: the button is **Tests**; verify with a search that no remaining "Online tests" names the button or the list
- [x] 2.3 Run the full `npm test` once at the end
