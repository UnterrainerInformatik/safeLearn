## 0. Server regression test: Keycloak admin-API pagination

- [x] 0.1 Add a test (unit-level, not a live-Keycloak check) for `fetchAllDirectoryUsers` / `fetchDirectoryUserPage` (`middlewares/directory-service.js`) that stubs `fetch` to answer more than one page (e.g. two pages of `directoryPageSize` and a short final page) and asserts every user across all pages is returned — guarding the fix that already landed, with nothing behind it today.
- [x] 0.2 Confirm the existing live-realm checks in `test/checks/directory-search.js` are unaffected (they exercise the shared demo realm, which holds far fewer than 100 accounts, so they cannot exercise pagination themselves — that is why 0.1 is a stub-based test, not an extension of this file).

## 1. `searchDirectory` / `classLikeValues` report an outcome

- [x] 1.1 Change `SafeLearnPlugin.searchDirectory`'s return type to `{ outcome: "ok" | "unreachable" | "failed" | "refused"; entries: DirectoryEntry[] }`, per `design.md` — Decisions: a caught `requestUrl` exception is `"unreachable"`; `response.status === 403` is `"refused"`; any other `response.status >= 400` is `"failed"`; success is `"ok"` with `entries` parsed as today.
- [x] 1.2 Wrap the `requestUrl` call in `searchDirectory` in a try/catch — today a network-level failure is not caught at all and would surface as an unhandled rejection.
- [x] 1.3 Update `classLikeValues()` to carry the outcome through (it wraps `searchDirectory("")`), reducing `entries` to class-like values only when the outcome is `"ok"`.
- [x] 1.4 Update every existing caller of `searchDirectory`/`classLikeValues` in `main.ts` (the "list classes" command, `buildDirectorySearch`'s `runSearch`) to destructure `{ outcome, entries }` instead of treating the return value as a bare array.

## 2. Reachability status in the search strip

- [x] 2.1 Add a status element above the query input in `buildDirectorySearch`, hidden by default, per `design.md` — Decisions ("The status line is a plain element, not a `<button>`").
- [x] 2.2 Populate it from the outcome of the `classLikeValues()` call already made once per modal open (7.2 of the prior change): hidden for `"ok"`, hidden for `"refused"` (unchanged from today — `plugin-login-state`'s boundary is not touched), a distinct short message for `"unreachable"` and for `"failed"`.
- [x] 2.3 Update the same status element after every subsequent `runSearch` call, from that search's own outcome — a picker opened reachable can have a later search fail, and the shown state must follow, not stay stale.
- [x] 2.4 On `"unreachable"` or `"failed"`, do not clear or replace whatever the results list currently shows from an earlier, successful search — the failure is additive information, not a wipe of what was already found.

## 3. Class filter: searchable, multi-select

- [x] 3.1 Replace the `<select class="safelearn-directory-class-filter">` with a text `<input>` (narrows the classes offered, same debounce shape the query input already uses) above a list of `<input type="checkbox">` rows, one per class currently matching what was typed — per `design.md` — Decisions ("Class filter: a text input narrows a checkbox list").
- [x] 3.2 Keep the full, unfiltered set of class names in memory from the one `classLikeValues()` fetch per modal open (unchanged from 7.2 of the prior change) — the text input narrows which of them are *shown as rows*, it does not re-fetch.
- [x] 3.3 On checking or unchecking a class, re-run the search: one `searchDirectory` call per currently checked class, results unioned and de-duplicated by name (per `proposal.md`'s decided client-merge approach) — with none checked, behave as today's "no class filter" (matches drawn from the text query alone, or the whole directory if that is also empty).
- [x] 3.4 Preserve which classes are checked across a re-render of the class list itself (e.g. after typing further narrows/widens which rows are shown) — checking then narrowing away a class's row must not silently uncheck it.

## 4. Results: multi-select and bulk "Add selected"

- [x] 4.1 Give each rendered result row a leading `<input type="checkbox">`; replace the current click-to-append handler with check-to-mark (per `design.md` — Decisions, "Results: checkboxes plus one non-`<button>` 'Add selected' control").
- [x] 4.2 Add one "Add selected" control below the results list, implemented as a plain non-`<button>` clickable element (a `<div>` or `<a>` with a click handler), following the same pattern `.safelearn-directory-result` already uses for a clickable non-button row — never a `<button>` tag, per the existing constraint documented in `buildDirectorySearch`'s own comment and restated in `proposal.md` — Impact.
- [x] 4.3 Clicking "Add selected" appends every currently checked row's display name to the textarea in one action (one line each, following `appendName`'s existing separator handling) and clears the checked state.
- [x] 4.4 Key rows by display name so a re-render from a new search preserves which previously-shown names are still checked, per `design.md` — Risks ("A checkbox that is checked and then the search is re-run... could lose its checked state").
- [x] 4.5 Confirm no `<button>` element exists anywhere in the search strip's DOM at any point — `dialogBoxes()`/`answerNameList`/`confirmNameList` (`test/obsidian/harness.js`) depend on the modal's only `<button>` being the Insert/confirm control.

## 5. Test fixture updates

- [x] 5.1 Update `setDirectoryLoginFixture` (`test/obsidian/harness.js`) to stub `searchDirectory` returning `{ outcome: "ok", entries }` instead of a bare array, matching the new return shape from 1.1 — every existing check built on this fixture must keep passing unmodified beyond this shape change.
- [x] 5.2 Add a way to seed `"unreachable"` and `"failed"` outcomes through the same fixture (e.g. an `outcome` option alongside `entries`), for the new checks in §7 below.

## 6. Harness helper updates

- [x] 6.1 Update `searchDirectoryStrip` (`test/obsidian/harness.js`) for the new class filter: typing into the class-filter text input and checking one or more resulting class rows, replacing the current single `<select>` value-set.
- [x] 6.2 Add a helper to check one or more rendered result rows by display name (replacing/augmenting `chooseDirectoryResult`'s single click-to-append) and a helper to click "Add selected."
- [x] 6.3 Add a helper reading the reachability status element's current text/visibility, for the new checks in §7.
- [x] 6.4 Confirm `directorySearchResults` (reads rendered result rows as text) needs no change beyond whatever the checkbox markup adds to a row's `textContent` — adjust its read if the added checkbox changes what `textContent` returns.

## 7. Test coverage (`test/obsidian/plugin.test.js`)

- [x] 7.1 A check that filtering by more than one checked class returns the union of both classes' matches (spec: "Searching with more than one class filter").
- [x] 7.2 A check that typing into the class filter narrows the offered class rows (spec: "Narrowing the class filter itself by typing").
- [x] 7.3 A check that checking several result rows from one rendered set and clicking "Add selected" appends all of them to the textarea in one action, without an intervening search (spec: "Marking several results and taking them over together," both the student and teacher pickers).
- [x] 7.4 A check, using the fixture addition from 5.2, that an `"unreachable"` outcome on modal open is shown before any query is typed (spec: "The instance cannot be reached").
- [x] 7.5 A check that an `"ok"` outcome shows nothing about connectivity (spec: "The directory is reachable").
- [x] 7.6 A check that a `"failed"` outcome from a search run after a successful open is shown, distinct from an empty match and from `"unreachable"` (spec: "A search request fails at the server").
- [x] 7.7 A check that a `"refused"` outcome (403) remains indistinguishable from not being logged in — no status text shown, consistent with existing `plugin-login-state` checks (spec: "A request is refused for identity or role").
- [x] 7.8 Confirm the existing checks from the prior change (9.1–9.4 in the archived `plugin-admin-directory-ui` tasks) still pass against the new markup, updating only what §6's helper changes require. Verified by running `test/obsidian/plugin.test.js` against a real Obsidian: all 16 directory-related checks pass.

## 8. Documentation

- [x] 8.1 Update `AI/architecture.md`'s record of the plugin's directory picker to describe multi-class filtering, multi-select results, and the reachability states, following its existing level of detail.
- [x] 8.2 Note in the plugin repository's `README.md`, if it documents the picker's behavior at all today, that classes and results can now be multi-selected.

## 9. Close out

- [x] 9.1 Build the plugin (`npm run build` in the plugin repo) and confirm `main.js` reflects the change.
- [x] 9.2 Run `npm run test:obsidian` and `npm test` (this repo); both green. **With caveats, both pre-existing and unrelated to this change.** `npm run test:obsidian`: all 16 directory-related checks (including the 7 new from §7) pass; 28 failures elsewhere are a pre-existing gap - the plugin checkout has no `loginState()`/`notifyLoginStateChanged()` at all, despite `architecture.md` and the tests assuming it exists (see memory `plugin-login-state-missing`). `npm test`: 90/96 pass; the 6 failures are `test/checks/directory-search.js` getting `502` from a pre-existing invalid `DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET` in `.env` (see memory `directory-service-credentials-invalid`) - the new `fetchAllUserPages`/`fetchDirectoryUserPage` regression test passes.
- [x] 9.3 Manually exercise the full flow once against the demo realm: open the picker, filter by two classes at once, mark several students and add them together, then simulate the instance being unreachable (e.g. a wrong instance URL) and confirm that is shown before any query is typed. **Partial - see report to user.** Ran a real local server + a real PKCE login against the demo realm via Obsidian automation. The "unreachable" case is fully verified: shown before any query was typed, exactly per spec. The "ok" happy path (multi-class filter, multi-select add) could not be exercised: the local `.env`'s `DIRECTORY_SERVICE_CLIENT_ID`/`_SECRET` are rejected by the real Keycloak realm (`invalid_client`), a pre-existing credentials problem unrelated to this change - the plugin correctly showed "The directory search failed." for it, which is itself evidence the `"failed"` outcome path works against a real server error.
