## MODIFIED Requirements

### Requirement: A course has offline tests beside its online tests

A teacher SHALL be able to create an offline test for a course, with a name, a duration, and whether it counts as a test or as a short test in the gradebook. The choice SHALL offer only those of the two categories that are in use, weighted above 0 % (`gradebook-sheet`), and SHALL be refused for a category that is not. While neither is in use, the course SHALL offer no new offline test. An offline test SHALL have either handouts or questions from the pool, never both (`offline-test-questions`). An offline test without questions SHALL be schedulable. Its handouts are optional (`exam-handout`). The course's list of tests SHALL show offline and online tests together, each marked by its kind. Nothing of an offline test SHALL be written or answered through the module. Only the questions of an offline test with questions SHALL be graded through it, by a teacher (`offline-test-questions`).

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

### Requirement: An offline test is an editable column of its gradebook category

An offline test SHALL be a column of the course's sheet in the category it was created for (test or short test), named by the test and dated by the start of its first sitting, or by its planned date while no sitting has started. For a test without questions, its fields SHALL be editable like those of any manual column of the category. For a test with questions, its fields SHALL be computed from the test's grades and read-only (`gradebook-sheet`, `offline-test-questions`). The column's header SHALL link to the test. Deleting the test SHALL be refused while its column holds results, or, for a test with questions, while a grade of it is stored.

#### Scenario: Entering points after the test

- **WHEN** the long test was written on 2026-11-03 and the teacher types 42 into a student's field of its column
- **THEN** the field is saved like any other result of the test category, and the column's header names the test and links to it

#### Scenario: Deleting a test with results

- **WHEN** a teacher deletes an offline test whose column holds a result
- **THEN** it is refused, and the test and the column are unchanged

#### Scenario: A test with questions

- **WHEN** a teacher tries to type a result into the column of an offline test with questions
- **THEN** the field takes no input, and it shows the result computed from the correction table

### Requirement: The attendance table records who is present, and their group

The teacher's page of an offline sitting SHALL list its participants with a control for present and absent, and, when the test has two groups - two handouts, or questions for group B - two buttons to put the participant in group A or group B, with the row coloured by the group. Every participant SHALL start present and in group A. Presence and group SHALL be changeable before the start, during the window and after it, and each change SHALL be saved as it is made. A change during the window SHALL take effect for that participant at once: a participant marked present SHALL be shown the sitting and their handout without the teacher doing anything else, and a participant whose group changes SHALL be shown the other handout from their next request on, and SHALL be graded on the other group's questions. The table SHALL show no other student data than the names.

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

### Requirement: The groups of an offline test can be evened out by a factor A:B

An offline test with two groups - two handouts, or questions for group B - SHALL carry a factor A:B, 1:1 by default. Of the two groups, at most one SHALL be raised, by a factor from 1.00 to 2.00 in steps of 0.05, and the other SHALL stay at 1. A teacher SHALL set it in the dialog of the test's column in the sheet with a slider between A on the left and B on the right. With the knob in the middle, both groups SHALL be at 1. Each step to the left SHALL raise group A by 0.05, and each step to the right SHALL raise group B by 0.05. The dialog SHALL show the ratio as numbers beside the slider, for example `A 1,00 : B 1,20`, and SHALL offer a way back to 1:1. The slider SHALL be usable by keyboard. The dialog SHALL offer the slider only for the column of an offline test with two groups. The factor SHALL be saved as it changes, like the dialog's other fields. A factor outside the allowed range, or one raising both groups, SHALL be refused, and the factor SHALL remain unchanged.

A result of a participant in the raised group SHALL count as the fraction entered (points out of the column's maximum, or the percentage of a column without a maximum) or, for a test with questions, the fraction computed from the grades, multiplied by the group's factor and capped at 100 %. It SHALL count that way everywhere a result counts: in the category, in the proposal, in the year grade and on the student's results page. The points or percentage as entered SHALL stay stored and shown unchanged in the field. The range allowed for the field SHALL stay the column's maximum or 100 %. A result of a participant in the other group SHALL count as entered.

The group that counts for a student SHALL be their group in the latest sitting of the test in which they were marked present. A student who was present in no sitting of the test SHALL count as group A. A change of the factor, or of a student's group in the attendance table, SHALL change the counted result at once, without the result being entered again. While the test has fewer than two groups, no factor SHALL count, and the stored factor SHALL be kept.

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

- **WHEN** an offline test has a single handout, or questions for group A only
- **THEN** its column's dialog shows no slider, and every result counts as entered

#### Scenario: The header in the sheet

- **WHEN** group B of a column is raised by 1.20
- **THEN** the header marks the column, hovering shows `A 1,00 : B 1,20`, and each group-B field shows the counted value beside the points

#### Scenario: The student's view

- **WHEN** a student in group B with 18 of 24 points opens their results while group B is raised by 1.20
- **THEN** they see 18 / 24, that the factor 1.20 of group B was applied, and 90 % as the result that counts

#### Scenario: Two question groups

- **WHEN** group B of a test with questions is raised by 1.20 and a group-B student's grades give 70.5 %
- **THEN** their result counts as 84.6 %, and the correction table shows 70.5 % beside it

### Requirement: A make-up sitting is offered, never required

A teacher SHALL be able to create a make-up sitting of an offline test. Its participants SHALL NOT be chosen. They SHALL be every student on the course's roster who has not left and who was not marked present in an earlier sitting of the test that was started, together with the students the teacher has marked to write the test again (retakes). Until the make-up is started, its participants SHALL follow the roster and the attendance of the earlier sittings as they stand. When it is started, they SHALL be fixed. A make-up SHALL use the test's handouts and duration and SHALL be started by its own button. A participant SHALL NOT be required to come, and the module SHALL NOT create a make-up by itself.

The form for a make-up SHALL say that it is for everybody who has not written the test yet, and SHALL list, by name, the students who were present in an earlier started sitting, each with a box that marks them as a retake. Retakes SHALL be changeable until the make-up is started. The attendance table of the make-up SHALL mark retakes as such. A participant's attendance and group SHALL be kept while they stay a participant before the start. The module SHALL NOT delete a retake's result: the teacher enters the result of the make-up over the earlier one in the test's column, or, for a test with questions, grades the retake's questions over the earlier grades in the correction table.

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
