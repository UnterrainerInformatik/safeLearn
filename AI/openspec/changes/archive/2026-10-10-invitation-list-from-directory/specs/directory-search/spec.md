## MODIFIED Requirements

### Requirement: Results carry only a display name, its two parts, and roles/groups

Each person in a search result SHALL be represented by their display name, the given name and surname that display name is made of, their e-mail address, and the roles/groups they hold — and by nothing else the directory records about them.

The two parts SHALL be the ones the display name is built from, as the directory holds them, and never a split of the display name after the fact. Splitting after the fact misfiles everyone whose given name or surname contains a space. The parts disclose nothing the display name does not already show. They exist so that a caller can order people by surname. The display name itself SHALL stay exactly what it was, because it is what a restriction names and what the server compares a reader's identity against.

The e-mail address SHALL be the one the directory holds for the person, unchanged. Unlike the name parts, it discloses something the display name does not show. It is returned deliberately, so that a caller can write an invitation list for the people it chose. This is acceptable because the address is the institutional one and because only a teacher or admin identity may search at all (see "Only a teacher or admin identity may search"). No other attribute SHALL be added on the strength of this one.

A person the directory holds without one of the parts, or without an address, SHALL carry that field as empty, not omitted, and the display name SHALL still be formed as it is today.

#### Scenario: A match's result fields

- **WHEN** a person is included in a search result
- **THEN** the result entry for that person contains their display name, their given name, their surname, their e-mail address and their roles/groups
- **AND** it contains no other attribute the directory holds for that person

#### Scenario: A surname contains a space

- **WHEN** a person whose surname consists of two words is included in a search result
- **THEN** the entry's surname is both words, as the directory holds it
- **AND** the display name is the given name, a space, and that surname — unchanged from before

#### Scenario: A person has no surname in the directory

- **WHEN** a person whose directory entry holds a given name but no surname is included in a search result
- **THEN** the entry's surname is empty and its display name is the given name alone

#### Scenario: A person has no e-mail address in the directory

- **WHEN** a person whose directory entry holds no e-mail address is included in a search result
- **THEN** the entry's e-mail address is empty, and the entry is otherwise unchanged

#### Scenario: A caller without a teacher or admin identity searches

- **WHEN** a caller who is neither teacher nor admin calls the search
- **THEN** the call is refused as before, and no e-mail address is returned
