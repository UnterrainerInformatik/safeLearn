## Why

SafeLearn has grown into a non-trivial Express/Keycloak application with a custom Obsidian-flavored Markdown render pipeline, a role- and time-based permission system, and several deployment variants — but there is no single document that describes the system as a whole. The existing docs (`README.md` plus six linked `docs-*.md` files) are task-oriented (how to build, how to debug, how to write permissions) and scattered; a newcomer, a future maintainer, or an AI assistant has to reconstruct the big picture by reading `app.js`, `obsidian.js`, `obsidian-page.js`, `utils.js` and the middlewares. A consolidated architecture document closes that gap and gives every future change a stable reference point.

## What Changes

- Add a new file `AI/architecture.md` containing a code analysis of the current codebase, written from reading the actual source — not only from the docs.
- The document covers, at minimum:
  - **Technology stack**: runtime (Node.js ESM, Express 4), authentication (Keycloak via `openid-client` + Passport + `express-session`), Markdown/rendering (`marked`, `marked-shiki`, `shiki`, `@shikijs/transformers`, `mermaid`, PlantUML service, `reveal.js`, `dompurify`/`jsdom`), file watching (`chokidar`), transport/utility libs (`axios`, `cors`, `pako`, `uuid`, `lucide-static`, `dotenv`), plus build/run tooling (Docker, docker-compose, GitHub Actions, `nodemon`, httpYac).
  - **Feature and functionality catalog**: derived from `README.md` and every linked doc (`docs-technical-details.md`, `docs-obsidian.md`, `docs-permissions.md`, `docs-wysiwyg.md`, `docs-building.md`, `docs-debugging.md`, `docs-keycloak.md`), cross-checked against the implementation so that documented-but-missing and implemented-but-undocumented items are visible.
  - **Component map**: responsibility of `app.js`, `obsidian.js`, `obsidian-page.js`, `utils.js`, `middlewares/keycloak-middleware.js`, `middlewares/extract-filename-middleware.js`, plus the `css/`, `assets/`, `md/`, `deploy/`, `wysiwyg-container-*/`, `http/`, `.github/workflows/` directories.
  - **Render pipeline**: the `preParse` → `manipulateHtml` → `DOMPurify.sanitize` chain and its individual steps.
  - **Permission model**: file-level and inline permissions, role resolution against Keycloak client roles and LDAP groups, time-based visibility windows and the SSE-driven live reload.
  - **Request/route surface**: the HTTP endpoints the server exposes (`/convert` GET/POST, direct `.md` serving, `/auth/callback`, `/logout`, `/hot-reload` SSE, user-attribute endpoints).
  - **Deployment topology**: Dockerfile, `deploy/`, the two WYSIWYG container variants, GitHub Actions workflow.
  - **Observations**: notable gaps, risks, or inconsistencies found during the analysis — descriptive only, no code changes.
- Add a memory entry recording that the code language for this project is always English — identifiers, comments and documentation alike — and register it in `AI/memory/MEMORY.md`.
- Add a memory entry pointing to `AI/architecture.md` as the architecture reference, registered in `AI/memory/MEMORY.md`.

Assumption (minor, recorded here rather than asked): `AI/architecture.md` is written **in English**, consistent with the English-only rule for code, comments and docs that this same change records in memory. Conversation with the user stays German.

Non-goals:
- No changes to application code, CSS, Markdown content or deployment configuration.
- No refactoring, no bug fixes — problems found are listed under "Observations", not repaired.
- Not a replacement for `README.md` or the `docs-*.md` files; `AI/architecture.md` links to them instead of duplicating their content.

## Capabilities

### New Capabilities

None. This change is documentation-only: it adds an analysis document and memory entries, and does not alter any externally observable behavior of SafeLearn. `skip_specs: true` is set in this change's `.openspec.yaml` accordingly.

### Modified Capabilities

None.

## Impact

- **New files**: `AI/architecture.md`, `AI/memory/code-language-english.md`, `AI/memory/architecture-doc.md`.
- **Modified files**: `AI/memory/MEMORY.md` (two index lines appended).
- **Untouched**: all application code, `README.md`, all `docs-*.md`, `package.json`, `Dockerfile`, `deploy/`, `.github/workflows/`.
- **Read-only inputs**: the whole repository, primarily `app.js`, `obsidian.js`, `obsidian-page.js`, `utils.js`, `middlewares/`, `package.json`, `Dockerfile`, `README.md` and the six linked `docs-*.md` files.
- **Dependencies**: none added, none removed.
- **Downstream effect**: future AI-assisted work in this repo starts from `AI/architecture.md`, and the English-only rule applies to every subsequent code, comment and documentation contribution.
