## ADDED Requirements

### Requirement: The bar leads to the question pool and the online tests

At its right end, apart from the four positions, the bar SHALL carry two buttons: **Question pool** and **Online tests**. Question pool SHALL open the question browser at any time. Online tests SHALL open the test list of the chosen course; with no course chosen it SHALL open the tests of every course of the chosen school year, grouped by class and course. Both SHALL keep what is chosen in the bar, so that the bar on the page they open shows the same school year, class and course. The button of the page being shown SHALL be marked as the current one.

#### Scenario: From the gradebook to the pool

- **WHEN** a teacher on the gradebook of `WMC 4BHIF 2026/27` uses Question pool
- **THEN** the question browser opens, and its bar still shows `2026/27`, `4BHIF` and `WMC`

#### Scenario: Online tests without a course

- **WHEN** a teacher with only `2026/27` chosen uses Online tests
- **THEN** the tests of every course of `2026/27` are listed, grouped by class and course

#### Scenario: A teacher in student view

- **WHEN** a teacher in student view opens any module page
- **THEN** neither button is shown, as no bar is shown

### Requirement: A student reaches their own tests and results from every page

While the module is active, the instance's top bar SHALL carry, on every page, one **Exams** button for a session not acting as a teacher. It SHALL open the student's own page `/exam/my`, which shows the open online tests above the student's results. The button SHALL be marked (violet) while a test is open for the session, and the page SHALL keep that mark current while it is visible. The former addresses `/exam/my/tests` and `/exam/results` SHALL redirect to `/exam/my`. A teacher in student view SHALL get the button, as a student would, and SHALL not get the button to the module's home. A session acting as a teacher SHALL not get it. Without the module the button does not exist.

#### Scenario: A student on a lecture page

- **WHEN** a student opens any content page of an instance with the module active
- **THEN** the top bar carries the Exams button, which leads to `/exam/my`

#### Scenario: A test is open

- **WHEN** a sitting of a test is open for the student's session
- **THEN** the Exams button is marked violet

#### Scenario: An old address

- **WHEN** a student opens `/exam/results` or `/exam/my/tests`
- **THEN** they are redirected to `/exam/my`

#### Scenario: A teacher

- **WHEN** a teacher in teacher view opens the same page
- **THEN** the top bar carries the button to the module's home and not the Exams button
