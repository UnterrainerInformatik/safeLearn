## MODIFIED Requirements

### Requirement: A picker never surfaces more than a display name, its two parts, and roles/groups

Consistent with what the directory search endpoint hands back, a picker SHALL surface a person's display name and their roles/groups — the latter for filtering and disambiguation only — and SHALL NOT expose or return any other attribute the directory could carry for them, except as stated here. The given name, surname and e-mail address the endpoint returns beside the display name SHALL be carried with the person only so that whatever opened the picker can order what it writes and write the fields it was asked for. The picker SHALL NOT show the name parts as anything other than the display name they make up, and SHALL NOT show the e-mail address at all.

How the picker orders the people it offers and the people chosen SHALL NOT be affected by them. In directory order a class's students stand together, and that is what makes picking a year group of some seventy workable.

#### Scenario: A match is shown

- **WHEN** a person is offered as a match in a picker
- **THEN** what is shown for them is their display name and their roles/groups, and nothing else
- **AND** what is returned for them is that, plus the given name, surname and e-mail address the instance sent for them

#### Scenario: A class is taken over and shown as chosen

- **WHEN** a class is narrowed to and taken over whole
- **THEN** the offered results and the chosen list stand in the order the directory answered in, not in surname order

#### Scenario: The instance predates the name parts

- **WHEN** the instance answers a search without given names and surnames
- **THEN** the picker offers and returns people exactly as before, with their display name and roles/groups

#### Scenario: The instance predates the e-mail address

- **WHEN** the instance answers a search without e-mail addresses
- **THEN** the picker offers and returns people as before, and what opened it receives no address for them
