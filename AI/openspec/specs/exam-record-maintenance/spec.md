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

In a sitting's live view, while the sitting is open, a teacher SHALL be able to end it now and to extend its window by a number of minutes. Ending SHALL set the window's end to the current server time and SHALL be confirmed by the module's two-click confirmation. Every running attempt SHALL then be submitted with its last saved answers, exactly as at a deadline. Extending SHALL move the window's end later. The deadline of each running attempt SHALL be recomputed as the earlier of its start plus the duration and the new end of the window. The duration of the attempts SHALL NOT change. Both SHALL be announced to the live view and to the students' pages like any other change of the sitting.

#### Scenario: Ending early

- **WHEN** a teacher ends a sitting while three students are writing
- **THEN** their attempts are submitted with their saved answers and the live view shows them as submitted

#### Scenario: Extending the window

- **WHEN** a student started a 10-minute attempt four minutes before the window closes, and the teacher extends the window by ten minutes
- **THEN** the student's deadline moves to the start of their attempt plus ten minutes

#### Scenario: Extending a sitting that is over

- **WHEN** a request extends a sitting whose window has already closed
- **THEN** it is refused

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
