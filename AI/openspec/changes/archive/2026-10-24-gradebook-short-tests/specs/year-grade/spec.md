## MODIFIED Requirements

### Requirement: The winter semester counts towards the year grade with a weight of its own

A course's config sheet SHALL hold, beside the five category weights, the share in whole percent from 0 to 100 that the winter semester has in the year grade. A new course SHALL start at 50 %. The category weights SHALL keep applying within each semester as before.

#### Scenario: Setting the share

- **WHEN** a teacher sets the winter semester's share of `WMC 4BHIF` to 40 %
- **THEN** the year grade of every student of that course weighs the winter semester at 40 % and the summer semester at 60 %, and changing it later recalculates every year proposal while overrides stay untouched
