# question-editor Specification

## Purpose
Defines how teachers create, change, retire and delete pool questions and maintain the pool's categories online, now that the database is the pool's only source of truth, without changing any test that already exists.

## Requirements

### Requirement: Only a session acting as a teacher reaches the editor

The editor's pages and every request that changes the pool SHALL be available only to a session acting as a teacher. A student, and a teacher in student view, SHALL be refused, and a refused request SHALL change nothing.

#### Scenario: A student posts a question

- **WHEN** a student sends a request that would create a question
- **THEN** it is refused and the pool is unchanged

#### Scenario: A teacher in student view opens the editor

- **WHEN** a teacher who has switched to student view opens a question's editor page
- **THEN** the page is not shown

### Requirement: The pool browser leads into the editor

The question browser SHALL offer, on a question's preview, a way to edit that question, and SHALL always offer a way to create a new question: in the chosen category when one is chosen, otherwise with the category to be chosen in the editor. Each category of the browser's tree SHALL also offer to create a new question in it. The editor page SHALL carry the module's bar like every other teacher page of the module. Leaving the editor SHALL return the teacher to the browser with the same category chosen.

#### Scenario: Editing from the preview

- **WHEN** a teacher previews a question and chooses to edit it
- **THEN** the editor opens with that question's German and English versions filled in

#### Scenario: New question without a chosen category

- **WHEN** a teacher opens the pool with all categories shown and chooses New question
- **THEN** the editor opens for a new question with no category chosen, and saving it requires one

### Requirement: Teachers edit both languages of a question side by side

A teacher SHALL be able to create a question and edit any existing one, with the German and the English version side by side: short title, question text, every answer's text, which answers are correct, the type and the category. Answers SHALL be edited as pairs: one German and one English text per answer, with one correct flag that holds for both. A teacher SHALL be able to add and remove answers. The editor SHALL NOT offer to reorder them, because every attempt shuffles them. Question and answer texts SHALL be edited as formatted text offering at least bold, italic, inline code, a code block, bulleted and numbered lists, and images. The editor SHALL NOT require the teacher to write markup.

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

A teacher SHALL be able to create a category with a German and an English name, at the top or under any category. A teacher SHALL be able to rename a category in both languages and move it under another parent or among its siblings, and to move questions between categories. Two categories under the same parent SHALL NOT share a German name. A category SHALL NOT be moved under itself or under one of its own descendants. A category that still holds questions, retired ones included, or other categories SHALL NOT be deleted. All of this SHALL happen in the question browser's own category tree. The module SHALL have no separate page for maintaining categories, and its former address SHALL lead to the question browser.

#### Scenario: Deleting a non-empty category

- **WHEN** a teacher deletes a category holding five questions
- **THEN** it is refused and the category and its questions are unchanged

#### Scenario: Moving a category into its own subtree

- **WHEN** a teacher moves `HTTP und REST` under its own child `Caching`
- **THEN** it is refused and the tree is unchanged

#### Scenario: Moving a question

- **WHEN** a teacher moves a question to another category
- **THEN** the browser lists it in the new category, and its usage history is unchanged

#### Scenario: The old address

- **WHEN** a teacher opens `/exam/pool/categories`
- **THEN** the question browser opens

### Requirement: Categories and questions are moved by dragging

In the question browser's tree, a teacher SHALL be able to drag a category onto another category to make it that category's last subcategory. Dragging it between two categories SHALL place it there, at that level. While dragging, the browser SHALL show where the category would land: the target category highlighted, or a line between two categories. A teacher SHALL be able to drag a question from the browser's list onto a category to move the question there. Dragging SHALL work with a mouse and on a touch screen. A drop the server refuses SHALL leave the tree as it was and show the reason at the category that was dragged.

#### Scenario: Making a subcategory

- **WHEN** a teacher drags `Caching` onto `HTTP und REST`
- **THEN** `Caching` is the last subcategory of `HTTP und REST`

#### Scenario: Placing between two categories

- **WHEN** a teacher drags `Caching` to the line between `Netzwerke` and `Sicherheit` at the top level
- **THEN** `Caching` is a top-level category between them

#### Scenario: Moving a question by dragging

- **WHEN** a teacher drags a question from the list onto `Sicherheit`
- **THEN** the question belongs to `Sicherheit` and the list is redrawn

#### Scenario: A refused drop

- **WHEN** a teacher drops `HTTP und REST` onto its own child `Caching`
- **THEN** the tree is unchanged and the reason is shown at `HTTP und REST`

### Requirement: Every move can be made by keyboard

Every move that can be made by dragging SHALL also be possible by keyboard. A focused category or question row SHALL be cut, and pasting it on a focused category SHALL move it there. A focused category SHALL also be movable one place up or down among its siblings. The keys SHALL be listed in the browser.

#### Scenario: Moving a category by keyboard

- **WHEN** a teacher focuses `Caching`, cuts it, focuses `HTTP und REST` and pastes
- **THEN** `Caching` is the last subcategory of `HTTP und REST`

#### Scenario: Reordering by keyboard

- **WHEN** a teacher focuses the second of three sibling categories and moves it up
- **THEN** it is the first of them

### Requirement: Categories are created, renamed and deleted at the node

Each category of the browser's tree SHALL offer one menu button at the start of its row, before its name, that opens a small menu of what can be done with the category: a new question in it, a new subcategory, renaming it and, only while the category is empty, deleting it. The menu button SHALL stay visible and usable however long the category's name is and however deep it is nested. A new subcategory SHALL be created in a small popup in the tree, with the German and the English name. The end of the tree SHALL offer the same for a top-level category. A double click on a category's name, or Rename in its menu, SHALL open the same popup filled with the category's names to rename it. The popup SHALL have a way to cancel. Delete SHALL be confirmed by the module's two-click confirmation, and a category that is not empty SHALL NOT offer it. The menu SHALL be operable by keyboard and SHALL close with Escape or a click outside it. A refusal SHALL be shown in the popup or at the category it concerns.

#### Scenario: A new subcategory

- **WHEN** a teacher opens the menu at `HTTP und REST`, chooses New subcategory, enters `Caching` and `Caching`, and confirms
- **THEN** `Caching` is the last subcategory of `HTTP und REST`

#### Scenario: A duplicate name

- **WHEN** a teacher renames a category to the German name of one of its siblings
- **THEN** the popup stays open and says why the name is refused

#### Scenario: Cancelling

- **WHEN** a teacher opens the rename popup and cancels
- **THEN** the popup closes and nothing is changed

#### Scenario: A long name deep in the tree

- **WHEN** a category five levels deep has a German name of 80 characters and the tree's panel is 280 px wide
- **THEN** its menu button is fully inside the panel and opens its menu

#### Scenario: Deleting from the menu

- **WHEN** a teacher opens the menu of an empty category and chooses Delete once
- **THEN** nothing is deleted and the entry now says that a second click deletes the category; a second click deletes it

#### Scenario: A category that holds questions

- **WHEN** a teacher opens the menu of a category that holds a question
- **THEN** the menu offers no Delete
