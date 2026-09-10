# plugin-directory-search Specification

## Purpose
Lets a teacher browse and pick people and classes from the school directory inside the plugin, backed by safeLearn's directory search endpoint, instead of typing or remembering a roster by hand.

## Requirements

### Requirement: Classes can be listed on demand

The system SHALL offer a command that queries the directory for every role/group value that represents a class and displays the result, without changing the document in the active editor.

#### Scenario: The command is invoked

- **WHEN** the "list classes" command is invoked while a login is held
- **THEN** every class the directory reports is shown, and the document in the active editor is unchanged

#### Scenario: The directory has no class-like values

- **WHEN** the command is invoked and the directory currently holds no role/group value recognizable as a class
- **THEN** the shown result is empty, not an error

### Requirement: Students can be picked, filterable by one or more searchable classes

The system SHALL offer a picker that searches the directory for students, narrowable to one or more chosen classes, and lets a person mark several of the offered results and take them over together in one action rather than one at a time. Where the directory holds enough classes that scrolling a plain list is impractical, the class filter itself SHALL be narrowable by typing rather than only by scrolling.

#### Scenario: Searching without a class filter

- **WHEN** a person searches the student picker without choosing a class
- **THEN** matches are drawn from every student the directory reports

#### Scenario: Searching with one class filter

- **WHEN** a person narrows the picker to one class
- **THEN** only students holding that class are offered as matches

#### Scenario: Searching with more than one class filter

- **WHEN** a person narrows the picker to more than one chosen class
- **THEN** matches are drawn from students holding any of the chosen classes

#### Scenario: Narrowing the class filter itself by typing

- **WHEN** a person types into the class filter
- **THEN** the classes offered to choose from narrow to those matching what was typed, the same way typing narrows student matches

#### Scenario: Marking several results and taking them over together

- **WHEN** a person marks more than one of the offered students from the same set of results
- **THEN** all marked students are taken over together in one action, without a separate search in between

#### Scenario: Choosing students

- **WHEN** a person selects one or more offered students and confirms
- **THEN** the picker returns their display names to whatever opened it

### Requirement: Teachers can be picked

The system SHALL offer a picker that searches the directory for teachers and lets a person mark several of the offered results and take them over together in one action rather than one at a time.

#### Scenario: Searching for a teacher

- **WHEN** a person searches the teacher picker
- **THEN** matches are drawn from every person the directory reports as holding the teacher role

#### Scenario: Marking several results and taking them over together

- **WHEN** a person marks more than one of the offered teachers from the same set of results
- **THEN** all marked teachers are taken over together in one action, without a separate search in between

#### Scenario: Choosing teachers

- **WHEN** a person selects one or more offered teachers and confirms
- **THEN** the picker returns their display names to whatever opened it

### Requirement: A picker never surfaces more than a display name and roles/groups

Consistent with what the directory search endpoint hands back, a picker SHALL surface a person's display name and their roles/groups — the latter for filtering and disambiguation only — and SHALL NOT expose or return any other attribute the directory could carry for them.

#### Scenario: A match is shown

- **WHEN** a person is offered as a match in a picker
- **THEN** what is shown and returned for them is their display name and their roles/groups, and nothing else

### Requirement: Whether the directory can be reached is shown before a search is tried

The system SHALL, when a picker is opened with a login held, show whether the directory can currently be reached without waiting for a person to run a search first. An instance that cannot be reached at all, and a search request that reached the instance but failed there, SHALL each be shown as what they are, distinguishable from each other and from a query that legitimately matched nothing. This SHALL NOT widen what `plugin-login-state` deliberately keeps indistinguishable: a request refused for want of a valid identity and one refused for want of the teacher/admin role SHALL remain shown identically to being logged out.

#### Scenario: The directory is reachable

- **WHEN** a picker is opened and the directory can be reached
- **THEN** nothing is shown about connectivity, and the picker is usable immediately

#### Scenario: The instance cannot be reached

- **WHEN** a picker is opened and the configured instance cannot be reached at all
- **THEN** this is shown before a query is typed, distinguishable from a query that matched nothing

#### Scenario: A search request fails at the server

- **WHEN** a query is run and the request reaches the instance but the search itself fails there
- **THEN** this is shown as what it is, distinguishable both from an empty match and from the instance being unreachable

#### Scenario: A request is refused for identity or role

- **WHEN** a directory request is refused for want of a valid identity or the teacher/admin role
- **THEN** nothing shown distinguishes this from being logged out, unchanged from `plugin-login-state`'s existing boundary
