# page-navigation Specification

## Purpose

Defines the sidebar of the page view: that its Content list reflects only the page it is drawn on and the reader it is drawn for, and that the ☰ button shows and hides it at every viewport width.

## Requirements

### Requirement: The Content list shows the headings of the page it is drawn on

The sidebar's **Content** section SHALL list the headings of the page it is drawn on and of no other page. It SHALL be built from the same rendering of that page the reader receives, so it SHALL NOT list a heading the reader's rendering omitted. Pages rendered for other readers, before or at the same time, SHALL NOT affect it. A page of the page view that carries no rendered corpus content (the administration pages and the exam module's pages) SHALL show no Content section at all.

#### Scenario: A module page after a corpus page

- **WHEN** a teacher reads a corpus page with headings and then opens the gradebook
- **THEN** the gradebook's sidebar has no Content section
- **AND** none of the corpus page's headings appear in it

#### Scenario: An administration page after another reader's page

- **WHEN** one reader opens a corpus page and a teacher then opens `/admin/attachments`
- **THEN** the teacher's sidebar shows none of that corpus page's headings

#### Scenario: Two readers render different pages at the same time

- **WHEN** two readers request two different corpus pages concurrently
- **THEN** each reader's Content list holds exactly the headings of the page that reader receives

#### Scenario: A heading the reader may not see

- **WHEN** a corpus page holds a section restricted to teachers and a student opens it
- **THEN** the student's Content list does not list that section's heading

### Requirement: The ☰ button shows and hides the sidebar at every width

The ☰ button SHALL toggle the sidebar at every viewport width, and a single click SHALL always change what is visible. Above 1024 px the sidebar SHALL be shown when a page opens; a click SHALL fold it away and the content SHALL take the freed width, and a second click SHALL bring it back. At 1024 px and below the sidebar SHALL remain an overlay that is hidden when a page opens and that the button opens and closes, as before. The folded state SHALL NOT be carried to the next page load.

#### Scenario: Folding on a wide module page

- **WHEN** a teacher on the gradebook at 1600 px clicks ☰ once
- **THEN** the sidebar is no longer visible
- **AND** the gradebook's table starts at the page's left margin rather than beside an empty column

#### Scenario: Folding on a reading page

- **WHEN** a reader on a corpus page at 1600 px clicks ☰ once
- **THEN** the sidebar is no longer visible and the reading column keeps its width, centred on the page

#### Scenario: Bringing it back

- **WHEN** the reader clicks ☰ a second time
- **THEN** the sidebar is shown again and the content returns to its place beside it

#### Scenario: A narrow viewport is unchanged

- **WHEN** a reader opens a page at 390 px
- **THEN** the sidebar is hidden, a click on ☰ opens it as an overlay below the top bar, and a second click on ☰ closes it

#### Scenario: The next page

- **WHEN** a reader who folded the sidebar at 1600 px follows a link to another page
- **THEN** that page opens with the sidebar shown
