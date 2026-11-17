## REMOVED Requirements

### Requirement: The bar leads to the question pool and the online tests

**Reason**: The test list holds online and offline tests since `exam-offline-sittings`; the button is renamed to Tests.
**Migration**: Replaced by "The bar leads to the question pool and the tests" below, with the same behaviour and the new name.

## ADDED Requirements

### Requirement: The bar leads to the question pool and the tests

After the four positions, a little apart from them and not at the bar's right end, the bar SHALL carry two buttons: **Question pool** and **Tests**. Question pool SHALL open the question browser at any time. Tests SHALL open the test list of the chosen course, which holds its online and offline tests; with no course chosen it SHALL open the tests of every course of the chosen school year, grouped by class and course. The button and the title of the page it opens SHALL name tests without restricting them to online tests. Both buttons SHALL keep what is chosen in the bar, so that the bar on the page they open shows the same school year, class and course. The button of the page being shown SHALL be marked as the current one.

#### Scenario: From the gradebook to the pool

- **WHEN** a teacher on the gradebook of `WMC 4BHIF 2026/27` uses Question pool
- **THEN** the question browser opens, and its bar still shows `2026/27`, `4BHIF` and `WMC`

#### Scenario: Tests without a course

- **WHEN** a teacher with only `2026/27` chosen uses Tests
- **THEN** the tests of every course of `2026/27` are listed, grouped by class and course

#### Scenario: The button's name

- **WHEN** a teacher with German as their language opens the gradebook
- **THEN** the bar's button reads `Tests`, not `Online-Tests`, and the page it opens is titled `Tests`

#### Scenario: A teacher in student view

- **WHEN** a teacher in student view opens any module page
- **THEN** neither button is shown, as no bar is shown

## MODIFIED Requirements

### Requirement: A student reaches their own tests and results from every page

While the module is active, the instance's top bar SHALL carry, on every page, one **Exams** button for a session not acting as a teacher. It SHALL open the student's own page `/exam/my`, which shows the open tests, online and offline, above the student's results, under a heading that names tests without restricting them to online tests. The button SHALL be marked (violet) while a test is open for the session, and the page SHALL keep that mark current while it is visible. The former addresses `/exam/my/tests` and `/exam/results` SHALL redirect to `/exam/my`. A teacher in student view SHALL get the button, as a student would, and SHALL not get the button to the module's home. A session acting as a teacher SHALL not get it. Without the module the button does not exist.

#### Scenario: A student on a lecture page

- **WHEN** a student opens any content page of an instance with the module active
- **THEN** the top bar carries the Exams button, which leads to `/exam/my`

#### Scenario: A test is open

- **WHEN** a sitting of a test is open for the student's session
- **THEN** the Exams button is marked violet

#### Scenario: An offline sitting on the student's page

- **WHEN** an offline sitting is open for a present German-speaking student and they open `/exam/my`
- **THEN** the sitting is listed under `Offene Tests`, not `Offene Online-Tests`

#### Scenario: An old address

- **WHEN** a student opens `/exam/results` or `/exam/my/tests`
- **THEN** they are redirected to `/exam/my`

#### Scenario: A teacher

- **WHEN** a teacher in teacher view opens the same page
- **THEN** the top bar carries the button to the module's home and not the Exams button
