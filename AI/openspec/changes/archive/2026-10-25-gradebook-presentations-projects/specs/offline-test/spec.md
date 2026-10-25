## MODIFIED Requirements

### Requirement: A course has offline tests beside its online tests

A teacher SHALL be able to create an offline test for a course, with a name, a duration, and whether it counts as a test or as a short test in the gradebook. The choice SHALL offer only those of the two categories that are in use, weighted above 0 % (`gradebook-sheet`), and SHALL be refused for a category that is not. While neither is in use, the course SHALL offer no new offline test. An offline test SHALL have no questions and SHALL be schedulable without any. Its handouts are optional (`exam-handout`). The course's list of tests SHALL show offline and online tests together, each marked by its kind. Nothing of an offline test SHALL be written, answered or graded through the module.

#### Scenario: Creating a long test

- **WHEN** a teacher creates the offline test `POS Langtest 1` for the course 4AHIF POS with 100 minutes, counted as a test
- **THEN** the course's tests list it as an offline test, and it can be scheduled without any question

#### Scenario: A short test on paper

- **WHEN** a teacher creates an offline test counted as a short test and sets no handout
- **THEN** it is created, and a sitting of it can be started

#### Scenario: Short tests not in use

- **WHEN** a course weighs short tests at 0 % and manual tests above 0 %
- **THEN** the form for a new offline test offers only "counts as a test", and a request to create one counted as a short test is refused
