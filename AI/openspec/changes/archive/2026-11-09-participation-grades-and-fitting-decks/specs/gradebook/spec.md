## MODIFIED Requirements

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
