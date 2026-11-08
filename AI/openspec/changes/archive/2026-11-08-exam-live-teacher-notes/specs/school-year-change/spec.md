## MODIFIED Requirements

### Requirement: Closing a school year makes it read-only

A teacher SHALL be able to close a school year once its end date has passed and it is not the current year, after a confirmation that states the year cannot be changed afterwards. A closed year's classes, rosters, courses, gradebook columns, results, overrides, tests, sittings, attempts and teachers' notes on participants SHALL remain readable by teachers and by the students they belong to, and SHALL no longer be changed by anyone, through any route. A closed year SHALL NOT be reopened.

#### Scenario: Editing a closed year

- **WHEN** a teacher tries to add an entry to a course of a closed school year
- **THEN** it is refused with a message that the school year is closed, and nothing is written

#### Scenario: Closing too early

- **WHEN** a teacher tries to close a school year whose end date has not passed, or the current school year
- **THEN** it is refused

#### Scenario: Reading a closed year

- **WHEN** a teacher opens the gradebook of a course in a closed school year
- **THEN** it shows every result and proposal as before, with every write control disabled

#### Scenario: A teacher note in a closed year

- **WHEN** a teacher opens the live view of a sitting in a closed school year
- **THEN** the participants' teacher notes are shown, the note fields are disabled, and a write to a note is refused with the message that the school year is closed

### Requirement: Data of students who have left is kept for the retention period, then removed

Records of a student who is on no roster of the current year SHALL be kept until the retention period has passed since the end of the last school year they were on a roster, and then deleted by the year change: their results, notes, teachers' notes on participants, overrides, attempts, sitting participations, roster entries and the student record. The year change SHALL state, before it deletes anything, how many students and how many records of each kind it is about to remove, without names, and SHALL delete only after the teacher confirms. If the counts have changed since the report, the deletion SHALL be refused.

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

#### Scenario: Teacher notes are counted

- **WHEN** a leaver who is due holds two cell notes and one teacher note from a live view
- **THEN** the report counts the two notes and, as a kind of its own, the one teacher note, and both are removed after confirmation
