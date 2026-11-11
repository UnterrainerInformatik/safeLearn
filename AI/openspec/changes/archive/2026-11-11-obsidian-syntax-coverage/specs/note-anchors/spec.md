## Purpose

Gives headings and blocks stable addresses and resolves Obsidian wiki links to them, so a link to a section or a single paragraph leads there in every view, as it does in Obsidian.

## ADDED Requirements

### Requirement: Every heading has a stable anchor

Every rendered heading SHALL carry an anchor derived from its text alone: the text lowercased, runs of whitespace replaced by `-`, and characters other than letters, digits, `-` and `_` removed, with letters of any script, umlauts included, kept. Where several headings of one rendering derive the same anchor, the first SHALL keep it and each further one SHALL get `-2`, `-3` … in document order. A heading SHALL carry the same anchor in every render for every reader who sees it and the headings before it with the same text.

#### Scenario: Anchor from the text

- **WHEN** a page has a heading `## Übung 3: Größen`
- **THEN** that heading's anchor is `übung-3-größen`

#### Scenario: Repeated headings

- **WHEN** a page has three headings `### Beispiel`
- **THEN** their anchors are `beispiel`, `beispiel-2` and `beispiel-3`

#### Scenario: The same anchor on every load

- **WHEN** a page is rendered twice
- **THEN** each heading carries the same anchor both times

### Requirement: A block reference names a block

A `^id` standing at the end of a paragraph or of a list item, separated from its text by whitespace, SHALL be removed from the visible text and SHALL make that paragraph or list item addressable as `^id`. A `^id` standing alone on a line directly after a block (a table, a quote, a list, a code block) SHALL be removed and SHALL make that block addressable. `id` consists of letters, digits and `-`. `^id` inside inline code or a fenced code block SHALL stay as written, and a `^` followed by anything else SHALL stay as written.

#### Scenario: A marked paragraph

- **WHEN** a paragraph ends in `… is defined as follows. ^def-tree`
- **THEN** the paragraph is shown without `^def-tree`
- **AND** it is addressable as `^def-tree`

#### Scenario: A marked table

- **WHEN** a table is followed by a line `^table-grades`
- **THEN** that line is not shown and the table is addressable as `^table-grades`

#### Scenario: A caret in code and in a formula of text

- **WHEN** a code block contains `x ^mask` and a paragraph contains `2^10`
- **THEN** both are shown as written

### Requirement: A wiki link can name a heading or a block

`[[Note#Heading]]` SHALL link to the heading of note `Note` whose text is `Heading`, compared without regard to case and to surrounding whitespace, and `[[Note#^id]]` to the block of `Note` addressable as `^id`. `[[#Heading]]` and `[[#^id]]` SHALL link to that heading or block of the same page. Where several `#` segments name nested headings, the last SHALL decide. Where several headings match, the link SHALL lead to the first. `|text` SHALL give the link's text as for any wiki link; without it the text SHALL be the note's name followed by each `#` segment as written, joined by ` > ` (`Note > Heading`, `Note > Chapter > Heading`, `Note > ^id`), and for a link within the page the segments alone (`Heading`). A note that resolves with a heading or block that does not exist SHALL link to the note itself. A note that does not resolve SHALL stay as written, as a wiki link to an unknown note does today.

#### Scenario: A link to a heading in another note

- **WHEN** a page contains `[[Git#Branches]]` and note `Git` has a heading `## Branches`
- **THEN** the link opens note `Git` at that heading

#### Scenario: A link within the page

- **WHEN** a page contains `[[#Installation|see installation]]` and has a heading `## Installation`
- **THEN** a link reading "see installation" jumps to that heading on the same page

#### Scenario: A link to a block

- **WHEN** a page contains `[[Trees#^def-tree]]` and a paragraph of note `Trees` is marked `^def-tree`
- **THEN** the link opens note `Trees` at that paragraph

#### Scenario: Nested headings in a link

- **WHEN** a page contains `[[Git#Remote#Branches]]`
- **THEN** the link reads `Git > Remote > Branches` and opens note `Git` at the heading `Branches`

#### Scenario: A heading that does not exist

- **WHEN** a page contains `[[Git#Nonexistent]]`
- **THEN** the link opens note `Git` at its top

### Requirement: Anchors lead to the right place in every view

In the page view and the document view, following a link to a heading or block SHALL scroll to it. In the presentation view, following a link to a heading or block of the same deck SHALL show the slide that holds it. A link to another note SHALL open that note in the page view, as links between notes do today.

#### Scenario: A link within a deck

- **WHEN** a deck contains `[[#Summary]]` on its first slide and `## Summary` heads a later slide
- **THEN** following the link shows the Summary slide
