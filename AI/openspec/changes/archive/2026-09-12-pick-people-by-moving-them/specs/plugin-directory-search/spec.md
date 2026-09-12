## ADDED Requirements

### Requirement: What has been chosen is shown, and can be taken back out

The system SHALL show, while a picker is open, every person currently chosen, as a list distinct from the offered results — including people chosen while a filter that no longer shows them was applied. Acting on one of them SHALL take that person back out of the chosen list, and a person taken back out SHALL NOT be returned when the picker is confirmed.

A person already chosen SHALL be held once however many times they are chosen again.

#### Scenario: People are chosen

- **WHEN** one or more people are chosen from the offered results
- **THEN** they are shown as the currently chosen people, separately from the results still being offered

#### Scenario: A filter no longer shows a chosen person

- **WHEN** the filter or the search is changed so that an already-chosen person is no longer among the offered results
- **THEN** that person is still shown as chosen, and is still returned when the picker is confirmed

#### Scenario: A chosen person is taken back out

- **WHEN** a person is acted on in the chosen list
- **THEN** they are no longer shown as chosen, and confirming the picker does not return them

#### Scenario: The same person is chosen twice

- **WHEN** a person who is already chosen is chosen again
- **THEN** they are shown once and returned once

### Requirement: Everything currently offered can be taken over in one action

The system SHALL offer, in every picker, one action that chooses every person the result list currently shows — no more and no fewer — so that narrowing to a class and taking that class over does not cost one action per person. People already chosen SHALL remain chosen and SHALL NOT be duplicated by it.

#### Scenario: A class is narrowed to and taken over whole

- **WHEN** the picker is narrowed to a class and the action that takes over everything offered is used
- **THEN** every person the result list is showing becomes chosen, in one action

#### Scenario: Some of what is offered is already chosen

- **WHEN** the action is used while some of the offered people are already chosen
- **THEN** those people stay chosen once, and the rest are added to them

#### Scenario: Two filters are taken over in turn

- **WHEN** the action is used, the filter is then changed, and it is used again
- **THEN** the people from both filters are chosen together

#### Scenario: Nothing is offered

- **WHEN** the action is used while the result list shows nobody
- **THEN** nothing is chosen and nothing already chosen is lost

## MODIFIED Requirements

### Requirement: Students can be picked, filterable by one or more searchable classes

The system SHALL offer a picker that searches the directory for students, narrowable to one or more chosen classes, and lets a person take several of the offered results over together in one action rather than one at a time. Where the directory holds enough classes that scrolling a plain list is impractical, the class filter itself SHALL be narrowable by typing rather than only by scrolling.

#### Scenario: Searching without a class filter

- **WHEN** a person searches the student picker without choosing a class
- **THEN** matches are drawn from every student the directory reports

#### Scenario: Searching with one class filter

- **WHEN** a person narrows the picker to one class
- **THEN** only students holding that class are offered as matches

#### Scenario: Searching with more than one class filter

- **WHEN** a person narrows the picker to more than one chosen class
- **THEN** matches are drawn from students holding any of the chosen classes

#### Scenario: Narrowing the class filter itself by typing

- **WHEN** a person types into the class filter
- **THEN** the classes offered to choose from narrow to those matching what was typed, the same way typing narrows student matches

#### Scenario: Marking several results and taking them over together

- **WHEN** a person chooses more than one of the offered students from the same set of results
- **THEN** all of them are held as chosen together, without a separate search in between

#### Scenario: Choosing students

- **WHEN** a person chooses one or more offered students and confirms
- **THEN** the picker returns their display names to whatever opened it

### Requirement: Teachers can be picked

The system SHALL offer a picker that searches the directory for teachers and lets a person take several of the offered results over together in one action rather than one at a time.

#### Scenario: Searching for a teacher

- **WHEN** a person searches the teacher picker
- **THEN** matches are drawn from every person the directory reports as holding the teacher role

#### Scenario: Marking several results and taking them over together

- **WHEN** a person chooses more than one of the offered teachers from the same set of results
- **THEN** all of them are held as chosen together, without a separate search in between

#### Scenario: Choosing teachers

- **WHEN** a person chooses one or more offered teachers and confirms
- **THEN** the picker returns their display names to whatever opened it
