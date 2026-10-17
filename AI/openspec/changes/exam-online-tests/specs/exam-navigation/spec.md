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
