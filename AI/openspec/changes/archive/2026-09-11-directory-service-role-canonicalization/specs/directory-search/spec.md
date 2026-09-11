## MODIFIED Requirements

### Requirement: Only a teacher or admin identity may search

The system SHALL require the caller to present proof of a currently valid teacher or admin identity before performing any search, verified at the time of the request rather than accepted on trust from a previously-issued credential. A caller holding neither role SHALL be refused, and refusal SHALL be indistinguishable in effect from any other unauthorized request — it SHALL NOT return partial or empty results that could be mistaken for a valid but empty search.

The teacher/admin determination SHALL canonicalize the plural spelling of a client role the same way every other role check in the system does: a client role of `teachers` SHALL be treated as `teacher`, and a client role of `students` SHALL be treated as `student`, before the teacher/admin decision is made. A caller recognized as holding the teacher or admin role anywhere else in the system (the session-based content permission check, or the calling client's own local check of the same token) SHALL never be refused here on account of the role's plural spelling alone.

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

#### Scenario: The teacher role is held as the plural client role

- **WHEN** the caller's identity holds the client role `teachers` (and not the singular `teacher`)
- **THEN** the search is performed and its result is returned, the same as if the identity held `teacher`
