Source: AI/open-proposals.md, entry **Offline-Test ausdrucken, mit ausgefüllten Variablen**.

## Why

Short written tests (quickies) are printed and written on paper, so their handout never reaches the students as a page. The files still carry variables, so that class and date need not live in the file name and title, for example `#### Quickie - %%var CLASS%% - %%var DATE%% - REST (Gruppe A)`. Today nothing prints them filled. The print view `?document` hides every variable as a comment and prints `Quickie -  -  - REST (Gruppe A)`. Printing the preview through the browser brings the whole page with its top bar and navigation. The usual flow is: the teacher configures the test, then prints each group about twenty times right there.

## What Changes

- On the **test's page**, each resolving handout (A, B) gets a **Print** button beside Preview, and, where the handout has a solution, a **Print solution** button beside Solution. Each opens a printable document in a new tab: no top bar, no navigation, no module chrome. The teacher prints it with the browser's print dialog and sets the number of copies there.
- The **sitting's page** offers the same buttons. There `DATE` is the date of that sitting, so a make-up on another day prints its own date. On the test's page, `DATE` follows the preview's rule: the first started sitting, else the first planned one.
- The printed handout shows the same content as the preview (public variant, without `#variant-private`, `#optional` and `@@@ teacher`). The printed solution shows the same content as the solution page. Variables are filled in both.
- **Printing is refused while a variable has no value**, and the refusal names it, the way a start is refused. Unlike on screen, `‹NAME›` cannot be corrected on paper. `DATE` counts as missing when the test has no sitting at all, so printing needs at least a planned sitting. While a value is missing, the buttons are disabled and the missing names are shown beside them, in red.
- Only teachers can print, at any time: before the start, during the window and afterwards. A teacher in student view cannot.
- One document per handout. A and B are not combined, and the document has no copies built in.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `exam-handout`: a new requirement "A teacher prints a handout and its solution" covering where the buttons are, what is printed, which `DATE` applies, the refusal on a missing value, and who may print. The requirement "A handout's variables are filled from its test" lists the printed documents among the views that fill variables, and the print view of the file's own corpus page stays among the views that hide them.

## Impact

- `obsidian.js` `wrapAsDocument`: takes a `title` option, so a page that has no corpus file behind it (`req.file`) can be wrapped.
- `exam/routes-handout.js`: four new teacher routes, one print each for the handout and its solution, from the test (`/tests/:id/handouts/:group/print`, `/tests/:id/handouts/:group/solution/print`) and from a sitting (`/sittings/:id/handouts/:group/print`, `/sittings/:id/handouts/:group/solution/print`).
- `exam/handout.js`: the variable scan per handout, and each handout entry (`handoutsOf`) carries its own variable names.
- `exam/tests.js`: a check that lists the variables of one handout without a value for a print, counting a `DATE` without a sitting as missing.
- `exam/client/live.js`: the buttons on the sitting's page.
- `exam/client/tests.js`: the buttons on the test's page, disabled with the missing names while a value is missing.
- `i18n/de.json`, `i18n/en.json`: button labels, the disabled-reason text and the refusal.
- `docs-exam-module.md`, `AI/architecture.md`.
- Tests: unit and route tests for the refusal and the gate, and a browser check that prints from the test's page.
