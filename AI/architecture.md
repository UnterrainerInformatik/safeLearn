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
| Node.js | `engines`: `>=24 <25`; `.nvmrc`: `24` | `Dockerfile`: `node:24-alpine` | ESM throughout (`"type": "module"`); top-level `await` in `app.js`. All three name the line, not a patch |
| `express` | `^4.18.3` | 4.22.1 | `app.js` — the entire HTTP surface, plus one `express.static` mount per served location (see section 5) |
| `express-session` | `^1.18.0` | 1.19.0 | `middlewares/keycloak-middleware.js` — session with the default `MemoryStore`, secret from `SESSION_SECRET` |
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
| `mermaid` | `^11.12.0` | 11.12.2 | Rendered **in the browser**: `obsidian.js` emits a module script importing `/node_modules/mermaid/dist/mermaid.esm.min.mjs` and `/node_modules/@mermaid-js/layout-elk/dist/mermaid-layout-elk.esm.min.mjs`. Each package's `dist` directory has a mount of its own in `app.js` — the directory, not the entry file, because mermaid fetches further chunks from `dist/chunks/mermaid.esm.min/` at runtime. The rest of the dependency tree is not served |
| `reveal.js` | `^5.0.5` | 5.2.1 | Rendered **in the browser**: `obsidian.js` `wrapInReveal` links `/node_modules/reveal.js/dist/reset.css` and `dist/reveal.css` and loads `dist/reveal.js` plus `plugin/notes/notes.js`. Two mounts in `app.js` serve `dist` and `plugin/notes` — directories, not entry files, because the theme's fonts sit under `dist/theme/fonts/` and the speaker view opens `plugin/notes/speaker-view.html`. The theme is `css/reveal-theme-moon.css`, this project's derivation of the package's `moon.css`, whose Google Fonts `@import` was replaced by an `@font-face` over `assets/main-fonts/Lato*.ttf`. No version is named in any source file |
| `lucide-static` | `^0.357.0` | 0.357.0 | `obsidian.js` — `lucideIcon()` inlines SVG icons into callouts, the nav tree and every toolbar button |
| `pako` | `^2.1.0` | 2.1.0 | `obsidian.js` — deflates PlantUML source for the PlantUML server URL encoding |
| `uuid` | `^9.0.1` | 9.0.1 | `obsidian.js` — anchor ids for the generated table of contents |

PlantUML is an external HTTP service (`NEXT_PUBLIC_PLANTUML_URL`, default `https://plantuml.unterrainer.info/plantuml`); diagrams are substituted server-side as image links before Markdown conversion.

### Supporting libraries

| Component | Declared | Resolved | Where it is used |
| --- | --- | --- | --- |
| `axios` | `^1.6.7` | 1.13.4 | `app.js` — fetches remote Markdown for the `/convert` endpoints, forwarding the caller's cookie |
| `chokidar` | `^4.0.3` | 4.0.3 | `app.js` — watches `md/` when `NEXT_AUTOSCAN=true` |

### Tooling

- **Docker** — `Dockerfile` (single stage on `node:24-alpine`, `npm install --omit=dev`, exposes 8080), `deploy/docker-compose.yml`, and two local WYSIWYG compose variants.
- **GitHub Actions** — `.github/workflows/docs-local.yml`: version bump, multi-arch Docker build and push, optional OpenVPN hop, SSH deploy.
- **httpYac** — `http/*.http` request collections with `httpyac.config.cjs` (gitignored) and `httpyac.config-template.cjs` as the template.
- **Puppeteer** — the project's only `devDependency`. `test/harness.js` starts the application, drives the Keycloak OIDC flow per role, and hands back sessions plus the five things content checks need: the session's effective role set, a confirmed preference write, a rendered page addressed by path and view, the page's same-origin references, and the hosts the browser actually contacted while a page loaded. `npm test` runs three files on Node's built-in `node:test` runner: `test/smoke.test.js` (the harness itself), `test/content.test.js` (the content suite, whose by-concern modules live in `test/checks/` so the whole suite runs in one process and logs in twice), and `test/coverage.test.js` (the coverage record, no browser). `test/coverage-map.json` records which check guards which file, `test/coverage.test.js` keeps it honest, and a `PostToolUse` hook names the covering checks when a guarded file is edited. Pages opened for content checks reach only the application and the identity provider — PlantUML and the remote image host are asserted as emitted addresses, never fetched, and the presentation check asserts that a deck emits no such address at all. See `docs-testing.md`.
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
| Print a presentation as PDF via `?print-pdf` | **[verified]** | Reveal 5 reads the query string itself and switches to its print view; `obsidian.js` `wrapInReveal` adds `pdfMaxPagesPerSlide: 1` for one slide per page |
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
| `utils.js` | Role resolution. `hasSomeRoles` merges Keycloak client roles, LDAP-derived groups and the user's own name into one role set, then applies the teacher/admin downgrade and the `#exam`/`#practice`/`#answer` view rules, the last two as one rule and its complement. |
| `middlewares/keycloak-middleware.js` | The whole authentication flow: OIDC discovery, session, Passport strategy, `/test` login trigger, `/auth/callback`, logout, token refresh, LDAP group extraction, and Keycloak account-attribute read/write. |
| `middlewares/extract-filename-middleware.js` | Small helper: parses the request path into `req.filePath` and `req.file`, used for page titles. |
| `css/` | 14 stylesheets. `css/main.css` is the single entry point linked by the page and document wrappers and `@import`s 11 of them: layout (`body`, `topbar`, `sidebar`, `media`), content (`markdown`, `callouts`, `fixes`), controls (`buttons`, `flipswitch`), animation (`movement`, `reveals-rotates`). Two are outside that chain and linked by `wrapInReveal` alone: `css/reveal-theme-moon.css`, the derivation of Reveal's `moon` theme, and `css/reveal.css`, this deck's rules over it — linked last, because that is what makes them overrides. |
| `assets/` | `favicon.ico` plus `main-fonts/` (11 offered fonts, plus two Lato weight variants and their licence) and `nav-fonts/` (8). Font names are derived from the file names and the preference stores an index into the directory order, so a weight variant (`Lato-300.ttf`) and a non-`.ttf` file are passed over rather than taking up an index. |
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
| GET | `/assets/**`, `/css/**`, `/md/**` (non-Markdown), `/obsidian-page.js`, `/logo-{64,128,256,512}.png`, `/index.html`, `/node_modules/mermaid/dist/**`, `/node_modules/@mermaid-js/layout-elk/dist/**` | required | The served set. One mount per location, each one there because a rendered page references it — except `/index.html`, which is there because `getStartPage` falls back to it |
| GET | *(everything else)* | required | Not served, whether or not a file exists at that path — including `/keycloak.json`, `/app.js`, `/utils.js`, `/obsidian.js` and `/package*.json`. Falls through to a redirect to the start page, the same answer a path with no file behind it gets |

Two security headers are set globally on every response in `app.js`: `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'`.

Middleware order in `app.js` is load-bearing and reads: body parsers → security headers → `initKeycloak` (session, Passport, refresh, auth routes) → `checkAuthenticated` → root redirect → `fileNameExtractor` → the `.md` handler → the static mounts → `/convert` and `/userattributes` → catch-all redirect. The `.md` handler sitting above the mounts is what keeps whole-file permissions from being bypassed through `/md`.

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
2. **LDAP groups** — `keycloak-middleware.js` `getLdapGroups` extracts every `OU=…` from the user's `ldap` claim, lowercases it, and maps `teachers` → `teacher` and `students` → `student`. In practice the school directory has no unit that yields `student`: pupils carry their class and nothing else, so a student is a session that holds neither `admin` nor `teacher`. The role is reachable code, not a role anyone holds — the student-view downgrade encodes the same definition by removing roles rather than granting one.
3. **The user's own name** — the normalized `req.user.name` is added as a role, so `@@@ Stu Dent` addresses one person. Except when it collides with a built-in role: `admin`, `teacher`, `teachers`, `student` and `students` are reserved (`namesReservedForRoles`), and a display name equal to one of them is dropped with a warning instead of entering the set. The name shares this namespace with the roles, so it must never be able to stand in for one; only sources 1 and 2 grant those five.

All comparisons are lowercased and trimmed. `admin` short-circuits to full access. Once the three sources are merged, `hasRoles` canonicalizes the plurals a client role may carry (`teachers` → `teacher`, `students` → `student`) and derives the aliases back: `teachers` from `teacher`, `students` from `student`. Both spellings of both roles therefore end up in the set whichever one the role arrived as, before any directive is read; the roles a directive names never enter the role set.

### The two directive forms

```markdown
@@@ 4bhif, 5ahif          ← first line of the file: gates the whole file
```

```markdown
@@@ teacher               ← anywhere in the file: gates the block
hidden from students
@@@
```

File-level directives are read without loading the whole file: for the index, `getPermissionsFor` reads a single line via a `readline` stream, and only for files the scan sees as new or changed; when rendering, the page handler already holds the file and splits the first line off it. They are asked about in two places — building the sidebar tree (`getDirectoryListing`) and rendering (`sanitizeAndParseMarkdown`) — but answered in one, `resolveFileVisibility`, so a hidden file is neither reachable by direct link nor visible in the navigation, and the two cannot drift apart.

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

`app.js` keeps a `Map` of SSE clients, each with the file it currently displays. A full reload (`type: "nav"`) is sent when files are added or removed, or when a visibility window flips; a selective reload (`type: "page"`, with the file list) is sent when files are only modified, and each client reloads only if it is showing one of them. The client script holds one stream at a time: it gives it up on `pagehide` and opens a new one on `pageshow`, so a page sitting in the back/forward cache holds no connection, and it retries a lost one with a doubling backoff from one second to at most a minute. The scroll position or Reveal slide index it saves in `sessionStorage` before a reload is put back by the view's reveal owner, which calls the restore this script exposes rather than the script applying it on an event of its own — see section 9.

## 8. Deployment & Operations

### Configuration

| Variable | Read in | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_PORT` | `app.js` | Listen port (bound on `0.0.0.0`) |
| `NEXT_PUBLIC_START_PAGE` | `app.js` | Home target; falls back to `/index.html`, the dummy page at the application root, which has a mount of its own so the fallback is not redirected to itself |
| `NEXT_PUBLIC_SERVER_URL` | `keycloak-middleware.js` | Public base URL used to build the OIDC redirect URIs; defaults to `http://localhost:8080` |
| `NEXT_PUBLIC_PLANTUML_URL` | `obsidian.js` | PlantUML render service |
| `NEXT_PUBLIC_IS_APP_FOLDER` | `app.js`, `obsidian.js` | Switches the base path to `/app/` for in-container operation |
| `NEXT_AUTOSCAN` | `app.js` | Enables the `chokidar` watcher on `md/` |
| `PERMISSION_VISIBILITY_INTERVAL_MS` | `obsidian.js` | Visibility poll interval, default 5000 ms, minimum 1000 ms |
| `SESSION_SECRET` | `keycloak-middleware.js` | Signs the session cookies. **Required** — `initKeycloak` exits at startup when it is missing or empty, with no fallback, so no two deployments share a secret |

`keycloak.json` (realm, auth-server-url, resource, client secret) is read from the working directory at startup. Both it and `.env` are generated by the pipeline from GitHub secrets; the repository's `.gitignore` excludes `/keycloak*` at the root.

### Image

`Dockerfile` is a single stage on `node:24-alpine`. It copies `site/` (the pipeline-generated `.env` and `keycloak.json`), then `md/`, `assets/`, `middlewares/`, `css/`, the manifests and the root `*.js`/`*.css` files, runs `npm install --omit=dev`, exposes 8080 and starts `npm run prod`.

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

- ~~**Reveal.js is loaded twice over, from two different major versions.** `package.json` declares `reveal.js ^5.0.5` (locked to 5.2.1), but `wrapInReveal` in `obsidian.js` loads Reveal **3.7.0** — CSS, theme, print stylesheets, `reveal.min.js`, the notes plugin and `headjs` — from `cdn.jsdelivr.net`. The npm package is never referenced. The presentation view therefore depends on an external CDN at runtime and on a major version eight years older than the declared one.~~ **Settled** by the change `bundle-reveal-locally`: the presentation view loads the installed 5.2.1 package through two mounts in `app.js`, the configuration was migrated to the 5.x API (`plugins` instead of `dependencies`, `headjs` and the print-stylesheet injector dropped), and no source file names a version any more.
- ~~**`cors` is declared but never imported.** No `require`/`import` of it exists anywhere outside `node_modules`.~~ **Settled** by the change `close-initial-repairs`: the declaration is gone from `package.json`. A repository-wide search — `wysiwyg-container-linux/`, `wysiwyg-container-windows/` and `http/` included — found no import of it, so removing it could not change behavior; the application renders its own pages against its own session cookie and has no cross-origin caller.
- ~~**`safe-learn` lists itself** as `"safe-learn": "file:"` in its own `dependencies`.~~ **Settled** by the change `close-initial-repairs`: the entry is gone, so `npm install` no longer resolves the package into its own `node_modules`.
- ~~**Node version statements disagree**: `.nvmrc` pins `20`, the `Dockerfile` builds on `node:25.6.0-alpine`.~~ **Settled** by the change `close-initial-repairs`: `.nvmrc` says `24`, the `Dockerfile` builds on `node:24-alpine`, and `package.json` declares `"engines": { "node": ">=24 <25" }`. All three name the line under long-term maintenance rather than a patch, so a rebuild collects that line's security patches instead of holding on the version that was current when the file was written. `docs-building.md` states it where the build is described.
- ~~**Google Fonts is loaded in the presentation view** (`fonts.googleapis.com/css?family=Lato`) while the page view serves all fonts locally from `assets/`.~~ **Settled** by the change `bundle-reveal-locally`: the `<link>` is gone and the theme derivation declares Lato at 300, 400 and 700 over `assets/main-fonts/`, the weights the deck asks for. `test/checks/presentation.js` fails the run on any host a deck contacts other than the application and the identity provider, reading the browser's requests rather than the markup — which is how a stylesheet's `@import` would otherwise stay invisible.

### Security-relevant observations

- **Sessions are held in `express-session`'s `MemoryStore`, by decision.** Settled by the change `harden-deployment-surface` rather than left open: one container serving one school does not earn a session service to run, back up and monitor. The price is stated where an operator meets it (`docs-building.md`, and a comment at the store itself) — every session is discarded on a restart or a deploy, and a second instance behind a load balancer would not recognize the first one's sessions, so the store has to be replaced before one can be added. The trigger for revisiting it is a second instance, not a version bump.
- **A time window the server cannot read is dropped, and the entry it was written on becomes permanent.** `parsePermissionWindow` returns `null` for a window neither end of which parses, `parsePermissionEntry` keeps the entry with that `null`, and `isPermissionEntryActive` treats an entry with no window as always active. So `@@@ 4bhif[gestern]` grants 4BHIF the block for good, which is the opposite of what was written, and nothing anywhere reports it — not the page, not the scan, not the log. What makes this more than a typo is how permissive `parseLocalDateTime` is about which spellings it accepts: `2025-13-45` is accepted and rolled over into February 2026, while `2025-11-28T08:00` — a natural way to write a time, and one Obsidian's own date pickers produce — is rejected, because the missing seconds leave `second` undefined rather than zero and invalidate the date. `2025-11-28 ab:cd` is accepted at midnight for the mirror-image reason: a segment that parses to NaN leaves the default standing. Recorded by `plugin-edit-tag-support`, which mirrors these rules in the companion plugin so a person writing a document is shown a window that will be thrown away; the table in `test/directive-grammar.test.js` holds each of these cases and asserts the server's answer to it. The server itself is unchanged: repairing it would change which documents are visible on an installation that already runs, and that is a decision about a corpus rather than about a parser.
- **`/hot-reload` is registered before `checkAuthenticated`** is applied, so the SSE endpoint is reachable without authentication. It emits only file paths and a reload type, never content.
- ~~**`req.query.context` on `/hot-reload` is `JSON.parse`d without a guard**, so malformed input throws inside the handler.~~ **Settled** by the change `close-initial-repairs`: the parse is guarded and a context that cannot be interpreted is handled as an absent one. `test/checks/deployment-surface.js` subscribes with such a context from the test process — the harness refuses that stream inside the browser on purpose — and asserts that the subscription is established and held open. The endpoint's position relative to `checkAuthenticated` is deliberately unchanged; see the bullet above.

### Documentation and code divergences

- ~~**The LDAP claim name is undocumented.** `docs-keycloak.md` says `LDAP_ENTRY_DN` is present automatically and needs no setup, but `getLdapGroups` reads `req.user.ldap` — a claim that must be named `ldap`, which requires a mapper.~~ **Settled** by the change `close-initial-repairs`: `docs-keycloak.md` names the claim and the mapper that produces it, and the attribute table carries a row of its own for it.
- ~~**`docs-wysiwyg.md` names the `.env` field `PUBLIC_START_URL`**; both compose files and the tracked `.env` use `PUBLIC_START_PAGE`.~~ **Settled** by the change `close-initial-repairs`.
- ~~**`docs-wysiwyg.md` refers to `./up.ps1` on Windows** and to a directory called `wysiwyg`; the repository ships `wysiwyg-container-windows/` containing `up.sh`.~~ **Settled** by the change `close-initial-repairs`: the directory is named as it is on disk, and the step says `./up.sh` for both containers with the reason there is no PowerShell variant.
- ~~**`docs-debugging.md` asks for `httpyac.config.js`**; the repository uses `httpyac.config.cjs` (with `httpyac.config-template.cjs` as the template).~~ **Settled** by the change `close-initial-repairs`.
- ~~**`docs-debugging.md` claims "all other files will be ignored by the build-pipeline"**, but the `Dockerfile` also copies `md/`, `assets/`, `middlewares/` and `css/`.~~ **Settled** by the change `close-initial-repairs`: the table lists those four directories and `index.html` as copied, and the `app.js` row says that every `.js` and `.css` file at the repository root is copied with it.
- ~~**`docs-obsidian.md` describes fragments as `#fragment`** in prose while every example and the implementation use `##fragment`.~~ **Settled** by the change `close-initial-repairs`.
- ~~**`README.md` has a typo**: "Presentations with Reveal.sj".~~ **Settled** by the change `close-initial-repairs`.
- ~~**The ASCIIDoc / GitHub Pages path is documented but absent.** `index.html` announces that it will be replaced by gh-pages output from an ASCIIDoc converter, `docs-debugging.md` mentions the same, and `asciidocs/` holds source files — but no such workflow exists.~~ **Settled** by the change `close-initial-repairs`: the announcement is withdrawn. `index.html` describes itself as the fallback start page it is, and neither `docs-debugging.md` nor `docs-building.md` refers to a pipeline that was never built. `asciidocs/` stays on disk as the source material it is — deleting it would be a decision about the author's intentions rather than a repair. `scripts/` is empty; `android/` holds two unreferenced asset files.

### Code-level observations

- ~~**The `CTRL+ALT+D` shortcut tests the same key twice**: `obsidian-page.js` reads `event.key === "d" || event.key === "d"`, so the uppercase variant (pressed with Shift) is not matched, unlike the `p`/`P` case directly above it.~~ **Settled** by the change `close-initial-repairs`: the second comparison reads `"D"`, and `test/checks/presentation.js` presses the shortcut with the shift key held and without it, asserting the document view is reached in both cases. The shifted press names the character the browser reports rather than deriving one from a held modifier — the check passes against the unrepaired code otherwise.
- ~~**Dead or unused exports**: `uiConfig` and `hasAllRoles` (`utils.js`) are exported but called nowhere; `mdFilesDirOnHdd` (`obsidian.js`) is declared and cleared on every scan but never populated or read; `jwtDecode`, `issuerUrl` and `keycloakIssuer` are exported but used only inside their own module.~~ **Settled** by the change `close-initial-repairs`: `uiConfig`, `hasAllRoles` and `mdFilesDirOnHdd` are gone, and the three names used only inside `keycloak-middleware.js` lost the `export` keyword and kept their functions. Each was asserted absent from the whole repository first, not only from the modules that seemed likely.
- ~~**`preReplaceObsidianFileLinks` calls `f.split(0, -3)`** in the duplicate-filename branch — `String.prototype.split` with a numeric separator and a limit of `-3`, which cannot be the intended `slice(0, -3)`. The branch is reached only when two `.md` files share a basename.~~ **Settled** by the change `close-initial-repairs`: the truncation is gone entirely rather than corrected to `slice`. The extension it was reaching for is the one the page handler decides on — `app.js` answers a request because `path.extname` says `.md` — so a link that dropped it would fall through to the catch-all, which a run with `slice(0, -3)` in place demonstrated. `f` is already the path that disambiguates the copies. The corpus gained `md/test-chapter-10.md` and `md/presentations/test-chapter-10.md` so the branch is exercised on the input that tells the two calls apart.
- ~~**`getDirectoryListing` indexes `filteredFiles[filteredFiles.length - 1]`** without a length check; an empty visible file set would throw.~~ **Settled** by the change `close-initial-repairs`: the last entry is only read when there is one, and an empty set produces an empty tree. The repair ships unverified by a run and the gap is recorded in `docs-testing.md` — `md/` is hardcoded, so producing an empty visible set from a check would mean restricting every corpus file against every test account. The realistic trigger is a WYSIWYG container bound to a fresh, empty vault.
- ~~**The presentation wrapper links a stylesheet that does not exist.** `wrapInReveal` emits `<link rel="stylesheet" href="/obsidian-page.css">`, but there is no `obsidian-page.css` in the repository — only the script `obsidian-page.js`. Every presentation view therefore issues one request that falls through `express.static` to the catch-all redirect.~~ **Settled** by the change `bundle-reveal-locally`, which removed the link as it rewrote `wrapInReveal`; recorded here by `close-initial-repairs`. The `/obsidian-page.css` entry in the known-dangling list of `test/checks/presentation.js` is not an exception for this reference — it is a fixture of the list mechanism's own self-test and stays.
- ~~**`getPermissionsFor` is called for every Markdown file on every scan**, opening a read stream per file. With `NEXT_AUTOSCAN` enabled, one file change triggers a complete rescan of the tree.~~ **Settled** by the change `resolve-permissions-once`: a scan carries each file's parsed directive forward in a module-level map keyed by `fullPath`, and re-reads only the files whose `mtimeMs` moved — the same value the snapshot diff already compares, so the cache cannot disagree with the `added`/`modified` lists the watcher acts on. Measured against the corpus: a scan opened 16 files before and after on the first scan of a process, where nothing can be carried forward; a second scan with nothing changed dropped from 16 to 0, and a scan after touching one file from 16 to 1. Confirmed a second time against a running instance with `NEXT_AUTOSCAN` enabled. The watcher still rebuilds the whole structure on every event — that is by construction, and deliberately not touched — it just stops re-reading unchanged files while doing so.
- ~~**The whole-file permission check is duplicated**: `app.js` re-parses the first line at render time although `scanFiles` already stored `permissions` in `mdFilesDirStructure`.~~ **Settled** by the change `resolve-permissions-once`, though not in the direction the observation suggests. The page keeps re-parsing the first line, on purpose: the index is a scan-time snapshot and with `NEXT_AUTOSCAN` off there is no scan between a directive being written and a page being requested, so serving the gate from the index would make an edit take effect only after a restart. What was actually duplicated is the *rule* — which roles a directive's windows leave active, that an empty set hides the file from everyone including `admin`, and how the result is tested against the session — written out once in `getDirectoryListing` and again in `sanitizeAndParseMarkdown`. It now lives in `resolveFileVisibility` (`obsidian.js`), which both call. It takes an already-parsed directive rather than a path, because `/convert` and `mdGetToHtml` render Markdown that has no corpus file behind it, and it reports the two refusal causes apart so the page can keep its two distinct messages. `test/checks/permissions.js` compares the navigation tree against the page each entry leads to, reading the tree from the rendered sidebar rather than from the application's own functions.
- **The index is a snapshot, and the page handler is the gate.** Stated here because the two entries above could be read as removing it: the navigation tree is answered from the last scan, and the decision to hand over content reads the file. With `NEXT_AUTOSCAN` off, the tree can therefore be older than the corpus — a file whose directive was tightened may still be listed, and opening it is refused; a file whose directive was relaxed may be missing from the tree and open by direct path. That is behavior rather than a defect, and the `corpus-index` capability specifies it.
- ~~**Mixed comment languages.** A few comments in `obsidian.js` (`preprocessSideBySide`, `postprocessFragments`) and `app.js` are German, while the rest of the codebase is English.~~ **Settled** by the change `unify-comment-language`: there were eight, and they were rewritten rather than translated. The three inside `walk()` now state what the recursion does with its two pieces of hidden state — that a fragment index runs within a heading section, that the marker comment `preprocessFragments` left behind opens the section whose nodes are wrapped, and why a text node is replaced by a `span` while an element keeps its identity — none of which either language said before. `// Node.js Beispiel` was deleted outright, the banner above it already naming the section. The convention itself is written down in `docs-building.md` ("The Source Is English"), among the short sections a contributor reads before touching the source, with its three exemptions named: the corpus in `md/`, hand-written proposals under `AI/` and their archived originals, and conversation. Nothing enforces it mechanically, by decision — a diacritic search caught one of the eight, a German word list misses two and accuses the first English comment that mentions `die()`, and a classifier is a dependency and a threshold to police eight lines — so the rule is written down and the source is read, which is how these eight were found. All three searches re-run over the current tree return nothing, so the eight were all of them.
- **Verification is browser-level only, and there is no type checking.** `npm test` runs the Puppeteer suite in `test/`, which starts the server, completes the Keycloak login and asserts on rendered pages — the `@@@` directives in both directions, the exam/practice/answer views, the render features, the link and folder edge cases, and the presentation and document views. Nothing covers a function in isolation, so a unit of behavior is either exercised through the whole stack — including a live external identity provider — or not at all. There is no JSDoc-driven type checking. Since the change `plugin-setup-obsidian-harness` there is a second run, `npm run test:obsidian`, which drives a real Obsidian over the DevTools protocol against a vault assembled from this corpus and asserts what the companion plugin does to a document; it starts no server and authenticates against nothing. It is deliberately outside `test/*.test.js` and outside the coverage record — `docs-testing.md` states why, and what that costs.
- ~~**`#practice` is granted by a preference alone.** `hasRoles` resolves `#practice` as `a.ve == 0` with no role in the rule, so a student who turns the exam view on loses the practice question without gaining the exam one and is left with neither variant.~~ **Settled** by the change `close-initial-repairs`: `#practice` is now the literal negation of the `#exam` condition over the same flags at the same point after the student-view downgrade, so exactly one of the two variants is visible to every session in every combination of roles and preferences. `test/checks/views.js` asserts that complementarity for every combination it reads rather than each variant on its own, and `role-resolution` specifies the relation between the two directives.
- ~~**The hot-reload script and `init()` disagree on how to reveal the body.** `obsidian-page.js` `init()` sets `document.body.style.display = "block"`, while the auto-reload script's `DOMContentLoaded` handler sets it to `none` and then back to `""`. Which value ends up on the element depends on which finishes last.~~ **Settled** by the change `settle-page-bootstrap`: every view has exactly one script that shows it, and the value written is `""`, so the stylesheets keep the decision — `block` was a value no script had any business asserting. In the page and document views the owner is `revealPage()` in `obsidian-page.js`, called once the session's preferences have been applied; in the presentation view it is `showDeck()` in the deck's own script, for the reason the entry below gives. The reload script's five writes are gone. Its position restore is now a function the owner calls immediately after showing the page rather than a handler racing it: a run showed `DOMContentLoaded` landing *after* the preference request had answered — it waits for the deferred Mermaid module and the graph it imports — so the page was being revealed at the top and then jumping, in both views. Both owners also bound the wait at five seconds and log what they were waiting for, so a page can no longer stay hidden because something never came back. `test/checks/presentation.js` reads the sequence of values the property takes in all three views and fails on a second write; `test/checks/rendering.js` waits for the one value the rule names and drives the bound by leaving `/userattributes` unanswered.
- **The deck's reveal has an owner of its own, and that is a decision rather than an oversight.** A deck does not load `obsidian-page.js` and has no preferences to wait for; what it waits for is Reveal reporting ready, at which point it can be told which slide to show. So `wrapInReveal` carries `showDeck()` beside `Reveal.initialize` and reveals from the promise that call returns. Both owners write the same value, both are the only writer in their own view, and both restore the saved position in the same task in which they reveal — a hidden body has no scroll height and no slide geometry, so the restore has to come after the property is cleared, and nothing is painted between the two. The `page-bootstrap` capability therefore specifies one owner per view rather than one owner overall.
- ~~**Each page holds an open server-sent-events connection to `/hot-reload` for its whole life.** A client that walks many pages through one browser tab accumulates them against the browser's per-host connection limit until navigations queue behind them; the verification suite refuses that endpoint for exactly this reason.~~ **Settled** by the change `settle-page-bootstrap`, and measured before it was repaired rather than assumed. Walking one tab through corpus pages, the server's `clients` map read 2, 3 and 4 for one, two and three pages and never shrank; going back released nothing, because `pageshow` reports `persisted=true` — a page navigated away from stays alive in the back/forward cache, connection included. With five pages the fifth navigation never completed and failed on a 45-second timeout: the browser allows six connections per host, and the navigation queued behind the streams the earlier pages still held. The repair is the pair that covers that cache — `pagehide` closes the stream and clears any pending retry, `pageshow` opens a new one — and the same walk afterwards read **1 at every one of ten steps**, five pages forward and four back, with nothing stalling. The reconnect was repaired with it: it registers no `DOMContentLoaded` listener at all any more, so it cannot accumulate them, and the fixed three-second retry became a doubling backoff up to a minute, reset by a connection that opens. `test/checks/deployment-surface.js` asserts that the gaps grow. The suite still refuses the endpoint inside the browser — a check walks dozens of pages — so the counts above come from a script driving a session of its own, and the server's `clients` map is where they were read: the browser's request accounting counts streams opened, not streams held, and a stream the page closes itself is reported as neither finished nor failed.

- **The companion plugin recognizes block markers on a line of their own, where the renderer accepts them mid-line.** Recorded by the change `plugin-fix-editor-decorations`, which otherwise took the plugin's reading of every tag form from `obsidian.js` — a fragment is `/##fragment(?=\s|$)/g` in both places now, case-sensitive, every occurrence, valid wherever whitespace or the end of the line follows, and one expression serves the editor and the rendered reading view alike. `##side-by-side-start`, `##side-by-side-end`, `##separator` and the closing `@@@` are the exception: the renderer matches them as plain substrings anywhere, the plugin requires the line to be nothing but the marker. A block whose boundary sits inside a sentence has no sensible marking to draw around it, and aligning to the renderer there would mean deciding what a block *is* rather than how it is shown. It only applies to documents nobody writes — but it is a divergence, and a person comparing the two implementations should meet it here rather than as a bug. The direction matters: the plugin recognizes *less* than the server, never more, so marked text is always text the server acts on.
- **The plugin holds its own copy of `namesReservedForRoles`, and nothing holds the two together.** Recorded by the change `plugin-section-authoring`, whose command writes one restricted section per name out of a list a teacher pastes in. `hasRoles` (`utils.js`) adds the session's display name to the role set as a role — that is what makes `@@@ Stu Dent` reach one person — except where it equals `admin`, `teacher`, `teachers`, `student` or `students`, which are dropped with a server-side warning nobody reading the document will ever see. A section generated for a student whose display name is `Students` is therefore addressed to the *role* and read by every student in the school. The plugin needs those five to be able to say so, and it ships to Obsidian as a standalone bundle with no safeLearn checkout anywhere near it, so it mirrors them the way it mirrors the directive grammar. The grammar has an oracle — `test/directive-grammar.test.js` runs both implementations over the same table — and these five have none: they are five string constants that have not changed since the feature existed, and a check of its own would be a second thing to keep in step. The divergence is stated here instead, where a person comparing the two implementations meets it.
- **The collision is reported by the command that generates the sections, and by no marking.** From the same change, and against what its source proposal assumed. The proposal expected the editor's marking to show `Students` as a role rather than as a person — but the plugin cannot draw that distinction: to the server `4bhif`, `teacher` and `Stu Dent` are the same kind of thing, and the only line the plugin could draw is "this is one of the five", which would mark every ordinary `@@@ teacher` in the corpus as a collision. So the report sits in the command, which is the one place in the plugin that knows a *person* was meant, because it was just handed a list of them. It names the collisions once, after writing them, and changes nothing.
- **The plugin renders a side-by-side block's content twice in the reading view, and that is the cheaper of the two options.** Recorded by the change `plugin-hide-tags`, which rebuilds such a block as columns rather than letting the markers vanish and the content run on underneath — a reading view that says nothing about the page the server produces is a reading view with no purpose. A block spans many rendered sections, they arrive in separate post-processor calls in an order the reading view's virtualization decides, and grouping already-rendered siblings into columns means reaching into a container Obsidian is still filling. So the section holding the opening marker renders the whole block itself out of the source `getSectionInfo` hands it, and every other section of the block hides itself — a decision each one makes alone, with nothing waiting for anything else to exist. The content is therefore rendered once by Obsidian into sections that then disappear and once into the columns. It is paid on the two short blocks a document holds rather than on a document, and the alternative was rejected for permission blocks for exactly that reason: a permission block is most of a page, so it gets a frame drawn one section at a time instead.
- **A permission directive inside a side-by-side block gets its text removed and nothing else.** From the same change. The columns are rendered through Obsidian's own renderer, so the plugin's post-processor runs over them again — with no section info behind them, which is the case in which it removes tag text and asserts no structure it cannot establish. The server does not support that combination either: `preprocessSideBySide` runs after `removeForbiddenContent` and matches its markers as plain substrings, so a directive inside a column is a document nobody can write meaningfully. Recorded rather than repaired.
- **The reading view maps a rendered paragraph back onto its source lines by counting `<br>` elements, which assumes Obsidian's default line-break setting.** Also from `plugin-hide-tags`. With *Strict line breaks* off — the default — a single newline is rendered as a break, so the runs of nodes between breaks are the lines the paragraph was written as, in order. That is how a directive line is found in rendered output at all, and it is what makes `#exam` inside a directive harmless: Obsidian renders it as a tag link of its own, so the line arrives as text, an anchor and more text, and a rule reading single text nodes would see three fragments of a directive and recognize none of them. With the setting turned on, a paragraph's lines are joined into running text and a directive that is not the paragraph's first line would keep its characters. The plugin does not read the setting; the case is named here rather than guarded, because guarding it means a second way of finding a line and the two would drift.
- **The block's lid and floor are drawn on the element's own box, and only its side edges are held to the line width.** Recorded by the change `plugin-frame-across-widgets`, which made the frame reach the elements Live Preview renders in place of lines — a table, a callout, a diagram, a formula, an embedded note. Measured in a running Obsidian, only one of them is laid out to a width of its own: a table widget carries `margin-inline: -16px; padding-inline: 16px`, so its box runs 16px wider on each side than the line above it while its content stands exactly where that line's does. The side edges and the tint are therefore background layers positioned against the element's *content* box, which is where they line up whatever that padding is; the horizontal edges are left on the element's box, where a table widget would draw them 16px too wide on each side. It cannot arise in a document anyone writes: both ends of both block kinds are their markers — `@@@` and `##side-by-side-start`/`-end` — and the editor renders a marker line as a line. Drawing them the same way would mean the same rule for a case that has no instance, so the divergence is written down instead. A theme that lays widget elements out differently again is out of scope for the same reason it is out of scope in `design.md`: the rule depends on no number, but a theme that puts the *content* somewhere else would need measuring rather than guessing.
- **The frame reaches those elements as a class written onto an element the plugin does not own, which is a second mechanism beside the decoration set.** From the same change, and the reason is that there is no first one: CodeMirror's `Decoration.line` needs a line, and Obsidian's widget is a sibling of the line elements rather than one of them. `view.posAtDOM` maps such an element back to the line it was built from, so what each line carries is decided once, in `markLines`, and applied twice — as decorations where the editor renders a line, and as a class on the element where it does not. Three things follow and are accepted. A `cm-gap` is skipped by name: it stands for the whole stretch the editor has scrolled away and built nothing for, one element covering many lines, and it answers `posAtDOM` with a real position — framing it by that line would paint a block's frame across an arbitrary part of the document. An element Obsidian rebuilds loses the class until the pass runs again, which is what the `MutationObserver` on `.cm-content`'s child list is for; a diagram and an embedded note both arrive after the update that produced their range. And the pass writes only classes `lineClasses` can produce, listed in `BLOCK_CLASSES` — a class added there and forgotten here would still be *applied*, because what is added comes from the map; what the list is for is taking one off again when a block stops covering an element.
- **The plugin resolves block state over the whole document on every rebuild, and that cost is accepted.** Also from `plugin-fix-editor-decorations`. Marking now rebuilds on a cursor move and a viewport change as well as on a keystroke, which is what the editor requires — in Live Preview a tag becomes editable when the cursor enters it, and the editor builds only the lines around the viewport, so scrolling brings in lines nothing has looked at. Decorations are produced for the visible lines only, but *which lines are inside a block* cannot be decided from the visible lines: a block opened three screens up still governs what is on screen. So the scan walks every line to resolve the blocks and then emits for the visible ones. Line iteration is cheap next to constructing decorations and the corpus is small, but on a very large document a whole-document walk per cursor move becomes noticeable. The alternative — maintaining block state incrementally across updates — is materially harder to get right and would need verification of its own. If it ever becomes visible, the fix is to cache the resolved blocks per document version; written down here so the trade-off is not rediscovered as a defect.
- **The plugin builds its context-menu submenu with `MenuItem.setSubmenu`, which the running Obsidian has and the published typings do not.** Recorded by the change `plugin-menu-submenu-and-icons`, which replaced the five flat entries the plugin used to write into the editor's context menu with one `SafeLearn` entry carrying them. Obsidian 1.13.7 defines `setSubmenu` on the object `Menu.addItem` hands out — it is what the application's own *Format*, *Paragraph* and *Insert* entries are made of — while `obsidian` 1.8.7 declares only `setTitle`, `setIcon`, `setSection` and `onClick` on `MenuItem`. So `main.ts` carries a `declare module "obsidian"` augmentation naming it, rather than an `as any` at the call site that would silence the rest of the expression with it, and asks `typeof item.setSubmenu === "function"` before relying on it. The guard is not about an old Obsidian — `minAppVersion` is 1.5.7 and submenus are older — but about where the code runs: inside the `editor-menu` handler, while a menu is being assembled for somebody who just right-clicked, where a `TypeError` can cost the entries other plugins were about to add. Where the call is absent the plugin writes the flat section it wrote before, so the bad day produces the menu that used to be there rather than a broken one; the answer is asked of a menu of the plugin's own and cached, so that it decides which menu gets built instead of being discovered halfway through building it. `test/obsidian/plugin.test.js` asserts the nesting rather than tolerating it, so a run under a version without the call fails loudly instead of passing on the fallback. A person reading `main.ts` against the API documentation would otherwise meet the call as a bug.
- **Two class names of Obsidian's own are relied on to read that menu back: `has-submenu` and `data-section`.** From the same change. A submenu's items are not in the document until it is open, and it opens on a hover that Obsidian does not accept as a dispatched `mouseover` — so `test/obsidian/harness.js` and `tools/obsidian-screenshots.mjs` find the entry as `.menu-item[data-section="safelearn"].has-submenu` and move the pointer onto it. The section is the plugin's own name and therefore its to rely on; `has-submenu` is Obsidian's, and it is not unique — the application's *Copy path*, *Paragraph* and *Insert* carry it too, which is why the section and not the class is what identifies the entry. Only the harness and the screenshot tool depend on either, so a rename in Obsidian costs a red run and a one-line fix rather than a broken plugin.


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
| [docs-development.md](../docs-development.md) | The realm a development instance needs: why the demo realm carries no LDAP and every role is a client role, the demo accounts and the roles they hold, and which accounts would close the coverage gaps `docs-testing.md` records |
