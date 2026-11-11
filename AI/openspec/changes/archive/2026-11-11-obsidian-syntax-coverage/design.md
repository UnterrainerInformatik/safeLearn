## Context

See proposal.md for the motivation. The pipeline is described in `docs-render-pipeline.md`: preParse works on Markdown (`removeForbiddenContent` → embeds → PlantUML → Mermaid → `preMarkCode` … `unmarkCode`), then `marked` (two instances in `app.js`, light and dark, with `gfm` and `breaks`), then `manipulateHtml` on HTML, then DOMPurify, and for `?reveal` `splitForReveal`, which cuts slides at `h2` and `h3`.

### Findings (code check, 2026-11-11)

- **Heading links:** `parseWikiLink` only splits off `|text`. `[[Note#Heading]]` looks up `Note#Heading` in `mdFilesMap`, finds nothing and no attachment either, and stays as raw `[[…]]` text. `[[#Heading]]` has the same problem. Even a resolved link could not jump anywhere: `makeContentMap` gives every heading a fresh `uuidv4()` id on every render.
- **Note embeds:** `replaceEmbedsIn` only resolves through `resolveAttachment`, which reads `filesMap`. The scan puts `.md` files into `mdFilesMap` only, so `![[Note]]` always stays raw text.
- **`---` directly under text:** `splitForReveal` does not split at `<hr>`, only at `h2`/`h3`. `Text\n---` is a setext `h2` in CommonMark and Obsidian, so it starts a slide in safeLearn, and in Obsidian it shows as a heading too. The renderer agrees with what the author sees, so nothing changes here.
- **Footnotes and math:** as described in the backlog entry. `marked` 12 has neither.

### Reference behavior (Obsidian 1.15.0 reading view, 2026-11-11)

Probed with a scratch script on the Obsidian harness (`test/obsidian/harness.js`), on two documents written into the run's vault.

- **Footnotes:** `A[^src] B[^1] C^[inline] D[^src]` numbers 1, 2, 3, and the second `[^src]` shares 1. Matches the spec.
- **`$` rules:** `Kostet $5 und $10.`, `$x$5`, `$ a$` stay text, `\$x\$` shows `$x$`, `$a^2$` is typeset. `2^10` stays text. Matches the spec.
- **Block markers:** a trailing `^id` on a paragraph and on a list item is removed, and a `^id` line after a table is not shown. `![[Note#^tbl1]]` embeds exactly the table, `![[Note#^li1]]` exactly that list item inside a list. Matches the spec.
- **Section embed:** `![[Note#Alpha]]` inserts `## Alpha` with its `### Beta` and stops at the next `##`. Matches the spec.
- **Link text, difference:** `[[Note#Alpha#Beta]]` reads `Note > Alpha > Beta` (every segment, not only the last), and `[[Note#^para1]]` reads `Note > ^para1`. The spec's default text is adjusted to that; the target is still the last segment.
- **Reference without a definition, kept as specified:** Obsidian shows `E[^missing]` as `Emissing`, dropping the brackets and the caret. safeLearn keeps `[^missing]` as written: the dropped characters are Obsidian's markdown-it quirk, not something an author previews deliberately, and the visible brackets point the author to the missing definition.

## Goals / Non-Goals

**Goals:**
- One resolver for "note + optional heading or block" that wiki links and embeds share, as `parseWikiLink` is already shared between the renderer and the attachment gate.
- Deterministic heading and block anchors, independent of the reader where possible.
- Every new Markdown-level step respects code (`maskCode` / `preMarkCode`), as the existing steps do.

**Non-Goals:**
- MathJax parity. KaTeX covers what the corpus uses, and unsupported commands fall back to the error display.
- Obsidian's embed sizing or embed options (`![[Note|…]]`). The `|` part of a note embed is ignored.
- Transclusion in the search index, the plugin, or the exam module's question import.

## Decisions

### D1 Footnotes: `marked-footnote`, plus a preParse step for `^[…]`
`marked-footnote` (peer `marked >=7`) handles `[^label]` and definitions, including multi-line ones, numbering in order of use and back-links. It has no inline form, so a preParse step (after `preMarkCode`, before `unmarkCode`) rewrites each `^[text]` into a reference `[^inline-<n>]` and appends `[^inline-<n>]: text` at the end of the Markdown. The extension then numbers it among the others by first use. Bracket nesting in `^[…]` is matched with a balanced scan instead of a regex, so `^[see [[Note]]]` works.
*Alternative:* our own tokenizer for both forms. That means more code for no gain, because the extension's numbering is exactly Obsidian's.

**One `marked` per render:** the extension keeps its numbering counter and its "footnotes seen" flag in the closure `markedFootnote()` returns, and resets the counter only when it renders a reference. With one shared instance, a render that lexes while another awaits Shiki between its lexing and its rendering numbers its notes from where the other one stopped. So `app.js` builds a fresh `Marked` per render (`markedFor`), from the same options, the shared Shiki highlighter, and `obsidianMarkedExtensions()`; building one costs an object merge. *Changed during apply.*

**Presentation:** after `splitForReveal`, a DOM step moves each `<li>` of the footnotes section into a footnotes list at the bottom of the innermost `<section>` that holds its first reference. It then removes the original section and the empty slide it may leave. The page and document views keep the extension's list at the end.

**Embedded notes:** D5 prefixes the labels of inserted content (`[^e<k>-label]`) before insertion, so host and embedded `[^1]` stay distinct.

### D2 Math: KaTeX on the server, through a tokenizer of our own
`katex` renders on the server. The tokenizer is a small `marked` extension in `obsidian.js` (`mathExtension`), registered on every `marked` instance, with `throwOnError: false` and `output: "htmlAndMathml"`. Its inline rule is the spec's: an opening `$` not followed by whitespace, a closing `$` not preceded by whitespace and not followed by a digit, on one line; `$$…$$` is display math inline or as a block, across lines. A `$` preceded by an odd number of backslashes is not a candidate, so `\$` reaches `marked`'s own escape. DOMPurify's default profiles keep MathML and the `style` attributes KaTeX sets, and a unit test asserts that the typeset output survives `sanitizeHtml` unchanged. `katex/dist` is served under `/node_modules/katex/dist` behind `checkAuthenticated`, exactly like `mermaid/dist`, and `wrapInPage`, `wrapAsDocument` and `wrapInReveal` link `katex.min.css`.
*Changed during apply:* the plan was `marked-katex-extension`. Its standard rule demands whitespace before the opening `$` and whitespace or one of `?!.,:` after the closing one, so `($x$)`, `**$x$**` and `$x$-Achse` would stay raw, and its non-standard rule typesets `$5 und $`. Neither is Obsidian's rule. Without that extension the `katex` pin below 0.19 (its peer range) is gone too, and `katex` is `^0.19`.
*Alternative:* MathJax in the browser. It needs a client script in every view, renders after load (layout shifts on slides), and adds a client dependency the presentation view would have to carry.

**Corpus safety net:** before enabling, a one-off script renders every page of the three corpora (`safeLearn/md`, `secureLectures/md`, the vault) with and without the extensions and lists every page whose output gained `.katex` or a footnote section. The list is reviewed by hand. Where an author meant a literal `$`, the source gets `\$`. This is the only way to tell an intended formula from an accidental pair.

*Result (2026-11-11):* run over `safeLearn/md` (50 files), `secureLectures/md` (338) and the vault `~/nextcloud/secureLectures` (349). Outside the `test-*` fixtures of this change, no page gains a formula, a footnote, a block anchor or a heading link, and none embeds a note (so none with relative image paths). A grep of the vault for `[^`, `$…$` pairs, `[[…#…]]` and trailing `^id` finds only code (Java stack traces with `lambda$main$0`, regex classes like `[^abc]`, C#'s `list[^1]`). No source needs `\$`.

### D3 Heading anchors: slug from text, de-duplicated per rendering
`makeContentMap` replaces `uuidv4()` with `slugify(textContent)` according to the rule in `note-anchors`, and the content map is keyed by those slugs. `ROOT` stays as it is. The sidebar reads the keys as ids and does not care what they look like. The slug function is exported and shared with the link resolver (D4), so the two always agree.
De-duplication depends on which headings the reader sees. A link always targets the first heading with matching text (Obsidian's rule), and that one carries the bare slug for every reader who sees it, so the dependency only affects the second and later duplicates, which no link can address anyway.

### D4 One target resolver for links and embeds
`parseWikiLink` additionally returns `fragment`: whatever follows the first `#` of the name, with nested `A#B` reduced to the last segment, and a leading `^` marking a block. The name before `#` resolves as today. With an empty name, the target is the current page.
`preReplaceObsidianFileLinks` emits `url#<slug>` for a heading and `url#block-<id>` for a block. The heading's text goes through the same slugify, so no lookup in the target file is needed: a link to a heading that does not exist lands on the note's top, because the browser ignores an unknown fragment. That gives the spec's "links to the note itself" for free. Within the same page it emits only `#<slug>`.
Block anchors use the id `block-<id>`, because `^` in an id is awkward in CSS and in Reveal's hash.

**Presentation view:** Reveal 5 resolves a hash `#/<id>` with `getElementById(id).closest('.slides section')`, so any element id inside a slide already addresses that slide. A DOM step at the end of `splitForReveal` therefore only rewrites same-page `href="#x"` to `href="#/x"`; heading and block ids stay where the other views have them. *Changed during apply:* the plan copied ids onto the `<section>` and renamed the heading's own to `h-<id>`, which that lookup makes unnecessary. A heading whose anchor is all digits reads as a slide number to Reveal, and such a link shows that slide number instead (documented).

### D5 Block markers and note embeds at the Markdown level
**Block markers** (preParse, after `preMarkCode`): `(\s)\^([A-Za-z0-9-]+)[ \t]*$` at a line's end is replaced by an inline placeholder `<span data-block-anchor="id"></span>`. A line that holds only `^id` becomes a standalone placeholder paragraph. In `manipulateHtml`, each placeholder sets `id="block-<id>"` on its closest `p`/`li`, or, when it stands alone, on the previous element sibling, and is then removed. The placeholder is plain HTML that DOMPurify keeps (`data-*`), and it never reaches the output.

**Note embeds** run as a new preParse step directly after `removeForbiddenContent`. At that point the host's hidden blocks are gone, the host's code is not yet masked, and the code of the inserted text has not been touched yet. The step finds `![[…]]` outside code (`maskCode`), skips names that resolve to an attachment, and for a note:
1. reads it with the same reader as a page (`readCorpusFile` → `splitFrontmatter` → directive → `stripComments`),
2. decides the directive with `resolveFileVisibility(req, permissions)`; a refusal means "not resolvable",
3. filters with `removeForbiddenContent(text, req)`,
4. cuts out the section (by matching the heading text with the slug rule) or the block (the paragraph or list item ending in `^id`, or the block directly before a standalone `^id` line),
5. prefixes footnote labels (D1),
6. recurses into the result with depth + 1 and the chain of note paths so far.

The result replaces the embed, surrounded by blank lines so block syntax stays intact. "Not resolvable" leaves the embed text as it was, so a refused embed and a missing one are indistinguishable (as `attachment-access` requires for attachments). The later `replaceEmbedsIn` then leaves it alone, because no attachment matches.
Attachment grants need no change: the reference in the embedded note is already counted at its own place with its own visibility, and the embed inserts only what that same reader may see there.
*Alternative:* embedding at the HTML level by rendering the note separately. Footnote numbering, the Content list and slide splitting would then not see the inserted headings and notes, and the result would differ from Obsidian.

### D6 Order within preParse
`removeForbiddenContent` → **note embeds** → `preReplaceEmbeds` → PlantUML → Mermaid → `preMarkCode` → **inline footnotes** → **block markers** → wiki links (with fragments) → callouts → fragments → side-by-side → `unmarkCode`. Embeds come first so that everything after them treats inserted text as the host's own. Block markers come before wiki links so a trailing `^id` is gone before anything else reads the line.

## Risks / Trade-offs

- [An accidental `$…$` pair in existing pages turns into a formula] → D2's corpus diff before activation, fixed with `\$` in the source.
- [Anchor ids change from uuid to slug; a bookmarked `#<uuid>` stops working] → uuids changed on every render anyway, so no working bookmark can exist.
- [Embedding multiplies render cost, because each embed reads, filters and recurses] → depth limit of 5. Files are read through the same reader as pages, and the corpus uses embeds sparingly. Measure on the demo page, and add caching only if needed.
- [A section embed misses footnote definitions that stand outside the section] → the reference then stays as written (spec "What is not a footnote"). Documented in `docs-obsidian.md`.
- [KaTeX lacks a command an author uses in Obsidian (MathJax)] → shown as an error, visible to the author on the first render. Documented.
- [Relative Markdown image paths inside an embedded note resolve against the host page] → the corpus uses `![[…]]` (resolved by name) almost exclusively. Documented as a limitation, and the corpus diff of D2 lists embedded notes with relative paths as well.

## Migration Plan

Deploy is a normal release. Rollback means reverting the commit: no data, no persisted ids. The corpus adjustments from D2 (`\$`) are harmless with or without the feature. Order: run the corpus diff, fix sources in all three corpora, then merge, then sync secureLectures as usual.
