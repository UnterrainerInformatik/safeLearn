# plugin-editor-decorations Specification

## Purpose

Defines what the companion plugin marks while a teacher writes SafeLearn tags in Obsidian's editor, and what that marking must be worth: that it sits on exactly the tag it belongs to, that it stays there while the document is edited and scrolled, and that a tag the plugin cannot make sense of costs only itself rather than the marking of everything after it. The plugin enforces nothing, so a marking a person cannot trust has no remaining purpose.

## Requirements

### Requirement: A decoration covers exactly the tag it marks

A decoration SHALL span the characters of the tag it belongs to and no others. Its extent SHALL be derived from the text that was actually matched rather than from an assumed form of the tag, so that a tag written with trailing text, with trailing whitespace, or at the very end of a line is each covered exactly. A decoration SHALL NOT extend past the end of the line the tag is on.

#### Scenario: A tag ends the line it is on

- **WHEN** a line ends with a tag, with no space or text after it
- **THEN** the decoration covers that tag and stops at it, and does not reach into the following line

#### Scenario: The same tag is followed by a space

- **WHEN** the same tag appears with whitespace or text after it
- **THEN** the decoration covers the tag itself, and the difference in what follows does not change the covered extent

### Requirement: A decoration stays on its tag while the document is edited

Decorations SHALL follow the text they mark through edits. After text is inserted or removed — on the tag's own line, before it, or elsewhere in the document — each decoration SHALL still cover its own tag and no other text.

#### Scenario: Text is typed on the same line as a tag

- **WHEN** a person types at the end of a line that carries a tag
- **THEN** the tag remains marked, the marking still covers only the tag, and the typed text is not part of it

#### Scenario: Text is typed on an earlier line

- **WHEN** a person inserts or removes a line above a tag
- **THEN** the tag's marking is still on that tag, and has not stayed behind at the position the tag used to occupy

### Requirement: What is marked reflects the document as it is currently shown

The editor keeps only the lines around the viewport in the document, and a tag becomes editable when the cursor is in it. Marking SHALL therefore be brought up to date when the visible region changes and when the cursor moves, not only when the document text changes. A tag that scrolls into view SHALL be marked without requiring an edit first.

#### Scenario: A tag is scrolled into view

- **WHEN** a part of the document that was never visible in this session is scrolled to
- **THEN** the tags in it are marked, with no edit having taken place

#### Scenario: The cursor enters a tag

- **WHEN** the cursor is moved into a tag without any text being typed
- **THEN** what is shown for that tag is updated, so a person can see and edit the tag's own characters

### Requirement: A tag the plugin cannot resolve costs only itself

An unterminated block, a closing marker with no opening one, and a directive form the plugin does not represent SHALL each affect only their own line or block. The marking of the rest of the document SHALL remain correct. A single malformed or unrecognized tag SHALL NOT suppress or displace the marking of anything after it.

#### Scenario: A block is never closed

- **WHEN** a document opens a block and reaches its end without closing it
- **THEN** the tags after the opening are marked as they would be in a document without it

#### Scenario: A closing marker appears with nothing open

- **WHEN** a closing marker stands in the document with no matching opening one
- **THEN** it does not turn the text that follows into a block

#### Scenario: A file-level directive stands on the first line

- **WHEN** the first line of a document is a directive that gates the whole file and therefore has no closing marker
- **THEN** it does not open a block, and every tag later in that document is marked

### Requirement: The set of decorations is always well-formed

The editor's decoration machinery rejects a set that does not meet its ordering rules, and a rejected set is not a degraded result but the loss of all marking at once. The plugin SHALL hand over a set that meets those rules for every document it is given, including where marks and whole-line markings fall at the same position. No document content SHALL cause the editor to raise an error.

#### Scenario: A line-level and a character-level marking meet at one position

- **WHEN** a document places a block marking and a tag marking at the same position
- **THEN** both are applied, and the editor raises no error

#### Scenario: Any corpus document is opened

- **WHEN** any document of the project's corpus is opened in the editor
- **THEN** the editor reports no error while marking it

### Requirement: Whether something is a tag does not depend on when it is examined

Recognition SHALL be free of state carried between examinations: examining the same text twice SHALL give the same answer both times. Recognition SHALL also not depend on the order in which the possible tag forms are tried — the rule for what counts as a tag SHALL hold whichever form is checked first.

#### Scenario: The same content is examined repeatedly

- **WHEN** the same line is examined more than once, whether through repeated edits or a repeated rebuild
- **THEN** the answer is the same every time

#### Scenario: A line carries more than one tag

- **WHEN** a line contains two occurrences of the same tag form
- **THEN** each is recognized, rather than only the first

### Requirement: What is marked is what the server will act on

The plugin enforces nothing; its value is that a teacher can see what the rendering server will do with the document before publishing it. For every tag form the plugin marks, its rule for recognizing that form SHALL be the rule the server applies, so that marked text is text the server acts on and unmarked text is text it ignores. Where the plugin deliberately recognizes less than the server, that SHALL be recorded as a known divergence rather than left to be found as a defect; the plugin SHALL NOT recognize *more* than the server, because marking text the server will ignore misinforms the person relying on the marking.

#### Scenario: A tag form is written in a way the server accepts

- **WHEN** a document contains a tag in a spelling or position the server acts on
- **THEN** the plugin marks it

#### Scenario: A tag form is written in a way the server ignores

- **WHEN** a document contains text resembling a tag that the server does not act on — a different letter case, or a character following it that the server's rule excludes
- **THEN** the plugin does not mark it as a tag

### Requirement: The editor does not modify rendered output

Marking in the editor and hiding tags in the rendered reading view are separate mechanisms with separate triggers. The editor's marking SHALL NOT read or write the rendered output of the reading view, and an edit SHALL NOT cause rendered output elsewhere to be rewritten.

#### Scenario: A document is edited while a reading view is open

- **WHEN** text is typed in the editor while a rendered view of a document is also open
- **THEN** the editor changes only its own presentation, and does not alter the rendered view's elements
