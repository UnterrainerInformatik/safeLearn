## MODIFIED Requirements

### Requirement: The exam view is reserved for teachers and admins

A `#exam` directive SHALL be granted only to a session that both has the exam preference on (`ve == 1`) and holds `teacher` or `admin` after the student-view downgrade has been applied. The preference is under the user's own control, so it SHALL NOT be sufficient on its own, whatever roles the directive names alongside `#exam`.

The exam module's rendering of a handout (`exam-handout`) SHALL fix the views for the request it answers, with the student-view downgrade applied to the role set. For a participant and for a teacher's preview it SHALL fix the exam variant hidden, the practice variant shown and the answer variant hidden, whatever the session's stored preferences. For a teacher's solution deck it SHALL fix the exam variant and the answer variant shown and the practice variant hidden. The handout rendering SHALL therefore never grant the exam view to a session that does not act as a teacher. It SHALL fix the views only for a session the module has authorized for that handout at that moment. The fixed views SHALL be set by the server for that request alone. They SHALL NOT be reachable through a stored preference, a cookie, a header, a query parameter or any other part of the request, and SHALL NOT apply to any other page the same session requests.

#### Scenario: A student turning the exam preference on

- **WHEN** a session holding neither `teacher` nor `admin` sets the exam preference on and reads a block addressed to `#exam`, whatever other roles that directive names
- **THEN** the block's content does not appear

#### Scenario: A teacher turning the exam preference on

- **WHEN** a session holding `teacher` sets the exam preference on and reads a block addressed to `#exam`
- **THEN** the block's content appears

#### Scenario: A participant reading their handout

- **WHEN** a present participant of an open offline sitting reads their handout, which contains a `#exam` block
- **THEN** the block's content does not appear on the handout

#### Scenario: A participant with the answer preference on

- **WHEN** a present participant whose stored answer preference is on reads their handout, which contains a `#answer` block
- **THEN** the block's content does not appear on the handout
- **AND** the same block on an ordinary page the participant opens in the same session appears, as their preference says

#### Scenario: A teacher's solution deck

- **WHEN** a teacher opens the solution deck of a handout that contains a `#exam` block, with the exam preference off
- **THEN** the block's content appears in the deck

#### Scenario: Asking for the handout's views on an ordinary page

- **WHEN** a student requests an ordinary corpus page with a query parameter or header that names the exam view or the handout
- **THEN** the page shows the practice variant and no `#exam` content

### Requirement: The practice view is the counterpart of the exam view

A `#practice` directive SHALL be granted to exactly those sessions a `#exam` directive is refused, and refused to exactly those it is granted. The two directives address the same content in two versions, so every session SHALL see exactly one of them. No combination of roles and stored preferences SHALL leave a reader with neither version, and none SHALL show both at once. This SHALL hold as well for the views a handout rendering fixes: a participant's handout and a teacher's preview show the practice variant and hide the exam variant, and a solution deck shows the exam variant and hides the practice variant.

The exam view is a privilege of the `teacher` and `admin` roles, decided after the student-view downgrade has been applied. A session that has switched the teacher view off has given that privilege up along with those roles, so it SHALL be shown the practice variant regardless of what the exam preference still holds. A session that never held those roles SHALL be shown the practice variant for the same reason, whatever it sets the exam preference to. A participant reading a handout SHALL be shown the practice variant for the same reason. The one exception is a teacher's solution deck (`exam-handout`), which shows the exam variant to a teacher whatever the exam preference holds.

#### Scenario: A teacher with the exam view on

- **WHEN** a session holding `teacher` or `admin` sets the exam preference on, with the teacher view on, and reads the exam/practice page
- **THEN** the exam variant appears and the practice variant does not

#### Scenario: A teacher with the exam view off

- **WHEN** that same session clears the exam preference
- **THEN** the practice variant appears and the exam variant does not

#### Scenario: A teacher looking at the page as a student

- **WHEN** a session holding `teacher` or `admin` has the exam preference on and switches the teacher view off
- **THEN** the practice variant appears and the exam variant does not
- **AND** the page shows the same question a session without those roles is shown

#### Scenario: A session that holds neither role

- **WHEN** a session holding neither `teacher` nor `admin` reads the exam/practice page, with the exam preference set and with it cleared
- **THEN** the practice variant appears in both cases and the exam variant appears in neither

#### Scenario: A handout with both variants

- **WHEN** a participant reads a handout that carries the same question as a `#exam` and a `#practice` block
- **THEN** the practice variant appears and the exam variant does not

#### Scenario: A solution deck with both variants

- **WHEN** a teacher opens the solution deck of that handout
- **THEN** the exam variant appears and the practice variant does not
