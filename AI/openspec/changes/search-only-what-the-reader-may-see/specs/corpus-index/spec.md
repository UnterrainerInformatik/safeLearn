## ADDED Requirements

### Requirement: The index holds what is needed to choose candidates, and no decision

Beyond the per-file metadata and the whole-file directive it already records, the index SHALL hold a file's text and the boundaries of its inline `@@@` blocks together with the directives parsed from them. It SHALL record those boundaries and directives as they are written, and SHALL NOT record any conclusion about which session may see them. What the index holds SHALL be usable only to decide which files are worth opening; the decision to hand over content remains governed by the existing requirement that the file is read.

The existing rule that a scan reads from disk only what changed continues to apply to this content unchanged: it is derived when a file is read and carried forward otherwise.

#### Scenario: A file's blocks are recorded

- **WHEN** a scan reads a file containing inline `@@@` blocks
- **THEN** the index holds that file's text and the boundaries and parsed directives of those blocks
- **AND** it holds no statement about which roles may see any of them

#### Scenario: An unchanged file is scanned again

- **WHEN** a scan runs over a corpus in which one file has changed
- **THEN** only that file's text and block boundaries are derived again
- **AND** every unchanged file's are carried forward without opening it

#### Scenario: What the index holds is used to choose candidates

- **WHEN** the application uses the index to find the files that could answer a query
- **THEN** each file it selects is opened and decided upon by reading it
- **AND** no content reaches a reader on the strength of the index alone
