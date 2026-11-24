## MODIFIED Requirements

### Requirement: A course has offline tests beside its online tests

A teacher SHALL be able to create an offline test for a course, with a name, a duration, and whether it counts as a test or as a short test in the gradebook. The test's duration SHALL be the duration proposed for its first sitting; each sitting SHALL carry a duration of its own (see "An offline sitting opens only when the teacher starts it"). Changing the test's duration SHALL NOT change the duration of a sitting already planned. The choice SHALL offer only those of the two categories that are in use, weighted above 0 % (`gradebook-sheet`), and SHALL be refused for a category that is not. While neither is in use, the course SHALL offer no new offline test. An offline test SHALL have either handouts or questions from the pool, never both (`offline-test-questions`). An offline test without questions SHALL be schedulable. Its handouts are optional (`exam-handout`). The course's list of tests SHALL show offline and online tests together, each marked by its kind. Nothing of an offline test SHALL be written or answered through the module. Only the questions of an offline test with questions SHALL be graded through it, by a teacher (`offline-test-questions`).

#### Scenario: Creating a long test

- **WHEN** a teacher creates the offline test `POS Langtest 1` for the course 4AHIF POS with 100 minutes, counted as a test
- **THEN** the course's tests list it as an offline test, and it can be scheduled without any question

#### Scenario: A short test on paper

- **WHEN** a teacher creates an offline test counted as a short test and sets no handout
- **THEN** it is created, and a sitting of it can be started

#### Scenario: Short tests not in use

- **WHEN** a course weighs short tests at 0 % and manual tests above 0 %
- **THEN** the form for a new offline test offers only "counts as a test", and a request to create one counted as a short test is refused

#### Scenario: Created from the pool

- **WHEN** a teacher creates an offline test from three pool questions in the question browser
- **THEN** the course's tests list it as an offline test, and it has no handout

#### Scenario: Changing the test's duration after planning

- **WHEN** a teacher changes the duration of an offline test from 100 to 90 minutes while its first sitting is planned with 160 minutes
- **THEN** the sitting keeps its 160 minutes, and a new first sitting would be proposed with 90

### Requirement: An offline sitting opens only when the teacher starts it

A sitting of an offline test SHALL carry a planned date and time, a duration of its own in whole minutes from 1 to 600, and its participants, the roster's students who have not left. Its planned end SHALL be its planned start plus its duration. A new first sitting SHALL propose the test's duration; a make-up SHALL propose the duration of the test's first sitting. Before the start a teacher SHALL be able to change the duration together with the planned time. It SHALL NOT open at its planned time on its own. It SHALL open when a teacher presses its start button, and its window SHALL then run from that moment for the sitting's duration. A sitting stored before sittings had durations of their own SHALL keep the duration it was stored with. The window SHALL be shared by all its participants; an offline sitting SHALL have no start window and no deadline of its own per participant (`online-test`). Starting SHALL be refused while one of the test's handouts does not resolve, or while a variable of one of its handouts has no value (`exam-handout`). Before the start the sitting SHALL be shown as planned, and a teacher SHALL be able to change its planned time, its duration and its participants. A started sitting SHALL be extended and ended for all its participants together (`exam-record-maintenance`): extending SHALL close its shared window that many minutes later, and ending SHALL close it now. There SHALL be no extension for a single participant, and the two separate extensions of an online sitting SHALL NOT be offered. An end that is not later than the moment the window opened SHALL be refused with a message, and SHALL leave the sitting as it was.

#### Scenario: The planned time passes

- **WHEN** an offline sitting is planned for 08:00 and nobody presses start
- **THEN** at 08:05 it is still not open, and no participant sees it

#### Scenario: Starting

- **WHEN** a teacher presses start at 08:07 on a sitting planned with 100 minutes
- **THEN** the window runs from 08:07 to 09:47

#### Scenario: Extending

- **WHEN** a teacher extends a started sitting by 10 minutes
- **THEN** its window closes 10 minutes later for every participant

#### Scenario: One extension only

- **WHEN** a teacher opens the page of a started offline sitting
- **THEN** it offers one way to extend the sitting, not a separate extension of a start window and of the writing time

#### Scenario: A broken handout

- **WHEN** a teacher presses start while a handout of the test shows as unresolved
- **THEN** the sitting does not start, and the teacher is told which handout to choose again or remove

#### Scenario: A handout variable without a value

- **WHEN** a teacher presses start while a handout contains `%%var SUBMISSION_LINK%%` and the test holds no value for it
- **THEN** the sitting does not start, and the teacher is told which variable to fill in

#### Scenario: An end at the moment of the start

- **WHEN** an end of a started sitting arrives at the same moment its window opened
- **THEN** the end is refused with a message saying that a sitting can only be ended after it opened
- **AND** the sitting stays open with its window unchanged, and no error is raised inside the application

#### Scenario: A sitting longer than the test's duration

- **WHEN** an offline test has a duration of 100 minutes and its first sitting is planned with 160 minutes, and a teacher presses start at 10:57
- **THEN** the window runs from 10:57 to 13:37

#### Scenario: An invalid duration

- **WHEN** a request plans an offline sitting with 0 or 601 minutes
- **THEN** it is refused, and nothing is planned

### Requirement: A make-up sitting is offered, never required

A teacher SHALL be able to create a make-up sitting of an offline test. Its participants SHALL NOT be chosen. They SHALL be every student on the course's roster who has not left and who was not marked present in an earlier sitting of the test that was started, together with the students the teacher has marked to write the test again (retakes). Until the make-up is started, its participants SHALL follow the roster and the attendance of the earlier sittings as they stand. When it is started, they SHALL be fixed. A make-up SHALL use the test's handouts, SHALL carry its own duration, proposed as the first sitting's, and SHALL be started by its own button. A participant SHALL NOT be required to come, and the module SHALL NOT create a make-up by itself.

The form for a make-up SHALL show the duration of every earlier sitting of the test beside its own duration field, so the teacher can keep to it. It SHALL say that it is for everybody who has not written the test yet, and SHALL list, by name, the students who were present in an earlier started sitting, each with a box that marks them as a retake. Retakes SHALL be changeable until the make-up is started. The attendance table of the make-up SHALL mark retakes as such. A participant's attendance and group SHALL be kept while they stay a participant before the start. The module SHALL NOT delete a retake's result: the teacher enters the result of the make-up over the earlier one in the test's column, or, for a test with questions, grades the retake's questions over the earlier grades in the correction table.

A make-up that was started before this rule applied SHALL keep its participants. A make-up still ahead SHALL get its participants by this rule.

#### Scenario: Two of three absent students

- **WHEN** three students were absent from the first sitting, the teacher creates a make-up without marking a retake, and only two of them come
- **THEN** all three were participants of the make-up, the third is marked absent in it, and nobody requires the third to get another make-up

#### Scenario: Not coming to the make-up

- **WHEN** a participant of a make-up is marked absent in it
- **THEN** they have no sitting left unless the teacher creates another make-up, and in that one they are a participant

#### Scenario: Marked present after the make-up was planned

- **WHEN** a make-up is planned and the teacher then corrects a student of the first sitting from absent to present
- **THEN** that student is no longer a participant of the make-up, and its form lists them as having written

#### Scenario: A retake on paper

- **WHEN** a student who was present in the first sitting is marked as a retake, is present at the make-up in group B, and the teacher types the make-up's points into their field
- **THEN** the field holds the new points, and their result counts with group B's factor

#### Scenario: Fixed at the start

- **WHEN** a make-up has been started and a student is then added to the roster
- **THEN** that student is not a participant of the make-up

#### Scenario: A retake of a test with questions

- **WHEN** a retake of a test with questions is present at the make-up and the teacher types new grades over two of the three earlier ones
- **THEN** the row holds the two new grades and the third earlier one, and the result is computed from them

#### Scenario: Planning a make-up of a long test

- **WHEN** the first sitting of a long test ran with 160 minutes and a teacher opens the form for a make-up
- **THEN** the form proposes 160 minutes and shows that the first sitting had 160 minutes

#### Scenario: A shorter make-up

- **WHEN** a teacher plans a make-up of that test with 100 minutes and starts it at 13:00
- **THEN** its window runs from 13:00 to 14:40, and the first sitting keeps its 160 minutes
