Source: AI/open-proposals.md — "Parsing Fehler bei End @@@ Block"
Source: AI/open-proposals.md — "Anzeige Schülerblock"

## Why

Two small, unrelated display bugs in the Obsidian plugin make what a person sees not match what they wrote or what the server will actually do. First: a permission block's closing `@@@` is shown as literal text instead of being hidden, specifically when it is the last line of the file with no line break after it. Second: the "insert sections per name" command writes a `### <Name>` heading into every generated section, even though the plugin's own reading-view rendering already shows the addressed name as a heading above the block — so every generated document repeats a name the reader already sees.

## What Changes

- Reading view: a block's closing `@@@` marker is hidden even when it is the file's last line with no trailing newline. Today it is shown as its own characters, which is exactly what the existing "no tag SHALL be shown as its own characters" behavior already promises everywhere else.
- "Insert sections per name": generated sections no longer get a `### <Name>` heading written into their content. Each generated block is left with a single blank line to write into. The name is still visible via the plugin's own rendered frame heading; nothing is lost, only the duplicate written-in heading.

## Capabilities

### Modified Capabilities

- `plugin-hidden-tags`: adds a scenario to the existing "no tag text shown" requirement covering a closing marker that is the file's last line with no trailing newline.
- `plugin-authoring-commands`: removes the requirement that a generated per-name section carries a written-in heading; a generated section's components become the directive, a place to write, and the closing marker.

## Impact

- `AI/plugin/main.ts` — the reading-view tag-hiding path (`hideTags` / `resolveBlocks` / the `stripTagText` fallback, around lines 1893-2066) for the first bug; `insertSectionsPerName` (around line 3000-3011) for the second.
- `AI/plugin/styles.css` — none expected, but check once the heading is gone from generated sections.
- `test/obsidian/plugin.test.js` — the reading-view test around lines 1989-2012 needs an assertion that the closing marker text is absent; the tests at lines 2276 and 2319 assert today's written-in heading and need updating to the new, heading-free output.
- `AI/plugin/main.js` — rebuilt from `main.ts` (`npm run build`).
