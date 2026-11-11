# obsidian-comments Specification

## Purpose

Lets an author keep Obsidian comments (`%%…%%`) in a corpus file as notes to themselves, without any reader ever seeing them: not on a page, not in a presentation, not in search, not through an attachment only a comment mentions.

## Requirements

### Requirement: A comment runs from one `%%` to the next

Outside code, a `%%` SHALL begin a comment in one of two ways, as in Obsidian:

- A `%%` that begins a line SHALL begin a block comment. "Begins a line" means that only whitespace, blockquote markers (`>`) and list markers (`-`, `*`, `+`, `1.`, `1)`, each followed by whitespace) stand before it on its line. A block comment SHALL end with the next `%%`, wherever it stands, across lines, blank lines and code blocks. Without a later `%%`, it SHALL run to the end of the file.
- Any other `%%` SHALL begin an inline comment that ends with the next `%%` on the same line. Without one on the same line, the `%%` SHALL be no comment and SHALL be shown as written.

Both marks SHALL be part of the comment. After a comment ends, the next `%%` SHALL be judged anew by the same rule. All text outside comments SHALL stay exactly as written.

#### Scenario: An inline comment

- **WHEN** a paragraph reads `Die Lösung ist %%Lösung: 42%% im Skript.`
- **THEN** the page shows `Die Lösung ist  im Skript.` and no part of `Lösung: 42`

#### Scenario: A block comment

- **WHEN** a file holds a line `%%`, two lines of notes and another line `%%` between two paragraphs
- **THEN** both paragraphs are shown and neither note line is

#### Scenario: A block comment across blank lines

- **WHEN** a line begins with `%%`, the comment spans several paragraphs and a `---` line, and ends with `%%` in the middle of a later line
- **THEN** none of the paragraphs in between is shown, and the text after the closing `%%` is

#### Scenario: Two comments on one line

- **WHEN** a line reads `A %%x%% B %%y%% C`
- **THEN** the page shows `A`, `B` and `C`, and neither `x` nor `y`

#### Scenario: An unclosed block comment

- **WHEN** a file has a line beginning with `%%` in its third paragraph and no `%%` after it
- **THEN** the first two paragraphs are shown, and nothing from that line on

#### Scenario: An unpaired `%%` within a line

- **WHEN** a line reads `Drei vor %%offen` and the next `%%` stands on a later line, or there is none
- **THEN** the line is shown as written, `%%` included, and the later `%%` is judged on its own

### Requirement: Code protects `%%`

A `%%` inside an inline code span or inside a fenced code block (opened by three or more backticks or tildes) SHALL be neither the start nor the end of a comment and SHALL be shown as written. This SHALL hold for every fenced block, including those rendered as diagrams. A code span or fenced block that lies entirely inside a comment SHALL be removed with the comment.

#### Scenario: A format string

- **WHEN** a Java block contains `String.format("%.1f%%", rate)` and the paragraph after it has no `%%`
- **THEN** the block shows `%.1f%%` and the paragraph after it is shown

#### Scenario: Inline code

- **WHEN** a paragraph reads ``Mit `%%` beginnt ein Kommentar.``
- **THEN** the paragraph is shown in full with `%%` as code

#### Scenario: A Mermaid comment

- **WHEN** a `mermaid` block contains a line `%% layout note` and the diagram's nodes
- **THEN** the diagram is drawn as before

#### Scenario: Code inside a comment

- **WHEN** a comment spans a fenced block, from a `%%` line before it to a `%%` line after it
- **THEN** neither the block nor the comment's other lines are shown

### Requirement: Comments are removed from every read of a file

Every step that reads a corpus file's text SHALL see it with its comments removed, after the frontmatter is split off and the whole-file `@@@` directive on the body's first line has been decided, and before anything else: the inline permission blocks, rendering in the page view, the document view and the presentation view, exam handouts, search and the check whether a page references an attachment. In particular:

- A comment's text SHALL never be rendered in any view.
- An inline `@@@` block or a slide separator that stands inside a comment SHALL have no effect.
- A search SHALL not match text inside a comment, SHALL not return a file for such a match, and SHALL never quote a comment in a snippet.
- An attachment that a page references only inside a comment SHALL not be served on the strength of that page.

The whole-file directive SHALL be read from the body's first line as written, so a comment SHALL neither hide nor move it.

#### Scenario: A note to self in all three views

- **WHEN** a teacher's file visible to students carries the comment `%%KOMMENTARNOTIZ%%` and a student opens it in the page view, the document view and the presentation view
- **THEN** `KOMMENTARNOTIZ` appears in none of them

#### Scenario: Search ignores comments

- **WHEN** a student searches `KOMMENTARNOTIZ` and that word occurs only inside comments
- **THEN** the search returns no result for it

#### Scenario: A snippet next to a comment

- **WHEN** a search matches a word in a paragraph that also carries a comment
- **THEN** the snippet quotes the paragraph without the comment's text

#### Scenario: No slide break inside a comment

- **WHEN** a block comment contains a `---` line between blank lines
- **THEN** the presentation has no slide break there

#### Scenario: An attachment named only in a comment

- **WHEN** the only reference to an attachment in a visible page is `![[geheim.png]]` inside a comment, and no other page the session may see references it
- **THEN** the attachment is not served to that session

#### Scenario: The directive still gates

- **WHEN** a file's first line is `@@@ teacher` and its second line opens a comment
- **THEN** students are refused the file as for any `@@@ teacher` file

#### Scenario: A file without comments is unchanged

- **WHEN** any existing file with no `%%` outside code is rendered, searched or gated
- **THEN** the result is identical to today's
