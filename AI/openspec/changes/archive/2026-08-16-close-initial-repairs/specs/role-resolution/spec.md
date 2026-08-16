## ADDED Requirements

### Requirement: The practice view is the counterpart of the exam view

A `#practice` directive SHALL be granted to exactly those sessions a `#exam` directive is refused, and refused to exactly those it is granted. The two directives address the same content in two versions, so every session SHALL see exactly one of them. No combination of roles and stored preferences SHALL leave a reader with neither version, and none SHALL show both at once.

The exam view is a privilege of the `teacher` and `admin` roles, decided after the student-view downgrade has been applied. A session that has switched the teacher view off has given that privilege up along with those roles, so it SHALL be shown the practice variant regardless of what the exam preference still holds. A session that never held those roles SHALL be shown the practice variant for the same reason, whatever it sets the exam preference to.

#### Scenario: A teacher with the exam view on

- **WHEN** a session holding `teacher` or `admin` sets the exam preference on, with the teacher view on, and reads the exam/practice page
- **THEN** the exam variant appears and the practice variant does not

#### Scenario: A teacher with the exam view off

- **WHEN** that same session clears the exam preference
- **THEN** the practice variant appears and the exam variant does not

#### Scenario: A teacher looking at the page as a student

- **WHEN** a session holding `teacher` or `admin` has the exam preference on and switches the teacher view off
- **THEN** the practice variant appears and the exam variant does not
- **AND** the page shows the same question a session without those roles is shown

#### Scenario: A session that holds neither role

- **WHEN** a session holding neither `teacher` nor `admin` reads the exam/practice page, with the exam preference set and with it cleared
- **THEN** the practice variant appears in both cases and the exam variant appears in neither
