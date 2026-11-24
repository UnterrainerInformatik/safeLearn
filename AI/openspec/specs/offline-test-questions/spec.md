# offline-test-questions Specification

## Purpose

Defines the offline test composed from pool questions and written on paper: its assembly per group, the weight and answer space of each question, its snapshot, the printed sheet and solution, the teacher's grade per question and student, and the result computed from those grades.

## Requirements

### Requirement: An offline test is composed from pool questions in the browser

A teacher SHALL be able to create an offline test from questions of the pool, in the question browser, with a course chosen in the module bar. The browser SHALL offer, beside creating an online test, creating a test on paper. Creating it SHALL ask for the test's name, its duration and whether it counts as a test or as a short test, offering only the categories in use as for every offline test (`offline-test`). A test on paper SHALL accept choice questions and free-text questions. A retired question SHALL NOT be offered. Creating the test SHALL record each question's usage for that course. A test on paper without a question SHALL be refused at creation. The questions chosen at creation SHALL be those of group A.

An offline test SHALL have either handouts or questions, never both. Choosing a handout for a test with questions SHALL be refused, and so SHALL giving questions to a test with a handout. The course's list of tests SHALL mark a test with questions as an offline test.

#### Scenario: Composing a short test

- **WHEN** a teacher with `POS 4AHIF 2026/27` chosen in the bar ticks two free-text questions and one `multichoiceset` question, chooses a test on paper, names it `Quickie REST`, gives it 15 minutes and counts it as a short test
- **THEN** the course has the offline test `Quickie REST` with those three questions in group A, it is listed as an offline test, and each question shows the usage `POS 4AHIF` in the browser

#### Scenario: A handout on a test with questions

- **WHEN** a teacher tries to choose a handout for `Quickie REST`
- **THEN** it is refused, and the test keeps its questions and has no handout

### Requirement: Group B has its own selection of questions

The page of an offline test with questions SHALL offer to choose questions for group B. That choice SHALL open the question browser for the test's group B and work as the assembly does. A question SHALL be allowed in both groups. While group B holds a question, the test SHALL have two groups, and the attendance table and the factor A:B SHALL apply as for two handouts (`offline-test`). Removing the last question of group B SHALL leave the test with one group. Removing the last question of group A while group B holds questions SHALL make group B's questions group A's. The test's page SHALL show each group's questions in their order. The order SHALL be changeable.

#### Scenario: Two selections

- **WHEN** a teacher chooses four questions for group B of `Quickie REST`, one of which group A also holds
- **THEN** the test's page shows three questions under group A and four under group B, and the attendance table of its sittings offers groups A and B

#### Scenario: Group B emptied

- **WHEN** the teacher removes every question of group B before the first sitting is started
- **THEN** the test has one group, and its attendance table offers no groups

### Requirement: Each question of a test on paper carries a weight and an answer space

Each question of an offline test SHALL carry a weight, a whole number from 1 to 10, 1 when chosen. Each free-text question SHALL also carry the number of lines left for its answer on the sheet, from 1 to 40, 6 when chosen. Both SHALL be set on the test's page per group and question. They SHALL be saved as they change. A value out of range SHALL be refused and the stored value kept. Both SHALL stay changeable after the first sitting has started. A change of a weight SHALL change every result of the test at once, without a grade being entered again. The test's page SHALL show each group's total weight.

#### Scenario: Weighting a question

- **WHEN** a teacher sets the weight of the second question of group A to 3
- **THEN** group A's total weight shows 5 for three questions, and every result of a group-A student is computed with it

#### Scenario: A weight out of range

- **WHEN** a request sets a weight to 0 or to 11
- **THEN** it is refused, and the weight stays as it was

### Requirement: A test on paper follows the pool until its first sitting is started

Until the first sitting of an offline test with questions is started, the test SHALL show and print its questions as the pool currently holds them, and a teacher SHALL be able to rename it, change its questions and delete it. When its first sitting is started, the test SHALL fix a snapshot of its questions, the model solutions included. From then on, editing, retiring or deleting a pool question SHALL NOT change the test, its sheets or its grades, and its questions SHALL NOT change. Make-ups SHALL use the same snapshot. Starting a sitting SHALL be refused while the test has no question, and the refusal SHALL say so.

#### Scenario: A typo fixed before the test

- **WHEN** a teacher fixes a typo in a free-text question of `Quickie REST` before its sitting is started
- **THEN** the test's page and a print of its sheet show the corrected text

#### Scenario: Edited after the start

- **WHEN** a pool question of `Quickie REST` is edited after its first sitting was started
- **THEN** the test's sheet, its solution and its grades still show the version from the start

#### Scenario: The only question deleted

- **WHEN** the only question of a test on paper is deleted from the pool before the test is started, and the teacher presses start
- **THEN** the sitting does not start, and the teacher is told that the test has no questions

### Requirement: The sheet and its solution are printed per group

For each group, the test's page and every sitting's page SHALL offer a button to print the sheet and one to print its solution. Each SHALL open, in a new tab, a printable document of that one group, with no element of the module around it, as a handout's print does (`exam-handout`). Both SHALL be in the course's language. The sheet SHALL be headed by the test's name, the class, the date and, for a test with two groups, the group, and SHALL leave a line for the student's name. It SHALL number the group's questions from 1 in the group's order and show each question's weight. A choice question SHALL show its answers in the pool's order, each with an empty box, a `truefalse` question two boxes for true and false, and a free-text question an empty answer space of its number of lines. The solution SHALL be the same document with the correct answers' boxes ticked and each free-text question's model solution in place of its answer space. The date SHALL follow the rule of a handout's print. A print and every request it makes SHALL be refused to any session that does not act as a teacher, a teacher in student view included. Printing SHALL be possible at any time.

#### Scenario: Printing group A

- **WHEN** a teacher prints group A of `Quickie REST` of the German course 4AHIF with a sitting planned for 2026-11-25
- **THEN** a new tab shows a sheet headed `Quickie REST`, `4AHIF`, `25.11.2026` and `Gruppe A`, with a name line, three numbered questions in German with their weights, boxes for the choice question and six empty lines under each free-text question

#### Scenario: Printing the solution

- **WHEN** the teacher prints the solution of group A
- **THEN** the correct answers' boxes are ticked and each free-text question shows its model solution instead of the empty lines

#### Scenario: A student asks for a sheet

- **WHEN** a student requests the print of a sheet or of its solution
- **THEN** it is refused, and nothing of the questions is revealed

### Requirement: A test on paper is not shown on screen to students

The questions of an offline test SHALL NOT be sent to a student by any route, page or API, before, during or after a sitting. A present participant's Exams page SHALL show the open sitting with its name and time left only, as for an offline test without a handout.

#### Scenario: During the window

- **WHEN** a sitting of `Quickie REST` is open and a present student opens the Exams page
- **THEN** it shows `Quickie REST` with its time left and no question and no link to a sheet

### Requirement: A teacher grades each question of each student with a grade from 1 to 5

An offline test with questions SHALL have a correction table, reached from its page and from its column in the sheet. It SHALL hold one row per student who was marked present in a started sitting of the test, showing the group that counts for them (`offline-test`), and, per group, one column per question of that group in its order. A row SHALL offer a field per question of the student's group. A field SHALL take a whole grade from 1 to 5 or nothing. It SHALL be saved as it changes, with the same marking of saving, saved and refused as the sheet, and the arrow keys SHALL move between the fields as in the sheet (`gradebook-sheet`). Every question SHALL be graded this way, choice questions included. Each row SHALL show the student's result once it is complete. Only a session acting as a teacher SHALL reach the table and its requests. A grade SHALL be kept when the student's group changes, and SHALL count again if the student returns to the group.

#### Scenario: Grading a row

- **WHEN** a teacher types 1, 2 and 5 into the three fields of a group-A student of `Quickie REST`
- **THEN** each grade is saved as it is typed, and the row shows the student's result

#### Scenario: A grade out of range

- **WHEN** a teacher types 6 into a field
- **THEN** the field is marked refused with its reason, and the stored grade stays

#### Scenario: An absent student

- **WHEN** a student was marked absent in the only started sitting
- **THEN** the correction table has no row for them

#### Scenario: Moved to the other group

- **WHEN** a student with grades for every group-A question is moved to group B in the attendance table
- **THEN** their row shows the fields of group B's questions, empty unless graded before, and their group-A grades are kept

### Requirement: The result is the weighted mean of the grades' band midpoints

A grade for a question SHALL count as the fraction in the middle of that grade's band on the grading scale as it is now, the rule of every grade result (`gradebook`). A student's result SHALL be the sum, over the questions of their group, of each question's weight times its grade's fraction, divided by the group's total weight. The factor A:B SHALL apply to that result as it applies to any result of a two-group offline test (`offline-test`). A student SHALL have a result only once every question of their group has a grade. Until then they SHALL have no result, not a zero. A change of the scale, of a weight or of a grade SHALL change the result at once. The student's results page SHALL show the result like any result of its category, and SHALL NOT show the grades per question.

#### Scenario: A weighted result

- **WHEN** the scale is 88/75/63/50, a group's questions weigh 1, 2 and 1, and a student has the grades 1, 2 and 5
- **THEN** their result is (0.94 + 2 × 0.815 + 0.25) / 4 = 70.5 %, which the scale grades 3

#### Scenario: All fours

- **WHEN** a student has the grade 4 for every question
- **THEN** their result is 56.5 %, which the scale grades 4

#### Scenario: Not yet complete

- **WHEN** a student has grades for two of three questions
- **THEN** their field in the test's column is empty, their category is computed without it, and their results page shows nothing for the test

#### Scenario: The scale moves

- **WHEN** a teacher moves grade 2's threshold from 75 % to 77 %
- **THEN** every grade 2 of the test counts as 82.5 %, and the results change with it
