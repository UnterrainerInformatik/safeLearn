## Purpose

Defines the "Invitation list…" authoring command: it writes the people chosen in the directory picker as a list in a format the author describes — which fields, in which order, and what stands between, before and after them — so that the list can be pasted into whatever tool the invitation is sent from.

## ADDED Requirements

### Requirement: The list is written from the people chosen in the directory picker

The command SHALL open the same directory picker the per-name command uses (`plugin-directory-search`), with its search, its class filter and taking a class over whole. It SHALL write one entry per person chosen there, in surname order, then given name, exactly as "People chosen from the directory are written in surname order" orders them for the per-name command. A person chosen twice SHALL be written once.

The command SHALL NOT offer a field for typed or pasted names. A typed name carries none of the fields an invitation list consists of. Where no picker can be shown, because no instance is configured or no login is held, the dialog SHALL say that the command needs a directory login, and it SHALL NOT be confirmable.

#### Scenario: A class is taken over and written

- **WHEN** a class is taken over in the picker and the dialog is confirmed
- **THEN** one entry is written for each student of that class, ordered by surname, then given name

#### Scenario: No login is held

- **WHEN** the command is run with no instance configured or no login held
- **THEN** the dialog says that the command needs a directory login, and nothing can be written from it

#### Scenario: Nobody is chosen

- **WHEN** the dialog is confirmed with nobody chosen
- **THEN** nothing is written and nothing is copied

### Requirement: The author chooses the fields and their order

The dialog SHALL offer the fields given name, surname, class and e-mail address. The author SHALL be able to switch each of them on or off and to change the order in which the switched-on fields are written. At least one field SHALL be switched on for the dialog to be confirmable.

A person's class SHALL be the roles/groups they hold that are not one of the role markers (teacher, teachers, student, students, admin) — the same values the picker's class filter offers. A person holding more than one such value SHALL have them written in alphabetical order, separated by `/`. The given name, surname and e-mail address SHALL be written as the directory search returned them.

#### Scenario: The author's example fields

- **WHEN** given name, surname and e-mail address are switched on in that order, and class is switched off
- **THEN** each entry holds the given name, then the surname, then the e-mail address, and no class

#### Scenario: The order is changed

- **WHEN** the e-mail address is moved in front of the given name
- **THEN** every entry starts with the e-mail address

#### Scenario: Every field is switched off

- **WHEN** no field is switched on
- **THEN** the dialog cannot be confirmed

### Requirement: The author sets the texts between, before and after the fields

The dialog SHALL let the author set four texts:

- the field separator, written between two fields of one entry
- the prefix, written before each entry
- the postfix, written after each entry
- the entry separator, written between two entries

The entry separator SHALL offer a line break and a comma as ready choices, and free text besides. Each entry SHALL be written as prefix, the switched-on fields joined by the field separator, and postfix. The entries SHALL be joined by the entry separator, which is not written after the last entry.

In each of the four texts, `\n` SHALL stand for a line break, `\t` for a tab and `\\` for a backslash. Every other character SHALL be written as given. Field values SHALL be written as they are, without quoting or escaping, even where they contain one of the texts.

#### Scenario: The author's example format

- **WHEN** the fields are given name, surname and e-mail address, the field separator is `,`, the prefix is `,,,`, the postfix is `,,\n`, the entry separator is empty, and Anna Bauer (`anna.bauer@example.org`) and Ben Huber (`ben.huber@example.org`) are chosen
- **THEN** the list is `,,,Anna,Bauer,anna.bauer@example.org,,` followed by a line break, then `,,,Ben,Huber,ben.huber@example.org,,` followed by a line break

#### Scenario: Addresses one per line

- **WHEN** only the e-mail address is switched on, prefix and postfix are empty and the entry separator is a line break
- **THEN** the list is the addresses, one per line, with no line break after the last

#### Scenario: Addresses separated by commas

- **WHEN** only the e-mail address is switched on and the entry separator is a comma
- **THEN** the list is the addresses joined by commas, with no comma after the last

#### Scenario: A tab between the fields

- **WHEN** the field separator is `\t`
- **THEN** a tab character stands between the fields of each entry, not a backslash and a `t`

### Requirement: The dialog shows what will be written

The dialog SHALL show a preview of the first entries as they will be written, and SHALL update it whenever the fields, their order, one of the texts or the chosen people change. The preview SHALL show line breaks and tabs as what they produce, not as escape sequences. With nobody chosen yet, it SHALL show the format applied to placeholder values, so that the format can be judged before anybody is picked.

#### Scenario: The postfix is changed

- **WHEN** the postfix is edited while people are chosen
- **THEN** the preview shows the entries with the new postfix without the dialog being confirmed

#### Scenario: Nobody is chosen yet

- **WHEN** the dialog is opened and nobody has been chosen
- **THEN** the preview shows an entry built from placeholder values in the current format

### Requirement: The list is inserted or copied

The dialog SHALL offer two confirmations: one inserts the list into the document at the cursor, the other copies it to the clipboard. Copying SHALL leave the document unchanged and SHALL confirm with a notice that the list was copied and how many entries it holds. Inserting SHALL replace a selection, if there is one, and leave the cursor after the inserted list.

The dialog SHALL be confirmable from the keyboard with Ctrl/Cmd+Enter, which inserts.

#### Scenario: The list is copied

- **WHEN** the copy confirmation is used with three people chosen
- **THEN** the clipboard holds the list, the document is unchanged, and a notice says that three entries were copied

#### Scenario: The list is inserted

- **WHEN** the insert confirmation is used
- **THEN** the list stands at the cursor and the cursor stands after it

### Requirement: The format last used is offered again

The fields, their order and the four texts confirmed last SHALL be remembered across sessions and pre-filled the next time the dialog opens. The people chosen SHALL NOT be remembered. Where no format has been confirmed yet, the dialog SHALL start with the e-mail address as the only field, empty prefix and postfix, `, ` as field separator and a line break as entry separator.

#### Scenario: The dialog is opened again

- **WHEN** a list was written with a given format and the dialog is opened again, also after restarting Obsidian
- **THEN** the fields, their order and the four texts are those of the last list, and nobody is chosen

#### Scenario: The dialog is opened for the first time

- **WHEN** the dialog is opened and no format has been confirmed before
- **THEN** only the e-mail address is switched on, and the entry separator is a line break

### Requirement: A missing field is written empty and reported

A person for whom a switched-on field has no value — a student without an address in the directory, a person without a class, or every person where the instance does not send addresses — SHALL be written with that field empty, the separators around it unchanged. The command SHALL NOT drop the person or the field. After writing or copying, it SHALL say in a notice how many entries had an empty field, and which fields were affected. Where the instance sent no address for anybody, the notice SHALL say that the instance does not send e-mail addresses, rather than counting every entry.

#### Scenario: A student has no address

- **WHEN** the e-mail address is switched on and one of the chosen students has none
- **THEN** that student's entry is written with an empty e-mail field and its separators in place
- **AND** a notice says that one entry has an empty e-mail address

#### Scenario: The instance predates the addresses

- **WHEN** the e-mail address is switched on and the instance returned no addresses at all
- **THEN** the list is written with empty e-mail fields, and a notice says that the instance does not send e-mail addresses
