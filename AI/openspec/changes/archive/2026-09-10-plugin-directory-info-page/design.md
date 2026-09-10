## Context

The plugin already has everything this view needs to read, just not a place that shows it all together:

- `searchDirectory(query: string)` (`main.ts:1182`) hits `GET /api/admin/directory/search` and returns a `DirectorySearchResult` (`outcome: "ok" | "unreachable" | "failed" | "refused"`, `entries: DirectoryEntry[]`). An empty query returns the whole directory (existing server behavior, covered by `test/checks/directory-search.js`), not an empty list.
- `classLikeValues(entries)` (module-level function, `main.ts:141`) derives every role/group value across a set of entries that is not one of the five built-in markers (`teacher`, `teachers`, `student`, `students`, `admin`) - this is already "every class", unchanged, ready to reuse.
- `hasDirectoryRole()` (`main.ts:676`) decides, from the held token's own claims, whether the directory endpoint's teacher-or-admin gate will let a call through. It is already the gating check for the directory picker and "List classes".
- The existing "List classes" command (`main.ts:1220`) is the simplest precedent for reading the whole directory and presenting a derived list: it calls `classLikeValues()` (which itself calls `searchDirectory("")`) and prints the result as one `Notice`.
- `NameListModal.buildDirectorySearch` (`main.ts:3048`) is the richer precedent: a status line for a non-`ok` outcome, a text input that narrows results, and results rendered as plain clickable `<div>`s (never `<button>`, so the test harness's generic "first button" lookup is not confused - see the comment at `main.ts:3041`).

See `proposal.md` - Why / What Changes for the motivation; this document covers how the new view is built from the above.

## Goals / Non-Goals

**Goals:**
- Reuse `searchDirectory`, `classLikeValues`, `DirectoryEntry` and the `hasDirectoryRole` gate exactly as they exist; no server-side change.
- One view, one directory fetch per open, covering all three sections (teachers, classes, per-user lookup).
- Match the plugin's existing UI vocabulary (status line for a failed outcome, plain clickable-`<div>` results, no new `<button>` in the result list) so the view looks and tests like the rest of the plugin.

**Non-Goals:**
- No live refresh while the view stays open - it is a point-in-time snapshot, re-fetched only when reopened. A directory that changes while the view is open is not reflected until it is closed and reopened.
- No editing of roles, classes, or any other directory/Keycloak state from this view or anywhere in the plugin (per Gerald: that stays manual in Keycloak "bis auf Weiteres").
- No new server endpoint and no change to `GET /api/admin/directory/search`'s existing teacher-or-admin gate.
- No pagination or virtualization for very large directories - out of scope for this change; see Risks.

## Decisions

**A `Modal`, not a new `ItemView`.** The plugin has two existing dialogs (`ColumnCountModal`, `NameListModal`), both `Modal` subclasses, and no `ItemView`/`registerView` anywhere in `main.ts`. A workspace-leaf `ItemView` would let the view stay open alongside a note, but it is a new architectural pattern this plugin does not otherwise use, and nothing about "one read-only lookup a teacher opens, checks, and closes" needs a persistent leaf. A `Modal` keeps this consistent with the rest of the plugin and avoids introducing view-type registration, leaf lifecycle, and workspace-layout persistence for a feature that does not need any of it.

**One `searchDirectory("")` fetch per open, everything else derived client-side.** The view needs the *whole* directory anyway (for the teacher and class sections), so it fetches it once when opened and derives all three sections from the same `DirectoryEntry[]`:
- Teachers: entries whose `roles` include `teacher`, `teachers`, or `admin` (the same three values `hasDirectoryRole()` already checks for the gate itself).
- Classes: `classLikeValues(entries)`, unchanged.
- User search: a text input filters the already-held `entries` by name client-side (substring match), rather than re-querying `searchDirectory(query)` per keystroke like the existing picker does. The picker re-queries because it does not otherwise hold the whole directory; this view already does, so a live per-keystroke round trip would be redundant network traffic for a filter it can already do in memory.

Alternative considered: mirror the picker exactly and re-query the server on every keystroke. Rejected - three sections needing the full directory make one upfront fetch strictly less traffic, and the filter itself is a plain substring match over data already in hand.

**Per-user role display reuses the existing `"${name} — ${roles.join(", ")}"` convention.** Other places in the plugin already render a `DirectoryEntry` this way (`main.ts` - see the reference at the `removeForbiddenContent`/grammar-parity comment area). Selecting a user in the search results shows exactly that line for the selected entry - no new formatting convention.

**Outcome handling reuses `buildDirectorySearch`'s status-line pattern**, not "List classes"'s `Notice`. A `Notice` is transient and appropriate for a one-shot command; this view stays open, so a non-`ok` outcome (`unreachable`, `failed`, `refused`) is shown as a persistent status line within the relevant section, the same wording already used (`"The directory could not be reached."` / `"The directory search failed."`), and a `refused` outcome collapses into the same "no role held" explanation the picker and "List classes" already give (`plugin-login-state`'s existing boundary - `main.ts:1154`-ish - refusal reads the same as not being logged in, on purpose).

**Entry point: a new command, gated the same way the picker and "List classes" already are.** A command (e.g. "Show directory info") is added alongside the existing "List classes" command, using the same `hasDirectoryRole()`/login-state gating text so the three surfaces stay consistent rather than each inventing its own phrasing.

## Risks / Trade-offs

- **[A very large directory renders as one long list]** → Accepted, not newly introduced: "List classes" and the picker's empty-query search already pull the whole directory today. This view does the same fetch once and does not add a second cost on top.
- **[The snapshot goes stale while the view is open]** → By design (Non-Goals): it is a point-in-time lookup, not a live dashboard. Reopening the view re-fetches.
- **[An admin who is not teaching staff appears in the "Teachers" section]** → Accepted: this mirrors the existing teacher-or-admin gate everywhere else in the plugin (`hasDirectoryRole`, the server's own `verifyCallerIdentity`), so the view's notion of "teacher" matches what already decides access elsewhere rather than introducing a fourth, narrower definition.

## Migration Plan

Purely additive: a new command and a new `Modal` class in `main.ts`, no server-side change, no data migration, no settings change. Ships in the next plugin release; rollback is reverting the commit, same as any other plugin change.
