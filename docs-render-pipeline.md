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
  if (does the first line carry a permission directive?) then (yes)
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
}

partition #AliceBlue "preParse (obsidian.js) - still Markdown" {
  :removeForbiddenContent;
  note right
    A thin caller of filterForbiddenSegments, which
    returns the surviving passages as a list. This one
    joins them; the corpus search is the other caller
    and matches inside each passage separately.
  end note
  :preReplaceEmbeds;
  note right
    safelearn-<kind> blocks become the exam module's
    placeholder, a teacher notice, or nothing.
  end note
  :preReplacePlantUml;
  :preReplaceMermaid;
  :preMarkCode;
  :preReplaceObsidianFileLinks;
  :preMarkCallouts;
  :preprocessFragments;
  :preprocessSideBySide;
  :unmarkCode;
  note right
    preMarkCode lifts every code block out of the text
    and unmarkCode puts it back at the end, so the four
    steps between them cannot rewrite anything a reader
    asked to be shown verbatim.
  end note
}

partition #WhiteSmoke "Markdown becomes HTML (app.js)" {
  if (the reader's own dm preference?) then (dark)
    :markedDark.parse;
  else (light)
    :markedLight.parse;
  endif
  note right
    The two differ only in the Shiki
    theme they highlight code with.
  end note
}

partition #Lavender "manipulateHtml (obsidian.js) - now HTML" {
  :replacePreMarkCallouts;
  :replaceObsidianImageLinks;
  :replaceObsidianImageAltResizeValues;
  :postprocessFragments;
  :makeContentMap;
}

:DOMPurify.sanitize(html); <<#FFE4E1>>

partition #Honeydew "Wrapping for the destination (app.js)" {
  switch (how was the page asked for?)
  case (?reveal)
    :splitForReveal;
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
3. The first line is examined for a file-permission directive. If it carries one, `resolveFileVisibility` decides whether this caller may see the file at all - by the same rule, and through the same implementation, that the navigation tree applies - and the directive line is then dropped from the content.
4. `preParse` is called preparing the content for HTML-conversion
	1. `removeForbiddenContent` parses for inline permissions and removes forbidden parts of the file. It does that by calling `filterForbiddenSegments`, which returns the passages that survive **as a list**, each with the offset in the original Markdown it was taken from; `removeForbiddenContent` is the caller that joins them, and the rendered page is what it always was. The list is not an implementation detail to be tidied away by joining earlier: removing a block makes the text before it and the text after it adjacent, and a caller reading the joined form can find a term across that seam — a term nobody wrote. The corpus search is the second caller and matches inside each passage separately, so it cannot. Anything else that comes to need filtered Markdown should take the list for the same reason.
	2. `preReplaceEmbeds` replaces every top-level fenced block tagged `safelearn-<kind>` with what its kind renders to: the exam module's placeholder when the module is active and has a handler for the kind, otherwise a short notice for a session acting as a teacher, or nothing. It runs after the permission filter, so a block in a hidden section is already gone, and before `preMarkCode`, so the block is not parked as code. The presentation and document views make it use the notice-or-nothing behaviour. See [the exam module](docs-exam-module.md).
	3. `preReplacePlantUml` replaces the code tags containing PlantUML-code with a rendered version of it by calling a proper PlantUML conversion service and inserting the SVG of that output here instead of the code-tags
	4. `preReplaceMermaid` replaces the code tags containing Mermaid-code with the `pre` element the client-side renderer looks for. Unlike PlantUML, Mermaid is drawn in the browser and not by a service.
	5. `preMarkCode` parses the file for code-marks (cannot be nested) and replaces them for later use of the marks (the content of the code-tags parsed is saved in an array for later insertion)
	6. `preReplaceObsidianFileLinks` replaces Obsidian- (or Wiki-) style links with proper links your browser can understand. A name that is no Markdown page is looked up among the attachments the way an embed is (`resolveAttachment`), so a link to a PDF addresses the file; a name that is neither stays as written. Every address is percent-encoded. Links inside inline code are left alone here; fenced code is already parked by step 4.5. How the name is read - text after `|`, a leading `md/` - is `parseWikiLink`, which the attachment gate reads links with too, so a linked file is served exactly where the link is visible.
	7. `preMarkCallouts` parses for callouts (may be nested) and replaces their tags inline with appropriate start- and end-tags of our own
	8. `preprocessFragments` replaces every `##fragment` mark with an internal one that `postprocessFragments` picks up again once the HTML exists
	9. `preprocessSideBySide` expands a side-by-side block into its column elements, keeping the blank lines that let the Markdown inside them still be parsed. It opens on `##side-by-side-start`, divides columns on `##separator`, and runs to the matching end marker - which this page deliberately does not spell out, because it is rendered by the very pipeline it describes and inline backticks are no protection against these steps. A fenced block is, which is where [the Obsidian document](docs-obsidian) writes the markers out in full.
	10. `unmarkCode` replaces the code-marks by the content of the previously saved array
5. `marked` converts the Markdown to HTML. Which of the two instances does it follows the reader's own dark-mode preference out of the access token; `markedDark` and `markedLight` differ in the Shiki theme they highlight code with.
6. `manipulateHtml` is called working over the converted HTML
	1. `replacePreMarkCallouts` renders the proper callouts pre-marked earlier on
	2. `replaceObsidianImageLinks` deals with the Obsidian- (or Wiki-) specific embeds (shortform) by expanding each into the element for its kind of attachment, addressed by its percent-encoded path: an image, a video or audio player, or a link for anything else. A PDF becomes a placeholder (`div.sl-pdf` with its address and any size in `data-*` attributes, around a link to it), because the sanitizer in step 7 removes every `iframe`. The page and the presentation include a small script, `getPdfEmbedScript`, that turns each placeholder into the browser's PDF viewer above the link; the printable document does not include it and keeps the link.
	3. `replaceObsidianImageAltResizeValues` deals with the conditional image resizing described in the Obsidian-specific document [here](docs-obsidian)
	4. `postprocessFragments` turns the marks left by step 4.8 into the numbered fragments RevealJS reveals one at a time
	5. `makeContentMap` generates the map of the files' content later on displayed on the left navbar
7. `DOMPurify.sanitize` is called before sending the response to the client
8. The sanitized HTML is wrapped for wherever it is going. Each wrapper emits the `@font-face` block for the fonts this deployment ships, which is where the names a stylesheet has to use come from — see "Naming a font in a stylesheet" in [development](docs-development.md). The wrappers are: `splitForReveal` and then `wrapInReveal` for `?reveal`, `wrapAsDocument` for `?document`, and `wrapInPage` for everything else.
