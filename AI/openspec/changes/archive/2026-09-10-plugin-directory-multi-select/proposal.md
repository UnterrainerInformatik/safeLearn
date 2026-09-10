Source proposal: AI/proposals/plugin-directory-multi-select.md

## Why

`plugin-admin-directory-ui` gave the name-list dialog a directory picker, but it was built and tested against a handful of demo accounts. Against a real school's directory it falls short in two ways: the class filter is a plain `<select>` that does not scale past a school's actual class count, and choosing a name is one click per name, one search at a time — there is no way to mark several matches and take them all at once. On top of that, the picker gives no sign of *why* a search came back empty: an unreachable instance, a failed request, and a directory that genuinely has no match for the query all look identical today.

Separately, the search endpoint had silently truncated the directory at Keycloak's default page of 100 users for months — every class and every person past the first page invisible to search, with nothing reporting that there was more. That is already fixed (`middlewares/directory-service.js` now pages through the admin API), but nothing guards the fix: a regression there would be silent again.

## What Changes

- **The class filter becomes searchable.** Typing narrows the list instead of scrolling a `<select>` built for 10 entries against a directory that holds 30+.
- **The class filter allows more than one class at once.** Choosing 1AHIF and 2AHIF is possible in one picker session. Per the client/server split decided for this change, this stays client-side: the plugin issues one directory query per chosen class and merges the results, rather than teaching the server endpoint a multi-value query — `directory-search`'s one-query-string contract (`AI/openspec/specs/directory-search/spec.md`) is unchanged.
- **Name results (students and teachers) become multi-selectable.** Several matches can be marked and appended to the name list together, instead of a click-search-click cycle per name.
- **Opening the picker states whether the directory is reachable**, rather than leaving that to be inferred from an empty result after a search is tried. A request that never reached the instance and a request the server itself failed on are shown as what they are — distinct from a query that legitimately matched nothing. This does **not** touch the boundary `plugin-login-state` already draws deliberately: whether the refusal was for want of an identity or want of the teacher/admin role stays indistinguishable, unchanged.
- **A regression test for the Keycloak pagination fix.** No behavior changes here — `directory-search`'s existing requirement that a search covers the whole directory already implies this — but the fix has had no test since it landed, and the failure mode (a directory quietly missing everyone past user #100) is exactly the kind that goes unnoticed until someone can't find a real student.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `plugin-directory-search`: the class filter gains search-to-narrow and multi-selection; student and teacher pickers gain multi-selection on results; a new requirement covers showing whether the directory is reachable as soon as the picker opens, and telling an unreachable instance apart from a failed request, apart from a genuinely empty match.

## Impact

- **`main.ts` (plugin repo)**: `NameListModal.buildDirectorySearch` — the class filter changes from a `<select>` to a searchable, multi-select control; the results list changes from click-to-append to selectable rows plus a bulk "add selected" action; a connection-status element is shown as soon as the strip is built, before any query is sent. `SafeLearnPlugin.searchDirectory`/`classLikeValues` currently collapse every non-2xx response and every network failure to `[]` alike (`tasks.md` #3.2 of the prior change) — that collapse stays for an actual auth refusal (still indistinguishable from "not logged in", per `plugin-login-state`), but a request that never reached the instance and one the server answered with an error need to be told apart from an empty match, which means this can no longer be a single silent fallback to `[]`. Decided in `design.md`.
- **`test/obsidian/harness.js` / `test/obsidian/plugin.test.js` (this repo)**: `searchDirectoryStrip`, `chooseDirectoryResult`, and `directorySearchResults` assume a single `<select>` and one-click-appends-one-name; they need matching rewrites, plus new checks for multi-class filtering, multi-selecting results, and the reachability states. `NameListModal`'s dialog-finding convention (`dialogBoxes`: first `input`/`textarea`, first `button`) is unchanged by this — no new `<button>` may be introduced ahead of the existing confirm button, per `main.ts`'s own comment on `buildDirectorySearch`.
- **`middlewares/directory-service.js` / `test/checks/directory-search.js` (this repo)**: gains a regression test exercising more than one Keycloak admin-API page; no route, requirement, or response-shape change.
- **No change to `plugin-directory-auth` or `plugin-login-state`.** The reachability signal this adds concerns a directory search issued while already logged in, not the login state itself, and does not alter what a login failure names or how its cause is shown.
- **No change to `directory-search` (server-side, `AI/openspec/specs/directory-search/spec.md`).** The endpoint's one-query-string contract is unchanged; multi-class filtering is resolved client-side, per the trade-off called out above.

## Order

No blocking predecessor. Both changes this builds on — `plugin-admin-api-backend` and `plugin-admin-directory-ui` — are already archived.
