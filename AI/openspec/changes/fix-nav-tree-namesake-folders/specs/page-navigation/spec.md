## ADDED Requirements

### Requirement: Each folder of the navigation tree opens on its own

Every folder in the sidebar's navigation tree SHALL be identified by its full path from the corpus root. Clicking a folder's name SHALL open or close that folder and turn that folder's chevron, and SHALL NOT open, close or turn any other folder or chevron — in particular not another folder carrying the same name, at the same depth or any other. When a page is opened, the folders on the path to that page SHALL be shown open, and no folder outside that path SHALL be opened because its name equals one on the path.

#### Scenario: Opening one of two namesake subfolders

- **WHEN** the corpus holds `a/shared/` and `b/shared/`, each with a file, and the reader opens `b` and then clicks `shared` inside it
- **THEN** the file in `b/shared/` becomes visible, and `a/shared/` stays as it was

#### Scenario: Closing it again

- **WHEN** the reader clicks `shared` inside `b` a second time
- **THEN** `b/shared/` closes, and `a/shared/` is still unchanged

#### Scenario: A page inside the second namesake

- **WHEN** the reader opens a page inside `b/shared/`
- **THEN** the tree shows `b` and `b/shared/` open with the page highlighted, and neither `a` nor `a/shared/` is open

#### Scenario: Folders with unique names are unchanged

- **WHEN** the reader clicks a folder whose name occurs nowhere else in the tree
- **THEN** it opens and closes exactly as before
