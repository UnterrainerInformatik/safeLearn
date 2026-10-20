## Purpose

Defines how a school year is closed and the next one started, so that classes, rosters and courses move on while past grades stay where they belong, and how the records of students who have left are removed once the retention period has passed.

## ADDED Requirements

### Requirement: Closing a school year makes it read-only

A teacher SHALL be able to close a school year once its end date has passed and it is not the current year, after a confirmation that states the year cannot be changed afterwards. A closed year's classes, rosters, courses, gradebook columns, results, overrides, tests, sittings and attempts SHALL remain readable by teachers and by the students they belong to, and SHALL no longer be changed by anyone, through any route. A closed year SHALL NOT be reopened.

#### Scenario: Editing a closed year

- **WHEN** a teacher tries to add an entry to a course of a closed school year
- **THEN** it is refused with a message that the school year is closed, and nothing is written

#### Scenario: Closing too early

- **WHEN** a teacher tries to close a school year whose end date has not passed, or the current school year
- **THEN** it is refused

#### Scenario: Reading a closed year

- **WHEN** a teacher opens the gradebook of a course in a closed school year
- **THEN** it shows every result and proposal as before, with every write control disabled

### Requirement: The next year starts from the old one, not from nothing

Starting a school year SHALL offer, for each class of the previous year, the class one level up (e.g. `3AHIF` → `4AHIF`) with its previous roster as a pre-ticked checklist next to the current members of the new class's directory unit. A class without a successor (a fifth-year class) SHALL be shown as such. The teacher SHALL confirm the roster before it is created. Courses SHALL be offered for copying with their language, weights and winter share, without columns, results or tests.

#### Scenario: Moving a class up

- **WHEN** a teacher starts `2027/28` and `3AHIF` existed in `2026/27`
- **THEN** `4AHIF` is offered with last year's `3AHIF` roster ticked and the directory's current `4AHIF` members shown beside it

#### Scenario: Copying a course

- **WHEN** the teacher creates `4AHIF` with the course `WMC` ticked for copying
- **THEN** `4AHIF` has a course `WMC` with the same language, weights and winter share, and no gradebook column and no test

### Requirement: Data of students who have left is kept for the retention period, then removed

Records of a student who is on no roster of the current year SHALL be kept until the retention period has passed since the end of the last school year they were on a roster, and then deleted by the year change: their results, overrides, attempts, sitting participations, roster entries and the student record. The year change SHALL state, before it deletes anything, how many students and how many records of each kind it is about to remove, without names, and SHALL delete only after the teacher confirms. If the counts have changed since the report, the deletion SHALL be refused.

#### Scenario: Retention elapsed

- **WHEN** a year change runs and the last school year a student was on a roster ended more than the retention period ago
- **THEN** the year change reports that student among those to be removed, and removes their records after confirmation

#### Scenario: Retention not yet elapsed

- **WHEN** a student left at the end of `2026/27` and the retention period is two years
- **THEN** a year change in 2028 does not report them, and one after the end of `2028/29` does

#### Scenario: Still on a roster

- **WHEN** a student is on a roster of the current year
- **THEN** none of their records are reported or removed, however old

### Requirement: The retention period is deployment configuration

The retention period SHALL be read from `EXAM_RETENTION_YEARS` as a whole number of years from 1 to 10, with 2 when the variable is unset. A malformed value SHALL switch the module off for that run with a log message naming the variable, and the reader SHALL keep serving.

#### Scenario: Malformed period

- **WHEN** the server starts with `EXAM_MODULE=on` and `EXAM_RETENTION_YEARS=two`
- **THEN** the module is disabled with a message naming `EXAM_RETENTION_YEARS`, and pages are served as without the module
