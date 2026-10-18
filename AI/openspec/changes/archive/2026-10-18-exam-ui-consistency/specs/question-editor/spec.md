## MODIFIED Requirements

### Requirement: The pool browser leads into the editor

The question browser SHALL offer, on a question's preview, a way to edit that question, and SHALL always offer a way to create a new question: in the chosen category when one is chosen, otherwise with the category to be chosen in the editor. Each category of the browser's tree SHALL also offer to create a new question in it. The editor page SHALL carry the module's bar like every other teacher page of the module. Leaving the editor SHALL return the teacher to the browser with the same category chosen.

#### Scenario: Editing from the preview

- **WHEN** a teacher previews a question and chooses to edit it
- **THEN** the editor opens with that question's German and English versions filled in

#### Scenario: New question without a chosen category

- **WHEN** a teacher opens the pool with all categories shown and chooses New question
- **THEN** the editor opens for a new question with no category chosen, and saving it requires one

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

## ADDED Requirements

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

Each category of the browser's tree SHALL offer a `+` that opens a small popup in the tree, with the German and the English name, which creates a subcategory. The end of the tree SHALL offer the same for a top-level category. A double click on a category's name or its pencil icon SHALL open the same popup filled with the category's names to rename it. The popup SHALL have a way to cancel. A category that is empty SHALL offer a delete icon, confirmed by the module's two-click confirmation, and a category that is not empty SHALL NOT offer it. A refusal SHALL be shown in the popup or at the category it concerns.

#### Scenario: A new subcategory

- **WHEN** a teacher clicks `+` at `HTTP und REST`, enters `Caching` and `Caching`, and confirms
- **THEN** `Caching` is the last subcategory of `HTTP und REST`

#### Scenario: A duplicate name

- **WHEN** a teacher renames a category to the German name of one of its siblings
- **THEN** the popup stays open and says why the name is refused

#### Scenario: Cancelling

- **WHEN** a teacher opens the rename popup and cancels
- **THEN** the popup closes and nothing is changed
