# exam-ui-conventions Specification

## Purpose
Defines how the exam module presents what a teacher can do on its pages, so every page shows its actions at first glance, in one style, at the structure they act on, and asks before destroying anything in one way only.

## Requirements

### Requirement: Actions are buttons in one style

Every element of the module that triggers an action or opens a tool SHALL be a button in the module's button style, never a plain text link or a muted line. A link SHALL remain only where it leads to a page about a named thing, such as a test's, class's or student's name. Each page SHALL mark at most one primary action per section in the primary style. An element that triggers an action SHALL NOT be styled as a link. Actions SHALL NOT be shown with reduced opacity unless they are disabled.

#### Scenario: The pool's tools

- **WHEN** a teacher opens the question pool and previews a question
- **THEN** Edit, New question and Import questions are buttons in the module's style, and none of them is a text link

#### Scenario: Back to the pool

- **WHEN** a teacher opens the question editor, the import or a question page
- **THEN** the way back to the pool is a button

#### Scenario: Primary actions

- **WHEN** a teacher sees Create test, Import n questions, Mark as reviewed or Make current
- **THEN** that button is drawn in the primary style

#### Scenario: A test's name stays a link

- **WHEN** a teacher looks at the list of online tests
- **THEN** each test's name is a link to its page, and every action in the list is a button

### Requirement: Actions stand at the structure they act on

An action SHALL be placed at the structure it acts on: a record's actions in that record's head, a list's "new" action at the list, and a page's main action above the content it applies to. No action SHALL be reachable only through a line at the end of a page. A message about an action's outcome SHALL be shown next to that action.

#### Scenario: Deleting a test

- **WHEN** a teacher opens an unwritten test with ten questions
- **THEN** Delete this test stands in the test's head beside Rename, above the questions

#### Scenario: A refusal at its action

- **WHEN** the server refuses a change of a sitting
- **THEN** the reason is shown at that sitting, not under the rename form

#### Scenario: Courses of a class

- **WHEN** a teacher opens a class's page
- **THEN** its courses are listed with a `+ Course` button in that list

#### Scenario: Importing

- **WHEN** a file has been checked and its preview is shown
- **THEN** the Import n questions button stands above the preview tables

#### Scenario: A new test from the list

- **WHEN** a teacher opens the online tests of a course
- **THEN** the list offers a New test button that leads to assembling a test for that course in the pool

#### Scenario: Choosing questions in the pool

- **WHEN** a course is chosen in the bar and a teacher looks at the pool's list
- **THEN** every row shows a checkbox that is ticked exactly while the question is chosen for the test

### Requirement: One way to confirm a destructive action

Every action that deletes or removes something SHALL ask for confirmation by a second activation of the same button, whose label after the first activation SHALL say what the second one does. The module SHALL NOT use browser dialogs. An armed button SHALL fall back to its first state when the teacher activates anything else or after a few seconds without a second activation. This SHALL apply at least to:

- deleting a scheduled sitting;
- removing a question from a test;
- deleting a test;
- taking a student off a roster;
- deleting a gradebook column;
- deleting a category or a question;
- taking back an import;
- deleting a school year, class or course;
- ending a sitting.

Releasing an attempt's browser binding SHALL NOT ask for confirmation.

#### Scenario: Deleting a scheduled sitting

- **WHEN** a teacher clicks Delete at a scheduled sitting once
- **THEN** nothing is deleted and the button now reads that a second click deletes the sitting

#### Scenario: The second click

- **WHEN** the teacher clicks the armed button again
- **THEN** the sitting is deleted

#### Scenario: Changing one's mind

- **WHEN** a teacher arms Delete at a sitting and then clicks elsewhere on the page
- **THEN** the button shows Delete again and a later single click does not delete

#### Scenario: No browser dialog

- **WHEN** a teacher deletes a category, a gradebook column or a question
- **THEN** no browser dialog opens

### Requirement: Empty states lead to the next step

A page or section that is empty because a record is missing SHALL offer, as a button, the action that creates that record, where the teacher may perform it.

#### Scenario: No school year

- **WHEN** a teacher opens the module before any school year exists
- **THEN** the page offers a button that creates the first school year

#### Scenario: Empty roster

- **WHEN** a teacher opens the gradebook of a course whose class has nobody on its roster
- **THEN** the page offers a button that leads to the class's roster

### Requirement: Every field saves as it changes

Every editable field of the module's teacher pages SHALL be saved as it changes, including the grading scale, which SHALL be saved whenever its thresholds form a valid scale and SHALL show why it is not saved while they do not. Every page with such fields SHALL say near its top that its fields are saved as they change.

#### Scenario: The grading scale

- **WHEN** a teacher changes the threshold of grade 2 to a valid value and leaves the field
- **THEN** the scale is stored without a Save button

#### Scenario: The student's page in a course

- **WHEN** a teacher opens a student's page in a course
- **THEN** the page says that its fields are saved as they change

### Requirement: One wording for one thing

The module SHALL use one label for one thing in each language: the same name for the gradebook in the bar and on its page, the same name for the whole year in the bar and in the gradebook, the same name for a question type in the pool and in the editor, and the course's language named in the reader's language. Labels and headings SHALL be in sentence case. An English text SHALL NOT contain German words, except names.

#### Scenario: The whole year

- **WHEN** a teacher chooses the whole year in the bar and opens the gradebook
- **THEN** the bar and the gradebook's heading use the same name for it

#### Scenario: A test's language in English

- **WHEN** a teacher reading in English opens a test of a German course
- **THEN** the test's head names the course's language as German

### Requirement: Rows are coloured by what they mean

Where a row of one of the module's tables stands for one value that matters most for it (a grade, a test's state, a participant's status), the row SHALL be coloured by that value, from one shared set of row colours:
- **good** (green): a good outcome or something completed;
- **bad** (red): a failing outcome, or something happening right now that needs attention;
- **warn** (amber): something that will need attention soon, or a flag to look at;
- **info** (slate): something later, or not taking part;
- **neutral**: no colour.

A coloured row SHALL show a tint across the whole row and a stripe of the same hue at its left edge. A flag that does not judge the row SHALL show the stripe only. Each tone SHALL have its own values for light and dark mode, with text staying readable on the tint. The tint SHALL also cover cells that stay in place when the table scrolls horizontally.

The colour SHALL NOT be the only carrier of the meaning. The row SHALL say it in words, through the value it shows (such as the grade) or as its tooltip, and a table whose rows do not show the value itself SHALL have a legend naming the colours. The marked row SHALL keep its own highlight over the tint, and its stripe SHALL stay visible. A cell with a colour of its own, such as a Matura candidate's name, SHALL keep it. A table whose rows already carry colours of their own (the attendance table's handout groups, the question pool's chosen and unreviewed questions) SHALL keep them and not take on these colours.

#### Scenario: The marked row

- **WHEN** a teacher clicks a row coloured red
- **THEN** the row shows the marked highlight, and the red stripe stays at its left edge

#### Scenario: Dark mode

- **WHEN** a teacher reading in dark mode opens a table with green, red, amber and slate rows
- **THEN** every tint is a dark variant of its hue, and the text on it reads as on any other row

#### Scenario: A sideways-scrolled table

- **WHEN** a teacher scrolls the gradebook sheet sideways
- **THEN** the student's name, proposal and grade, which stay in place, show the row's tint like the cells that scroll
