## Purpose

Defines a test's evaluation for its course (a class): the grade distribution, the averages and how many results are still missing, shown to teachers as a popup that opens from the gradebook sheet and from the test's own page.

## ADDED Requirements

### Requirement: Every test column of a course has an evaluation

The module SHALL evaluate every column of a course's sheet in the online-test, the manual-test and the short-test category (`gradebook-sheet`). That includes the column of an offline test (`offline-test`). Columns of homework, presentations, projects and participation SHALL have no evaluation. A course stands for one class (`class-roster`), so a column's evaluation is the evaluation for that class.

#### Scenario: A paper test

- **WHEN** a course has the manual-test column `1st test`
- **THEN** the column has an evaluation

#### Scenario: A homework

- **WHEN** a course has the homework column `Greeting service`
- **THEN** the column offers no evaluation

#### Scenario: An offline short test

- **WHEN** a course has an offline test that counts as a short test
- **THEN** its column in the short-test category has an evaluation

### Requirement: The evaluation shows the grade distribution, the averages and the missing results

A column's evaluation SHALL show:

- the column's name, its date and its category;
- the **grade distribution**: for each grade from 1 to 5, the number of results with that grade, as a number and as a bar whose length is proportional to that number. The bars of 1 and 2 SHALL be green, the bar of 5 red, and the bars of 3 and 4 neutral, following the grade colours (`gradebook-sheet`, "Rows are coloured by their grade"). Each number SHALL stay visible beside its bar, so the colour is never its only carrier. A grade with no result SHALL be shown with 0;
- the **average grade**: the mean of the results' grades, with one decimal;
- the **average percentage**: the mean of the results' fractions, as a whole percentage;
- the **number of results** and the **number of students without a result**.

A result's grade SHALL be the grade the sheet shows for it: the grading scale applied to its fraction, and for a result entered as a grade, that grade. Numbers SHALL be written in the teacher's locale (`locale-formats`). While the column holds no result, the evaluation SHALL show the distribution with 0 for every grade, no averages, and the number of students without a result.

#### Scenario: A test out of 24

- **WHEN** the scale is 88/75/63/50, the manual-test column `1st test` is out of 24, and four students have the results 22, 18, 16 and 11
- **THEN** the distribution reads one 1, one 2, one 3, none 4 and one 5
- **AND** the average grade is 2,8 and the average percentage 70 %

#### Scenario: Results still missing

- **WHEN** a course's roster has 25 students who have not left, and 22 of them have a result in a column
- **THEN** the evaluation shows 22 results and 3 without a result

#### Scenario: Nothing entered yet

- **WHEN** a teacher opens the evaluation of a column that holds no result, in a course of 25 students
- **THEN** every grade shows 0, no average is shown, and 25 are shown without a result

#### Scenario: A German-speaking teacher

- **WHEN** the average grade is 2.75 and the teacher's locale is German
- **THEN** the evaluation shows `2,8`

### Requirement: The evaluation counts the results the sheet shows

The evaluation SHALL count exactly the results the column shows in the sheet. For an online test, a result is a submitted attempt. A started attempt that is not submitted SHALL count as no result. For an offline test with two handouts, a result SHALL count with the factor A:B applied, as the sheet shows it (`offline-test`, "The groups of an offline test can be evened out by a factor A:B"). The students without a result SHALL be the students on the course's roster who have not left and have no result in the column. A student who has left SHALL count with their result if they have one, and SHALL NOT be counted as without a result if they do not.

#### Scenario: Still writing

- **WHEN** an online sitting is open, 20 participants have submitted and 5 are still writing
- **THEN** the evaluation shows 20 results and 5 without a result

#### Scenario: A raised group

- **WHEN** an offline test's factor is `A 1,00 : B 1,20`, and a student of group B has 15 of 24 entered
- **THEN** the student counts with 75 %, as in the sheet, and their result counts as a 2

#### Scenario: A student who left

- **WHEN** a student who wrote the test with a 4 has since left the roster, and another student left without a result
- **THEN** the 4 counts in the distribution, and neither of the two counts as without a result

### Requirement: The evaluation opens as a popup

The evaluation SHALL be shown as a popup over the page it was opened from, without leaving that page. It SHALL be closed with a close button, with Escape, and by choosing the shaded page behind it. Closing it SHALL leave the page as it was. The popup SHALL follow the page's light or dark mode, like the sheet's column dialog (`gradebook-sheet`, "The column dialog follows light and dark mode"), and every text and bar in it SHALL be legible in either mode. It SHALL show the results as they are when it is opened.

#### Scenario: Closing with Escape

- **WHEN** a teacher opens a column's evaluation from the sheet and presses Escape
- **THEN** the popup closes, and the sheet shows the same semester at the same scroll position

#### Scenario: Dark mode

- **WHEN** a teacher opens an evaluation in dark mode
- **THEN** the popup's background, text and neutral bars are dark-mode colours, and the green and red bars are legible against it

### Requirement: The sheet opens a column's evaluation from its header

Every evaluable column's header in the sheet SHALL hold a button that opens the column's evaluation. The button SHALL be a control of its own beside the header's existing button or link, so that choosing the header still opens the column's dialog and the date of an online test still links to the test. The button SHALL be named for screen readers by the column. It SHALL keep the header compact (`gradebook-sheet`, "A column's header is compact and shows its details on hover") and SHALL be reachable by keyboard. Columns without an evaluation SHALL have no such button.

#### Scenario: A manual test

- **WHEN** a teacher chooses the evaluation button in the header of the manual-test column `1st test`
- **THEN** the evaluation of `1st test` opens, and the column's dialog does not

#### Scenario: An online test

- **WHEN** a teacher chooses the evaluation button in the header of the online test `HTTP caching`
- **THEN** the evaluation of `HTTP caching` opens, and the page stays on the sheet

#### Scenario: A participation column

- **WHEN** a course has a participation column
- **THEN** its header has no evaluation button

### Requirement: A test's page opens its evaluation

The page of an online or offline test SHALL offer an evaluation button among its actions once the test has a column in the sheet. That is from its first sitting on for an online test (`gradebook-sheet`, "Online tests are read-only columns of their category"), and always for an offline test (`offline-test`, "An offline test is an editable column of its gradebook category"). The button SHALL open the same evaluation as the button in the column's header. A test without a column SHALL offer no evaluation.

#### Scenario: After the sitting

- **WHEN** a teacher opens the page of the online test `HTTP caching`, whose first sitting is over
- **THEN** the page offers the evaluation, and it shows the same numbers as the evaluation from the sheet

#### Scenario: An online test only assembled

- **WHEN** a teacher opens the page of an online test without any sitting
- **THEN** the page offers no evaluation

#### Scenario: An offline test

- **WHEN** a teacher opens the page of an offline test whose results are being entered in the sheet
- **THEN** the page offers the evaluation

### Requirement: Only teachers see an evaluation

An evaluation SHALL be shown only to teachers. A student SHALL NOT be able to open or request an evaluation, of their own course or of any other, and SHALL see nothing of it on their results or their Exams page.

#### Scenario: A student asks

- **WHEN** a student requests the evaluation of a column of their own course
- **THEN** the request is refused, and nothing of the evaluation is returned
