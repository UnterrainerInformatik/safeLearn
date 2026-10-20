# board-solution Specification

## Purpose
Defines the teacher-only presentation of a written test's solution, shown on the board in the lesson after the test.

## Requirements

### Requirement: A teacher presents a test's solution as a deck

A teacher SHALL be able to open a written test as a presentation in the presentation view: one question per slide in the test's original order and the course's language, with the correct answers marked, and for each question the share of attempts that answered it correctly. The deck SHALL show no student's name or individual answer.

#### Scenario: Presenting

- **WHEN** a teacher opens the solution of a test written by 24 students, 18 of whom answered question 2 correctly
- **THEN** the slide for question 2 marks its correct answers and shows 75 %

#### Scenario: A test nobody has written yet

- **WHEN** a teacher opens the solution of a test without any submitted attempt
- **THEN** the slides show the correct answers and no share

### Requirement: The solution is never available to students

The solution deck and every request it makes SHALL be refused to any session without the teacher or admin role, including a teacher in student view, who is treated as a student like everywhere in the module.

#### Scenario: A student opens the solution URL

- **WHEN** a student requests the solution deck of a test they wrote
- **THEN** the request is refused
