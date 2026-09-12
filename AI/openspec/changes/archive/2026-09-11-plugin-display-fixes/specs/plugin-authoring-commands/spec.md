## MODIFIED Requirements

### Requirement: A restricted section is written for each name that was given

A command SHALL write one restricted section per name, in the order the names were given: the directive naming that name, a place to write, and the closing marker. The sections SHALL be written as one insertion, so that a list produces a document rather than a sequence of separate edits.

A generated section SHALL carry no heading of its own. The rendered frame already carries the addressed name as its heading (`plugin-hidden-tags`'s "A restricted block carries its name as a heading"), so a heading written into the section's content would repeat, in the document's own text, what every reader already sees rendered above it.

#### Scenario: A list of names is given

- **WHEN** the command is given several names
- **THEN** the document holds one restricted section per name, in that order, each addressed to its own name, with a single blank line as its content

#### Scenario: A name is given more than once or the list holds a blank line

- **WHEN** the list contains blank lines or surrounding whitespace
- **THEN** the blank lines produce no section and each name is written trimmed

## REMOVED Requirements

### Requirement: The heading of a generated section stands inside the block

**Reason**: A generated section no longer carries a written-in heading at all (see the MODIFIED "A restricted section is written for each name that was given"). The rendered frame already shows the addressed name as a heading (`plugin-hidden-tags`), so the concern this requirement addressed — a heading placed outside the block would leak every name to every reader — no longer arises, because there is nothing left to place inside or outside the block.

**Migration**: None. A section already carrying a written-in heading from before this change keeps rendering exactly as it does today; this only changes what a fresh insertion produces.
