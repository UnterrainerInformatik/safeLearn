# exam-attempt-review Specification

## Purpose
Defines the review of a submitted online-test attempt: the page on which a student looks back at what they chose and what would have been correct, and on which a teacher sees the same for grading.

## Requirements

### Requirement: The review shows every question with every answer, marked chosen and correct

The review of a submitted attempt SHALL show the test's name, the attempt's points out of its number of questions, and its grade. It SHALL show every question of the attempt in the order the attempt presented them, numbered from 1, in the course's language, with every answer of each question in the order the attempt presented them. Each answer SHALL be marked whether the student chose it and whether it is correct. Correct and wrong answers SHALL be coded like the board solution: a correct answer highlighted with ✓, a wrong one dimmed with ✗, each mark also given as text for assistive technology. Each question SHALL be marked whether it scored, by the rule that grades the attempt. Question texts, answer texts and images SHALL be those of the test's snapshot. A question removed from the written test SHALL NOT be shown.

#### Scenario: One correct answer missed

- **WHEN** a student reviews an attempt in which a `multichoiceset` question had correct answers A and C and they chose only A
- **THEN** the review shows A as chosen and correct, C as not chosen and correct, every other answer as wrong, and the question as not scored

#### Scenario: The student's own order

- **WHEN** a student saw question "Was cacht ein CDN?" as their question 3 while writing
- **THEN** their review shows it as question 3, its answers in the order they saw them

#### Scenario: Points and grade

- **WHEN** a student reviews an attempt with 3 of 4 questions correct
- **THEN** the review shows 3/4 and the grade the scale gives 0.75

### Requirement: A student reviews an attempt once its sitting is over

A student SHALL be able to open the review of their own submitted attempt once the sitting the attempt was written in is over: its window has closed or a teacher ended it. From then on the review SHALL stay available as long as the attempt is kept. The teacher SHALL NOT have to release it. Before the sitting is over, every request for the review SHALL be refused, and nothing a student receives SHALL say which answer is correct. A student SHALL NOT be able to review anybody else's attempt; such a request SHALL be answered exactly like a request for an attempt that does not exist. A teacher in student view is treated as a student. A make-up sitting is a sitting of its own: an attempt written in it becomes reviewable when the make-up is over, and an attempt of the first sitting stays reviewable while a make-up is still ahead.

#### Scenario: While the sitting runs

- **WHEN** a student has submitted early and asks for their review while the sitting's window is still open
- **THEN** the request is refused

#### Scenario: After the sitting

- **WHEN** the sitting's window has closed
- **THEN** the student can open the review of their attempt, and can still do so a month later

#### Scenario: Ended by the teacher

- **WHEN** a teacher ends a sitting before its window closes
- **THEN** its students can open their reviews right away

#### Scenario: A make-up still to come

- **WHEN** the first sitting of a test is over and a make-up for one student is scheduled for next week
- **THEN** the students of the first sitting can open their reviews, and the make-up student cannot open one until their make-up is over

#### Scenario: Someone else's attempt

- **WHEN** a student requests the review of a classmate's attempt
- **THEN** the request is refused the same way as a request for an attempt that does not exist

### Requirement: The student opens the review from their own results

In the student's own results, the row of an online test SHALL offer a link to the review of that attempt once the review is open to the student, and SHALL offer none before. The review SHALL be a page of its own without the teacher's bar, reachable again by its address, with a way back to the student's results.

#### Scenario: The link appears

- **WHEN** a student opens their results before and after the sitting of their online test `HTTP caching` is over
- **THEN** the row of `HTTP caching` has no review link the first time and has one the second time

### Requirement: A teacher sees the review on the student's page

On a student's page in a course, the row of an online test SHALL offer a link to the review of that student's attempt as soon as the attempt is submitted, whether or not the sitting is over. The teacher's review SHALL show the same as the student's and SHALL be refused to any session without the teacher or admin role.

#### Scenario: Grading with the review

- **WHEN** a teacher opens the page of a student who has submitted `HTTP caching`
- **THEN** the row of `HTTP caching` links to the review, which shows the same questions, marks and order as the student's

#### Scenario: A student at the teacher's address

- **WHEN** a student requests the teacher's review of their own attempt
- **THEN** the request is refused

### Requirement: The review serves the images of its questions

An image of a question in a reviewed attempt SHALL be served to the attempt's student while the review is open to them. It SHALL be refused to them before the sitting is over and to every other student.

#### Scenario: An image in the review

- **WHEN** a student requests an image of a question in their attempt after submitting, once while the sitting is still open and once after it is over
- **THEN** the first request is refused and the second is served

### Requirement: The review lasts as long as the attempt

The review SHALL be available exactly as long as the attempt is kept. When the attempt is deleted, by an admin, by rescheduling its sitting or by the retention purge of a student who has left, its review SHALL be gone with it, and its row SHALL no longer offer a link.

#### Scenario: After the purge

- **WHEN** a leaver's records are purged after the retention period
- **THEN** no review of their attempts can be requested any more
