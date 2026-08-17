## ADDED Requirements

### Requirement: A restricted section is written for each name that was given

A command SHALL write one restricted section per name, in the order the names were given: the directive naming that name, a heading, a place to write, and the closing marker. The sections SHALL be written as one insertion, so that a list produces a document rather than a sequence of separate edits.

#### Scenario: A list of names is given

- **WHEN** the command is given several names
- **THEN** the document holds one restricted section per name, in that order, each addressed to its own name

#### Scenario: A name is given more than once or the list holds a blank line

- **WHEN** the list contains blank lines or surrounding whitespace
- **THEN** the blank lines produce no section and each name is written trimmed

### Requirement: The heading of a generated section stands inside the block

The server replaces what stands *between* a directive and its closing marker, and leaves everything outside them for every reader. A heading naming the person a section is for SHALL therefore stand inside the block, not above it — otherwise a document with one section per student shows every student the names of all the others, which is the opposite of what such a document is written for.

The heading's level SHALL be one below the last heading above the insertion point, so that the generated sections stand underneath whatever they were inserted into rather than at a level the command chose.

#### Scenario: Sections are generated under a chapter heading

- **WHEN** sections are generated below a heading in the document
- **THEN** each section's heading is inside its own block and one level below that heading

#### Scenario: A reader is not addressed by a section

- **WHEN** the document is rendered for somebody a section is not addressed to
- **THEN** nothing of that section is shown to them, its heading included

### Requirement: The names are given to the command

The list SHALL be given in the command itself, one name per line. It SHALL NOT be taken from the selected text, and SHALL NOT be read from a file in the vault: the first makes selecting the wrong thing a silent way to generate the wrong document, and the second is a second source of truth beside the directory that these commands are meant to be fed from later.

#### Scenario: A list is pasted into the command

- **WHEN** a class list copied out of a mail or a spreadsheet is pasted into the command
- **THEN** it is read as one name per line, and nothing in the document decides what the names are

### Requirement: A name is written as it was given

A name SHALL be written into the directive trimmed and otherwise unchanged, in the spelling it was given in. The server's comparison is trimmed and lowercased, so the spelling does not change who may read the block — and a document of lowercased personal names is a document nobody wants to read.

#### Scenario: A name is given with capitals

- **WHEN** a name is given as a person writes their own name
- **THEN** the directive carries it that way

### Requirement: A name the server will not read as a name is written and reported

`admin`, `teacher`, `teachers`, `student` and `students` are reserved: the server drops a display name equal to one of them rather than adding it to the reader's role set. A section addressed to such a name is therefore addressed to the *role*, and is read by everyone holding it.

The command SHALL write the name as it was given, and SHALL NOT correct, drop or alter it. It SHALL report which of the given names that happened to, once, after writing them — the command is the only place in the plugin that knows a *person* was meant, and without it the collision is not visible anywhere.

#### Scenario: A given name collides with a built-in role

- **WHEN** one of the given names equals a name the server reserves for a role
- **THEN** the section is written for that name unchanged, and the command names it as one the server will read as a role rather than as a person

#### Scenario: No given name collides

- **WHEN** none of the given names is reserved
- **THEN** the command reports nothing about them

### Requirement: A passage is restricted from entries given to the command

A command SHALL build a directive from entries given the same way, one per line, and place it around the selected text with its closing marker after it. Where nothing is selected it SHALL write the directive, a place to write and the closing marker, and SHALL NOT restrict text the person did not point at.

#### Scenario: A passage is selected

- **WHEN** the command is invoked with text selected
- **THEN** that text is enclosed by a directive naming the given entries, unchanged

#### Scenario: Nothing is selected

- **WHEN** the command is invoked with nothing selected
- **THEN** an empty restricted block is written and the cursor is left inside it, and no surrounding text is restricted
