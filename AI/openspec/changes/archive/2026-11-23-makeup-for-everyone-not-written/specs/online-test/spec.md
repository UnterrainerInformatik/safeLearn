## MODIFIED Requirements

### Requirement: A sitting sets the window and the duration

A test SHALL be written in one or more sittings. A sitting SHALL have a start window (from, to), an attempt duration, and its participants. The start window is the time in which a participant can start their attempt; it SHALL NOT limit how long an attempt runs. The duration SHALL be between 1 and 600 minutes and MAY be longer than the start window. The start window SHALL open before it closes and SHALL close in the future when the sitting is scheduled or changed. Only students on the course's roster who have not left SHALL be participants. A make-up sitting SHALL use the same duration and the same rules. A participant SHALL be offered a test they have not started only while the start window of a sitting they participate in is open. A participant who has started SHALL see the test until they have submitted or their deadline has passed, also after the start window has closed. The test SHALL be shown in the course's language.

The participants of the first sitting SHALL be the whole roster or the students the teacher chooses. The participants of a make-up sitting SHALL NOT be chosen. They SHALL be every student on the roster who has not left and has no attempt of the test, together with the students the teacher has marked to write the test again (retakes). Until the make-up's start window opens, its participants SHALL follow the roster and the attempts as they stand: a student who joins the roster, or who does not start in an earlier sitting, SHALL become a participant without the teacher doing anything, and a student who starts an attempt in another sitting SHALL stop being one. When the start window opens, the participants SHALL be fixed, and a student who has an attempt in the make-up SHALL stay a participant of it. A make-up MAY be planned before the first sitting is over.

The form for a make-up SHALL NOT offer a choice of participants. It SHALL say that the make-up is for everybody who has not written the test yet, and SHALL list, by name, the students on the roster who already have an attempt and are therefore not participants. Each of them SHALL carry a box that marks them as a retake. Retakes SHALL be changeable until the make-up's start window opens. A student marked as a retake who leaves the roster SHALL no longer be one. Wherever a make-up names its participants, retakes SHALL be marked as such.

Stored sittings SHALL NOT be converted: the window a sitting was stored with SHALL be read as its start window. A make-up whose start window had opened before this rule applied SHALL keep its participants. A make-up still ahead SHALL get its participants by this rule.

#### Scenario: Duration longer than the window

- **WHEN** a teacher creates a sitting with a start window from 10:05 to 10:15 and a 20-minute duration
- **THEN** it is accepted

#### Scenario: A start window that does not open before it closes

- **WHEN** a teacher creates a sitting whose start window opens at 10:15 and closes at 10:15
- **THEN** it is refused

#### Scenario: Not started when the start window closes

- **WHEN** the start window of a sitting closes at 10:15 and a participant has not started
- **THEN** from 10:15 that participant is no longer offered the test, and a request to start it is refused

#### Scenario: Started before the start window closes

- **WHEN** a participant started a 20-minute attempt at 10:14 and the start window closed at 10:15
- **THEN** at 10:20 the participant still sees the test with their answers and about 14 minutes remaining

#### Scenario: A make-up

- **WHEN** two of 24 students did not start in the first sitting and a teacher plans a make-up without marking a retake
- **THEN** exactly those two can start the test during its start window, with the same duration as the first sitting, and the form named the 22 others as having written

#### Scenario: A student joins the class before the make-up

- **WHEN** a make-up is planned for next week and a student is added to the roster two days later
- **THEN** that student is a participant of the make-up when its start window opens

#### Scenario: Missed the first make-up too

- **WHEN** a student did not start in the first sitting nor in a first make-up, and the teacher plans a second make-up
- **THEN** the student is a participant of the second make-up

#### Scenario: Planned before the first sitting

- **WHEN** a teacher plans a make-up before the first sitting has opened, and a student then submits in the first sitting
- **THEN** that student is no longer a participant of the make-up, and the form lists them as having written

#### Scenario: Fixed when the start window opens

- **WHEN** the start window of a make-up has opened and a student is then added to the roster
- **THEN** that student is not a participant of the make-up

#### Scenario: A retake

- **WHEN** a teacher plans a make-up and marks a student who submitted in the first sitting as a retake
- **THEN** that student can start the test during the make-up's start window, and the make-up's participants show them as a retake

#### Scenario: A retake taken back

- **WHEN** a teacher unmarks a retake before the make-up's start window opens
- **THEN** that student is no longer a participant, and their first attempt and result are unchanged

#### Scenario: Choosing participants of a make-up

- **WHEN** a request plans a make-up for a list of chosen students
- **THEN** it is refused

### Requirement: One attempt per student and test, resumed on reload

A student SHALL have at most one attempt per test across all sittings. Opening the test SHALL start the attempt and record its start time on the server. Reloading or reopening the page SHALL resume the same attempt with its saved answers and the remaining time, never start a new one.

A student who is a retake of an open make-up and has not started in it SHALL be able to start a new attempt in it. Starting it SHALL delete their earlier attempt, with its answers and its review, in the same step that creates the new one. From then on only the new attempt SHALL count, in the test's column and everywhere else. Until it starts, the earlier attempt SHALL stay and count. A retake whose earlier attempt is still running SHALL NOT start a new one; opening the test SHALL resume the running attempt, as a reload does. A retake who never starts SHALL keep their earlier attempt and its result. The teachers' note on the student and the notes on their field in the test's column SHALL stay.

#### Scenario: Reload during the test

- **WHEN** a student reloads the page three minutes into a 10-minute attempt
- **THEN** the page shows their saved answers and about seven minutes remaining

#### Scenario: A second attempt

- **WHEN** a student who has submitted requests to start the test in a make-up they are not a retake of
- **THEN** no new attempt is started

#### Scenario: A retake starts

- **WHEN** a student who scored 3 of 10 in the first sitting is a retake of a make-up and starts the test in it
- **THEN** their first attempt is gone, the test's column shows no result for them until they submit, and after they submit with 8 of 10 the column shows 8 of 10

#### Scenario: A retake does not come

- **WHEN** a student is a retake of a make-up and does not start before its start window closes
- **THEN** their first attempt and its result remain

#### Scenario: A retake reloads

- **WHEN** a retake reloads the page during their new attempt
- **THEN** the same new attempt is resumed, and no further attempt is started or deleted

#### Scenario: The first attempt still runs

- **WHEN** a student whose attempt in an overlapping sitting is still running requests to start as a retake in a make-up
- **THEN** no new attempt is started, the running attempt is resumed, and it is unchanged
