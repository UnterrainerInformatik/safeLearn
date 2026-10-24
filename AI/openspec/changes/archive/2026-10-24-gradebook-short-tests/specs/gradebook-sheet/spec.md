## MODIFIED Requirements

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

## ADDED Requirements

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

A column's header SHALL show its name, its date as day and month, and, for a column with a maximum, the maximum, as text and not as input fields. A column whose name is its date SHALL show that date once. A column's width SHALL follow its header text and its result fields, not editing controls. Hovering over a header SHALL show the column's full name, its full date with the year, and its maximum or that it takes percent. A category without columns SHALL take up a single narrow column. The leading columns' headings SHALL be short enough that none of them is wider than what the column holds.

#### Scenario: A test column

- **WHEN** a German-speaking teacher's course has the manual-test column `1st test`, dated 2026-09-27, out of 24
- **THEN** its header reads `1st test`, `27.09.` and `/24`, and hovering over it shows `1st test`, `27.09.2026` and the maximum 24

#### Scenario: A participation round

- **WHEN** a participation column was added without a name and dated 2026-09-17
- **THEN** its header shows `17.09.` once, not the date twice

#### Scenario: A sheet of nine columns

- **WHEN** a course has three manual-test, four participation and two homework columns and no online test
- **THEN** each column is about as wide as its header text or its result field, whichever is wider, and the sheet is far narrower than with editing controls in every header
