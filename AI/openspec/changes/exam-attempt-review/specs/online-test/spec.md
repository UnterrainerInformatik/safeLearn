## MODIFIED Requirements

### Requirement: Questions and answers are shuffled per student, and nothing on the client reveals correctness

The order of questions and the order of answers within each question SHALL be shuffled per attempt on the server. The client SHALL receive the question text and the answer texts in that order, each answer identified by a random token valid for this attempt only. No response to a student SHALL contain correct flags, the original answer order, or anything from which either can be derived while the sitting of their attempt is open, before or after their submission. The one exception is the student's own review of their submitted attempt once its sitting is over (`exam-attempt-review`). The text stating how many answers are correct SHALL be preserved.

#### Scenario: Two neighbours

- **WHEN** two students write the same test
- **THEN** they see the questions in different orders with high probability, and the same answer carries different tokens for each

#### Scenario: Reading the page

- **WHEN** a student inspects every response the writing page received
- **THEN** none contains which answer is correct

#### Scenario: Submitted early

- **WHEN** a student has submitted while the sitting's window is still open and inspects every response they receive
- **THEN** none contains which answer is correct

### Requirement: Grading is server-side and all-or-nothing

At submission the server SHALL grade each question as 1 if the set of chosen answers equals the set of correct answers and 0 otherwise, and SHALL store the attempt's fraction (points over number of questions). That fraction SHALL be the student's result in the test's column of the online-test category of the course's gradebook (`gradebook-sheet`). The column SHALL be dated by the start of the test's first sitting, which decides its semester, including for results from a later make-up. A participant who never started an attempt SHALL have no result in the column, not a zero. After submission the student SHALL see their points and grade. They SHALL NOT see which answers were correct until the sitting of their attempt is over, and then only in their review (`exam-attempt-review`).

#### Scenario: One correct answer missed

- **WHEN** a `multichoiceset` question has correct answers A and C and the student chose only A
- **THEN** the question scores 0

#### Scenario: After submission

- **WHEN** a student has submitted 3 of 4 correct
- **THEN** they see 3/4 and the grade for 0.75, and no answer is marked correct or wrong

#### Scenario: Into the sheet

- **WHEN** a student's attempt at `HTTP caching`, whose first sitting started on 2026-12-01, is submitted with 3 of 4
- **THEN** the course's sheet shows 0.75 for that student in the online-test column `HTTP caching` dated 2026-12-01, and the winter-semester proposal includes it

#### Scenario: Absent and no make-up

- **WHEN** a participant never opened the test and the sitting is over
- **THEN** their field in the test's column is empty, and their online-test category is computed without it

### Requirement: Tests are not visible after they were written

A test SHALL be hidden from a student once they have submitted or their deadline has passed. Its questions SHALL NOT be retrievable by any student afterwards, except by the attempt's own student in their review once the sitting is over (`exam-attempt-review`). An image of a question SHALL be served to a student only while they have an open attempt whose test contains that question, or while the review of a submitted attempt of theirs showing it is open to them.

#### Scenario: After the sitting

- **WHEN** a student requests a test's questions for writing after their attempt was submitted
- **THEN** the request is refused

#### Scenario: An image during and after the attempt

- **WHEN** a student requests an image of a question in their open attempt, again after submitting while the sitting is still open, and once more after the sitting is over
- **THEN** the first request is served, the second is refused and the third is served
