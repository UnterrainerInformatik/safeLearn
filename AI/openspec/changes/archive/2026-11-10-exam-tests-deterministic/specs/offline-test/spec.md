## MODIFIED Requirements

### Requirement: An offline sitting opens only when the teacher starts it

A sitting of an offline test SHALL carry a planned date and time and its participants, the roster's students who have not left. It SHALL NOT open at its planned time on its own. It SHALL open when a teacher presses its start button, and its window SHALL then run from that moment for the test's duration. Starting SHALL be refused while one of the test's handouts does not resolve (`exam-handout`). Before the start the sitting SHALL be shown as planned, and a teacher SHALL be able to change its planned time and participants. A started sitting SHALL be extended and ended for all its participants together, in the same way as a sitting of an online test. There SHALL be no extension for a single participant. An end that is not later than the moment the window opened SHALL be refused with a message, and SHALL leave the sitting as it was.

#### Scenario: The planned time passes

- **WHEN** an offline sitting is planned for 08:00 and nobody presses start
- **THEN** at 08:05 it is still not open, and no participant sees it

#### Scenario: Starting

- **WHEN** a teacher presses start at 08:07 on a sitting of a 100-minute test
- **THEN** the window runs from 08:07 to 09:47

#### Scenario: Extending

- **WHEN** a teacher extends a started sitting by 10 minutes
- **THEN** its window closes 10 minutes later for every participant

#### Scenario: A broken handout

- **WHEN** a teacher presses start while a handout of the test shows as unresolved
- **THEN** the sitting does not start, and the teacher is told which handout to choose again or remove

#### Scenario: An end at the moment of the start

- **WHEN** an end of a started sitting arrives at the same moment its window opened
- **THEN** the end is refused with a message saying that a sitting can only be ended after it opened
- **AND** the sitting stays open with its window unchanged, and no error is raised inside the application
