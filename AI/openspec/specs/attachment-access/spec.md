# attachment-access Specification

## Purpose

Defines which session is served which attachment from the Markdown corpus, the images, documents and other files a page embeds or links. An attachment is exactly as visible as the most visible place in the corpus that uses it, and no more visible than that.

## Requirements

### Requirement: An attachment is served where at least one of its references is visible

An attachment in the corpus SHALL be served to a session only when that session may see at least one place in the corpus that references it. A place SHALL count as visible when the session may see the Markdown file it is in, under the whole-file directive with its time windows, and, where the reference sits inside an inline `@@@` block, may also see that block under the same rules the rendered page applies to it: its roles, its time windows, the view pseudo-roles, and the student-view downgrade. A reference is any way a rendered page addresses the attachment: an embed (`![[name]]`), an image, a link, or a wiki link (`[[name]]`, `[[name|text]]`) that resolves to the attachment.

#### Scenario: Referenced from an unrestricted page

- **WHEN** an attachment is referenced on a page that carries no directive, outside any `@@@` block
- **THEN** it is served to every authenticated session

#### Scenario: Referenced only inside a teacher block

- **WHEN** an attachment is referenced only inside a `@@@ teacher` block, and a student session requests it
- **THEN** it is not served
- **AND** a teacher session requesting it is served

#### Scenario: Referenced in several places with different restrictions

- **WHEN** an attachment is referenced on a page restricted to teachers, inside a `4bhif` block on another page, and on an unrestricted page
- **THEN** it is served to every authenticated session, because the unrestricted page is visible to each of them
- **AND** if the reference on the unrestricted page is removed, it is served only to teachers and to members of `4bhif`

#### Scenario: The only visible reference is inside a closed time window

- **WHEN** an attachment's only reference visible to a session sits in a block whose time window is not open at the moment of the request
- **THEN** it is not served to that session

#### Scenario: A teacher in student view

- **WHEN** a teacher who has switched to the student view requests an attachment referenced only in teacher-only places
- **THEN** it is not served, exactly as the teacher's rendered pages do not show it

#### Scenario: Referenced only in the exam variant

- **WHEN** an attachment is referenced only inside a block gated by the exam view, and a session without that view requests it
- **THEN** it is not served

#### Scenario: Referenced by a wiki link

- **WHEN** an attachment is referenced only by a wiki link `[[handout.pdf]]` on an unrestricted page, outside any `@@@` block
- **THEN** it is served to every authenticated session
- **AND** if that wiki link is moved inside a `@@@ teacher` block, it is no longer served to a student session

### Requirement: An attachment no page references is not served

An attachment that no Markdown file in the corpus references SHALL NOT be served to any session. Being stored under the corpus directory SHALL NOT by itself make a file retrievable.

#### Scenario: A file sits in the corpus unreferenced

- **WHEN** any session requests a file under the corpus directory that no page references, for example an exercise's solution code
- **THEN** it is not served

#### Scenario: Storing a file is not enough

- **WHEN** a file is copied into the corpus directory and no page references it
- **THEN** no session is served it, also not after the next scan

### Requirement: Unreferenced attachments are reported so they can be removed

After the initial scan and after every later scan, the application SHALL log the attachments no page references: one line per attachment with its path relative to the corpus directory, followed by one line with their count. The paths are corpus file paths and SHALL be the only thing the lines name. The same list SHALL be held in process, sorted by path, together with the time of the scan that produced it, so that a later reader in the application, for example a teacher admin page, can read it without scanning again. The list SHALL be exactly the set of attachments the access rule treats as unreferenced, so what the log reports and what the gate refuses as unreferenced never disagree.

#### Scenario: The initial scan reports unreferenced attachments

- **WHEN** the application starts and its initial scan finds `md/assets/old.pdf` and `md/ex/Solution.java` referenced by no page
- **THEN** the log holds one line naming each of the two paths, and one line saying that 2 attachments are unreferenced

#### Scenario: A rescan updates the report

- **WHEN** a page that embeds `md/assets/old.pdf` is added and a scan follows
- **THEN** the next report no longer names `md/assets/old.pdf`
- **AND** the list held in process no longer contains it, and carries the time of that scan

#### Scenario: Nothing is unreferenced

- **WHEN** a scan finds every attachment referenced
- **THEN** the log holds the count line saying 0, and no path lines
- **AND** the list held in process is empty

#### Scenario: Report and gate agree

- **WHEN** a path is in the list held in process
- **THEN** a request for it is not served to any session

### Requirement: A refused attachment is indistinguishable from a missing one

A request for an attachment the session may not be served SHALL be answered exactly as a request for a path under the corpus directory where no file exists. The answer SHALL NOT reveal whether the file exists, whether it is referenced, or which role would grant it.

#### Scenario: Refused versus missing

- **WHEN** a session requests one attachment it may not be served and one path where no file exists
- **THEN** both answers have the same status, the same headers apart from their dates, and the same body

### Requirement: An attachment reference resolves the way the page renders it

Which attachment a reference addresses SHALL be decided the same way for serving as for rendering. A reference the rendered page does not turn into an embed or a link, because it names no attachment or names a basename that exists in several folders without saying which, SHALL grant no attachment.

#### Scenario: An ambiguous basename

- **WHEN** a page embeds `![[diagram.png]]`, and files named `diagram.png` exist in two folders
- **THEN** the rendered page shows no image for that embed
- **AND** that embed makes neither of the two files servable

#### Scenario: A relative path in a Markdown image

- **WHEN** a page at `md/folder/page.md` contains `![x](img/a.png)`
- **THEN** the reference addresses `md/folder/img/a.png`, the file the browser requests for it

### Requirement: Only the corpus grants attachments

Only a file in the corpus SHALL make an attachment servable. Markdown from any other source that the application renders SHALL NOT, whatever it references and however it renders. Today the only such source is the conversion route `/convert`, which the change `remove-convert-route` removes. This requirement holds whether that route still exists or not, and holds for any renderer of non-corpus Markdown added later.

#### Scenario: Non-corpus Markdown names an attachment

- **WHEN** the application renders Markdown for a session that is not a file in the corpus and embeds an attachment referenced nowhere the session may see
- **THEN** a later request for that attachment by the same session is not served

### Requirement: A change in visibility reaches attachments within a bounded time

When a reference is removed, or the directive or block around it is tightened, an attachment that relied on it SHALL stop being served to the sessions that lose it within a fixed lifetime of at most ten minutes. When a time window around a reference closes, the attachment SHALL stop being served from that moment on, just as the block disappears from the rendered page. A relaxed restriction or a new reference SHALL take effect no later than the next request for the page that now carries it.

#### Scenario: A teacher removes the only public reference

- **WHEN** a student has opened a page embedding an image, and the teacher then moves that embed into a `@@@ teacher` block
- **THEN** within ten minutes the student is no longer served the image

#### Scenario: A time window closes

- **WHEN** a block with a time window references an attachment, and the window closes
- **THEN** a session that could see the block only through the window is no longer served the attachment

### Requirement: Attachment responses are private to the browser

A served attachment SHALL carry caching directives that forbid storing it in a cache shared between users. The requesting browser MAY keep its own copy.

#### Scenario: A shared proxy sits in front of the deployment

- **WHEN** an attachment is served to one session
- **THEN** the response forbids a shared cache from storing it, so no other session is answered from that copy
