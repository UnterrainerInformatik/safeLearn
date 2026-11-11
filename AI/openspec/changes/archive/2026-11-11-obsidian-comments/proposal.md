Source: AI/open-proposals.md, entry **Weitere Obsidian-Syntax, die der Renderer nicht kennt**, item 1 (comments `%%…%%`). Items 2-7 of that entry stay in the backlog.

## Why

Obsidian lets an author write comments between two `%%` marks, inline (`Text %%note%% Text`) or as a block over several lines. Obsidian hides them when reading, so authors use them for notes to themselves: "add an example here", "Solution: 42", passages they have commented out. safeLearn does not know the syntax and passes it to `marked` as plain text, so every comment shows up in the page view, the document view, the presentation and the search snippets. A teacher's note to self reaches every student who can open the page.

## What Changes

- A comment follows Obsidian's two kinds. A `%%` at the start of a line opens a block comment up to and including the next `%%`, across lines, or to the end of the file if none follows. Any other `%%` opens an inline comment that closes on the same line, and is plain text if it does not (see design D3).
- `%%` inside inline code or a fenced code block is not a comment marker and stays as written. That covers Java format strings (`"%.1f%%"`), Windows scripts (`mvnw.cmd`) and Mermaid's own `%%` comments inside a `mermaid` block.
- Comments are removed from every read of a corpus file, right after the whole-file `@@@` directive is decided and before anything else: inline permission blocks, rendering in all three views, exam handouts, search (index and answers) and the check whether a page references an attachment. A comment is therefore never rendered, never matched by search, never quoted in a snippet, and an attachment that only a comment mentions is not served through that page.
- A file without comments renders, searches and gates exactly as before.

## Capabilities

### New Capabilities
- `obsidian-comments`: what an Obsidian comment is, how code protects `%%`, where in the reading of a file comments are removed, and that no view, search or attachment check sees them.

### Modified Capabilities
<!-- None: rendering, search, permissions and attachment access keep their requirements; they now apply to the file with its comments removed, as `frontmatter-properties` did for the frontmatter. -->

## Impact

- `obsidian.js`: a new exported `stripComments(markdown)`, built on the existing `maskCode` so code is recognized exactly as the attachment check already recognizes it. Called in `readCorpusFile`, `answerFromFile` and `referencesVisibly`.
- `app.js`: `sanitizeAndParseMarkdown` and `renderHandout` call it after the directive is dropped.
- `docs-render-pipeline.md`, `docs-search.md` and the Obsidian document (`docs-obsidian`): the new step. These pages go through the same pipeline, so any `%%` they show has to stand in code.
- Tests: unit tests for `stripComments`; a content/browser check with a fixture file that carries inline, block and unclosed comments plus `%%` in code, in all three views, search and the attachment check; entries in `test/coverage-map.json`.
- Out of scope: the Obsidian plugin (own repo; Obsidian already hides comments), escaping a `%%` outside code, and the other syntax items of the backlog entry.
