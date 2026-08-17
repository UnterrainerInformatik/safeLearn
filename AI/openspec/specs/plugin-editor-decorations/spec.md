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

The editor keeps only the lines around the viewport in the document, and what is on screen for a tag depends on where the cursor is: a tag shown as its own characters becomes editable when the cursor is in it, and a directive line whose characters are replaced has them back when the cursor is in it. Marking SHALL therefore be brought up to date when the visible region changes and when the cursor moves, not only when the document text changes. A tag that scrolls into view SHALL be marked without requiring an edit first.

#### Scenario: A tag is scrolled into view

- **WHEN** a part of the document that was never visible in this session is scrolled to
- **THEN** the tags in it are marked, with no edit having taken place

#### Scenario: The cursor enters a tag

- **WHEN** the cursor is moved into a tag without any text being typed
- **THEN** what is shown for that tag is updated, so a person can see and edit the tag's own characters

### Requirement: A tag the plugin cannot resolve costs only itself

An unterminated block, a closing marker with no opening one, a directive form the plugin does not represent, and an unreadable entry within a directive SHALL each affect only their own line, block or entry. The marking of the rest of the document SHALL remain correct. A single malformed or unrecognized tag SHALL NOT suppress or displace the marking of anything after it, and an entry the plugin cannot resolve SHALL NOT cost the other entries of its own directive their marking.

#### Scenario: A block is never closed

- **WHEN** a document opens a block and reaches its end without closing it
- **THEN** the tags after the opening are marked as they would be in a document without it

#### Scenario: A closing marker appears with nothing open

- **WHEN** a closing marker stands in the document with no matching opening one
- **THEN** it does not turn the text that follows into a block

#### Scenario: A file-level directive stands on the first line

- **WHEN** the first line of a document is a directive that gates the whole file and therefore has no closing marker
- **THEN** it does not open a block, and every tag later in that document is marked

#### Scenario: One entry of a directive is unreadable

- **WHEN** a directive contains an entry that cannot be resolved alongside entries that can
- **THEN** the resolvable entries are marked as they would be in a directive without it

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

### Requirement: A permission directive is marked as the list of entries it is

A directive names a list, and the server reads it as one: the text after `@@@` is split into entries, and each entry is read on its own. The plugin SHALL mark the entries of a directive individually rather than marking the directive line as one indivisible thing, so that what is true of one entry is shown of that entry and not of its neighbours. An entry the server discards SHALL NOT be marked as an entry the server acts on.

#### Scenario: A directive names several things

- **WHEN** a directive names more than one entry
- **THEN** each entry carries its own marking, and an entry that differs from the others in kind is shown as differing

#### Scenario: An entry is written in a form the server discards

- **WHEN** a directive contains an entry the server refuses to read as an entry at all
- **THEN** that entry is not marked as one the server will act on, and the entries beside it are marked as they would be without it

### Requirement: A directive that governs the whole file is marked as doing so

A directive on the first line of a document gates the entire file and has no closing marker; every other directive gates the block between itself and its closing marker. These are different promises about different amounts of text, and the plugin SHALL mark the file-level form distinguishably from the block form. The marking SHALL convey that what is governed is the document rather than a region within it.

#### Scenario: The first line of a document is a directive

- **WHEN** a document begins with a directive
- **THEN** it is marked as governing the file, and is not marked as opening a block

#### Scenario: The same text stands on a later line

- **WHEN** the identical directive text appears on a line other than the first
- **THEN** it is marked as opening a block, which is what the server reads it as there

### Requirement: An entry carrying a time window is distinguishable from one that does not

An entry may carry a bracketed window that makes it take effect from a moment, until a moment, or between two. A block behind such an entry appears or disappears without anyone editing the document, which is a materially different thing from a permanent grant. The plugin SHALL mark an entry carrying a window distinguishably from an entry without one, and the distinction SHALL be visible without reading the timestamps.

Marking SHALL NOT depend on the current time. Whether a window is open at the moment of examination is not part of what is marked: recognition that changed with the clock would contradict the requirement that examining the same text twice gives the same answer, and would report a state that the document does not contain.

#### Scenario: A directive mixes timed and permanent entries

- **WHEN** a directive names one entry with a window and one without
- **THEN** the two are marked differently from one another

#### Scenario: A window has already closed

- **WHEN** a document carries a window whose end has passed
- **THEN** it is marked exactly as a window that has not yet opened, and no marking changes as time passes without the document being edited

### Requirement: A window the server discards is marked as discarded

The server parses a window and, failing, keeps the entry with no window at all — which makes it permanently active. An author who writes an unparseable window therefore grants access they meant to restrict, and nothing anywhere reports it. The plugin SHALL mark a window the server will discard distinguishably from one it will honour, and SHALL keep marking the entry itself as an entry, because that is what the server does with it.

#### Scenario: A window cannot be read as a time

- **WHEN** an entry carries a bracketed window the server cannot parse
- **THEN** the window is marked as one that will not take effect, and the entry beside it is still marked as an entry the server acts on

#### Scenario: Every entry of a directive is discarded

- **WHEN** a directive contains no entry the server can read
- **THEN** it is marked as one whose block will be withheld from every reader, which is what the server does with it

### Requirement: A view switch is distinguishable from an address

`#exam`, `#practice` and `#answer` are not roles. They are resolved against the reader's own stored preferences rather than against who the reader is, and they select between variants of a document instead of addressing anyone. The plugin SHALL mark them distinguishably from entries that name a role or a person, so that a directive selecting a variant is not read as one restricting an audience.

The server recognizes the prefix more broadly than it recognizes the three names: an entry carrying it is taken out of the role test whatever follows, and only these three then decide anything. An entry that carries the prefix but none of the three names therefore restricts nobody and switches nothing, and the plugin SHALL mark it as the switch that resolves to nothing rather than as either a working switch or an address.

#### Scenario: A directive names a view switch

- **WHEN** a directive names one of the three view switches
- **THEN** it is marked as a switch rather than as an address

#### Scenario: A directive names a class beside a view switch

- **WHEN** a directive names both a class and a view switch
- **THEN** the two are marked differently, and neither is marked as the other

#### Scenario: A switch names something the server does not resolve

- **WHEN** an entry carries the switch prefix followed by a name that is none of the three
- **THEN** it is marked as resolving to nothing, and is not marked as an address the server tests anyone against

### Requirement: The editor does not modify rendered output

Marking in the editor and hiding tags in the rendered reading view are separate mechanisms with separate triggers. The editor's marking SHALL NOT read or write the rendered output of the reading view, and an edit SHALL NOT cause rendered output elsewhere to be rewritten.

#### Scenario: A document is edited while a reading view is open

- **WHEN** text is typed in the editor while a rendered view of a document is also open
- **THEN** the editor changes only its own presentation, and does not alter the rendered view's elements

### Requirement: A directive line is shown as the heading of the block it opens

While the cursor is elsewhere, a directive line SHALL be replaced by a heading of the block it opens, rather than shown as its own characters. The heading SHALL carry each entry of the directive with the distinction that entry carries, and SHALL reproduce a time window as it is written rather than restating it, so that nothing is claimed of an entry that the server does not do with it. The replacement SHALL be lifted while the cursor is in the line or a selection touches it, and the line's own characters SHALL then be present and editable.

Lifting the replacement SHALL NOT change the document. The characters that appear are the ones the document already held; what changes is what is shown.

While a line is replaced, the per-entry markings of that line SHALL NOT be emitted, since they would fall inside text that is not shown. While the replacement is lifted, they SHALL be emitted as they are for any directive line.

#### Scenario: The cursor is elsewhere in the document

- **WHEN** a document holding a directive line is shown with the cursor on another line
- **THEN** that line is shown as the heading of the block it opens, and its own characters are not on screen

#### Scenario: The cursor is moved into the line

- **WHEN** the cursor is moved into a replaced directive line
- **THEN** the line's own characters are shown and can be edited, and the document text is the same before and after the move

#### Scenario: A selection runs across the block

- **WHEN** a selection touches a replaced directive line, without the cursor resting in it
- **THEN** the line's own characters are shown, so that what is selected is what a person can see

#### Scenario: The cursor rests on a neighbouring line

- **WHEN** the cursor is on the line directly above or below a replaced directive line
- **THEN** that directive line is still shown as its heading
