## ADDED Requirements

### Requirement: Online tests are read-only columns of their category

Every online test of a course SHALL be a column of the online-test category of the course's sheet, named by the test and dated by the start of its first sitting, ordered among the category's columns like any other column. A test without any sitting SHALL have no column yet. The column's fields SHALL show each participant's submitted result as points out of the number of questions, and SHALL NOT be editable in the sheet: a result of an online test is changed only by the test itself. The column's header SHALL link to the test. The arrow keys SHALL pass over the column's fields to the next editable field. Deleting a test's column from the sheet SHALL NOT be offered.

#### Scenario: A test written by the class

- **WHEN** the test `HTTP caching` with 4 questions had its first sitting on 2026-12-01 and a student submitted 3 correct
- **THEN** the online-test group shows a column `HTTP caching`, dated 2026-12-01, and that student's field shows 3/4 and cannot be typed into

#### Scenario: Moving across an online-test column

- **WHEN** the focus is in the last manual column left of an online-test column and the teacher presses the right arrow at the end of the field's text
- **THEN** the focus moves to the next editable field to the right, past the online-test column

#### Scenario: A test only assembled

- **WHEN** a test exists but no sitting has been scheduled for it
- **THEN** the sheet shows no column for it
