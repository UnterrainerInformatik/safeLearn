# plugin-directory-info-view Specification

## Purpose

Gives a teacher or admin holding a valid connection a single read-only overview of the school directory - every teacher, every class, and a per-person role lookup - without leaving the plugin or being able to change anything from it.

## Requirements

### Requirement: The view is only available to a held teacher/admin connection

The system SHALL offer the directory info view only while the held connection satisfies the same teacher-or-admin check the directory picker already uses, and SHALL NOT offer or open it otherwise.

#### Scenario: Opened while holding a qualifying role

- **WHEN** the directory info view is opened and the held connection holds the teacher or admin role
- **THEN** the view opens and queries the directory

#### Scenario: Opened without a qualifying role

- **WHEN** the directory info view is opened and the held connection holds neither the teacher nor the admin role, or no connection is held at all
- **THEN** the view does not open, and the person sees the same explanation already shown for the directory picker and "List classes" in this situation

### Requirement: Every teacher is listed

The system SHALL show, as one section of the view, every directory entry that holds the teacher or admin role.

#### Scenario: Teachers exist in the directory

- **WHEN** the view is opened and the directory reports one or more entries holding the teacher or admin role
- **THEN** every one of those entries is listed by name

#### Scenario: No teachers are found

- **WHEN** the view is opened and the directory reports no entry holding the teacher or admin role
- **THEN** the teacher list is shown empty, not as an error

### Requirement: Every class/group is listed

The system SHALL show, as one section of the view, every class/group value the directory reports - the same set "List classes" already derives.

#### Scenario: Classes exist in the directory

- **WHEN** the view is opened and the directory reports one or more class-like values
- **THEN** every one of those values is listed

#### Scenario: No classes are found

- **WHEN** the view is opened and the directory reports no class-like value
- **THEN** the class list is shown empty, not as an error

### Requirement: Any user can be searched and their roles inspected

The system SHALL offer a searchable list covering every user the directory reports, narrowed by what is typed, and SHALL show the full role/group set of a selected user.

#### Scenario: Searching narrows the list

- **WHEN** a person types into the user search
- **THEN** the offered users narrow to those matching what was typed

#### Scenario: Selecting a user shows their roles

- **WHEN** a person selects one user from the search results
- **THEN** every role/group that user's directory entry holds is shown for that user

#### Scenario: No user is selected yet

- **WHEN** the view is opened and no user has been selected
- **THEN** no per-user role detail is shown

### Requirement: The view never changes directory or document state

The system SHALL treat every directory query the view makes as read-only, and SHALL NOT offer any action from the view that changes a role, a class membership, or any other directory state, nor the document in the active editor.

#### Scenario: Using the view

- **WHEN** the teacher/class lists are shown or a user is searched and selected
- **THEN** no write request is made to the safeLearn server or Keycloak, and the document in the active editor is unchanged

### Requirement: A directory search failure is distinguishable from an empty result

The system SHALL show a directory search failure (the directory being unreachable, refusing the request, or failing server-side) as a failure, distinct from a query that legitimately found nothing.

#### Scenario: The directory cannot be reached or refuses the request

- **WHEN** any section's directory query does not complete with an ok outcome
- **THEN** that section shows that the query failed, not an empty list
