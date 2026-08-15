## Context

See `proposal.md` — Why. Design-relevant facts about the current state:

- The codebase is small in file count but dense: `obsidian.js` alone is ~65 KB / ~1300 lines and holds the whole Obsidian-flavored render pipeline, the permission parser, the file/font scanner and the timed-visibility scheduler. `app.js` (~13 KB) is the Express entry point, `obsidian-page.js` (~13 KB) is the browser-side script, `utils.js` (~6 KB) holds role helpers and the UI config, and `middlewares/keycloak-middleware.js` (~10 KB) owns the entire auth flow.
- Documentation already exists and is good, but is split across `README.md` and six linked files: `docs-technical-details.md`, `docs-obsidian.md`, `docs-permissions.md`, `docs-wysiwyg.md`, `docs-building.md`, `docs-debugging.md`, `docs-keycloak.md`. None of them describes the system end to end.
- There is no test suite and no type system (plain ESM JavaScript, `"type": "module"`), so the source itself is the only authority on actual behavior. Any statement in the architecture document has to be traceable to a file, not only to a doc claim.
- The repo has no established `AI/`-doc conventions yet — `AI/` currently contains only `claude/`, `openspec/` and `memory/`. This change sets the precedent for how analysis documents live there.

## Goals / Non-Goals

**Goals:**

- One self-contained entry point (`AI/architecture.md`) that answers "what is this, what is it built from, what can it do, and where does each piece live" without requiring a source read first.
- Every claim grounded in the source: technology claims come from `package.json` plus actual import/usage sites; feature claims from `README.md` and the linked docs, each cross-checked against the implementation.
- Explicit divergence reporting: features the docs promise but the code does not implement, and behavior the code implements but the docs never mention.
- Stable structure that survives future edits, so later changes update sections rather than rewriting the file.

**Non-Goals:**

- No exhaustive per-function API reference — `obsidian.js` has ~55 functions and listing them all would produce a document nobody maintains. Component-level responsibilities plus the named pipeline steps are the right altitude.
- No architecture *proposals*, no refactoring plan, no prioritized issue list. Findings are recorded neutrally under "Observations".
- No diagrams beyond ASCII/Mermaid fences already renderable by this project — no external image assets.
- Not a duplicate of the existing docs: where `docs-permissions.md` or `docs-obsidian.md` already explain a topic in depth, the architecture doc summarizes and links.

## Decisions

**D1 — Location `AI/architecture.md`, not `docs-architecture.md`.**
The user asked for `/AI/architecture.md` explicitly. It also keeps the AI-facing analysis out of the user-facing doc set that `README.md` links, so `README.md` stays a teacher/student-facing document. Alternative considered: adding it to the `docs-*.md` family and linking it from `README.md` — rejected because it would mix audiences and imply the maintainers keep it current for end users.

**D2 — Written in English.**
Consistent with the English-only rule for code, comments and docs that this change also records in memory. Alternative considered: German, matching the conversation language — rejected because the file is a project artifact, and the surrounding docs and code are already English.

**D3 — Source-first analysis, docs second.**
Read the code to establish what the system does, then read `README.md` and the six linked docs to establish what it claims to do, then diff. The reverse order biases the analysis toward the docs' framing and would let stale doc claims through unchallenged. Cost: more reading up front; benefit: the divergence list, which is the part a pure doc summary cannot produce.

**D4 — Fixed section skeleton.**
`AI/architecture.md` uses this order, which is also the order the tasks build it in:

1. Overview — what SafeLearn is, in a paragraph
2. Technology Stack — runtime, auth, rendering, tooling; each entry names the dependency, its version range from `package.json`, and where it is used
3. Features & Functionality — teacher features, student features, operator features; sourced from the docs, marked with implementation status
4. Component Map — file/directory → responsibility
5. Request & Route Surface — the HTTP endpoints, their auth requirements and their outputs
6. Render Pipeline — `preParse` → `manipulateHtml` → `DOMPurify.sanitize`, step by step
7. Permission Model — file-level, inline, roles/LDAP groups, time windows, SSE live reload
8. Deployment & Operations — Dockerfile, `deploy/`, WYSIWYG containers, GitHub Actions, environment/config files
9. Observations — gaps, risks, doc/code divergences
10. Source Documents — links to `README.md` and the six `docs-*.md` files

Alternative considered: a free-form narrative — rejected because a fixed skeleton makes the file diffable and lets future changes touch one section.

**D5 — Feature entries carry an implementation-status marker.**
Each feature row is marked as verified in code (with the file where it lives), documented-only (no implementation found), or undocumented (found in code, absent from the docs). This is what turns a feature list into an analysis. Alternative considered: a plain bullet list copied from `README.md` — rejected, it would add nothing over reading `README.md`.

**D6 — Two separate memory files, not one.**
`code-language-english.md` (type `feedback` — a standing rule about how work is done, with a Why and a How-to-apply) and `architecture-doc.md` (type `reference` — a pointer to the artifact). The memory convention in `MEMORY.md` is one file = one fact; merging a standing rule with a file pointer would make both harder to recall correctly. Both get a line in `AI/memory/MEMORY.md`.

**D7 — Read-only against project code.**
The analysis touches no application file. Verification of the doc is by re-reading the sources it cites, not by running the app.

## Risks / Trade-offs

- **The document goes stale as the code moves on** → Keep the section skeleton stable (D4) so a future change edits one section instead of rewriting; cite file paths rather than line numbers, which drift on every edit.
- **`obsidian.js` is large enough that a partial read produces confident-but-wrong claims** → Read it in full during the analysis task rather than grepping for symbols, and cite the concrete function name behind each pipeline claim.
- **Over-detailing turns the doc into an unmaintainable API dump** → Enforced by the D4 skeleton and the explicit non-goal; component-level altitude, named pipeline steps only.
- **Doc/code divergences may be intentional (planned features, deprecated docs)** → Report them neutrally under "Observations" as observations, never as defects, and never fix them in this change.
- **Version ranges in `package.json` (`^`) do not state what is actually installed** → Quote the range from `package.json` as the declared dependency; where the exact resolved version matters (e.g. Node base image), take it from `Dockerfile`/`package-lock.json` and say which source it came from.

## Migration Plan

Not applicable — additive documentation only. Rollback is deleting the three new files and the two `MEMORY.md` lines.
