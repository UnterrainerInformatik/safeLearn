## ADDED Requirements

### Requirement: A teacher prints a handout and its solution

For each resolving handout, the test's page and every sitting's page of the test SHALL offer the teacher a print button. Where the handout has a solution button (a `#variant-private` or `#optional` block), they SHALL also offer a button to print the solution. Each button SHALL open, in a new tab, a printable document of that one handout: only the handout's content, with no top bar, no navigation, no menu and no element of the module around it. The handout's print SHALL show the same content as the teacher's preview of that handout. The solution's print SHALL show the same content as its solution page. Both SHALL have their variables filled. A print SHALL hold exactly one copy of one handout. The number of copies SHALL be left to the browser's print dialog.

`DATE` SHALL be filled as the variables requirement states for a print from the test's page or from a sitting's page. A print SHALL be refused while one of the handout's variables has no value, and the refusal SHALL name every such variable. `DATE` SHALL count as having no value when the test has no sitting. While a print would be refused, its button SHALL be disabled, and the names without a value SHALL be shown beside it in red.

Printing SHALL be possible at any time: before the start, while a sitting is open, and after it. A print and every request it makes SHALL be refused to any session that does not act as a teacher, a teacher in student view included. A refusal SHALL NOT reveal the file's path or content.

#### Scenario: Printing twenty copies per group

- **WHEN** a teacher has set handouts A and B and every variable's value on a test with a planned sitting, and presses the print button of handout A
- **THEN** a new tab shows handout A as a printable document without top bar and navigation, its variables filled, and the teacher prints twenty copies through the browser's print dialog

#### Scenario: Class and date on paper

- **WHEN** a test of the course 4AHIF has a handout headed `#### Quickie - %%var CLASS%% - %%var DATE%% - REST (Gruppe A)` and one sitting planned for 2026-11-25, and the teacher prints it from the test's page
- **THEN** the printed heading reads `Quickie - 4AHIF - 25.11.2026 - REST (Gruppe A)`

#### Scenario: A make-up prints its own date

- **WHEN** the first sitting was started on 2026-11-14, a make-up sitting of the same test is planned for 2026-11-21, and the teacher prints handout A from the make-up's page
- **THEN** the print shows `21.11.2026`, while a print from the test's page shows `14.11.2026`

#### Scenario: What the print leaves out

- **WHEN** the handout contains a `@@@ #variant-private` block, a `@@@ #variant-public` block, a `@@@ #optional` block and a `@@@ teacher` block, and the teacher prints it with their private-variant and optional views on
- **THEN** the print shows the public variant, and neither the private variant, the optional block nor the teacher block

#### Scenario: Printing the solution

- **WHEN** the handout holds each task's solution in a `@@@ #variant-private` block and the teacher presses the solution's print button
- **THEN** the print shows the assignment with the solutions, and without the public variant and the `@@@ teacher` blocks

#### Scenario: A variable without a value

- **WHEN** handout A contains `%%var FRANKLYN_PIN%%` and the test holds no value for it
- **THEN** both print buttons of handout A are disabled with `FRANKLYN_PIN` shown beside them in red, and requesting the print's address directly is refused with a message naming `FRANKLYN_PIN`

#### Scenario: No sitting yet

- **WHEN** a handout contains `%%var DATE%%` and the test has no sitting
- **THEN** its print is refused, naming `DATE`, until a sitting is planned

#### Scenario: Printing before the start

- **WHEN** a sitting is planned for next week and has not started, and the teacher prints the handout
- **THEN** the print is shown

#### Scenario: A student requests the print

- **WHEN** a student, or a teacher in student view, requests the print address of a handout or of its solution
- **THEN** the request is refused, and the answer shows nothing of the file

#### Scenario: A handout without a solution

- **WHEN** a handout contains neither a `#variant-private` nor an `#optional` block
- **THEN** the test's page and the sitting's page offer a print button for it and no button to print a solution

## MODIFIED Requirements

### Requirement: A handout's variables are filled from its test

An inline Obsidian comment whose whole content is `var` followed by a name, written `%%var NAME%%`, SHALL be a variable of the handout. The name SHALL be an upper-case letter followed by upper-case letters, digits or `_`. Whitespace around the content SHALL be allowed. Any other comment SHALL stay a comment. A mark inside fenced or inline code SHALL be no variable, as it is no comment (`obsidian-comments`).

An offline test SHALL hold one value per variable name, shared by its handouts A and B. The test's page SHALL show one field for every variable found in the current content of its resolving handouts, scanned again each time the page is shown, in the order the variables first appear, A before B, and each name once. A teacher SHALL be able to set and change these values at any time, also while a sitting is open. A value SHALL be a single line of at most 500 characters and SHALL NOT contain `%%` or `@@@`. An empty value SHALL count as no value. A value whose variable no longer appears in either handout SHALL be kept, and SHALL NOT be shown.

Two names SHALL be filled by the module, and the teacher SHALL NOT be able to set them. The test's page SHALL show them read-only. `CLASS` SHALL be the class of the test's course. `DATE` SHALL be the date of the sitting, written as day, month and four-digit year separated by dots: the day it was started, or the day it is planned for while it has not started. In the participant's handout, `DATE` SHALL be that of the participant's sitting. In the teacher's preview, the solution page and a print from the test's page, it SHALL be that of the test's first started sitting, or of its first planned sitting while none has started. In a print from a sitting's page, it SHALL be that of that sitting. Without any sitting it SHALL have no value.

The participant's handout, the teacher's preview, the solution page and their printed documents SHALL show every variable replaced by its value. The value SHALL be rendered as part of the handout's Markdown, sanitized like the rest of it. A variable without a value SHALL be shown as its name between `‹` and `›`. Every other view of the file SHALL keep hiding a variable as a comment: its page, its own print view, search, the attachment check and the Obsidian plugin.

#### Scenario: Filling in the PIN

- **WHEN** handout A contains `PIN: %%var FRANKLYN_PIN%%`, the teacher sets `FRANKLYN_PIN` to `4711` on the test's page, and a present participant in group A opens the handout during the window
- **THEN** the page shows `PIN: 4711`

#### Scenario: Class and date

- **WHEN** a test of the course 4BHIF has a handout headed `#### Test - %%var CLASS%% - %%var DATE%% - Quarkus REST Basics`, and its sitting was started on 2026-11-14
- **THEN** a participant's handout shows the heading `Test - 4BHIF - 14.11.2026 - Quarkus REST Basics`, and the test's page shows `CLASS` and `DATE` without a field to change them

#### Scenario: A make-up on another day

- **WHEN** the first sitting was started on 2026-11-14 and a make-up of the same test is started on 2026-11-21
- **THEN** a participant of the make-up sees `21.11.2026` as the date, and the solution page shows `14.11.2026`

#### Scenario: One list for two handouts

- **WHEN** handout A contains `%%var SUBMISSION_LINK%%` and `%%var FRANKLYN_PIN%%`, and handout B contains `%%var FRANKLYN_PIN%%` and `%%var SUBMISSION_LINK_B%%`
- **THEN** the test's page shows one field each for `SUBMISSION_LINK`, `FRANKLYN_PIN` and `SUBMISSION_LINK_B`, and the value of `FRANKLYN_PIN` appears in both handouts

#### Scenario: A link as the value

- **WHEN** `SUBMISSION_LINK` is set to `https://classroom.github.com/a/abc123`
- **THEN** the handout shows it as a link to that address

#### Scenario: Changing a value during the window

- **WHEN** the teacher corrects `FRANKLYN_PIN` from `4711` to `4712` while the sitting is open, and a participant reloads the handout
- **THEN** the page shows `4712`

#### Scenario: A variable added to the file

- **WHEN** the teacher adds `%%var ROOM%%` to handout A after the values were filled in
- **THEN** the test's page shows an empty field for `ROOM` the next time it is shown, and the teacher's preview shows `‹ROOM›`

#### Scenario: A variable removed from the file

- **WHEN** `FRANKLYN_PIN` had the value `4711` and is then deleted from both handouts
- **THEN** the test's page no longer shows a field for it, and the value is shown again if the variable comes back

#### Scenario: Not a variable

- **WHEN** a handout contains `%%var lowercase%%`, `%% var: PIN %%` and `` `%%var PIN%%` `` in inline code
- **THEN** none of them is offered as a variable, the first two stay hidden as comments, and the code shows its text as written

#### Scenario: The file's own page

- **WHEN** a teacher opens the handout file as an ordinary corpus page
- **THEN** its variables are hidden there, as every comment is

#### Scenario: A value with a directive

- **WHEN** the teacher saves the value `@@@ teacher` or a value that spans two lines
- **THEN** it is refused, and the stored value is unchanged

#### Scenario: The file's own print view

- **WHEN** a teacher opens the handout file's own corpus page with `?document`
- **THEN** its variables are hidden there, as every comment is
