## MODIFIED Requirements

### Requirement: Data of students who have left is kept for the retention period, then removed

Records of a student who is on no roster of the current year SHALL be kept until the retention period has passed since the end of the last school year they were on a roster, and then deleted by the year change: their results, notes, overrides, attempts, sitting participations, roster entries and the student record. The year change SHALL state, before it deletes anything, how many students and how many records of each kind it is about to remove, without names, and SHALL delete only after the teacher confirms. If the counts have changed since the report, the deletion SHALL be refused.

#### Scenario: Retention elapsed

- **WHEN** a year change runs and the last school year a student was on a roster ended more than the retention period ago
- **THEN** the year change reports that student among those to be removed, and removes their records after confirmation

#### Scenario: Retention not yet elapsed

- **WHEN** a student left at the end of `2026/27` and the retention period is two years
- **THEN** a year change in 2028 does not report them, and one after the end of `2028/29` does

#### Scenario: Still on a roster

- **WHEN** a student is on a roster of the current year
- **THEN** none of their records are reported or removed, however old

#### Scenario: Notes are counted

- **WHEN** a leaver who is due holds three results and two notes
- **THEN** the report counts the three results and, as a kind of its own, the two notes, and both are removed after confirmation
