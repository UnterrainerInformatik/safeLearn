## ADDED Requirements

### Requirement: Each question of an online test carries a weight

Each question of an online test SHALL carry a weight, a whole number from 1 to 10, 1 when chosen. A teacher SHALL set it on the test's page, saved as it changes, and the page SHALL show the test's total weight. A weight SHALL be changeable as long as the test's questions are (`A test can be changed only until it is first written`), and SHALL be part of the snapshot from then on. A value out of range SHALL be refused and the stored value kept. Every test created before weights existed SHALL hold the weight 1 for every question, and its results SHALL stay as they are.

#### Scenario: Weighting before the sitting

- **WHEN** a teacher sets the weight of one of four questions of `HTTP caching` to 3 before its sitting opens
- **THEN** the test's page shows a total weight of 6

#### Scenario: After the first attempt

- **WHEN** a student has started an attempt at `HTTP caching` and a teacher tries to change a weight
- **THEN** it is refused, and the weight stays as it was

#### Scenario: An old test

- **WHEN** a test was written before weights existed, with a student's 3 of 4
- **THEN** each of its questions has the weight 1, and the student still has 3/4

## MODIFIED Requirements

### Requirement: Grading is server-side and all-or-nothing

At submission the server SHALL grade each question as 1 if the set of chosen answers equals the set of correct answers and 0 otherwise. The attempt's points SHALL be the sum of the weights of the questions that scored, out of the test's total weight, and the server SHALL store the attempt's fraction (points over total weight). That fraction SHALL be the student's result in the test's column of the online-test category of the course's gradebook (`gradebook-sheet`). The column SHALL be dated by the start of the test's first sitting, which decides its semester, including for results from a later make-up. A participant who never started an attempt SHALL have no result in the column, not a zero. After submission the student SHALL see their points out of the total weight and their grade. They SHALL NOT see which answers were correct until the sitting of their attempt is over, and then only in their review (`exam-attempt-review`).

#### Scenario: One correct answer missed

- **WHEN** a `multichoiceset` question has correct answers A and C and the student chose only A
- **THEN** the question scores 0

#### Scenario: After submission

- **WHEN** a student has submitted 3 of 4 correct in a test whose questions all weigh 1
- **THEN** they see 3/4 and the grade for 0.75, and no answer is marked correct or wrong

#### Scenario: A weighted question

- **WHEN** a test has four questions weighing 1, 1, 1 and 3, and a student answered only the three questions of weight 1 correctly
- **THEN** they have 3/6, and their result is 0.5

#### Scenario: Into the sheet

- **WHEN** a student's attempt at `HTTP caching`, whose first sitting started on 2026-12-01, is submitted with 3 of 4
- **THEN** the course's sheet shows 0.75 for that student in the online-test column `HTTP caching` dated 2026-12-01, and the winter-semester proposal includes it

#### Scenario: Absent and no make-up

- **WHEN** a participant never opened the test and the sitting is over
- **THEN** their field in the test's column is empty, and their online-test category is computed without it
