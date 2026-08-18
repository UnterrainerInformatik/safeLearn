## ADDED Requirements

### Requirement: A command that asks for something asks it in a dialog with a separated confirmation

Where a command needs an answer before it can write, it SHALL ask in a dialog whose confirmation is visibly separated from the field it confirms. The confirmation SHALL stand in the container Obsidian lays dialog buttons out in, so that the distance between the two comes from the theme in use rather than from a length the plugin carries.

A dialog SHALL NOT place its confirmation directly against its field: a button touching the lower edge of the field above it reads as one control with it, and a click aimed at the one lands in the other.

#### Scenario: A dialog that asks for a count is open

- **WHEN** the command that asks for a column count has opened its dialog
- **THEN** the button's box stands below the field's box and the two do not touch

#### Scenario: A dialog that asks for a list is open

- **WHEN** the command that asks for a list of names has opened its dialog
- **THEN** the button's box stands below the field's box and the two do not touch

### Requirement: Every dialog the commands open is laid out the same way

The dialogs ask different things, and what differs between them SHALL be the field alone: a number field, a list of names, whatever a later command needs. Everything around it — the heading, whatever explains the field, and the confirmation below it in its container — SHALL be the same in each, so that two dialogs asking one kind of question do not answer it in two shapes.

#### Scenario: A dialog is opened

- **WHEN** either dialog is opened
- **THEN** it shows a heading, the field it is about, and its confirmation below that field

#### Scenario: The two dialogs are compared

- **WHEN** both dialogs are opened in turn
- **THEN** they are laid out alike, and what tells them apart is the field each carries

### Requirement: How a dialog is laid out changes nothing about what is written

Laying a dialog out is a statement about the dialog and about nothing else. What a command writes into the document from a given answer, what it defaults to, what it refuses, and how the dialog is confirmed from the keyboard SHALL be unaffected by it.

#### Scenario: A count is given

- **WHEN** a column count is given and confirmed
- **THEN** the block that is inserted is the one that count has always produced, and Enter confirms the dialog as it did

#### Scenario: A list is given

- **WHEN** a list of names is given and confirmed
- **THEN** the sections that are written are the ones that list has always produced, and Enter still belongs to the list while Ctrl/Cmd+Enter confirms
