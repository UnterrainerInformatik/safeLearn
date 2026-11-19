Source: AI/open-proposals.md, entry **Offline-Test-Angabe: Variablen `%%var NAME%%` ausfüllen**.

## Why

Teachers now write offline test handouts once and mark the parts that change per test with placeholders in Obsidian comment syntax: `#### Test - %%var CLASS%% - %%var DATE%% - Quarkus REST Basics`, `PIN: %%var FRANKLYN_PIN%%`, `Abgabe auf Github Classroom: %%var SUBMISSION_LINK%%`. Since `obsidian-comments`, every `%%…%%` disappears from every view. A participant therefore reads "Test -  -  - Quarkus REST Basics" and gets no PIN and no submission link. The old workaround was one copy of the file per class and date (`Test 1 - 4AHIF - 2026-11-16 - … (Variante A).md`). That is exactly what the placeholders are meant to end.

## What Changes

- An inline comment whose whole content is `var NAME` is a **handout variable**. `NAME` is an upper-case letter followed by upper-case letters, digits or `_`. Any other comment stays a comment.
- An offline test holds **one list of values**, shared by handouts A and B. The test's page scans both handout files every time it is shown. It offers a field for every variable it finds, in the order of first appearance, A before B. The teacher types the values there, and can change them at any time, during the window too.
- The module fills two variables itself, and they cannot be overridden. `CLASS` is the class of the test's course, for example `4BHIF`. `DATE` is the date of the participant's sitting: the day it was started, or the planned day before the start, written `14.11.2026`. The test's page shows both values read-only.
- The participant's handout, the teacher's preview and the solution deck show every variable replaced by its value. The value goes through the normal rendering, so inline Markdown and a bare URL work. A variable without a value is shown as `‹NAME›`.
- **Starting a sitting is refused** while a variable of a handout has no value. The test's page and the sitting's page show the missing names in red, the way an unresolved handout is shown.
- A variable that is added to the file later appears as an empty field the next time the page is shown, and it blocks the next start. A stored value whose variable has gone from both files is kept, but it is not shown.
- Ordinary pages, search, the attachment check and the Obsidian plugin are unchanged. There, a variable stays a comment and stays hidden.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `exam-handout`: a new requirement "A handout's variables are filled from its test". It covers the syntax, the shared list, `CLASS` and `DATE`, where values are filled in, how a missing value is shown, and that ordinary pages keep hiding variables. The requirement "A handout that no longer resolves blocks the start" gains the same block for a variable that has no value.
- `offline-test`: the requirement "An offline sitting opens only when the teacher starts it" refuses the start while a handout variable has no value.

## Impact

- `obsidian.js`: the comment scanner gains a way to list the variables of a text, and a way to replace them instead of cutting them out. Code masking and the line rules stay as they are.
- `app.js` `renderHandout`: takes a `vars` map and replaces variables before the comments are stripped.
- `exam/migrations/021-handout-variables.sql`: a new table `test_variable (test_id, name, value)`.
- `exam/handout.js` / `exam/tests.js`: scanning the variables of a test's handouts, reading and writing the values, computing `CLASS`/`DATE`, and the refusal in `startSitting`.
- `exam/routes-handout.js`: the three handout routes pass the values. `exam/routes-tests.js`: the test's variables in its payload, and a route to save them.
- `exam/client/tests.js`: the variables section on the test's page, with missing values in red on the test's and the sitting's page.
- `i18n/de.json`, `i18n/en.json`: labels and the refusal.
- Tests: unit tests for the scanner and the start refusal, and a browser check covering filling in values and a participant seeing them.
