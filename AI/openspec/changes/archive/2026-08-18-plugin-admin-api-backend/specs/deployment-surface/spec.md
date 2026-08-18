## ADDED Requirements

### Requirement: The directory search endpoint is inert without a currently-valid teacher or admin identity

The directory search endpoint SHALL be treated as part of the deployment's checked HTTP surface: a request that does not currently prove a valid teacher or admin identity SHALL receive no directory data, regardless of whether a session cookie is present. The credentials the endpoint uses to reach the directory on the caller's behalf SHALL NOT be observable in any response, error message, or log reachable by a client.

#### Scenario: An unauthenticated request reaches the search endpoint

- **WHEN** a request to the search endpoint carries no proof of identity
- **THEN** no directory data is returned

#### Scenario: A session cookie alone is not sufficient

- **WHEN** a request carries a valid browser session but no valid teacher-or-admin proof of identity for the endpoint itself
- **THEN** no directory data is returned

#### Scenario: The endpoint's own outbound credentials are not exposed

- **WHEN** any response is produced by the search endpoint, successful or not
- **THEN** the response contains none of the credentials the deployment uses to authenticate itself to the directory
