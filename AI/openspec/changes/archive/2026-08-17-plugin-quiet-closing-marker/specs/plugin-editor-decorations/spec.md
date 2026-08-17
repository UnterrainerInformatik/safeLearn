## ADDED Requirements

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
