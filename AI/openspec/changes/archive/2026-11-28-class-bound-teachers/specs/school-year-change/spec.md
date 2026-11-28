## MODIFIED Requirements

### Requirement: The next year starts from the old one, not from nothing

Starting a school year SHALL offer, for each class of the previous year, the class one level up (e.g. `3AHIF` → `4AHIF`) with its previous roster as a pre-ticked checklist next to the current members of the new class's directory unit, and with its previous teachers pre-ticked next to the directory's other teachers. A class without a successor (a fifth-year class) SHALL be shown as such. Because it creates classes, this step SHALL be offered only to a session acting as an admin (`class-roster`). The admin SHALL confirm the roster and the teachers before the class is created. Only the confirmed teachers SHALL be entered in the new class. Courses SHALL be offered for copying with their language, weights and winter share, without columns, results or tests.

#### Scenario: Moving a class up

- **WHEN** an admin starts `2027/28` and `3AHIF` existed in `2026/27`
- **THEN** `4AHIF` is offered with last year's `3AHIF` roster ticked and the directory's current `4AHIF` members shown beside it

#### Scenario: Carrying the teachers over

- **WHEN** `3AHIF 2026/27` had the teachers `amaier` and `mhuber`, and the admin unticks `mhuber` before creating `4AHIF 2027/28`
- **THEN** `4AHIF 2027/28` has `amaier` entered and not `mhuber`
- **AND** `3AHIF 2026/27` keeps both

#### Scenario: Copying a course

- **WHEN** the admin creates `4AHIF` with the course `WMC` ticked for copying
- **THEN** `4AHIF` has a course `WMC` with the same language, weights and winter share, and no gradebook column and no test
