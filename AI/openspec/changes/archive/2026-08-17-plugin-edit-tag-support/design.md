## Context

See `proposal.md` — Why. What shapes the approach is the state the plugin was left in by `plugin-fix-editor-decorations`:

- Every recognition rule lives in one block at the top of `main.ts`, each returned from a function rather than held in a constant, because a global regular expression remembers where it last stopped. The editor and the reading view read the same rules. This change adds to that block; it does not open a second one.
- `resolveBlocks` already walks the whole document and already recognizes the file-level directive by position — it starts at line 2 when line 1 opens with `@@@`, so that line does not swallow every marking below it. What it does not do is report that it found one.
- `buildDecorations` resolves blocks over the whole document but emits decorations only for visible lines, and hands the set to `Decoration.set(ranges, true)` so the library sorts it.

On the server side the grammar is four functions in `obsidian.js` — `parsePermissionEntries` (split on commas), `parsePermissionEntry` (role and optional bracketed window), `parsePermissionWindow` (`from`, `to X`, `X to Y`), `parseLocalDateTime` — plus `hasRoles` in `utils.js`, which pulls every `#`-prefixed entry out of the role test before testing anything and then resolves exactly three of them.

## Goals / Non-Goals

**Goals:**

- One grammar for a directive line, shared by everything in the plugin that needs to read one.
- The grammar reports character offsets, not just values. A decoration needs to know where an entry sits, and a parser that returns only what it parsed cannot say.
- The plugin's answer to "will the server discard this?" is checked against the server rather than against a reading of the server.

**Non-Goals:**

- The reading view. Hiding tags in rendered output is `plugin-render-hide-tags`. The grammar built here is meant to be usable there, which is why it takes a string and returns offsets rather than touching CodeMirror types — but that change makes its own decisions about the DOM.
- Deciding the final appearance. This design fixes the vocabulary of markings; which colour, weight or underline each becomes is settled by looking at real corpus documents in the harness, because that is the only place the question can honestly be answered.
- Telling the author whether a window is open at the moment. See `specs/plugin-editor-decorations/spec.md` — *An entry carrying a time window is distinguishable from one that does not*.

## Decisions

### The grammar mirrors the server's shape, entry by entry

`parseDirectiveEntries(text)` returns, for the text after `@@@`, one record per comma-separated token: its offset and length within the line, the role part and its extent, the window part and its extent if bracketed, and what the plugin concluded about each.

**Why entry-shaped rather than a single regular expression over the line:** the server's own decisions are per entry — one token's unreadable window does not touch its neighbour, and one discarded token does not discard the rest. A line-level pattern cannot express that, and the requirement that an unreadable entry cost only itself would have no implementation to hold it up.

**Alternative considered:** marking the line and colouring substrings found by searching for `[` and `#`. Rejected — it finds brackets the server does not treat as a window (a bracket inside a role makes the whole token unreadable, it does not make a window) and would mark text the server ignores, which the capability forbids in the direction that misinforms.

### What the plugin concludes about an entry

Four conclusions, and they are independent of one another rather than a single enumeration, so an entry can be a timed view switch and be marked as both:

| Conclusion | Reached when |
| --- | --- |
| unreadable | the server's entry pattern does not match the token, or the role is empty after trimming |
| timed | a window is present and the server would parse it |
| broken window | a window is present and the server would discard it, leaving the entry permanently active |
| view switch | the role begins with `#`; separately, whether it is one of the three the server resolves |

A directive in which *every* entry is unreadable is its own conclusion at the line level, because `removeForbiddenContent` returns `""` for it: the block is withheld from every reader including an admin. That is the harshest thing a directive can do and the least visible, so it is marked at the line rather than left to be inferred from each entry.

### The window is judged by whether the server would parse it, never by what it means

The plugin never needs a timestamp — only the server's yes-or-no. `parsePermissionWindow` returns `null` when neither end parses, and an entry with a `null` window is permanently active; that is the whole of what the marking depends on.

This keeps the mirrored code small, but it is still the riskiest part of the change: `parseLocalDateTime` is permissive in ways a careful reading gets wrong. It accepts `2025-13-45` (the Date constructor rolls the overflow over), and rejects `2025` only because `month - 1` becomes `NaN` two steps later. A hand-written mirror will diverge somewhere.

**So the mirror is checked against the server, not against a reading of it.** `parseFirstLineForPermissions` is already exported from `obsidian.js` and runs the same `parsePermissionEntries` the inline form uses. A test in the content-verification suite feeds a table of edge-case directives to both it and the plugin's grammar and asserts the same conclusion per entry. Nothing new needs exporting, and the oracle is the code that actually decides.

**Alternative considered:** importing the server's functions into the plugin. Rejected — the plugin ships to Obsidian as a standalone bundle and has no access to a safeLearn checkout; a user installs it from the Obsidian catalogue with no server anywhere.

### `resolveBlocks` reports the file-level line rather than `buildDecorations` re-deriving it

`resolveBlocks` returns the file-level line number alongside the blocks. The alternative — calling `isFileLevelDirective` again in `buildDecorations` — is a second place that decides what the first line is, and the two would be free to disagree about it. The comment block in `main.ts` says why that matters: one rule per tag form, used by everything, is what stopped the editor and the reading view from drifting apart.

### Markings are combinable classes, not one class per combination

A `safelearn-entry` mark on every entry, with `-timed`, `-broken`, `-switch` and `-unresolved` as additional classes on the same range, plus line classes for the file-level directive and the all-unreadable directive. Appearance is composed in `styles.css`.

**Why:** the conclusions are independent, and a class per combination is a dozen classes that mostly do not occur. It also keeps `main.ts` out of the appearance question entirely, which is the part that has to be decided by looking rather than by reasoning.

## Risks / Trade-offs

- **The grammar mirror diverges from the server and the marking lies** → the oracle test above, driven from the server's own exported entry point. Any divergence found and deliberately kept is recorded in `AI/architecture.md` §9 the way the side-by-side marker divergence already is.
- **Six new distinctions turn the editor into a colour chart** → they are attributes on one shared entry marking rather than six independent colours, and the harness renders real corpus documents so the result is judged as a page rather than as a legend. If it reads as noise, the answer is fewer visual channels, not fewer conclusions — the conclusions are what the capability requires.
- **Per-entry marks multiply the decoration count on directive-heavy documents** → decorations are still built only for visible lines, and a directive line yields entries in the single digits. The existing whole-document block resolution remains the larger cost, and the trade-off it accepts is already recorded.
- **`#foo` is marked as resolving to nothing, and a future server release resolves it** → the plugin would then under-mark, which is the safe direction: the capability forbids recognizing more than the server, not less. The three names live in the recognition block where a change to them is one edit.
- **The harness needs documents that are deliberately wrong — broken windows, unreadable entries — and `md/` is a corpus the content-verification suite asserts is right** → the harness already exposes `writeDocument`, which writes into the vault it rebuilds each run rather than into `md/`. The wrong documents live there and are visible only to the plugin suite. `assembleVault` copies the corpus rather than linking it for the same reason, so nothing here reaches back into `npm test`'s subject.
