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
  Every one of the three entries below
  sits behind this gate.
end note

switch (where does the Markdown come from?)
case (a .md path)
  :fs.readFile from disk;
case (/convert with a url)
  :mdGetToHtml fetches it over HTTP;
case (POST /convert with content)
  :taken straight from the request body;
endswitch

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
  case (POST /convert)
    :no wrapping at all - the HTML
    is answered as the "html" field;
  endswitch
}

:send the response;

stop
```
## The Steps In Order
1. The Markdown is obtained (`app.js`). A path ending in `.md` is read from disk, `/convert` with a `url` fetches it over HTTP (`mdGetToHtml`), and `POST /convert` with `content` takes it from the request body. All three sit behind `checkAuthenticated`.
2. Accesstoken is refreshed, so it and all contained roles and attributes are actually current
3. The first line is examined for a file-permission directive. If it carries one, `resolveFileVisibility` decides whether this caller may see the file at all - by the same rule, and through the same implementation, that the navigation tree applies - and the directive line is then dropped from the content.
4. `preParse` is called preparing the content for HTML-conversion
	1. `removeForbiddenContent` parses for inline permissions and removes forbidden parts of the file. It does that by calling `filterForbiddenSegments`, which returns the passages that survive **as a list**, each with the offset in the original Markdown it was taken from; `removeForbiddenContent` is the caller that joins them, and the rendered page is what it always was. The list is not an implementation detail to be tidied away by joining earlier: removing a block makes the text before it and the text after it adjacent, and a caller reading the joined form can find a term across that seam — a term nobody wrote. The corpus search is the second caller and matches inside each passage separately, so it cannot. Anything else that comes to need filtered Markdown should take the list for the same reason.
	2. `preReplacePlantUml` replaces the code tags containing PlantUML-code with a rendered version of it by calling a proper PlantUML conversion service and inserting the SVG of that output here instead of the code-tags
	3. `preReplaceMermaid` replaces the code tags containing Mermaid-code with the `pre` element the client-side renderer looks for. Unlike PlantUML, Mermaid is drawn in the browser and not by a service.
	4. `preMarkCode` parses the file for code-marks (cannot be nested) and replaces them for later use of the marks (the content of the code-tags parsed is saved in an array for later insertion)
	5. `preReplaceObsidianFileLinks` replaces Obsidian- (or Wiki-) style links with proper links your browser can understand
	6. `preMarkCallouts` parses for callouts (may be nested) and replaces their tags inline with appropriate start- and end-tags of our own
	7. `preprocessFragments` replaces every `##fragment` mark with an internal one that `postprocessFragments` picks up again once the HTML exists
	8. `preprocessSideBySide` expands a side-by-side block into its column elements, keeping the blank lines that let the Markdown inside them still be parsed. It opens on `##side-by-side-start`, divides columns on `##separator`, and runs to the matching end marker - which this page deliberately does not spell out, because it is rendered by the very pipeline it describes and inline backticks are no protection against these steps. A fenced block is, which is where [the Obsidian document](docs-obsidian) writes the markers out in full.
	9. `unmarkCode` replaces the code-marks by the content of the previously saved array
5. `marked` converts the Markdown to HTML. Which of the two instances does it follows the reader's own dark-mode preference out of the access token; `markedDark` and `markedLight` differ in the Shiki theme they highlight code with.
6. `manipulateHtml` is called working over the converted HTML
	1. `replacePreMarkCallouts` renders the proper callouts pre-marked earlier on
	2. `replaceObsidianImageLinks` deals with the Obsidian- (or Wiki-) specific image links (shortform) by expanding that into a proper image-tag
	3. `replaceObsidianImageAltResizeValues` deals with the conditional image resizing described in the Obsidian-specific document [here](docs-obsidian)
	4. `postprocessFragments` turns the marks left by step 4.7 into the numbered fragments RevealJS reveals one at a time
	5. `makeContentMap` generates the map of the files' content later on displayed on the left navbar
7. `DOMPurify.sanitize` is called before sending the response to the client
8. The sanitized HTML is wrapped for wherever it is going. Each wrapper emits the `@font-face` block for the fonts this deployment ships, which is where the names a stylesheet has to use come from — see "Naming a font in a stylesheet" in [development](docs-development.md). The wrappers are: `splitForReveal` and then `wrapInReveal` for `?reveal`, `wrapAsDocument` for `?document`, and `wrapInPage` for everything else. `POST /convert` is the one caller that receives the HTML unwrapped, as the `html` field of its JSON answer.
