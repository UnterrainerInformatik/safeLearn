# offline-test Specification

## Purpose

Defines tests of a course that are written in the classroom without the module taking answers — long tests handed in elsewhere, short tests on paper — and what the module still does for them: the window started by the teacher, the attendance and groups, the student's view of the sitting, the projector screen, and the gradebook column.

## Requirements

### Requirement: A course has offline tests beside its online tests

A teacher SHALL be able to create an offline test for a course, with a name, a duration, and whether it counts as a test or as a short test in the gradebook. The choice SHALL offer only those of the two categories that are in use, weighted above 0 % (`gradebook-sheet`), and SHALL be refused for a category that is not. While neither is in use, the course SHALL offer no new offline test. An offline test SHALL have no questions and SHALL be schedulable without any. Its handouts are optional (`exam-handout`). The course's list of tests SHALL show offline and online tests together, each marked by its kind. Nothing of an offline test SHALL be written, answered or graded through the module.

#### Scenario: Creating a long test

- **WHEN** a teacher creates the offline test `POS Langtest 1` for the course 4AHIF POS with 100 minutes, counted as a test
- **THEN** the course's tests list it as an offline test, and it can be scheduled without any question

#### Scenario: A short test on paper

- **WHEN** a teacher creates an offline test counted as a short test and sets no handout
- **THEN** it is created, and a sitting of it can be started

#### Scenario: Short tests not in use

- **WHEN** a course weighs short tests at 0 % and manual tests above 0 %
- **THEN** the form for a new offline test offers only "counts as a test", and a request to create one counted as a short test is refused

### Requirement: An offline test is an editable column of its gradebook category

An offline test SHALL be a column of the course's sheet in the category it was created for (test or short test), named by the test and dated by the start of its first sitting, or by its planned date while no sitting has started. Its fields SHALL be editable like those of any manual column of the category. The column's header SHALL link to the test. Deleting the test SHALL be refused while its column holds results.

#### Scenario: Entering points after the test

- **WHEN** the long test was written on 2026-11-03 and the teacher types 42 into a student's field of its column
- **THEN** the field is saved like any other result of the test category, and the column's header names the test and links to it

#### Scenario: Deleting a test with results

- **WHEN** a teacher deletes an offline test whose column holds a result
- **THEN** it is refused, and the test and the column are unchanged

### Requirement: An offline sitting opens only when the teacher starts it

A sitting of an offline test SHALL carry a planned date and time and its participants, the roster's students who have not left. It SHALL NOT open at its planned time on its own. It SHALL open when a teacher presses its start button, and its window SHALL then run from that moment for the test's duration. Starting SHALL be refused while one of the test's handouts does not resolve (`exam-handout`). Before the start the sitting SHALL be shown as planned, and a teacher SHALL be able to change its planned time and participants. A started sitting SHALL be extended and ended for all its participants together, in the same way as a sitting of an online test. There SHALL be no extension for a single participant. An end that is not later than the moment the window opened SHALL be refused with a message, and SHALL leave the sitting as it was.

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

#### Scenario: An end at the moment of the start

- **WHEN** an end of a started sitting arrives at the same moment its window opened
- **THEN** the end is refused with a message saying that a sitting can only be ended after it opened
- **AND** the sitting stays open with its window unchanged, and no error is raised inside the application

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

### Requirement: The attendance table holds the teacher's note

The attendance table of an offline sitting SHALL hold the same teacher note per participant as the live view of an online sitting (`online-test`, "Teachers note participants in the live view"), with the same limits, the same visibility to teachers only and no effect on any calculation. The note SHALL be independent of presence and group: marking a participant present, absent or moving them to another group SHALL leave their note as it was.

#### Scenario: A note at the attendance table

- **WHEN** a teacher marks a student present in group A and enters "Phone on the desk, taken away at 10:12"
- **THEN** the note is saved and shown in that student's row

#### Scenario: Presence does not touch the note

- **WHEN** a student with a note is marked absent and then present again
- **THEN** their note is unchanged

### Requirement: The groups of an offline test can be evened out by a factor A:B

An offline test with two handouts SHALL carry a factor A:B, 1:1 by default. Of the two groups, at most one SHALL be raised, by a factor from 1.00 to 2.00 in steps of 0.05, and the other SHALL stay at 1. A teacher SHALL set it in the dialog of the test's column in the sheet with a slider between A on the left and B on the right. With the knob in the middle, both groups SHALL be at 1. Each step to the left SHALL raise group A by 0.05, and each step to the right SHALL raise group B by 0.05. The dialog SHALL show the ratio as numbers beside the slider, for example `A 1,00 : B 1,20`, and SHALL offer a way back to 1:1. The slider SHALL be usable by keyboard. The dialog SHALL offer the slider only for the column of an offline test with two handouts. The factor SHALL be saved as it changes, like the dialog's other fields. A factor outside the allowed range, or one raising both groups, SHALL be refused, and the factor SHALL remain unchanged.

A result of a participant in the raised group SHALL count as the fraction entered (points out of the column's maximum, or the percentage of a column without a maximum) multiplied by the group's factor and capped at 100 %. It SHALL count that way everywhere a result counts: in the category, in the proposal, in the year grade and on the student's results page. The points or percentage as entered SHALL stay stored and shown unchanged in the field. The range allowed for the field SHALL stay the column's maximum or 100 %. A result of a participant in the other group SHALL count as entered.

The group that counts for a student SHALL be their group in the latest sitting of the test in which they were marked present. A student who was present in no sitting of the test SHALL count as group A. A change of the factor, or of a student's group in the attendance table, SHALL change the counted result at once, without the result being entered again. While the test has fewer than two handouts, no factor SHALL count, and the stored factor SHALL be kept.

The column's header SHALL show that a factor other than 1:1 applies, and hovering over it SHALL show the ratio. A field of the raised group SHALL show, beside the value entered, the value that counts. A student of the raised group whose result was changed by the factor SHALL see on their results page their result as entered, that it was multiplied by their group's factor, and the result that counts.

#### Scenario: Evening out a harder handout B

- **WHEN** a test out of 24 points has two handouts, a group-B student has 18 points, and the teacher moves the slider four steps to the right
- **THEN** the dialog shows `A 1,00 : B 1,20`, that student's result counts as 90 % (18 / 24 × 1.20), the field still shows 18, and a group-A student with 18 points still counts as 75 %

#### Scenario: Handout A was the harder one

- **WHEN** the teacher moves the slider two steps to the left of the middle
- **THEN** the dialog shows `A 1,10 : B 1,00`, group-A results count times 1.10 and group-B results count as entered

#### Scenario: Back to the middle

- **WHEN** the slider stands at `A 1,00 : B 1,20` and the teacher moves it back to the middle
- **THEN** both groups count as entered, and the header no longer marks the column

#### Scenario: Capped at the full result

- **WHEN** group B is raised by 1.20 and a group-B student has 22 of 24 points
- **THEN** their result counts as 100 %, not 110 %

#### Scenario: A factor out of range

- **WHEN** a request sets group B to 2.5, or both groups above 1
- **THEN** it is refused, and the factor stays as it was

#### Scenario: Moving a student after the results

- **WHEN** group B is raised, a student with a result was in group A, and the teacher moves them to group B in the attendance table of the sitting they were present at
- **THEN** their result counts with group B's factor from then on, without the teacher entering it again

#### Scenario: A make-up in the other group

- **WHEN** a student was absent from the first sitting and present in group B at the make-up
- **THEN** their result counts as group B

#### Scenario: One handout

- **WHEN** an offline test has a single handout
- **THEN** its column's dialog shows no slider, and every result counts as entered

#### Scenario: The header in the sheet

- **WHEN** group B of a column is raised by 1.20
- **THEN** the header marks the column, hovering shows `A 1,00 : B 1,20`, and each group-B field shows the counted value beside the points

#### Scenario: The student's view

- **WHEN** a student in group B with 18 of 24 points opens their results while group B is raised by 1.20
- **THEN** they see 18 / 24, that the factor 1.20 of group B was applied, and 90 % as the result that counts
