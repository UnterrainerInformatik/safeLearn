## MODIFIED Requirements

### Requirement: A position with a single choice is chosen at once

When the class position or the course position has nothing chosen and offers the session exactly one choice, the bar SHALL choose it at once and open the page for it, as if the teacher had chosen it. This SHALL carry on to the right: a single class with a single course SHALL lead straight to that course's page. It SHALL apply on the module's start for a teacher and after the year is changed, and it SHALL carry on from a class the bar chose this way. It SHALL NOT apply after the teacher chose a class in the bar: that class's page SHALL stay open, even when the class has a single course. It SHALL NOT apply to the semester position. It SHALL NOT change a choice the teacher made, so a teacher who follows a position's link to its overview stays on that overview.

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

#### Scenario: Switching the class on the class page

- **WHEN** a teacher entered in `4BHIF` and `5CHIF` is on the class page of `4BHIF` with no course chosen, and chooses `5CHIF` in the bar, which has only the course `WMC`
- **THEN** the class page of `5CHIF` opens and stays open, with no course chosen

#### Scenario: Switching the class from a course the other class lacks

- **WHEN** a teacher on the config sheet of `NVS 4BHIF` chooses `5CHIF` in the bar, which has only the course `WMC`
- **THEN** the class page of `5CHIF` opens and stays open, with no course chosen

#### Scenario: A year change still leads through

- **WHEN** a teacher entered only in `4BHIF 2026/27`, which has only the course `WMC`, chooses `2026/27` in the bar while another year is shown
- **THEN** the config sheet of `WMC 4BHIF` opens
