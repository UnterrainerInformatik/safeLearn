## MODIFIED Requirements

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
A closing marker line with no open block SHALL close nothing and open nothing. An opening marker line inside an open block SHALL open nothing. The block ends at its own first closing line, and the inner directive line is not shown as text. Neither case SHALL change where any later block begins or ends.

#### Scenario: A stray closing marker
- **WHEN** a line `@@@` stands outside any block, and a `@@@ #variant-private` block follows later
- **THEN** the stray line is not shown, and the `@@@ #variant-private` block is hidden from a student as it would be without the stray line

#### Scenario: An opener inside an open block
- **WHEN** a `@@@ 4ahif` block contains the line `@@@ #variant-private`, and the next closing line follows after the solution
- **THEN** the block is governed by `@@@ 4ahif` alone and ends at that closing line, the line `@@@ #variant-private` is not shown, and the blocks after it begin and end where their own markers put them

### Requirement: Every reader of inline blocks uses the one grammar
The page, presentation and document views, exam handouts, embedded notes, corpus search, the corpus index's recorded block boundaries, the attachment visibility check and the exam module's check whether a file holds `#variant-private` or `#optional` blocks SHALL all determine block boundaries by this grammar. A view SHALL NOT hide or reveal a block that another view reads differently.

#### Scenario: Search does not find text hidden by a mid-line marker shift
- **WHEN** a student searches for a word that occurs only inside a `@@@ #variant-private` block of a document that also contains `` `@@@ #variant-private` `` in running text
- **THEN** the search reports no match in that document

#### Scenario: An attachment referenced only in a solution
- **WHEN** an image is referenced only inside a `@@@ #variant-private` block of such a document
- **THEN** it is not served to a student

#### Scenario: Handout exam detection ignores running text
- **WHEN** a file mentions `` `@@@ #variant-private` `` only in running text and has no `@@@ #variant-private` marker line
- **THEN** the exam module treats the file as having no private-variant blocks

