## Purpose

Lets the teacher of a course mark and unmark a student as one of the course's Matura candidates by a Keycloak role, and makes those students stand out wherever the exam module shows them.

## ADDED Requirements

### Requirement: A course's exam-participant role is named after its subject

The role that marks a course's Matura candidates SHALL be the client role `examparticipant-<subject>` on the application's own Keycloak client, where `<subject>` is the course's subject in lower case. Two courses with the same subject in different classes SHALL share the role; which class a holder belongs to SHALL come from the class roster, not from the role.

#### Scenario: Role name from the subject

- **WHEN** a course's subject is `WMC`
- **THEN** its exam-participant role is `examparticipant-wmc`

### Requirement: The gradebook grants and withdraws the role per student

The course gradebook SHALL show, for each student on the course's roster, a toggle that tells whether the student holds the course's exam-participant role and that grants or withdraws it with one click. Only a teacher or admin SHALL be able to change it, and only for a student on that course's current roster. A closed school year's gradebook SHALL show the state but SHALL NOT offer the toggle. A change that fails SHALL be reported beside the sheet, and the toggle SHALL keep showing the state the identity provider holds.

#### Scenario: Granting the role

- **WHEN** a teacher switches the toggle on for a student in the gradebook of course `WMC`
- **THEN** the student holds the client role `examparticipant-wmc` in Keycloak, and the toggle shows it as held

#### Scenario: Withdrawing the role

- **WHEN** a teacher switches the toggle off for a student who holds the role
- **THEN** the student no longer holds `examparticipant-wmc`, and other roles of the student are unchanged

#### Scenario: Somebody not on the roster

- **WHEN** a request asks to grant the role of a course to a username that is not on the course's current roster
- **THEN** it is refused and no role mapping changes

#### Scenario: A student cannot grant it

- **WHEN** a session without the teacher or admin role asks to grant the role
- **THEN** it is refused and no role mapping changes

### Requirement: A missing role is created on first grant

When the course's exam-participant role does not exist on the application's client, the first grant SHALL create it and then grant it. Withdrawing a role that does not exist SHALL succeed without creating it.

#### Scenario: First candidate of a new subject

- **WHEN** a teacher grants the role of a course whose subject has never had candidates
- **THEN** the role `examparticipant-<subject>` exists on the client afterwards and the student holds it

### Requirement: An instance without write rights says so

When the identity the application uses for the directory lacks the rights to create or assign the role, the gradebook SHALL still show who holds it, and a change SHALL be refused with a message that names the missing Keycloak setup instead of a generic failure. An instance without directory credentials SHALL NOT show the toggle.

#### Scenario: Read-only directory identity

- **WHEN** the directory identity holds only read rights and a teacher switches the toggle
- **THEN** the change is refused with a message about the missing write rights, and the toggle shows the unchanged state

### Requirement: A change shows at once

After a successful grant or withdrawal, every exam-module view SHALL reflect the new state on its next load, without waiting for the next full directory fetch.

#### Scenario: Gradebook reloaded after a grant

- **WHEN** a teacher grants the role and reloads the gradebook
- **THEN** the student is shown as holding the role and highlighted

### Requirement: Holders are highlighted across the exam module

Wherever the exam module shows a student in the context of a course - the gradebook sheet, a student's page in the gradebook with its neighbours, the tests' participant lists, and the live view of a sitting - a student holding that course's exam-participant role SHALL be highlighted: in a table by a coloured background of the cell with the name, elsewhere by a different text colour of the name. The class roster SHALL highlight a student who holds the role of any of the class's courses, and SHALL name those subjects on hover. The highlight SHALL be legible in light and dark mode and SHALL NOT be the only carrier of the information for assistive technology (the name SHALL carry an accessible label saying so). The view for the class on a projector SHALL NOT show it.

#### Scenario: Highlighted in the gradebook

- **WHEN** a teacher opens the gradebook of `WMC` and one student holds `examparticipant-wmc`
- **THEN** that student's name cell has the highlight colour and the others do not

#### Scenario: Highlighted in the live view

- **WHEN** a teacher opens the live view of a sitting of a `WMC` test
- **THEN** the name cell of a student holding `examparticipant-wmc` is highlighted

#### Scenario: Other subject not highlighted

- **WHEN** a student holds `examparticipant-wmc` and a teacher opens the gradebook of `POS` of the same class
- **THEN** that student is not highlighted there
