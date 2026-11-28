## MODIFIED Requirements

### Requirement: A roster is chosen from the class's directory unit, not copied from it

Only a session acting as an admin SHALL create a class. When it creates a class for a school year, the module SHALL offer every member of the class's directory unit (its LDAP OU, as held by the directory service) as a checklist, with nobody ticked in advance, and SHALL offer the directory's teachers to enter in the class (`class-teachers`). Only the ticked people SHALL become the class's roster. The directory SHALL NOT change a roster afterwards on its own. A session acting as a teacher but not as an admin SHALL receive `403` from the route that creates a class.

#### Scenario: A 5th-year class with former students

- **WHEN** an admin creates `5AHIF` and the directory unit holds 70 members, of whom 25 attend this year
- **THEN** the checklist shows all 70, the admin ticks 25, and the roster holds exactly those 25

#### Scenario: The directory changes later

- **WHEN** a student is added to the class's directory unit after the roster was created
- **THEN** the roster is unchanged until a teacher of the class adds that student

#### Scenario: A teacher tries to create a class

- **WHEN** a session acting as a teacher but not as an admin calls the route that creates a class
- **THEN** the answer is `403` and no class is created

### Requirement: A roster can be maintained during the year

A teacher entered in a class, or an admin, SHALL be able to add a student to the class's roster (from the class's directory unit or from the whole directory) and to remove one. Removing a student SHALL keep the grades and attempts already recorded for them in that class's courses, marked as belonging to a student who has left the roster.

#### Scenario: A student changes class mid-year

- **WHEN** a teacher entered in `3AHIF` and `3BHIF` removes a student from `3AHIF` and adds them to `3BHIF`
- **THEN** their grades in `3AHIF`'s courses remain visible to the teachers of `3AHIF`, marked as left
- **AND** they appear in `3BHIF`'s courses from then on

#### Scenario: A teacher of another class

- **WHEN** a teacher not entered in `3AHIF` tries to add a student to its roster
- **THEN** the answer is `404` and the roster is unchanged

### Requirement: A course is a class, a subject and a school year with its own language and config sheet

A course SHALL be identified by class, subject and school year. It SHALL have a language (`de` or `en`) that decides in which language its tests are presented, and a config sheet holding the weights of the gradebook categories. A course SHALL have no owner: every teacher entered in its class, and every admin, SHALL be able to see and edit it, and nobody else (`class-teachers`).

#### Scenario: Creating a course

- **WHEN** a teacher entered in `4BHIF` creates the course `WMC` for `4BHIF` in `2026/27` with language `en`
- **THEN** the course exists once, any second attempt to create the same triple is refused, and every teacher entered in `4BHIF` sees it

#### Scenario: A teacher of another class

- **WHEN** a teacher not entered in `4BHIF` looks for the course `WMC` of `4BHIF`
- **THEN** it appears in none of their lists, and its pages are answered as paths with nothing behind them

#### Scenario: One set of weights per course

- **WHEN** a teacher sets the weights on a course's config sheet
- **THEN** they apply to every student of the course and every semester of it
- **AND** changing them later recalculates every proposal of that course, and overrides stay untouched
