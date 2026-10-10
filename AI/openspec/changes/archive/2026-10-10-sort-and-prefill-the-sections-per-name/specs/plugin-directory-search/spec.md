## RENAMED Requirements

- FROM: `### Requirement: A picker never surfaces more than a display name and roles/groups`
- TO: `### Requirement: A picker never surfaces more than a display name, its two parts, and roles/groups`

## MODIFIED Requirements

### Requirement: A picker never surfaces more than a display name, its two parts, and roles/groups

Consistent with what the directory search endpoint hands back, a picker SHALL surface a person's display name and their roles/groups — the latter for filtering and disambiguation only — and SHALL NOT expose or return any other attribute the directory could carry for them. The given name and surname the endpoint returns beside the display name SHALL be carried with the person only so that whatever opened the picker can order what it writes. The picker SHALL NOT show them as anything other than the display name they make up.

How the picker orders the people it offers and the people chosen SHALL NOT be affected by them. In directory order a class's students stand together, and that is what makes picking a year group of some seventy workable.

#### Scenario: A match is shown

- **WHEN** a person is offered as a match in a picker
- **THEN** what is shown for them is their display name and their roles/groups, and nothing else
- **AND** what is returned for them is that, plus the given name and surname their display name is made of

#### Scenario: A class is taken over and shown as chosen

- **WHEN** a class is narrowed to and taken over whole
- **THEN** the offered results and the chosen list stand in the order the directory answered in, not in surname order

#### Scenario: The instance predates the name parts

- **WHEN** the instance answers a search without given names and surnames
- **THEN** the picker offers and returns people exactly as before, with their display name and roles/groups
