## MODIFIED Requirements

### Requirement: Results are recorded in assessment columns

A course's manual results SHALL be organized in columns. A column SHALL belong to one category - manual tests, short tests, presentations, projects, participation or homework - and SHALL carry a name, a date and, for manual tests, short tests and homework, optionally a maximum number of points. The date SHALL lie in the course's school year and SHALL decide the semester of every result in the column; a project's `+`/`−` column is the exception, see "A project has an end grade and `+`/`−` columns for the record". A student SHALL have at most one result per column. Every rule of the gradebook about results stays as it is: a test, short-test or homework result is points out of the column's maximum or, without a maximum, a percentage, and a participation, presentation or project result is a grade from 1 to 5.

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

The sheet SHALL show a `+` at the top of each of the categories manual tests, short tests, presentations, projects, participation and homework, as long as the category is in use. Using it SHALL open a dialog asking for the column's name, date and, where the category has one, maximum, and SHALL add a column to that category; in the projects category it SHALL add a project. A column added without a name SHALL be named by its date. The online-test category SHALL have no `+`: its columns are the online tests themselves. A column's name, date and maximum SHALL be changed in the same dialog, opened by choosing the column's header. Each of its fields SHALL be saved as it changes, with the same marking of saving, saved and refused as every other field. Changing the maximum SHALL be refused while a result in the column has more points than the new maximum. The dialog SHALL offer to delete the column. Deleting a column SHALL remove its results and its notes, and SHALL ask for confirmation first when it has any of either.

#### Scenario: A participation column

- **WHEN** a teacher uses the `+` of participation and enters the date 2026-11-04
- **THEN** a participation column dated 2026-11-04 appears, without a maximum, and each student has a field for a grade from 1 to 5 in it

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

#### Scenario: Deleting a column holding only notes

- **WHEN** a teacher deletes a column that holds no result but two notes
- **THEN** the dialog asks for confirmation first, and only after it the column and its notes are gone

#### Scenario: A presentation column

- **WHEN** a teacher uses the `+` of presentations and enters the name `Referat Git`
- **THEN** a presentation column `Referat Git` appears, asking for no maximum, and each student has a field for a grade in it

### Requirement: Arrow keys move between the sheet's result fields

While a result field of the sheet has the focus, the arrow keys SHALL move the focus between result fields, for points, percent, grade and `+`/`−` fields alike. The down arrow SHALL move to the same column's field of the next student, the up arrow to that of the previous student. The right arrow SHALL move to the same student's field in the next column to the right, and the left arrow to the one to the left, but only while the text cursor stands at the end (right) or the start (left) of the field's text, so that the arrows still move the cursor inside a value being typed. An empty field counts as both. Moving SHALL save the field being left, as leaving it by any other means does. At the edge of the sheet the focus SHALL stay where it is. Left and right SHALL pass over category boundaries as if the columns were one row. The arrows SHALL NOT change a field's value: a `+`/`−` field (a project's mark) is set by typing `+` or `-`, a grade field by typing the grade, and a participation field also by typing `+`, `o` or `-`, which it shows as the grade 1, 3 or 5 once saved. The override field SHALL NOT take part in arrow movement. Tab and Shift+Tab SHALL move along the row as the browser does. Enter in a result field SHALL do what the down arrow does: save the field and move the focus to the same column's field of the next student.

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

- **WHEN** a teacher in a participation column types `+`, presses the down arrow, types `o`, presses the down arrow, types `-`, presses the down arrow, types `2` and presses the down arrow again
- **THEN** the first four students show the grades 1, 3, 5 and 2, and the focus is in the fifth student's field

#### Scenario: Enter down the list

- **WHEN** a teacher types 18 into the first student's field of a column and presses Enter
- **THEN** 18 is saved for the first student and the focus is in the second student's field of the same column

## ADDED Requirements

### Requirement: Participation marks recorded before grades become grades

A participation result recorded as `+` or `−` before participation took grades SHALL become a grade once, when the module's database is upgraded: `+` SHALL become the grade 1 and `−` the grade 5. From then on it SHALL count and show like every other participation grade, at the middle of its grade's band. This SHALL hold for results of closed school years as well, so that a closed year's participation shows as grades too. The upgrade SHALL keep every result's column, student, date and note, and SHALL NOT touch a project's `+`/`−` marks.

#### Scenario: A + from October

- **WHEN** a student had `+` in a participation column dated 2026-10-02 before the upgrade, and the scale is 88/75/63/50
- **THEN** after the upgrade the field shows the grade 1 and the result counts as 0.94

#### Scenario: A − from October

- **WHEN** a student had `−` in a participation column before the upgrade, and the scale is 88/75/63/50
- **THEN** after the upgrade the field shows the grade 5 and the result counts as 0.25

#### Scenario: A project's marks stay marks

- **WHEN** a project's mark column holds `+` and `−` before the upgrade
- **THEN** after the upgrade it still holds `+` and `−` and counts in no category
