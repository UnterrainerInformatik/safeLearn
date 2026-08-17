## Why

The plugin's editor marking covers three tag forms: `##fragment`, the `##side-by-side-*` markers, and a permission directive line taken as one indivisible thing. The renderer reads more than that out of the same text. It reads a first line beginning with `@@@` as gating the whole file rather than opening a block. It reads a bracketed window on any role, so that `4ahif[2025-11-28T08:00:00]` addresses a class only from a moment onward. And it reads `#exam`, `#practice` and `#answer` not as roles at all but as switches between variants of a document.

A teacher writing in Obsidian sees none of those three distinctions. A role that expires looks exactly like one that never does; a view switch looks exactly like a class name; the line that governs the entire file looks like any other directive, and today it is deliberately left unmarked. The plugin enforces nothing — its whole value is that a person can see what the server will do with the document before publishing it. On these three forms it currently cannot.

## What Changes

- **A permission directive is read as the list it is.** The renderer splits the text after `@@@` on commas and reads each token as a role with an optional bracketed window. The plugin marks the same tokens, so a directive naming four things is four markings rather than one.
- **The file-level directive gets a marking of its own.** A first line beginning with `@@@` gates the whole file and has no closing marker. It is already recognized — `resolveBlocks` skips past it so it does not swallow the document — but it carries no marking. It gains one that says what it is: the line that governs everything below, not a block that happens to start here.
- **A role carrying a time window is distinguishable from one that does not.** A block that opens or closes at some point is a different promise than a permanent one, and the difference must be visible without reading the timestamp.
- **A window the server will discard is marked as broken.** `parsePermissionWindow` returns `null` for a window it cannot parse, and an entry with no window is permanently active — so `4ahif[gestern]` silently grants what the author meant to restrict. The server has no way to complain about this; the editor does.
- **The three view pseudo-roles are distinguishable from roles.** `#exam`, `#practice` and `#answer` are resolved against the reader's own preferences, not against who they are. They are marked as the switches they are rather than as addresses.
- **Marking stays independent of the current time.** A window is marked as a window; whether it happens to be open right now is not part of the marking. Recognition that changed with the clock would need a timer and would contradict the existing requirement that examining the same text twice gives the same answer.

The plugin still recognizes no more than the server does. A token the renderer discards is not marked as a valid role, and the two known divergences the plugin already carries are joined by any new one this introduces rather than left to be found later.

## Capabilities

### New Capabilities

None. This extends what the editor marks; it introduces no separately observable behavior of its own.

### Modified Capabilities

- `plugin-editor-decorations`: the set of tag forms the editor marks grows from three to the renderer's full present set. Most of what governs the new forms is already required of every form the plugin marks — *What is marked is what the server will act on* binds them to the renderer's rules without needing to be restated. New requirements cover the distinctions themselves: that a directive is marked as the list of entries it is, that the file-level form is marked as governing the file, that a timed entry is distinguishable from a permanent one, that a discarded window is shown as discarded, and that a view switch is distinguishable from an address. One existing requirement changes: *A tag the plugin cannot resolve costs only itself* gains the entry as a unit of isolation, since a directive is no longer marked as one indivisible thing and one unreadable entry must not cost its neighbours their marking.

## Impact

- **`main.ts` in the plugin repository** (reachable through the gitignored `AI/plugin` symlink). The recognition rules at the top of the file gain the directive grammar; `buildDecorations` gains the token-level marks; `resolveBlocks` gains a marking for the line it currently only steps over.
- **`styles.css`** in the same repository: each new distinction needs a marking that reads as different at a glance without turning the editor into a colour chart.
- **`test/obsidian/plugin.test.js` and the corpus it drives.** The harness logs into a real Obsidian and asserts against decorations, so the new forms need corpus documents that carry them. Its existing assertion that recognition does not depend on when it is examined must continue to hold — the time-independence decision above exists so it does.
- **`obsidian.js` and `utils.js` are read, not changed.** `parsePermissionEntry`, `parsePermissionWindow`, `parseLocalDateTime` and `hasRoles` are the definition of what a directive means; this change mirrors them and must not diverge from them silently.
- **`AI/architecture.md` §9** if a deliberate divergence is accepted, as the side-by-side marker divergence already is.
