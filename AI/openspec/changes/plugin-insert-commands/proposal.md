Source proposal: `AI/proposals/plugin-insert-commands.md`

## Why

The SafeLearn tags are typed by hand today, and a side-by-side block is four lines of them with a spelling nobody remembers and a rule nobody sees: `##side-by-side-start`, one `##separator` per column boundary, `##side-by-side-end`, each on a line of its own. A marker with a typo is not marked by the plugin and not acted on by the server — it is left standing in the document as text a reader then meets in the middle of a lecture.

The plugin already knows what these tags are. It should be able to write them.

## What Changes

- **Two commands insert a side-by-side block, and neither of them is for three columns.** One lays out two columns without asking, because that is the normal case. One asks how many, for the rare ones. Three columns come up now and then, but not often enough to earn an entry in the palette that a person reads past every time.
- **A selection is enclosed whole, never distributed across columns.** `##side-by-side-start` before it, the separators after it, `##side-by-side-end` last. Somebody who selected several paragraphs does not want them split at a guessed place; where the columns divide is theirs to say, and the separators are put where they can move them.
- **A command inserts a fragment marker on a line of its own, before the block the cursor is in.**
- **Every one of them is reachable from the command palette and from the editor's context menu**, out of one registry rather than two lists that can disagree about what exists.
- **What is inserted is what the renderer reads.** `preprocessSideBySide` is read at implementation time rather than reproduced from memory, and the shape the command writes is the shape that function makes columns out of — a marker sharing a line with content is a marker the plugin does not mark and the person writing it never sees fail.

The permission sections of `plugin-section-authoring` belong in the same menu. The registry is what makes that an entry rather than a second menu, and this change builds it for that reason and not only for its own three commands.

## Capabilities

### New Capabilities

- `plugin-authoring-commands`: what the plugin writes into a document when asked, and how it is reached. It covers the shape of what is inserted, that a selection is enclosed rather than divided, that the palette and the context menu are the same set of commands, and that a command changes the document and nothing else about the session.

### Modified Capabilities

None. Nothing about what the plugin *marks* changes; the tags it writes are the tags it already recognizes.

## Impact

- **`main.ts` in the plugin repository** (through the gitignored `AI/plugin` symlink): a registry of authoring commands, the three commands themselves, one `editor-menu` subscription that builds the context menu from that registry, and a small modal for the column count.
- **`test/obsidian/plugin.test.js` and `test/obsidian/harness.js`**: the harness can type and move the cursor but cannot run a command or open the context menu. Both are added, and the checks assert the resulting document text — what a command inserts is a statement about a person's file, and the only honest way to check it is to read the file afterwards.
- **`obsidian.js` is read, not changed.** `preprocessSideBySide` decides what a well-formed block is.
- **`README.md`** in the plugin repository: the commands are the first thing in this plugin a person invokes rather than merely sees.
