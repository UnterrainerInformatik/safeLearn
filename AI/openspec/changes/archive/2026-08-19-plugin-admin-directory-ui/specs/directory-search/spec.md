## ADDED Requirements

### Requirement: An empty query enumerates the whole directory

The system SHALL, when the caller supplies no query or an empty one, answer with every person the directory holds, mapped exactly as a matched result is — rather than an empty list. The auth gate is unchanged: the caller still SHALL hold a currently valid teacher or admin identity.

This exists so a caller can enumerate every role/group value the directory currently holds without a substring guaranteed to match everyone — no such substring exists for an arbitrary school's directory, and this is the only source of that data.

#### Scenario: An empty query is sent by an authorized caller

- **WHEN** a teacher or admin identity searches with no query or an empty one
- **THEN** the result contains every person the directory holds, each with their display name and roles/groups

#### Scenario: An empty query from an unauthorized caller

- **WHEN** a caller holding neither the teacher nor the admin role sends an empty query
- **THEN** the request is refused the same way any other unauthorized request to this endpoint is
