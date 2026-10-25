# year-grade Specification

## Purpose
Defines how the year grade, proposed at the end of the summer semester, takes the winter semester into account: as the winter semester's result with a weight of its own, set per course, rather than by counting the winter's entries again.

## Requirements

### Requirement: The winter semester counts towards the year grade with a weight of its own

A course's config sheet SHALL hold, beside the seven category weights, the share in whole percent from 0 to 100 that the winter semester has in the year grade. A new course SHALL start at 50 %. The category weights SHALL keep applying within each semester as before.

#### Scenario: Setting the share

- **WHEN** a teacher sets the winter semester's share of `WMC 4BHIF` to 40 %
- **THEN** the year grade of every student of that course weighs the winter semester at 40 % and the summer semester at 60 %, and changing it later recalculates every year proposal while overrides stay untouched

### Requirement: The year proposal is the weighted mean of the two semesters

The summer-semester proposal - the year grade - SHALL be computed as the winter semester's fraction times its share plus the summer semester's own fraction times the rest. The summer semester's own fraction SHALL be computed from the entries dated in the summer semester only, exactly as the winter semester's is from its own. The winter semester's fraction SHALL be its proposal's fraction while it has no override. Once it has one, it SHALL be the fraction that stands for the override grade: the middle of that grade's range on the grading scale (for the initial scale 94 % for a 1, 81.5 % for a 2, 69 % for a 3, 56.5 % for a 4, 25 % for a 5). If one semester has no fraction, the year proposal SHALL be the other's. If neither has one, there SHALL be no year proposal. The grading scale SHALL turn the result into the grade, as for every proposal.

#### Scenario: Both semesters present

- **WHEN** the share is 50 %, the winter semester's proposal is 0.80 without an override, and the summer semester's own fraction is 0.70
- **THEN** the year proposal is 0.75 and grade 2

#### Scenario: An overridden winter semester

- **WHEN** the share is 50 %, the winter semester is overridden to 1, and the summer semester's own fraction is 0.70
- **THEN** the year proposal is (0.94 + 0.70) / 2 = 0.82 and grade 2

#### Scenario: No summer entries yet

- **WHEN** a student has no entry dated in the summer semester
- **THEN** the year proposal is the winter semester's fraction and its grade

### Requirement: The summer sheet shows the winter result it builds on

In the gradebook for the whole year, each student's row SHALL show the winter semester's grade, marked as an override where it is one, beside the year proposal. The year view's columns SHALL be the summer semester's columns. The winter columns SHALL stay in the winter view. A student's own results SHALL show the year grade as before, under the same rules for proposal and override.

#### Scenario: The year view

- **WHEN** a teacher opens the gradebook for the whole year
- **THEN** each row shows the winter grade, the year proposal, the override and the grade on the left, followed by the summer semester's columns only
