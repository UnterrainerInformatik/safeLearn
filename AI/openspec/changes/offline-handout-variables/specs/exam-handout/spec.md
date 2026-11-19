## ADDED Requirements

### Requirement: A handout's variables are filled from its test

An inline Obsidian comment whose whole content is `var` followed by a name, written `%%var NAME%%`, SHALL be a variable of the handout. The name SHALL be an upper-case letter followed by upper-case letters, digits or `_`. Whitespace around the content SHALL be allowed. Any other comment SHALL stay a comment. A mark inside fenced or inline code SHALL be no variable, as it is no comment (`obsidian-comments`).

An offline test SHALL hold one value per variable name, shared by its handouts A and B. The test's page SHALL show one field for every variable found in the current content of its resolving handouts, scanned again each time the page is shown, in the order the variables first appear, A before B, and each name once. A teacher SHALL be able to set and change these values at any time, also while a sitting is open. A value SHALL be a single line of at most 500 characters and SHALL NOT contain `%%` or `@@@`. An empty value SHALL count as no value. A value whose variable no longer appears in either handout SHALL be kept, and SHALL NOT be shown.

Two names SHALL be filled by the module, and the teacher SHALL NOT be able to set them. The test's page SHALL show them read-only. `CLASS` SHALL be the class of the test's course. `DATE` SHALL be the date of the sitting, written as day, month and four-digit year separated by dots: the day it was started, or the day it is planned for while it has not started. In the participant's handout, `DATE` SHALL be that of the participant's sitting. In the teacher's preview and solution deck, it SHALL be that of the test's first started sitting, or of its first planned sitting while none has started. Without any sitting it SHALL have no value.

The participant's handout, the teacher's preview and the solution deck SHALL show every variable replaced by its value. The value SHALL be rendered as part of the handout's Markdown, sanitized like the rest of it. A variable without a value SHALL be shown as its name between `‹` and `›`. Every other view of the file SHALL keep hiding a variable as a comment: its page, search, the attachment check and the Obsidian plugin.

#### Scenario: Filling in the PIN

- **WHEN** handout A contains `PIN: %%var FRANKLYN_PIN%%`, the teacher sets `FRANKLYN_PIN` to `4711` on the test's page, and a present participant in group A opens the handout during the window
- **THEN** the page shows `PIN: 4711`

#### Scenario: Class and date

- **WHEN** a test of the course 4BHIF has a handout headed `#### Test - %%var CLASS%% - %%var DATE%% - Quarkus REST Basics`, and its sitting was started on 2026-11-14
- **THEN** a participant's handout shows the heading `Test - 4BHIF - 14.11.2026 - Quarkus REST Basics`, and the test's page shows `CLASS` and `DATE` without a field to change them

#### Scenario: A make-up on another day

- **WHEN** the first sitting was started on 2026-11-14 and a make-up of the same test is started on 2026-11-21
- **THEN** a participant of the make-up sees `21.11.2026` as the date, and the solution deck shows `14.11.2026`

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

## MODIFIED Requirements

### Requirement: A handout that no longer resolves blocks the start

The test's page and the sitting's page SHALL show each handout's path, and SHALL show it in red when no corpus file exists at that path any more, because the file was renamed, moved or deleted. While a handout is shown in red, the sitting SHALL NOT be started (`offline-test`). Choosing another file or removing the handout SHALL clear the condition. In the same way, the test's page and the sitting's page SHALL show in red the names of the handouts' variables that have no value, and while one of them has no value the sitting SHALL NOT be started. Giving each one a value, or removing it from the file, SHALL clear that condition. `DATE` SHALL always count as filled for the sitting being started. A file that a student of the course can read under its own directive at the time of choosing SHALL be flagged with a warning that it is visible to the class already, without being refused.

#### Scenario: The file is renamed before the test

- **WHEN** a handout's file is renamed in the corpus after it was chosen and before the start
- **THEN** the test's page shows the old path in red, and the start is refused until another file is chosen or the handout is removed

#### Scenario: An unrestricted file

- **WHEN** the teacher chooses a file without a whole-file directive
- **THEN** the dialog warns that the class can already read it, and the file is set as the handout

#### Scenario: A variable without a value

- **WHEN** handout A contains `%%var FRANKLYN_PIN%%`, the test holds no value for it, and the teacher presses start
- **THEN** the sitting does not start, the teacher is told that `FRANKLYN_PIN` has no value, and the test's page and the sitting's page show `FRANKLYN_PIN` in red

#### Scenario: Date and class need nothing

- **WHEN** a handout's only variables are `CLASS` and `DATE`, and the teacher presses start
- **THEN** the sitting starts
