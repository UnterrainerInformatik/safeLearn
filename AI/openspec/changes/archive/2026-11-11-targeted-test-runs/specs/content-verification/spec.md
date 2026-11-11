## MODIFIED Requirements

### Requirement: A change to guarded code names the checks that cover it

Knowing that the checks exist is part of them working. The project SHALL record which checks guard which source files, and that record SHALL be surfaced when the guarded code is edited rather than relying on anyone remembering it. The same record SHALL drive a run of exactly the checks that cover a change, so that a change does not have to pay for the full run to be verified while the work is in progress.

#### Scenario: The coverage record

- **WHEN** someone reads the project's testing documentation
- **THEN** they find, per check file, which source files and which corpus files it guards
- **AND** the record is complete for every check the suite contains

#### Scenario: Editing guarded code

- **WHEN** a source file that the record names as guarded is edited in an assisted session
- **THEN** the checks covering it are named at that point
- **AND** the targeted run of those checks is offered as the next step rather than performed unasked

#### Scenario: Running the checks a change touches

- **WHEN** someone runs the documented targeted command
- **THEN** the changed files are taken from the working tree against the last commit, untracked files included, or from the last commit when the working tree is clean, or from paths given explicitly
- **AND** exactly the checks the record names for those files run, each of them once
- **AND** a changed check file runs itself

#### Scenario: A content module is the only thing affected

- **WHEN** the files a change touches are covered by single modules of the content suite only
- **THEN** only those modules run, in the order the full content suite runs them
- **AND** not the whole content suite

#### Scenario: A changed file no check guards

- **WHEN** a changed file appears nowhere in the record
- **THEN** the targeted run names it as unguarded rather than ignoring it silently
- **AND** if no changed file is guarded at all, the run starts nothing, says so, and exits successfully

#### Scenario: Seeing the plan without running it

- **WHEN** someone asks the targeted command for its plan only
- **THEN** it prints which checks it would run and why, and starts no server, browser or login

#### Scenario: A check file is added or removed

- **WHEN** the suite gains or loses a check file
- **THEN** the coverage record is updated in the same change
- **AND** a record naming a check file that no longer exists is treated as a defect
