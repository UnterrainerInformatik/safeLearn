## Context

Every read of a corpus file already follows the same order (see `docs-render-pipeline.md`, steps 3-5). First `splitFrontmatter` takes off the properties. Then the body's first line is checked for the whole-file `@@@` directive, which is dropped if present. Then `filterForbiddenSegments` decides the inline blocks. Five places perform that order, each by hand:

| Read | Where |
|---|---|
| page, document and presentation view | `sanitizeAndParseMarkdown` (`app.js`) |
| exam handout | `renderHandout` (`app.js`) |
| search index (proposes candidates) | `readCorpusFile` (`obsidian.js`) |
| search answer (decides and quotes) | `answerFromFile` (`obsidian.js`) |
| attachment check | `referencesVisibly` (`obsidian.js`) |

There are two notions of "code" in `obsidian.js`. `preMarkCode` is render-only: it parks fenced blocks for `marked`, handles only backtick fences and ignores inline spans. `maskCode` blanks fenced blocks (backticks and tildes, closing rule per CommonMark) and inline spans, character for character, so offsets in the masked text are offsets in the original. The attachment check uses it to find references outside code.

## Goals / Non-Goals

**Goals:**
- One function decides what a comment is. All five reads call it at the same point in their order.
- "Code" for comments means exactly what it already means for attachment references.

**Non-Goals:**
- Refactoring the five reads into one shared "open a corpus file" helper. That would be worth doing, but it is a change of its own, and the frontmatter change deliberately left it alone too.
- Indented (four-space) code blocks. `maskCode` does not recognize them, and a `%%` in one is not worth a second definition of code.
- An escape for a literal `%%` outside code. Obsidian has none that we rely on, and code covers the real cases found in the corpus.

## Decisions

**D1: Comments are removed after the whole-file directive, before the inline blocks.**
The directive has to be read from the body's first line as written. If comments were removed first, a block comment at the top would leave an empty first line, and the directive behind it would no longer be on line 1. The file would then be silently ungated, which is the one outcome this project must never risk. Removing comments before `filterForbiddenSegments` means a `@@@` written inside a comment opens no block, and a comment that spans a block boundary cannot leave half a block behind.
*Alternative:* inside `preParse`, before `removeForbiddenContent`. That covers only the render. Search, the index and the attachment check would still see comments, so it would need the same call elsewhere anyway, at a different point in each read.

**D2: `stripComments(markdown)` finds the marks in `maskCode(markdown)` and cuts the ranges from the original.**
Both strings have the same length. The function scans the masked text for `%%` and pairs the marks left to right by the rule of D3: a line-start mark closes at the next mark anywhere or runs to the end, any other mark closes at the next mark on its line or is left as text. It then returns the original with those ranges removed. Code inside a comment is removed with it, because only the marks are searched in the masked text and the cut is made in the original.
*Alternative:* a regex `/%%[\s\S]*?%%/` over a text with `preMarkCode` placeholders. It is render-only, does not handle tildes or inline code, and would give search and the render two different ideas of what is code.

**D3: Two kinds of comment, as Obsidian has them; only an unclosed block comment runs to the end of the file.**
Task 1.1 showed that Obsidian does not pair every `%%` with the next one. A `%%` at the start of a line opens a block comment that runs to the next `%%` anywhere, or to the end of the file. A `%%` within a line only pairs with a `%%` on the same line, and is plain text otherwise. safeLearn follows that rule (decided with Gerald, 2026-11-11), so a page shows what its author sees in Obsidian. An unclosed block comment hiding the rest is still the safe direction: the author sees the gap at once, in Obsidian as on the page. An unpaired inline `%%` is visible in Obsidian too, so showing it publishes nothing the author did not see.
"Start of a line" is decided on the original text, not on the masked one: a code span in front of a `%%` is text in front of it, and must not make the `%%` a block opener.
*Alternative:* every `%%` pairs with the next, an unpaired one runs to the end (the original D3). It never hides less than Obsidian, but it hides text the author sees in Obsidian (`A %%x` on one line and `y%% B` on the next), and the page then disagrees with the editor.

**D4: The comment's characters are removed, not blanked.**
Nothing downstream needs offsets or line numbers of the original after this point: the directive is already decided, and search offsets are relative to the text it is given. A removed block comment between two paragraphs leaves the blank lines around it, so the paragraphs stay separate. A removed inline comment leaves the spaces on either side, which HTML and the snippet (`\s+` → one space) collapse anyway.

**D5: The index keeps its directive line.**
`readCorpusFile` stores the body with the directive line still in it. There, `stripComments` is applied to everything after that line, and the line itself is kept as is. Where a file has no directive, the whole body is stripped. The index only proposes candidates, and `answerFromFile` decides, but a file must not be proposed for a word that only a comment holds.

## Reference behavior (task 1.1)

Observed in Obsidian 1.15.0, reading view, through `test/obsidian/harness.js`:

| Input | Obsidian shows |
|---|---|
| `Vorher %%x%% nachher.` | `Vorher nachher.` |
| `%%` line, notes, `%%` line | the paragraphs around it only |
| `A %%x%% B %%y%% C` | `A B C` |
| line beginning `%%`, several paragraphs and a `---`, closed by `x%% y` mid-line | `y` and what follows; nothing in between, no rule |
| line beginning `%%` with no later `%%` (alone or followed by text) | nothing from that line on |
| `Drei vor %%offen` with no later `%%` | the line as written, `%%` included |
| `A %%x` / `y%% B` on two lines of one paragraph | both lines as written |
| `Text %%a` / blank line / `b%% after` | everything as written |
| `%%x%% b %%c` | `b %%c` |
| `%%` line in the middle of a paragraph, notes, `%%` line | the paragraph split around the comment |
| closing `%% trailing` | `trailing` |
| `%%` after `  ` (2 spaces), after `> `, in a list item's continuation | a block comment, as at column 0 |
| `` `%%` `` inline code, `%%` in a backtick, tilde or Mermaid fence | as written; the diagram is drawn |
| `%%` line, a fenced block, a note, `%%` line | nothing of it |
| `%%` in a table cell, a list item, a heading, paired on its line | the comment removed |

Not reproduced, because Obsidian decides them per container and they do not occur in the corpus: a `%%` indented four spaces or a tab is indented code to Obsidian, and the next line-start `%%` then opens a block to the end; `- %%x` ends its comment with the list item; `# %%x` in a heading is text. safeLearn treats the first two as block comments up to the next `%%`, and the third as an unpaired inline `%%`.

## Risks / Trade-offs

- [A stray backtick inside a comment pairs with one outside it and masks a `%%`] → `maskCode`'s span rule never crosses a blank line, which limits the damage to one paragraph. A unit test pins the behavior. Obsidian has the same ambiguity.
- [An author used `%%` as plain text outside code, e.g. `100%%`] → It becomes a comment and hides text. Before deploying, `stripComments` is run over the safeLearn and secureLectures corpora and the Nextcloud vault, and the files where it removes anything are listed (task 5.1). The inventory of 2026-11-11 found only code uses.
- [The docs pages are rendered by the same pipeline] → Any `%%` they show is written in inline or fenced code, and the docs are checked in the browser like other pages.

## Migration Plan

No data or configuration changes. After deployment, existing comments simply disappear from all views. To roll back, revert the commit.
