## ADDED Requirements

### Requirement: A nested block requires every enclosing block

A block nested inside another block SHALL be shown to a session only if its own directive and the directive of every block enclosing it are each granted to that session, every one decided by the rules that decide a block on its own. A nested block SHALL therefore never show anything to a session that its enclosing block hides, whatever the nested directive names, an admin included where an enclosing level is refused to admins. Text of an enclosing block outside its nested blocks SHALL be decided by the enclosing block alone.

#### Scenario: A note for one student of a class

- **WHEN** a `@@@ 4bhif` block contains `blah` and a nested `@@@ Rene Wildberger` block containing `blubb`
- **THEN** that person, a member of `4bhif`, is shown `blah` and `blubb`
- **AND** another member of `4bhif` is shown `blah` and not `blubb`
- **AND** a session outside `4bhif` is shown neither

#### Scenario: An inner role does not widen the outer one

- **WHEN** a `@@@ 4bhif` block contains a nested `@@@ teacher` block, and a teacher outside `4bhif` reads the page
- **THEN** the teacher is shown neither the outer block's text nor the nested block's

#### Scenario: A solution only for the teacher, nested

- **WHEN** a `@@@ #variant-private` block contains a nested `@@@ #optional` block
- **THEN** every session is shown the nested block's content exactly when it would be shown a `@@@ #variant-private, #optional` block

#### Scenario: An admin and a closed outer window

- **WHEN** an admin reads a page whose `@@@ 4bhif[to 2026-09-30T18:00:00]` block contains a nested `@@@ teacher` block, on 2026-10-05
- **THEN** the admin is shown neither block's content
