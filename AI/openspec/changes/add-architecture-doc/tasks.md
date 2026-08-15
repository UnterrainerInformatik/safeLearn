## 1. Source Analysis (code first, per design D3)

- [x] 1.1 Read `package.json`, `package-lock.json` (top-level resolved versions only), `Dockerfile`, `.env`, `.nvmrc`, `keycloak.json` and `keycloak-htl.json`; note every declared dependency, its version range and the Node base image version
- [x] 1.2 Read `app.js` in full; record the Express setup, middleware order, every route, the SSE `/hot-reload` endpoint, the `chokidar` file watching, and the start-page resolution
- [x] 1.3 Read `obsidian.js` in full (~1300 lines); record the exported state maps, the permission parser, the timed-visibility scheduler, the file/font scanner, the `preParse` steps, the `manipulateHtml` steps, the Reveal.js splitting and the directory-listing rendering
- [x] 1.4 Read `middlewares/keycloak-middleware.js` and `middlewares/extract-filename-middleware.js`; record the OIDC flow, session handling, token refresh, LDAP-group extraction and the user-attribute read/write path
- [x] 1.5 Read `utils.js` and `obsidian-page.js`; record the role-check helpers, the `uiConfig` payload, and the client-side preferences, view toggles and sidebar/TOC behavior
- [x] 1.6 Survey the supporting directories — `css/`, `assets/`, `md/`, `deploy/`, `wysiwyg-container-linux/`, `wysiwyg-container-windows/`, `http/`, `scripts/`, `asciidocs/`, `android/`, `.github/workflows/` — and record what each contributes

## 2. Documentation Analysis (docs second, per design D3)

- [x] 2.1 Read `README.md` and extract the full feature list (teacher features, student features, shortcuts, technical explanation)
- [x] 2.2 Read the six linked docs — `docs-technical-details.md`, `docs-obsidian.md`, `docs-permissions.md`, `docs-wysiwyg.md`, `docs-building.md`, `docs-debugging.md`, `docs-keycloak.md` — and extract every documented feature, endpoint and configuration knob
- [x] 2.3 Diff documented features against the findings from group 1; produce three lists — verified in code (with the file where it lives), documented-only, and undocumented-but-implemented (design D5)

## 3. Write `AI/architecture.md`

- [x] 3.1 Create `AI/architecture.md` with the fixed 10-section skeleton from design D4, in English (design D2)
- [x] 3.2 Write section 1 "Overview" and section 2 "Technology Stack" — each entry naming the dependency, its declared version range and its usage site
- [x] 3.3 Write section 3 "Features & Functionality", grouped into teacher / student / operator, each entry carrying its implementation-status marker from task 2.3
- [x] 3.4 Write section 4 "Component Map" — file and directory to responsibility, at component altitude, no per-function dump
- [x] 3.5 Write section 5 "Request & Route Surface" — endpoint, method, auth requirement, output format
- [x] 3.6 Write section 6 "Render Pipeline" — the `preParse` → `manipulateHtml` → `DOMPurify.sanitize` chain with the concrete function name behind each step
- [x] 3.7 Write section 7 "Permission Model" — file-level and inline permissions, Keycloak client roles and LDAP groups, time windows, SSE-driven live reload
- [x] 3.8 Write section 8 "Deployment & Operations" — Dockerfile, `deploy/`, both WYSIWYG container variants, the GitHub Actions workflow, environment and config files
- [x] 3.9 Write section 9 "Observations" — gaps, risks and doc/code divergences, stated neutrally, no fixes
- [x] 3.10 Write section 10 "Source Documents" — links to `README.md` and the six `docs-*.md` files

## 4. Memory Entries

- [x] 4.1 Create `AI/memory/code-language-english.md` (type `feedback`) recording that code, identifiers, comments and documentation in this project are always English, with **Why:** and **How to apply:** lines — done during planning, the rule applies immediately; its `MEMORY.md` pointer line is already in place
- [x] 4.2 Create `AI/memory/architecture-doc.md` (type `reference`) pointing to `AI/architecture.md` as the architecture reference, linking `[[code-language-english]]`
- [x] 4.3 Append the `architecture-doc` pointer line to `AI/memory/MEMORY.md`, matching the existing `- [Title](file.md) — hook` format

## 5. Verification

- [x] 5.1 Verify every file path, endpoint and function name cited in `AI/architecture.md` exists in the repository
- [x] 5.2 Verify no application file, `README.md`, `docs-*.md`, `package.json`, `Dockerfile` or deployment file was modified (`git status` shows only `AI/architecture.md`, `AI/memory/architecture-doc.md` and `AI/memory/MEMORY.md` as changes from this task group, alongside the already-written `AI/memory/code-language-english.md`)
- [x] 5.3 Verify `AI/architecture.md` carries all 10 sections in the design D4 order and is written in English throughout
