Source proposal: AI/proposals/plugin-admin-directory-ui.md

## Why

The plugin already knows how to write one restricted section per name — but only ever from names typed or pasted by hand. `NameListModal` says as much in its own comment: it is a text field "because there is no directory to pick from yet." `plugin-admin-api-backend` closed that gap on the server: `GET /api/admin/directory/search` now answers, for a teacher or admin identity, who exists in the school's directory and which classes/roles they hold. Nothing on the plugin side calls it — a teacher still has to know a class roster by heart, or keep a pasted copy of it lying around.

## What Changes

- The plugin gains its own identity toward Keycloak, independent of the safeLearn server's browser session. It performs a full Authorization Code + PKCE login directly against the school's Keycloak realm — the mechanism `plugin-admin-api-backend`'s design already commits to on the server's side of that exchange — using a short-lived local HTTP listener as the redirect target and the system browser to complete the interactive part. What it stores afterward is a refreshable token pair, not a password; where and how that pair is held is weighed, not defaulted to a plaintext settings field just because that is the fastest thing to build — see `design.md`.
- A new settings field holds the safeLearn instance's base URL — one per vault, since it differs per school. The plugin is distributed through Obsidian's community plugin list and is installed by people with no safeLearn instance at all: everything that depends on this URL (the login, both commands below) SHALL stay silent, not raise an error, while it is unset.
- **"List classes" command.** Queries the directory for everything that looks like a class — the same role/group values `getLdapGroups` and the admin-API search already carry — and shows the result. Read-only; no document is changed.
- **A directory picker for students, filterable by class, and one for teachers.** Both backed by the search endpoint, offered wherever a command currently asks for a list of names by opening `NameListModal`. Typing or pasting a list SHALL remain possible alongside the picker — the directory has no entry for a guest, or for a student not yet enrolled.

## Capabilities

### New Capabilities
- `plugin-directory-auth`: the plugin's own Authorization Code + PKCE login against Keycloak (loopback redirect, system browser), the token pair it ends up holding and how that is refreshed and stored, and the safeLearn instance URL setting including silent behavior while unset.
- `plugin-directory-search`: the "List classes" command and the student/teacher pickers, both querying `GET /api/admin/directory/search` and filterable by class.

### Modified Capabilities
- `plugin-authoring-commands`: "The names are given to the command" gains a second source — names chosen from a directory picker — alongside the existing typed/pasted list. The existing prohibitions stand: still never taken from a selection, and still never read from a file in the vault.
- `directory-search` (server-side, `plugin-admin-api-backend`'s capability): an empty or missing `q` now returns the whole directory instead of `[]` — see Impact.

## Impact

- **New plugin-side code**: a PKCE flow (code verifier/challenge, a loopback HTTP listener, opening the system browser); a settings tab (the plugin has none today — everything so far has been commands and rendering); an HTTP client using Obsidian's `requestUrl` rather than `fetch`, since a renderer-process `fetch` is subject to the same-origin/CORS handling `requestUrl` is built to bypass; the two commands/pickers themselves; and a change to whatever currently opens `NameListModal` directly, to offer the picker first where a directory is configured.
- **New settings**: the safeLearn instance URL, the Keycloak URL and realm (both defaulted to the shared identity provider — needed because `keycloak.json` is deliberately never served to the browser, so the plugin cannot discover them remotely; see `design.md`), and the stored token pair (exact shape and storage location decided in `design.md`).
- **One small server change, discovered during implementation.** `plugin-admin-api-backend`'s endpoint answers an empty `q` with `[]` (tested, documented in `AI/architecture.md`) — deliberate, but it leaves "list classes" with no query that is guaranteed to enumerate every role/group value. An empty `q` now returns the whole directory, mapped the same way a match is; the caller is already gated to a teacher or admin identity that could reconstruct the same list today by sweeping single-character queries. See `AI/openspec/changes/plugin-admin-directory-ui/specs/directory-search/spec.md`. Everything else server-side is unchanged; the rest of this change remains plugin-repo-only.
- **No change to `NameListModal`'s own behavior.** A typed or pasted list keeps working exactly as it does today, with or without an instance configured.

## Order

After `plugin-admin-api-backend` — without it there is nothing here to query. That change is already archived (`2026-08-18-plugin-admin-api-backend`), so this one is unblocked.
