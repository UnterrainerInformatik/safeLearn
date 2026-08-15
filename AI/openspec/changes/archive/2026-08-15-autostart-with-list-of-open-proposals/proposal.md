## Why

Source proposal: `AI/proposals/autostart-with-list-of-open-proposals.md`

`AI/proposals/` is where Gerald drops informal, hand-written change requests — currently four of them (`autostart-with-list-of-open-proposals.md`, `initial-repairs.md`, `install-puppeteer.md`, `make-puppeteer-tests.md`). Nothing surfaces them: they are only found when someone remembers the folder exists and lists it by hand. A request written there can sit unnoticed for weeks while the session that could act on it starts, runs and ends without ever looking.

The mirror-image problem sits at the other end of the workflow: once a proposal file has been turned into an OpenSpec change and that change is archived, the file stays in `AI/proposals/`. It is now indistinguishable from an open request, so every future session would keep re-proposing work that is already done. Without a defined end of life for the file, an automatic reminder at session start would turn into permanent noise.

## What Changes

- Add a **`SessionStart` hook** to the project-specific Claude setup (`.claude/settings.json`, physically `AI/claude/settings.json`) that runs once when a session starts and lists the Markdown files currently in `AI/proposals/`.
  - The hook runs a small shell script, `AI/claude/hooks/list-open-proposals.sh`, whose stdout becomes session context.
  - With open proposals present, the output names each file and instructs the assistant to offer them as the next step (turning one into an OpenSpec change via `/opsx:propose`).
  - With `AI/proposals/` empty or absent, the script prints nothing and exits 0 — no noise in sessions that have nothing pending.
  - Matchers: `startup` and `resume`. Deliberately **not** `clear` or `compact`, so the list appears once per session and does not reappear mid-session.
- Establish a **traceability convention** between a proposal file and the change it produced:
  - The OpenSpec change is named after the source file's basename (this change dogfoods it: `autostart-with-list-of-open-proposals.md` → change `autostart-with-list-of-open-proposals`).
  - The change's `proposal.md` carries an explicit `Source proposal: AI/proposals/<file>.md` line, which is authoritative when the names diverge.
- Add **archive guidance** to `AI/openspec/config.yaml` under `operations.archive.guidance`, which the archive workflow reads via `openspec instructions archive --json`: after a change is archived, its source proposal file is **moved** to `AI/openspec/changes/archive/<change>/source-proposal.md` rather than deleted.
- Add a **memory entry** `AI/memory/proposals-autostart.md` recording the intake convention, plus its pointer line in `AI/memory/MEMORY.md`.

Decisions taken from the user during planning:

- The mechanism belongs in the **project-specific Claude setup**, alongside the way memory is wired for this project — not in the global `~/.claude` configuration.
- On archive the source file is **moved, not deleted**. The original wording in `AI/proposals/autostart-with-list-of-open-proposals.md` asks for deletion; moving satisfies the same goal (the file leaves `AI/proposals/`, so it is never re-proposed) while preserving Gerald's original text, which matters because `AI/` is not yet tracked in git and a delete would be unrecoverable.

Assumptions recorded rather than asked (minor):

- Artifacts and the script are written in **English**, per [[code-language-english]]; the hook's session-start output is English as well, while conversation stays German.
- The script considers `*.md` files directly in `AI/proposals/` — no recursion into subfolders, since none exist.
- `README.md` and any `.gitkeep` inside `AI/proposals/` would be skipped as non-proposals; no such files exist today.

Non-goals:

- No change to SafeLearn application code, CSS, Markdown content or deployment configuration. This change touches only the AI workflow setup under `AI/`.
- The hook does not *create* changes and does not act on its own — it surfaces the list and hands the decision to Gerald.
- No priority, ordering or age heuristics over the proposal files; they are listed as found.
- The four proposal files that exist today are not processed by this change.

## Capabilities

### New Capabilities

- `proposal-intake`: how hand-written requests in `AI/proposals/` enter the OpenSpec workflow — surfaced at session start, linked to the change they produce, and retired into the change archive when that change is archived.

### Modified Capabilities

None. `AI/openspec/specs/` is currently empty; this is the project's first capability spec.

## Impact

- **New files**: `AI/claude/settings.json`, `AI/claude/hooks/list-open-proposals.sh` (executable), `AI/memory/proposals-autostart.md`.
- **Modified files**: `AI/openspec/config.yaml` (adds an `operations.archive.guidance` block, currently only a commented-out example), `AI/memory/MEMORY.md` (one pointer line).
- **Reachable as**: `.claude/settings.json` and `.claude/hooks/list-open-proposals.sh` through the existing `.claude → AI/claude` symlink, per [[ai-folder-layout]].
- **Behavior affected**: every new Claude Code session in this repository gains one extra context block at startup — empty and invisible when `AI/proposals/` holds no files. Every future `/opsx:archive` in this repo gains one extra step.
- **Dependencies**: none added. The script uses POSIX shell plus `ls`/`find`; no `jq`, no Node.
- **Not affected**: `app.js`, `obsidian.js`, `obsidian-page.js`, `utils.js`, `middlewares/`, `package.json`, `Dockerfile`, `deploy/`, `.github/workflows/`, `README.md`, all `docs-*.md`.
- **Risk**: a `settings.json` that fails to parse disables the project's hook configuration; a script that errors adds noise to every session start. Both are covered by explicit verification tasks.
