## Context

- Entries of a directive are separated by commas, markers included: `@@@ #variant-private, #optional`. Without the comma, `#variant-private #optional` is one entry, an unknown marker that hides its block from everyone. (The first drafts of this change wrote the examples without commas; corrected during apply.)
- `parsePermissionEntry` (`obsidian.js`) splits a token into role and bracketed window. A token that does not match (`4ahif []`, an unbalanced bracket) returns `null` and is dropped by `parsePermissionEntries`. `parsePermissionWindow` returns `null` for an unreadable window, which the entry then carries as "no window" — permanently active. A window with one readable end (`[2026-11-01T08:00:00 to garbage]`) keeps the readable end and becomes open-ended.
- `getActivePermissionRoles` filters the entries by window and returns the bare role strings. Its callers, `filterForbiddenSegments` (inline blocks) and `resolveFileVisibility` (whole-file directive), refuse when the list is empty and otherwise ask `hasSomeRoles`. Once filtered, `hasRoles` cannot tell "no roles written" from "roles written, all closed" — which is how `@@@ 4ahif[closed], #optional` ends up decided by `#optional` alone.
- `hasRoles` (`utils.js`) tests the non-`#` entries with OR (admin short-circuits to true), then loops over the markers and assigns `clientAccess` for each, so the last one wins. Unknown markers already return `false` (rename-view-markers-by-mechanism D1).
- The window scheduler (`registerTimedPermissionEntries`, `hasTimedWindow`) announces reloads when an entry's window opens or closes.
- The plugin (`AI/plugin/main.ts`) mirrors `parsePermissionEntry` / `parsePermissionWindow` to mark discarded windows; `test/directive-grammar.test.js` already compares the two.

## Goals / Non-Goals

**Goals:**
- Every malformed or closed entry narrows; none widens, in time or in audience.
- Marker verdicts independent of order.

**Non-Goals:**
- Nested blocks (`nest-permission-blocks`).
- Rejecting a whole directive because one entry is malformed. Decided 2026-11-22: a bad window closes its own entry; the rest of the OR list stays valid, and the plugin shows the error.
- Windows on markers as a feature. They keep parsing; a closed one hides the block (spec), an open one behaves as the plain marker. Nothing in the corpus uses them.

## Decisions

### D1: Unreadable becomes an explicit closed state, not an absence

`parsePermissionEntry` never returns `null` for a non-empty token. A token that does not match the entry pattern becomes `{ role: <text before the first bracket, trimmed, lower-cased>, window: INVALID }`; an unreadable window, or a window with any unreadable end, also yields `window: INVALID`. `INVALID` is a frozen sentinel (`{ invalid: true }`), and `isPermissionEntryActive` returns `false` for it before looking at `start`/`end`. An empty token (`, ,`) is still dropped.

*Alternative:* drop unreadable entries. Rejected: dropping is exactly what lets a marker stand alone (D2), and it hides the entry from the scheduler and the index, which then cannot report it.

### D2: The callers pass the written roles together with the active ones

`getActivePermissionRoles` is replaced by a function returning `{ active, wroteRoles }`, where `wroteRoles` is true when any entry not starting with `#` was written. A closed or invalid `#` entry is kept in `active` as an unsatisfiable marker (`#!closed`, which `hasRoles` resolves as unknown and therefore `false`), so the marker requirement cannot vanish with its window. `hasRoles` gets `wroteRoles` and, when it is true and no non-`#` entry is active, returns `false` before the admin short-circuit.

The admin rule is unchanged: the short-circuit only replaces the role test, and only when at least one written role is open — which is also what the docs already say about a whole-file directive whose windows are all shut.

*Alternative:* keep closed role entries in the list under a sentinel name nobody holds. Rejected: an admin would pass it through the short-circuit and read a closed block.

### D3: Markers combine by AND, unknown still ends the decision

The marker loop starts from `true` (or the role verdict) and does `clientAccess = clientAccess && f(marker)`; an unknown marker still returns `false` at once. `#variant-private, #variant-public` needs no special case — the two conditions are complements, so their AND is false for every session and on every handout flag combination.

### D4: Invalid windows are not scheduled

`hasTimedWindow` is false for `INVALID`, so the scheduler never announces a change for an entry that can never open. The server logs `[Permissions] unreadable window: <file>:<line> <entry>` once per scan, next to the existing `[Blocks] unclosed` line, so a broken window on secureLectures (outside the suite) is visible in the logs.

### D5: Plugin follows the server's reading

The plugin's mirrored parser adopts D1: half-readable windows count as discarded, an unmatched token is still an entry. The decoration for a discarded window changes its tooltip/meaning from "permanent" to "closed", and a directive with both variant markers gets the existing "hides from everyone" error marking. `test/directive-grammar.test.js` gains cases for the half window and the unmatched token so the two parsers cannot drift.

## Risks / Trade-offs

- [Content that worked by accident stops showing: a typo'd window that has been "permanent" so far] → The scan of both corpora found no unreadable window; the log line (D4) and the plugin marking point at any that appear later.
- [Admins lose sight of a block whose written roles are all closed] → Intended, and already documented for whole-file directives; an admin who needs to see it edits the window.
- [Index entries parsed by the old code carry dropped entries] → The index lives in memory and is rebuilt when the server starts, so a deploy re-parses every file; nothing to migrate. (Verify during apply that no index snapshot is persisted.)

## Migration Plan

Server and plugin can ship independently: the server change only narrows. Deploy safeLearn, merge into secureLectures, then release the plugin. Rollback is a revert; no data changes.
