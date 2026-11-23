# exam-record-maintenance Specification

## Purpose
Lets teachers correct and remove the module's school years, classes and courses, and react to a running sitting by ending it early or extending its window, without touching anything that results depend on.

## Requirements

### Requirement: School years, classes and courses can be renamed

A teacher SHALL be able to rename a school year, a class and a course at the record's own page head. The same rules as on creation SHALL apply: a school year's name SHALL be unique, a class's name SHALL be unique within its school year, and a course's subject SHALL be unique within its class. A refused name SHALL be shown at the field and leave the stored name unchanged. Renaming SHALL NOT change any result, roster entry, test or grade.

#### Scenario: Correcting a subject

- **WHEN** a teacher renames the course `WMx` of `4BHIF` to `WMC`
- **THEN** the bar, the class page and the gradebook show `WMC`, and every result of the course is unchanged

#### Scenario: A duplicate class name

- **WHEN** a teacher renames `4AHIF` to `4BHIF` in a year that already has `4BHIF`
- **THEN** it is refused at the field and the class keeps its name

### Requirement: Records are deleted only while nothing depends on them

A teacher SHALL be able to delete a school year that has no classes and is not the current year, a class that has no courses, and a course that has no gradebook columns, no recorded results or grades, and no tests. Deleting a class SHALL remove its roster. Deleting SHALL be confirmed by the module's two-click confirmation. A deletion that is not allowed SHALL be refused with the reason, shown at the delete button, and SHALL change nothing.

#### Scenario: An empty course

- **WHEN** a teacher deletes a course created by mistake that has nothing recorded
- **THEN** it is gone from the class page and from the bar

#### Scenario: A course with results

- **WHEN** a teacher tries to delete a course with one recorded result
- **THEN** it is refused, the reason names what still depends on the course, and nothing changes

#### Scenario: The current year

- **WHEN** a teacher tries to delete the current school year
- **THEN** it is refused

### Requirement: A running sitting can be ended or extended

In a sitting's live view, while the sitting is open, a teacher SHALL be able to end it now. Ending SHALL be confirmed by the module's two-click confirmation. For a sitting of an online test it SHALL close the start window at the current server time if it is still open, and SHALL leave an earlier end of the start window as it is. For a sitting of an offline test it SHALL close the shared window at the current server time. Every running attempt SHALL then be submitted with its last saved answers, exactly as at a deadline, and the sitting SHALL be over.

For a sitting of an online test, the live view SHALL offer two separate ways to extend it:

- **Extend the start window** by 5 to 120 whole minutes. This SHALL be offered and accepted only while the start window is open. It SHALL move the end of the start window later and SHALL NOT change any running attempt's deadline or the duration.
- **Extend the writing time** by 1 to 120 whole minutes. This SHALL be offered and accepted only while at least one attempt in the sitting is running. It SHALL move the deadline of every attempt running at that moment later by that many minutes. It SHALL NOT change the duration, the start window, or the deadline of an attempt that is submitted, and SHALL NOT apply to attempts started afterwards. There SHALL be no extension for a single participant.

A sitting of an offline test SHALL keep its single extension: its window, which all its participants share, SHALL close that many minutes later (`offline-test`).

Every one of these actions SHALL be announced to the live view, to the view for the class and to the students' pages like any other change of the sitting. A refused request SHALL change nothing.

#### Scenario: Ending early

- **WHEN** a teacher ends a sitting while three students are writing
- **THEN** their attempts are submitted with their saved answers, the live view shows them as submitted, and the sitting is over

#### Scenario: Ending after the start window

- **WHEN** the start window closed at 10:15 and a teacher ends the sitting at 10:25 while one student is still writing
- **THEN** that student's attempt is submitted at 10:25, and the start window still reads 10:05–10:15

#### Scenario: Extending the window

- **WHEN** the start window runs until 10:15 and a teacher extends it by 5 minutes at 10:12
- **THEN** students can start until 10:20, and a student who started at 10:08 keeps their deadline

#### Scenario: Extending the start window after it closed

- **WHEN** a request extends the start window of a sitting whose start window has closed
- **THEN** it is refused, also while attempts are still running

#### Scenario: Extending the writing time

- **WHEN** two students are writing with deadlines 10:27 and 10:31, one student has submitted, and a teacher extends the writing time by 5 minutes
- **THEN** the deadlines become 10:32 and 10:36, and the submitted attempt is unchanged

#### Scenario: Writing time does not reach later starters

- **WHEN** a teacher extends the writing time by 5 minutes at 10:10 while the start window is still open, and a student starts a 20-minute attempt at 10:12
- **THEN** that student's deadline is 10:32

#### Scenario: Extending the writing time with nobody writing

- **WHEN** a request extends the writing time of a sitting in which no attempt is running
- **THEN** it is refused

#### Scenario: Extending a sitting that is over

- **WHEN** a request extends a sitting that is over, in either way
- **THEN** it is refused

### Requirement: A sitting that is over can be rescheduled

A teacher SHALL be able to reschedule a sitting that is over. Rescheduling SHALL keep the sitting's duration and participants and change only its start window. The form SHALL be pre-filled with the sitting's start window: its period, the minutes after the period's start and its length, or its start time and length in clock times, and SHALL propose the next weekday after today as the date. Participants who have left the course's roster SHALL be dropped; if none is left, rescheduling SHALL be refused. The same rules for the start window as for a new sitting SHALL apply.

Rescheduling SHALL delete every attempt of that sitting, together with its answers, in the same transaction as moving the start window. Attempts of other sittings of the test SHALL stay. If the sitting has attempts, only an admin SHALL be able to reschedule it, the save SHALL need a second click whose label names the number of attempts to be deleted, and the server SHALL refuse the request if the number of attempts differs from the confirmed number. Without attempts any teacher SHALL be able to reschedule it with a single save.

Make-up sittings of the test SHALL NOT change. The test's gradebook column and the date its questions count as used SHALL follow the test's earliest sitting after the move, also when that moves them into another semester. Rescheduling SHALL be announced to the students' pages and to the sitting's live view like any other change of the sitting.

#### Scenario: A test nobody wrote

- **WHEN** a teacher reschedules a sitting that is over and has no attempts, choosing next Tuesday
- **THEN** the sitting is scheduled for next Tuesday with the same period, offset, start window length, duration and participants, and its state is "scheduled"

#### Scenario: Attempts are deleted only after confirmation by an admin

- **WHEN** an admin reschedules a sitting with three attempts, and clicks save once
- **THEN** nothing changes and the button reads "Click again: delete 3 attempts and reschedule"
- **WHEN** the admin clicks again
- **THEN** the three attempts are gone, their results disappear from the gradebook, and the sitting is scheduled for the new start window

#### Scenario: A teacher and a sitting with attempts

- **WHEN** a teacher who is not an admin tries to reschedule a sitting with one attempt
- **THEN** it is refused and nothing changes

#### Scenario: The number of attempts changed

- **WHEN** a reschedule request confirms two attempts and the sitting has three
- **THEN** it is refused and nothing changes

#### Scenario: A make-up stays

- **WHEN** a teacher reschedules the first sitting of a test that has a make-up sitting
- **THEN** the make-up keeps its start window, its participants and its attempts

#### Scenario: Into the next semester

- **WHEN** the only sitting of a test in January is rescheduled to February in the next semester
- **THEN** the test's gradebook column moves to the next semester

#### Scenario: A sitting that has not closed

- **WHEN** a request reschedules a sitting that is scheduled, or open because its start window is open or an attempt in it is still running
- **THEN** it is refused

### Requirement: An open test can be discarded

While the first sitting of an online test is open, a teacher SHALL be able to discard the test, in the sitting's live view and on the test's page. The teacher need not be an admin. Discarding SHALL be confirmed by the module's two-click confirmation. The second click's label SHALL name the number of attempts to be deleted, and the server SHALL refuse the request if the test's number of attempts differs from the confirmed number.

Discarding SHALL do the following in one transaction:
- end the sitting;
- delete every attempt of the test, running or submitted, with its answers;
- delete every sitting of the test, make-ups included;
- delete the notes in the test's gradebook column and the teachers' notes on its participants.

The test SHALL keep its name and its questions and SHALL follow the pool again (`online-test`). Because the test has no sitting left, its gradebook column and its results SHALL disappear from the gradebook, and the date its questions count as used SHALL be today until a new sitting is scheduled.

Discarding SHALL be announced to the students' pages and to the sitting's live view. A student who is writing the test SHALL leave the attempt and full screen and SHALL be told that the teacher discarded the test. The student SHALL NOT be able to save or submit anything for it afterwards. The live view SHALL say that the test was discarded and SHALL offer the way back to the test.

Discarding SHALL be refused for an offline test, for a test whose first sitting is scheduled or over, and while only a make-up sitting is open. A refused request SHALL change nothing.

#### Scenario: Discarding while students write

- **WHEN** a teacher who is not an admin clicks "Discard test" in the live view of an open sitting in which three students have started
- **THEN** nothing changes yet, and the button reads "Click again: delete 3 attempts and discard the test"
- **WHEN** the teacher clicks again
- **THEN** the three attempts and the sitting are gone, the gradebook has no column for the test, and the test page shows the test with its questions and no sitting

#### Scenario: A student is writing

- **WHEN** the test is discarded while a student has it open in full screen
- **THEN** the student's page leaves full screen and tells them that the teacher discarded the test, and a later save from that page is refused

#### Scenario: The number of attempts changed

- **WHEN** a discard request confirms two attempts and a third student started in the meantime
- **THEN** it is refused and nothing changes

#### Scenario: A make-up scheduled for later

- **WHEN** a test is discarded whose make-up sitting is scheduled for next week
- **THEN** the make-up sitting is gone as well

#### Scenario: The notes go with the test's results

- **WHEN** a teacher discards a test for which a teacher noted one participant in the live view
- **THEN** the note is gone, and the student's page shows no note for the test

#### Scenario: A sitting that is over

- **WHEN** a request discards a test whose only sitting has closed
- **THEN** it is refused, and the attempts can only go through an admin's reschedule

#### Scenario: Only a make-up is open

- **WHEN** a request discards a test whose first sitting is over and whose make-up sitting is open
- **THEN** it is refused and nothing changes

#### Scenario: An offline test

- **WHEN** a request discards an offline test
- **THEN** it is refused
