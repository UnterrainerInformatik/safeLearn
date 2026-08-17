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

The distinction SHALL be carried by the shape of the frame — the weight of its edges, and the lower edge the file-level form has nothing to draw. Both forms SHALL be drawn in one colour: a second channel saying what the shape already says has nothing left to say with, and the two frames are the same kind of statement about two amounts of text.

#### Scenario: The first line of a document is a directive

- **WHEN** a document begins with a directive
- **THEN** it is marked as governing the file, and is not marked as opening a block

#### Scenario: The same text stands on a later line

- **WHEN** the identical directive text appears on a line other than the first
- **THEN** it is marked as opening a block, which is what the server reads it as there

#### Scenario: Both forms stand in one document

- **WHEN** a document carries a file-level directive and a block directive below it
- **THEN** the two frames are drawn in the same colour, and what tells them apart is that the file-level one is open at the bottom

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

### Requirement: The frame of a block covers every line of the block

A block's frame is what tells a person, while they write, that the text inside it is governed — restricted to named readers, or laid out as columns. The frame SHALL cover every line the block covers, whatever the editor renders that line as. Where the editor replaces one or more lines of a block with a rendered element of its own — a table, a callout, a diagram, a formula, an embedded note — the frame SHALL extend across that element as it does across a line of text.

The block's ends SHALL stay where the document puts them: the first line of the block closes the frame at the top and the last line closes it at the bottom, whether or not those lines are rendered as text.

The frame SHALL be one rectangle. Elements the editor renders in place of lines are not laid out to the same width as its line elements, and a frame whose edges follow each element's own width is not a boundary a person can read. The edges SHALL stand in one vertical line for the whole block.

This holds for both kinds of block the plugin draws — the permission block and the side-by-side block — because both make the same statement about the text between their markers.

#### Scenario: A table stands in the middle of a permission block

- **WHEN** a permission block contains a table between two lines of text
- **THEN** the frame runs unbroken from the block's first line to its last, the table is inside it, and the block's boundary is not readable as ending above the table or beginning below it

#### Scenario: A block contains nothing but a rendered element

- **WHEN** a permission block's only content between its markers is a table, a callout or another element the editor renders in place of lines
- **THEN** the block is drawn as one closed frame around it

#### Scenario: A side-by-side block contains a table

- **WHEN** a table stands inside a side-by-side block
- **THEN** the block's region covers it, exactly as it covers the lines of text around it

#### Scenario: The edges of the frame meet elements of differing width

- **WHEN** a block contains both ordinary lines and an element the editor lays out to a different width
- **THEN** the frame's edges stand in one vertical line over the whole block rather than following each element's own width

#### Scenario: Text outside a block is not framed

- **WHEN** a table, a callout or another rendered element stands outside every block
- **THEN** it carries no frame

### Requirement: A rendered element inside a block keeps its own appearance

The elements the editor renders in place of lines carry appearances of their own — a callout has its colour and its icon, a table has its borders, an embedded note has its frame. The plugin SHALL add the block's frame around such an element and SHALL NOT otherwise change how it is drawn.

#### Scenario: A callout inside a permission block

- **WHEN** a callout stands inside a permission block
- **THEN** it is drawn as Obsidian draws a callout, with the block's frame around it

### Requirement: The frame follows the document as the block changes

Which lines a block covers changes as a person writes, and the elements the editor renders in place of lines are built, rebuilt and discarded as that happens — some of them after the edit that caused them. Whatever the frame is applied to SHALL be brought up to date on the same occasions the rest of the marking is: an edit, a cursor move, a change of the visible region, and the arrival of an element the editor renders after the fact.

A block that no longer covers a line SHALL NOT leave a frame behind on it.

#### Scenario: A table is written into an existing block

- **WHEN** a table is typed into a permission block that did not contain one
- **THEN** the frame covers it, without the document having to be closed and reopened

#### Scenario: A block's closing marker is moved above a table

- **WHEN** a block that contained a table is closed above it, so that the table now stands outside the block
- **THEN** the table no longer carries the frame

#### Scenario: An element is rendered after the update that produced it

- **WHEN** the editor finishes building a rendered element — a diagram, an embedded note — after the update in which its lines entered the block
- **THEN** the frame covers it once it is there

### Requirement: A fragment marker is shown as an icon while nothing stands in it

A fragment marker says that what follows it waits for a click in a presentation. It says nothing about the document as a document, and it is written inside lines of ordinary prose. The plugin SHALL show it in the editor as an icon standing in place of the tag's characters, without a frame and without a background, so that the marking takes no more room on the line than what it marks is worth.

The tag's own characters SHALL be shown, and be editable, while the cursor rests in the tag or a selection touches it — the same rule a directive line follows. Nothing SHALL be written into the document to produce either state: the characters that appear are the ones the document already held.

Each fragment SHALL be decided independently of the others. Two fragments on one line are two answers, so that a person editing one is not shown the other as characters.

The icon SHALL be produced by the plugin rather than by the stylesheet alone, so that a stylesheet that does not load cannot take a tag off the page without leaving anything in its place.

#### Scenario: A fragment stands in a line nobody is editing

- **WHEN** a line containing a fragment marker is on screen and neither the cursor nor a selection touches the tag
- **THEN** the icon stands where the tag's characters are, the tag's characters are not on screen, and the words on either side of it are unchanged — including the space that separated them from the tag

#### Scenario: The cursor is moved into a fragment

- **WHEN** the cursor is placed inside a fragment marker
- **THEN** the tag's own characters are on screen and editable, the icon is no longer shown for that tag, and the document text is unchanged

#### Scenario: A line carries two fragments and one is edited

- **WHEN** the cursor rests in one of two fragment markers on the same line
- **THEN** that one is shown as its characters and the other is still shown as its icon

#### Scenario: A fragment ends the line it is on

- **WHEN** a fragment marker stands at the end of its line, with no space or text after it
- **THEN** what is replaced is the tag and nothing else, and the line that follows is shown whole

### Requirement: The marker that closes a block is shown as the blank line the frame closes on

While the cursor is elsewhere, the marker that closes a permission block SHALL NOT be shown as its own characters. Nothing SHALL stand in its place: the frame drawn around the block already says where the block ends, and a marker repeating it is punctuation inside a person's text.

The line SHALL stay where the document puts it. The block SHALL still end there, and the frame SHALL still close on that line, so that what a person sees is the blank line the frame closes on rather than a block one line shorter.

The marker SHALL be shown again while the cursor is in the line or a selection touches it, and its characters SHALL then be editable. That is not a convenience: deleting the marker is the only way to open the block up again, so a line that could not be reached would make a restriction permanent.

Showing the marker again SHALL NOT change the document. The characters that appear are the ones the document already held.

Where a block is never closed, its last line is the end of the document rather than a marker, and that line SHALL be shown as it is written.

#### Scenario: The cursor is elsewhere in the document

- **WHEN** a document holding a closed permission block is shown with the cursor on another line
- **THEN** the closing marker's characters are not on screen, and the block's frame closes on the blank line they stood on

#### Scenario: The cursor is moved into the line

- **WHEN** the cursor is moved into the line the closing marker stands on
- **THEN** the marker's characters are shown and can be edited, and the document text is the same before and after the move

#### Scenario: The cursor leaves the line again

- **WHEN** the cursor is moved off the closing marker's line
- **THEN** the line is blank again, as it was before the cursor entered it

#### Scenario: A block's directive is shown while its closing marker is being edited

- **WHEN** the cursor rests in a block's closing marker
- **THEN** the directive line that opened the block is still shown as its heading

#### Scenario: A block is never closed

- **WHEN** a permission block runs to the end of the document with no closing marker
- **THEN** the last line of the document is shown as written, because it is text rather than a marker
