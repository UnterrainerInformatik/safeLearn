## Purpose

Defines where an inline `@@@` permission block begins and ends. The rendering server and the companion plugin read a document by this one grammar, so the block a teacher sees framed in Obsidian is the block the server hides or shows.

## ADDED Requirements

### Requirement: Block markers are whole lines
An inline permission block SHALL open on a line that consists of optional spaces or tabs, `@@@`, and a directive naming at least one non-blank character. It SHALL close on the first later line that consists of optional spaces or tabs, `@@@`, and nothing but spaces or tabs. `@@@` anywhere else, in the middle of a line, after other text or inside inline code, SHALL be text and SHALL NOT open or close a block. The first line of a document (after frontmatter) remains the whole-file directive and is not an inline block.

#### Scenario: `@@@` inside a sentence in a block
- **WHEN** a `@@@ teacher` block contains the line ``Die Musterlösung steht in den `@@@ #exam`-Blöcken.`` and closes on a later line `@@@`
- **THEN** the block runs from its opening line to that closing line, and a session without `teacher` sees none of it, including the sentence

#### Scenario: The incident document
- **WHEN** a student of `3bhif` reads, during the file's window, a document gated `@@@ teacher, 3bhif[start to end]` whose `@@@ teacher` note mentions `` `@@@ #exam` `` in running text, followed by questions and `@@@ #exam` solution blocks
- **THEN** the student sees every question and no solution, and the text `#exam` and `@@@` do not appear in what the student is shown

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
- **WHEN** a `@@@ #exam` block contains a closed fence holding the line `@@@`, and the block closes on a `@@@` line after the fence
- **THEN** the block runs to that later line, and a student sees neither the code nor anything else of the block

#### Scenario: An unclosed fence protects nothing
- **WHEN** a ```` ``` ```` fence is opened and never closed, and a `@@@ #exam` block with its closing line follows below it
- **THEN** the `@@@ #exam` block is a block, and a student does not see its content

### Requirement: Stray and nested markers do not shift later blocks
A closing marker line with no open block SHALL close nothing and open nothing. An opening marker line inside an open block SHALL open nothing. The block ends at its own first closing line, and the inner directive line is not shown as text. Neither case SHALL change where any later block begins or ends.

#### Scenario: A stray closing marker
- **WHEN** a line `@@@` stands outside any block, and a `@@@ #exam` block follows later
- **THEN** the stray line is not shown, and the `@@@ #exam` block is hidden from a student as it would be without the stray line

#### Scenario: An opener inside an open block
- **WHEN** a `@@@ 4ahif` block contains the line `@@@ #exam`, and the next closing line follows after the solution
- **THEN** the block is governed by `@@@ 4ahif` alone and ends at that closing line, the line `@@@ #exam` is not shown, and the blocks after it begin and end where their own markers put them

### Requirement: An unclosed block runs to the end of the document
A block whose opening marker is followed by no closing marker SHALL extend to the end of the document and SHALL be decided by its directive like any other block. Its directive line SHALL NOT be shown as text.

#### Scenario: A forgotten closing marker
- **WHEN** a document contains `@@@ teacher` followed by text and no later closing line
- **THEN** a session without `teacher` sees nothing from that line to the end of the document, and a teacher sees the text without the directive line

### Requirement: Every reader of inline blocks uses the one grammar
The page, presentation and document views, exam handouts, embedded notes, corpus search, the corpus index's recorded block boundaries, the attachment visibility check and the exam module's check whether a file holds `#exam` or `#answer` blocks SHALL all determine block boundaries by this grammar. A view SHALL NOT hide or reveal a block that another view reads differently.

#### Scenario: Search does not find text hidden by a mid-line marker shift
- **WHEN** a student searches for a word that occurs only inside a `@@@ #exam` block of a document that also contains `` `@@@ #exam` `` in running text
- **THEN** the search reports no match in that document

#### Scenario: An attachment referenced only in a solution
- **WHEN** an image is referenced only inside a `@@@ #exam` block of such a document
- **THEN** it is not served to a student

#### Scenario: Handout exam detection ignores running text
- **WHEN** a file mentions `` `@@@ #exam` `` only in running text and has no `@@@ #exam` marker line
- **THEN** the exam module treats the file as having no exam blocks

### Requirement: The grammar is checked against both implementations
One table of documents and their expected block boundaries SHALL be run against the server and against the plugin. A row that one of them reads differently SHALL fail the content suite. The table SHALL contain at least: `@@@` in the middle of a line, `@@@` in inline code, marker lines in closed backtick and tilde fences, an unclosed fence followed by a block, a stray closing marker, an opener inside an open block, an unclosed block, indented markers, CRLF line endings, and the shape of the incident document.

#### Scenario: A divergence fails the suite
- **WHEN** the server or the plugin resolves a row of the table to boundaries other than those the row states
- **THEN** the content suite reports that row as failed, naming the implementation and the document
