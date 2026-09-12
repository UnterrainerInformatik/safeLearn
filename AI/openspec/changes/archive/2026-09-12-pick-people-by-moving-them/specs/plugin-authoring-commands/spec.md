## MODIFIED Requirements

### Requirement: The names are given to the command

The list SHALL be given either by choosing people from the directory picker (`plugin-directory-search`), where one is shown, or by typing or pasting names into the command, one per line, where it is not — and a command SHALL NOT leave a person with neither: where the picker is shown but cannot offer anybody, because the directory could not be reached or the request failed there, the typed/pasted field SHALL be available instead. It SHALL NOT be taken from the selected text, and SHALL NOT be read from a file in the vault: the first makes selecting the wrong thing a silent way to generate the wrong document, and the second would be a second source of truth beside the directory itself.

Where the picker is shown, the people chosen in it are the whole list, and a name the directory has no entry for is written into the document afterwards rather than typed into the command.

#### Scenario: A list is pasted into the command

- **WHEN** a class list copied out of a mail or a spreadsheet is pasted into the command, where no picker is shown
- **THEN** it is read as one name per line, and nothing in the document decides what the names are

#### Scenario: Names are chosen from the directory picker

- **WHEN** the picker is used, and one or more people are chosen and confirmed
- **THEN** the command receives their display names, in the order they were chosen, exactly as if they had been typed one per line

#### Scenario: No instance is configured

- **WHEN** no safeLearn instance is configured
- **THEN** the command offers only the typed/pasted list, exactly as it does today

#### Scenario: An instance is configured but no login is held

- **WHEN** an instance is configured, no login is held, and no picker is therefore shown
- **THEN** the command offers the typed/pasted list, exactly as it does where no instance is configured

#### Scenario: The picker is shown but the directory cannot be reached

- **WHEN** the picker is shown and the directory cannot be reached, or the request fails at the server
- **THEN** the typed/pasted field is available, so the command can still be given a list

### Requirement: How a dialog is laid out changes nothing about what is written

Laying a dialog out is a statement about the dialog and about nothing else. What a command writes into the document from a given answer, what it defaults to, and what it refuses SHALL be unaffected by it. A dialog SHALL be confirmable from the keyboard whatever it asks with, so that replacing a field with another way of answering does not take the keyboard confirmation away with it.

#### Scenario: A count is given

- **WHEN** a column count is given and confirmed
- **THEN** the block that is inserted is the one that count has always produced, and Enter confirms the dialog as it did

#### Scenario: A list is given

- **WHEN** a list of names is given and confirmed
- **THEN** the sections that are written are the ones that list has always produced

#### Scenario: A list is confirmed from the keyboard

- **WHEN** the dialog that asks for a list of names is confirmed with Ctrl/Cmd+Enter
- **THEN** it confirms, whether the list was typed into a field or chosen from the picker

#### Scenario: Enter while typing a list

- **WHEN** Enter is pressed while typing names into the field, where the field is shown
- **THEN** it belongs to the list, and does not confirm the dialog
