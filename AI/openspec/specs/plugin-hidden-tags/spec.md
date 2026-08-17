# plugin-hidden-tags Specification

## Purpose
TBD - created by archiving change plugin-hide-tags. Update Purpose after archive.

## Requirements

### Requirement: The rendered reading view shows no tag text

A SafeLearn tag is an instruction to the rendering server, not text a reader is meant to read. In the rendered reading view no tag SHALL be shown as its own characters — neither a fragment marker, nor a column marker, nor a directive line, nor a closing marker. What the tag governs SHALL still be shown; only the instruction goes.

#### Scenario: A document carrying every tag form is read

- **WHEN** a document containing fragments, column markers and permission directives is shown in the reading view
- **THEN** none of those tags appears as text anywhere in what is shown

#### Scenario: A tag stands in a line with other text

- **WHEN** a line contains a tag beside ordinary text
- **THEN** the tag is gone and the rest of the line is shown as it would be without it

### Requirement: Hiding a tag does not rebuild what surrounds it

Tag text SHALL be removed from the rendered node that holds it, rather than by replacing that node with a newly built one. Formatting, links and structure around a tag SHALL survive its removal unchanged, because a tag is not a reason to re-render the sentence it stands in.

#### Scenario: A tag stands in a formatted line

- **WHEN** a line carries a tag alongside emphasis, a link or a list marker
- **THEN** that formatting is shown exactly as it would be in the same line without the tag

### Requirement: What is hidden is decided from the source, not from what was rendered

Which text is a tag is a question about the document's lines, and the rendered result no longer carries them. The reading view SHALL decide what a rendered section is from the source lines that section was produced from, rather than by testing rendered text for something that resembles a tag.

Where the source lines behind rendered content are not available — content rendered outside a file's reading view, or rendered by the plugin itself — the plugin SHALL still remove tag text, and SHALL NOT present a heading, a frame or columns that it cannot establish. Guessing a structure from rendered text alone SHALL NOT be done.

#### Scenario: A section of a file is rendered

- **WHEN** the reading view renders a section of a document
- **THEN** what that section is — inside a block, opening one, closing one, or ordinary text — is taken from the lines it was rendered from

#### Scenario: Content is rendered with no source behind it

- **WHEN** content is rendered where the originating lines cannot be established
- **THEN** tag text is still removed from it, and no frame, heading or column structure is asserted over it

### Requirement: A restricted block carries its name as a heading

A block gated by a directive SHALL be shown carrying that directive's content as its heading, the way a table carries its header row, in the editor and in the rendered reading view alike. The heading SHALL name each entry of the directive as its own element carrying the distinction that entry carries: an entry the server acts on, an entry with a time window, a window the server discards, a view switch, and a switch that resolves to nothing.

An entry the server discards SHALL appear in the heading without the marking a kept entry carries. Its characters are no longer on the page to be shown unmarked beside its neighbours, and leaving it out of the heading would hide from the author that they wrote something the server throws away.

#### Scenario: A directive names several entries of different kinds

- **WHEN** a block is gated by a directive naming entries that differ in kind
- **THEN** its heading carries one element per entry, and each shows what is true of that entry rather than of its neighbours

#### Scenario: A directive names an entry the server will not read

- **WHEN** a directive contains a token the server discards, beside tokens it keeps
- **THEN** the heading shows that token too, marked as one the server does not read, and the tokens beside it are shown as they would be without it

### Requirement: A time window is reproduced as it is written

A heading SHALL carry a time window with the characters the document holds, and SHALL NOT restate it as a date, a duration or a phrase. The plugin enforces nothing; its only value is that it claims nothing of an entry that the server does not do with it, and the server discards windows that a readable restatement would make look sound.

#### Scenario: An entry carries a window

- **WHEN** a directive entry carries a bracketed window
- **THEN** the heading shows that window as the document writes it

#### Scenario: The server would discard the window

- **WHEN** an entry carries a window the server cannot read, which leaves the entry permanently active
- **THEN** the heading shows the window as written and marks it as one that will not take effect

### Requirement: A directive nothing can be read from is shown as withheld from everyone

Where no entry of a directive can be read, the server withholds that block from every reader, an admin included. Such a directive SHALL be shown with a heading stating that no reader sees the block, rather than with a heading naming anybody, and it SHALL NOT be shown as no heading at all.

#### Scenario: No entry of a directive is readable

- **WHEN** a block is gated by a directive from which nothing can be read
- **THEN** its heading says that the block is shown to no reader, in the way a withheld directive is already distinguished

### Requirement: A directive governing the whole file is shown in a frame with no lower edge

A directive on the first line governs the whole file and has no closing marker, so there is no closed region for a heading to sit on. It SHALL be shown with the same heading as a block directive, in a frame that is open at the bottom, so that the frame itself says that what it governs does not end.

#### Scenario: The first line of a document is a directive

- **WHEN** a document begins with a directive
- **THEN** it is shown with its heading in a frame that has no lower edge

#### Scenario: The same directive text stands on a later line

- **WHEN** the identical text stands on a line other than the first
- **THEN** it is shown as the heading of a closed block, which is what the server reads it as there

### Requirement: The two views show the same thing for the same directive

A person switching between the editor and the rendered reading view SHALL NOT have to learn twice what they are looking at. The heading and the frame SHALL be built from one description of the directive and SHALL be the same in both views, rather than each view deciding for itself what a directive looks like.

#### Scenario: The same document is opened in both views

- **WHEN** a document is shown in the editor with the cursor away from a directive, and then in the rendered reading view
- **THEN** the same directive is shown with the same heading, carrying the same entries with the same distinctions

### Requirement: Side-by-side content is shown as columns in the reading view

Removing the column markers and letting the content run on underneath would leave the reading view saying nothing about the page the server produces, which is what the reading view is for. A side-by-side block SHALL be shown as columns, split where the document splits it. The column widths need not be the server's.

#### Scenario: A document holds a side-by-side block

- **WHEN** a block between the column markers is shown in the reading view
- **THEN** its parts are shown beside one another, split at the separators the document names, and the markers themselves are not shown

#### Scenario: A block names more than two columns

- **WHEN** a block carries more than one separator
- **THEN** it is shown with one column per part, in the order the document writes them

### Requirement: A fragment leaves no trace in the reading view

`##fragment` selects when content appears in a presentation and says nothing about the document as a document. In the reading view it SHALL be removed with no marking and no placeholder left behind, so that the reading view reads as an ordinary document. That a fragment stands there remains visible in the editor.

#### Scenario: A line carries a fragment marker

- **WHEN** a line containing a fragment marker is shown in the reading view
- **THEN** neither the marker nor anything standing in for it is shown, and the line reads as it would without it
