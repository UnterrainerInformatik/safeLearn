## Purpose

Gives a teacher read-only pages in the web app, opened from the settings menu with the browser session, for looking after the instance: the attachments no page references, and the state of the directory data.

## ADDED Requirements

### Requirement: The menu offers the administration pages to a session acting as a teacher

The settings menu SHALL show a section **Administration** with one button per administration page (**Unreferenced attachments**, **Directory status**) to a session acting as a teacher or admin after the student-view downgrade. It SHALL NOT show the section to any other session, a teacher in student view included. The entries SHALL be buttons, visible as soon as the menu is open, without a further submenu.

#### Scenario: A teacher opens the menu

- **WHEN** a session acting as a teacher opens the settings menu
- **THEN** the menu shows the Administration section with the buttons Unreferenced attachments and Directory status
- **AND** pressing one of them opens that page

#### Scenario: A student opens the menu

- **WHEN** a session holding neither the teacher nor the admin role opens the settings menu
- **THEN** the menu shows no Administration section

#### Scenario: A teacher in student view opens the menu

- **WHEN** a teacher who has switched to the student view opens the settings menu
- **THEN** the menu shows no Administration section
- **AND** switching back to the teacher view shows it again without a new login

### Requirement: Only a session acting as a teacher reaches the pages and their data

The administration pages SHALL be shown only to a session that has an identity and acts as a teacher or admin after the student-view downgrade. For any other session a page SHALL be answered the way a path with nothing behind it is answered, so it does not reveal that it exists, and the data the pages read SHALL be refused with `403` and carry nothing. A request without a session SHALL be handled as every other protected request is: sent to the login.

#### Scenario: A teacher opens a page

- **WHEN** a session acting as a teacher requests `/admin/attachments` or `/admin/directory`
- **THEN** the page is shown

#### Scenario: A student requests a page

- **WHEN** a session not acting as a teacher, a teacher in student view included, requests `/admin/attachments` or `/admin/directory`
- **THEN** it gets the same answer as for a path no file or route stands behind

#### Scenario: A student requests the data behind a page

- **WHEN** a session not acting as a teacher requests `/admin/api/attachments` or `/admin/api/directory/status`
- **THEN** the request is refused with `403` and the answer names no path and no figure

### Requirement: The attachments page lists what the last scan found unreferenced

The page **Unreferenced attachments** SHALL show the list the application holds from its last scan: every attachment no page references, by its path relative to the corpus directory, sorted by path and grouped by folder, together with their count and the time of that scan in the reader's format. It SHALL be exactly the list the server logs and the attachment gate refuses as unreferenced. A button **Copy paths** SHALL put the paths on the clipboard, one per line. The page SHALL NOT serve, preview or delete any of the files.

#### Scenario: The scan found unreferenced attachments

- **WHEN** the last scan found `assets/old.pdf` and `ex/Solution.java` referenced by no page and a teacher opens the page
- **THEN** the page names both paths, says that 2 attachments are unreferenced, and shows when that scan ran

#### Scenario: Nothing is unreferenced

- **WHEN** the last scan found every attachment referenced
- **THEN** the page says that no attachment is unreferenced and shows when that scan ran, instead of an empty table

#### Scenario: A rescan changes the list

- **WHEN** a page that embeds `assets/old.pdf` is added, a scan follows and the teacher reloads the page
- **THEN** the page no longer names `assets/old.pdf` and shows the time of the new scan

#### Scenario: Copying the paths

- **WHEN** the teacher presses Copy paths
- **THEN** the clipboard holds every listed path, one per line, and nothing else
- **AND** the page confirms the copy beside the button

### Requirement: The directory page shows the directory status without starting a fetch

The page **Directory status** SHALL show the report the directory status gives: whether a fetch is running, its phase and its progress as the raw figures of that phase, and for the held data its entry count, when it was built and how many records were skipped. Dates and numbers SHALL be in the reader's format. While a fetch is running the page SHALL refresh the report on its own until the fetch has ended. Opening or refreshing the page SHALL NOT start a fetch. The page SHALL show the number of skipped records only, never which records they were.

#### Scenario: Data is held and no fetch runs

- **WHEN** a teacher opens the page while directory data is held and no fetch runs
- **THEN** the page shows the entry count, when the data was built and how many records were skipped, and that no fetch is running

#### Scenario: A fetch is running

- **WHEN** a teacher opens the page while a fetch is in its `entries` phase
- **THEN** the page shows the phase and how many of how many it has done
- **AND** it updates on its own while the fetch runs, and shows the new entry count and build time once it has ended

#### Scenario: Nothing is held yet

- **WHEN** a teacher opens the page while no directory data is held and no fetch runs
- **THEN** the page says that no directory data is held, rather than showing zero entries

#### Scenario: Records were skipped

- **WHEN** the held data was built while 3 records were skipped
- **THEN** the page says that 3 records were skipped and names none of them

### Requirement: The pages exist only where readers have an identity

The administration pages, their data routes and the menu section SHALL exist only in an instance where readers log in. In an instance running without an identity provider (`AUTH=none`) they SHALL NOT be registered and the menu section SHALL NOT be drawn, whatever roles the readers are given.

#### Scenario: An instance without an identity provider

- **WHEN** an instance runs with `AUTH=none` and `READER_ROLES=teacher`
- **THEN** the settings menu shows no Administration section
- **AND** `/admin/attachments`, `/admin/directory` and both data routes get the same answer as a path with nothing behind it

### Requirement: The pages speak the reader's language and fit a phone

Every text of the menu section and the pages SHALL come from the interface catalogs in English and German, and follow the reader's language. The pages SHALL be usable at a viewport 390px wide without horizontal scrolling of the page.

#### Scenario: A teacher reads in German

- **WHEN** a teacher whose interface language is German opens the menu and the two pages
- **THEN** the section, the buttons and every text on both pages are German

#### Scenario: A phone-sized viewport

- **WHEN** a teacher opens either page at a viewport 390px wide
- **THEN** the page does not scroll horizontally, and a long path wraps within its row
