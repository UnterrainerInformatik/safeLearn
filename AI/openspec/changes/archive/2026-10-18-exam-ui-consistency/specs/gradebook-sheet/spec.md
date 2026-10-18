## ADDED Requirements

### Requirement: A student's page leads to the neighbouring students and back

A student's page in a course SHALL offer, at its top, a way back to the course's sheet for the shown semester, and ways to the previous and the next student in the sheet's order. The previous way SHALL be missing for the first student and the next way for the last. The semester SHALL be kept.

#### Scenario: Going through the class

- **WHEN** a teacher on the winter page of the third student of the sheet chooses the next student
- **THEN** the winter page of the fourth student opens

#### Scenario: Back to the sheet

- **WHEN** a teacher on a student's summer page chooses the way back
- **THEN** the course's sheet opens on the whole year

### Requirement: A comment is visible in the sheet

When a student's grade carries a comment, the sheet SHALL show that the comment exists in the student's row, and SHALL make its text readable in the sheet without hovering, also on a touch screen.

#### Scenario: Reading a comment on a tablet

- **WHEN** a teacher on a tablet taps the comment mark in a student's row
- **THEN** the comment's text is shown in the sheet
