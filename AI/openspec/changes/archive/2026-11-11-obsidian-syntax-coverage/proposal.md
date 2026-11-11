Source: AI/open-proposals.md, entry **Weitere Obsidian-Syntax, die der Renderer nicht kennt** (all six items; item 6 is settled without a code change, see below).

## Why

Authors write the corpus in Obsidian and see it rendered there. Five pieces of Obsidian syntax that Obsidian renders reach `marked` unprocessed, so the page a student receives differs from the one the author previewed: footnote text disappears and turns into a wrong link, formulas show as raw LaTeX, block markers `^abc123` stand visibly in the text, and links to headings, links to blocks and note embeds stay as raw `[[…]]` / `![[…]]` text. Checked against the code on 2026-11-11 (see design, "Findings"). They are proposed together because links, block references and embeds share one piece of machinery, which is resolving a note, a heading or a block by name.

## What Changes

- **Footnotes.** `[^label]` with a definition `[^label]: text` and the inline form `^[text]` render as numbered, linked superscripts. The notes are collected at the end of the page and the document, and in the presentation they appear on the slide that references them. A reference without a definition stays as written.
- **Math.** `$…$` (inline) and `$$…$$` (display) are typeset server-side with KaTeX and follow Obsidian's rules for delimiters, so `$5 und $10` and `$` inside code stay text. A formula that does not parse shows its source, marked as an error, and does not break the page. KaTeX's stylesheet and fonts are served by the application itself.
- **Stable heading anchors.** Every heading gets an anchor derived from its text, which replaces today's random id. The Content list keeps working on these anchors.
- **Links to headings and blocks.** `[[Note#Heading]]`, `[[#Heading]]`, `[[Note#^id]]` and `[[#^id]]`, each also with `|text`, link to that place: in the page and document views via the anchor, and in the presentation to the slide that holds it. A heading or block that does not exist links to the note itself, as in Obsidian.
- **Block references.** A trailing `^id` on a paragraph or list item, or `^id` on its own line after a block, is removed from the visible text and becomes that block's anchor.
- **Note embeds.** `![[Note]]`, `![[Note#Heading]]` and `![[Note#^id]]` insert the named note, section or block in place. The embedded note is subject to its own whole-file directive and inline `@@@` blocks for the reader of the host page, and an embed the reader may not see renders exactly like an embed of a note that does not exist. Embeds nest up to a fixed depth, and a cycle stops.
- **Item 6 (`---` directly under text): no change.** Slides are split at `h2`/`h3`, not at `---`. A line of text directly above `---` is a setext heading in CommonMark and in Obsidian alike, so safeLearn already renders what the author sees in Obsidian.
- A file that uses none of this syntax renders exactly as before, apart from its heading anchor ids.

## Capabilities

### New Capabilities
- `footnote-rendering`: footnote references, definitions and inline footnotes; their numbering and placement in the three views.
- `math-rendering`: delimiters, what is not math, typesetting, errors, and the self-hosted stylesheet and fonts.
- `note-anchors`: stable heading anchors, block references `^id`, and wiki links to headings and blocks in the three views.
- `note-embedding`: `![[Note]]` with section and block forms, permissions of the embedded note, nesting and cycles, and how embeds relate to search and attachment access.

### Modified Capabilities
- `page-navigation`: the Content list addresses headings by their stable anchors, so a link to a heading is the same for every reader and every render.

## Impact

- `obsidian.js`: new preParse steps (inline footnotes, block markers, note embeds), `parseWikiLink` splits off `#heading` / `#^id`, `preReplaceObsidianFileLinks` emits anchors, `makeContentMap` emits slug ids, a post-split step for reveal (footnotes per slide, anchors on sections).
- `app.js`: builds its `marked` per render with `marked-footnote` and the math extension, and serves `katex/dist` the way `mermaid/dist` is served. The wrappers link the KaTeX stylesheet.
- Dependencies: `marked-footnote` and `katex`.
- Corpus: new demo pages under `md/` for each feature, plus a check that no existing page gains math or footnotes it did not mean (see design D2).
- Docs: `docs-obsidian.md` and `docs-render-pipeline.md`.
- Tests: unit tests per feature, content checks per feature and view, entries in `test/coverage-map.json`.
- Out of scope: the Obsidian plugin (Obsidian renders all of this itself), search over embedded content (it is found in its source note), and Obsidian's own heading-link aliases beyond what is specified here.
