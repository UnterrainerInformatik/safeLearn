# class-roster Specification

## Purpose
Defines school years, the classes that belong to them, who actually attends a class, and the courses (class × subject × school year) that tests and grades are kept in.

## Requirements

### Requirement: A school year holds classes and has one current year

The module SHALL keep school years (e.g. `2026/27`), each with a start date, the date the second semester begins, and an end date. The two semesters are the winter semester (WS) and the summer semester (SS). Exactly one school year SHALL be current at a time. Classes, rosters and courses SHALL belong to one school year. A teacher SHALL be able to create the next school year in advance.

#### Scenario: Two years exist

- **WHEN** both `2026/27` and `2027/28` exist and `2026/27` is current
- **THEN** course lists and student pages show `2026/27` unless another year is chosen explicitly

### Requirement: A roster is chosen from the class's directory unit, not copied from it

When a teacher creates a class for a school year, the module SHALL offer every member of the class's directory unit (its LDAP OU, as held by the directory service) as a checklist, with nobody ticked in advance. Only the ticked people SHALL become the class's roster. The directory SHALL NOT change a roster afterwards on its own.

#### Scenario: A 5th-year class with former students

- **WHEN** a teacher creates `5AHIF` and the directory unit holds 70 members, of whom 25 attend this year
- **THEN** the checklist shows all 70, the teacher ticks 25, and the roster holds exactly those 25

#### Scenario: The directory changes later

- **WHEN** a student is added to the class's directory unit after the roster was created
- **THEN** the roster is unchanged until a teacher adds that student

### Requirement: A roster can be maintained during the year

A teacher SHALL be able to add a student to a roster (from the class's directory unit or from the whole directory) and to remove one. Removing a student SHALL keep the grades and attempts already recorded for them in that class's courses, marked as belonging to a student who has left the roster.

#### Scenario: A student changes class mid-year

- **WHEN** a teacher removes a student from `3AHIF` and adds them to `3BHIF`
- **THEN** their grades in `3AHIF`'s courses remain visible to the teachers of those courses, marked as left
- **AND** they appear in `3BHIF`'s courses from then on

### Requirement: A course is a class, a subject and a school year with its own language and config sheet

A course SHALL be identified by class, subject and school year. It SHALL have a language (`de` or `en`) that decides in which language its tests are presented, and a config sheet holding the weights of the gradebook categories. A course SHALL have no owner: every teacher SHALL be able to see and edit every course.

#### Scenario: Creating a course

- **WHEN** a teacher creates the course `WMC` for `4BHIF` in `2026/27` with language `en`
- **THEN** the course exists once, any second attempt to create the same triple is refused, and every teacher sees it

#### Scenario: One set of weights per course

- **WHEN** a teacher sets the weights on a course's config sheet
- **THEN** they apply to every student of the course and every semester of it
- **AND** changing them later recalculates every proposal of that course, and overrides stay untouched
