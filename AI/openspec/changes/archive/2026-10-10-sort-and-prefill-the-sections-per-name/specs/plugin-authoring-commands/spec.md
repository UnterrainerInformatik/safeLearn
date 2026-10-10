## ADDED Requirements

### Requirement: People chosen from the directory are written in surname order

The people chosen in the directory picker SHALL be handed to the command ordered by surname, then by given name, as a German reader alphabetises them: case is ignored, and an accented or umlauted letter sorts beside its base letter, not after `z`. Two people with the same surname and given name SHALL keep the order they were chosen in. This applies to every command that is given names through the picker. It applies both to the one that writes a restricted section per name and to the one that writes the chosen entries into a single directive.

The order SHALL be decided where the names are collected, once, and not while they are being chosen. The picker keeps the directory's order, because in it a class stands together (`plugin-directory-search`). The document is read the way a class list is, by surname.

A person the instance returned without a surname and given name, because it predates them, SHALL be ordered by their display name among the others. Names typed or pasted into the command SHALL keep the order they were given in, and SHALL follow the people chosen from the picker. A pasted list carries no surname to sort by, and its order may already be one somebody chose.

#### Scenario: A class is taken over and sections are written

- **WHEN** a whole class is taken over in the picker in the directory's order and "Restricted section per name…" is confirmed
- **THEN** the sections stand in the document ordered by surname, then given name
- **AND** each section is still addressed to the person's display name, unchanged

#### Scenario: Surnames differ only by an umlaut or by case

- **WHEN** the chosen people include surnames that differ by an umlaut or by capitalisation, such as `Öller`, `Oberhuber` and `oswald`
- **THEN** they are ordered `Oberhuber`, `Öller`, `oswald`, as a German class list orders them

#### Scenario: A surname has two words

- **WHEN** a chosen person's surname consists of two words
- **THEN** they are ordered by that whole surname, not by its last word

#### Scenario: Two people share a surname

- **WHEN** two chosen people share a surname
- **THEN** the one whose given name comes first alphabetically is written first

#### Scenario: Entries are written into one directive

- **WHEN** several people are chosen in the picker and "Restrict selection…" is confirmed
- **THEN** the directive names them ordered by surname, then given name

#### Scenario: Names are typed as well as chosen

- **WHEN** the picker becomes unreachable after people were chosen, and further names are typed into the field it reveals
- **THEN** the chosen people are written first, in surname order, followed by the typed names in the order they were typed

#### Scenario: A list is pasted where no picker is shown

- **WHEN** a list is pasted into the command where no picker is shown
- **THEN** the names are written in the order they were pasted in

#### Scenario: The instance predates the name parts

- **WHEN** people are chosen from an instance that returns no given names and surnames
- **THEN** they are written ordered by their display name, and the command works as before otherwise

### Requirement: Every section can start with content given once

The command that writes a restricted section per name SHALL offer, beside the list of names, an optional field for content. Whatever that field holds when the command is confirmed SHALL be written into every section it writes, as that section's content, in place of the single blank line a section otherwise holds. This lets a grid, a table or a checklist that every person's section shares be given once, and not pasted into each section separately.

The content SHALL be written as it was given: line by line, with indentation, blank lines and markup unchanged. A single line break at its very end SHALL NOT add an extra blank line, because pasting text usually brings one along. Left empty, or holding nothing but whitespace, the field SHALL change nothing: each section then holds the single blank line it always has.

Content containing a line that the renderer reads as opening or closing a restriction SHALL NOT be written. Such a line would close the section around it early, leaving the rest of the grid outside it, readable by everyone. The dialog SHALL say why and stay open with what was entered, so the content can be corrected without being given again.

The command that restricts a selection SHALL NOT offer the field. It encloses text that already exists.

#### Scenario: A grid is given with a class

- **WHEN** a class is chosen, a table is pasted into the content field, and the command is confirmed
- **THEN** every section holds that table, unchanged, between its directive and its closing marker

#### Scenario: The content field is left empty

- **WHEN** the command is confirmed with nothing, or only whitespace, in the content field
- **THEN** each section holds a single blank line, exactly as without the field

#### Scenario: Pasted content ends with a line break

- **WHEN** the content field holds text that ends in a line break
- **THEN** each section ends with the text's last line, followed directly by the closing marker

#### Scenario: The content holds a restriction marker

- **WHEN** the content field holds a line beginning with the restriction marker
- **THEN** nothing is written, the dialog says the content cannot hold a restriction marker, and the names and content entered are still there

#### Scenario: The cursor after a pre-filled insertion

- **WHEN** the sections have been written with content
- **THEN** the cursor stands on the first line of the first section's content, at its end, as it does after every insertion

#### Scenario: A selection is restricted

- **WHEN** the dialog of the command that restricts a selection is opened
- **THEN** it offers no content field

## MODIFIED Requirements

### Requirement: A restricted section is written for each name that was given

A command SHALL write one restricted section per name, in the order the names were given: the directive naming that name, its content, and the closing marker. The content is what the command was given for every section ("Every section can start with content given once"), or a single blank line where it was given none. The sections SHALL be written as one insertion, so that a list produces a document rather than a sequence of separate edits.

A generated section SHALL carry no heading of its own. The rendered frame already carries the addressed name as its heading (`plugin-hidden-tags`'s "A restricted block carries its name as a heading"), so a heading written into the section's content would repeat, in the document's own text, what every reader already sees rendered above it.

#### Scenario: A list of names is given

- **WHEN** the command is given several names and no content
- **THEN** the document holds one restricted section per name, in that order, each addressed to its own name, with a single blank line as its content

#### Scenario: A list of names is given with content

- **WHEN** the command is given several names and content for every section
- **THEN** the document holds one restricted section per name, in that order, each holding that content

#### Scenario: A name is given more than once or the list holds a blank line

- **WHEN** the list contains blank lines or surrounding whitespace
- **THEN** the blank lines produce no section and each name is written trimmed

### Requirement: Every dialog the commands open is laid out the same way

The dialogs ask different things, and what differs between them SHALL be their fields alone: a number field, a list of names together with the content every section starts with, whatever a later command needs. Everything around them — the heading, whatever explains a field, and the confirmation below the fields in its container — SHALL be the same in each, so that two dialogs asking one kind of question do not answer it in two shapes.

#### Scenario: A dialog is opened

- **WHEN** any of the dialogs is opened
- **THEN** it shows a heading, the fields it is about, and its confirmation below the last of them

#### Scenario: The two dialogs are compared

- **WHEN** the dialogs are opened in turn
- **THEN** they are laid out alike, and what tells them apart is the fields each carries

### Requirement: The names are given to the command

The list SHALL be given either by choosing people from the directory picker (`plugin-directory-search`), where one is shown, or by typing or pasting names into the command, one per line, where it is not — and a command SHALL NOT leave a person with neither: where the picker is shown but cannot offer anybody, because the directory could not be reached or the request failed there, the typed/pasted field SHALL be available instead. It SHALL NOT be taken from the selected text, and SHALL NOT be read from a file in the vault: the first makes selecting the wrong thing a silent way to generate the wrong document, and the second would be a second source of truth beside the directory itself.

Where the picker is shown, the people chosen in it are the whole list, and a name the directory has no entry for is written into the document afterwards rather than typed into the command.

#### Scenario: A list is pasted into the command

- **WHEN** a class list copied out of a mail or a spreadsheet is pasted into the command, where no picker is shown
- **THEN** it is read as one name per line, and nothing in the document decides what the names are

#### Scenario: Names are chosen from the directory picker

- **WHEN** the picker is used, and one or more people are chosen and confirmed
- **THEN** the command receives their display names in surname order (see "People chosen from the directory are written in surname order"), exactly as if they had been typed one per line in that order

#### Scenario: No instance is configured

- **WHEN** no safeLearn instance is configured
- **THEN** the command offers only the typed/pasted list, exactly as it does today

#### Scenario: An instance is configured but no login is held

- **WHEN** an instance is configured, no login is held, and no picker is therefore shown
- **THEN** the command offers the typed/pasted list, exactly as it does where no instance is configured

#### Scenario: The picker is shown but the directory cannot be reached

- **WHEN** the picker is shown and the directory cannot be reached, or the request fails at the server
- **THEN** the typed/pasted field is available, so the command can still be given a list
