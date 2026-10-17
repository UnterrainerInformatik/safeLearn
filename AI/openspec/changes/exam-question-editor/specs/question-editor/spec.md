## Purpose

Defines how teachers create, change, retire and delete pool questions and maintain the pool's categories online, now that the database is the pool's only source of truth, without changing any test that already exists.

## ADDED Requirements

### Requirement: Only a session acting as a teacher reaches the editor

The editor's pages and every request that changes the pool SHALL be available only to a session acting as a teacher. A student, and a teacher in student view, SHALL be refused, and a refused request SHALL change nothing.

#### Scenario: A student posts a question

- **WHEN** a student sends a request that would create a question
- **THEN** it is refused and the pool is unchanged

#### Scenario: A teacher in student view opens the editor

- **WHEN** a teacher who has switched to student view opens a question's editor page
- **THEN** the page is not shown

### Requirement: The pool browser leads into the editor

The question browser SHALL offer, on a question's preview, a way to edit that question, and, with a category chosen, a way to create a new question in that category. The editor page SHALL carry the module's bar like every other teacher page of the module. Leaving the editor SHALL return the teacher to the browser with the same category chosen.

#### Scenario: Editing from the preview

- **WHEN** a teacher previews a question and chooses to edit it
- **THEN** the editor opens with that question's German and English versions filled in

### Requirement: Teachers edit both languages of a question side by side

A teacher SHALL be able to create a question and edit any existing one, with the German and the English version side by side: short title, question text, every answer's text, which answers are correct, the type and the category. Answers SHALL be edited as pairs: one German and one English text per answer, with one correct flag that holds for both. A teacher SHALL be able to add, remove and reorder answers. Question and answer texts SHALL be edited as formatted text offering at least bold, italic, inline code, a code block, bulleted and numbered lists, and images. The editor SHALL NOT require the teacher to write markup.

#### Scenario: Correcting a wrong flag

- **WHEN** a teacher marks a different answer as correct in a `multichoice` question and saves
- **THEN** the pool's question has the new answer as its only correct one in both languages

#### Scenario: Adding an answer

- **WHEN** a teacher adds a fifth answer with German and English text to a `multichoiceset` question and saves
- **THEN** the question has five answers in both languages, in the order the editor showed

### Requirement: A question is saved only if it is complete in both languages and fits its type

A save SHALL be refused, and nothing stored, unless all of the following hold:

- The short title and the question text are present in German and in English.
- Every answer has text in both languages.
- A `multichoice` question has at least two answers and exactly one correct one.
- A `multichoiceset` question has at least two answers and at least one correct one.
- A `truefalse` question has exactly the two answers true and false, with one of them correct.
- The question belongs to an existing category.

A refusal SHALL name every problem it found, with the answer it concerns.

#### Scenario: An English answer missing

- **WHEN** a teacher saves a question whose third answer has German text and no English text
- **THEN** the save is refused, the editor names the third answer's missing English text, and the stored question is unchanged

#### Scenario: Two correct answers in a single-choice question

- **WHEN** a teacher saves a `multichoice` question with two answers marked correct
- **THEN** the save is refused and the editor says that exactly one answer may be correct

### Requirement: Stored text is sanitized and references only the module's images

Every question and answer text SHALL be sanitized on the server before it is stored, with the same rules the pool's import applied. No stored text SHALL keep inline styles, scripts, event handlers, or an image pointing anywhere but the module's own image route. An image reference SHALL name either an image of the same question or an image uploaded for this save. A text referencing any other image SHALL be refused.

#### Scenario: Pasted markup with styles

- **WHEN** a teacher pastes formatted text from a web page into a question text and saves
- **THEN** the stored text keeps its words and basic formatting, and contains no `style` attribute and no script

#### Scenario: An image of another question

- **WHEN** a save request references an image that belongs to a different question
- **THEN** the save is refused

### Requirement: Questions can carry uploaded images

A teacher SHALL be able to upload an image into a question's or an answer's text, in either language. The upload SHALL accept only PNG, JPEG, GIF and WebP images, judged by the file's content and not by its name or declared type. It SHALL refuse a file larger than 2 MB and state the limit. Uploaded images SHALL be stored and served like the imported ones: only to a session acting as a teacher, or to a student inside an open attempt whose test shows the image. An uploaded image that is never saved with a question SHALL be discarded.

#### Scenario: An oversized upload

- **WHEN** a teacher uploads a 20 MB image
- **THEN** it is refused with the limit of 2 MB stated

#### Scenario: A renamed file

- **WHEN** a teacher uploads a PDF whose name ends in `.png`
- **THEN** it is refused as not an image

#### Scenario: An upload never saved

- **WHEN** a teacher uploads an image and leaves the editor without saving
- **THEN** the image is not shown by the image route afterwards and is removed from the database

### Requirement: Editing never changes a test that already exists

Saving a question SHALL change only the pool. Every test that already contains the question SHALL keep its snapshot: its texts, answers, correct flags and images as they were when the test was assembled. An image that any test's snapshot shows SHALL NOT be changed or deleted by an edit, even if the edited text no longer references it. An image that is no longer referenced by the question and is shown by no test SHALL be removed.

#### Scenario: Fixing a question used last semester

- **WHEN** a teacher changes the text of a question that appeared in a written test and saves
- **THEN** the written test, its board solution and its students' results show the old text, and new tests get the new text

#### Scenario: Replacing an image

- **WHEN** a teacher replaces the only image of a question that a written test shows, and saves
- **THEN** the written test still shows the old image, and the pool question shows the new one

### Requirement: Tests not yet written can take up an edit on request

After saving a question that is part of tests not yet written, the editor SHALL list those tests and SHALL offer to bring each of them up to the saved version. A test SHALL take up the edit only if the teacher asks for it. Taking up an edit SHALL keep the test's questions and their order and SHALL refresh only the snapshot. A test that has been written in the meantime SHALL be refused and left unchanged.

#### Scenario: A typo fixed after assembling

- **WHEN** a teacher fixes a typo in a question that is part of a test with a sitting next week, and chooses to update that test
- **THEN** the test shows the corrected text and still has the same questions in the same order

#### Scenario: Not asked

- **WHEN** a teacher saves the question and does not choose to update the listed test
- **THEN** the test keeps the version it was assembled with

### Requirement: Concurrent edits are not lost

A save SHALL be refused if the question was changed since the teacher's editor read it. The refusal SHALL say that the question was changed in the meantime, and the teacher's unsaved input SHALL stay in the editor.

#### Scenario: Two teachers edit the same question

- **WHEN** one teacher saves a question and a second teacher, who opened it before that save, then saves it too
- **THEN** the second save is refused with the notice that the question changed, and the first teacher's version is kept

### Requirement: Used questions are retired, unused ones may be deleted

A teacher SHALL be able to delete a question that has never been part of a test. A question that has been part of a test SHALL NOT be deleted. A teacher SHALL be able to retire it instead. A retired question SHALL NOT be offered for new tests, SHALL be shown in the browser only when retired questions are asked for, and SHALL keep its usage history. A teacher SHALL be able to revive a retired question, which makes it available for new tests again. Any teacher SHALL be able to retire, revive and delete any question.

#### Scenario: Retiring a used question

- **WHEN** a teacher retires a question that appeared in two tests
- **THEN** the question is no longer offered for new tests, and both tests and its usage entries are unchanged

#### Scenario: Deleting a used question

- **WHEN** a teacher tries to delete a question that appeared in a test
- **THEN** it is refused, with retiring offered instead

#### Scenario: Deleting a fresh question

- **WHEN** a teacher deletes a question created today that no test contains
- **THEN** the question, its answers and its images are gone

### Requirement: Teachers maintain the category tree

A teacher SHALL be able to create a category with a German and an English name, at the top or under any category. A teacher SHALL be able to rename a category in both languages and move it under another parent or among its siblings, and to move questions between categories. Two categories under the same parent SHALL NOT share a German name. A category SHALL NOT be moved under itself or under one of its own descendants. A category that still holds questions, retired ones included, or other categories SHALL NOT be deleted.

#### Scenario: Deleting a non-empty category

- **WHEN** a teacher deletes a category holding five questions
- **THEN** it is refused and the category and its questions are unchanged

#### Scenario: Moving a category into its own subtree

- **WHEN** a teacher moves `HTTP und REST` under its own child `Caching`
- **THEN** it is refused and the tree is unchanged

#### Scenario: Moving a question

- **WHEN** a teacher moves a question to another category
- **THEN** the browser lists it in the new category, and its usage history is unchanged
