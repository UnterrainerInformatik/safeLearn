## 1. Scanner and rendering

- [x] 1.1 In `obsidian.js`, extract the range loop of `stripComments` into `commentRanges(markdown)`, and add `handoutVariables(markdown)` and `fillVariables(markdown, values)` (design D1). `stripComments` keeps its output byte for byte. Verify with unit tests in the existing comment test file: the existing comment cases stay green; `%%var PIN%%` and `%% var  PIN %%` are found; `%%var pin%%`, `%% var: PIN %%`, a mark in inline or fenced code, and a mark inside a line-start block comment are not found; names come in first-appearance order, each once; `fillVariables` puts in values, `‹NAME›` for a missing one, and cuts the other comments.
- [x] 1.2 Give `renderHandout` in `app.js` a `vars` option that uses `fillVariables` in place of `stripComments` (design D2). Verify with a unit or render test showing that a value `https://example.org` becomes a link, and that `<script>` in a value is sanitized away.

## 2. Storage and server

- [x] 2.1 Add `exam/migrations/021-handout-variables.sql` with the `test_variable` table (design D3). Verify with the migration test that a database at version 20 migrates to 21 and that deleting a test removes its rows.
- [x] 2.2 In `exam/handout.js` / `exam/tests.js`: add the union scan over the resolving handouts, `CLASS` and `DATE` (design D4, D5), `variablesFor(db, test, sitting)`, `variables` in `offlineFields`, and `setTestVariables(db, id, values)`. It refuses `CLASS`/`DATE`, invalid names, a line break, `%%`, `@@@` and more than 500 characters, and deletes on an empty value. Verify with unit tests in `test/exam-tests.test.js`: the union of A and B, DATE from the started day, the planned day and the first started sitting, kept values of vanished names, and every refusal leaving the stored values unchanged.
- [x] 2.3 In `startSitting`, refuse with `exam.errors.tests.handoutVariablesMissing` and the names while a variable has no value (design D6). Verify with a unit test covering a refused start, a start after filling in the value, and a start with only `CLASS`/`DATE`.
- [x] 2.4 Add `PUT /tests/:id/variables` to `exam/routes-tests.js` for the test's teachers. Pass `variablesFor` to `renderHandout` in the three routes of `exam/routes-handout.js` (the participant's sitting, the preview and the deck). Verify with a route test showing a student getting 403 on the PUT, and a preview showing a saved value.

## 3. Client and texts

- [x] 3.1 In `exam/client/tests.js`, add the "Variables" section on the test's page: a field per variable that saves on change, `CLASS`/`DATE` read-only, missing names in red. On the sitting's page, show the missing names next to the handout paths. Verify with the browser check in 4.1.
- [x] 3.2 Add the keys to `i18n/de.json` and `i18n/en.json` in BabelEdit format (section title, field hint, read-only note, the missing marker, `exam.errors.tests.handoutVariablesMissing`, and the value refusals). Verify with `test/i18n-catalog.test.js`.

## 4. Verification and docs

- [x] 4.1 Add a browser check in `test/exam.test.js`, with a handout fixture in `md/` containing `CLASS`, `DATE` and `FRANKLYN_PIN`. Starting is refused and the name is shown in red. The teacher fills in `FRANKLYN_PIN`, starts the sitting, and a present participant's handout shows the class, today's date and the PIN. The value is changed during the window, and the participant sees the new value after a reload. Verify by running this check alone and seeing it pass.
- [x] 4.2 Describe handout variables in `docs-exam-module.md`, and mention the exception in `docs-obsidian.md` ("comments are hidden, except variables in exam handouts"). Update the exam section and the render pipeline note in `AI/architecture.md`. Verify that the text matches the delta specs.
- [x] 4.3 Run the targeted tests first (comment tests, `test/exam-tests.test.js`, the new browser check, `test/i18n-catalog.test.js`), then the full `npm test` once. Verify that both are green, or record the failures that are unrelated to this change.
