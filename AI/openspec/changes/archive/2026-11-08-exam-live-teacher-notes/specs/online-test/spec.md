## ADDED Requirements

### Requirement: Teachers note participants in the live view

In the live view of a sitting, every participant's row SHALL hold a note for teachers: a text of up to 4000 characters, kept as it was entered, line breaks included. A student and a test SHALL have at most one such note. It SHALL belong to the student and the test, not to one sitting: the live view of any sitting of that test, a make-up sitting included, SHALL show the same note, and it SHALL stay there after the sitting is over. The row SHALL show a note field that takes line breaks and is saved as it changes, with the same marking of saving, saved and refused as the fields of the sheet. A text that is empty or consists only of white space SHALL remove the note. A text longer than 4000 characters SHALL be refused, and the stored note SHALL stay as it was. Any teacher SHALL be able to write and remove it. A note one teacher saves SHALL reach every other open live view of that test as the view updates.

The note SHALL be shown to teachers only. It SHALL NOT be sent to a student by any route, page or API, including their attempt page, their Exams page and their results. It SHALL NOT appear on the view for the class. It SHALL be kept apart from the cell note of the test's column in the sheet, and neither SHALL change the other. It SHALL count in no calculation: it SHALL NOT change the order of the rows, a participant's status, the row's colour or stripe, the score, the grade or any proposal.

#### Scenario: A note during the sitting

- **WHEN** a teacher enters "Looked at the neighbour's screen twice\ncheck against Huber" in a writing student's row
- **THEN** the note is saved with its line break and shown in that row, and the row stays where it was in the order

#### Scenario: A second teacher sees it

- **WHEN** two teachers have the live view of the same sitting open, and one of them saves a note
- **THEN** the other's view shows the note without being reloaded

#### Scenario: After the sitting

- **WHEN** a teacher opens the live view of a sitting that ended a week ago
- **THEN** each participant's note is shown and can still be changed

#### Scenario: In the make-up sitting

- **WHEN** a student has a note in the first sitting of a test and is a participant of its make-up sitting
- **THEN** the make-up sitting's live view shows the same note in their row

#### Scenario: The student does not see it

- **WHEN** a student who has a teacher note writes, submits and then opens their Exams page and their results
- **THEN** no response to that student contains the note's text, and no page shows that a note exists

#### Scenario: The class does not see it

- **WHEN** the view for the class is shown during a sitting in which participants have notes
- **THEN** it shows no note and no sign of one

#### Scenario: Apart from the sheet

- **WHEN** a student has a teacher note for a test and a cell note in that test's column of the sheet
- **THEN** the sheet shows only the cell note, the student's results show only the cell note, and the live view shows only the teacher note

#### Scenario: Emptying the note

- **WHEN** a teacher replaces a note with white space only
- **THEN** the note no longer exists

#### Scenario: A note that is too long

- **WHEN** a teacher enters a note of 4001 characters
- **THEN** it is refused with the reason, and the row keeps the note it had

#### Scenario: A student cannot write one

- **WHEN** a request from a student's session, or without a session, writes a teacher note
- **THEN** it is refused and nothing is written
