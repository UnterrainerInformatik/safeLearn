Source: bug report by Gerald on 2026-10-20 ("Ein Wiki-Link auf ein PDF wird nicht gerendert. Weder im normalen View, noch in der Presentation."). No entry in `AI/open-proposals.md`.

## Why

A wiki link to a PDF shows nothing useful, neither on the page nor in the presentation. `[[file.pdf]]` stays on the page as raw text, because only `.md` targets become links, and the attachment gate does not count it as a reference either, so the PDF would be refused even if a link were drawn. `![[file.pdf]]`, the form the corpus uses (e.g. `diploma-thesis/Thesis - Info.md`), becomes a bare link with an unencoded path instead of showing the document the way Obsidian does.

## What Changes

- `[[name.pdf]]` and `[[name.pdf|text]]` become links to the PDF on the page and in the presentation. This holds for every attachment named by a wiki link, not only PDFs. Resolution works like embeds: a basename that exists in several folders needs its full path.
- A wiki link to an attachment counts as a reference to it, so the attachment gate serves the PDF wherever such a link is visible.
- `![[name.pdf]]` shows the PDF inline in a viewer (page and presentation), with a link to open or download it beneath. An optional size, as images use (`![[name.pdf|800x600]]`), sets the viewer's dimensions.
- The printable document view (`?document`) keeps the link only: an inline viewer does not print.
- Links and viewers address the PDF by its percent-encoded path, so names with spaces or umlauts work.

## Capabilities

### New Capabilities

- `attachment-rendering`: how a page and a presentation render wiki links and embeds that name an attachment that is not a Markdown page: a link for `[[…]]`, inline display for `![[…]]` of a PDF, and the fallback link.

### Modified Capabilities

- `attachment-access`: the requirement "An attachment is served where at least one of its references is visible" names the wiki link `[[…]]` explicitly among the forms of reference.

## Impact

- `obsidian.js`: `preReplaceObsidianFileLinks` (falls back to attachments), `extractAttachmentReferences` (new reference kind for `[[…]]`), `resolveAttachmentReference`, `getHtmlFor` (PDF branch, encoded URLs), the page and reveal client code that turns the PDF placeholder into a viewer.
- `css/`: size and border of the inline PDF viewer on the page and on a slide.
- `docs-obsidian.md`, `docs-render-pipeline.md`: PDF links and embeds.
- Tests: `test/attachments.test.js` (reference extraction, gate) and `test/content.test.js` (rendering on page, presentation, document).
- No API, database or catalog change. The sanitizer configuration stays as it is.
