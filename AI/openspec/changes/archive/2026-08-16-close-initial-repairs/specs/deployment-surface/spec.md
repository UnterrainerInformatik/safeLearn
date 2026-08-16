## ADDED Requirements

### Requirement: The unauthenticated reload endpoint survives malformed input

The endpoint a rendered page subscribes to for reload notifications is reachable without authentication by design — it carries no content, only the paths that changed and the kind of reload to perform. Being the one endpoint that answers before any authentication has happened, it SHALL treat everything a client sends it as hostile. A parameter it cannot interpret SHALL be handled as an absent one: the subscription SHALL be established, and the handler SHALL NOT raise. A client SHALL NOT be able to provoke an error inside the application by the shape of what it sends.

#### Scenario: A subscription carrying an uninterpretable parameter

- **WHEN** any client, authenticated or not, subscribes to the reload endpoint with a context parameter that cannot be interpreted
- **THEN** the subscription is established exactly as it would be without the parameter
- **AND** the client receives the reload notifications it would otherwise receive, decided as though no context had been given
- **AND** no error is raised inside the application

#### Scenario: A subscription without the parameter

- **WHEN** a client subscribes without a context parameter at all
- **THEN** the subscription is established, unchanged by this requirement
