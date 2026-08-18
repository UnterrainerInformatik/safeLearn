## 0. Server change: an empty query enumerates the directory

- [x] 0.1 `GET /api/admin/directory/search` with an empty or missing `q` now returns the whole directory (`{ name, roles }` per person) instead of `[]` — `middlewares/directory-service.js`, `app.js`. See `design.md` and `specs/directory-search/spec.md`.
- [x] 0.2 Update the existing server test that asserted `[]` for an empty query (`test/checks/directory-search.js`) and `AI/architecture.md`'s route table to match.

## 1. Keycloak configuration (operator action, not code)

- [x] 1.1 In the `safeLearn` realm, create a new **public** client (e.g. `safelearn-plugin`) with Standard Flow enabled, PKCE (S256) required, Direct Access Grants **off**, and no client secret.
- [x] 1.2 Set its Valid Redirect URIs to the plugin's protocol callback, e.g. `obsidian://safelearn-formatter-auth`. No Web Origins entry is needed — the redirect is a full page navigation in the system browser, not a CORS fetch.
- [x] 1.3 Confirm the client carries no client roles of its own (see `design.md` — its token's authority comes from the logged-in person's own roles, checked by `plugin-admin-api-backend`'s introspection, not from this client).
- [x] 1.4 Document this client in the plugin repository's `README.md` alongside whatever it already says about setup: which realm client id it expects, and that an operator must create it before login works.

## 2. Settings tab and instance URL

- [x] 2.1 Add a `PluginSettingTab` (the plugin has none today) with three fields: the safeLearn instance base URL (empty by default), and Keycloak URL / Realm (each defaulted to `https://auth.unterrainer.info/` / `safeLearn`, the shared identity provider `docs-testing.md` already defaults `SAFELEARN_TEST_IDP_URL`/`SAFELEARN_TEST_REALM` to — see `design.md`). The client id is a fixed constant (`safelearn-plugin`), not a field.
- [x] 2.2 Persist all three via `saveData`/`loadData`, the plugin's existing settings mechanism (there is none today — this introduces it).
- [x] 2.3 Treat the instance-URL setting as unset for an empty or whitespace-only value; nothing downstream should have to repeat that check.
- [x] 2.4 Default a scheme-less instance URL or Keycloak URL to `https://` — found manually testing: a value typed without one resolves against nothing and every request under it fails outright.
- [x] 2.5 While logged in, decode the held access token's own `resource_access.safeLearn.roles` claim (`utils.js`'s own source, read locally) and show a distinct settings message when it carries neither `teacher`/`teachers` nor `admin` — found manually testing: the directory endpoint's refusal is deliberately undifferentiated from "not logged in" (`app.js`, §3.2), so without this a login that lacks the role looks identical to no login at all, silently.

## 3. Directory HTTP client

- [x] 3.1 Add a thin wrapper around Obsidian's `requestUrl` (not `fetch` — see `design.md`) for calling the configured instance's `GET /api/admin/directory/search?q=`, attaching the current access token as a bearer header.
- [x] 3.2 On a 401/refusal from the endpoint, treat it the same as "not logged in" (design: the endpoint's refusal is deliberately undifferentiated) rather than surfacing the server's response.
- [x] 3.3 Map each result entry to `{ name, roles }`, matching the endpoint's response shape — no other field is expected or read.

## 4. PKCE login

- [x] 4.1 Register the plugin's protocol handler (`registerObsidianProtocolHandler`) for the callback action decided in 1.2, in `onload`.
- [x] 4.2 Add a "Log in" control in the settings tab, shown only while an instance URL is configured and no valid login is currently held.
- [x] 4.3 On invoking it: generate a PKCE code verifier/challenge and a random `state`, store them in memory keyed by that `state`, and open the realm's authorization URL via `window.open`.
- [x] 4.4 In the protocol handler callback: look up the stored `state` from the incoming parameters; if it does not match a pending attempt in this vault's plugin instance, drop the callback silently (design: cross-window misdelivery is expected, not an error).
- [x] 4.5 On a matching callback, exchange the authorization code for a token pair at the realm's token endpoint via `requestUrl`, using the stored code verifier — no client secret, per 1.1.
- [x] 4.6 Add a "Log out" control next to "Log in" (shown only while a login is held) that discards the stored refresh token and any in-memory access token.

## 5. Token storage and refresh

- [x] 5.1 Persist only the refresh token via `saveData` (design: access token is memory-only, never written to `data.json`).
- [x] 5.2 On plugin load, if a refresh token is stored, attempt a refresh immediately to obtain an in-memory access token; do not treat a failure here as an error the person sees — it is simply "not logged in" until they log in again.
- [x] 5.3 Before each directory client call (3.1), refresh the access token if it is missing or close to expiry; store whatever refresh token comes back (rotation-safe).
- [x] 5.4 A refresh call that itself fails clears the stored refresh token and returns the plugin to "not logged in" — no repeated failing refresh attempts on every subsequent call.

## 6. "List classes" command

- [x] 6.1 Add a command that calls the directory client with an empty query to enumerate role/group values, now that the server returns the whole directory for one (design: reuse whatever the search strip's own class-list fetch does, see 7.2 — do not build a second code path for the same data).
- [x] 6.2 Reduce the result to role/group values excluding `teacher`, `teachers`, `student`, `students`, `admin` (design: the class-detection heuristic), de-duplicated.
- [x] 6.3 Show the result via `Notice` with duration `0`, following `reportReservedNames`'s existing pattern for a dismiss-when-read message.
- [x] 6.4 The command is registered only while a login is held (per `plugin-directory-auth`'s "stays silent without one" requirement) — not shown in the palette otherwise.

## 7. Directory search strip in `NameListModal`

- [x] 7.1 Add an optional search input and a class-filter dropdown above the existing textarea, rendered only when a login is held; absent entirely otherwise, so the modal is pixel-for-pixel what it is today with no instance configured.
- [x] 7.2 Populate the class dropdown from the same reduction as 6.2, fetched once per modal open, not per keystroke.
- [x] 7.3 Debounce the search input (~300ms) and call the directory client (3.1) with the current query and selected class filter.
- [x] 7.4 Render matches as a short list showing name and roles/groups (per `plugin-directory-search`'s response-shape requirement — nothing else is available to show).
- [x] 7.5 Choosing a match appends its trimmed display name as a new line in the textarea (design: "returns names to whatever opened it," realized as appending into the same field a typed name would occupy), and does not close the modal — more than one match can be added before confirming.
- [x] 7.6 Confirm/Enter/Ctrl+Enter behavior is unchanged from today's `NameListModal` (spec: `plugin-authoring-commands` "every dialog is laid out the same way" — only the field grew, not the confirmation).

## 8. Regression: typed/pasted names still work unchanged

- [x] 8.1 With no instance configured, confirm every command that opens `NameListModal` behaves exactly as before this change (no search strip rendered, no extra network activity attempted).
- [x] 8.2 With an instance configured but no login held, confirm the same — login, not just configuration, gates the search strip and the two commands.

## 9. Test coverage

- [x] 9.1 Extend `test/obsidian/` (from `plugin-verification`, already in place) with a check that the settings tab renders the instance-URL field and persists a value across a reopen.
- [x] 9.2 Add a check that with no instance configured, `NameListModal` shows no search strip and behaves exactly as the existing checks already assert.
- [x] 9.3 Add a check that, with a login state pre-seeded into the assembled test vault's `data.json` (a fixture refresh token, or a stubbed directory client — decide during implementation whichever keeps the check independent of a live Keycloak round-trip) and a stubbed directory response, the search strip renders matches and appending one adds a line to the textarea.
- [x] 9.4 Add a check for the class-detection heuristic (6.2) against a fixture role/group set that includes a non-class marker, asserting it is treated as a class the same as an actual one (documenting the accepted approximation, not hiding it).
- [ ] 9.5 The real PKCE round trip (system browser, live Keycloak login, protocol-handler callback) is not automated — driving a real OS-level browser and an Electron app's custom URI scheme dispatch from Puppeteer is not something `test/obsidian/`'s CDP-attached harness can do. Verify it by hand once against the demo realm on desktop, and once on Obsidian mobile if a device is available; record what was checked in `docs-testing.md` rather than leaving it unstated.
- [x] 9.6 Confirm `npm run test:obsidian` still passes in full, and that `npm test` (the server suite) passes with the one intentional change from §0 (the empty-query test now asserts the whole directory, not `[]`) — no other server behavior changes.
- [x] 9.7 Fixed a test-isolation gap `assembleVault` had from the start: the vault's plugin folder is a link to the real checkout (`assembleVault`'s own comment on why — the plugin is "the thing under test"), so `data.json` inside it is the same file a real vault open on that same checkout writes to, not a copy. Manual testing for 9.5/11.3 confirmed it concretely — a real login's settings leaked in and failed three settings-tab checks (empty-by-default, defaults, no-login-control) until `assembleVault` started deleting that `data.json` itself. Trade-off worth stating rather than leaving implicit: this now means running `npm run test:obsidian` clears the real plugin checkout's own login/settings, in whichever vault has it linked in — expected each time from here on, not a fresh surprise.

## 10. Documentation

- [x] 10.1 Update the plugin repository's `README.md`: the new settings, what logging in requires (an operator-provisioned Keycloak client, per §1), and that everything stays inert without an instance configured.
- [x] 10.2 Record the new capabilities, the new settings tab, and the manual-verification gap from 9.5 in `AI/architecture.md`, following its existing level of detail for the plugin.

## 11. Close out

- [x] 11.1 Build the plugin (`npm run build` in the plugin repo) and confirm `main.js` reflects the change — `plugin-verification`'s harness tests the build output, not `main.ts` directly.
- [x] 11.2 Run `npm run test:obsidian` and `npm test`; both green.
- [ ] 11.3 Manually exercise the full flow once end-to-end against the demo realm: configure an instance, log in, list classes, filter students by class, insert a section from a picked name, log out — confirming the picked name produces the same document a typed one would have.
