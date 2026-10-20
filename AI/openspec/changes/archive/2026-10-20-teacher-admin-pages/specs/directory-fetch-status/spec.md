## MODIFIED Requirements

### Requirement: Only a teacher or admin identity may read the status

The system SHALL require the caller to present proof of a currently valid teacher or admin identity before answering the status operation. That proof SHALL be either a bearer token, verified the same way and at the same moment a directory search verifies it, or a browser session that has an identity and acts as a teacher or admin after the student-view downgrade. Both ways SHALL answer the same report. A caller holding neither role SHALL be refused, and the refusal SHALL be indistinguishable in effect from any other unauthorized request — it SHALL NOT report a partial or empty state that could be mistaken for a valid answer.

#### Scenario: A teacher or admin asks for the status

- **WHEN** a caller holding a currently valid teacher or admin identity asks for the directory status
- **THEN** the status is answered

#### Scenario: A teacher asks through the browser session

- **WHEN** a browser session acting as a teacher asks for the directory status through the session route
- **THEN** the same report is answered as for a bearer token at that moment

#### Scenario: A teacher in student view asks through the browser session

- **WHEN** a teacher who has switched to the student view asks for the directory status through the session route
- **THEN** the request is refused, and nothing about the directory's state is disclosed

#### Scenario: A caller holding neither role asks for the status

- **WHEN** a caller holding neither the teacher nor the admin role asks for the directory status
- **THEN** the request is refused the same way an unauthorized directory search is, and nothing about the directory's state is disclosed

#### Scenario: No proof of identity is presented

- **WHEN** the directory status is asked for without proof of a currently valid identity
- **THEN** the request is refused, indistinguishably from a caller holding neither role
