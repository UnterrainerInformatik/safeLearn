## Purpose

Defines how the page view and the presentation view render Obsidian-style wiki links and embeds that name an attachment, a file in the corpus that is not a Markdown page, such as a PDF.

## ADDED Requirements

### Requirement: A wiki link to an attachment renders as a link

A wiki link `[[name]]` or `[[name|text]]` whose target is not a Markdown page but resolves to an attachment SHALL render as a link to that attachment, in the page view, the presentation view and the document view. The link text SHALL be `text` when given and the name as written otherwise. The target SHALL resolve exactly as an embed of the same name does: by basename, and by full path where the basename exists in several folders. A wiki link that resolves to neither a Markdown page nor an attachment SHALL stay as written, as it does today. A wiki link to a Markdown page SHALL render as before.

#### Scenario: Link to a PDF

- **WHEN** a page contains `[[handout.pdf]]` and `md/assets/handout.pdf` exists
- **THEN** the page view shows a link with the text `handout.pdf` that opens `md/assets/handout.pdf`
- **AND** the presentation view shows the same link on its slide

#### Scenario: Link with its own text

- **WHEN** a page contains `[[handout.pdf|Arbeitsblatt]]`
- **THEN** the link reads `Arbeitsblatt` and opens the PDF

#### Scenario: Ambiguous basename

- **WHEN** a page contains `[[handout.pdf]]` and files named `handout.pdf` exist in two folders
- **THEN** no link is rendered and the text stays as written
- **AND** `[[a/handout.pdf]]` renders a link to the copy in `a/`

#### Scenario: Name with spaces and umlauts

- **WHEN** a page links or embeds `5CHIF mündliche RDP 1.pdf`
- **THEN** the rendered link addresses the file by its percent-encoded path and requesting it is served the PDF

### Requirement: An embedded PDF is shown inline

An embed `![[name.pdf]]` that resolves to a PDF SHALL show the document inline in the page view and in the presentation view, together with a link to the PDF that opens it on its own. A size given as for images (`![[name.pdf|W]]`, `![[name.pdf|WxH]]`) SHALL set the dimensions of the inline display; without one it SHALL fill the width of the content and have a fixed, readable height. Where the browser cannot display a PDF inline, the link SHALL still be there. The document view SHALL show the link only.

#### Scenario: Embed on a page

- **WHEN** a page contains `![[Begleitprotokoll-schüler.pdf]]`
- **THEN** the page view shows the PDF inline and a link to it

#### Scenario: Embed in the presentation

- **WHEN** the same page is opened with `?reveal`
- **THEN** the slide holding the embed shows the PDF inline and a link to it

#### Scenario: Embed with a size

- **WHEN** a page contains `![[handout.pdf|600x400]]`
- **THEN** the inline display is 600 by 400 pixels

#### Scenario: Printable document

- **WHEN** a page with `![[handout.pdf]]` is opened with `?document`
- **THEN** it shows a link to the PDF and no inline display

#### Scenario: Embed written as code

- **WHEN** `![[handout.pdf]]` or `[[handout.pdf]]` stands inside inline or fenced code
- **THEN** it is shown verbatim and rendered as neither link nor viewer
