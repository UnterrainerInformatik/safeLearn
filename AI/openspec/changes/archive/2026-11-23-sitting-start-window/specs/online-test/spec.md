## MODIFIED Requirements

### Requirement: A sitting sets the window and the duration

A test SHALL be written in one or more sittings. A sitting SHALL have a start window (from, to), an attempt duration, and its participants: the whole roster for the first sitting, or selected students for a make-up. The start window is the time in which a participant can start their attempt; it SHALL NOT limit how long an attempt runs. The duration SHALL be between 1 and 600 minutes and MAY be longer than the start window. The start window SHALL open before it closes and SHALL close in the future when the sitting is scheduled or changed. Only students on the course's roster who have not left SHALL be participants. A make-up sitting SHALL use the same duration and the same rules. A participant SHALL be offered a test they have not started only while the start window of a sitting they participate in is open. A participant who has started SHALL see the test until they have submitted or their deadline has passed, also after the start window has closed. The test SHALL be shown in the course's language.

Stored sittings SHALL NOT be converted: the window a sitting was stored with SHALL be read as its start window.

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

- **WHEN** a teacher creates a make-up sitting for two students who were absent
- **THEN** only those two can start the test during its start window, with the same duration as the first sitting

### Requirement: The server owns the deadline and submits automatically

An attempt's deadline SHALL be its start plus the sitting's duration. The end of the start window SHALL NOT shorten it. Only a teacher's action SHALL change it (`exam-record-maintenance`). The server SHALL accept answers only before the deadline. Every change of answer SHALL be saved to the server as it is made. When the deadline passes, the attempt SHALL be submitted with the last answers saved before it, whether or not the page is still open, and the test SHALL no longer be shown to the student.

#### Scenario: The page is closed

- **WHEN** a student closes the browser two minutes before the deadline
- **THEN** at the deadline the attempt is submitted with the answers saved before closing

#### Scenario: A late write

- **WHEN** a request to save an answer arrives after the deadline
- **THEN** it is refused and the submitted answers are unchanged

#### Scenario: Started late in the window

- **WHEN** a student starts a 20-minute attempt at 10:14 and the start window closes at 10:15
- **THEN** the deadline is 10:34

## ADDED Requirements

### Requirement: A sitting is open until its last attempt is over

A sitting of an online test SHALL be scheduled before its start window opens. It SHALL be open from the moment its start window opens until the start window has closed and no attempt in it is still running. It SHALL be over from then on. An attempt is running while it is not submitted and its deadline has not passed. A sitting SHALL therefore be over at the latest at the end of its start window plus the duration, plus any writing time a teacher added. It SHALL be over as soon as the start window has closed and every attempt in it is submitted. Everything that depends on a sitting being open or over SHALL use this meaning, including the list of tests, the live view and the student's review (`exam-attempt-review`).

#### Scenario: Attempts still running

- **WHEN** a sitting's start window closed at 10:15 and one participant's attempt runs until 10:34
- **THEN** the sitting is open until 10:34 and over from then on

#### Scenario: Everybody submitted early

- **WHEN** a sitting's start window closes at 10:15 and every participant who started has submitted by 10:12
- **THEN** the sitting is over at 10:15

#### Scenario: Nobody started

- **WHEN** a sitting's start window closes and no participant started an attempt
- **THEN** the sitting is over at the end of its start window

#### Scenario: In the list of tests

- **WHEN** a sitting's start window has closed but one attempt is still running
- **THEN** the list of tests shows the test as open right now

### Requirement: The live view and the view for the class show the start window and the latest end

The live view and the view for the class of an online sitting SHALL show the sitting's start window and the time at which the time runs out for the last participant. While the start window is open, that time SHALL be the end of the start window plus the duration, or the latest deadline of the attempts still running when a teacher's extension of the writing time put one later. Once the start window has closed, it SHALL be the latest deadline of the attempts still running. Once none is running, the sitting is over and the view SHALL say so. Both SHALL bring these times up to date without a reload when they change, such as when an attempt is submitted, the start window is extended or writing time is added. The live view SHALL keep showing every writing participant's own remaining time, computed from that participant's deadline. The view for the class SHALL show no participant's name and no participant's own time.

#### Scenario: During the start window

- **WHEN** a sitting has the start window 10:05–10:15 and a 20-minute duration, and it is 10:08
- **THEN** the view for the class shows the start window 10:05–10:15 and that the time runs out at 10:35 at the latest

#### Scenario: After the start window

- **WHEN** the start window closed at 10:15, and the two attempts still running end at 10:27 and 10:31
- **THEN** both views show 10:31 as the time the last one's time runs out

#### Scenario: The last one submits

- **WHEN** the attempt ending at 10:31 is submitted at 10:29 while the other one, ending at 10:27, was submitted before
- **THEN** within a few seconds both views show the sitting as over, without being reloaded

#### Scenario: Each participant's time in the live view

- **WHEN** two participants started at 10:06 and 10:14 on a 20-minute sitting, and it is 10:20
- **THEN** the live view shows about 6 minutes left for the first and about 14 minutes left for the second
