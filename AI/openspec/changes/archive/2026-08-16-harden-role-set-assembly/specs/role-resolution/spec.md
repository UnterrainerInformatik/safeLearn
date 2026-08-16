## MODIFIED Requirements

### Requirement: A session's roles come from the session alone

The role set a directive is evaluated against SHALL be assembled from the authenticated session only: the client roles the identity provider issued for this application, the organizational units of the user's LDAP claim, and the user's own display name. Every comparison SHALL be case-insensitive and ignore surrounding whitespace, on both the session's roles and the roles a directive names.

The role set SHALL NOT depend on which directives have already been evaluated during the request, nor on the order in which directives appear in a document. Evaluating a directive SHALL leave the role set unchanged for every directive evaluated after it.

The display name SHALL NOT be able to stand in for a role. The names `admin`, `teacher`, `teachers`, `student` and `students` are reserved: a display name equal to one of them, compared case-insensitively and ignoring surrounding whitespace, SHALL NOT enter the role set, and SHALL NOT reach the plural aliasing, the admin short-circuit, or the student-view downgrade. A session SHALL hold such a role only when the identity provider or the LDAP claim says so. The collision SHALL be recorded in the server log, so that the account can be renamed rather than silently losing the addressed-by-name feature.

#### Scenario: An organizational unit becomes a role

- **WHEN** the user's LDAP claim carries `OU=Teachers`, `OU=Students` or `OU=5BHIF`
- **THEN** the session holds `teacher`, `student` and `5bhif` respectively — the plural unit names map to the singular role

#### Scenario: A person addressed by name

- **WHEN** a directive names the user's own display name, for example `@@@ Stu Dent`
- **THEN** the session of that user sees the content
- **AND** no other session sees it, unless it holds another role the directive names

#### Scenario: A display name that collides with a reserved role

- **WHEN** a session whose display name is `admin`, `teacher`, `teachers`, `student` or `students` — in any capitalization — reads a page containing a block addressed to that same name
- **THEN** the block's content appears only if the identity provider or the LDAP claim gave the session that role
- **AND** a display name of `teachers` or `students` does not reach the role through the plural alias either

#### Scenario: One directive cannot influence the next

- **WHEN** a document contains a directive that names a role the session does not hold, followed by a second directive naming the same role
- **THEN** the second directive is decided exactly as it would have been on its own

## ADDED Requirements

### Requirement: The student role satisfies its plural alias

A session holding `student` SHALL also satisfy a directive naming `students`, and a session not holding `student` SHALL NOT — the same relation `teacher` and `teachers` already have. Both spellings SHALL address exactly the same readers, whichever of the two the session's own role arrived as, so that neither spelling is a directive that quietly matches nobody.

#### Scenario: A student and a plural directive

- **WHEN** a session holding `student` reads a page containing a `@@@ students` block
- **THEN** the block's content appears

#### Scenario: A student and a singular directive

- **WHEN** that same session reads a page containing a `@@@ student` block
- **THEN** the block's content appears

#### Scenario: A session without the student role

- **WHEN** a session holding neither `student` nor any other role the directive names reads either page
- **THEN** the block's content does not appear

### Requirement: Role resolution denies access when it fails

When the role check cannot be completed — a malformed session, an unreadable client configuration, or any other error raised while resolving roles — it SHALL deny access. It SHALL NOT return a value that a caller could read as anything other than a refusal, and it SHALL NOT fall through to rendering the guarded content. The failure SHALL be recorded in the server log.

#### Scenario: The role check raises an error

- **WHEN** resolving the session's roles fails while a page containing a restricted block is rendered
- **THEN** the block's content does not appear
- **AND** a file whose first line restricts it is refused by direct path and absent from the navigation tree
