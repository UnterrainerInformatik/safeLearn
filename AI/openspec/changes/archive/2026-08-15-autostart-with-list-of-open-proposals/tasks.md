## 1. Session-start hook (spec: "Open proposals are surfaced at session start")

- [x] 1.1 Create `AI/claude/hooks/` and write `list-open-proposals.sh` — POSIX `sh` shebang, resolves the repo root from `$CLAUDE_PROJECT_DIR` with the script's own directory as fallback (design D10), iterates `AI/proposals/*.md`
- [x] 1.2 Print nothing and exit 0 when the directory is missing or holds no `.md` file, including the unexpanded-glob case (design D6, spec scenario "No proposals are waiting")
- [x] 1.3 With files present, print the count, one line per file (basename plus its first heading line if present), and the instruction sentence telling the assistant to offer `/opsx:propose` on one of them as the next step (design D5)
- [x] 1.4 Make the script always exit 0 — no `set -e`, unreadable directory tolerated (spec scenario "The check never blocks the session")
- [x] 1.5 `chmod +x AI/claude/hooks/list-open-proposals.sh`
- [x] 1.6 Write `AI/claude/settings.json` with a `hooks.SessionStart` entry, matcher `startup|resume` (design D3), command `"$CLAUDE_PROJECT_DIR/AI/claude/hooks/list-open-proposals.sh"` — the project's first settings file, so create it rather than merging (design D2)

## 2. Archive retirement (spec: "Archiving retires the source proposal file")

- [x] 2.1 Add an `operations.archive.guidance` block to `AI/openspec/config.yaml`, replacing the commented-out example, instructing: read the `Source proposal:` line from the change's `proposal.md`; if the referenced file exists, move it to the archived change directory as `source-proposal.md`; never delete it (design D8, D9)
- [x] 2.2 Cover the two remaining spec scenarios in the guidance text: file already gone → complete normally and report that nothing had to be retired; file retired → name it and its destination in the archive summary
- [x] 2.3 Verify the guidance is actually served: `openspec instructions archive --change autostart-with-list-of-open-proposals --json` returns it as `operationGuidance`

## 3. Convention documentation (spec: "A change records the proposal file it came from")

- [x] 3.1 Write `AI/memory/proposals-autostart.md` (type `project`) describing the full intake convention — session-start listing, change name = source basename, `Source proposal:` line as the authority, move-to-archive on archiving — with **Why:** and **How to apply:** lines, linking `[[ai-folder-layout]]` and `[[openspec-setup]]`
- [x] 3.2 Append its pointer line to `AI/memory/MEMORY.md` in the existing `- [Title](file.md) — hook` format
- [x] 3.3 Confirm this change itself satisfies the convention: name matches `autostart-with-list-of-open-proposals.md`, and `proposal.md` carries the `Source proposal:` line

## 4. Verification

- [x] 4.1 Validate `AI/claude/settings.json` parses as JSON (`python3 -m json.tool`) — a malformed file disables the project's hooks silently
- [x] 4.2 Run the script directly against the current `AI/proposals/` (4 files) and confirm it lists all four plus the instruction sentence
- [x] 4.3 Run it against an empty directory and against a missing directory (`CLAUDE_PROJECT_DIR=<tmpdir>`) and confirm both produce no output and exit 0
- [x] 4.4 Start a fresh Claude Code session in this repo and confirm the list actually reaches the session context; if stdout is not injected, switch the script to the `hookSpecificOutput.additionalContext` JSON form per design D4 and re-verify — verified with a headless `claude -p` session, which named all four files back; plain stdout reaches the context, so the JSON fallback stays unused. `claude -p --continue` confirms the `resume` half of the matcher
- [x] 4.5 Confirm the hook does not fire on `/clear` or on compaction (design D3) — `/clear` and compaction cannot be triggered from a headless session, so this was verified by a controlled negative test instead: with the matcher temporarily set to `compact`, a `startup` session received nothing (answered `NONE`). Matchers are therefore enforced, and neither `clear` nor `compact` matches the pattern `startup|resume`
- [x] 4.6 Confirm no SafeLearn application file was touched — `git status` shows changes only under `AI/`
- [x] 4.7 Run `openspec validate autostart-with-list-of-open-proposals --strict` and confirm it passes
