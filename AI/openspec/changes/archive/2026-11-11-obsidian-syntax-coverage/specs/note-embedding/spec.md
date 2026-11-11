## Purpose

Inserts the content of another note, one of its sections or one of its blocks where an Obsidian embed `![[Note]]` stands, under the same permissions that note has when it is opened on its own, so a building block can be maintained once and shown in several places.

## ADDED Requirements

### Requirement: An embed inserts a note, a section or a block

`![[Note]]` naming a Markdown note of the corpus SHALL insert that note's content in place of the embed. `![[Note#Heading]]` SHALL insert the section of that heading, from the heading up to the next heading of the same or a higher level, the heading included. `![[Note#^id]]` SHALL insert the block addressable as `^id`. Notes SHALL be resolved by name as wiki links to notes are. The inserted content SHALL render as if it were written at that place: its callouts, code, diagrams, images, footnotes, formulas and further embeds render, and its headings appear in the page's Content list and split the presentation into slides as the host's own headings do. The embedded note's frontmatter SHALL NOT be inserted, and its properties SHALL NOT affect the host page.

#### Scenario: A whole note

- **WHEN** a page contains `![[Definition Baum]]` and that note holds a paragraph and a table
- **THEN** the paragraph and the table are shown at the place of the embed

#### Scenario: A section

- **WHEN** a page contains `![[Git#Branches]]` and note `Git` has `## Branches` with a `### Merging` below it, followed by `## Tags`
- **THEN** the page shows Branches and Merging, and not Tags

#### Scenario: A block

- **WHEN** a page contains `![[Trees#^def-tree]]`
- **THEN** the page shows exactly the paragraph marked `^def-tree`

#### Scenario: Footnotes of the embedded note

- **WHEN** both the host and the embedded note define a footnote `[^1]`
- **THEN** the page shows two distinct notes, each reached from its own reference

### Requirement: The embedded note keeps its permissions

An embed SHALL insert only what the reader of the host page may see of the embedded note when opening it on its own: its whole-file directive with its time windows decides whether anything is inserted, and its inline `@@@` blocks are filtered for that reader, with the view pseudo-roles and the student-view downgrade, before the section or block is taken. An embed that inserts nothing because the reader may not see the note, the section or the block SHALL render exactly as an embed of a note that does not exist. An embed inside an `@@@` block of the host that the reader may not see SHALL NOT be resolved.

#### Scenario: An embedded teacher note

- **WHEN** an unrestricted page embeds a note whose first line restricts it to teachers, and a student opens the page
- **THEN** the student's page shows the embed as it would show an embed of a missing note
- **AND** a teacher's page shows the note's content

#### Scenario: A hidden block inside the embedded note

- **WHEN** the embedded note holds a `@@@ teacher` block and a student opens the host page
- **THEN** the student's page shows the note without that block

#### Scenario: A section that is hidden

- **WHEN** `![[Note#Lösung]]` names a heading that stands inside a `@@@ teacher` block of `Note`, and a student opens the host page
- **THEN** the student's page shows the embed as it would show an embed of a missing note

### Requirement: What an embed does not resolve

An embed of a note that does not exist, of a heading or block that does not exist, or that the reader may not see SHALL stay as written. An embed inside inline code or a fenced code block SHALL stay as written. An embed SHALL be resolved inside inserted content up to a nesting depth of five, and an embed of a note that is already being inserted further up the same chain SHALL stay as written, so a cycle ends. Embeds of attachments (`![[image.png]]`) SHALL render as they do today.

#### Scenario: A note that embeds itself

- **WHEN** note `A` embeds `B` and `B` embeds `A`, and a reader opens `A`
- **THEN** the page shows `A` with `B` inserted, and inside it `![[A]]` as written

#### Scenario: A missing note

- **WHEN** a page contains `![[Does not exist]]`
- **THEN** it is shown as written

### Requirement: Embeds and the rest of the application

An attachment referenced by embedded content SHALL be served to a reader under the rules of `attachment-access`, which already count that reference where it is written, in the embedded note. Search SHALL find embedded content in the note it is written in and SHALL NOT report it as a match of the host page.

#### Scenario: An image inside an embedded note

- **WHEN** an unrestricted note `B` embeds `![[diagram.png]]`, and an unrestricted page `A` embeds `![[B]]`
- **THEN** a student opening `A` sees the image

#### Scenario: Searching for embedded text

- **WHEN** a reader searches for a phrase that stands only in note `B`, which page `A` embeds
- **THEN** the results list note `B` and not page `A`
