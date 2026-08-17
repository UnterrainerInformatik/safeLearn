## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: What is marked reflects the document as it is currently shown

The editor keeps only the lines around the viewport in the document, and what is on screen for a tag depends on where the cursor is: a tag shown as its own characters becomes editable when the cursor is in it, and a directive line whose characters are replaced has them back when the cursor is in it. Marking SHALL therefore be brought up to date when the visible region changes and when the cursor moves, not only when the document text changes. A tag that scrolls into view SHALL be marked without requiring an edit first.

#### Scenario: A tag is scrolled into view

- **WHEN** a part of the document that was never visible in this session is scrolled to
- **THEN** the tags in it are marked, with no edit having taken place

#### Scenario: The cursor enters a tag

- **WHEN** the cursor is moved into a tag without any text being typed
- **THEN** what is shown for that tag is updated, so a person can see and edit the tag's own characters
