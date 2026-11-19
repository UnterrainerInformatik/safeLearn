# exam-handout Specification

## Purpose

Defines how a corpus Markdown file becomes the handout of an offline test: chosen by the teacher, kept valid until the start, shown to each present participant during the window under fixed views and nowhere else, and shown to the teacher afterwards as a solution page.

## Requirements

### Requirement: A handout is chosen from the corpus tree

An offline test SHALL have no handout, one handout, or two handouts (A and B). A handout SHALL be chosen in a dialog that shows the tree of the corpus's Markdown files as the teacher sees it, with a search field above it that narrows the tree to files whose name contains the typed text, in any letter case. The test SHALL store the handout's corpus path. A second handout SHALL be possible only while a first one is set. Removing handout A while B is set SHALL make B the only handout.

#### Scenario: Searching by file name

- **WHEN** the teacher types `langtest` into the dialog's search field
- **THEN** the tree shows only the Markdown files whose name contains `langtest`, `Langtest` or `LANGTEST`, with the folders that lead to them

#### Scenario: Choosing two handouts

- **WHEN** the teacher chooses `POS/LT1-A.md` as handout A and `POS/LT1-B.md` as handout B
- **THEN** the test shows both paths, and the attendance table of its sittings offers groups A and B

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

### Requirement: A handout is shown to a present participant during the window, as a student

While a sitting is open, a participant marked present SHALL be served the handout of their group (with one handout, that handout) as a page of the module. The page SHALL be rendered from the file's current content for that participant as a student: the file's own whole-file directive SHALL be set aside, every inline block SHALL be decided by the participant's roles as on any page, the practice variant SHALL be shown, and the exam and answer variants SHALL be hidden, whatever the participant's stored preferences. The handout SHALL therefore show nothing of the file that an ordinary page shows a student only in the exam or answer view. A teacher's preview of a handout SHALL show the same content a participant is shown. The handout SHALL NOT be served to anyone else: not to an absent participant, not to a participant of the other group, not to a non-participant, and not before the start or after the window. A refusal SHALL NOT reveal the file's path or content. The file SHALL remain hidden in the navigation tree, in search, and on its own corpus URL, exactly as its directive decides.

#### Scenario: A handout restricted to teachers

- **WHEN** `POS/LT1-A.md` starts with `@@@ teacher`, contains a `@@@ teacher` block with hints, and a present participant in group A opens the handout during the window
- **THEN** the page shows the file's content without the hints

#### Scenario: Exam and practice variants

- **WHEN** the handout contains a `@@@ #exam` block, a `@@@ #practice` block and a `@@@ #answer` block, and a participant whose stored exam and answer preferences are both on opens it
- **THEN** the page shows the practice block, and neither the exam block nor the answer block

#### Scenario: Solutions kept in exam blocks

- **WHEN** a test file holds the assignment as plain text and each task's solution in a `@@@ #exam` block, and a present participant opens it as their handout
- **THEN** the page shows the assignment and none of the solutions

#### Scenario: The teacher's preview

- **WHEN** a teacher with the exam and answer views on opens the preview of that handout
- **THEN** the preview shows the assignment and none of the solutions, as the participant is shown

#### Scenario: The corpus URL during the window

- **WHEN** a participant requests the handout's own corpus URL during the window
- **THEN** it is refused as before, and the navigation tree does not list the file

#### Scenario: After the window

- **WHEN** a participant reloads the handout one second after the window closed
- **THEN** the page is refused and shows nothing of the file

#### Scenario: The other group's handout

- **WHEN** a participant in group A requests handout B
- **THEN** it is refused

#### Scenario: A correction during the test

- **WHEN** the teacher fixes a typo in the handout's file during the window and a participant reloads the handout
- **THEN** the page shows the corrected text

### Requirement: A handout's attachments are served while it is

An attachment the served handout references SHALL be served to that participant while the handout is served to them, and SHALL stop being served the moment the window closes, the sitting ends, the participant is marked absent or is moved to the other group. Only references in parts of the handout the participant is shown SHALL count: an attachment referenced only inside a block the handout hides from them, an exam or answer block among them, SHALL NOT become servable through it. Attachments the handout does not reference SHALL NOT become servable through it.

#### Scenario: An image and a starter archive

- **WHEN** the handout embeds `diagram.png` and links `starter.zip`, both referenced nowhere else visible to students, and a present participant opens the handout
- **THEN** both are served to that participant

#### Scenario: An image inside a solution

- **WHEN** the handout embeds `solution.png` only inside a `@@@ #exam` block, and a present participant requests `solution.png` during the window
- **THEN** it is not served

#### Scenario: The window closes

- **WHEN** the window closes and the participant requests `starter.zip` again
- **THEN** it is not served

### Requirement: A teacher opens a handout's solution as a page

For each handout that contains at least one `#exam` or `#answer` block, the test's page SHALL offer the teacher a button that opens the handout's solution as a page of the module, not as a presentation, since a handout is running text: rendered as for a participant, but with the exam variant and the answer variant shown and the practice variant hidden. The page SHALL show no student's name and no result. It SHALL be available at any time, during and after the window. The page and every request it makes SHALL be refused to any session that does not act as a teacher, including a teacher in student view. A handout with neither an `#exam` nor an `#answer` block SHALL offer no solution button.

#### Scenario: Discussing the test in the next lesson

- **WHEN** a teacher presses the solution button of handout A
- **THEN** a page of handout A opens, not a presentation, with its exam blocks and its answer blocks shown, and its practice variant and its `@@@ teacher` blocks hidden

#### Scenario: Solutions only in exam blocks

- **WHEN** a handout holds its solutions in `@@@ #exam` blocks and has no `#answer` block
- **THEN** the test's page offers the solution button for it, and the solution page shows those solutions

#### Scenario: A student opens the solution URL

- **WHEN** a student requests the solution page of a handout of a test they wrote
- **THEN** the request is refused

#### Scenario: No answers in the file

- **WHEN** a handout contains neither an `#exam` nor an `#answer` block
- **THEN** the test's page offers no solution button for it

### Requirement: A handout's variables are filled from its test

An inline Obsidian comment whose whole content is `var` followed by a name, written `%%var NAME%%`, SHALL be a variable of the handout. The name SHALL be an upper-case letter followed by upper-case letters, digits or `_`. Whitespace around the content SHALL be allowed. Any other comment SHALL stay a comment. A mark inside fenced or inline code SHALL be no variable, as it is no comment (`obsidian-comments`).

An offline test SHALL hold one value per variable name, shared by its handouts A and B. The test's page SHALL show one field for every variable found in the current content of its resolving handouts, scanned again each time the page is shown, in the order the variables first appear, A before B, and each name once. A teacher SHALL be able to set and change these values at any time, also while a sitting is open. A value SHALL be a single line of at most 500 characters and SHALL NOT contain `%%` or `@@@`. An empty value SHALL count as no value. A value whose variable no longer appears in either handout SHALL be kept, and SHALL NOT be shown.

Two names SHALL be filled by the module, and the teacher SHALL NOT be able to set them. The test's page SHALL show them read-only. `CLASS` SHALL be the class of the test's course. `DATE` SHALL be the date of the sitting, written as day, month and four-digit year separated by dots: the day it was started, or the day it is planned for while it has not started. In the participant's handout, `DATE` SHALL be that of the participant's sitting. In the teacher's preview and solution page, it SHALL be that of the test's first started sitting, or of its first planned sitting while none has started. Without any sitting it SHALL have no value.

The participant's handout, the teacher's preview and the solution page SHALL show every variable replaced by its value. The value SHALL be rendered as part of the handout's Markdown, sanitized like the rest of it. A variable without a value SHALL be shown as its name between `‹` and `›`. Every other view of the file SHALL keep hiding a variable as a comment: its page, search, the attachment check and the Obsidian plugin.

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
