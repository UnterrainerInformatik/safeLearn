## Purpose

Renders Obsidian footnotes, both referenced definitions and inline footnotes, as numbered notes in every view, so a page shows its annotations as the author previewed them in Obsidian.

## ADDED Requirements

### Requirement: A footnote reference renders as a numbered link to its note

A reference `[^label]` whose label has a definition `[^label]: text` in the same rendered page SHALL render as a superscript number that links to the note, and the note SHALL link back to the reference. Notes SHALL be numbered 1, 2, 3 … in the order their first reference appears, whatever their labels are. Several references to one label SHALL share its number. The definition line SHALL NOT appear where it was written. A definition may continue over indented following lines, and those lines belong to the note.

#### Scenario: A numbered footnote

- **WHEN** a page contains `Fowler wrote it.[^1]` and further down `[^1]: Refactoring, 2002`
- **THEN** the sentence ends in a superscript `1` linking to a note reading "Refactoring, 2002"
- **AND** the line `[^1]: Refactoring, 2002` is not shown where it was written

#### Scenario: Named labels are numbered in order of use

- **WHEN** a page references `[^src]` first and `[^1]` second
- **THEN** `[^src]` is shown as 1 and `[^1]` as 2

#### Scenario: Two references to one note

- **WHEN** `[^a]` is referenced twice
- **THEN** both references show the same number and there is one note

### Requirement: An inline footnote is a footnote written in place

`^[text]` SHALL render as a footnote whose note is `text`, numbered in the same sequence as the referenced footnotes of the page, at the position where it stands.

#### Scenario: An inline footnote between two referenced ones

- **WHEN** a page contains `A[^x]`, then `B^[inline note]`, then `C[^y]`, with definitions for `x` and `y`
- **THEN** the three references show 1, 2 and 3
- **AND** note 2 reads "inline note"

### Requirement: Where the notes appear

In the page view and the document view, the notes SHALL be listed together after the page's content. In the presentation view, each note SHALL appear on the slide that holds its first reference, below that slide's content, and on no other slide.

#### Scenario: Notes in the presentation

- **WHEN** a footnote is referenced on the second slide of a deck and the definition stands at the end of the file
- **THEN** the note is shown on the second slide
- **AND** the last slide does not show it

#### Scenario: Notes in the document view

- **WHEN** the same page is opened as a document
- **THEN** all notes are listed after the content

### Requirement: What is not a footnote

A reference without a definition in the rendered page SHALL stay as written. A definition without a reference SHALL NOT be shown. `[^…]` and `^[…]` inside inline code or a fenced code block SHALL stay as written. A definition or reference inside an inline `@@@` block the reader may not see is removed with that block, so a reference whose definition was hidden stays as written and a definition whose only references were hidden is not shown.

#### Scenario: A reference without a definition

- **WHEN** a page contains `[^missing]` and no `[^missing]:` line
- **THEN** `[^missing]` is shown as written

#### Scenario: Footnote syntax in code

- **WHEN** a code block contains `x = a[^1]` and `^[0-9]`
- **THEN** both stay as written in the code

#### Scenario: A note inside a teacher block

- **WHEN** a footnote's definition stands inside a `@@@ teacher` block and a student opens the page
- **THEN** the student sees the reference as written and no note
