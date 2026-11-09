## MODIFIED Requirements

### Requirement: A student sees their own results live, and only their own

A student SHALL be able to see, for each of their courses, their own entries, category fractions and effective grade, except for the entries and categories of a category weighted 0 % (`gradebook-sheet`). Each entry SHALL show the note a teacher set in its cell, where there is one, and a column holding only a note for the student SHALL be shown as defined by `gradebook-sheet`. Notes of a category weighted 0 % SHALL be hidden with its entries. A project's `+`/`−` marks SHALL be shown under their project, marked as not counting. The entry of an online test SHALL link to the review of the attempt once that review is open to the student (`exam-attempt-review`). While no override exists the student SHALL see the proposal. Once one exists, the student SHALL see the override and SHALL NOT see the proposal. The teacher's comment SHALL be shown only if the teacher marks it as visible to the student. A student SHALL NOT be able to see any other student's data by any request, their notes included.

#### Scenario: Override appears

- **WHEN** a teacher sets an override for a student's semester
- **THEN** that student's page shows the override grade the next time it is loaded, and no longer shows the proposal

#### Scenario: Asking for someone else

- **WHEN** a student requests the results of another student through the module API
- **THEN** the request is refused

#### Scenario: A project with its marks

- **WHEN** a student has the end grade 2 and the marks `+`, `+`, `−` in the project `Webshop`
- **THEN** their results show `Webshop` with the grade 2, and below it the three marks with their dates, marked as for the record only

#### Scenario: A note appears

- **WHEN** a teacher sets a note in a student's cell of the presentation column `Referat Git`
- **THEN** that student's page shows the note beside the presentation's grade the next time it is loaded

#### Scenario: A note in a hidden category

- **WHEN** a student has a note in a homework column and the course's homework weight is set to 0 %
- **THEN** the student's page shows neither the homework column nor its note, and shows both again once the weight is above 0 %

#### Scenario: An online test to look back at

- **WHEN** the sitting of a student's online test `HTTP caching` is over
- **THEN** the student's row of `HTTP caching` links to the review of their attempt
