## ADDED Requirements

### Requirement: The grading scale shows the grade colours

The grading scale's table SHALL colour its rows with the grade colours of the gradebook (`gradebook-sheet`): the rows of grades 1 and 2 green, the row of grade 5 red, and the rows of grades 3 and 4 neutral. The scale thereby shows which grades the colours stand for wherever else they appear. The colours SHALL NOT depend on the thresholds entered.

#### Scenario: The scale's rows

- **WHEN** a teacher opens the grading scale
- **THEN** the rows for 1 and 2 are green, the row for 5 is red, and the rows for 3 and 4 are not coloured
