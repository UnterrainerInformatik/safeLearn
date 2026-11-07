## ADDED Requirements

### Requirement: Rows are coloured by their grade

Wherever a row of the gradebook stands for a grade, it SHALL be coloured by that grade, following the module's row colours (`exam-ui-conventions`): a **5** red (bad), a **1 or 2** green (good), a **3 or 4** neutral, and a row **without a grade** neutral.

- **The sheet:** each student's row SHALL be coloured by the student's effective grade for the semester or the year shown: the teacher's override, or else the proposal. The colour SHALL follow every saved change of a result or of the override at once, without a reload. The rows of students who left SHALL be coloured the same way.
- **A student's record**, as a teacher sees it: the rows of the categories SHALL be coloured by each category's grade, the winter row by the winter grade, the proposal row by the proposal, and the row of the actual grade by the effective grade.
- **The results tables**, the student's own results and the entries on a student's record: each result's row SHALL be coloured by the grade of that result. A row without a grade, such as a project's mark, SHALL stay neutral.

The grade itself SHALL stay visible in the row, so the colour is never its only carrier.

#### Scenario: A failing student

- **WHEN** a student's effective grade in the winter semester is 5
- **THEN** the student's row in the winter sheet is red

#### Scenario: A good student

- **WHEN** a student's proposal is 2 and there is no override
- **THEN** the student's row is green

#### Scenario: Neither

- **WHEN** a student's effective grade is 3, or the student has no result yet
- **THEN** the student's row is not coloured

#### Scenario: The override decides

- **WHEN** a student's proposal is 5 and the teacher sets the override to 4
- **THEN** the row turns from red to neutral as soon as the override is saved

#### Scenario: A new result changes the colour

- **WHEN** a teacher enters a result that moves a student's proposal from 3 to 2
- **THEN** the student's row turns green once the result is saved, without a reload

#### Scenario: The student's own results

- **WHEN** a student opens their results and one test was graded 5 and another 1
- **THEN** the row of the first is red and the row of the second is green
