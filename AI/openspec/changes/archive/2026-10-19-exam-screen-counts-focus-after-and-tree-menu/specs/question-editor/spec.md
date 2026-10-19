## MODIFIED Requirements

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
