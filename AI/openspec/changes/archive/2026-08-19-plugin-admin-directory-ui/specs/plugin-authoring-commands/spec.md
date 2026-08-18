## MODIFIED Requirements

### Requirement: The names are given to the command

The list SHALL be given either by typing or pasting names into the command, one per line, or by choosing them from the directory picker (`plugin-directory-search`) where a safeLearn instance is configured. It SHALL NOT be taken from the selected text, and SHALL NOT be read from a file in the vault: the first makes selecting the wrong thing a silent way to generate the wrong document, and the second would be a second source of truth beside the directory itself.

#### Scenario: A list is pasted into the command

- **WHEN** a class list copied out of a mail or a spreadsheet is pasted into the command
- **THEN** it is read as one name per line, and nothing in the document decides what the names are

#### Scenario: Names are chosen from the directory picker

- **WHEN** the picker is used instead of typing, and one or more names are chosen and confirmed
- **THEN** the command receives them exactly as if they had been typed, one per line

#### Scenario: No instance is configured

- **WHEN** no safeLearn instance is configured
- **THEN** the command offers only the typed/pasted list, exactly as it does today
