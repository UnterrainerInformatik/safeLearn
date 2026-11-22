## ADDED Requirements

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
