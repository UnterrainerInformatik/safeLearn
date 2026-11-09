# gradebook Specification

## Purpose
Defines how a course's results are recorded, how a semester grade is proposed from them, how a teacher overrides that proposal, and what teachers and students see of it.

## Requirements

### Requirement: One global grading scale maps a fraction to a grade

The module SHALL hold one grading scale for all courses, given as thresholds in percent. Its initial thresholds SHALL be: at least 88 % → 1, at least 75 % → 2, at least 63 % → 3, at least 50 % → 4, below → 5. A result exactly on a threshold SHALL receive the better grade. Only a teacher SHALL be able to change the thresholds, and a change SHALL apply to every proposal from then on.

#### Scenario: On the threshold

- **WHEN** a student's fraction is exactly 0.75
- **THEN** the scale maps it to grade 2

#### Scenario: Just below

- **WHEN** a student's fraction is 0.7499
- **THEN** the scale maps it to grade 3

### Requirement: Results are stored as fractions between 0 and 1

Every result the gradebook holds — an online test, a manually entered test, a participation grade, a homework, a presentation, a project's end grade — SHALL be computed as a fraction from 0 to 1. Points SHALL be derived from fractions for display and never stored in their place. A result entered as a grade - a participation result, a presentation or a project's end grade - SHALL keep the grade as entered, and its fraction SHALL be the middle of that grade's band on the grading scale as it is now: from the grade's own threshold up to the next better grade's, or up to 100 % for a 1. A change of the scale SHALL therefore move the fraction of every grade result with it, as it moves the band midpoint of an override (`year-grade`). Every online test SHALL count the same, whatever its number of questions.

#### Scenario: Tests of different length

- **WHEN** a student scores 3 of 4 in one online test and 9 of 12 in another
- **THEN** both count as 0.75 and weigh equally in the online-test category

#### Scenario: A presentation graded 2

- **WHEN** the scale is 88/75/63/50 and a student's presentation is graded 2
- **THEN** the result counts as 0.815, the middle of 75 % and 88 %, and is shown as the grade 2

#### Scenario: A participation check graded 1

- **WHEN** the scale is 88/75/63/50 and a student's participation check is graded 1
- **THEN** the result counts as 0.94, the middle of 88 % and 100 %, and is shown as the grade 1

#### Scenario: The scale changes under a grade

- **WHEN** a presentation is graded 2 and a teacher moves grade 2's threshold from 75 % to 77 %
- **THEN** the result counts as 0.825 from then on, and is still shown as the grade 2

### Requirement: Teachers enter manual results per student

A teacher SHALL be able to record, for a student of a course, a manual result of the kind `test`, `shorttest`, `plusminus`, `homework`, `presentation`, `project` or `projectmark`. A manual result SHALL be a result in one of the course's columns (`gradebook-sheet`): the column carries the kind, the name, the date and, for a test, a short test or a homework, an optional maximum, and a student has at most one result per column. A `test`, `shorttest` or `homework` result SHALL take its value as points out of the column's maximum, converted to a fraction, or as a percentage where the column has no maximum. A `plusminus` (participation), `presentation` or `project` result SHALL be a whole grade from 1 to 5. A `projectmark` result SHALL be either `+` (1) or `−` (0). A participation result MAY be given as one of the shortcuts `+`, `o` or `−` (also typed as `-`), which SHALL be recorded as the grade 1, 3 or 5 respectively; it is stored and shown as that grade, not as the shortcut. Results and columns SHALL be editable and deletable by any teacher.

#### Scenario: A participation mark

- **WHEN** a teacher records the grade 2 for a student in a participation column dated 2026-11-03
- **THEN** the student's participation category contains a result on that date, shown as the grade 2 and worth the middle of grade 2's band

#### Scenario: Shortcuts for a participation grade

- **WHEN** a teacher records `+`, `o` and `-` for three students in a participation column
- **THEN** the three results are the grades 1, 3 and 5, shown as 1, 3 and 5, each worth the middle of its grade's band

#### Scenario: Anything else is refused

- **WHEN** a teacher records `++`, `x` or 0 in a participation column
- **THEN** it is refused as neither a grade from 1 to 5 nor `+`, `o` or `−`, and the student's result in that column stays as it was

#### Scenario: A project's mark is still + or −

- **WHEN** a teacher records `+` for a student in a project's mark column
- **THEN** it is stored as `+` and counts in no category, as before

#### Scenario: A paper test in points

- **WHEN** a teacher records 17 points for a student in a test column out of 24
- **THEN** the result is stored as 17/24 and shown as 17/24 with its grade from the scale

#### Scenario: A grade out of range

- **WHEN** a teacher types 6, or 2.5, into a presentation's or a participation column's field
- **THEN** the field refuses it and the student's result in that column stays as it was

### Requirement: The semester proposal is the scale applied to the weighted mean of category fractions

For each student of a course and each semester, the gradebook SHALL compute one fraction per category (online tests, manual tests, short tests, presentations, projects, participation, homework) as the mean of that category's entries, then the mean of those category fractions weighted by the course's config sheet, and SHALL map the result through the grading scale. The projects category SHALL take only the projects' end grades as its entries; a project's `+`/`−` marks SHALL count in no category. A category without entries, and a category weighted 0 %, SHALL be left out and the remaining weights SHALL be renormalized. A student without any entry that counts SHALL have no proposal. The winter-semester proposal SHALL use the entries dated in the winter semester. The summer-semester proposal is the grade for the whole year; how it combines the winter semester's result with the summer semester's own entries is defined by `year-grade`.

#### Scenario: All categories present

- **WHEN** the weights are 40/30/0/0/0/15/15 and the fractions of online tests, manual tests, participation and homework are 0.80, 0.70, 0.90, 1.00
- **THEN** the weighted mean is 0.815 and the proposal is grade 2

#### Scenario: A category is empty

- **WHEN** the weights are 40/30/0/0/0/15/15 and the student has no short-test and no homework entry
- **THEN** the proposal is computed from the other three categories with their weights scaled to sum to 100 %

#### Scenario: Two presentations

- **WHEN** the scale is 88/75/63/50, the weights give presentations 100 %, and a student's two presentations are graded 1 and 3
- **THEN** the presentations category is (0.94 + 0.69) / 2 = 0.815 and the proposal is grade 2

#### Scenario: Project marks do not count

- **WHEN** a project's end grade for a student is 2, and the same project holds three `−` marks for that student
- **THEN** the projects category for that student is 0.815, as without the marks

#### Scenario: A project without an end grade yet

- **WHEN** a project holds `+`/`−` marks for a student but no end grade
- **THEN** the student has no entry in the projects category, and the category is left out of their proposal

#### Scenario: The proposal follows new entries

- **WHEN** a teacher adds an entry for a student
- **THEN** the student's proposal reflects it the next time any page shows it

### Requirement: An override replaces the proposal without erasing it

A teacher SHALL be able to set an override grade and a free-text comment for a student's semester. The proposal SHALL continue to be computed and shown to teachers beside the override. Removing the override SHALL make the proposal the effective grade again.

#### Scenario: Override set

- **WHEN** the proposal is 3 and a teacher sets an override of 2 with the comment "strong oral exam"
- **THEN** the effective grade is 2, and teachers see proposal 3, override 2 and the comment

### Requirement: Teachers see a course overview

A teacher SHALL be able to open a course's overview: one row per student on the roster, showing each category's fraction and grade, the proposal, the override if any, and the effective grade, for a chosen semester. Students who have left the roster SHALL be shown separately.

#### Scenario: Overview of a class

- **WHEN** a teacher opens the overview of `WMC 4BHIF 2026/27` for WS
- **THEN** every student on the roster appears once with their WS values

### Requirement: A student sees their own results live, and only their own

A student SHALL be able to see, for each of their courses, their own entries, category fractions and effective grade, except for the entries and categories of a category weighted 0 % (`gradebook-sheet`). Each entry SHALL show the note a teacher set in its cell, where there is one, and a column holding only a note for the student SHALL be shown as defined by `gradebook-sheet`. Notes of a category weighted 0 % SHALL be hidden with its entries. A project's `+`/`−` marks SHALL be shown under their project, marked as not counting. The entry of an online test SHALL link to the review of the attempt once that review is open to the student (`exam-attempt-review`). While no override exists the student SHALL see the proposal. Once one exists, the student SHALL see the override and SHALL NOT see the proposal. The teacher's comment SHALL be shown only if the teacher marks it as visible to the student. A student SHALL NOT be able to see any other student's data by any request, their notes included.

#### Scenario: Override appears

- **WHEN** a teacher sets an override for a student's semester
- **THEN** that student's page shows the override grade the next time it is loaded, and no longer shows the proposal

#### Scenario: Asking for someone else

- **WHEN** a student requests the results of another student through the module API
- **THEN** the request is refused

#### Scenario: A project with its marks

- **WHEN** a student has the end grade 2 and the marks `+`, `+`, `−` in the project `Webshop`
- **THEN** their results show `Webshop` with the grade 2, and below it the three marks with their dates, marked as for the record only

#### Scenario: A note appears

- **WHEN** a teacher sets a note in a student's cell of the presentation column `Referat Git`
- **THEN** that student's page shows the note beside the presentation's grade the next time it is loaded

#### Scenario: A note in a hidden category

- **WHEN** a student has a note in a homework column and the course's homework weight is set to 0 %
- **THEN** the student's page shows neither the homework column nor its note, and shows both again once the weight is above 0 %

#### Scenario: An online test to look back at

- **WHEN** the sitting of a student's online test `HTTP caching` is over
- **THEN** the student's row of `HTTP caching` links to the review of their attempt

### Requirement: The grading scale shows the grade colours

The grading scale's table SHALL colour its rows with the grade colours of the gradebook (`gradebook-sheet`): the rows of grades 1 and 2 green, the row of grade 5 red, and the rows of grades 3 and 4 neutral. The scale thereby shows which grades the colours stand for wherever else they appear. The colours SHALL NOT depend on the thresholds entered.

#### Scenario: The scale's rows

- **WHEN** a teacher opens the grading scale
- **THEN** the rows for 1 and 2 are green, the row for 5 is red, and the rows for 3 and 4 are not coloured

### Requirement: A teacher sees the notes on a student's page

A teacher's page of one student in a course SHALL show, beside each result, the note of its cell, and SHALL list the columns in which the student has a note but no result, with the note and no result. The page SHALL show the notes as text; they are written in the sheet.

#### Scenario: Going through the class

- **WHEN** a teacher opens the page of a student who has the note "You forgot GreetingService.java (-1)" in the homework column `Greeting service`
- **THEN** the page shows that note beside the student's result in `Greeting service`
