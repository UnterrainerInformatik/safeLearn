## Context

See `proposal.md` — Why. Three pieces of existing code this design builds directly on, all in `main.ts` (plugin repo) unless noted:

- `NameListModal.buildDirectorySearch` renders, in DOM order: a text `<input>` (query), a `<select>` (class filter), a results `<div>` of plain, non-`<button>` result rows (click-to-append), then — outside this method, back in `onOpen` — the shared `<textarea>` and finally the confirm `<button>`. The method's own comment is explicit: nothing it renders may be a `<button>`, because `answerNameList`/`dialogBoxes()` (`test/obsidian/harness.js`) find the field and the confirmation by querying the modal for its first `input`/`textarea` and its first `button` respectively.
- `SafeLearnPlugin.searchDirectory(query)` calls `requestUrl` with `throw: false` and, on `response.status >= 400`, returns `[]` — the same as it returns for no instance configured and no token held. `classLikeValues()` is `searchDirectory("")` reduced to class-like role names, and is already fetched once per modal open (`tasks.md` #7.2 of the prior change) to populate the class filter — this is the one fetch this design hangs the reachability signal on, rather than adding a second one.
- `test/obsidian/harness.js`'s `setDirectoryLoginFixture` stubs `plugin.searchDirectory` outright with a plain `async (query) => entries[]` function, bypassing the real implementation (and whatever it will report about reachability) entirely. Any change to what `searchDirectory` returns has to be mirrored here or every check built on this fixture breaks silently.

Server-side, `GET /api/admin/directory/search` (`app.js`) already answers three ways relevant here: `403` for an unauthorized caller (unchanged, deliberately undifferentiated from "not logged in" per `plugin-login-state`), `502` when `searchDirectory` itself throws (a real Keycloak-side failure), and `200` on success. `requestUrl` on the plugin side does not throw on a `>=400` response (that is what `throw: false` suppresses) but does still reject on a genuine network failure — no route to the instance at all, DNS failure, timeout — which `searchDirectory` today does not catch, so that case currently surfaces as an unhandled rejection rather than as `[]` or anything else.

## Goals / Non-Goals

**Goals:**
- Tell apart, on the plugin side, the three cases the server already makes distinguishable in principle: unreachable (a `requestUrl` rejection), failed (`502`), and a refusal that must stay silent (`403`, unchanged) — without a second network round trip beyond what already happens today.
- A class filter and a results list that support choosing more than one, without adding an element `dialogBoxes()`/`answerNameList` would mistake for the modal's field or its confirmation.
- Keep `plugin-login-state`'s existing refusal-blurring boundary exactly where it is; this design adds a new, narrower distinction next to it, not a change to it.

**Non-Goals:**
- Any change to the server endpoint, its status codes, or its query semantics — settled in `proposal.md` (client merges per-class queries; no multi-value query added).
- Any change to the PKCE login flow, token storage, or `plugin-login-state`'s five named states — this concerns a directory search issued while already logged in, not the login itself.
- A general-purpose combobox component. What is built here is specific to this one search strip.

## Decisions

### `searchDirectory` reports an outcome, not just a result list

Today's signature (`Promise<DirectoryEntry[]>`) cannot carry a distinction the caller needs to render. It becomes `Promise<{ outcome: "ok" | "unreachable" | "failed" | "refused"; entries: DirectoryEntry[] }>` (entries empty except for `"ok"`), built from:

- a caught exception from `requestUrl` → `"unreachable"`
- `response.status === 403` → `"refused"` — rendered exactly as "not logged in" is, per `plugin-login-state`'s boundary; the caller (`buildDirectorySearch`) treats `"refused"` the same as an absent picker would, nothing shown
- any other `response.status >= 400` (chiefly the `502` `searchDirectory` failures raise) → `"failed"`
- `response.status < 400` → `"ok"`, with `entries` parsed as today

`classLikeValues()` (built on `searchDirectory("")`, already fetched once per modal open) carries the same outcome through, since it is the fetch the reachability signal piggybacks on — no new request is added for the "shown before a search is tried" requirement.

Alternative considered: a separate `checkDirectoryReachable()` probe called once on open, kept apart from `searchDirectory`. Rejected — it would be a second round trip for information the already-scheduled `classLikeValues()` call produces for free, and two independent code paths for classifying the same `requestUrl` outcome is a second place to keep them consistent.

### The status line is a plain element, not a `<button>`, updated in place

`buildDirectorySearch` renders one status element above the query input, hidden (`el.hidden`) while the outcome is `"ok"` or `"refused"` and showing a short, outcome-specific line otherwise ("The directory could not be reached." / "The directory search failed."). It is written once from the `classLikeValues()` call already made on open, and updated again after every subsequent search — a picker opened reachable can still have a later search fail, and that has to replace the stale "reachable" state rather than leave it standing.

### Class filter: a text input narrows a checkbox list, replacing the `<select>`

A `<select multiple>` was considered and rejected — its interaction model (ctrl/cmd-click to multi-select) is not discoverable and is not how the results list below it will work, so the two would teach a person two different gestures for the same "mark several" idea on one screen. Instead: the class filter becomes a text `<input>` (narrows the classes shown, the same debounce-and-filter shape the query input already uses) above a list of `<input type="checkbox">` rows, one per class currently matching what was typed. Checking more than one runs the merged query decided in `proposal.md` (one `searchDirectory` call per checked class, results unioned and de-duplicated by name).

Checkboxes are safe against the harness's DOM contract: they are `input` elements, and `answerNameList`/`confirmNameList` address the modal's `textarea` and `button` by tag directly rather than "the first input," so additional inputs ahead of the textarea do not shift what those helpers find. (`dialogBoxes()`'s generic "first `input`/`textarea`" convention is a separate, pre-existing sharp edge — see Risks.)

### Results: checkboxes plus one non-`<button>` "Add selected" control

Each result row gains a leading checkbox; the row's existing click-to-append behavior is replaced by check-to-mark, and a single "Add selected" control — a plain `<div>` (or `<a>`) with a click handler, styled to read as actionable, following the exact pattern `.safelearn-directory-result` already uses for a clickable non-button element — appends every currently-checked row's name to the textarea in one action and clears the checked state. This satisfies "mark several from one set of results and take them together" without introducing a `<button>` ahead of the modal's real confirm button.

Alternative considered: keep click-to-append as-is, since a person can already click several different rows from one rendered result set (e.g., an unfiltered-by-name, class-only search that returns a whole class at once) without re-searching. Rejected as the sole answer — it silently depends on the query happening to return every wanted name in one page, gives no visual record of what has already been taken, and does not match what the proposal explicitly asks for (mark, review, then commit).

## Risks / Trade-offs

- **Changing `searchDirectory`'s return shape breaks `setDirectoryLoginFixture`**, which stubs it with a bare `async (query) => entries[]`. → Update the fixture in the same change to return `{ outcome: "ok", entries }`, and add a second fixture (or a parameter) to seed `"unreachable"`/`"failed"` for the new checks this design needs. Every existing check built on `setDirectoryLoginFixture` keeps working once the fixture's shape matches.
- **`dialogBoxes()`'s "first `input`/`textarea` in the modal" convention already silently assumes the directory search strip is absent** (it predates this design). Adding more `<input>` elements to the strip does not newly break this — the existing spacing checks that use `dialogBoxes()` do not seed a directory login fixture, so the strip is not rendered when they run — but it is worth confirming this explicitly in `tasks.md` rather than leaving it an accident of test ordering.
- **A checkbox that is checked and then the search is re-run or re-filtered** could lose its checked state if the row is re-rendered before "Add selected" is used. → Rows are keyed by display name; a re-render preserves the checked set across a new search rather than silently dropping marked-but-not-yet-added people. Called out explicitly in `tasks.md` so it is not lost as an implementation detail.
- **The union-of-per-class queries for multi-class filtering costs one `searchDirectory` call per checked class**, same as `proposal.md` already accepts ("cheaper" branch of the trade-off). No mitigation needed beyond what was already decided; noted here only so the cost is visible next to the decision that accepted it.

## Migration Plan

Purely additive/replacing within the existing search strip and the existing `searchDirectory`/`classLikeValues` methods; no settings, storage, or server change. Rollback is reverting the plugin release; `data.json` is untouched by this change. The one thing that must land together in one release: `searchDirectory`'s new return shape and `setDirectoryLoginFixture`'s matching update, since a mismatch between them fails every check built on the fixture rather than only the new ones.
