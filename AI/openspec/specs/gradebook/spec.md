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

Every result the gradebook holds — an online test, a manually entered test, a participation mark, a homework — SHALL be stored and computed as a fraction from 0 to 1. Points and grades SHALL be derived from fractions for display and never stored in their place. Every online test SHALL count the same, whatever its number of questions.

#### Scenario: Tests of different length

- **WHEN** a student scores 3 of 4 in one online test and 9 of 12 in another
- **THEN** both count as 0.75 and weigh equally in the online-test category

### Requirement: Teachers enter manual results per student

A teacher SHALL be able to record, for a student of a course, a manual result of the kind `test`, `plusminus` or `homework`. A manual result SHALL be a result in one of the course's columns (`gradebook-sheet`, change `exam-navigation-and-grid`): the column carries the kind, the name, the date and, for a test or homework, an optional maximum, and a student has at most one result per column. A `test` or `homework` result SHALL take its value as points out of the column's maximum, converted to a fraction, or as a percentage where the column has no maximum. A `plusminus` result SHALL be either `+` (1) or `−` (0). Results and columns SHALL be editable and deletable by any teacher.

#### Scenario: A participation mark

- **WHEN** a teacher records `+` for a student in a participation column dated 2026-11-03
- **THEN** the student's participation category contains a result worth 1 on that date

#### Scenario: A paper test in points

- **WHEN** a teacher records 17 points for a student in a test column out of 24
- **THEN** the result is stored as 17/24 and shown as 17/24 with its grade from the scale

### Requirement: The semester proposal is the scale applied to the weighted mean of category fractions

For each student of a course and each semester, the gradebook SHALL compute one fraction per category (online tests, manual tests, short tests, participation, homework) as the mean of that category's entries, then the mean of those category fractions weighted by the course's config sheet, and SHALL map the result through the grading scale. A category without entries SHALL be left out and the remaining weights SHALL be renormalized. A student without any entry SHALL have no proposal. The winter-semester proposal SHALL use the entries dated in the winter semester. The summer-semester proposal is the grade for the whole year; how it combines the winter semester's result with the summer semester's own entries is defined by `year-grade` (change `exam-navigation-and-grid`).

#### Scenario: All categories present

- **WHEN** the weights are 40/30/0/15/15 and the fractions of online tests, manual tests, participation and homework are 0.80, 0.70, 0.90, 1.00
- **THEN** the weighted mean is 0.815 and the proposal is grade 2

#### Scenario: A category is empty

- **WHEN** the weights are 40/30/0/15/15 and the student has no short-test and no homework entry
- **THEN** the proposal is computed from the other three categories with their weights scaled to sum to 100 %

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

A student SHALL be able to see, for each of their courses, their own entries, category fractions and effective grade. While no override exists the student SHALL see the proposal. Once one exists, the student SHALL see the override and SHALL NOT see the proposal. The teacher's comment SHALL be shown only if the teacher marks it as visible to the student. A student SHALL NOT be able to see any other student's data by any request.

#### Scenario: Override appears

- **WHEN** a teacher sets an override for a student's semester
- **THEN** that student's page shows the override grade the next time it is loaded, and no longer shows the proposal

#### Scenario: Asking for someone else

- **WHEN** a student requests the results of another student through the module API
- **THEN** the request is refused
