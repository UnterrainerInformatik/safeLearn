Source: AI/open-proposals.md

## Why

Two things a teacher needs to look after the instance are only visible where a teacher does not look. The unreferenced attachments that `attachment-access-control` refuses are written to the server log after every scan, so removing them from the repository means reading `docker logs` on the server. The directory's state (fetch running or not, how many entries, when they were built, how many records were skipped) is shown only on the Obsidian plugin's settings tab, behind a bearer token. Both belong on pages a teacher opens from the web app's menu with the session they already have.

## What Changes

- A new section **Administration** in the settings menu, shown only to a session acting as a teacher (not to a teacher in student view, not to students). It holds two buttons, **Unreferenced attachments** and **Directory status**, each opening a page of its own.
- **`/admin/attachments`**: the list the last scan holds in process (`unreferencedAttachments()`), with the time of that scan and the count, grouped by folder, and a **Copy paths** button that puts the list on the clipboard one path per line, ready for `git rm`. Read-only; nothing is deleted from the page.
- **`/admin/directory`**: the same report `GET /api/admin/directory/status` gives the plugin, as a page: phase and progress while a fetch runs, then entries, built at and skipped. While a fetch runs the page polls and redraws on its own. `skipped` stays a count, exactly as today. The page never starts a fetch.
- Two JSON routes behind the browser session for the pages to read: `GET /admin/api/attachments` and `GET /admin/api/directory/status`. Both use the same teacher gate as the pages. The existing bearer route `/api/admin/directory/status` stays as it is.
- The pages and their routes exist only where a reader has an identity (operating tiers 2 and 3). With `AUTH=none` (from the archived `publishing-without-keycloak`) they are not registered, and the menu section is not drawn.
- Texts in English and German through the BabelEdit catalogs (`i18n/en.json`, `i18n/de.json`); dates and numbers through `i18n/format.js` in the reader's format.
- Harness checks for the menu section, both pages, the gate, and the 390px viewport.

## Capabilities

### New Capabilities
- `teacher-admin-pages`: the menu section and the two read-only pages for teachers, their gate, and their absence without an identity.

### Modified Capabilities
- `directory-fetch-status`: the status may also be read by a browser session acting as a teacher or admin, not only by a bearer token; what it reports and what it withholds are unchanged.

## Impact

- `app.js`: the four new routes, registered after `checkAuthenticated`, only when `registerRoutes` runs with `identity.mode === "keycloak"`.
- New `admin/` directory: routes, the gate (reusing `hasSomeRoles` and the identity check the exam module's `gate.js` uses, without depending on the exam module), and the two page clients.
- `obsidian.js`: `getTopdownMenu` draws the Administration section (only when `withoutIdentity()` is false); `wrapInPage` renders the pages with `title` and `wide`. `unreferencedAttachments()` gets its first reader.
- `middlewares/directory-service.js`: `getDirectoryStatus()` gets a second reader; no change to what it returns.
- `i18n/en.json`, `i18n/de.json`, `css/` (one small stylesheet or additions to an existing one).
- `AI/architecture.md` (route table, component map), `docs-permissions.md`, `docs-keycloak.md`.
- No new dependency, no database, no Keycloak call. Works with the exam module on or off.
