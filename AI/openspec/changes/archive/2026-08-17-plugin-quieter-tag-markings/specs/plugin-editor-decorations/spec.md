## ADDED Requirements

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

## MODIFIED Requirements

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
