## Purpose

Defines the exam module as a part of SafeLearn that a deployment switches on: what exists when it is off, how it starts and fails, where its data lives, who may use it and which identity it records people under.

## ADDED Requirements

### Requirement: The module exists only when the deployment switches it on

The exam module SHALL be active only when the deployment's environment sets `EXAM_MODULE=on`. With any other value or none, the instance SHALL behave as an instance without the module: no module code is loaded, no database file is opened or created, no `/exam` route is answered by the module, and no page shows a link, menu entry or control that leads to it.

#### Scenario: The switch is absent

- **WHEN** an instance starts without `EXAM_MODULE` in its environment
- **THEN** no database file is created under the data directory
- **AND** a request to any path under `/exam/` is answered as a path with nothing behind it
- **AND** every rendered page is identical to the page the same instance renders without the module's code installed

#### Scenario: The switch is on

- **WHEN** an instance starts with `EXAM_MODULE=on` and a writable data directory
- **THEN** the module's routes under `/exam/` are answered for authenticated sessions
- **AND** the start-up log states that the module is active and names the database file

### Requirement: A module failure never stops the reader

When the module cannot start — the database cannot be opened, a migration fails, the data directory is missing or read-only — the instance SHALL log the cause and continue as an instance with the module switched off. A failure inside a module request SHALL fail that request alone. The rendering of pages, the navigation, the search and the sessions of all users SHALL be unaffected in both cases.

#### Scenario: The data directory is read-only

- **WHEN** an instance starts with `EXAM_MODULE=on` and the data directory cannot be written
- **THEN** the instance serves pages as it would without the module
- **AND** the log names the module as disabled and states why

#### Scenario: A migration fails

- **WHEN** a schema migration fails during start-up
- **THEN** the database is left at the last schema version that applied completely
- **AND** the module is disabled for this run and the reader keeps serving

#### Scenario: A module request throws

- **WHEN** a request under `/exam/` fails with an unexpected error
- **THEN** that request is answered with a server error
- **AND** the process keeps running and every other session stays logged in

### Requirement: The module's data lives in one database file on the persistent volume

The module SHALL keep all of its state in a single SQLite database file in the data directory (`/app/data` in the image). The schema SHALL be versioned, and an instance SHALL bring an older database up to its own schema version at start-up, in order, without losing data. An instance SHALL refuse to open a database whose schema version is newer than its own and SHALL then disable the module.

#### Scenario: A redeploy

- **WHEN** a deployment is replaced by a newer image on the same data volume
- **THEN** every record written before is still present after the restart

#### Scenario: A downgrade

- **WHEN** an image older than the database's schema version starts on that database
- **THEN** the module is disabled, the database file is left untouched, and the log names both versions

### Requirement: The database is backed up before it changes shape and regularly while it runs

Before applying any migration, the module SHALL write a consistent copy of the database next to it. While running, the module SHALL write a consistent copy at least once a day, keeping a bounded number of copies. A copy SHALL be readable as a database on its own.

#### Scenario: A migration is applied

- **WHEN** an instance finds the database at an older schema version
- **THEN** a copy of the database at that older version exists before the first migration step runs

#### Scenario: Copies are bounded

- **WHEN** the module has been running for longer than its retention of daily copies
- **THEN** the oldest copies beyond that retention have been removed

### Requirement: The module answers only to an authenticated session and decides teacher and student by the existing role rules

Every module route SHALL require an authenticated session, exactly as the content routes do. Whether a session acts as a teacher SHALL be decided by the same role resolution the content uses: `teacher` or `admin` after merging client roles and LDAP groups. Teacher actions SHALL be refused to any other session. The student-view toggle SHALL apply to the module exactly as it applies to content: a teacher in student view SHALL be treated as a student, so the module's teacher pages and teacher-only elements SHALL NOT be shown and teacher actions SHALL be refused. This SHALL be decided on the server for every request; hiding an element is not the protection. Student-only actions SHALL additionally require being on the course's roster, so a teacher in student view still cannot write a test.

#### Scenario: An unauthenticated request

- **WHEN** a request without a session reaches a module route
- **THEN** it is answered the way `checkAuthenticated` answers any other route

#### Scenario: A student calls a teacher action

- **WHEN** a session without `teacher` or `admin` calls a module API that changes a gradebook, a roster or a test
- **THEN** the request is refused and nothing is changed

#### Scenario: A teacher in student view

- **WHEN** a teacher has switched to student view and opens a page with a teacher-only module element, or a module teacher page
- **THEN** the element and the page are not shown, as for a student
- **AND** a call to a teacher API from that session is refused

#### Scenario: Switching back

- **WHEN** that teacher switches back to the teacher view
- **THEN** the module's teacher pages, elements and API are available again without logging in anew

#### Scenario: A teacher in student view cannot write a test

- **WHEN** a teacher in student view opens a test of a course
- **THEN** the attempt is refused, because the teacher is not on the course's roster

### Requirement: People are recorded under their directory username

The module SHALL identify a student or teacher by their LDAP username (the Keycloak `username`), never by the Keycloak user id. Display names SHALL be stored alongside and refreshed from the directory, but SHALL NOT be used to identify anyone. A person whose Keycloak account is deleted and re-imported under a new id SHALL keep all their records.

#### Scenario: An account is re-imported

- **WHEN** a student's federated Keycloak account is deleted and re-imported with a new user id but the same username
- **THEN** the student's roster entries, grades and attempts are still theirs after the next login

#### Scenario: A person without a name in the directory

- **WHEN** a person's directory entry carries neither a given name nor a surname
- **THEN** the module shows their username wherever it would show their name, and still records them correctly

### Requirement: Module pages look like SafeLearn pages

Pages the module serves on its own (outside `md/`) SHALL use the instance's page frame — top bar, theme, fonts, light/dark mode — and SHALL follow the page bootstrap rules every other view follows.

#### Scenario: A module page in dark mode

- **WHEN** a session with dark mode preferred opens a module page
- **THEN** the page is rendered in the dark theme with the same top bar as a content page
