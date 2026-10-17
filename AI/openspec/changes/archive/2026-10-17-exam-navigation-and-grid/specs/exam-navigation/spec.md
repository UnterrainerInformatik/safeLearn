## Purpose

Defines how a teacher moves between the exam module's school years, classes, courses and gradebooks, and where new ones are created: one bar on every module page, chosen from left to right.

## ADDED Requirements

### Requirement: Every teacher page of the module carries the module's bar

Every page of the module that only a session acting as a teacher can open SHALL carry a bar directly under the instance's top bar. From left to right the bar SHALL hold four positions: school year, class, course and gradebook. The bar SHALL be part of the page as it is first shown, not a separate page. The page of a student's own results, which every session can open, SHALL NOT carry it, and neither SHALL an element embedded in a content page.

#### Scenario: A teacher opens a course's gradebook

- **WHEN** a teacher opens the gradebook of `WMC 4BHIF 2026/27`
- **THEN** the bar shows `2026/27`, `4BHIF`, `WMC` and the gradebook's semester, from left to right

#### Scenario: A student opens their results

- **WHEN** a student opens their own results
- **THEN** the page carries no module bar

### Requirement: Each position is a choice that depends on the positions to its left

Each position SHALL offer, as a dropdown, the choices that exist under what is chosen to its left: every school year; the classes of the chosen year; the courses of the chosen class; and the gradebook's semesters (winter semester, whole year) of the chosen course. Choosing a value SHALL open the page for that choice. Changing a position SHALL clear the positions to its right that no longer apply. A position with nothing chosen to its left SHALL be shown but offer no choice. The current school year SHALL be chosen when nothing else is.

#### Scenario: Switching class

- **WHEN** a teacher looks at the gradebook of `WMC 4BHIF` and chooses `4AHIF` in the class position
- **THEN** the class page of `4AHIF` opens, and the course position offers the courses of `4AHIF` with none chosen

#### Scenario: Switching year

- **WHEN** a teacher chooses `2027/28` in the school-year position
- **THEN** the class position offers the classes of `2027/28` only

### Requirement: Each position links to its overview

Each position SHALL link to the overview table of what it names: the school year to the list of its classes, the class to its roster and courses, the course to its config sheet, and the gradebook to the course's sheet for the chosen semester.

#### Scenario: Back to the class

- **WHEN** a teacher on a course's gradebook follows the class position's link
- **THEN** the class's page opens with its roster and courses

### Requirement: New records are created from the bar, left to right

Each of the first three positions SHALL offer to create a new one of its kind: a new school year at any time, a new class in the chosen school year, and a new course in the chosen class. A position SHALL offer this only when every position to its left has a value. Creating SHALL use the same rules and refusals as before (a duplicate class or course is refused), and the new record SHALL be chosen in the bar afterwards.

#### Scenario: A new course

- **WHEN** `2026/27` and `4BHIF` are chosen and the teacher creates the course `NVS`
- **THEN** the course exists, the bar shows `NVS` in the course position, and its config sheet is open

#### Scenario: No class chosen

- **WHEN** a school year is chosen but no class
- **THEN** the course position offers no way to create a course

### Requirement: The bar follows the student-view downgrade

The bar SHALL be shown only to a session acting as a teacher, and every action it offers SHALL be decided on the server as before. A teacher in student view SHALL see no bar, because no teacher page is shown to them.

#### Scenario: A teacher in student view

- **WHEN** a teacher in student view opens a module page
- **THEN** no bar is shown and no request for the bar's choices is made
