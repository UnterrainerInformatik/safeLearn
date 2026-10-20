## ADDED Requirements

### Requirement: The module's table headings show names as they were entered

The headings of the gradebook and of the module's other tables SHALL show column names, test names and labels exactly as they were entered, without changing their case. Tables written in a corpus page's Markdown are not the module's tables and keep their own styling.

#### Scenario: A test name with lower-case words

- **WHEN** a test named "Quiz: HTTP and databases" appears as a column of the gradebook
- **THEN** its column head reads "Quiz: HTTP and databases", not "Quiz: HTTP And Databases"

#### Scenario: A column a teacher named

- **WHEN** a teacher names a gradebook column "oral check of chapter 3"
- **THEN** the sheet shows it as "oral check of chapter 3" for the teacher and for the students it concerns
