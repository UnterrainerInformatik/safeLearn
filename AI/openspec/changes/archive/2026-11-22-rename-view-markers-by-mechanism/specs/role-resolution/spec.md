## RENAMED Requirements

- FROM: `### Requirement: The exam view is reserved for teachers and admins`
- TO: `### Requirement: The private variant is reserved for teachers and admins`

- FROM: `### Requirement: The practice view is the counterpart of the exam view`
- TO: `### Requirement: The public variant is the counterpart of the private variant`

## MODIFIED Requirements

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

## ADDED Requirements

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

