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

The system SHALL offer a picker that searches the directory for students, narrowable to one or more chosen classes, and lets a person take several of the offered results over together in one action rather than one at a time. Where the directory holds enough classes that scrolling a plain list is impractical, the class filter itself SHALL be narrowable by typing rather than only by scrolling.

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

- **WHEN** a person chooses more than one of the offered students from the same set of results
- **THEN** all of them are held as chosen together, without a separate search in between

#### Scenario: Choosing students

- **WHEN** a person chooses one or more offered students and confirms
- **THEN** the picker returns their display names to whatever opened it

### Requirement: Teachers can be picked

The system SHALL offer a picker that searches the directory for teachers and lets a person take several of the offered results over together in one action rather than one at a time.

#### Scenario: Searching for a teacher

- **WHEN** a person searches the teacher picker
- **THEN** matches are drawn from every person the directory reports as holding the teacher role

#### Scenario: Marking several results and taking them over together

- **WHEN** a person chooses more than one of the offered teachers from the same set of results
- **THEN** all of them are held as chosen together, without a separate search in between

#### Scenario: Choosing teachers

- **WHEN** a person chooses one or more offered teachers and confirms
- **THEN** the picker returns their display names to whatever opened it

### Requirement: What has been chosen is shown, and can be taken back out

The system SHALL show, while a picker is open, every person currently chosen, as a list distinct from the offered results — including people chosen while a filter that no longer shows them was applied. Acting on one of them SHALL take that person back out of the chosen list, and a person taken back out SHALL NOT be returned when the picker is confirmed.

A person already chosen SHALL be held once however many times they are chosen again.

#### Scenario: People are chosen

- **WHEN** one or more people are chosen from the offered results
- **THEN** they are shown as the currently chosen people, separately from the results still being offered

#### Scenario: A filter no longer shows a chosen person

- **WHEN** the filter or the search is changed so that an already-chosen person is no longer among the offered results
- **THEN** that person is still shown as chosen, and is still returned when the picker is confirmed

#### Scenario: A chosen person is taken back out

- **WHEN** a person is acted on in the chosen list
- **THEN** they are no longer shown as chosen, and confirming the picker does not return them

#### Scenario: The same person is chosen twice

- **WHEN** a person who is already chosen is chosen again
- **THEN** they are shown once and returned once

### Requirement: Everything currently offered can be taken over in one action

The system SHALL offer, in every picker, one action that chooses every person the result list currently shows — no more and no fewer — so that narrowing to a class and taking that class over does not cost one action per person. People already chosen SHALL remain chosen and SHALL NOT be duplicated by it.

#### Scenario: A class is narrowed to and taken over whole

- **WHEN** the picker is narrowed to a class and the action that takes over everything offered is used
- **THEN** every person the result list is showing becomes chosen, in one action

#### Scenario: Some of what is offered is already chosen

- **WHEN** the action is used while some of the offered people are already chosen
- **THEN** those people stay chosen once, and the rest are added to them

#### Scenario: Two filters are taken over in turn

- **WHEN** the action is used, the filter is then changed, and it is used again
- **THEN** the people from both filters are chosen together

#### Scenario: Nothing is offered

- **WHEN** the action is used while the result list shows nobody
- **THEN** nothing is chosen and nothing already chosen is lost

### Requirement: A picker never surfaces more than a display name and roles/groups

Consistent with what the directory search endpoint hands back, a picker SHALL surface a person's display name and their roles/groups — the latter for filtering and disambiguation only — and SHALL NOT expose or return any other attribute the directory could carry for them.

#### Scenario: A match is shown

- **WHEN** a person is offered as a match in a picker
- **THEN** what is shown and returned for them is their display name and their roles/groups, and nothing else

### Requirement: Whether the directory can be reached is shown before a search is tried

The system SHALL, when a picker is opened with a login held, show whether the directory can currently be reached without waiting for a person to run a search first. An instance that cannot be reached at all, a search request that reached the instance but failed there, and an instance that was reached but whose directory data is still being fetched, SHALL each be shown as what they are, distinguishable from each other and from a query that legitimately matched nothing. This SHALL NOT widen what `plugin-login-state` deliberately keeps indistinguishable: a request refused for want of a valid identity and one refused for want of the teacher/admin role SHALL remain shown identically to being logged out.

#### Scenario: The directory is reachable

- **WHEN** a picker is opened, the directory can be reached, and its data is available
- **THEN** nothing is shown about connectivity, and the picker is usable immediately

#### Scenario: The instance cannot be reached

- **WHEN** a picker is opened and the configured instance cannot be reached at all
- **THEN** this is shown before a query is typed, distinguishable from a query that matched nothing

#### Scenario: A search request fails at the server

- **WHEN** a query is run and the request reaches the instance but the search itself fails there
- **THEN** this is shown as what it is, distinguishable both from an empty match and from the instance being unreachable

#### Scenario: The instance is reachable but still fetching its directory

- **WHEN** a picker is opened, the instance can be reached, and it reports that it is still fetching the directory
- **THEN** this is shown as what it is, distinguishable from the instance being unreachable, from a failed search, and from a query that matched nothing

#### Scenario: A request is refused for identity or role

- **WHEN** a directory request is refused for want of a valid identity or the teacher/admin role
- **THEN** nothing shown distinguishes this from being logged out, unchanged from `plugin-login-state`'s existing boundary

### Requirement: A directory fetch in progress is shown wherever the plugin waits for the directory

The system SHALL, wherever it waits for an answer from the directory and the server reports that it is fetching the directory, show that a fetch is under way together with how far along it is, rather than showing nothing. It SHALL keep that indication current while the wait lasts, and SHALL show the result once the fetch completes without the person having to invoke anything again. A fetch in progress SHALL NOT be shown as a failure, as an unreachable instance, or as an empty result.

#### Scenario: A picker is opened while the server is fetching

- **WHEN** a picker is opened and the server reports a directory fetch in progress
- **THEN** the picker shows that the directory is being fetched and how far along it is, instead of an empty list with no explanation

#### Scenario: The indication follows the fetch

- **WHEN** a fetch in progress is being shown and the fetch advances
- **THEN** what is shown advances with it, rather than staying at the figure first shown

#### Scenario: The fetch completes while the person is waiting

- **WHEN** a fetch that was being shown completes
- **THEN** what was waiting on it is shown — the picker becomes usable, or the invoked command produces its result — without the person invoking anything again

#### Scenario: "List classes" is invoked while the server is fetching

- **WHEN** the "list classes" command is invoked and the server reports a directory fetch in progress
- **THEN** the fetch and its progress are shown, and the class list follows once the fetch completes

#### Scenario: A fetch in progress is not a failure

- **WHEN** the server reports a directory fetch in progress
- **THEN** nothing shown states or implies that the directory could not be reached, that the search failed, or that the directory holds nothing
