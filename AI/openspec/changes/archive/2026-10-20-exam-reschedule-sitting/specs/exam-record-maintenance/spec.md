## ADDED Requirements

### Requirement: A sitting that is over can be rescheduled

A teacher SHALL be able to reschedule a sitting whose window has closed. Rescheduling SHALL keep the sitting's duration and participants and change only its window. The form SHALL be pre-filled with the sitting's periods and propose the next weekday after today as the date. Participants who have left the course's roster SHALL be dropped; if none is left, rescheduling SHALL be refused. The same window rules as for a new sitting SHALL apply.

Rescheduling SHALL delete every attempt of that sitting, together with its answers, in the same transaction as moving the window. Attempts of other sittings of the test SHALL stay. If the sitting has attempts, only an admin SHALL be able to reschedule it, the save SHALL need a second click whose label names the number of attempts to be deleted, and the server SHALL refuse the request if the number of attempts differs from the confirmed number. Without attempts any teacher SHALL be able to reschedule it with a single save.

Make-up sittings of the test SHALL NOT change. The test's gradebook column and the date its questions count as used SHALL follow the test's earliest sitting after the move, also when that moves them into another semester. Rescheduling SHALL be announced to the students' pages and to the sitting's live view like any other change of the sitting.

#### Scenario: A test nobody wrote

- **WHEN** a teacher reschedules a sitting that is over and has no attempts, choosing next Tuesday
- **THEN** the sitting is scheduled for next Tuesday with the same periods, duration and participants, and its state is "scheduled"

#### Scenario: Attempts are deleted only after confirmation by an admin

- **WHEN** an admin reschedules a sitting with three attempts, and clicks save once
- **THEN** nothing changes and the button reads "Click again: delete 3 attempts and reschedule"
- **WHEN** the admin clicks again
- **THEN** the three attempts are gone, their results disappear from the gradebook, and the sitting is scheduled for the new window

#### Scenario: A teacher and a sitting with attempts

- **WHEN** a teacher who is not an admin tries to reschedule a sitting with one attempt
- **THEN** it is refused and nothing changes

#### Scenario: The number of attempts changed

- **WHEN** a reschedule request confirms two attempts and the sitting has three
- **THEN** it is refused and nothing changes

#### Scenario: A make-up stays

- **WHEN** a teacher reschedules the first sitting of a test that has a make-up sitting
- **THEN** the make-up keeps its window, its participants and its attempts

#### Scenario: Into the next semester

- **WHEN** the only sitting of a test in January is rescheduled to February in the next semester
- **THEN** the test's gradebook column moves to the next semester

#### Scenario: A sitting that has not closed

- **WHEN** a request reschedules a sitting that is scheduled or open
- **THEN** it is refused
