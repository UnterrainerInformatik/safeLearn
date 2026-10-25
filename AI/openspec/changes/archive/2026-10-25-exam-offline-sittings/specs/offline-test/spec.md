## Purpose

Defines tests of a course that are written in the classroom without the module taking answers — long tests handed in elsewhere, short tests on paper — and what the module still does for them: the window started by the teacher, the attendance and groups, the student's view of the sitting, the projector screen, and the gradebook column.

## ADDED Requirements

### Requirement: A course has offline tests beside its online tests

A teacher SHALL be able to create an offline test for a course, with a name, a duration, and whether it counts as a test or as a short test in the gradebook. An offline test SHALL have no questions and SHALL be schedulable without any. Its handouts are optional (`exam-handout`). The course's list of tests SHALL show offline and online tests together, each marked by its kind. Nothing of an offline test SHALL be written, answered or graded through the module.

#### Scenario: Creating a long test

- **WHEN** a teacher creates the offline test `POS Langtest 1` for the course 4AHIF POS with 100 minutes, counted as a test
- **THEN** the course's tests list it as an offline test, and it can be scheduled without any question

#### Scenario: A short test on paper

- **WHEN** a teacher creates an offline test counted as a short test and sets no handout
- **THEN** it is created, and a sitting of it can be started

### Requirement: An offline test is an editable column of its gradebook category

An offline test SHALL be a column of the course's sheet in the category it was created for (test or short test), named by the test and dated by the start of its first sitting, or by its planned date while no sitting has started. Its fields SHALL be editable like those of any manual column of the category. The column's header SHALL link to the test. Deleting the test SHALL be refused while its column holds results.

#### Scenario: Entering points after the test

- **WHEN** the long test was written on 2026-11-03 and the teacher types 42 into a student's field of its column
- **THEN** the field is saved like any other result of the test category, and the column's header names the test and links to it

#### Scenario: Deleting a test with results

- **WHEN** a teacher deletes an offline test whose column holds a result
- **THEN** it is refused, and the test and the column are unchanged

### Requirement: An offline sitting opens only when the teacher starts it

A sitting of an offline test SHALL carry a planned date and time and its participants, the roster's students who have not left. It SHALL NOT open at its planned time on its own. It SHALL open when a teacher presses its start button, and its window SHALL then run from that moment for the test's duration. Starting SHALL be refused while one of the test's handouts does not resolve (`exam-handout`). Before the start the sitting SHALL be shown as planned, and a teacher SHALL be able to change its planned time and participants. A started sitting SHALL be extended and ended for all its participants together, in the same way as a sitting of an online test. There SHALL be no extension for a single participant.

#### Scenario: The planned time passes

- **WHEN** an offline sitting is planned for 08:00 and nobody presses start
- **THEN** at 08:05 it is still not open, and no participant sees it

#### Scenario: Starting

- **WHEN** a teacher presses start at 08:07 on a sitting of a 100-minute test
- **THEN** the window runs from 08:07 to 09:47

#### Scenario: Extending

- **WHEN** a teacher extends a started sitting by 10 minutes
- **THEN** its window closes 10 minutes later for every participant

#### Scenario: A broken handout

- **WHEN** a teacher presses start while a handout of the test shows as unresolved
- **THEN** the sitting does not start, and the teacher is told which handout to choose again or remove

### Requirement: The attendance table records who is present, and their group

The teacher's page of an offline sitting SHALL list its participants with a control for present and absent, and, when the test has two handouts, two buttons to put the participant in group A or group B, with the row coloured by the group. Every participant SHALL start present and in group A. Presence and group SHALL be changeable before the start, during the window and after it, and each change SHALL be saved as it is made. A change during the window SHALL take effect for that participant at once: a participant marked present SHALL be shown the sitting and their handout without the teacher doing anything else, and a participant whose group changes SHALL be shown the other handout from their next request on. The table SHALL show no other student data than the names.

#### Scenario: Walking the rows

- **WHEN** a test has two handouts and the teacher puts every second student in group B before the start
- **THEN** those rows show the colour of group B, the others that of group A, and the assignment is kept on reload

#### Scenario: An absent student

- **WHEN** the teacher marks a student absent and starts the sitting
- **THEN** that student is not shown the sitting or its handout

#### Scenario: Arriving late

- **WHEN** a student marked absent arrives ten minutes into the window and the teacher marks them present
- **THEN** that student's Exams page shows the sitting and their handout, without the teacher starting anything again

#### Scenario: A wrong group

- **WHEN** during the window the teacher moves a student from group A to group B
- **THEN** that student's next request for the handout is answered with handout B, and handout A is no longer served to them

### Requirement: A present participant sees the open sitting on their Exams page

While an offline sitting is open, each participant marked present SHALL see it on their Exams page with its name and the time left, and the top bar's Exams button SHALL show as it does while an online test is open. If the test has handouts, the entry SHALL lead to the participant's handout (`exam-handout`). Without a handout, the entry SHALL show only the sitting and its time. When the window closes, the entry SHALL disappear without a reload. A participant marked absent SHALL see nothing of the sitting.

#### Scenario: Without a handout

- **WHEN** a short test on paper is running and a present student opens the Exams page
- **THEN** it shows the short test with its time left and no link to a handout

#### Scenario: The window closes

- **WHEN** the window of a sitting closes while a present student's Exams page is open
- **THEN** the entry disappears and the Exams button returns to its usual look, without the page being reloaded

### Requirement: The view for the class shows an offline sitting's time

The view for the class SHALL be available for offline sittings. For an offline sitting it SHALL show the test's name, the clock, the window and the time left, or that the sitting has not started yet, and SHALL bring them up to date when the sitting is started, extended or ended, without a reload. It SHALL show no counts, no names and nothing that depends on a group.

#### Scenario: On the projector before the start

- **WHEN** the view for the class of a planned offline sitting is open and the teacher presses start
- **THEN** within a few seconds the view shows the window and the time left, without being reloaded

#### Scenario: Two groups

- **WHEN** a sitting with two handouts is running
- **THEN** the view for the class shows nothing that differs between the groups

### Requirement: A make-up sitting is offered, never required

A teacher SHALL be able to create a make-up sitting of an offline test for selected participants of earlier sittings, typically those who were absent. A make-up SHALL use the test's handouts and duration and SHALL be started by its own button. A participant who was absent SHALL NOT be required to get a make-up, and the module SHALL NOT create one by itself.

#### Scenario: Two of three absent students

- **WHEN** three students were absent and the teacher creates a make-up for two of them
- **THEN** only those two are participants of the make-up, and the third has no sitting left
