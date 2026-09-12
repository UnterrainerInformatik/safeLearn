## MODIFIED Requirements

### Requirement: The rendered reading view shows no tag text

A SafeLearn tag is an instruction to the rendering server, not text a reader is meant to read. In the rendered reading view no tag SHALL be shown as its own characters — neither a fragment marker, nor a column marker, nor a directive line, nor a closing marker. What the tag governs SHALL still be shown; only the instruction goes.

#### Scenario: A document carrying every tag form is read

- **WHEN** a document containing fragments, column markers and permission directives is shown in the reading view
- **THEN** none of those tags appears as text anywhere in what is shown

#### Scenario: A tag stands in a line with other text

- **WHEN** a line contains a tag beside ordinary text
- **THEN** the tag is gone and the rest of the line is shown as it would be without it

#### Scenario: A closing marker is the file's last line with no line break after it

- **WHEN** a block's closing marker stands on the last line of the file and no character follows it
- **THEN** it is hidden exactly as a closing marker followed by a line break is, and does not appear as its own characters
