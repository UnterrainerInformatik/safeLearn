## MODIFIED Requirements

### Requirement: Online tests are read-only columns of their category

Every online test of a course SHALL be a column of the online-test category of the course's sheet, named by the test and dated by the start of its first sitting, ordered among the category's columns like any other column. A test without any sitting SHALL have no column yet. The column's fields SHALL show each participant's submitted result as points out of the test's total weight, and SHALL NOT be editable in the sheet: a result of an online test is changed only by the test itself. The date in the column's header SHALL link to the test. The arrow keys SHALL pass over the column's fields to the next editable field. Deleting a test's column from the sheet SHALL NOT be offered.

#### Scenario: A test written by the class

- **WHEN** the test `HTTP caching` with 4 questions, each weighing 1, had its first sitting on 2026-12-01 and a student submitted 3 correct
- **THEN** the online-test group shows a column dated 2026-12-01 whose details on hover name `HTTP caching`, its date links to the test, and that student's field shows 3/4 and cannot be typed into

#### Scenario: A weighted test

- **WHEN** the questions of `HTTP caching` weigh 1, 1, 1 and 3 and a student scored on the three of weight 1
- **THEN** that student's field shows 3/6

#### Scenario: Moving across an online-test column

- **WHEN** the focus is in the last manual column left of an online-test column and the teacher presses the right arrow at the end of the field's text
- **THEN** the focus moves to the next editable field to the right, past the online-test column

#### Scenario: A test only assembled

- **WHEN** a test exists but no sitting has been scheduled for it
- **THEN** the sheet shows no column for it

## ADDED Requirements

### Requirement: The column of an offline test with questions is computed and read-only

The column of an offline test with questions SHALL show each student's result as a percentage, computed from the correction table (`offline-test-questions`), and SHALL NOT be editable in the sheet. A student whose grades are not complete SHALL have an empty field. The arrow keys SHALL pass over the column's fields as over an online test's. The column's header SHALL link to the test, and its dialog SHALL offer the way to the correction table. The column's name, date and maximum SHALL follow the test, and its dialog SHALL NOT offer to change the maximum or to delete the column. Notes on its fields SHALL work as on any column.

#### Scenario: A computed field

- **WHEN** a student of `Quickie REST` has a complete row with the result 70.5 %
- **THEN** their field in the short-test column shows 70.5 % and cannot be typed into

#### Scenario: From the header to the grading

- **WHEN** a teacher opens the dialog of the column of `Quickie REST`
- **THEN** it offers the way to the test's correction table, and no field for a maximum and no delete
