## Purpose

Defines the gradebook as a sheet - one column per assessment, one row per student, every field saved as it changes - and the table conventions the module's other tables share with it.

## ADDED Requirements

### Requirement: Results are recorded in assessment columns

A course's manual results SHALL be organized in columns. A column SHALL belong to one category - manual tests, participation or homework - and SHALL carry a name, a date and, for manual tests and homework, optionally a maximum number of points. The date SHALL lie in the course's school year and SHALL decide the semester of every result in the column. A student SHALL have at most one result per column. Every rule of the gradebook about results stays as it is: a result is a fraction from 0 to 1, a test or homework result is points out of the column's maximum or, without a maximum, a percentage, and a participation result is `+` (1) or `−` (0).

#### Scenario: A paper test as a column

- **WHEN** a teacher adds a manual-test column `1st test`, dated 2026-11-03, out of 24, and enters 17 for a student
- **THEN** the student has a result of 17/24 in the manual-test category, dated 2026-11-03

#### Scenario: Two results in one column

- **WHEN** a result for a student exists in a column and a teacher enters another value in the same field
- **THEN** the student still has exactly one result in that column, with the new value

### Requirement: A column is added with the + of its category

The sheet SHALL show a `+` at the top of each of the categories manual tests, participation and homework. Using it SHALL add a column to that category, asking for its name, date and, where the category has one, maximum. A column added without a name SHALL be named by its date. The online-test category SHALL have no `+`: its columns are the online tests themselves. A column's name, date and maximum SHALL be shown in its header and SHALL be editable there. Changing the maximum SHALL be refused while a result in the column has more points than the new maximum. Deleting a column SHALL remove its results, and SHALL ask for confirmation first when it has any.

#### Scenario: A participation column

- **WHEN** a teacher uses the `+` of participation and enters the date 2026-11-04
- **THEN** a participation column dated 2026-11-04 appears, and each student has a field for `+` or `−` in it

#### Scenario: Changing the maximum

- **WHEN** a column out of 24 holds a result of 20 points and a teacher changes the maximum to 30
- **THEN** the result becomes 20/30 and the proposals follow
- **AND** changing the maximum to 18 instead is refused, and the column keeps 24

### Requirement: Columns are grouped by category, newest furthest right

The sheet SHALL show the columns grouped by category, in the category order of the config sheet, each category's columns side by side. The category SHALL be a heading row above its columns, spanning all of them, with the category's `+` in it, and the columns' own headers below it. Within a category the columns SHALL be ordered by date, the newest furthest right, and columns of the same date by when they were added.

#### Scenario: Two header rows

- **WHEN** the manual-test category holds the columns `1st test` and `2nd test`
- **THEN** one heading `Manual tests` with its `+` spans both, and below it each column shows its name, date and maximum

#### Scenario: A column for an earlier date

- **WHEN** a manual-test column dated 2026-10-20 is added after one dated 2026-11-03
- **THEN** it stands left of the 2026-11-03 column, within the manual-test group

### Requirement: Every field is saved as it changes

Every field of the sheet SHALL be saved as soon as its value changes, without a separate save action. An entered value SHALL be saved, an emptied field SHALL remove the student's result in that column, and a value the server refuses SHALL be marked at the field with the reason while the stored value stays as it was. A field SHALL show while it is being saved and that it was saved. The proposal, the override and the grade of the student's row SHALL be updated from the server's answer.

#### Scenario: Entering a result

- **WHEN** a teacher types 18 into a student's field of a column out of 24 and leaves the field
- **THEN** the result is stored without any further action, and the row's proposal reflects it

#### Scenario: Emptying a field

- **WHEN** a teacher empties a field that held a result
- **THEN** that result no longer exists

#### Scenario: A refused value

- **WHEN** a teacher types 30 into a field of a column out of 24
- **THEN** the field is marked as refused with the reason, and the stored result is unchanged

### Requirement: Arrow keys move between the sheet's result fields

While a result field of the sheet has the focus, the arrow keys SHALL move the focus between result fields, for points, percent and `+`/`−` fields alike. The down arrow SHALL move to the same column's field of the next student, the up arrow to that of the previous student. The right arrow SHALL move to the same student's field in the next column to the right, and the left arrow to the one to the left, but only while the text cursor stands at the end (right) or the start (left) of the field's text, so that the arrows still move the cursor inside a value being typed. An empty field counts as both. Moving SHALL save the field being left, as leaving it by any other means does. At the edge of the sheet the focus SHALL stay where it is. Left and right SHALL pass over category boundaries as if the columns were one row. The arrows SHALL NOT change a field's value: a `+`/`−` field is set by typing `+` or `-`. The override field SHALL NOT take part in arrow movement. Tab and Shift+Tab SHALL move along the row as the browser does.

#### Scenario: Entering a test for the class

- **WHEN** a teacher types 18 into the first student's field of a column and presses the down arrow
- **THEN** 18 is saved for the first student and the focus is in the second student's field of the same column

#### Scenario: Along a row

- **WHEN** a teacher types 18 into a field, so the cursor stands at the end of `18`, and presses the right arrow
- **THEN** 18 is saved and the focus is in the same student's field of the next column
- **AND** pressing the left arrow there, in an empty field, brings the focus back to the field holding 18

#### Scenario: Moving the cursor inside a value

- **WHEN** a field holds `17.5` with the cursor at its end and the teacher presses the left arrow
- **THEN** the cursor moves one character to the left inside the field, and the focus stays in the field

#### Scenario: Participation marks down the list

- **WHEN** a teacher in a participation column types `+`, presses the down arrow, types `-` and presses the down arrow again
- **THEN** the first student has `+`, the second has `−`, and the focus is in the third student's field

### Requirement: The sheet keeps the student and the grade in view

Each row SHALL begin, from the left, with the student's name, the proposal, the override and the grade. These four columns SHALL stay in place when the sheet is wider than the screen, and every other column SHALL scroll horizontally within the sheet, not the page. The override SHALL be a field of the row like any other, saved as it changes. The explanation that a result without a maximum is a percentage SHALL stand once above or below the sheet, not in its cells.

#### Scenario: A wide sheet

- **WHEN** a course has thirty columns and the sheet is wider than the screen
- **THEN** a horizontal scrollbar belongs to the sheet, and while scrolling the names, proposals, overrides and grades stay visible

#### Scenario: Setting an override in the sheet

- **WHEN** a teacher chooses 2 in a student's override field
- **THEN** the override is stored, and the row's grade shows 2 beside the unchanged proposal

### Requirement: A row can be marked

A click on a row of the sheet SHALL mark it visibly. Marking another row SHALL unmark the first, so at most one row is marked. Clicking into a field of a row SHALL mark that row as well. The marking SHALL be a reading aid only: it SHALL NOT be stored and SHALL NOT change any data.

#### Scenario: Following a student across

- **WHEN** a teacher clicks the row of one student and then the row of another
- **THEN** only the second row is marked

### Requirement: The module's other tables follow the same conventions

The module's other tables - the classes of a school year, a class's roster, a course's config sheet, and a student's entries - SHALL mark rows on click in the same way. A table whose first column names the row SHALL keep that column in place when the table scrolls horizontally. A field that can be stored on its own SHALL be saved as it changes, with the same marking of saving, saved and refused. The config sheet's weights SHALL be saved as they change whenever they add up to 100 %, and SHALL show the sum and not be saved while they do not.

#### Scenario: Changing weights

- **WHEN** a teacher changes manual tests from 25 % to 35 %, and then participation from 25 % to 15 %
- **THEN** nothing is saved after the first change, which leaves the sum at 110 %, and the weights are saved after the second, which brings it back to 100 %

### Requirement: Results recorded before the sheet keep their place

Results recorded before columns existed SHALL be placed into columns when the module's database is migrated: results of the same course, kind, date, maximum and note SHALL share one column, named by the note or, without one, by the kind and date. No result, proposal or override SHALL change in the move.

#### Scenario: A class's paper test entered before

- **WHEN** a course holds 25 manual-test entries dated 2026-11-03, out of 24, with the note `1st test`
- **THEN** after the migration they form one column `1st test`, dated 2026-11-03, out of 24, and every student's proposal is the same as before

### Requirement: The student sees a result by its column

A student's own results SHALL show each result with its column's name and date. A student SHALL see nothing else of the sheet: neither other students' results nor columns in which they have no result.

#### Scenario: A named test

- **WHEN** a student has 18 points in the column `1st test` out of 24
- **THEN** their results show `1st test`, its date and 18/24
