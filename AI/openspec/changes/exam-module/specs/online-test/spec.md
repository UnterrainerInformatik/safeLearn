## Purpose

Defines the online multiple-choice test from its assembly to its grade: tests, sittings and make-ups, the attempt a student writes, how it is graded and timed, what keeps it from being cheated, and what the teacher sees while it runs.

## ADDED Requirements

### Requirement: A test is assembled by hand and snapshots its questions

A teacher SHALL create a test for a course by choosing questions from the pool. Creating the test SHALL copy every chosen question, with its answers, both languages and correct flags, into the test. Editing or deleting a pool question later SHALL NOT change any existing test or any grade derived from one. Every student SHALL get all of the test's questions.

#### Scenario: A question is edited after the test

- **WHEN** a pool question is edited after a test containing it was written
- **THEN** the test, its attempts and their grades are unchanged

### Requirement: A sitting sets the window and the duration

A test SHALL be written in one or more sittings. A sitting SHALL have a window (from, to), an attempt duration that is shorter than the window, and its participants: the whole roster for the first sitting, or selected students for a make-up. A make-up sitting SHALL use the same duration. A student SHALL see a test only while a sitting they participate in is open, and only until they have submitted.

#### Scenario: Duration longer than the window

- **WHEN** a teacher creates a sitting with a 10-minute window and a 15-minute duration
- **THEN** it is refused

#### Scenario: A make-up

- **WHEN** a teacher creates a make-up sitting for two students who were absent
- **THEN** only those two see the test during its window, with the same duration as the first sitting

### Requirement: One attempt per student and test, resumed on reload

A student SHALL have at most one attempt per test across all sittings. Opening the test SHALL start the attempt and record its start time on the server. Reloading or reopening the page SHALL resume the same attempt with its saved answers and the remaining time, never start a new one.

#### Scenario: Reload during the test

- **WHEN** a student reloads the page three minutes into a 10-minute attempt
- **THEN** the page shows their saved answers and about seven minutes remaining

#### Scenario: A second attempt

- **WHEN** a student who has submitted opens the test again in a make-up sitting they were added to by mistake
- **THEN** no new attempt is started

### Requirement: The server owns the deadline and submits automatically

An attempt's deadline SHALL be the earlier of its start plus the duration and the end of the window. The server SHALL accept answers only before the deadline. Every change of answer SHALL be saved to the server as it is made. When the deadline passes, the attempt SHALL be submitted with the last answers saved before it, whether or not the page is still open, and the test SHALL no longer be shown to the student.

#### Scenario: The page is closed

- **WHEN** a student closes the browser two minutes before the deadline
- **THEN** at the deadline the attempt is submitted with the answers saved before closing

#### Scenario: A late write

- **WHEN** a request to save an answer arrives after the deadline
- **THEN** it is refused and the submitted answers are unchanged

#### Scenario: Started late in the window

- **WHEN** a student starts a 10-minute attempt four minutes before the window closes
- **THEN** the deadline is the end of the window

### Requirement: Questions and answers are shuffled per student, and nothing on the client reveals correctness

The order of questions and the order of answers within each question SHALL be shuffled per attempt on the server. The client SHALL receive the question text and the answer texts in that order, each answer identified by a random token valid for this attempt only. No response to a student before or after submission SHALL contain correct flags, the original answer order, or anything from which either can be derived. The text stating how many answers are correct SHALL be preserved.

#### Scenario: Two neighbours

- **WHEN** two students write the same test
- **THEN** they see the questions in different orders with high probability, and the same answer carries different tokens for each

#### Scenario: Reading the page

- **WHEN** a student inspects every response the writing page received
- **THEN** none contains which answer is correct

### Requirement: Grading is server-side and all-or-nothing

At submission the server SHALL grade each question as 1 if the set of chosen answers equals the set of correct answers and 0 otherwise, and SHALL store the attempt's fraction (points over number of questions) as an online-test result in the course's gradebook. After submission the student SHALL see their points and grade and SHALL NOT see which answers were correct.

#### Scenario: One correct answer missed

- **WHEN** a `multichoiceset` question has correct answers A and C and the student chose only A
- **THEN** the question scores 0

#### Scenario: After submission

- **WHEN** a student has submitted 3 of 4 correct
- **THEN** they see 3/4 and the grade for 0.75, and no answer is marked correct or wrong

### Requirement: An attempt is bound to the device that started it

An attempt SHALL be bound to the browser that started it. A request for the same attempt from another browser SHALL be refused and shown to the teacher, until the teacher releases the attempt to a new browser in the live view. A restart of the server SHALL NOT, by itself, lock a student out of their own attempt.

#### Scenario: Someone at home logs in as the student

- **WHEN** a student is writing in class and the same account opens the test on another device
- **THEN** the other device is refused, and the live view shows the refused device for that student

#### Scenario: The student's laptop fails

- **WHEN** the teacher releases a student's attempt in the live view
- **THEN** the student can resume it on another device with the saved answers and the remaining time

#### Scenario: Server restart during a sitting

- **WHEN** the server restarts during a sitting and the student logs in again on the same browser
- **THEN** the student resumes their attempt

### Requirement: Leaving the page is recorded and shown, never penalized automatically

While an attempt is open, the page SHALL report to the server each time it loses visibility or focus and when it regains it. The server SHALL keep, per attempt, the number of times and the total time away. These SHALL be shown to teachers and SHALL NOT change the grade.

#### Scenario: Switching to another tab

- **WHEN** a student switches to another tab three times for 47 seconds in total
- **THEN** the live view shows "left 3×, 47 s" for that student and their grade is unaffected

### Requirement: Teachers follow a sitting live

During a sitting a teacher SHALL see, per participant: not started, writing (with remaining time), submitted; focus losses; and refused devices. The view SHALL be pushed to the teacher's browser as changes happen, over a stream that requires the teacher's authenticated session and is separate from the unauthenticated hot-reload channel. Exam data SHALL NOT be sent over the hot-reload channel. The stream SHALL be re-checked against the session while it is open and SHALL end when the session no longer acts as a teacher. When the stream cannot be kept open, the view SHALL keep updating by fetching snapshots, without reloading the page.

#### Scenario: A student submits

- **WHEN** a student submits during the sitting
- **THEN** the live view shows them as submitted within a few seconds, without the teacher's page asking for it

#### Scenario: The stream without a teacher session

- **WHEN** a request without a session, or from a student's session, opens a sitting's event stream
- **THEN** it is refused and no event is sent

#### Scenario: The hot-reload channel carries no exam data

- **WHEN** a sitting is running and a client is connected to the hot-reload channel
- **THEN** no message on that channel contains any data about the sitting or its attempts

#### Scenario: The teacher switches to student view during a sitting

- **WHEN** a teacher with an open live view switches to student view
- **THEN** the stream ends and the live view says that the student view is active

#### Scenario: The stream drops

- **WHEN** the stream cannot be re-established
- **THEN** the live view continues to update from snapshots and resumes the stream once it is available again

### Requirement: Tests are not visible after they were written

A test SHALL be hidden from a student once they have submitted or their deadline has passed. Its questions SHALL NOT be retrievable by any student afterwards.

#### Scenario: After the sitting

- **WHEN** a student requests a test's questions after their attempt was submitted
- **THEN** the request is refused
