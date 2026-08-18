## Context

See `proposal.md` — Why. Two pieces of existing plugin code this design builds directly on:

- `NameListModal` (`main.ts`) is the dialog every name-consuming authoring command already opens. Its own comment says it is a plain textarea "because there is no directory to pick from yet" — this change is that "yet."
- The plugin manifest sets `isDesktopOnly: false`. It runs on Obsidian mobile today, and nothing in this change may take that away: no Node.js/Electron-only API (a local HTTP listener, `require("electron").shell`) can be assumed to exist.

`plugin-admin-api-backend` (archived) already ships `GET /api/admin/directory/search`, gated to a teacher-or-admin bearer token verified by introspection, independent of how that token was obtained. This design covers only the plugin's own side of producing that token and the UI built on the endpoint it calls.

## Goals / Non-Goals

**Goals:**
- A login mechanism that needs nothing Node/Electron-only, so it works unchanged on desktop and mobile.
- One coherent place for "pick a name instead of typing it," rather than a second, parallel dialog next to `NameListModal`.
- A clear, honest answer to what "list classes" can mean given the backend has no separate notion of a class.

**Non-Goals:**
- The server-side endpoint's auth gate or its response shape — fixed by `plugin-admin-api-backend`, unchanged here. (Its empty-query behavior is not a non-goal — see Decisions.)
- Writing back to the directory. Every interaction this change adds is read-only.
- Provisioning the new Keycloak client — an operator action, listed in `tasks.md`, not something the plugin does at runtime.
- A distinct "browse classes" server affordance — the backend deliberately folded that into one search endpoint; this design lives with the same ambiguity, see Decisions.

## Decisions

### The browser round-trip returns through Obsidian's own protocol handler, not a loopback listener

`plugin-admin-api-backend`'s proposal text described the redirect loosely as "loopback redirect opened in the system browser." Rejected here: a loopback `http://127.0.0.1:<port>` listener needs a real TCP server, which is unavailable on Obsidian mobile and, even on desktop, adds port-collision and firewall-prompt failure modes for no benefit — Obsidian already owns the `obsidian://` URI scheme and exposes `registerObsidianProtocolHandler`, its supported extension point for exactly this kind of external-round-trip callback, identically on desktop and mobile.

The plugin registers a handler for `obsidian://<manifest-id>-auth` (e.g. `obsidian://safelearn-formatter-auth`) and uses that as the Keycloak client's redirect URI. Starting a login opens the realm's authorization URL with the system browser (`window.open` — Obsidian polyfills it to the OS's default browser on both platforms; no Electron-specific call needed) and stores the PKCE code verifier and a random `state` value in memory for the duration of the attempt.

Because `obsidian://` callbacks are dispatched to whichever Obsidian window is currently frontmost, not necessarily the vault that started the login, the callback is only accepted if its `state` matches a login this vault's plugin instance is actually waiting on. A mismatched or unexpected callback is dropped without a notice — consistent with the "stays silent" requirement, and the person just retries from the vault they meant to log in on.

### A new public Keycloak client, PKCE-only, no secret

A second new client alongside `plugin-admin-api-backend`'s service account: public (no client secret — nothing to protect it on a machine outside this project's control), Standard Flow enabled with PKCE (S256) required, Direct Access Grants disabled (no password grant), redirect URI restricted to the `obsidian://<manifest-id>-auth` pattern. It carries no client roles of its own — the token it produces is a normal end-user login, and everything it is allowed to do is decided by the roles already on that person's account, checked the same way on every request by `plugin-admin-api-backend`'s introspection.

### The token pair is held via `saveData`/`loadData`, refresh token only, re-derived on load

Obsidian's plugin storage (`saveData`/`loadData`, backed by `data.json` in the plugin's folder) is the only place available on both desktop and mobile — there is no OS keychain the community plugin API exposes uniformly across both. That file can end up wherever the vault itself is synced or backed up, so what is written to it is kept as small as it can be: only the refresh token is persisted. The access token is kept in memory only and is re-obtained from the refresh token on each Obsidian start and whenever it is close to expiry, rather than persisting both. A leaked refresh token is still a real exposure, but it is scoped to a client with no roles of its own and can be revoked from the Keycloak admin console the same way a stolen session cookie would be; persisting the access token as well would only widen the same exposure without buying anything.

### One dialog gains a search strip; no second dialog

`NameListModal` gains an optional search field above its existing textarea, rather than being duplicated into a directory-only variant. Typing there (debounced) queries `/api/admin/directory/search`, and a class dropdown next to it narrows the query to one class; choosing a result appends a trimmed line to the textarea exactly as if it had been typed. This keeps `plugin-authoring-commands`' "every dialog is laid out the same way" intact — the field is richer, not multiplied — and satisfies the modified requirement's fallback scenario for free: with no instance configured, the search strip is simply not rendered and the textarea behaves exactly as it does today.

The teacher picker is the same search strip, scoped to results holding the `teacher` role/group, offered the same way.

### Two more settings carry the Keycloak realm, both defaulted

Only the safeLearn instance URL was originally planned as a setting. But `keycloak.json` — which holds `auth-server-url` and `realm` — is deliberately never served to the browser (`test/checks/deployment-surface.js` asserts this), and a self-hosted deployment can point at a Keycloak of its own, so neither value can be hardcoded or discovered remotely. The settings tab therefore gains two more fields, **Keycloak URL** and **Realm**, each defaulted to this project's shared identity provider (`https://auth.unterrainer.info/`, realm `safeLearn`) — the same default/override shape `docs-testing.md` already uses for `SAFELEARN_TEST_IDP_URL`/`SAFELEARN_TEST_REALM`. Most installations, including the shared demo realm, never touch them; a self-hosted deployment overrides both the same way it already overrides the safeLearn instance URL. The client id is not a setting — `safelearn-plugin` (per `tasks.md` §1.1) is this project's own convention, not something that varies per deployment.

### An empty query now returns the whole directory — the one server change this design makes

"List classes" and the class-filter dropdown (below) both need to enumerate every role/group value the directory currently holds, in one call, not per keystroke. `plugin-admin-api-backend`'s endpoint answered an empty `q` with `[]`, without a Keycloak round-trip — deliberate at the time, and locked in by its own test. There is no substring guaranteed to match every person in an arbitrary school's directory, so no query this design could send would enumerate the full set; a sweep over many single-character queries was considered and rejected as a workaround for a gap the server can close directly and honestly instead.

An empty (or missing) `q` on `GET /api/admin/directory/search` now returns the whole directory, mapped exactly as a match is (`{ name, roles }`). The auth gate is unchanged — still a teacher or admin identity, checked the same way — and this does not hand out anything such a caller could not already reconstruct today by sweeping queries; it just answers directly instead of making the caller do that. The 10-minute in-process cache on the realm's user list (`middlewares/directory-service.js`) means this costs one real Keycloak round-trip per cache window, the same as any other search does.

### "List classes" is "every role/group value that is not a built-in marker" — an accepted approximation

The backend has no closed notion of what counts as a class, by design — `plugin-admin-api-backend`'s own design.md folded "class," `teacher`, and something like `examParticipant` into one flat role/group map on purpose. The plugin cannot recover a distinction the backend never made. "List classes" and the class-filter dropdown are therefore both implemented as: every role/group value across the search results that is not one of `teacher`, `teachers`, `student`, `students`, `admin`. This will occasionally surface a non-class marker (an `examParticipant`-style value) as if it were a class. Accepted, and consistent with the backend's own stance that filtering role-vs-name is a UI concern, not something the server should be made to know.

The command itself is realized as a `Notice` (duration `0`, dismissed by the person reading it) listing the values found — the same component `reportReservedNames` already uses for a comparable "read this until you dismiss it" message, rather than a new modal class for a one-shot read-only list.

## Risks / Trade-offs

- **A vault's `data.json` can end up synced or backed up somewhere the school does not control**, and it holds a refresh token. → Mitigated by persisting only the refresh token (not the access token), by the token's client carrying no roles, and by revocation being available from Keycloak's admin console the same as for any other session.
- **`obsidian://` callback delivery is process-wide, not per-vault-window**, so a login started in the wrong window, or with more than one vault open, can misdeliver. → Mitigated by the `state`-checked, silently-dropped-if-unmatched handling above; worst case is retrying the login from the intended vault.
- **"List classes" cannot be exact**, because the backend does not distinguish a class from any other role/group value. → Accepted; documented as approximation, matching the backend design's own position.
- **`window.open` for the system browser is a thinner abstraction than Electron's `shell.openExternal`**, and its exact behavior across Obsidian mobile's iOS/Android hosts is less battle-tested than desktop. → No mitigation beyond manual verification on both platforms before release; called out in `tasks.md`.

## Migration Plan

Purely additive on the plugin side: a new settings tab, a new search strip inside an existing dialog, one new read-only command, and local token storage that is empty (and therefore inert) until a person logs in. No existing command's behavior changes when no instance is configured. Requires one new Keycloak client, provisioned by an operator per `tasks.md` — no change to the client `plugin-admin-api-backend` already added. Rollback is reverting the plugin release and deleting the new Keycloak client; nothing stored client-side needs migrating back, since `data.json` holding a stale refresh token is simply ignored by an older plugin version that does not read it.
