# gradebook-sheet Specification

## Purpose
Defines the gradebook as a sheet - one column per assessment, one row per student, every field saved as it changes - and the table conventions the module's other tables share with it.

## Requirements

### Requirement: Results are recorded in assessment columns

A course's manual results SHALL be organized in columns. A column SHALL belong to one category - manual tests, short tests, participation or homework - and SHALL carry a name, a date and, for manual tests, short tests and homework, optionally a maximum number of points. The date SHALL lie in the course's school year and SHALL decide the semester of every result in the column. A student SHALL have at most one result per column. Every rule of the gradebook about results stays as it is: a result is a fraction from 0 to 1, a test, short-test or homework result is points out of the column's maximum or, without a maximum, a percentage, and a participation result is `+` (1) or `−` (0).

#### Scenario: A paper test as a column

- **WHEN** a teacher adds a manual-test column `1st test`, dated 2026-11-03, out of 24, and enters 17 for a student
- **THEN** the student has a result of 17/24 in the manual-test category, dated 2026-11-03

#### Scenario: A short test as a column

- **WHEN** a teacher adds a short-test column `Quiz 1`, dated 2026-11-10, out of 6, and enters 5 for a student
- **THEN** the student has a result of 5/6 in the short-test category, dated 2026-11-10, and none in the manual-test category

#### Scenario: Two results in one column

- **WHEN** a result for a student exists in a column and a teacher enters another value in the same field
- **THEN** the student still has exactly one result in that column, with the new value

### Requirement: A column is added with the + of its category

The sheet SHALL show a `+` at the top of each of the categories manual tests, short tests, participation and homework. Using it SHALL open a dialog asking for the column's name, date and, where the category has one, maximum, and SHALL add a column to that category. A column added without a name SHALL be named by its date. The online-test category SHALL have no `+`: its columns are the online tests themselves. A column's name, date and maximum SHALL be changed in the same dialog, opened by choosing the column's header. Each of its fields SHALL be saved as it changes, with the same marking of saving, saved and refused as every other field. Changing the maximum SHALL be refused while a result in the column has more points than the new maximum. The dialog SHALL offer to delete the column. Deleting a column SHALL remove its results, and SHALL ask for confirmation first when it has any.

#### Scenario: A participation column

- **WHEN** a teacher uses the `+` of participation and enters the date 2026-11-04
- **THEN** a participation column dated 2026-11-04 appears, and each student has a field for `+` or `−` in it

#### Scenario: Changing the maximum

- **WHEN** a column out of 24 holds a result of 20 points and a teacher chooses its header and changes the maximum to 30
- **THEN** the result becomes 20/30 and the proposals follow
- **AND** changing the maximum to 18 instead is refused at the field, and the column keeps 24

#### Scenario: Renaming a column

- **WHEN** a teacher chooses the header of the column `1st test`, changes its name to `1st test (group A)` and closes the dialog
- **THEN** the header shows `1st test (group A)`, without any further save action

#### Scenario: Deleting a column

- **WHEN** a teacher chooses the header of a column holding 25 results and deletes it from the dialog
- **THEN** the dialog asks for confirmation first, and only after it the column and its results are gone

### Requirement: Columns are grouped by category, newest furthest right

The sheet SHALL show the columns grouped by category, in the category order of the config sheet - online tests, manual tests, short tests, participation, homework - each category's columns side by side. The category SHALL be a heading row above its columns, spanning all of them, with the category's weight and `+` in it, and the columns' own headers below it. Within a category the columns SHALL be ordered by date, the newest furthest right, and columns of the same date by when they were added.

#### Scenario: Two header rows

- **WHEN** the manual-test category holds the columns `1st test` and `2nd test`
- **THEN** one heading `Manual tests` with its `+` spans both, and below it each column shows its name, date and maximum

#### Scenario: A column for an earlier date

- **WHEN** a manual-test column dated 2026-10-20 is added after one dated 2026-11-03
- **THEN** it stands left of the 2026-11-03 column, within the manual-test group

#### Scenario: Short tests beside the manual tests

- **WHEN** a course has columns in every category
- **THEN** the short-test group stands right of the manual-test group and left of the participation group

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

### Requirement: A student's page leads to the neighbouring students and back

A student's page in a course SHALL offer, at its top, a way back to the course's sheet for the shown semester, and ways to the previous and the next student in the sheet's order. The previous way SHALL be missing for the first student and the next way for the last. The semester SHALL be kept.

#### Scenario: Going through the class

- **WHEN** a teacher on the winter page of the third student of the sheet chooses the next student
- **THEN** the winter page of the fourth student opens

#### Scenario: Back to the sheet

- **WHEN** a teacher on a student's summer page chooses the way back
- **THEN** the course's sheet opens on the whole year

### Requirement: A comment is visible in the sheet

When a student's grade carries a comment, the sheet SHALL show that the comment exists in the student's row, and SHALL make its text readable in the sheet without hovering, also on a touch screen.

#### Scenario: Reading a comment on a tablet

- **WHEN** a teacher on a tablet taps the comment mark in a student's row
- **THEN** the comment's text is shown in the sheet

### Requirement: The module's table headings show names as they were entered

The headings of the gradebook and of the module's other tables SHALL show column names, test names and labels exactly as they were entered, without changing their case. Where the gradebook sheet shows a column's name only in the header's details on hover and in the column's dialog, it SHALL show it there as it was entered. Tables written in a corpus page's Markdown are not the module's tables and keep their own styling.

#### Scenario: A test name with lower-case words

- **WHEN** a test named "Quiz: HTTP and databases" appears as a column of the gradebook
- **THEN** the details of its column head read "Quiz: HTTP and databases", not "Quiz: HTTP And Databases"

#### Scenario: A column a teacher named

- **WHEN** a teacher names a gradebook column "oral check of chapter 3"
- **THEN** the sheet's details on hover and the column's dialog show it as "oral check of chapter 3", and so do the results of the students it concerns

### Requirement: Short tests count with a weight of their own

Short tests SHALL be a category of their own with their own weight on a course's config sheet, beside online tests, manual tests, participation and homework. The five weights SHALL add up to 100 %. The short-test category SHALL enter a semester's proposal like every other category: as the mean of its results, weighted by its weight, and left out with the remaining weights scaled up while it has no result. A new course SHALL start with 20 % for each of the five categories. A course that existed before short tests SHALL get a short-test weight of 0 %, keeping its other weights, so that none of its proposals changes until a teacher changes its weights.

#### Scenario: A quiz weighs less than a test

- **WHEN** the weights are manual tests 60 % and short tests 40 %, the others 0 %, a student has 12/24 in one manual-test column and 6/6 in one short-test column
- **THEN** the student's fraction is 0.6 × 0.5 + 0.4 × 1 = 0.7

#### Scenario: A course from before

- **WHEN** a course had the weights 40/30/15/15 before short tests existed
- **THEN** its config sheet shows online tests 40 %, manual tests 30 %, short tests 0 %, participation 15 %, homework 15 %, and every proposal is what it was

#### Scenario: A new course

- **WHEN** a teacher creates a course without setting weights
- **THEN** each of the five categories has 20 %

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
