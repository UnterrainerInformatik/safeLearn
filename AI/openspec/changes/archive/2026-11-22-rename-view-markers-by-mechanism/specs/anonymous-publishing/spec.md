## MODIFIED Requirements

### Requirement: Every reader holds the deployment's reader roles

Without an identity provider, every request SHALL be served as a reader holding exactly the roles listed in `READER_ROLES`, a comma-separated list compared case-insensitively and ignoring surrounding whitespace and empty entries. Without the variable, or with an empty one, a reader SHALL hold no role. Nothing a request carries — a cookie, a header, a query parameter, a stored preference — SHALL add a role to that set or remove one from it, except the student-view downgrade, which narrows it as it narrows a session's roles.

The reader roles SHALL be decided by the rules that decide a session's roles: the plural aliases, the admin short-circuit, the student-view downgrade, the private-variant gate and its public counterpart, and the rule that a directive never grants itself. A reader has no display name, so no directive addressing a person by name SHALL be granted to it.

Wherever another capability speaks of an authenticated session, a request to an instance without an identity provider SHALL count as one holding the reader roles.

#### Scenario: No reader roles

- **WHEN** an instance without an identity provider has no `READER_ROLES` and serves a page carrying `@@@ teacher` and `@@@ 4bhif` blocks
- **THEN** neither block's content appears
- **AND** files whose first line restricts them are refused by direct path and absent from the navigation tree

#### Scenario: Reader roles that include the teacher role

- **WHEN** `READER_ROLES=teacher,examParticipant,4bhif`
- **THEN** every reader sees blocks addressed to `teacher`, `teachers`, `examParticipant` and `4bhif`
- **AND** blocks addressed only to `5bhif` or to a person by name stay hidden

#### Scenario: A reader cannot raise its own roles

- **WHEN** a reader of an instance whose reader roles do not include `teacher` sends a preference cookie with the private-variant view on
- **THEN** blocks addressed to `#variant-private` do not appear and the public variant does

### Requirement: Login, logout and the directory are absent without an identity provider

Without an identity provider, the application SHALL NOT offer a login or logout, SHALL NOT render a control that leads to one, and SHALL answer the paths that start or end a login the way it answers a path it does not serve. The directory search and directory status endpoints SHALL NOT be registered, and SHALL be answered the way an unserved path is answered, without directory data. The view toggles SHALL be offered whenever the reader roles allow them, exactly as they are offered to a session holding the same roles.

#### Scenario: The menu without an identity provider

- **WHEN** a reader opens the menu of a rendered page
- **THEN** it contains no logout control
- **AND** with `teacher` among the reader roles it contains the teacher toggle, the variant switch and the optional-blocks switch

#### Scenario: A login path

- **WHEN** a request asks for the path that would start a login or receive its callback
- **THEN** it is answered as an unserved path is answered and no identity provider is contacted

#### Scenario: The directory endpoints

- **WHEN** a request asks for the directory search or directory status endpoint, with or without a bearer token
- **THEN** no directory data is returned and no identity provider is contacted

