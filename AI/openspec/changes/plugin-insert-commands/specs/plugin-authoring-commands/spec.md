## ADDED Requirements

### Requirement: The plugin writes the tags it recognizes

The plugin SHALL offer commands that insert SafeLearn tags into the document, so that a tag can be written without being typed. What a command inserts SHALL be built from the same spellings the plugin recognizes, so that a command cannot produce a tag the plugin does not mark or the server does not act on.

#### Scenario: A tag is inserted

- **WHEN** an authoring command is invoked in an editor
- **THEN** what it writes into the document is marked by the plugin as the tag it is

### Requirement: What is inserted is well-formed for the renderer

Each marker a command writes SHALL stand alone on a line of its own, and an insertion SHALL begin on a line of its own rather than in the middle of one. A marker sharing a line with other text is a marker the plugin does not mark and the server's block boundaries fall inside running text, so what a command writes SHALL NOT be a form that only one of the two reads.

#### Scenario: The cursor stands in the middle of a line

- **WHEN** a command is invoked with the cursor inside a line of text
- **THEN** what is inserted begins on a new line, and no marker shares a line with the text that was there

#### Scenario: A block is inserted

- **WHEN** a command inserts a block of markers
- **THEN** each marker is on a line of its own, and the block is one the renderer reads as a block

### Requirement: An insertion never displaces a directive that gates the file

A directive on the first line gates the whole document, and it does so by standing on the first line and by nothing else. An authoring command SHALL NOT push it down: an insertion that would be written above it SHALL be written below it instead. A command run to add a marker SHALL NOT change who may read the document.

Where such a line is part of what a person selected, this does not apply — the selection names it, and what follows is shown by the marking that stops saying the file is gated.

#### Scenario: A command is invoked at the very start of a gated document

- **WHEN** a command is invoked with the cursor at the start of a document whose first line gates the file
- **THEN** what it writes stands below that line, and the first line of the document is unchanged

#### Scenario: A command reaches upward for the block it is given

- **WHEN** a command that writes above the block the cursor is in is invoked in a block that reaches the first line of a gated document
- **THEN** it writes below the gating line rather than above it

### Requirement: A side-by-side block is inserted with two columns without asking

The common case SHALL be a command that lays out two columns and asks nothing. A second command SHALL ask how many columns, for the cases that are not two. There SHALL NOT be a further command for a specific other number: an entry that is read past every time costs more than it saves.

#### Scenario: The two-column command is invoked

- **WHEN** the command for two columns is invoked
- **THEN** a two-column block is inserted, with nothing asked

#### Scenario: The command that asks is invoked

- **WHEN** the command that asks for a column count is invoked
- **THEN** the count is asked for, and a block with that many columns is inserted

#### Scenario: A count below two is given

- **WHEN** a count that would not produce a side-by-side block is given
- **THEN** no such block is inserted

### Requirement: A selection is enclosed whole and never divided

Where a command is invoked with text selected, that text SHALL be enclosed by the block unchanged, and SHALL NOT be split between columns. The separators SHALL be written after the selected content, so that where the columns divide is left to the person who selected it.

#### Scenario: Several paragraphs are selected

- **WHEN** a side-by-side command is invoked with more than one paragraph selected
- **THEN** the selected text is inside the block exactly as it was, with no separator written into it

#### Scenario: A block of more than two columns is inserted around a selection

- **WHEN** the command that asks for a count is answered with more than two
- **THEN** the selection stands in the first column and the remaining columns are there to be written in, each reachable without making room first

### Requirement: A fragment marker is inserted before the block the cursor is in

A fragment marker SHALL be written on a line of its own above the block the cursor stands in — the run of lines it belongs to — rather than above the cursor's own line. A marker written into the middle of a paragraph divides it, and makes a fragment of a half nobody asked to separate.

#### Scenario: The cursor is in the middle of a paragraph

- **WHEN** the fragment command is invoked with the cursor inside a paragraph
- **THEN** the marker stands on its own line above that whole paragraph, and the paragraph is not divided

#### Scenario: Text is selected

- **WHEN** the fragment command is invoked with text selected
- **THEN** the marker stands on its own line above the selected text

### Requirement: Every authoring command is reachable from the palette and from the editor's context menu

The commands SHALL be offered in Obsidian's command palette and in the editor's context menu, and both SHALL be built from one description of what the commands are. A command SHALL NOT be able to exist in one of the two and not the other.

The context menu belongs to Obsidian, and other plugins add to it too. The plugin's entries SHALL therefore stand together as a group of their own within it, and SHALL NOT be scattered among the entries of others.

#### Scenario: A command is added

- **WHEN** the set of authoring commands gains an entry
- **THEN** that entry is offered in both the palette and the context menu, without either being maintained separately

#### Scenario: The context menu is opened in an editor

- **WHEN** the editor's context menu is opened
- **THEN** the plugin's commands are reachable under a single entry of its own

### Requirement: A command changes the document and leaves the cursor where writing continues

An authoring command SHALL change the document text and nothing else about the session — not the view, not the scroll position, not the selection of another editor. After it has run, the cursor SHALL stand where the next thing a person writes belongs.

#### Scenario: A command is invoked with nothing selected

- **WHEN** a command that inserts an empty structure is invoked
- **THEN** the cursor is left in the place that structure is waiting to have written into it

#### Scenario: A command is invoked

- **WHEN** any authoring command runs
- **THEN** the only difference it makes is to the text of the document it was invoked in
