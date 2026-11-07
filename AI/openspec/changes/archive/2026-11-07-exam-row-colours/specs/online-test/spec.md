## ADDED Requirements

### Requirement: The live view colours a participant's row by status

In the live view of an online sitting, the row of a participant who has submitted SHALL be coloured green (good), following the module's row colours (`exam-ui-conventions`). It SHALL no longer be shown faded. The rows of participants who have not started or are writing SHALL stay neutral. A participant's row that carries the suspicious signal (manipulated browser, hidden by timing, or without heartbeat) SHALL show an amber stripe at its left edge, without a tint, on top of the colour of its status. The stripe SHALL only flag the row. It SHALL NOT change the order, the status or the grade, and SHALL NOT appear on the view for the class. A legend above the table SHALL name the green row and the amber stripe.

The colours of the list of tests (open right now red, within the next 7 days amber, later slate, done green) SHALL be the module's shared row colours.

#### Scenario: A submitted participant

- **WHEN** a participant submits during the sitting
- **THEN** their row turns green as the live view updates, and is not faded

#### Scenario: A suspicious participant

- **WHEN** a writing participant's page is hidden by timing
- **THEN** their row shows an amber stripe at its left edge and stays otherwise neutral
- **AND** once they submit, the row is green and keeps the amber stripe

#### Scenario: The class does not see it

- **WHEN** the view for the class is shown on the projector
- **THEN** it shows no row colours of participants
