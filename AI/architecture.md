# SafeLearn — Architecture and Code Analysis

Analysis of the SafeLearn codebase as of 2026-08-15 (branch `master`, commit `82c1d50`).

This document is written from the source first and the documentation second, so documented behavior and implemented behavior can be told apart. It complements — it does not replace — `README.md` and the `docs-*.md` files; see [Source Documents](#10-source-documents).

## 1. Overview

SafeLearn is a single-process Node.js web server that publishes a directory of Obsidian-flavored Markdown files as an authenticated website. A teacher writes lecture material in Obsidian; students read the rendered result in a browser.

Three properties shape the whole design:

- **Server-side authentication.** Every request passes through a Keycloak OIDC login before a single byte of content is produced. Markdown is read from disk, filtered, and rendered per request, so unauthorized clients and crawlers never receive the content at all. This is the stated reason the project runs its own server instead of using GitHub Pages (`README.md` — Technical Explanation).
- **One source document, three renderings.** The same `.md` file is served as a scrollable page, as a print-oriented document, or as a Reveal.js presentation, selected by query parameter.
- **Permissions inside the content.** A `@@@`-directive at the top of a file restricts the whole file; the same directive around a block restricts part of it. Roles come from Keycloak client roles and LDAP groups, and each role may carry a time window.

There is no database, no client-side framework, and no build step for the application code. Runtime state is a set of in-memory maps in `obsidian.js`, rebuilt by a recursive filesystem scan at startup and on file changes. Per-user preferences are not stored locally either — they are written back to Keycloak as user attributes.

## 2. Technology Stack

Versions are the ranges declared in `package.json`; the resolved column is the version currently pinned in `package-lock.json`.

### Runtime and server

| Component | Declared | Resolved | Where it is used |
| --- | --- | --- | --- |
| Node.js | `.nvmrc`: `20` | `Dockerfile`: `node:25.6.0-alpine` | ESM throughout (`"type": "module"`); top-level `await` in `app.js` |
| `express` | `^4.18.3` | 4.22.1 | `app.js` — the entire HTTP surface, plus `express.static` for assets |
| `express-session` | `^1.18.0` | 1.19.0 | `middlewares/keycloak-middleware.js` — session with the default `MemoryStore` |
| `dotenv` | `^16.4.5` | 16.6.1 | `app.js` (`config()`); `npm run prod` also preloads it via `-r dotenv/config` |
| `nodemon` | `^3.1.5` | 3.1.11 | `npm start` only — development restart-on-change |

### Authentication

| Component | Declared | Resolved | Where it is used |
| --- | --- | --- | --- |
| `openid-client` | `^5.6.5` | 5.7.1 | `keycloak-middleware.js` — `Issuer.discover`, the OIDC `Strategy`, token refresh, `endSessionUrl` |
| `passport` | `^0.7.0` | 0.7.0 | `keycloak-middleware.js` — `oidc` strategy, session serialization |

Keycloak itself is external. The client configuration is read from `keycloak.json` in the process working directory (`keycloak-middleware.js`, and again in `utils.js` for the resource name). JWTs are decoded locally with a hand-written base64url decoder (`jwtDecode`) — decoded, not verified; the token's authority comes from the OIDC exchange.

### Markdown and rendering

| Component | Declared | Resolved | Where it is used |
| --- | --- | --- | --- |
| `marked` | `^12.0.1` | 12.0.2 | `app.js` — two configured instances, `markedLight` and `markedDark`, chosen per request from the user's dark-mode preference |
| `marked-shiki` | `^1.0.1` | 1.2.1 | `app.js` — bridges `marked` to Shiki for fenced code blocks |
| `shiki` | `^1.1.7` | 1.29.2 | `app.js` — all bundled languages loaded; themes `material-theme-lighter` (light) and `one-dark-pro` (dark) |
| `@shikijs/transformers` | `^1.1.7` | 1.29.2 | `app.js` — notation transformers for diff, highlight, word-highlight, focus, error-level, plus the two meta transformers |
| `dompurify` | `^3.0.9` | 3.3.1 | `app.js` — final sanitize before every response |
| `jsdom` | `^24.0.0` | 24.1.3 | `app.js` (DOMPurify window) and `obsidian.js` (fragment post-processing, Reveal section splitting, table-of-contents building) |
| `mermaid` | `^11.12.0` | 11.12.2 | Rendered **in the browser**: `obsidian.js` emits a module script importing `/node_modules/mermaid/dist/mermaid.esm.min.mjs` |
| `reveal.js` | `^5.0.5` | 5.2.1 | Declared but not referenced by the code — the presentation view loads Reveal 3.7.0 from jsDelivr instead (see [Observations](#9-observations)) |
| `lucide-static` | `^0.357.0` | 0.357.0 | `obsidian.js` — `lucideIcon()` inlines SVG icons into callouts, the nav tree and every toolbar button |
| `pako` | `^2.1.0` | 2.1.0 | `obsidian.js` — deflates PlantUML source for the PlantUML server URL encoding |
| `uuid` | `^9.0.1` | 9.0.1 | `obsidian.js` — anchor ids for the generated table of contents |

PlantUML is an external HTTP service (`NEXT_PUBLIC_PLANTUML_URL`, default `https://plantuml.unterrainer.info/plantuml`); diagrams are substituted server-side as image links before Markdown conversion.

### Supporting libraries

| Component | Declared | Resolved | Where it is used |
| --- | --- | --- | --- |
| `axios` | `^1.6.7` | 1.13.4 | `app.js` — fetches remote Markdown for the `/convert` endpoints, forwarding the caller's cookie |
| `chokidar` | `^4.0.3` | 4.0.3 | `app.js` — watches `md/` when `NEXT_AUTOSCAN=true` |
| `cors` | `^2.8.5` | 2.8.6 | Declared but never imported (see [Observations](#9-observations)) |
| `safe-learn` | `file:` | — | Self-referencing entry in its own `dependencies` |

### Tooling

- **Docker** — `Dockerfile` (single stage on `node:25.6.0-alpine`, `npm install --omit=dev`, exposes 8080), `deploy/docker-compose.yml`, and two local WYSIWYG compose variants.
- **GitHub Actions** — `.github/workflows/docs-local.yml`: version bump, multi-arch Docker build and push, optional OpenVPN hop, SSH deploy.
- **httpYac** — `http/*.http` request collections with `httpyac.config.cjs` (gitignored) and `httpyac.config-template.cjs` as the template.
- **Puppeteer** — the project's only `devDependency`. `test/harness.js` starts the application, drives the Keycloak OIDC flow per role, and hands back sessions plus the four things content checks need: the session's effective role set, a confirmed preference write, a rendered page addressed by path and view, and the page's same-origin references. `npm test` runs three files on Node's built-in `node:test` runner: `test/smoke.test.js` (the harness itself), `test/content.test.js` (the content suite, whose by-concern modules live in `test/checks/` so the whole suite runs in one process and logs in twice), and `test/coverage.test.js` (the coverage record, no browser). `test/coverage-map.json` records which check guards which file, `test/coverage.test.js` keeps it honest, and a `PostToolUse` hook names the covering checks when a guarded file is edited. Pages opened for content checks reach only the application and the identity provider — PlantUML, the remote image host and the Reveal CDN are asserted as emitted addresses, never fetched. See `docs-testing.md`.
- **Obsidian** — the authoring tool; `.obsidian/` holds the vault configuration.

## 3. Features & Functionality

Each entry is marked with its implementation status:

- **[verified]** — documented and found in the code, with the file that implements it
- **[docs-only]** — described in the documentation, no implementation found
- **[undocumented]** — implemented, not mentioned in `README.md` or the linked docs

### For teachers

| Feature | Status | Implementation |
| --- | --- | --- |
| All material as Markdown in one place | **[verified]** | `obsidian.js` `scanFiles()` walks `md/` recursively and builds the file maps |
| Obsidian-flavor Markdown (callouts, `[[wiki-links]]`, `![[embeds]]`, image sizing) | **[verified]** | `obsidian.js` — `preMarkCallouts`/`replacePreMarkCallouts`, `preReplaceObsidianFileLinks`, `replaceObsidianImageLinks`, `replaceObsidianImageAltResizeValues` |
| Reveal.js presentations from the same file | **[verified]** | `?reveal=true` → `splitForReveal()` splits on `h2`/`h3` into nested `<section>`s, `wrapInReveal()` builds the deck |
| Presentation fragments (`##fragment`) | **[verified]** | `obsidian.js` `preprocessFragments`/`postprocessFragments` |
| Side-by-side columns (`##side-by-side-start` / `##separator` / `##side-by-side-end`) | **[verified]** | `obsidian.js` `preprocessSideBySide` |
| PlantUML code blocks rendered as diagrams | **[verified]** | `obsidian.js` `preReplacePlantUml` + `toPlantUmlEncoding` |
| Mermaid code blocks rendered as diagrams | **[verified]** | `obsidian.js` `preReplaceMermaid` server-side, `getMermaidScriptEntry()` client-side |
| Syntax highlighting with diff/highlight/focus notations | **[verified]** | `app.js` — Shiki transformers |
| File-level read permissions (`@@@ role` on line 1) | **[verified]** | `obsidian.js` `parseFirstLineForPermissions`, enforced in `app.js` `sanitizeAndParseMarkdown` and in `getDirectoryListing` |
| Block-level read permissions (`@@@ role` … `@@@`) | **[verified]** | `obsidian.js` `removeForbiddenContent` |
| Time-based visibility windows per role | **[verified]** | `obsidian.js` `parsePermissionWindow`, `isPermissionEntryActive`, `runVisibilityChecks` |
| Automatic live reload when a block or file becomes visible/hidden | **[verified]** | `obsidian.js` `registerVisibilityChangeCallback` → `app.js` `broadcastReloadSSE` |
| Exam / practice / answer views (`#exam`, `#practice`, `#answer`) | **[verified]** | `utils.js` `hasRoles` — the `#`-prefixed pseudo-roles |
| Switch between teacher and student view | **[verified]** | `obsidian-page.js` `toggleViewTeacher` → attribute `vt`; `utils.js` honours it via `allowOverride` |
| Local WYSIWYG container with instant refresh | **[verified]** | `wysiwyg-container-linux/`, `wysiwyg-container-windows/`, `NEXT_AUTOSCAN` + `chokidar` in `app.js` |
| Per-class document visibility | **[verified]** | Any Keycloak client role or LDAP OU works as a permission role (`utils.js` `getClientRoles`, `keycloak-middleware.js` `getLdapGroups`) |
| User's own name usable as a permission role | **[verified]** | `utils.js` `hasRoles` adds the normalized `req.user.name` to the role set |

### For students

| Feature | Status | Implementation |
| --- | --- | --- |
| Always-current material, readable anywhere | **[verified]** | Content is rendered per request from disk; no build or publish step |
| Responsive layout for phone/tablet | **[verified]** | `css/media.css` plus the collapsible sidebar in `obsidian-page.js` |
| Remember last opened page | **[verified]** | `app.js` writes the `lastVisitedUrl` attribute; the `/` handler redirects to it when preference `sl == 1` |
| Automatic table of contents | **[verified]** | `obsidian.js` `makeContentMap` assigns UUID anchors, `getContentListing` renders the sidebar list |
| Active-heading highlight while scrolling | **[undocumented]** | `obsidian-page.js` `markTopAnchor` |
| Font selection (main and navigation, separately) | **[verified]** | `obsidian.js` `scanFonts` + `getFontImports`; `obsidian-page.js` `mainFontChange`/`navFontChange` |
| Font size and line spacing controls | **[verified]** | `obsidian-page.js` `fontBigger`/`fontSmaller`/`spacingBigger`/`spacingSmaller` |
| Light / dark mode | **[verified]** | `obsidian-page.js` `toggleLightDark` → attribute `dm`; also switches the Shiki theme server-side in `app.js` |
| Dyslexia-friendly font shipped by default | **[undocumented]** | `assets/main-fonts/OpenDyslexic3-Regular.ttf`, `assets/nav-fonts/OpenDyslexic3-Regular.ttf` |
| `CTRL+ALT+P` — open as presentation in the same window | **[verified]** | `obsidian-page.js` keydown handler → `openAsPresentation(true, true)` |
| `CTRL+ALT+D` — open as printable document in the same window | **[verified]** | `obsidian-page.js` keydown handler → `openAsDocument(true)` (see [Observations](#9-observations) for the uppercase variant) |
| Draggable sidebar width | **[undocumented]** | `obsidian-page.js` — the `resize`/`mousedown` handlers at the end of the file |
| Scroll and slide position preserved across live reloads | **[undocumented]** | `obsidian.js` `getAutoReloadScript` — `sessionStorage` for `scrollY` and `revealSlide` |

### For operators

| Feature | Status | Implementation |
| --- | --- | --- |
| Keycloak-gated access to everything | **[verified]** | `keycloak-middleware.js` `checkAuthenticated`, applied before all content routes in `app.js` |
| Automatic access-token refresh | **[verified]** | `keycloak-middleware.js` — refresh middleware at ≤60 s remaining, plus a forced `refreshAccessToken` per render |
| Preferences persisted in Keycloak user attributes | **[verified]** | `keycloak-middleware.js` `getUserAttributes`/`setUserAttribute` against `/realms/{realm}/account` |
| `/convert` API — GET by URL, POST by URL, POST by content | **[verified]** | `app.js` — all three forms exist as documented in `docs-technical-details.md` |
| Print a presentation as PDF via `?print-pdf` | **[verified]** | `obsidian.js` `wrapInReveal` swaps in Reveal's `pdf.css` when the query string matches |
| Drop-in fonts (`assets/main-fonts/`, `assets/nav-fonts/`) | **[verified]** | `obsidian.js` `scanFonts`, picked up on restart or rescan |
| Docker image build and SSH deployment pipeline | **[verified]** | `.github/workflows/docs-local.yml`, `deploy/docker-compose.yml`, `deploy/up.sh` |
| Optional OpenVPN hop before SSH deploy | **[verified]** | `.github/workflows/docs-local.yml`, gated by the `NO_VPN` secret |
| `NEXT_AUTOSCAN` file watcher with selective SSE reload | **[verified]** | `app.js` — `chokidar` diff drives either a full or a per-file reload broadcast |
| `PERMISSION_VISIBILITY_INTERVAL_MS` tuning knob | **[undocumented]** | `obsidian.js` — poll interval for visibility windows, default 5000 ms, floor 1000 ms |
| ASCIIDoc / GitHub Pages publishing | **[docs-only]** | `asciidocs/` and `index.html` refer to a gh-pages ASCIIDoc pipeline; no such workflow exists in `.github/workflows/` |
| `up.ps1` for the Windows WYSIWYG container | **[docs-only]** | `docs-wysiwyg.md` names it; `wysiwyg-container-windows/` ships `up.sh` only |

## 4. Component Map

| Path | Responsibility |
| --- | --- |
| `app.js` | Process entry point. Configures the two `marked` instances and the Shiki highlighter, wires the Express middleware chain, owns every route, hosts the SSE client registry and the `chokidar` watcher, and runs the initial file and font scan before `listen`. |
| `obsidian.js` | The largest module (~2100 lines) and the heart of the system. Four concerns live here: the **file/font scanner** and its in-memory maps; the **permission parser and timed-visibility scheduler**; the **Markdown render pipeline** (`preParse`, `manipulateHtml`); and the **HTML page assembly** (`wrapInPage`, `wrapAsDocument`, `wrapInReveal`, sidebar, top bar, settings menu, nav tree). |
| `obsidian-page.js` | Browser-side script served to every page. Handles preference reads/writes against `/userattributes`, the view toggles, sidebar and menu animations, collapsible callouts, the scroll-linked TOC highlight, the keyboard shortcuts, and sidebar resizing. |
| `utils.js` | Role resolution. `hasSomeRoles`/`hasAllRoles` merge Keycloak client roles, LDAP-derived groups and the user's own name into one role set, then apply the teacher/admin downgrade and the `#exam`/`#practice`/`#answer` view rules. |
| `middlewares/keycloak-middleware.js` | The whole authentication flow: OIDC discovery, session, Passport strategy, `/test` login trigger, `/auth/callback`, logout, token refresh, LDAP group extraction, and Keycloak account-attribute read/write. |
| `middlewares/extract-filename-middleware.js` | Small helper: parses the request path into `req.filePath` and `req.file`, used for page titles. |
| `css/` | 13 stylesheets. `css/main.css` is the single entry point linked by the page and document wrappers and `@import`s 11 of them: layout (`body`, `topbar`, `sidebar`, `media`), content (`markdown`, `callouts`, `fixes`), controls (`buttons`, `flipswitch`), animation (`movement`, `reveals-rotates`). `css/reveal.css` is linked separately by `wrapInReveal` and is not part of the `main.css` chain. |
| `assets/` | `favicon.ico` plus `main-fonts/` (11 TrueType fonts) and `nav-fonts/` (8). Font names are derived from the file names; the preference stores an index into the directory order. |
| `md/` | The content root and the test corpus — permission tests, a presentation, folder-name edge cases (spaces, special characters, empty folders), and `assets/` with pasted images. In production this directory is replaced or bind-mounted. |
| `deploy/` | Server-side deployment artifacts: `docker-compose.yml` (image, port mapping, `TZ=Europe/Vienna`) and `up.sh` (pull + recreate). Uploaded by the GitHub Action. |
| `wysiwyg-container-linux/`, `wysiwyg-container-windows/` | Local live-editing containers that bind-mount the author's `md/` directory. The Windows variant adds polling env vars (`CHOKIDAR_USEPOLLING`, `WATCHPACK_POLLING`, …) and a Docker `develop.watch` sync, because filesystem events do not cross the Windows/WSL boundary. |
| `http/` | httpYac request collections for `/convert` and the Keycloak token endpoint, used for manual API testing. |
| `.github/workflows/docs-local.yml` | The only workflow: bump, build, push, deploy. |
| `asciidocs/`, `android/`, `index.html`, `scripts/` | Leftovers from an earlier ASCIIDoc/GitHub-Pages iteration. `scripts/` is empty; `index.html` is a placeholder page describing a pipeline that no longer exists. |

## 5. Request & Route Surface

All content routes sit behind `checkAuthenticated`, which redirects unauthenticated callers to `/test` — the route that starts the OIDC flow.

| Method | Path | Auth | Purpose and output |
| --- | --- | --- | --- |
| GET | `/` | required | Redirects to `NEXT_PUBLIC_START_PAGE`, or to the user's `lastVisitedUrl` when preference `sl == 1` |
| GET | `/**/*.md` | required | The main content route. Renders the file and wraps it as a full page; `?reveal=true` produces a Reveal deck, `?document=true` a print-oriented document. Unreadable file → redirect to the start page |
| GET | `/convert?url=<encoded>` | required | Fetches remote Markdown and returns a complete wrapped HTML page |
| POST | `/convert` | required | Body `{"url": …}` or `{"content": …}` → `{"html": …}`, sanitized, without `html`/`body` wrapper |
| GET | `/userattributes` | required | Returns the refreshed `req.user` object as JSON (profile, decoded access token, preferences) |
| POST | `/userattributes` | required | Serializes the whole body into the Keycloak `config` attribute → `{"success": bool}` |
| GET | `/hot-reload?context=<json>` | none applied | SSE stream. Registers the client with its `currentFile`; emits `event: reload` with `{type: "nav"}` or `{type: "page", files: [...]}` |
| GET | `/test` | none | Triggers `passport.authenticate("oidc")` — the login entry point |
| GET | `/auth/callback` | none | OIDC redirect target; logs the user in and returns to the originally requested URL |
| GET | `/logout` | none | Redirects to the Keycloak end-session URL |
| GET | `/logout/callback` | none | Clears the local session, redirects to `/` |
| GET | *(everything else)* | required | `express.static` rooted at the application directory; anything unmatched falls through to a redirect to the start page |

Two security headers are set globally on every response in `app.js`: `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`.

Middleware order in `app.js` is load-bearing and reads: body parsers → security headers → `initKeycloak` (session, Passport, refresh, auth routes) → `checkAuthenticated` → root redirect → `fileNameExtractor` → the `.md` handler → `express.static` → `/convert` and `/userattributes` → catch-all redirect.

## 6. Render Pipeline

Every Markdown response follows the same chain, driven by `sanitizeAndParseMarkdown` in `app.js`:

```
read file (app.js)
  └─ refreshAccessToken            fresh roles and attributes for this render
  └─ parseFirstLineForPermissions  whole-file gate; the directive line is stripped
  └─ preParse (obsidian.js)
       1. removeForbiddenContent      drop @@@ blocks the user may not see
       2. preReplacePlantUml          deflate + encode, substitute a diagram image link
       3. preReplaceMermaid           rewrite the fence to <pre class="mermaid">
       4. preMarkCode                 park fenced code in an array behind a placeholder
       5. preReplaceObsidianFileLinks resolve [[wiki-links]] to absolute URLs
       6. preMarkCallouts             convert > [!type] blocks to internal markers
       7. preprocessFragments         ##fragment  → HTML comment marker
       8. preprocessSideBySide        ##side-by-side-* → column divs
       9. unmarkCode                  restore the parked code blocks
  └─ marked.parse                  markedDark or markedLight, chosen by preference `dm`
  └─ manipulateHtml (obsidian.js)
       1. replacePreMarkCallouts        markers → styled callout markup with a Lucide icon
       2. replaceObsidianImageLinks     ![[embeds]] → img / video / audio / link by extension
       3. replaceObsidianImageAltResize  alt="name|WxH" → inline width/height
       4. postprocessFragments          markers → .fragment spans, index reset at h2/h3
       5. makeContentMap                UUID anchors on every heading; builds the TOC map
  └─ DOMPurify.sanitize            final output filter
```

Code blocks are parked before the link, callout and fragment passes and restored afterwards (steps 4 and 9), so those rewrites cannot corrupt code samples. Callouts may nest; the code markers may not.

After sanitizing, one of three wrappers builds the response: `wrapInPage` (top bar, sidebar, settings menu), `wrapAsDocument` (content only, for printing), or `wrapInReveal` — which first calls `splitForReveal` to cut the HTML into `<section>` elements at `h2` (horizontal) and `h3` (vertical) boundaries.

## 7. Permission Model

### Where roles come from

`utils.js` `hasRoles` assembles one role set per request from three sources:

1. **Keycloak client roles** — `resource_access[<resource>].roles` from the decoded access token, where `<resource>` is read from `keycloak.json`.
2. **LDAP groups** — `keycloak-middleware.js` `getLdapGroups` extracts every `OU=…` from the user's `ldap` claim, lowercases it, and maps `teachers` → `teacher` and `students` → `student`.
3. **The user's own name** — the normalized `req.user.name` is added as a role, so `@@@ Stu Dent` addresses one person.

All comparisons are lowercased and trimmed. `admin` short-circuits to full access. Once the three sources are merged, `hasRoles` canonicalizes the plurals a client role may carry (`teachers` → `teacher`, `students` → `student`) and derives the alias `teachers` from `teacher`. The alias is therefore part of the session's role set before any directive is read, whatever source the role arrived from; the roles a directive names never enter the role set.

### The two directive forms

```markdown
@@@ 4bhif, 5ahif          ← first line of the file: gates the whole file
```

```markdown
@@@ teacher               ← anywhere in the file: gates the block
hidden from students
@@@
```

File-level directives are read without loading the whole file (`getPermissionsFor` reads a single line via a `readline` stream) and are evaluated in two places: when rendering (`app.js`) and when building the sidebar tree (`getDirectoryListing`), so a hidden file is neither reachable by direct link nor visible in the navigation.

### Time windows

Any role may carry a bracketed window: `4ahif[2025-11-28T08:00:00]` (from), `[to 2025-12-01T12:00:00]` (until), or `[start to end]`. Timestamps without a timezone are parsed in the server's local zone by `parseLocalDateTime`; a trailing `Z` or offset switches to absolute time.

`scanFiles` registers every timed entry — file-level and inline — in the `timedPermissionEntries` map. A `setInterval` started by `ensureVisibilityTimerState` runs `runVisibilityChecks` every `PERMISSION_VISIBILITY_INTERVAL_MS` (default 5000). When an entry crosses its boundary, the registered callback fires and `app.js` broadcasts an SSE reload to all connected clients. The timer stops itself when no timed entries exist.

### View pseudo-roles

Three `#`-prefixed roles are not roles at all but view switches, resolved in `utils.js` against the user's stored preferences:

| Directive | Visible when |
| --- | --- |
| `#exam` | preference `ve == 1` **and** the user is teacher or admin — hardcoded, and read after the student-view downgrade, so a downgraded teacher fails it |
| `#practice` | preference `ve == 0` |
| `#answer` | preference `va == 1` |

### The student-view downgrade

When `allowOverride` is set and the teacher's preference `vt == 0`, `hasRoles` strips `teacher`, its alias `teachers` and `admin` from the role set. That is the mechanism behind the teacher/student toggle in the top bar: a teacher sees exactly what a student sees, including hidden files disappearing from the tree. The strip happens before the view pseudo-roles are resolved, so a downgraded session fails the `#exam` gate as well. Nothing has to be undone when the view is switched back on — the role set is rebuilt from the session on every call.

### Live reload transport

`app.js` keeps a `Map` of SSE clients, each with the file it currently displays. A full reload (`type: "nav"`) is sent when files are added or removed, or when a visibility window flips; a selective reload (`type: "page"`, with the file list) is sent when files are only modified, and each client reloads only if it is showing one of them. The client script reconnects after 3 s on error and restores scroll position or Reveal slide index from `sessionStorage`.

## 8. Deployment & Operations

### Configuration

| Variable | Read in | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_PORT` | `app.js` | Listen port (bound on `0.0.0.0`) |
| `NEXT_PUBLIC_START_PAGE` | `app.js` | Home target; falls back to `/test-md-file.md` |
| `NEXT_PUBLIC_SERVER_URL` | `keycloak-middleware.js` | Public base URL used to build the OIDC redirect URIs; defaults to `http://localhost:8080` |
| `NEXT_PUBLIC_PLANTUML_URL` | `obsidian.js` | PlantUML render service |
| `NEXT_PUBLIC_IS_APP_FOLDER` | `app.js`, `obsidian.js` | Switches the base path to `/app/` for in-container operation |
| `NEXT_AUTOSCAN` | `app.js` | Enables the `chokidar` watcher on `md/` |
| `PERMISSION_VISIBILITY_INTERVAL_MS` | `obsidian.js` | Visibility poll interval, default 5000 ms, minimum 1000 ms |

`keycloak.json` (realm, auth-server-url, resource, client secret) is read from the working directory at startup. Both it and `.env` are generated by the pipeline from GitHub secrets; the repository's `.gitignore` excludes `/keycloak*` at the root.

### Image

`Dockerfile` is a single stage on `node:25.6.0-alpine`. It copies `site/` (the pipeline-generated `.env` and `keycloak.json`), then `md/`, `assets/`, `middlewares/`, `css/`, the manifests and the root `*.js`/`*.css` files, runs `npm install --omit=dev`, exposes 8080 and starts `npm run prod`.

### Pipeline

`.github/workflows/docs-local.yml` runs on push to `master` and on manual dispatch, in four jobs:

1. **bump** — `anothrNick/github-tag-action`, patch by default.
2. **docker-build** — materializes `site/.env` and `site/keycloak.json` from secrets, then builds and pushes `linux/amd64` + `linux/arm64/v8` to Docker Hub as `:latest`.
3. **decide-deploy** — reads the `NO_DEPLOY` secret and emits a boolean.
4. **deploy** — optional OpenVPN connect (skipped when `NO_VPN=true`), SSH key setup, remote `mkdir` of the deploy and data directories, generates `deploy/.env`, normalizes line endings with `dos2unix`, uploads `deploy/` and runs `up.sh`.

`docs-building.md` documents all 20 required secrets.

### Local operation

- **Development**: `npm install` then `npm start` (nodemon), with the VSCode debugger attaching separately.
- **WYSIWYG container**: copy `wysiwyg-container-linux/` or `wysiwyg-container-windows/`, fill `.env` and `keycloak.json`, run `up.sh`. The author's `md/` directory is bind-mounted and `AUTOSCAN=true` turns on the watcher, so saving in Obsidian refreshes the open browser page.

## 9. Observations

Recorded as found, without judgment on intent and without changes to the code.

### Dependency and version divergences

- **Reveal.js is loaded twice over, from two different major versions.** `package.json` declares `reveal.js ^5.0.5` (locked to 5.2.1), but `wrapInReveal` in `obsidian.js` loads Reveal **3.7.0** — CSS, theme, print stylesheets, `reveal.min.js`, the notes plugin and `headjs` — from `cdn.jsdelivr.net`. The npm package is never referenced. The presentation view therefore depends on an external CDN at runtime and on a major version eight years older than the declared one.
- **`cors` is declared but never imported.** No `require`/`import` of it exists anywhere outside `node_modules`.
- **`safe-learn` lists itself** as `"safe-learn": "file:"` in its own `dependencies`.
- **Node version statements disagree**: `.nvmrc` pins `20`, the `Dockerfile` builds on `node:25.6.0-alpine`.
- **Google Fonts is loaded in the presentation view** (`fonts.googleapis.com/css?family=Lato`) while the page view serves all fonts locally from `assets/`.

### Security-relevant observations

- **`express.static` is rooted at the application directory.** `app.js` serves `path.join(__dirname, "/")`, so any authenticated user can fetch application sources (`/app.js`, `/utils.js`, `/obsidian.js`), `/package.json`, and — where the file is present next to `app.js` — `/keycloak.json`, which holds the OIDC **client secret**. The mermaid client script depends on this same broad static root (`/node_modules/mermaid/…`). Note that the repository itself is clean: root `keycloak.json`/`keycloak-htl.json` are gitignored and untracked, and the two tracked `wysiwyg-container-*/keycloak.json` files contain placeholders only.
- **The session secret is a hardcoded literal** in `middlewares/keycloak-middleware.js`, identical across every deployment built from this source.
- **Sessions use `express-session`'s `MemoryStore`.** Sessions do not survive a restart and the store is not intended for production use; with a single container this is consistent but it rules out horizontal scaling.
- **`/hot-reload` is registered before `checkAuthenticated`** is applied, so the SSE endpoint is reachable without authentication. It emits only file paths and a reload type, never content.
- **`req.query.context` on `/hot-reload` is `JSON.parse`d without a guard**, so malformed input throws inside the handler.

### Documentation and code divergences

- **`docs-permissions.md` states "There is no role `student`"**, but `getLdapGroups` explicitly maps the LDAP OU `Students` to the role `student`. The same file's rule list says the mapping produces `students` (plural), while the code produces the singular.
- **The LDAP claim name is undocumented.** `docs-keycloak.md` says `LDAP_ENTRY_DN` is present automatically and needs no setup, but `getLdapGroups` reads `req.user.ldap` — a claim that must be named `ldap`, which requires a mapper.
- **`docs-wysiwyg.md` names the `.env` field `PUBLIC_START_URL`**; both compose files and the tracked `.env` use `PUBLIC_START_PAGE`.
- **`docs-wysiwyg.md` refers to `./up.ps1` on Windows** and to a directory called `wysiwyg`; the repository ships `wysiwyg-container-windows/` containing `up.sh`.
- **`docs-debugging.md` asks for `httpyac.config.js`**; the repository uses `httpyac.config.cjs` (with `httpyac.config-template.cjs` as the template).
- **`docs-debugging.md` claims "all other files will be ignored by the build-pipeline"**, but the `Dockerfile` also copies `md/`, `assets/`, `middlewares/` and `css/`.
- **`docs-obsidian.md` describes fragments as `#fragment`** in prose while every example and the implementation use `##fragment`.
- **`README.md` has a typo**: "Presentations with Reveal.sj".
- **The ASCIIDoc / GitHub Pages path is documented but absent.** `index.html` announces that it will be replaced by gh-pages output from an ASCIIDoc converter, `docs-debugging.md` mentions the same, and `asciidocs/` holds source files — but no such workflow exists. `scripts/` is empty; `android/` holds two unreferenced asset files.

### Code-level observations

- **The `CTRL+ALT+D` shortcut tests the same key twice**: `obsidian-page.js` reads `event.key === "d" || event.key === "d"`, so the uppercase variant (pressed with Shift) is not matched, unlike the `p`/`P` case directly above it.
- **Dead or unused exports**: `uiConfig` and `hasAllRoles` (`utils.js`) are exported but called nowhere; `mdFilesDirOnHdd` (`obsidian.js`) is declared and cleared on every scan but never populated or read; `jwtDecode`, `issuerUrl` and `keycloakIssuer` are exported but used only inside their own module.
- **`preReplaceObsidianFileLinks` calls `f.split(0, -3)`** in the duplicate-filename branch — `String.prototype.split` with a numeric separator and a limit of `-3`, which cannot be the intended `slice(0, -3)`. The branch is reached only when two `.md` files share a basename.
- **`getDirectoryListing` indexes `filteredFiles[filteredFiles.length - 1]`** without a length check; an empty visible file set would throw.
- **The presentation wrapper links a stylesheet that does not exist.** `wrapInReveal` emits `<link rel="stylesheet" href="/obsidian-page.css">`, but there is no `obsidian-page.css` in the repository — only the script `obsidian-page.js`. Every presentation view therefore issues one request that falls through `express.static` to the catch-all redirect.
- **`getPermissionsFor` is called for every Markdown file on every scan**, opening a read stream per file. With `NEXT_AUTOSCAN` enabled, one file change triggers a complete rescan of the tree.
- **The whole-file permission check is duplicated**: `app.js` re-parses the first line at render time although `scanFiles` already stored `permissions` in `mdFilesDirStructure`.
- **Mixed comment languages.** A few comments in `obsidian.js` (`preprocessSideBySide`, `postprocessFragments`) and `app.js` are German, while the rest of the codebase is English.
- **Verification is browser-level only, and there is no type checking.** `npm test` runs the Puppeteer suite in `test/`, which starts the server, completes the Keycloak login and asserts on rendered pages — the `@@@` directives in both directions, the exam/practice/answer views, the render features, the link and folder edge cases, and the presentation and document views. Nothing covers a function in isolation, so a unit of behavior is either exercised through the whole stack — including a live external identity provider — or not at all. There is no JSDoc-driven type checking.
- **`#practice` is granted by a preference alone.** `hasRoles` resolves `#practice` as `a.ve == 0` with no role in the rule, so a student who turns the exam view on loses the practice question without gaining the exam one and is left with neither variant.
- **The hot-reload script and `init()` disagree on how to reveal the body.** `obsidian-page.js` `init()` sets `document.body.style.display = "block"`, while the auto-reload script's `DOMContentLoaded` handler sets it to `none` and then back to `""`. Which value ends up on the element depends on which finishes last.
- **Each page holds an open server-sent-events connection to `/hot-reload` for its whole life.** A client that walks many pages through one browser tab accumulates them against the browser's per-host connection limit until navigations queue behind them; the verification suite refuses that endpoint for exactly this reason.

## 10. Source Documents

| Document | Covers |
| --- | --- |
| [README.md](../README.md) | Project purpose, teacher and student feature lists, keyboard shortcuts, the rationale for server-side authentication, install overview |
| [docs-technical-details.md](../docs-technical-details.md) | The `/convert` endpoints, adding fonts, PDF printing, and the original description of the render pipeline |
| [docs-obsidian.md](../docs-obsidian.md) | Obsidian language extensions — unique file names, callouts, image sizing, fragments, side-by-side columns |
| [docs-permissions.md](../docs-permissions.md) | The `@@@` directive, role rules, file and block restrictions, time-bound visibility, the exam/practice/answer views |
| [docs-wysiwyg.md](../docs-wysiwyg.md) | Local WYSIWYG container setup, `.env` and `keycloak.json` fields, the Windows/WSL filesystem-event problem |
| [docs-building.md](../docs-building.md) | Forking, the full GitHub Actions secret list, build and deployment |
| [docs-debugging.md](../docs-debugging.md) | Running locally, which files the pipeline replaces, httpYac setup |
| [docs-testing.md](../docs-testing.md) | The browser verification harness — what `npm test` does, the headed switch, the demo accounts, the environment variables, and the shared-account constraint on checks |
| [docs-keycloak.md](../docs-keycloak.md) | Keycloak client and realm setup, the `config` and `lastVisitedUrl` user attributes, the account API endpoints |
