## ADDED Requirements

### Requirement: A run proves the instance both without and with the exam module

The verification SHALL run the existing checks against the instance with the exam module switched off, and the module's checks against an instance with it switched on. With the module on, the instance SHALL use a database created for that run in a temporary location and removed when the run ends, by success, failure or interruption. No run SHALL read or write a database it did not create.

#### Scenario: Module off

- **WHEN** the verification starts the instance without `EXAM_MODULE`
- **THEN** every existing check passes as before
- **AND** a request to a path under `/exam/` is answered as a path with nothing behind it

#### Scenario: Module on

- **WHEN** the verification starts the instance with `EXAM_MODULE=on`
- **THEN** the instance's database lives in a location created for this run
- **AND** after the run that location is gone

#### Scenario: Consecutive runs with the module

- **WHEN** the module checks run twice in a row with no change to the working tree in between
- **THEN** both runs report the same result, because neither sees records the other wrote
