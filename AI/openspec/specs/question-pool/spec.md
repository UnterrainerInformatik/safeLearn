# question-pool Specification

## Purpose
Defines the shared pool of multiple-choice questions: how it is filled once from the existing Moodle export, what a question is, and how teachers browse and choose from it.

## Requirements

### Requirement: The pool is shared and the database is its only source of truth

All teachers SHALL work on one pool. After the one-time import, questions SHALL change only through the module (the question editor). There SHALL be no re-import over existing questions and no export.

#### Scenario: A second import is attempted

- **WHEN** the import is run against a database that already holds imported questions
- **THEN** it refuses and changes nothing

### Requirement: A question has a type, two languages and correct flags

A question SHALL be one of `multichoiceset` (several correct answers), `multichoice` (exactly one correct answer) or `truefalse`. It SHALL carry its text and each answer's text in German and in English, a correct flag per answer, a category, and any images it embeds. Every question SHALL be worth one point and SHALL be graded all-or-nothing.

#### Scenario: A multichoice question with two correct answers

- **WHEN** a question of type `multichoice` is saved with two answers flagged correct
- **THEN** it is refused, because a `multichoice` question has exactly one

### Requirement: The import pairs the German and English files by position and refuses a mismatch

The import SHALL read the German and the English Moodle XML file, pair their questions by position, and SHALL verify for every pair that type, number of answers and correct-answer pattern agree. If any pair disagrees, the import SHALL import nothing and SHALL report every disagreeing position. Questions of type `essay` SHALL be dropped and counted in the report.

#### Scenario: The current files

- **WHEN** the import is run on the two files under `htl-claude/moodle-quiz-questions/` as measured on 2026-10-16
- **THEN** 94 questions are imported into 22 categories and the report states that 9 `essay` questions were dropped

#### Scenario: A pattern mismatch

- **WHEN** position 40 has three correct answers in German and two in English
- **THEN** nothing is imported and the report names position 40

### Requirement: Imported text is sanitized and images are resolved

The import SHALL sanitize question and answer HTML with the same sanitizer the renderer uses, dropping Moodle's inline styles. Images embedded as `@@PLUGINFILE@@` with base64 data SHALL be stored by the module and served only through it, to sessions allowed to see the question. The hint in the question text that states how many answers are correct SHALL be preserved.

#### Scenario: A question with an embedded image

- **WHEN** a question embedding an image is imported
- **THEN** the stored question shows the image, the image is served from the module, and no base64 blob remains in the text

#### Scenario: The answer-count hint

- **WHEN** a question text contains "(2 richtige Antworten)"
- **THEN** the imported question text still contains it

### Requirement: Teachers browse the pool by category with a preview

A teacher SHALL be able to browse the pool by its category tree, search question texts, and open a preview showing the question in either language with its correct answers marked. Students SHALL have no access to the pool, its preview or its images outside a test they are writing.

#### Scenario: A student requests the pool

- **WHEN** a student requests the question browser or a question's preview
- **THEN** the request is refused

### Requirement: A question shows where it has been used

For each question, the browser SHALL show in which tests it has been used, with each test's course and date, and how often. This SHALL be visible while choosing questions for a new test.

#### Scenario: A question used twice

- **WHEN** a question appeared in tests for `4AHIF` on 2026-11-10 and for `4BHIF` on 2026-11-12
- **THEN** the browser shows both uses with course and date
