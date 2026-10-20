## MODIFIED Requirements

### Requirement: A session's roles come from the session alone

The role set a directive is evaluated against SHALL be assembled from the authenticated session only: the client roles the identity provider issued for this application, the organizational units of the user's LDAP claim, and the user's own display name. Every comparison SHALL be case-insensitive and ignore surrounding whitespace, on both the session's roles and the roles a directive names.

On an instance that runs without an identity provider there is no session to assemble it from. There the role set SHALL be the reader roles the deployment configures, the same for every request, and SHALL NOT be assembled from anything the request carries. Every rule below that applies to a session's role set SHALL apply to that one in the same way.

The role set SHALL NOT depend on which directives have already been evaluated during the request, nor on the order in which directives appear in a document. Evaluating a directive SHALL leave the role set unchanged for every directive evaluated after it.

The display name SHALL NOT be able to stand in for a role. The names `admin`, `teacher`, `teachers`, `student` and `students` are reserved: a display name equal to one of them, compared case-insensitively and ignoring surrounding whitespace, SHALL NOT enter the role set, and SHALL NOT reach the plural aliasing, the admin short-circuit, or the student-view downgrade. A session SHALL hold such a role only when the identity provider or the LDAP claim says so, or, on an instance without an identity provider, when the deployment's reader roles list it. The collision SHALL be recorded in the server log, so that the account can be renamed rather than silently losing the addressed-by-name feature.

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

#### Scenario: Reader roles on an instance without an identity provider

- **WHEN** an instance without an identity provider lists `Teachers, 4BHIF` as its reader roles
- **THEN** every request holds `teacher`, `teachers` and `4bhif`
- **AND** a request carrying a cookie or header that names further roles holds exactly the same set

## ADDED Requirements

### Requirement: A render parameter never changes what a reader may see

What a request is allowed to see SHALL be decided only by its role set and by its config parameters: the teacher view (and with it the student-view downgrade), the exam view and the answer view. A render parameter, which selects only the presentation of a single request (the presentation view, the document view, print-to-PDF, a heading to scroll to, or any later parameter of that kind), SHALL NOT add a role, remove one, switch a view pseudo-role, or apply or lift the student-view downgrade. Every presentation of the same file for the same request context SHALL contain the same permitted content and SHALL omit the same restricted content. A parameter that would affect visibility SHALL be a config parameter and SHALL follow its rules, not those of a render parameter.

#### Scenario: The presentation view of a restricted page

- **WHEN** a session without `teacher` requests a page carrying an `@@@ teacher` block, once as a page, once with `?reveal=true` and once with `?document=true`
- **THEN** the block's content appears in none of the three

#### Scenario: Print does not lift the downgrade

- **WHEN** a session holding `teacher` with the teacher view off requests the print-to-PDF presentation of that page
- **THEN** the block's content does not appear, just as it does not appear on the page
