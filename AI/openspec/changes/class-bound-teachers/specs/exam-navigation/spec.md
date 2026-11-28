## MODIFIED Requirements

### Requirement: Each position is a choice that depends on the positions to its left

Each position SHALL offer, as a dropdown, the choices that exist under what is chosen to its left and that the session sees (`class-teachers`): every school year; the classes of the chosen year; the courses of the chosen class; and the gradebook's semesters (winter semester, whole year) of the chosen course. Choosing a value SHALL open the page for that choice. Changing the year or the class SHALL keep the positions to its right where the new choice has their match - the class of the same name, the course of the same subject (both regardless of capitalization) - and SHALL then open the page shown before for the kept record, a gradebook in the same semester; positions without a match SHALL be cleared. A position with nothing chosen to its left SHALL be shown but offer no choice. The current school year SHALL be chosen when nothing else is.

#### Scenario: Switching class

- **WHEN** a teacher looks at the winter-semester gradebook of `WMC 5CHIF` and chooses `4BHIF` in the class position, and `4BHIF` has a course `WMC`
- **THEN** the winter-semester gradebook of `WMC 4BHIF` opens

#### Scenario: Switching to a class without the subject

- **WHEN** a teacher looks at the gradebook of `WMC 4BHIF` and chooses `4AHIF` in the class position, and `4AHIF` has no course `WMC`
- **THEN** the class page of `4AHIF` opens, and the course position offers the courses of `4AHIF` with none chosen

#### Scenario: Switching year

- **WHEN** a teacher chooses `2027/28` in the school-year position
- **THEN** the class position offers only the classes of `2027/28` that the teacher sees

#### Scenario: Classes the teacher is not entered in

- **WHEN** a teacher entered in `4BHIF` and `5CHIF` opens the class position of `2026/27`, which has twelve classes
- **THEN** it offers `4BHIF` and `5CHIF` and nothing else

### Requirement: New records are created from the bar, left to right

Each of the first three positions SHALL offer to create a new one of its kind: a new school year at any time, a new class in the chosen school year, and a new course in the chosen class. A position SHALL offer this only when every position to its left has a value. The class position SHALL offer it only to a session acting as an admin. Creating SHALL use the same rules and refusals as before (a duplicate class or course is refused), and the new record SHALL be chosen in the bar afterwards.

#### Scenario: A new course

- **WHEN** `2026/27` and `4BHIF` are chosen and a teacher entered in `4BHIF` creates the course `NVS`
- **THEN** the course exists, the bar shows `NVS` in the course position, and its config sheet is open

#### Scenario: No class chosen

- **WHEN** a school year is chosen but no class
- **THEN** the course position offers no way to create a course

#### Scenario: A teacher who is no admin

- **WHEN** a session acting as a teacher but not as an admin has a school year chosen
- **THEN** the class position offers no way to create a class

## ADDED Requirements

### Requirement: A position with a single choice is chosen at once

When the class position or the course position has nothing chosen and offers the session exactly one choice, the bar SHALL choose it at once and open the page for it, as if the teacher had chosen it. This SHALL carry on to the right: a single class with a single course SHALL lead straight to that course's page. It SHALL apply on the module's start for a teacher and after the year or class is changed. It SHALL NOT apply to the semester position. It SHALL NOT change a choice the teacher made, so a teacher who follows a position's link to its overview stays on that overview.

#### Scenario: A teacher with one class and one course

- **WHEN** a teacher entered only in `4BHIF`, which has only the course `WMC`, opens the module
- **THEN** the bar shows `2026/27`, `4BHIF` and `WMC`, and the config sheet of `WMC 4BHIF` is open

#### Scenario: A teacher with one class and several courses

- **WHEN** a teacher entered only in `4BHIF`, which has the courses `WMC` and `NVS`, opens the module
- **THEN** the bar shows `4BHIF` chosen and the class page of `4BHIF` is open, with no course chosen

#### Scenario: A teacher with several classes

- **WHEN** a teacher entered in `4BHIF` and `5CHIF` opens the module
- **THEN** no class is chosen, and the overview of the current school year is open

#### Scenario: Back to the class overview

- **WHEN** a teacher with a single course follows the class position's link
- **THEN** the class page opens and stays open, without jumping to the course
