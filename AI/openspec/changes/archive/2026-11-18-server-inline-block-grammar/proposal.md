Source: conversation of 2026-11-18 (a colleague reported a student seeing `#exam` content in a test)

## Why

The server finds an inline `@@@` block with one regular expression that ends the block at the **next `@@@` anywhere**: in the middle of a sentence, inside inline code, inside a fenced code block. The companion plugin reads blocks line by line, and teachers check their documents in the plugin. In secureLectures, `tests/POSE3-OO/Test 1 - 3BHIF - 2026-11-16` (variants A and B) has a `@@@ teacher` block containing the sentence "Die Musterlösung steht in den `` `@@@ #exam` ``-Blöcken". The plugin shows it correctly. The server closed the teacher block at that inline `@@@`, and every block after it was paired one step off. During the test window, 3BHIF students saw all six model solutions and none of the questions.

The test files are correct and stay unchanged. The parser is wrong. The spec already says that what the plugin marks is what the server acts on. For the closing `@@@` that was a recorded divergence ("only applies to documents nobody writes"), and this document disproves it.

## What Changes

- The server reads inline permission blocks with the same line-based grammar as the plugin:
  - A block **opens** on a line that starts with `@@@` (after optional indentation) and names something.
  - A block **closes** on a line that holds nothing but `@@@`.
  - `@@@` anywhere else in a line is text.
  - A closing line with no open block closes nothing.
  - An opening line inside an open block opens nothing. Blocks still do not nest.
  - **BREAKING (safer):** a block that is never closed runs to the end of the document. Until now the server ignored its directive and showed everything below it to everyone.
- **Fenced code blocks** (```` ``` ```` or `~~~`) are code. A marker line inside a closed fence is neither an opener nor a closer, on the server and in the plugin. A fence that is never closed protects nothing, so it cannot hide a marker the server would otherwise act on.
- One grammar for every server reader of inline blocks: page, presentation and document views, handouts, note embeds, search, the corpus index (block boundaries, attachment visibility), and the exam module's check for whether a file has `#exam`/`#answer` blocks.
- The plugin gets the fence rule, so it never recognizes more than the server. That needs a plugin release.
- New checks: `@@@` in the middle of a line, in inline code, in fenced code blocks (backticks and tildes, closed and unclosed), nested openers, stray closers, unclosed blocks, and the exact shape of the POSE3-OO incident. They form one table run against **both** the server and the plugin, like `test/directive-grammar.test.js`.
- The recorded divergence about the closing `@@@` in `AI/architecture.md` is removed. `docs-permissions.md` states the grammar.

## Capabilities

### New Capabilities
- `permission-block-grammar`: where an inline `@@@` block begins and ends, as the server and the plugin both read it. Covers line-based markers, text that only looks like a marker, fenced code, stray and nested markers, and unclosed blocks.

### Modified Capabilities
- `plugin-editor-decorations`: a marker line inside a fenced code block is not marked as a block boundary.

## Impact

- `obsidian.js`: `inlinePermissionRegex`, `extractInlinePermissionBlocks`, `filterForbiddenSegments` (and through it `removeForbiddenContent`, search, the attachment check).
- `exam/handout.js`: the check whether a file has exam or answer blocks.
- `AI/plugin/main.ts`: `resolveBlocks` gets the fence rule. Plugin version bump and release.
- Tests: a new block-grammar oracle in the content suite, plus render checks in `test/obsidian-syntax.test.js`.
- Docs: `docs-permissions.md`, `AI/architecture.md`.
- Content: none changed. Rendering of existing documents changes only where they hit the old behaviour. Before release, a diff over `md/` and the secureLectures corpus lists every file whose student or teacher render changes.
