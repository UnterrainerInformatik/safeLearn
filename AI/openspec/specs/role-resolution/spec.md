# role-resolution Specification

## Purpose

Defines how SafeLearn decides whether a session may see content addressed by a `@@@` directive: which roles a session is considered to hold, the rule that a directive can never satisfy itself, the names reserved so that a display name cannot stand in for a role, the plural aliases of the teacher and student roles, the admin short-circuit, the teacher's student-view downgrade, the hardcoded gate on the exam view, the refusal that follows a failed role resolution, and the request-scoped context that every directive of a single request is decided against.

## Requirements

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

### Requirement: The private variant is reserved for teachers and admins

A `#variant-private` directive SHALL be granted only to a session that both has the variant preference on (`ve == 1`) and holds `teacher` or `admin` after the student-view downgrade has been applied. The preference is under the user's own control, so it SHALL NOT be sufficient on its own, whatever roles the directive names alongside `#variant-private`.

The exam module's rendering of a handout (`exam-handout`) SHALL fix the views for the request it answers, with the student-view downgrade applied to the role set. For a participant and for a teacher's preview it SHALL fix the private variant hidden, the public variant shown and the optional blocks hidden, whatever the session's stored preferences. For a teacher's solution page it SHALL fix the private variant and the optional blocks shown and the public variant hidden. The handout rendering SHALL therefore never grant the private-variant view to a session that does not act as a teacher. It SHALL fix the views only for a session the module has authorized for that handout at that moment. The fixed views SHALL be set by the server for that request alone. They SHALL NOT be reachable through a stored preference, a cookie, a header, a query parameter or any other part of the request, and SHALL NOT apply to any other page the same session requests.

#### Scenario: A student turning the exam preference on

- **WHEN** a session holding neither `teacher` nor `admin` sets the variant preference on and reads a block addressed to `#variant-private`, whatever other roles that directive names
- **THEN** the block's content does not appear

#### Scenario: A teacher turning the exam preference on

- **WHEN** a session holding `teacher` sets the variant preference on and reads a block addressed to `#variant-private`
- **THEN** the block's content appears

#### Scenario: A participant reading their handout

- **WHEN** a present participant of an open offline sitting reads their handout, which contains a `#variant-private` block
- **THEN** the block's content does not appear on the handout

#### Scenario: A participant with the answer preference on

- **WHEN** a present participant whose stored optional preference is on reads their handout, which contains a `#optional` block
- **THEN** the block's content does not appear on the handout
- **AND** the same block on an ordinary page the participant opens in the same session appears, as their preference says

#### Scenario: A teacher's solution page

- **WHEN** a teacher opens the solution page of a handout that contains a `#variant-private` block, with the variant preference off
- **THEN** the block's content appears in the deck

#### Scenario: Asking for the handout's views on an ordinary page

- **WHEN** a student requests an ordinary corpus page with a query parameter or header that names the private-variant view or the handout
- **THEN** the page shows the public variant and no `#variant-private` content

### Requirement: The public variant is the counterpart of the private variant

A `#variant-public` directive SHALL be granted to exactly those sessions a `#variant-private` directive is refused, and refused to exactly those it is granted. The two directives address the same content in two versions, so every session SHALL see exactly one of them. No combination of roles and stored preferences SHALL leave a reader with neither version, and none SHALL show both at once. This SHALL hold as well for the views a handout rendering fixes: a participant's handout and a teacher's preview show the public variant and hide the private variant, and a solution page shows the private variant and hides the public variant.

The private-variant view is a privilege of the `teacher` and `admin` roles, decided after the student-view downgrade has been applied. A session that has switched the teacher view off has given that privilege up along with those roles, so it SHALL be shown the public variant regardless of what the variant preference still holds. A session that never held those roles SHALL be shown the public variant for the same reason, whatever it sets the variant preference to. A participant reading a handout SHALL be shown the public variant for the same reason. The one exception is a teacher's solution page (`exam-handout`), which shows the private variant to a teacher whatever the variant preference holds.

#### Scenario: A teacher with the exam view on

- **WHEN** a session holding `teacher` or `admin` sets the variant preference on, with the teacher view on, and reads the variant page
- **THEN** the private variant appears and the public variant does not

#### Scenario: A teacher with the exam view off

- **WHEN** that same session clears the variant preference
- **THEN** the public variant appears and the private variant does not

#### Scenario: A teacher looking at the page as a student

- **WHEN** a session holding `teacher` or `admin` has the variant preference on and switches the teacher view off
- **THEN** the public variant appears and the private variant does not
- **AND** the page shows the same question a session without those roles is shown

#### Scenario: A session that holds neither role

- **WHEN** a session holding neither `teacher` nor `admin` reads the variant page, with the variant preference set and with it cleared
- **THEN** the public variant appears in both cases and the private variant appears in neither

#### Scenario: A handout with both variants

- **WHEN** a participant reads a handout that carries the same question as a `#variant-private` and a `#variant-public` block
- **THEN** the public variant appears and the private variant does not

#### Scenario: A solution page with both variants

- **WHEN** a teacher opens the solution page of that handout
- **THEN** the private variant appears and the public variant does not

### Requirement: Role resolution denies access when it fails

When the role check cannot be completed — a malformed session, an unreadable client configuration, or any other error raised while resolving roles — it SHALL deny access. It SHALL NOT return a value that a caller could read as anything other than a refusal, and it SHALL NOT fall through to rendering the guarded content. The failure SHALL be recorded in the server log.

#### Scenario: The role check raises an error

- **WHEN** resolving the session's roles fails while a page containing a restricted block is rendered
- **THEN** the block's content does not appear
- **AND** a file whose first line restricts it is refused by direct path and absent from the navigation tree

### Requirement: The evaluation context is fixed for the duration of a request

The context a directive is evaluated against — the session's role set, the view preferences that govern the exam, teacher and answer views, and the reference time that a directive's permission windows are compared to — SHALL be resolved once per request and SHALL NOT change while that request is served. Every directive that request evaluates SHALL be decided against that one context, whether it gates a whole file or an inline block, and whether it is reached while building the navigation tree or while filtering the content of a document.

This is what the existing requirement that the role set must not depend on evaluation order asks for, stated so that it holds by construction: with one context per request there is no second assembly that could disagree with the first.

#### Scenario: A preference is written while a page is being assembled

- **WHEN** a session changes one of its view preferences in a second request while a page requested by the first is still being assembled
- **THEN** that page is finished against the preferences it started with, so its navigation tree and its content are the same session's view of the corpus
- **AND** the next page the session requests is the first one decided against the new preference

#### Scenario: A permission window closes during a render

- **WHEN** a document carries several directives whose time window ends at a moment falling between the evaluation of the first of them and the last
- **THEN** all of them are decided against the same reference time, so the window is open for all of them or closed for all of them

#### Scenario: A request stores a preference of its own

- **WHEN** a request writes a new value for one of the session's view preferences
- **THEN** whatever that same request evaluates afterwards uses the value it has just written, rather than the value it replaced

#### Scenario: The same file is judged twice in one request

- **WHEN** a session opens a file that the navigation tree of the same response also lists
- **THEN** the tree and the page reach the same verdict on that file, because both were decided against the same context

### Requirement: Resolving the context costs at most one identity-provider lookup per request

Assembling the evaluation context SHALL query the identity provider at most once per request, however many directives that request goes on to evaluate. A request that evaluates no directive SHALL NOT query it at all. The number of lookups a request causes SHALL NOT grow with the number of files in the corpus, the number of entries in the navigation tree, or the number of gated blocks in the document being rendered.

#### Scenario: A page whose tree and content are both gated

- **WHEN** a session opens a document carrying inline directives, served alongside a navigation tree of files that carry whole-file directives
- **THEN** the identity provider is queried once while that request is served

#### Scenario: A request that asks no permission question

- **WHEN** a session requests something whose handling evaluates no directive
- **THEN** the identity provider is not queried for that request

#### Scenario: The corpus grows

- **WHEN** files carrying whole-file directives are added to the corpus
- **THEN** the number of identity-provider lookups one page view causes is the same as before

### Requirement: A failed context resolution is settled once for the whole request

When the lookup that supplies the view preferences fails, the request SHALL settle on their default values — the exam view off, the teacher view off, answers hidden — for the whole of its duration, and SHALL record the failure in the server log once rather than once per directive. No request SHALL decide one part of its answer against one set of preferences and another part against a different set.

The roles themselves are unaffected by such a failure, because they are carried in the session rather than read by the lookup. The defaults therefore narrow what the session is shown and never widen it: the teacher view off applies the student-view downgrade, the exam view off yields the practice variant, and answers stay hidden.

#### Scenario: The lookup fails while a page is rendered

- **WHEN** the preference lookup fails during a request that renders a document containing content gated by the teacher view
- **THEN** every directive of that page is decided against the default preferences, so the whole page is the view a session without the elevated roles is shown
- **AND** the page is served rather than refused

#### Scenario: A later request succeeds

- **WHEN** the lookup succeeds again on a subsequent request
- **THEN** that request is decided against the session's stored preferences, with nothing carried over from the failed one

### Requirement: A render parameter never changes what a reader may see

What a request is allowed to see SHALL be decided only by its role set and by its config parameters: the teacher view (and with it the student-view downgrade), the exam view and the answer view. A render parameter, which selects only the presentation of a single request (the presentation view, the document view, print-to-PDF, a heading to scroll to, or any later parameter of that kind), SHALL NOT add a role, remove one, switch a view pseudo-role, or apply or lift the student-view downgrade. Every presentation of the same file for the same request context SHALL contain the same permitted content and SHALL omit the same restricted content. A parameter that would affect visibility SHALL be a config parameter and SHALL follow its rules, not those of a render parameter.

#### Scenario: The presentation view of a restricted page

- **WHEN** a session without `teacher` requests a page carrying an `@@@ teacher` block, once as a page, once with `?reveal=true` and once with `?document=true`
- **THEN** the block's content appears in none of the three

#### Scenario: Print does not lift the downgrade

- **WHEN** a session holding `teacher` with the teacher view off requests the print-to-PDF presentation of that page
- **THEN** the block's content does not appear, just as it does not appear on the page

### Requirement: The view markers are exactly three and carry no aliases

A directive entry starting with `#` SHALL be a view marker, not a role, and SHALL NOT be tested against the session's roles. Exactly three view markers SHALL be known: `#variant-private`, `#variant-public` and `#optional`, compared case-insensitively. The names `#exam`, `#practice` and `#answer` SHALL NOT be known; they SHALL be treated as any other unknown view marker.

A directive that names an unknown view marker SHALL be refused to every session, an admin included, whatever the session's stored preferences and whatever else the directive names, and whether it is an inline block's directive or a whole-file directive. A handout rendering SHALL refuse it as well, on the participant's handout, on the teacher's preview and on the solution page. An unknown view marker SHALL therefore never make a block visible that its known name would have hidden.

#### Scenario: A block still marked with a retired name

- **WHEN** a page carries a `@@@ #exam` block, and a student, a teacher with the variant preference on and an admin each read it
- **THEN** none of them is shown the block's content

#### Scenario: A misspelled marker

- **WHEN** a page carries a `@@@ #variant-privat` block and a student reads it
- **THEN** the block's content does not appear

#### Scenario: An unknown marker beside a role

- **WHEN** a page carries a `@@@ 4ahif #answer` block and a member of `4ahif` with the optional preference on reads it
- **THEN** the block's content does not appear

#### Scenario: An unknown marker as the whole-file directive

- **WHEN** a file's first line is `@@@ #practice`
- **THEN** the file is refused to every session and is absent from every session's navigation tree

#### Scenario: The known markers in any case

- **WHEN** a page carries a `@@@ #Variant-Private` block and a teacher with the variant preference on reads it
- **THEN** the block's content appears, as it does for `@@@ #variant-private`

#### Scenario: A retired name on a solution page

- **WHEN** a teacher opens the solution page of a handout whose solutions still stand in `@@@ #exam` blocks
- **THEN** the solutions do not appear

### Requirement: View markers in one directive are combined with AND

When a directive names several known view markers, the block SHALL be shown only to a session for which every one of them holds, and the result SHALL NOT depend on the order in which they are written. The roles and persons a directive names SHALL remain combined with OR among themselves, and SHALL be combined with the view markers by AND. A directive naming both `#variant-private` and `#variant-public` SHALL therefore be refused to every session, an admin included, and on every handout rendering.

#### Scenario: A teacher-only revealable solution

- **WHEN** a page carries a `@@@ #variant-private, #optional` block
- **THEN** a teacher with the variant preference on and the optional preference on is shown its content
- **AND** a teacher with the variant preference on and the optional preference off is not
- **AND** a student with the optional preference on is not

#### Scenario: The order of the markers does not matter

- **WHEN** a page carries a `@@@ #optional, #variant-private` block
- **THEN** every session is shown its content exactly when it would be shown a `@@@ #variant-private, #optional` block

#### Scenario: Both variants at once

- **WHEN** a page carries a `@@@ #variant-private, #variant-public` block, and a student, a teacher with the variant preference on, a teacher with it off and an admin each read it
- **THEN** none of them is shown its content

#### Scenario: Combined markers on a handout

- **WHEN** an offline test's file carries a `@@@ #variant-private, #optional` block
- **THEN** the participant's handout does not show it, and the teacher's solution page shows it

### Requirement: Written roles are not replaced by view markers

When a directive names at least one role or person, a session SHALL be shown the block only if it holds one of those roles or persons through an entry that is open at the request's reference time. If no entry naming a role or person is open, the directive SHALL be refused to every session, an admin included, whatever view markers it also names; it SHALL NOT be decided as if it named view markers only. This holds for inline blocks and for whole-file directives alike.

#### Scenario: The class window has closed

- **WHEN** a page carries a `@@@ 4ahif[2026-09-01T08:00:00 to 2026-09-30T18:00:00], #optional` block, and on 2026-10-05 a reader outside `4ahif` with the optional preference on reads it
- **THEN** the block's content does not appear

#### Scenario: One of two roles is still open

- **WHEN** a page carries a `@@@ teacher, 4ahif[to 2026-09-30T18:00:00], #optional` block, and on 2026-10-05 a teacher with the optional preference on reads it
- **THEN** the block's content appears, because `teacher` is open and held

#### Scenario: An admin and a closed directive

- **WHEN** an admin reads a page carrying a `@@@ 4ahif[to 2026-09-30T18:00:00], #optional` block on 2026-10-05
- **THEN** the block's content does not appear

### Requirement: An entry with an unreadable window is closed

An entry whose bracketed window cannot be read as a time, in whole or in any part, SHALL be kept as an entry and SHALL be closed at every reference time. It SHALL NOT be treated as an entry without a window, and SHALL NOT be treated as a window of which only the readable part counts. The same SHALL hold for an entry that cannot be read at all, such as one with an empty or unbalanced bracket: it is a closed entry naming a role, or a closed view marker if it begins with `#`, and SHALL NOT be dropped. A closed entry naming a role or person SHALL admit nobody. A closed entry naming a view marker SHALL make that marker unsatisfiable, so its block is refused to every session, an admin included. An empty entry between two commas names nothing and SHALL be ignored. An entry with an unreadable window SHALL NOT cause any visibility change to be announced to readers, since it never opens.

#### Scenario: A misspelled window

- **WHEN** a page carries a `@@@ Gerald Unterrainer, , 4bhif [falsche syntax], teacher` block, and a member of `4bhif` who is neither a teacher nor that person reads it
- **THEN** the block's content does not appear
- **AND** a teacher is shown its content, and so is the session named `Gerald Unterrainer`

#### Scenario: Half a window

- **WHEN** a page carries a `@@@ 4bhif[2026-11-01T08:00:00 to nächste Woche]` block, and a member of `4bhif` reads it on any date
- **THEN** the block's content does not appear

#### Scenario: An entry that cannot be read at all

- **WHEN** a page carries a `@@@ 4ahif [], #optional` block, and a reader with the optional preference on reads it
- **THEN** the block's content does not appear, because the unreadable entry still counts as a written role that is closed

#### Scenario: Every entry has an unreadable window

- **WHEN** a file's first line is `@@@ teacher[morgen]`
- **THEN** the file is refused to every session, an admin included, and is absent from every navigation tree

#### Scenario: A window on a view marker

- **WHEN** a page carries a `@@@ teacher, #optional[to 2026-09-30T18:00:00]` block, and on 2026-10-05 a teacher with the optional preference on reads it
- **THEN** the block's content does not appear
