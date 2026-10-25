## MODIFIED Requirements

### Requirement: Results are recorded in assessment columns

A course's manual results SHALL be organized in columns. A column SHALL belong to one category - manual tests, short tests, presentations, projects, participation or homework - and SHALL carry a name, a date and, for manual tests, short tests and homework, optionally a maximum number of points. The date SHALL lie in the course's school year and SHALL decide the semester of every result in the column; a project's `+`/`−` column is the exception, see "A project has an end grade and `+`/`−` columns for the record". A student SHALL have at most one result per column. Every rule of the gradebook about results stays as it is: a test, short-test or homework result is points out of the column's maximum or, without a maximum, a percentage, a participation result is `+` (1) or `−` (0), and a presentation or project result is a grade from 1 to 5.

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

The sheet SHALL show a `+` at the top of each of the categories manual tests, short tests, presentations, projects, participation and homework, as long as the category is in use. Using it SHALL open a dialog asking for the column's name, date and, where the category has one, maximum, and SHALL add a column to that category; in the projects category it SHALL add a project. A column added without a name SHALL be named by its date. The online-test category SHALL have no `+`: its columns are the online tests themselves. A column's name, date and maximum SHALL be changed in the same dialog, opened by choosing the column's header. Each of its fields SHALL be saved as it changes, with the same marking of saving, saved and refused as every other field. Changing the maximum SHALL be refused while a result in the column has more points than the new maximum. The dialog SHALL offer to delete the column. Deleting a column SHALL remove its results, and SHALL ask for confirmation first when it has any.

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

#### Scenario: A presentation column

- **WHEN** a teacher uses the `+` of presentations and enters the name `Referat Git`
- **THEN** a presentation column `Referat Git` appears, asking for no maximum, and each student has a field for a grade in it

### Requirement: Columns are grouped by category, newest furthest right

The sheet SHALL show the columns grouped by category, in the category order of the config sheet - online tests, manual tests, short tests, presentations, projects, participation, homework - each category's columns side by side, leaving out every category weighted 0 %. The category SHALL be a heading row above its columns, spanning all of them, with the category's weight and `+` in it, and the columns' own headers below it. Within a category the columns SHALL be ordered by date, the newest furthest right, and columns of the same date by when they were added. Within the projects category each project SHALL be a group of its own, ordered by the project's date, as defined by "A project has an end grade and `+`/`−` columns for the record".

#### Scenario: Two header rows

- **WHEN** the manual-test category holds the columns `1st test` and `2nd test`
- **THEN** one heading `Manual tests` with its `+` spans both, and below it each column shows its name, date and maximum

#### Scenario: A column for an earlier date

- **WHEN** a manual-test column dated 2026-10-20 is added after one dated 2026-11-03
- **THEN** it stands left of the 2026-11-03 column, within the manual-test group

#### Scenario: Short tests beside the manual tests

- **WHEN** a course has columns in every category
- **THEN** the short-test group stands right of the manual-test group and left of the presentation group, and the project group stands right of the presentation group and left of the participation group

### Requirement: Short tests count with a weight of their own

Short tests SHALL be a category of their own with their own weight on a course's config sheet, beside online tests, manual tests, presentations, projects, participation and homework. The seven weights SHALL add up to 100 %. The short-test category SHALL enter a semester's proposal like every other category: as the mean of its results, weighted by its weight, and left out with the remaining weights scaled up while it has no result. A new course SHALL start with 20 % for each of online tests, manual tests, short tests, participation and homework, and 0 % for presentations and projects. A course that existed before short tests SHALL get a short-test weight of 0 %, keeping its other weights, so that none of its proposals changes until a teacher changes its weights.

#### Scenario: A quiz weighs less than a test

- **WHEN** the weights are manual tests 60 % and short tests 40 %, the others 0 %, a student has 12/24 in one manual-test column and 6/6 in one short-test column
- **THEN** the student's fraction is 0.6 × 0.5 + 0.4 × 1 = 0.7

#### Scenario: A course from before

- **WHEN** a course had the weights 40/30/15/15 before short tests existed
- **THEN** its config sheet shows online tests 40 %, manual tests 30 %, short tests 0 %, presentations 0 %, projects 0 %, participation 15 %, homework 15 %, and every proposal is what it was

#### Scenario: A new course

- **WHEN** a teacher creates a course without setting weights
- **THEN** online tests, manual tests, short tests, participation and homework have 20 % each, and presentations and projects 0 %

## ADDED Requirements

### Requirement: A category weighted 0 % is not in use and is hidden

A category whose weight on the config sheet is 0 % SHALL be treated as not in use. Its column group, its heading and its `+` SHALL be absent from the sheet. Its category line SHALL be absent from a student's record for teachers. Its entries and its category line SHALL be absent from the student's own results. A category not in use SHALL count in no proposal. The config sheet SHALL keep showing every category with its weight, so that a teacher can bring a hidden category back. For a category at 0 % that holds columns, it SHALL say how many columns are hidden. Columns and results of a category not in use SHALL stay stored unchanged. When its weight rises above 0 % they SHALL show and count again as they were. Weights SHALL be changeable at any time of the school year, as long as the year is not closed, and every view SHALL follow a change the next time it is shown.

#### Scenario: Not using homework

- **WHEN** a teacher sets homework to 0 % and raises participation by the same amount
- **THEN** the sheet shows no homework group and no homework `+`, and neither the student's record nor the student's own results show a homework line

#### Scenario: Bringing a category back mid-semester

- **WHEN** a course held two homework columns with results, a teacher set homework to 0 % in October and sets it to 10 % again in December
- **THEN** both columns and every result in them show again as they were, and from then on they count in the proposals with 10 %

#### Scenario: Results of a hidden category do not count

- **WHEN** homework is 0 % and a student has 0/10 in a homework column
- **THEN** the student's proposal is the same as without that result

### Requirement: Presentations count with a grade each

Presentations SHALL be a category of their own with their own weight on the config sheet. A course SHALL be able to hold any number of presentation columns. A presentation column SHALL have a name and a date and no maximum. Each student's field in it SHALL take a whole grade from 1 to 5, and SHALL show the grade as entered. The field SHALL be saved, marked and moved through with the arrow keys like every other result field.

#### Scenario: Grading a presentation

- **WHEN** a teacher types 2 into a student's field of the presentation column `Referat Git`
- **THEN** the field is saved and shows 2, and the student's presentations category counts it as the middle of grade 2's band

#### Scenario: Several presentations in a year

- **WHEN** a course holds the presentation columns `Referat Git` in November and `Referat Docker` in March
- **THEN** the winter sheet shows `Referat Git` in the presentation group and the summer sheet shows `Referat Docker`, each counting in its own semester

### Requirement: A project has an end grade and `+`/`−` columns for the record

Projects SHALL be a category of their own with their own weight on the config sheet. A course SHALL be able to hold any number of projects. A project SHALL have a name and a date, and SHALL be a column taking each student's end grade: a whole grade from 1 to 5, entered by the teacher. A project SHALL be able to hold any number of `+`/`−` columns, each with a name and a date in the school year. A student's field in one SHALL take `+` or `−` like a participation field. The marks SHALL be for the record only: they SHALL enter no category and no proposal, and SHALL not change the end grade.

In the sheet each project SHALL be a group within the projects category, headed by the project's name. Below the heading come its `+`/`−` columns ordered by date, and then its end-grade column, furthest right. The project's heading SHALL hold a `+` that adds a `+`/`−` column to that project. The project's date SHALL decide the semester of its end grade and the semester's sheet in which the project appears with all of its `+`/`−` columns, whatever their own dates. Choosing a project's heading SHALL open the dialog for its name and date. That dialog SHALL offer to delete the project. Deleting a project SHALL remove its `+`/`−` columns and every result in the project, and SHALL ask for confirmation first when there is any.

#### Scenario: Notes during a project

- **WHEN** a teacher adds the project `Webshop` dated 2027-01-20, then uses the project's `+` twice and marks a student `+` and then `−`
- **THEN** the project group `Webshop` shows two `+`/`−` columns followed by its end-grade column, and the student's proposal is unchanged

#### Scenario: Entering the end grade

- **WHEN** the project `Webshop` is over and the teacher types 1 into a student's end-grade field
- **THEN** the student's projects category counts the grade 1, and the marks still count nowhere

#### Scenario: Marks dated before the project's semester

- **WHEN** the project `Webshop` is dated 2027-03-01, in the summer semester, and one of its `+`/`−` columns is dated 2027-01-15
- **THEN** that column appears in the summer sheet within `Webshop`, and the winter sheet shows nothing of `Webshop`

#### Scenario: Deleting a project

- **WHEN** a teacher deletes the project `Webshop`, which holds two `+`/`−` columns with marks and some end grades
- **THEN** the dialog asks for confirmation first, and afterwards the project, its `+`/`−` columns and all their results are gone
