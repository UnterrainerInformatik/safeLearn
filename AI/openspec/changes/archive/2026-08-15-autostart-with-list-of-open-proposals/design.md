## Context

See `proposal.md` — Why, and `specs/proposal-intake/spec.md` for the behavior contract. Design-relevant facts about the current state:

- The project-specific Claude setup lives at `AI/claude/`, reachable as `.claude/` through a symlink ([[ai-folder-layout]]). It currently contains only `commands/opsx/` and `skills/openspec-*/` — **there is no `settings.json` and no `CLAUDE.md` yet**, so this change writes the project's first Claude configuration file.
- The user's login shell is fish. Anything invoked from a hook must therefore not rely on the interactive shell's syntax or environment.
- OpenSpec 1.9.0 exposes exactly one extension point for the archive step: `operations.<op>.guidance` in `AI/openspec/config.yaml`, surfaced through `openspec instructions archive --change <name> --json` as `operationGuidance`. The archive skill (`AI/claude/skills/openspec-archive-change/SKILL.md`, steps 1 and 178–182) reads it and treats it as *advisory additive advice*, not as an enforceable check. The block exists in `config.yaml` today only as a commented-out example.
- `AI/proposals/` holds four files right now; `AI/` as a whole is untracked in git, so a deleted file there is gone for good.
- SafeLearn has no test suite. Verification of anything in this change is by observation — starting a session, reading the hook output — not by an automated run.

## Goals / Non-Goals

**Goals:**

- The reminder fires without the assistant having to remember anything: the mechanism must work on the first turn of a cold session, before any instruction file is consulted.
- Zero cost when there is nothing to report — an empty `AI/proposals/` must produce no output, no error, and no measurable start-up delay.
- A single obvious place to look when the behavior is wrong: one settings file, one script.
- The end-of-life step is bound to the archive operation, not to human memory, and preserves Gerald's original wording.

**Non-Goals:**

- No enforcement. Neither the hook nor the archive guidance can *force* a decision — both put the right information in front of the assistant at the right moment, and Gerald decides.
- No state file tracking which proposals were already seen or dismissed. The presence of the file *is* the state; retiring it at archive time is what removes it from the list.
- No general-purpose hook framework. One event, one script.

## Decisions

**D1 — A `SessionStart` hook, not an instruction in memory or `CLAUDE.md`.**
The requirement "automatically, once, at start" is a harness behavior: the hook is executed by Claude Code itself, so it fires deterministically even in a session where the assistant would otherwise dive straight into a task. An instruction file can only be *followed*, not *guaranteed*, and it costs context in every session including the ones with an empty folder. The user's answer during planning — the mechanism belongs in the project-specific Claude setup, the same way memory is wired for this project — points at `.claude/settings.json`, which is exactly where a project-scoped hook lives. Alternative considered: memory entry only — rejected as non-deterministic. A memory entry is still written (D6), but as documentation of the convention, not as the trigger.

**D2 — `AI/claude/settings.json`, not `settings.local.json`, not `~/.claude/settings.json`.**
`settings.json` is the project's shared configuration and belongs to the repository, which matches "projektspezifisches Claude-Setup". `settings.local.json` is the personal, gitignored variant — wrong home for a convention that describes how this repo works. The global `~/.claude` config is explicitly ruled out: the `AI/proposals/` folder only exists here.

**D3 — Matchers `startup` and `resume`; not `clear`, not `compact`.**
"Einmalig beim Start" means once per session. `startup` covers a fresh `claude`, `resume` covers `claude --continue` / `--resume`, which is a session start from the user's point of view. `clear` and `compact` fire *mid-session* and would replay the list after every `/clear`, which is precisely the noise this design is trying to avoid.

**D4 — Plain stdout as the transport, with a JSON fallback.**
For the `SessionStart` event, a hook's stdout is added to the session context, so a script that simply prints its text is the smallest thing that works — no JSON assembly, no `jq` dependency, and the output is directly readable in `claude --debug`. Task group 4 verifies this on a live session. If stdout turns out not to reach the context, the fallback is the structured form — the script emits `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}` — which changes only the script's `printf`, not the settings file or any other decision here.

**D5 — The instruction travels *with* the list, inside the hook output.**
The script prints both the file names and the sentence telling the assistant what to do with them ("offer turning one of these into an OpenSpec change via `/opsx:propose` as the next step"). This keeps the mechanism self-contained: no `CLAUDE.md` to create, no memory lookup to hope for, and the instruction is present only in sessions where it is actionable. Alternative considered: bare list in the hook plus the instruction in a `CLAUDE.md` — rejected because it splits one behavior across two files, and the project has no `CLAUDE.md` to hang it on.

**D6 — Silence when the folder is empty.**
`AI/proposals/` empty or missing → the script prints nothing and exits 0. An "everything is clear" message every single session start is pure noise and trains the reader to skip the block, which would also make them skip it on the day it *does* list something.

**D7 — Traceability by name, with an explicit `Source proposal:` line as the authority.**
The convention "change name = source file basename" is free — it needs no extra file, and a glance at `AI/proposals/` next to `openspec/changes/` shows what is already in flight. But it breaks the moment a change is renamed or one file spawns two changes, so `proposal.md` also carries a literal `Source proposal: AI/proposals/<file>.md` line, and that line wins when the two disagree. This change dogfoods both (change `autostart-with-list-of-open-proposals`, line at the top of its `proposal.md`). Alternative considered: a custom key in the change's `.openspec.yaml` — rejected because that file is CLI-owned and unknown keys have no defined behavior across OpenSpec versions.

**D8 — Archive retirement via `operations.archive.guidance` in `config.yaml`.**
It is the only native extension point for the archive step (see Context) and it is read automatically by the archive skill, so no separate command or wrapper is needed. Its weakness is that it is advisory: the skill "considers" guidance and may decline it. Mitigation is redundancy — the same rule is stated in the spec, in the memory entry (D6) and in the guidance text itself, and the `Source proposal:` line makes the target unambiguous once the rule is applied. Alternative considered: a post-archive shell hook — rejected, Claude Code has no archive event and OpenSpec has no post-archive hook.

**D9 — Move to `changes/archive/<change>/source-proposal.md` instead of deleting.**
The source proposal asks for deletion; Gerald chose relocation during planning. Both satisfy the functional need — the file leaves `AI/proposals/` and is never re-listed — but relocation keeps his original wording next to the change it produced, which matters because `AI/` is untracked and `rm` would be unrecoverable. The archived change directory is the natural home: it is where everything else about that change already lives, and it makes the archive self-explaining. Alternative considered: a `AI/proposals/done/` folder — rejected, it would scatter the change's history across two places and needs its own exclusion rule in the hook script.

**D10 — POSIX `sh`, no `jq`, no Node.**
The script does one `for` loop over `AI/proposals/*.md` and prints. Keeping it dependency-free means it cannot break when Volta switches Node versions, and it stays readable for anyone auditing what this repo executes at session start. It locates the repo through `$CLAUDE_PROJECT_DIR` (set by Claude Code for hooks) with the script's own directory as fallback, so it is independent of the working directory, and it is invoked by its real path under `AI/claude/hooks/` rather than through the `.claude` symlink.

## Risks / Trade-offs

- **Malformed `settings.json` disables the project's hook configuration silently** → the file is validated as JSON before the change is considered done (task 4.1), and the very next session start is observed live (task 4.2).
- **A script that errors or hangs runs on every single session start** → the script is read-only (directory listing, no network, no writes), always exits 0, and is tested against all three states: files present, folder empty, folder absent (task group 4).
- **Claude Code notices changed hook configuration and asks for confirmation before running it** → expected and desirable; Gerald approves it once when the change is applied. Worth stating in the apply summary so the prompt is not a surprise.
- **A repo-committed hook executes a script from the working tree at session start** → the script is small, plain `sh`, and does nothing but list a directory; it is reviewable in full in under a minute. This is the reason for D10's no-dependency rule.
- **Archive guidance is advisory and can be skipped** → covered by D8's redundancy. Worst case the file stays in `AI/proposals/`, gets listed at the next session start, and is retired by hand — a visible failure mode, not a silent one.
- **The list grows stale if proposals are answered without ever becoming an OpenSpec change** → accepted. Retirement is bound to archiving by design; anything handled outside that flow has to be cleaned up manually, and the session-start list is what makes that visible.
- **The instruction lives in the hook output, so it cannot be revised without editing the script** → accepted; the text is three lines and the script is its only consumer.

## Migration Plan

No data migration and nothing to deploy — the change is additive configuration. Sequence: write the script, mark it executable, write `settings.json`, extend `config.yaml`, write the memory entry, then start a fresh session and read the result. Rollback is deleting `AI/claude/settings.json` (or just its `hooks` block) and the script; the archive guidance and memory entry are inert text and can stay or go independently.

## Open Questions

- Should `AI/proposals/` eventually support subfolders (e.g. `AI/proposals/backlog/`)? Today it is flat and the script does not recurse. Answerable later without touching the specs or the settings file — it changes one glob.
- Should archived `source-proposal.md` files be indexed anywhere (a list of "requests as originally written")? Deferrable; the files are discoverable under `changes/archive/*/source-proposal.md` either way.
