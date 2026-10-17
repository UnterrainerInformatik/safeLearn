## Purpose

Defines how a school year is closed and the next one started, so that classes, rosters and courses move on while past grades stay where they belong.

## ADDED Requirements

### Requirement: Closing a school year makes it read-only

A teacher SHALL be able to close a school year once its end date has passed. A closed year's courses, entries, attempts and grades SHALL remain readable by teachers and by the students they belong to, and SHALL no longer be changed by anyone.

#### Scenario: Editing a closed year

- **WHEN** a teacher tries to add an entry to a course of a closed school year
- **THEN** it is refused

### Requirement: The next year starts from the old one, not from nothing

Starting a school year SHALL offer, for each class of the previous year, the class one level up (e.g. `3AHIF` → `4AHIF`) with its previous roster as a pre-ticked checklist next to the current members of the new class's directory unit. The teacher SHALL confirm the roster before it is created. Courses SHALL be offered for copying with their language and config sheet, without entries.

#### Scenario: Moving a class up

- **WHEN** a teacher starts `2027/28` and `3AHIF` existed in `2026/27`
- **THEN** `4AHIF` is offered with last year's `3AHIF` roster ticked and the directory's current `4AHIF` members shown beside it

### Requirement: Data of students who have left is kept for the retention period, then removed

Records of a student who is on no roster of the current year SHALL be kept for the retention period and then deleted by the year change. The year change SHALL state, before it deletes anything, how many students and records it is about to remove, and SHALL delete only after the teacher confirms.

#### Scenario: Retention elapsed

- **WHEN** a year change runs and a student's last roster entry is older than the retention period
- **THEN** the year change reports that student among those to be removed, and removes their records after confirmation
