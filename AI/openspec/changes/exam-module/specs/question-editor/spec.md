## Purpose

Defines how teachers create and change pool questions online once the database is the pool's only source of truth.

## ADDED Requirements

### Requirement: Teachers create and edit questions in both languages at once

A teacher SHALL be able to create a question and edit any existing one, editing the German and the English version side by side: type, question text, answers, correct flags, category. A question SHALL be saved only if both languages have the same number of answers and the same answers are flagged correct, and if its correct flags fit its type.

#### Scenario: English answer missing

- **WHEN** a teacher saves a question with four German answers and three English ones
- **THEN** it is refused and the editor names the mismatch

### Requirement: Teachers maintain the category tree

A teacher SHALL be able to create, rename and move categories, and move questions between them. A category that still holds questions SHALL NOT be deleted.

#### Scenario: Deleting a non-empty category

- **WHEN** a teacher deletes a category holding five questions
- **THEN** it is refused

### Requirement: Questions can carry uploaded images

A teacher SHALL be able to upload an image into a question's text. Uploaded images SHALL be stored and served like imported ones. The upload SHALL accept only common raster image types and SHALL refuse files above a fixed size limit.

#### Scenario: An oversized upload

- **WHEN** a teacher uploads a 20 MB image
- **THEN** it is refused with the size limit stated

### Requirement: Editing never changes a test that already exists

Saving a question SHALL change only the pool. Tests that already contain the question SHALL keep their snapshot. A question that has been used in a test SHALL NOT be deleted; it SHALL be retired instead, so that it is no longer offered for new tests and its usage history stays intact.

#### Scenario: Retiring a used question

- **WHEN** a teacher removes a question that appeared in two tests
- **THEN** the question is no longer offered in the browser for new tests, and both tests and their usage entries are unchanged
