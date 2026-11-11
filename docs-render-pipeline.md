# Render Pipeline
Here you can find how a Markdown file becomes the HTML a reader's browser receives, and why the steps run in the order they do.

[Back](README.md) to the main page.
## The Shape Of It
One line runs through all of it: everything up to `marked.parse` works on Markdown text, everything after it works on HTML. That split is what fixes the order of the steps. A step that has to see a fenced code block, an Obsidian link or a callout marker belongs before the conversion; a step that has to see an `<img>` or a heading element belongs after it.

```plantuml
title Render pipeline - from Markdown to the HTML the browser receives

start

:checkAuthenticated;
note right
  The page handler sits behind this gate.
end note

:fs.readFile the .md path from disk;

partition #MistyRose "May this caller see it? (app.js)" {
  :refreshAccessToken(req);
  note right
    Roles and attributes are re-read here, so every
    permission decision below judges the current token.
  end note
  :splitFrontmatter - strip the properties block;
  note right
    An Obsidian frontmatter block at the very top is
    split off before anything else reads the file. Its
    properties travel with the render to the wrapper.
  end note
  if (does the first line of the body carry a permission directive?) then (yes)
    :resolveFileVisibility(req, permissions);
    :drop that first line;
    note right
      A caller without the roles, or a file outside its
      time window, throws here. The refusal text then
      travels on in place of the content and is wrapped
      like any other page.
    end note
  else (no)
  endif
  :stripComments - remove Obsidian comments;
  note right
    Only after the directive is decided, so a comment
    can neither hide nor move it. Code keeps its marks.
  end note
}

partition #AliceBlue "preParse (obsidian.js) - still Markdown" {
  :removeForbiddenContent;
  note right
    A thin caller of filterForbiddenSegments, which
    returns the surviving passages as a list. This one
    joins them; the corpus search is the other caller
    and matches inside each passage separately.
  end note
  :preReplaceNoteEmbeds;
  note right
    Note embeds insert the named note, section or
    block, read and filtered for this reader as if
    opened on its own; recursive, five levels at most.
  end note
  :preReplaceEmbeds;
  note right
    safelearn-<kind> blocks become the exam module's
    placeholder, a teacher notice, or nothing.
  end note
  :preReplacePlantUml;
  :preReplaceMermaid;
  :preMarkCode;
  :preReplaceInlineFootnotes;
  :preReplaceBlockMarkers;
  :preReplaceObsidianFileLinks;
  :preMarkCallouts;
  :preprocessFragments;
  :preprocessSideBySide;
  :unmarkCode;
  note right
    preMarkCode lifts every code block out of the text
    and unmarkCode puts it back at the end, so the
    steps between them cannot rewrite anything a reader
    asked to be shown verbatim.
  end note
}

partition #WhiteSmoke "Markdown becomes HTML (app.js)" {
  :markedFor - a marked built for this render;
  note right
    Highlights, footnotes (marked-footnote) and math
    (KaTeX), and Shiki in the theme of the reader's
    dm preference. One per render, because the
    footnote extension keeps its numbering in it.
  end note
  :marked.parse;
}

partition #Lavender "manipulateHtml (obsidian.js) - now HTML" {
  :replacePreMarkCallouts;
  :replaceObsidianImageLinks;
  :replaceObsidianImageAltResizeValues;
  :postprocessFragments;
  :applyBlockAnchors;
}

:DOMPurify.sanitize(html); <<#FFE4E1>>

:anchorHeadings - stable heading ids, Content list;
note right
  After the sanitizer, which drops an id naming a
  property of document ("images", "links").
end note

partition #Honeydew "Wrapping for the destination (app.js)" {
  switch (how was the page asked for?)
  case (?reveal)
    :splitForReveal;
    note right
      Ends with finishForReveal: footnotes move to the
      slide of their first reference, #x links become #/x.
    end note
    :wrapInReveal;
  case (?document)
    :wrapAsDocument;
  case (plain page)
    :wrapInPage;
  endswitch
}

:send the response;

stop
```
## The Steps In Order
1. The Markdown is obtained (`app.js`). A path ending in `.md` is read from disk, behind `checkAuthenticated`. That is the only source: the application renders its own corpus files and nothing a request supplies or names.
2. Accesstoken is refreshed, so it and all contained roles and attributes are actually current
3. The frontmatter is split off (`splitFrontmatter` in `obsidian.js`). Obsidian keeps a note's properties in a YAML block at the top of the file: a first line `---` (after a leading byte-order or zero-width mark, which is dropped as well) up to the first later line `---`, trailing blanks and a `\r` ending allowed on either. That block is removed before any other step sees the file, and its lines are never rendered in any view. It is parsed with YAML's core schema, so a date stays the string the author wrote; a block that cannot be read as a mapping of names to values is stripped all the same, the file then has no properties, and the server log names the file. A `---` anywhere else, or an opening `---` that is never closed, is not frontmatter and is left as it always was. Every other read of a corpus file - the scan's index, search, the attachment check and the exam handout - starts with the same call, so all of them see the same body.
4. The first line of the body is examined for a file-permission directive. Because the frontmatter is already gone, that is the line right after the block when the file has one. If it carries one, `resolveFileVisibility` decides whether this caller may see the file at all - by the same rule, and through the same implementation, that the navigation tree applies - and the directive line is then dropped from the content.
5. Obsidian comments are removed (`stripComments` in `obsidian.js`). Obsidian hides everything between two `%%` marks when reading, and authors use that for notes to themselves; no reader may see one. There are two kinds, as in Obsidian. A `%%` that begins a line (after whitespace, a `>` or a list marker at most) opens a block comment, which runs to the next `%%` wherever it stands, across blank lines, rules and code blocks, and to the end of the file when none follows. Any other `%%` opens an inline comment, which closes at the next `%%` on the same line; without one it is plain text and stays as written. A `%%` inside inline code or a fenced block (backticks or tildes, Mermaid included) is no mark at all: the marks are looked for in `maskCode`'s masking of the text, the same notion of code the attachment check uses, and the comments are cut from the original. This runs after step 4 on purpose: the directive is read from the first line as written, so a comment at the top can neither hide it nor move it off line 1. And it runs before everything else, so a `@@@` block or a heading inside a comment has no effect. The scan's index, search, the attachment check and the exam handout remove comments at the same point, so a comment is never matched, never quoted in a snippet, and an attachment that only a comment names is not served on the strength of that page.
6. `preParse` is called preparing the content for HTML-conversion
	1. `removeForbiddenContent` parses for inline permissions and removes forbidden parts of the file. It does that by calling `filterForbiddenSegments`, which returns the passages that survive **as a list**, each with the offset in the original Markdown it was taken from; `removeForbiddenContent` is the caller that joins them, and the rendered page is what it always was. The list is not an implementation detail to be tidied away by joining earlier: removing a block makes the text before it and the text after it adjacent, and a caller reading the joined form can find a term across that seam — a term nobody wrote. The corpus search is the second caller and matches inside each passage separately, so it cannot. Anything else that comes to need filtered Markdown should take the list for the same reason.
	2. `preReplaceNoteEmbeds` replaces each note embed (`![[Note]]`, `![[Note#Heading]]`, `![[Note#^id]]`) with what it names, as this reader may see it when opening that note on its own: the note is read like a page (`readNoteForSession`: frontmatter split off, whole-file directive decided by `resolveFileVisibility` and removed, comments stripped, `removeForbiddenContent`), then the section (`sectionOf`, matched by the heading's anchor) or block (`blockOf`) is cut out, its footnote labels get a prefix of their own so they cannot meet the host's, and the step recurses into the result. It stops at five levels and at a note already on the chain, which starts with the page itself. Anything it cannot resolve - a missing or refused note, heading or block, an attachment embed, an embed in code - is left exactly as written, so a refused embed reads like a missing one. It runs directly after the permission filter, so an embed inside a hidden block of the host is already gone, and before everything else, so every later step treats inserted text as the host's own. See [Obsidian](docs-obsidian.md#embedding-notes).
	3. `preReplaceEmbeds` replaces every top-level fenced block tagged `safelearn-<kind>` with what its kind renders to: the exam module's placeholder when the module is active and has a handler for the kind, otherwise a short notice for a session acting as a teacher, or nothing. It runs after the permission filter, so a block in a hidden section is already gone, and before `preMarkCode`, so the block is not parked as code. The presentation and document views make it use the notice-or-nothing behaviour. See [the exam module](docs-exam-module.md).
	4. `preReplacePlantUml` replaces the code tags containing PlantUML-code with a rendered version of it by calling a proper PlantUML conversion service and inserting the SVG of that output here instead of the code-tags
	5. `preReplaceMermaid` replaces the code tags containing Mermaid-code with the `pre` element the client-side renderer looks for. Unlike PlantUML, Mermaid is drawn in the browser and not by a service.
	6. `preMarkCode` parses the file for code-marks (cannot be nested) and replaces them for later use of the marks (the content of the code-tags parsed is saved in an array for later insertion)
	7. `preReplaceInlineFootnotes` rewrites each inline footnote into a reference with a generated label and appends its definition at the end, so `marked-footnote` numbers it among the referenced ones by first use. Its brackets are matched by counting, so a wiki link inside one survives.
	8. `preReplaceBlockMarkers` replaces each block marker - a `^id` ending a line, or standing on a line of its own - with an empty placeholder element that `applyBlockAnchors` turns into the block's id once the HTML exists. A marker on its own line becomes a paragraph of its own between blank lines, so a table above it cannot take it for a row. It runs before the wiki links, so a trailing marker is gone before anything else reads the line.
	9. `preReplaceObsidianFileLinks` replaces Obsidian- (or Wiki-) style links with proper links your browser can understand. Whatever follows the first `#` names a place in the target (`parseWikiLink` returns it as `fragment`, the last of several segments): a heading becomes `#` plus the heading's anchor (`slugify`, the same rule `anchorHeadings` gives headings, so no lookup in the target is needed and a heading that does not exist simply lands on the note's top), a block becomes `#block-<id>`, and a link with nothing before the `#` addresses the same page. A name that is no Markdown page is looked up among the attachments the way an embed is (`resolveAttachment`), so a link to a PDF addresses the file; a name that is neither stays as written. Every address is percent-encoded. Links inside inline code are left alone here; fenced code is already parked by step 6.6. How the name is read - text after `|`, a leading `md/` - is `parseWikiLink`, which the attachment gate reads links with too, so a linked file is served exactly where the link is visible.
	10. `preMarkCallouts` parses for callouts (may be nested) and replaces their tags inline with appropriate start- and end-tags of our own
	11. `preprocessFragments` replaces every `##fragment` mark with an internal one that `postprocessFragments` picks up again once the HTML exists
	12. `preprocessSideBySide` expands a side-by-side block into its column elements, keeping the blank lines that let the Markdown inside them still be parsed. It opens on `##side-by-side-start`, divides columns on `##separator`, and runs to the matching end marker - which this page deliberately does not spell out, because it is rendered by the very pipeline it describes and inline backticks are no protection against these steps. A fenced block is, which is where [the Obsidian document](docs-obsidian) writes the markers out in full.
	13. `unmarkCode` replaces the code-marks by the content of the previously saved array
7. `marked` converts the Markdown to HTML. `markedFor` builds one for this render: the options, `obsidianMarkedExtensions` (highlights, `marked-footnote`, and `mathExtension`, which typesets formulas with KaTeX by Obsidian's `$` rule), and Shiki in the theme of the reader's own dark-mode preference. It is built per render rather than shared, because `marked-footnote` keeps its numbering in the extension, and a render that lexes while another waits for Shiki would continue the other's count. The footnotes' heading for screen readers and the back-link's label come from the i18n catalog. KaTeX's output loses its `<semantics>` wrapper, its TeX annotation and two `<mtable>` layout attributes right where it is made, because DOMPurify's MathML profile refuses them; the sanitizer then passes formulas unchanged. Its stylesheet and fonts are served from `/node_modules/katex/dist` and linked by all three wrappers.
8. `manipulateHtml` is called working over the converted HTML
	1. `replacePreMarkCallouts` renders the proper callouts pre-marked earlier on
	2. `replaceObsidianImageLinks` deals with the Obsidian- (or Wiki-) specific embeds (shortform) by expanding each into the element for its kind of attachment, addressed by its percent-encoded path: an image, a video or audio player, or a link for anything else. A PDF becomes a placeholder (`div.sl-pdf` with its address and any size in `data-*` attributes, around a link to it), because the sanitizer in step 9 removes every `iframe`. The page and the presentation include a small script, `getPdfEmbedScript`, that turns each placeholder into the browser's PDF viewer above the link; the printable document does not include it and keeps the link.
	3. `replaceObsidianImageAltResizeValues` deals with the conditional image resizing described in the Obsidian-specific document [here](docs-obsidian)
	4. `postprocessFragments` turns the marks left by step 6.11 into the numbered fragments RevealJS reveals one at a time
	5. `applyBlockAnchors` turns the placeholders of step 6.8 into ids: a marker that ended a paragraph or list item names it, one on its own line names the element before it. Every placeholder is removed.
9. `DOMPurify.sanitize` is called before sending the response to the client
	1. `anchorHeadings` then gives every heading its stable anchor and leaves the map of the file's headings on the request, where the left navbar of the same page reads it. An anchor is the heading's text, lowercased, whitespace as `-`, everything but letters, digits, `-` and `_` removed; an equal heading later on gets `-2`, `-3`. It runs after the sanitizer because DOMPurify drops an id that names a property of `document` (its guard against DOM clobbering), and a heading called "Images" would lose its anchor. The map is not shared between requests: a page rendered for another reader at the same time cannot change it, and a page that renders no Markdown of its own shows no Content list at all
10. The sanitized HTML is wrapped for wherever it is going. Each wrapper emits the `@font-face` block for the fonts this deployment ships, which is where the names a stylesheet has to use come from — see "Naming a font in a stylesheet" in [development](docs-development.md). The wrappers are: `splitForReveal` and then `wrapInReveal` for `?reveal` (`splitForReveal` ends with `finishForReveal`, which moves each footnote to the slide of its first reference and rewrites links within the page from `#x` to `#/x`, which Reveal resolves to the slide holding `x`), `wrapAsDocument` for `?document`, and `wrapInPage` for everything else. `wrapInReveal` also carries the deck's fit script: in the browser it measures the current slide with all its fragments and, only when the slide is larger than the deck, shrinks it with the CSS `scale` property (the rule is in [Obsidian](docs-obsidian.md#every-slide-fits-the-screen)); a slide that fits gets no style and no class. The file's properties from step 3 reach the wrappers with the HTML (`sanitizeAndParseMarkdown` returns both, not via `req`, since an embed may render another file in the same request), but only for a file the caller may see. A `header` or `footer` property holding text or a number is shown, escaped, above and below the content by `wrapInPage` and `wrapAsDocument`, and by `wrapInReveal` as one overlay each at the top and bottom of the viewport - so on every slide, and cloned onto every page in the print view. A list, a mapping or an empty value shows nothing. `wrapInPage` alone also offers a button in the top bar that opens the file's properties as a message, every value as text; a file without properties gets no button.
