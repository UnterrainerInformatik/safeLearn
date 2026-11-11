## MODIFIED Requirements

### Requirement: Verification is a single documented command

A developer or an assistant SHALL be able to run the verification with one command from the project root, without prior knowledge of the harness, and SHALL be able to watch it run when diagnosing a failure. Next to that full run, the project SHALL offer documented commands that run part of it: the checks that need no browser and no server, the checks that do, and the checks guarding the files a change touched. Together, the partial commands SHALL NOT be able to drift away from what the full run covers.

#### Scenario: Running the verification

- **WHEN** someone runs the project's documented test command after installing dependencies
- **THEN** the verification executes and reports, per check, whether it passed or failed
- **AND** the process exit code is non-zero if any check failed

#### Scenario: Watching a failure

- **WHEN** someone needs to see what the browser is doing
- **THEN** a documented switch runs the same verification with a visible browser window
- **AND** the checks performed are otherwise identical

#### Scenario: Running only the checks without a browser

- **WHEN** someone runs the documented unit command
- **THEN** every test file of the full run that starts neither a server nor a browser runs, and no other
- **AND** the run performs no login and needs no identity provider

#### Scenario: Running only the checks with a browser

- **WHEN** someone runs the documented browser command
- **THEN** every test file of the full run that the unit command leaves out runs, and no other

#### Scenario: The two groups stay complete

- **WHEN** a test file is added to the full run
- **THEN** it belongs to exactly one of the two groups without anyone assigning it by hand
- **AND** a check fails if the two groups together differ from the full run

#### Scenario: Documentation

- **WHEN** someone reads the project documentation
- **THEN** they find how to install the harness, how to run it, which accounts it uses, and what to configure if the identity provider is not the demo one
- **AND** they find the partial commands and the convention for using them: unit and targeted checks during the work, the full run once at the end or before a push

### Requirement: A run does not multiply authentications

Every login is a real round-trip against a public identity provider shared with other users. The number of logins a run performs SHALL follow from the roles the checks need, not from how the checks are distributed across files, and not from whether all of the content suite runs or only a selection of it.

#### Scenario: A suite of several check files

- **WHEN** the verification runs a suite spread over several files
- **THEN** the number of logins stays proportional to the roles the checks need
- **AND** splitting existing checks into more files does not increase it

#### Scenario: A selection of the content suite

- **WHEN** only some modules of the content suite run
- **THEN** they log in at most once per role they use, plus the sessions of their own that the selected modules are known to need
- **AND** the run still asserts this, so a selected run that logs in more often fails just as a full run would

#### Scenario: Reporting the cost

- **WHEN** a run finishes
- **THEN** how long it took is visible in its output, so a change that makes it slower is noticed
