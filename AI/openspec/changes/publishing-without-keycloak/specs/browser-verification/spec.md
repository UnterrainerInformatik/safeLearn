## ADDED Requirements

### Requirement: A verification run can target an instance without an identity provider

The harness SHALL be able to start the application from the working tree without an identity provider and with reader roles the caller names, and SHALL hand the caller a browser page showing application content without passing through any login. Such a run SHALL NOT contact the identity provider and SHALL NOT need its credentials. It SHALL be part of the single documented verification command, alongside the runs with the identity provider, so that neither mode can break unnoticed. A page that shows a login form or an error page SHALL NOT be reported as success.

#### Scenario: No reader roles

- **WHEN** a run starts the application with `AUTH=none` and no reader roles and reads the test corpus
- **THEN** every block and every file the corpus restricts is absent from what it is shown
- **AND** every unrestricted page is reachable without a login

#### Scenario: Teacher as reader role

- **WHEN** a run starts the application with `AUTH=none` and `READER_ROLES=teacher`
- **THEN** the teacher-only content of the test corpus is shown
- **AND** switching the teacher view off through the page's own toggle hides it again on the next page

#### Scenario: A forged preference cookie against the identity provider

- **WHEN** a run with the identity provider takes a `teacher` session whose stored exam view is off, adds the preference cookie of the mode without an identity provider with the exam view on, and renders the exam/practice page
- **THEN** the run asserts that the practice variant is shown, and that the session's stored preferences are unchanged afterwards

#### Scenario: Refused combinations

- **WHEN** a run starts the application with `AUTH=none` and `EXAM_MODULE=on`, or with neither `AUTH=none` nor an identity-provider configuration
- **THEN** the application terminates without serving, and the run asserts on that rather than reporting a reachable server
