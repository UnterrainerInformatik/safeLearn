# role-resolution Specification

## Purpose

Defines how SafeLearn decides whether a session may see content addressed by a `@@@` directive: which roles a session is considered to hold, the rule that a directive can never satisfy itself, the plural `teachers` alias of the teacher role, the admin short-circuit, the teacher's student-view downgrade, and the hardcoded gate on the exam view.

## Requirements

### Requirement: A session's roles come from the session alone

The role set a directive is evaluated against SHALL be assembled from the authenticated session only: the client roles the identity provider issued for this application, the organizational units of the user's LDAP claim, and the user's own display name. Every comparison SHALL be case-insensitive and ignore surrounding whitespace, on both the session's roles and the roles a directive names.

The role set SHALL NOT depend on which directives have already been evaluated during the request, nor on the order in which directives appear in a document. Evaluating a directive SHALL leave the role set unchanged for every directive evaluated after it.

#### Scenario: An organizational unit becomes a role

- **WHEN** the user's LDAP claim carries `OU=Teachers`, `OU=Students` or `OU=5BHIF`
- **THEN** the session holds `teacher`, `student` and `5bhif` respectively — the plural unit names map to the singular role

#### Scenario: A person addressed by name

- **WHEN** a directive names the user's own display name, for example `@@@ Stu Dent`
- **THEN** the session of that user sees the content
- **AND** no other session sees it, unless it holds another role the directive names

#### Scenario: One directive cannot influence the next

- **WHEN** a document contains a directive that names a role the session does not hold, followed by a second directive naming the same role
- **THEN** the second directive is decided exactly as it would have been on its own

### Requirement: A directive can never grant itself

A role named in a directive SHALL NOT count as a role the session holds. Access SHALL be decided by intersecting the roles the directive names with the roles the session carries, and by nothing else. This applies to every role name without exception, including `admin`, `teacher` and `teachers`.

#### Scenario: An admin-only block seen by a session that is not admin

- **WHEN** a session that does not hold `admin` reads a page containing an `@@@ admin` block
- **THEN** the block's content does not appear anywhere on the rendered page

#### Scenario: An admin-only block seen by an admin

- **WHEN** a session holding `admin` reads that page
- **THEN** the block's content appears

#### Scenario: A directive naming both a role and its alias

- **WHEN** a session that does not hold `teacher` reads a page containing a `@@@ teacher, teachers` block
- **THEN** the block's content does not appear
- **AND** naming the alias alongside the role grants nothing that naming either one alone would not grant

#### Scenario: A whole-file directive

- **WHEN** the first line of a file restricts it to roles the session does not hold
- **THEN** the file is refused when requested by direct path
- **AND** the file is absent from the navigation tree

### Requirement: The teacher role satisfies its plural alias

A session holding `teacher` SHALL also satisfy a directive naming `teachers`, and a session not holding `teacher` SHALL NOT. The alias SHALL be part of the session's role set, so that it is unaffected by the wording of any directive.

#### Scenario: A teacher and a plural directive

- **WHEN** a session holding `teacher` reads a page containing a `@@@ teachers` block
- **THEN** the block's content appears

#### Scenario: A student and a plural directive

- **WHEN** a session not holding `teacher` reads that page
- **THEN** the block's content does not appear

### Requirement: An admin sees everything gated by roles

A session holding `admin` SHALL be granted every directive that gates content by role, whether or not the directive names `admin`. This short-circuit SHALL NOT extend to the view pseudo-roles, which are decided separately.

#### Scenario: An admin and a directive naming other roles

- **WHEN** a session holding `admin` reads a block addressed to a class or to another person
- **THEN** the block's content appears

### Requirement: The student view drops the elevated roles

When a session with the teacher view switched off (`vt == 0`) reads content that permits the override, `teacher`, `teachers` and `admin` SHALL all be absent from the role set used to decide access, so that the session sees exactly what a session without those roles sees. Switching the teacher view back on SHALL restore them.

#### Scenario: A teacher viewing as a student

- **WHEN** a session holding `teacher` sets the teacher view to off
- **THEN** blocks addressed to `teacher` and to `teachers` are absent from the pages it renders
- **AND** files whose first line restricts them to `teacher` are refused by direct path and absent from the navigation tree

#### Scenario: An admin viewing as a student

- **WHEN** a session holding `admin` sets the teacher view to off
- **THEN** blocks addressed to `admin` are absent, and the admin short-circuit does not grant blocks addressed to roles the session does not otherwise hold

#### Scenario: The view switched back on

- **WHEN** the session sets the teacher view back on
- **THEN** it sees the same content it saw before the view was switched off

### Requirement: The exam view is reserved for teachers and admins

A `#exam` directive SHALL be granted only to a session that both has the exam preference on (`ve == 1`) and holds `teacher` or `admin` after the student-view downgrade has been applied. The preference is under the user's own control, so it SHALL NOT be sufficient on its own, whatever roles the directive names alongside `#exam`.

#### Scenario: A student turning the exam preference on

- **WHEN** a session holding neither `teacher` nor `admin` sets the exam preference on and reads a block addressed to `#exam`, whatever other roles that directive names
- **THEN** the block's content does not appear

#### Scenario: A teacher turning the exam preference on

- **WHEN** a session holding `teacher` sets the exam preference on and reads a block addressed to `#exam`
- **THEN** the block's content appears
