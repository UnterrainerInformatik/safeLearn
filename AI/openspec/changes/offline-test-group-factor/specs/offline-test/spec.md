## ADDED Requirements

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
