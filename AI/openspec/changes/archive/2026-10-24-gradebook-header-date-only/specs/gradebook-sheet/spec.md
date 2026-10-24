## MODIFIED Requirements

### Requirement: A column's header is compact and shows its details on hover

A column's header SHALL show its date as day and month and, for a column with a maximum, the maximum, as text and not as input fields. It SHALL NOT show the column's name. A column's width SHALL follow its header text and its result fields, not editing controls or its name. Hovering anywhere over the header cell, not only over its text, SHALL show the column's name, its full date with the year, and its maximum or that it takes percent; a column named by its date SHALL show that date once. Where the header can be chosen, the whole header cell SHALL be the area that is chosen and that is marked on hover. A category's heading SHALL wrap between words, so that a category without columns takes up a single column no wider than the longest word of its heading or its placeholder. The leading columns' headings SHALL be short enough that none of them is wider than what the column holds.

#### Scenario: A test column

- **WHEN** a German-speaking teacher's course has the manual-test column `1st test`, dated 2026-09-27, out of 24
- **THEN** its header reads `27.09.` and `/24`, without `1st test`, and hovering over it shows `1st test`, `27.09.2026` and the maximum 24

#### Scenario: A participation round

- **WHEN** a participation column was added without a name and dated 2026-09-17
- **THEN** its header shows `17.09.`, and hovering over it shows `17.09.2026` once, not the date twice

#### Scenario: Hovering beside the text

- **WHEN** a teacher points at the header cell of a column out of 24 below its `/24`, where the cell has no text
- **THEN** the column's details are shown and the header is marked as chosen on hover, as when pointing at the date itself
- **AND** clicking there opens the column's dialog

#### Scenario: A sheet of nine columns

- **WHEN** a course has three manual-test, four participation and two homework columns and no online test
- **THEN** each column is about as wide as its result field, the date being no wider than that field, and the sheet is narrower than with the names in the headers

#### Scenario: An empty category

- **WHEN** a course has no online test and no short-test column
- **THEN** the online-test and the short-test categories each take up a single column whose width is set by the longest word of its heading, with the weight on a line of its own where it does not fit

### Requirement: Online tests are read-only columns of their category

Every online test of a course SHALL be a column of the online-test category of the course's sheet, named by the test and dated by the start of its first sitting, ordered among the category's columns like any other column. A test without any sitting SHALL have no column yet. The column's fields SHALL show each participant's submitted result as points out of the number of questions, and SHALL NOT be editable in the sheet: a result of an online test is changed only by the test itself. The date in the column's header SHALL link to the test. The arrow keys SHALL pass over the column's fields to the next editable field. Deleting a test's column from the sheet SHALL NOT be offered.

#### Scenario: A test written by the class

- **WHEN** the test `HTTP caching` with 4 questions had its first sitting on 2026-12-01 and a student submitted 3 correct
- **THEN** the online-test group shows a column dated 2026-12-01 whose details on hover name `HTTP caching`, its date links to the test, and that student's field shows 3/4 and cannot be typed into

#### Scenario: Moving across an online-test column

- **WHEN** the focus is in the last manual column left of an online-test column and the teacher presses the right arrow at the end of the field's text
- **THEN** the focus moves to the next editable field to the right, past the online-test column

#### Scenario: A test only assembled

- **WHEN** a test exists but no sitting has been scheduled for it
- **THEN** the sheet shows no column for it

### Requirement: The module's table headings show names as they were entered

The headings of the gradebook and of the module's other tables SHALL show column names, test names and labels exactly as they were entered, without changing their case. Where the gradebook sheet shows a column's name only in the header's details on hover and in the column's dialog, it SHALL show it there as it was entered. Tables written in a corpus page's Markdown are not the module's tables and keep their own styling.

#### Scenario: A test name with lower-case words

- **WHEN** a test named "Quiz: HTTP and databases" appears as a column of the gradebook
- **THEN** the details of its column head read "Quiz: HTTP and databases", not "Quiz: HTTP And Databases"

#### Scenario: A column a teacher named

- **WHEN** a teacher names a gradebook column "oral check of chapter 3"
- **THEN** the sheet's details on hover and the column's dialog show it as "oral check of chapter 3", and so do the results of the students it concerns

## ADDED Requirements

### Requirement: The column dialog follows light and dark mode

The dialog for adding a column through a category's `+` and for changing a column through its header SHALL be shown in the page's light or dark mode, for every category that has one: its background, its text, its fields, its date picker and its buttons, and the shading of the page behind it. Every text in it SHALL be legible against its background in either mode.

#### Scenario: Adding a homework column in dark mode

- **WHEN** a teacher with dark mode chosen uses the `+` of homework
- **THEN** the dialog has a dark background with light text, its name, date and maximum fields are dark with light text, and its buttons look like the module's buttons in dark mode

#### Scenario: Editing a column in light mode

- **WHEN** a teacher with light mode chosen opens a manual-test column's dialog through its header
- **THEN** the dialog is light with dark text, as before

#### Scenario: Switching the mode with the dialog closed

- **WHEN** a teacher switches from light to dark mode and then opens a participation column's dialog
- **THEN** the dialog is shown in dark mode without reloading the page
