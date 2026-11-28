## Purpose

Defines which teachers are entered in a class of the exam module, who maintains that list, and how it limits a teacher to the classes they teach, while an admin keeps seeing every class.

## ADDED Requirements

### Requirement: A class holds the teachers entered in it, maintained by an admin

Every class SHALL hold a list of the teachers entered in it, as directory usernames. Because a class belongs to one school year, the list SHALL belong to that year's class only. Only a session acting as an admin SHALL be able to enter a teacher in a class or remove one. It SHALL choose from the directory people who are teachers. A username that is not a teacher in the directory SHALL be refused with `400`. The class page SHALL show its entered teachers to every session that sees the class. Entering and removing SHALL take effect with the next request of the teacher concerned, without logging in anew. The list decides who may look at a class, and is no record of the year. A closed school year SHALL therefore not keep an admin from changing it, while everything else of that year stays read-only.

#### Scenario: Entering a teacher in a closed year

- **WHEN** an admin enters `mhuber` in `3AHIF 2025/26`, whose year is closed
- **THEN** `mhuber` sees `3AHIF 2025/26` read-only, and no result or roster of that year has changed

#### Scenario: An admin enters a teacher

- **WHEN** an admin enters the teacher `amaier` in `4BHIF 2026/27`
- **THEN** the class page of `4BHIF` lists `amaier`, and `amaier`'s next request sees `4BHIF`

#### Scenario: A teacher tries to enter themselves

- **WHEN** a session acting as a teacher but not as an admin calls the route that enters a teacher in a class
- **THEN** the answer is `403` and the list is unchanged

#### Scenario: A student is entered as a teacher

- **WHEN** an admin tries to enter a username that the directory holds as a student
- **THEN** the answer is `400` and the list is unchanged

#### Scenario: A teacher is removed

- **WHEN** an admin removes `amaier` from `4BHIF` while `amaier` has the class's gradebook open
- **THEN** `amaier`'s next request for the gradebook is answered as a path with nothing behind it

### Requirement: A teacher sees only the classes they are entered in

A session that acts as a teacher but not as an admin SHALL see a class only when it is entered in it. Seeing a class SHALL cover everything that belongs to it: its roster, its courses and their config sheets, gradebooks, columns, results, notes and evaluations, its tests and their sittings, live views, attempts, paper correction and handouts, and the pages of its students within its courses. A class the session does not see, and everything that belongs to it, SHALL appear nowhere for that session: not in the module's bar, not in an overview, not in a list (including the list of all tests), and not in a live update. Every page of it SHALL be answered as a path with nothing behind it, and every API call naming it, reading or writing, SHALL be answered with `404` and change nothing, the same as for a record that does not exist. A module element embedded in a content page SHALL render for that session as for a record that does not exist. School years and the question pool SHALL stay visible to every teacher. A student's own pages SHALL be unaffected.

#### Scenario: The overview of a school year

- **WHEN** a teacher entered only in `4BHIF` and `5CHIF` opens the overview of `2026/27`, which has twelve classes
- **THEN** it lists `4BHIF` and `5CHIF` and no other class

#### Scenario: A guessed URL

- **WHEN** a teacher not entered in `3AHIF` opens the gradebook of a `3AHIF` course by its URL
- **THEN** the page is answered as a path with nothing behind it, as for a course that does not exist

#### Scenario: A write to another class

- **WHEN** a teacher not entered in `3AHIF` sends a result for a column of a `3AHIF` course
- **THEN** the answer is `404` and nothing is stored

#### Scenario: The list of all tests

- **WHEN** a teacher entered only in `4BHIF` opens the list of tests
- **THEN** it holds only tests of `4BHIF`'s courses

#### Scenario: A live view of another class

- **WHEN** a sitting of a `3AHIF` course is running and a teacher not entered in `3AHIF` subscribes to live updates
- **THEN** that teacher receives no update about that sitting

#### Scenario: A student keeps their own pages

- **WHEN** a student of `3AHIF` opens their own results while no teacher is entered in `3AHIF`
- **THEN** they see their results as before

### Requirement: An admin sees every class

A session acting as an admin SHALL see every class and everything belonging to it, whether it is entered in the class or not, and SHALL be able to do there everything an entered teacher can.

#### Scenario: An admin opens a class without teachers

- **WHEN** an admin opens a class that has no teacher entered
- **THEN** the class page opens with its roster and courses

### Requirement: An admin finds the classes without teachers

The overview of a school year SHALL show an admin, for every class, how many teachers are entered in it. Classes without any teacher SHALL be listed first and marked as such.

#### Scenario: After the migration

- **WHEN** an admin opens the overview of the current year right after the change was deployed
- **THEN** every class is marked as having no teacher, and entering teachers in a class removes that mark
