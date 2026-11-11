## MODIFIED Requirements

### Requirement: The Content list shows the headings of the page it is drawn on

The sidebar's **Content** section SHALL list the headings of the page it is drawn on and of no other page. It SHALL be built from the same rendering of that page the reader receives, so it SHALL NOT list a heading the reader's rendering omitted. Pages rendered for other readers, before or at the same time, SHALL NOT affect it. A page of the page view that carries no rendered corpus content (the administration pages and the exam module's pages) SHALL show no Content section at all. Each entry SHALL lead to its heading by the heading's stable anchor (`note-anchors`), so an entry's address is the same address a wiki link to that heading uses.

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

#### Scenario: An entry and a wiki link agree

- **WHEN** a page has a heading `## Branches` and another page links `[[Note#Branches]]` to it
- **THEN** the Content list entry and the link both address the anchor `branches`
