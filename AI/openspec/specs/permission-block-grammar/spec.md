# permission-block-grammar Specification

## Purpose

Defines where an inline `@@@` permission block begins and ends. The rendering server and the companion plugin read a document by this one grammar, so the block a teacher sees framed in Obsidian is the block the server hides or shows.

## Requirements

### Requirement: Block markers are whole lines
An inline permission block SHALL open on a line that consists of optional spaces or tabs, `@@@`, and a directive naming at least one non-blank character. It SHALL close on the first later line that consists of optional spaces or tabs, `@@@`, and nothing but spaces or tabs. `@@@` anywhere else, in the middle of a line, after other text or inside inline code, SHALL be text and SHALL NOT open or close a block. The first line of a document (after frontmatter) remains the whole-file directive and is not an inline block.

#### Scenario: `@@@` inside a sentence in a block
- **WHEN** a `@@@ teacher` block contains the line ``Die Musterlösung steht in den `@@@ #variant-private`-Blöcken.`` and closes on a later line `@@@`
- **THEN** the block runs from its opening line to that closing line, and a session without `teacher` sees none of it, including the sentence

#### Scenario: The incident document
- **WHEN** a student of `3bhif` reads, during the file's window, a document gated `@@@ teacher, 3bhif[start to end]` whose `@@@ teacher` note mentions `` `@@@ #variant-private` `` in running text, followed by questions and `@@@ #variant-private` solution blocks
- **THEN** the student sees every question and no solution, and the text `#variant-private` and `@@@` do not appear in what the student is shown

#### Scenario: `@@@` mid-line outside any block
- **WHEN** a line outside any block reads ``Syntax: `@@@ 4ahif` … `@@@` ``
- **THEN** the line is shown as written and no block opens

#### Scenario: Indented marker lines
- **WHEN** an opening and a closing marker are indented with spaces or tabs, as inside a list item
- **THEN** they open and close a block as unindented markers do

### Requirement: Markers inside a fenced code block are code
A fenced code block SHALL open on a line that starts, after optional spaces or tabs, with at least three backticks or at least three tildes. It SHALL close on the first later line that holds, after optional spaces or tabs, at least as many of the same character and nothing else but spaces or tabs. A marker line between a fence's opening and its closing line SHALL be neither an opening nor a closing marker. A fence that is never closed SHALL NOT protect anything, so every marker line after its opening line is read as if the fence were not there. The fence rule applies inside and outside permission blocks alike.

#### Scenario: A syntax example in a code block
- **WHEN** a document outside any block contains a closed ```` ``` ```` fence whose lines are `@@@ teacher`, `secret`, `@@@`
- **THEN** every session sees the code block with those three lines, and no block opens

#### Scenario: A tilde fence
- **WHEN** the same example is fenced with `~~~` instead of backticks
- **THEN** it is shown as code to every session, and no block opens

#### Scenario: A closing marker inside code within a block
- **WHEN** a `@@@ #variant-private` block contains a closed fence holding the line `@@@`, and the block closes on a `@@@` line after the fence
- **THEN** the block runs to that later line, and a student sees neither the code nor anything else of the block

#### Scenario: An unclosed fence protects nothing
- **WHEN** a ```` ``` ```` fence is opened and never closed, and a `@@@ #variant-private` block with its closing line follows below it
- **THEN** the `@@@ #variant-private` block is a block, and a student does not see its content

### Requirement: Stray and nested markers do not shift later blocks
A closing marker line with no open block SHALL close nothing and open nothing. An opening marker line inside an open block SHALL open a nested block inside it, and a closing marker line SHALL close the innermost open block. Blocks SHALL therefore pair like brackets: a stray closing line or a nested opener SHALL NOT change where any block that begins after the outermost enclosing block has closed begins or ends. The directive line of a nested block SHALL NOT be shown as text, and neither SHALL a stray closing line.

#### Scenario: A stray closing marker
- **WHEN** a line `@@@` stands outside any block, and a `@@@ #variant-private` block follows later
- **THEN** the stray line is not shown, and the `@@@ #variant-private` block is hidden from a student as it would be without the stray line

#### Scenario: An opener inside an open block
- **WHEN** a `@@@ 4ahif` block contains the line `@@@ #variant-private`, and two closing lines follow after the solution
- **THEN** the `@@@ #variant-private` block is nested in the `@@@ 4ahif` block and ends at the first of the two closing lines, the `@@@ 4ahif` block ends at the second, and the line `@@@ #variant-private` is not shown

#### Scenario: A nested block
- **WHEN** a document reads `@@@ 4bhif`, `blah`, `@@@ Rene Wildberger`, `blubb`, `@@@`, `@@@`
- **THEN** there are two blocks: the outer one from `@@@ 4bhif` to the last line, holding `blah` and the inner block, and the inner one from `@@@ Rene Wildberger` to the first `@@@`, holding `blubb`
- **AND** neither directive line and neither closing line is shown as text

#### Scenario: Text after a nested block within the outer block
- **WHEN** a `@@@ 4bhif` block contains a closed `@@@ #variant-private` block followed by more text before its own closing line
- **THEN** that text belongs to the `@@@ 4bhif` block only

#### Scenario: Blocks after a nest
- **WHEN** a nest of two blocks is closed by two closing lines, and a `@@@ #variant-private` block follows below
- **THEN** that block begins and ends where its own markers put them

### Requirement: An unclosed block runs to the end of the document
A block whose opening marker is followed by no closing marker of its own SHALL extend to the end of the document and SHALL be decided by its directive like any other block. This SHALL hold at every nesting level: when closing lines run out, every block still open extends to the end of the document. Its directive line SHALL NOT be shown as text.

#### Scenario: A forgotten closing marker
- **WHEN** a document contains `@@@ teacher` followed by text and no later closing line
- **THEN** a session without `teacher` sees nothing from that line to the end of the document, and a teacher sees the text without the directive line

#### Scenario: A forgotten inner closing marker
- **WHEN** a document reads `@@@ 4bhif`, `a`, `@@@ #variant-private`, `b`, `@@@`, `c`, with no further closing line
- **THEN** the inner block holds `b`, the outer block holds `a`, the inner block and `c` and runs to the end of the document, and a student outside `4bhif` sees none of `a`, `b` and `c`

### Requirement: Every reader of inline blocks uses the one grammar
The page, presentation and document views, exam handouts, embedded notes, corpus search, the corpus index's recorded block boundaries, the attachment visibility check and the exam module's check whether a file holds `#variant-private` or `#optional` blocks SHALL all determine block boundaries, including nesting, by this grammar. A view SHALL NOT hide or reveal a block that another view reads differently, and SHALL NOT show the content of a nested block whose enclosing block it hides.

#### Scenario: Search does not find text hidden by a mid-line marker shift
- **WHEN** a student searches for a word that occurs only inside a `@@@ #variant-private` block of a document that also contains `` `@@@ #variant-private` `` in running text
- **THEN** the search reports no match in that document

#### Scenario: An attachment referenced only in a solution
- **WHEN** an image is referenced only inside a `@@@ #variant-private` block of such a document
- **THEN** it is not served to a student

#### Scenario: Handout exam detection ignores running text
- **WHEN** a file mentions `` `@@@ #variant-private` `` only in running text and has no `@@@ #variant-private` marker line
- **THEN** the exam module treats the file as having no private-variant blocks

#### Scenario: Search inside a nested block
- **WHEN** a word occurs only inside a `@@@ Rene Wildberger` block nested in a `@@@ 4bhif` block, and a member of `4bhif` other than that person searches for it
- **THEN** the search reports no match in that document

#### Scenario: An attachment in a nested block
- **WHEN** an image is referenced only inside a `@@@ teacher` block nested in a `@@@ 4bhif` block
- **THEN** it is served neither to a teacher outside `4bhif` nor to a member of `4bhif` who is not a teacher

#### Scenario: Handout exam detection in a nested block
- **WHEN** a file's only `#variant-private` marker line opens a block nested in another block
- **THEN** the exam module treats the file as having private-variant blocks

### Requirement: The grammar is checked against both implementations
One table of documents and their expected block boundaries SHALL be run against the server and against the plugin. A row that one of them reads differently SHALL fail the content suite. The table SHALL contain at least: `@@@` in the middle of a line, `@@@` in inline code, marker lines in closed backtick and tilde fences, an unclosed fence followed by a block, a stray closing marker, an opener inside an open block, two and three levels of nesting, a nest whose inner block is unclosed, a nest whose outer block is unclosed, a closing marker inside code within a nested block, an unclosed block, indented markers, CRLF line endings, and the shape of the incident document.

#### Scenario: A divergence fails the suite
- **WHEN** the server or the plugin resolves a row of the table to boundaries other than those the row states
- **THEN** the content suite reports that row as failed, naming the implementation and the document
