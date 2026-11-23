## MODIFIED Requirements

### Requirement: A student reviews an attempt once its sitting is over

A student SHALL be able to open the review of their own submitted attempt once the sitting the attempt was written in is over (`online-test`, "A sitting is open until its last attempt is over"): its start window has closed and no attempt in it is still running, or a teacher ended it. From then on the review SHALL stay available as long as the attempt is kept. The teacher SHALL NOT have to release it. Before the sitting is over, every request for the review SHALL be refused, and nothing a student receives SHALL say which answer is correct. A student SHALL NOT be able to review anybody else's attempt; such a request SHALL be answered exactly like a request for an attempt that does not exist. A teacher in student view is treated as a student. A make-up sitting is a sitting of its own: an attempt written in it becomes reviewable when the make-up is over, and an attempt of the first sitting stays reviewable while a make-up is still ahead.

#### Scenario: While the sitting runs

- **WHEN** a student has submitted early and asks for their review while the sitting's start window is still open
- **THEN** the request is refused

#### Scenario: A classmate is still writing

- **WHEN** a student submitted at 10:20, the start window closed at 10:15, and a classmate's attempt runs until 10:34
- **THEN** the student's request for their review at 10:25 is refused, and the same request at 10:35 is answered

#### Scenario: After the sitting

- **WHEN** the sitting's start window has closed and no attempt in it is still running
- **THEN** the student can open the review of their attempt, and can still do so a month later

#### Scenario: Ended by the teacher

- **WHEN** a teacher ends a sitting while attempts are still running
- **THEN** its students can open their reviews right away

#### Scenario: A make-up still to come

- **WHEN** the first sitting of a test is over and a make-up for one student is scheduled for next week
- **THEN** the students of the first sitting can open their reviews, and the make-up student cannot open one until their make-up is over

#### Scenario: Someone else's attempt

- **WHEN** a student requests the review of a classmate's attempt
- **THEN** the request is refused the same way as a request for an attempt that does not exist
