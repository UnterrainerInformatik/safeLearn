## ADDED Requirements

### Requirement: Every cell can hold a note

Every cell of the sheet - one student in one column - SHALL be able to hold a note: a text of up to 4000 characters, kept as it was entered, line breaks included. This SHALL hold for every column: online tests, manual tests, short tests, presentations, a project's end grade, a project's `+`/`−` columns, participation and homework. A cell SHALL hold at most one note. A note SHALL NOT need a result: a cell can hold a note without a value, a value without a note, or both. Removing a cell's value SHALL leave its note in place, and removing its note SHALL leave its value in place. A note SHALL count in no calculation. A text that is empty or consists only of white space SHALL remove the note. A text longer than 4000 characters SHALL be refused, and the stored note SHALL stay as it was. Notes SHALL be editable and removable by any teacher, as results are.

#### Scenario: A note beside a homework's grade

- **WHEN** a teacher enters 9 in a student's field of the homework column `Greeting service` out of 10, and the note "You forgot GreetingService.java (-1)\nOtherwise great."
- **THEN** the cell holds the result 9/10 and the note with its line break, and the student's proposal is the same as without the note

#### Scenario: A note without a result

- **WHEN** a teacher sets the note "Not handed in, due Friday" in a student's empty cell of a homework column
- **THEN** the cell holds the note and no result, and the student's homework category is computed without an entry for that column

#### Scenario: Emptying the value keeps the note

- **WHEN** a cell holds the result 9/10 and a note, and a teacher empties the field
- **THEN** the result no longer exists and the note is still there

#### Scenario: A note that is too long

- **WHEN** a teacher enters a note of 4001 characters
- **THEN** it is refused with the reason, and the cell keeps the note it had

### Requirement: The active column opens its notes, every other column shows only a mark

The sheet SHALL give a note no room of its own while its column is not in use: a cell holding a note SHALL show a small note mark beside its value, and a cell without a note SHALL show nothing for it. Hovering the mark SHALL show the note's text. The column holding the focus - the active column - SHALL show, for every student, a note field directly right of the student's result field, about 20 characters wide, holding the cell's note. The field SHALL take a text with line breaks: Enter SHALL insert a line break, as in any multi-line text field, and SHALL NOT move the focus. The field SHALL be saved as it changes, with the same marking of saving, saved and refused as every other field of the sheet, and leaving it SHALL save it as leaving any field does. When the focus leaves the column, its note fields SHALL close again and the column SHALL show only its marks. There SHALL be no popup and no separate button for a note.

In the active column, the note fields SHALL take part in arrow-key movement like result fields: the right arrow at the end of a result field's text SHALL move to the same cell's note field, and from there, at the end of its text, to the next column's result field. The left arrow SHALL move back the same way, at the start of the text. The up and down arrows SHALL move to the previous or next student's note field of the same column, but only while the text cursor stands in the first or the last line of the note, so that they still move the cursor between its lines.

An online-test column's result fields cannot be edited and the arrow keys pass over them. Clicking a cell of such a column, or its note mark, SHALL make it the active column and put the focus into that student's note field, for every participant on the roster, whether they submitted an attempt or not. The same SHALL hold for any column: clicking a note mark SHALL put the focus into that cell's note field.

#### Scenario: Writing a note

- **WHEN** a teacher types 9 into a student's field of a homework column, presses the right arrow at the end of the text, types a note and presses the down arrow
- **THEN** 9 and the note are stored without any further save action, the focus is in the next student's note field of that column, and the first student's cell shows a note mark

#### Scenario: Leaving the column

- **WHEN** the focus moves from a homework column into a field of another column
- **THEN** the homework column's note fields close, its cells holding a note show the note mark, and the other column now shows its note fields

#### Scenario: Removing a note

- **WHEN** a teacher empties a cell's note field and leaves it
- **THEN** the note no longer exists, the cell's value is unchanged, and the cell shows no note mark once its column is no longer active

#### Scenario: A note on an online test

- **WHEN** a student missed the online test `HTTP caching` and a teacher clicks that student's cell of the test's column and types "Ill, make-up on 12 Dec"
- **THEN** the focus is in the cell's note field, the note is stored, and the cell still shows no result and cannot be typed into

#### Scenario: Two lines in a note

- **WHEN** a teacher types "You forgot GreetingService.java (-1)", presses Enter and types "Otherwise great."
- **THEN** the note is stored on two lines, and pressing the up arrow on the second line moves the cursor to the first line instead of to the previous student

## MODIFIED Requirements

### Requirement: Arrow keys move between the sheet's result fields

While a result field of the sheet has the focus, the arrow keys SHALL move the focus between result fields, for points, percent and `+`/`−` fields alike. The down arrow SHALL move to the same column's field of the next student, the up arrow to that of the previous student. The right arrow SHALL move to the same student's field in the next column to the right, and the left arrow to the one to the left, but only while the text cursor stands at the end (right) or the start (left) of the field's text, so that the arrows still move the cursor inside a value being typed. An empty field counts as both. Moving SHALL save the field being left, as leaving it by any other means does. At the edge of the sheet the focus SHALL stay where it is. Left and right SHALL pass over category boundaries as if the columns were one row. The arrows SHALL NOT change a field's value: a `+`/`−` field is set by typing `+` or `-`. The override field SHALL NOT take part in arrow movement. Tab and Shift+Tab SHALL move along the row as the browser does. Enter in a result field SHALL do what the down arrow does: save the field and move the focus to the same column's field of the next student.

#### Scenario: Entering a test for the class

- **WHEN** a teacher types 18 into the first student's field of a column and presses the down arrow
- **THEN** 18 is saved for the first student and the focus is in the second student's field of the same column

#### Scenario: Along a row

- **WHEN** a teacher types 18 into a field, so the cursor stands at the end of `18`, and presses the right arrow
- **THEN** 18 is saved and the focus is in the same student's field of the next column
- **AND** pressing the left arrow there, in an empty field, brings the focus back to the field holding 18

#### Scenario: Moving the cursor inside a value

- **WHEN** a field holds `17.5` with the cursor at its end and the teacher presses the left arrow
- **THEN** the cursor moves one character to the left inside the field, and the focus stays in the field

#### Scenario: Participation marks down the list

- **WHEN** a teacher in a participation column types `+`, presses the down arrow, types `-` and presses the down arrow again
- **THEN** the first student has `+`, the second has `−`, and the focus is in the third student's field

#### Scenario: Enter down the list

- **WHEN** a teacher types 18 into the first student's field of a column and presses Enter
- **THEN** 18 is saved for the first student and the focus is in the second student's field of the same column


### Requirement: The student sees a result by its column

A student's own results SHALL show each result with its column's name and date, and with the cell's note beside it where there is one. A column in which the student has a note but no result SHALL be shown to them with its name and date, no result, and the note. A student SHALL see nothing else of the sheet: neither other students' results or notes nor columns in which they have neither a result nor a note.

#### Scenario: A named test

- **WHEN** a student has 18 points in the column `1st test` out of 24
- **THEN** their results show `1st test`, its date and 18/24

#### Scenario: A result with a note

- **WHEN** a student has 9 points in the homework column `Greeting service` out of 10, with the note "You forgot GreetingService.java (-1)\nOtherwise great."
- **THEN** their results show `Greeting service`, its date, 9/10 and the note on two lines

#### Scenario: Only a note

- **WHEN** a student has no result but the note "Not handed in, due Friday" in the homework column `Greeting service`
- **THEN** their results show `Greeting service`, its date, no result and the note, and their homework category is the same as without that column

### Requirement: A column is added with the + of its category

The sheet SHALL show a `+` at the top of each of the categories manual tests, short tests, presentations, projects, participation and homework, as long as the category is in use. Using it SHALL open a dialog asking for the column's name, date and, where the category has one, maximum, and SHALL add a column to that category; in the projects category it SHALL add a project. A column added without a name SHALL be named by its date. The online-test category SHALL have no `+`: its columns are the online tests themselves. A column's name, date and maximum SHALL be changed in the same dialog, opened by choosing the column's header. Each of its fields SHALL be saved as it changes, with the same marking of saving, saved and refused as every other field. Changing the maximum SHALL be refused while a result in the column has more points than the new maximum. The dialog SHALL offer to delete the column. Deleting a column SHALL remove its results and its notes, and SHALL ask for confirmation first when it has any of either.

#### Scenario: A participation column

- **WHEN** a teacher uses the `+` of participation and enters the date 2026-11-04
- **THEN** a participation column dated 2026-11-04 appears, and each student has a field for `+` or `−` in it

#### Scenario: Changing the maximum

- **WHEN** a column out of 24 holds a result of 20 points and a teacher chooses its header and changes the maximum to 30
- **THEN** the result becomes 20/30 and the proposals follow
- **AND** changing the maximum to 18 instead is refused at the field, and the column keeps 24

#### Scenario: Renaming a column

- **WHEN** a teacher chooses the header of the column `1st test`, changes its name to `1st test (group A)` and closes the dialog
- **THEN** the header shows `1st test (group A)`, without any further save action

#### Scenario: Deleting a column

- **WHEN** a teacher chooses the header of a column holding 25 results and deletes it from the dialog
- **THEN** the dialog asks for confirmation first, and only after it the column and its results are gone

#### Scenario: Deleting a column holding only notes

- **WHEN** a teacher deletes a column that holds no result but two notes
- **THEN** the dialog asks for confirmation first, and only after it the column and its notes are gone

#### Scenario: A presentation column

- **WHEN** a teacher uses the `+` of presentations and enters the name `Referat Git`
- **THEN** a presentation column `Referat Git` appears, asking for no maximum, and each student has a field for a grade in it
