## MODIFIED Requirements

### Requirement: A handout is shown to a present participant during the window, as a student

While a sitting is open, a participant marked present SHALL be served the handout of their group (with one handout, that handout) as a page of the module. The page SHALL be rendered from the file's current content for that participant as a student: the file's own whole-file directive SHALL be set aside, every inline block SHALL be decided by the participant's roles as on any page, the public variant SHALL be shown, and the exam and optional blockss SHALL be hidden, whatever the participant's stored preferences. The handout SHALL therefore show nothing of the file that an ordinary page shows a student only in the private-variant or optional view. A teacher's preview of a handout SHALL show the same content a participant is shown. The handout SHALL NOT be served to anyone else: not to an absent participant, not to a participant of the other group, not to a non-participant, and not before the start or after the window. A refusal SHALL NOT reveal the file's path or content. The file SHALL remain hidden in the navigation tree, in search, and on its own corpus URL, exactly as its directive decides.

#### Scenario: A handout restricted to teachers

- **WHEN** `POS/LT1-A.md` starts with `@@@ teacher`, contains a `@@@ teacher` block with hints, and a present participant in group A opens the handout during the window
- **THEN** the page shows the file's content without the hints

#### Scenario: Exam and practice variants

- **WHEN** the handout contains a `@@@ #variant-private` block, a `@@@ #variant-public` block and a `@@@ #optional` block, and a participant whose stored variant and optional preferences are both on opens it
- **THEN** the page shows the practice block, and neither the exam block nor the optional block

#### Scenario: Solutions kept in exam blocks

- **WHEN** a test file holds the assignment as plain text and each task's solution in a `@@@ #variant-private` block, and a present participant opens it as their handout
- **THEN** the page shows the assignment and none of the solutions

#### Scenario: The teacher's preview

- **WHEN** a teacher with the private-variant and optional views on opens the preview of that handout
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

An attachment the served handout references SHALL be served to that participant while the handout is served to them, and SHALL stop being served the moment the window closes, the sitting ends, the participant is marked absent or is moved to the other group. Only references in parts of the handout the participant is shown SHALL count: an attachment referenced only inside a block the handout hides from them, an private-variant or optional block among them, SHALL NOT become servable through it. Attachments the handout does not reference SHALL NOT become servable through it.

#### Scenario: An image and a starter archive

- **WHEN** the handout embeds `diagram.png` and links `starter.zip`, both referenced nowhere else visible to students, and a present participant opens the handout
- **THEN** both are served to that participant

#### Scenario: An image inside a solution

- **WHEN** the handout embeds `solution.png` only inside a `@@@ #variant-private` block, and a present participant requests `solution.png` during the window
- **THEN** it is not served

#### Scenario: The window closes

- **WHEN** the window closes and the participant requests `starter.zip` again
- **THEN** it is not served

### Requirement: A teacher opens a handout's solution as a page

For each handout that contains at least one `#variant-private` or `#optional` block, the test's page SHALL offer the teacher a button that opens the handout's solution as a page of the module, not as a presentation, since a handout is running text: rendered as for a participant, but with the private variant and the optional blocks shown and the public variant hidden. The page SHALL show no student's name and no result. It SHALL be available at any time, during and after the window. The page and every request it makes SHALL be refused to any session that does not act as a teacher, including a teacher in student view. A handout with neither an `#variant-private` nor an `#optional` block SHALL offer no solution button.

#### Scenario: Discussing the test in the next lesson

- **WHEN** a teacher presses the solution button of handout A
- **THEN** a page of handout A opens, not a presentation, with its private-variant blocks and its optional blocks shown, and its public variant and its `@@@ teacher` blocks hidden

#### Scenario: Solutions only in exam blocks

- **WHEN** a handout holds its solutions in `@@@ #variant-private` blocks and has no `#optional` block
- **THEN** the test's page offers the solution button for it, and the solution page shows those solutions

#### Scenario: A student opens the solution URL

- **WHEN** a student requests the solution page of a handout of a test they wrote
- **THEN** the request is refused

#### Scenario: No answers in the file

- **WHEN** a handout contains neither an `#variant-private` nor an `#optional` block
- **THEN** the test's page offers no solution button for it

