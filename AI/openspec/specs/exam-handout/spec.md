# exam-handout Specification

## Purpose

Defines how a corpus Markdown file becomes the handout of an offline test: chosen by the teacher, kept valid until the start, shown to each present participant during the window under fixed views and nowhere else, and shown to the teacher afterwards as a solution deck.

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

The test's page and the sitting's page SHALL show each handout's path, and SHALL show it in red when no corpus file exists at that path any more, because the file was renamed, moved or deleted. While a handout is shown in red, the sitting SHALL NOT be started (`offline-test`). Choosing another file or removing the handout SHALL clear the condition. A file that a student of the course can read under its own directive at the time of choosing SHALL be flagged with a warning that it is visible to the class already, without being refused.

#### Scenario: The file is renamed before the test

- **WHEN** a handout's file is renamed in the corpus after it was chosen and before the start
- **THEN** the test's page shows the old path in red, and the start is refused until another file is chosen or the handout is removed

#### Scenario: An unrestricted file

- **WHEN** the teacher chooses a file without a whole-file directive
- **THEN** the dialog warns that the class can already read it, and the file is set as the handout

### Requirement: A handout is shown to a present participant during the window, as a student

While a sitting is open, a participant marked present SHALL be served the handout of their group (with one handout, that handout) as a page of the module. The page SHALL be rendered from the file's current content for that participant as a student: the file's own whole-file directive SHALL be set aside, every inline block SHALL be decided by the participant's roles as on any page, the exam variant SHALL be shown, and the practice and answer variants SHALL be hidden, whatever the participant's stored preferences. A teacher's preview of a handout SHALL show the same content a participant is shown. The handout SHALL NOT be served to anyone else: not to an absent participant, not to a participant of the other group, not to a non-participant, and not before the start or after the window. A refusal SHALL NOT reveal the file's path or content. The file SHALL remain hidden in the navigation tree, in search, and on its own corpus URL, exactly as its directive decides.

#### Scenario: A handout restricted to teachers

- **WHEN** `POS/LT1-A.md` starts with `@@@ teacher`, contains a `@@@ teacher` block with hints, and a present participant in group A opens the handout during the window
- **THEN** the page shows the file's content without the hints

#### Scenario: Exam and practice variants

- **WHEN** the handout contains a `@@@ #exam` block, a `@@@ #practice` block and a `@@@ #answer` block, and a participant whose stored exam preference is off opens it
- **THEN** the page shows the exam block, and neither the practice block nor the answer block

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

An attachment the served handout references SHALL be served to that participant while the handout is served to them, and SHALL stop being served the moment the window closes, the sitting ends, the participant is marked absent or is moved to the other group. Attachments the handout does not reference SHALL NOT become servable through it.

#### Scenario: An image and a starter archive

- **WHEN** the handout embeds `diagram.png` and links `starter.zip`, both referenced nowhere else visible to students, and a present participant opens the handout
- **THEN** both are served to that participant

#### Scenario: The window closes

- **WHEN** the window closes and the participant requests `starter.zip` again
- **THEN** it is not served

### Requirement: A teacher presents a handout's solution as a deck

For each handout that contains at least one `#answer` block, the test's page SHALL offer the teacher a button that opens the handout as a presentation, rendered as for a participant but with the answer variant shown. The deck SHALL show no student's name and no result. It SHALL be available at any time, during and after the window. The deck and every request it makes SHALL be refused to any session that does not act as a teacher, including a teacher in student view. A handout without an `#answer` block SHALL offer no solution button.

#### Scenario: Discussing the test in the next lesson

- **WHEN** a teacher presses the solution button of handout A
- **THEN** a presentation of handout A opens with its answer blocks shown, its exam variant shown, its practice variant and its `@@@ teacher` blocks hidden

#### Scenario: A student opens the solution URL

- **WHEN** a student requests the solution deck of a handout of a test they wrote
- **THEN** the request is refused

#### Scenario: No answers in the file

- **WHEN** a handout contains no `#answer` block
- **THEN** the test's page offers no solution button for it
