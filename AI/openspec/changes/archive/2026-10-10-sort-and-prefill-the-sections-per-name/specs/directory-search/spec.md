## RENAMED Requirements

- FROM: `### Requirement: Results carry only a display name and roles/groups`
- TO: `### Requirement: Results carry only a display name, its two parts, and roles/groups`

## MODIFIED Requirements

### Requirement: Results carry only a display name, its two parts, and roles/groups

Each person in a search result SHALL be represented by their display name, the given name and surname that display name is made of, and the roles/groups they hold — and by nothing else the directory records about them.

The two parts SHALL be the ones the display name is built from, as the directory holds them, and never a split of the display name after the fact. Splitting after the fact misfiles everyone whose given name or surname contains a space. The parts disclose nothing the display name does not already show. They exist so that a caller can order people by surname. The display name itself SHALL stay exactly what it was, because it is what a restriction names and what the server compares a reader's identity against.

A person the directory holds without one of the parts SHALL carry that part as empty, not omitted, and the display name SHALL still be formed as it is today.

#### Scenario: A match's result fields

- **WHEN** a person is included in a search result
- **THEN** the result entry for that person contains their display name, their given name, their surname and their roles/groups
- **AND** it contains no other attribute the directory holds for that person

#### Scenario: A surname contains a space

- **WHEN** a person whose surname consists of two words is included in a search result
- **THEN** the entry's surname is both words, as the directory holds it
- **AND** the display name is the given name, a space, and that surname — unchanged from before

#### Scenario: A person has no surname in the directory

- **WHEN** a person whose directory entry holds a given name but no surname is included in a search result
- **THEN** the entry's surname is empty and its display name is the given name alone

### Requirement: An empty query enumerates the whole directory

The system SHALL, when the caller supplies no query or an empty one, answer with every person the directory holds, mapped exactly as a matched result is — rather than an empty list. The auth gate is unchanged: the caller still SHALL hold a currently valid teacher or admin identity.

This exists so a caller can enumerate every role/group value the directory currently holds without a substring guaranteed to match everyone — no such substring exists for an arbitrary school's directory, and this is the only source of that data.

#### Scenario: An empty query is sent by an authorized caller

- **WHEN** a teacher or admin identity searches with no query or an empty one
- **THEN** the result contains every person the directory holds, each with their display name, its two parts and their roles/groups

#### Scenario: An empty query from an unauthorized caller

- **WHEN** a caller holding neither the teacher nor the admin role sends an empty query
- **THEN** the request is refused the same way any other unauthorized request to this endpoint is
