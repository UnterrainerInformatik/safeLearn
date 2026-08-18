# directory-search Specification

## Purpose

Lets a caller holding a teacher or admin identity search the school directory by name or by role/group, so that tools built on top of safeLearn can offer people and groups by name instead of requiring them typed by hand.

## Requirements

### Requirement: A single endpoint searches both names and roles

The system SHALL expose one search operation that matches a caller-supplied wildcard query against either a person's display name or any role/group that person holds. A role/group is any value the directory associates with a person the same way class membership, `teacher`, or `admin` are associated — the query SHALL NOT be restricted to a fixed set of role/group kinds, so a directory value such as an exam-participant marker is searchable the same way a class name is.

#### Scenario: Query matches a display name

- **WHEN** the query is a substring of a person's display name, case-insensitively
- **THEN** that person is included in the result

#### Scenario: Query matches a role or group

- **WHEN** the query is a substring of a role or group value the directory associates with one or more people, case-insensitively
- **THEN** every person holding that role or group is included in the result

#### Scenario: Query matches nothing

- **WHEN** the query matches no display name and no role/group in the directory
- **THEN** the result is an empty list, not an error

### Requirement: Only a teacher or admin identity may search

The system SHALL require the caller to present proof of a currently valid teacher or admin identity before performing any search, verified at the time of the request rather than accepted on trust from a previously-issued credential. A caller holding neither role SHALL be refused, and refusal SHALL be indistinguishable in effect from any other unauthorized request — it SHALL NOT return partial or empty results that could be mistaken for a valid but empty search.

#### Scenario: A teacher identity searches

- **WHEN** the caller's identity currently holds the teacher role
- **THEN** the search is performed and its result is returned

#### Scenario: An admin identity searches

- **WHEN** the caller's identity currently holds the admin role
- **THEN** the search is performed, whether or not the identity also holds the teacher role

#### Scenario: A caller holding neither role is refused

- **WHEN** the caller's identity holds neither the teacher nor the admin role
- **THEN** the request is refused and no search is performed

#### Scenario: No valid identity is presented

- **WHEN** the request carries no proof of identity, or proof that cannot currently be confirmed as valid
- **THEN** the request is refused and no search is performed

#### Scenario: A previously valid identity is no longer valid

- **WHEN** the caller presents proof of identity that was valid at some point but is no longer current at the time of the request
- **THEN** the request is refused, even though the same proof would have succeeded earlier

### Requirement: Results carry only a display name and roles/groups

Each person in a search result SHALL be represented by their display name and the roles/groups they hold, and by nothing else the directory records about them.

#### Scenario: A match's result fields

- **WHEN** a person is included in a search result
- **THEN** the result entry for that person contains their display name and their roles/groups
- **AND** it contains no other attribute the directory holds for that person

### Requirement: Searching does not depend on the caller's own directory access

The system SHALL perform the directory lookup using an identity dedicated to that purpose, independent of whatever directory access the calling teacher or admin's own identity carries. A caller need not, and cannot, use their own identity to reach the directory directly.

#### Scenario: A teacher without directory access of their own can still search

- **WHEN** a caller holds a valid teacher identity but that identity carries no rights to query the directory on its own
- **THEN** the search still succeeds, because the lookup is performed under the dedicated identity
