## Purpose

Lets a teacher browse and pick people and classes from the school directory inside the plugin, backed by safeLearn's directory search endpoint, instead of typing or remembering a roster by hand.

## ADDED Requirements

### Requirement: Classes can be listed on demand

The system SHALL offer a command that queries the directory for every role/group value that represents a class and displays the result, without changing the document in the active editor.

#### Scenario: The command is invoked

- **WHEN** the "list classes" command is invoked while a login is held
- **THEN** every class the directory reports is shown, and the document in the active editor is unchanged

#### Scenario: The directory has no class-like values

- **WHEN** the command is invoked and the directory currently holds no role/group value recognizable as a class
- **THEN** the shown result is empty, not an error

### Requirement: Students can be picked, filterable by class

The system SHALL offer a picker that searches the directory for students, narrowable to those holding one chosen class, and lets a person choose one or more of the results.

#### Scenario: Searching without a class filter

- **WHEN** a person searches the student picker without choosing a class
- **THEN** matches are drawn from every student the directory reports

#### Scenario: Searching with a class filter

- **WHEN** a person narrows the picker to one class
- **THEN** only students holding that class are offered as matches

#### Scenario: Choosing students

- **WHEN** a person selects one or more offered students and confirms
- **THEN** the picker returns their display names to whatever opened it

### Requirement: Teachers can be picked

The system SHALL offer a picker that searches the directory for teachers and lets a person choose one or more of the results.

#### Scenario: Searching for a teacher

- **WHEN** a person searches the teacher picker
- **THEN** matches are drawn from every person the directory reports as holding the teacher role

#### Scenario: Choosing teachers

- **WHEN** a person selects one or more offered teachers and confirms
- **THEN** the picker returns their display names to whatever opened it

### Requirement: A picker never surfaces more than a display name and roles/groups

Consistent with what the directory search endpoint hands back, a picker SHALL surface a person's display name and their roles/groups — the latter for filtering and disambiguation only — and SHALL NOT expose or return any other attribute the directory could carry for them.

#### Scenario: A match is shown

- **WHEN** a person is offered as a match in a picker
- **THEN** what is shown and returned for them is their display name and their roles/groups, and nothing else
