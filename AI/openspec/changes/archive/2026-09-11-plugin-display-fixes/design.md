## Context

See proposal.md - Why. Both fixes live in the Obsidian plugin (`AI/plugin/main.ts`, symlinked from its own repo); the server-side renderer already handles both cases correctly and is out of scope.

For the closing-marker bug, prior research (not yet verified by writing a failing test) found that the reading view builds its block structure from Obsidian's `ctx.getSectionInfo(el)`, and falls back to a plain-text pass (`stripTagText`, using the regex-based `permissionMarkerPattern`) when that returns `null`. The existing test suite exercises the Live Preview editor (`views.livePreview`) at true end-of-file repeatedly and it works there; the one reading-view test that opens a document ending exactly at `@@@` never asserts the marker is absent, so the reading-view path at true EOF is unverified rather than confirmed-fixed or confirmed-broken.

## Goals / Non-Goals

**Goals:**
- Fix both bugs as scoped in the proposal, in the plugin only.
- Land a regression test for each, since neither edge case is covered today.

**Non-Goals:**
- Touching the server-side renderer (already correct).
- Any change to how permission blocks or generated sections work beyond what proposal.md and the spec deltas describe.

## Decisions

- **Write the failing test first for the closing-marker bug.** The exact code path (whether the bug is in `getSectionInfo` returning `null` and the `stripTagText` fallback not fully hiding the marker, or somewhere else in `resolveBlocks`) is not yet confirmed — only hypothesized from reading the code. Rather than patching the hypothesized fallback path blindly, add a reading-view test for a document ending exactly at `@@@` with no trailing newline first, confirm it fails the way the proposal describes, then fix whatever it actually points at. This keeps the fix anchored to the observed bug rather than to a guess about its cause.
- **Drop the heading rather than move it.** The alternative to removing the `### <Name>` heading entirely would be moving it elsewhere (e.g. above the block) — but the existing (now-removed) requirement's own rationale was that a heading outside the block leaks every name to every reader. Dropping it entirely, and relying on the frame heading `plugin-hidden-tags` already renders, avoids reintroducing that leak while still removing the duplication Gerald flagged.
- **`headingLevelForSections` and related heading-building code in `insertSectionsPerName` becomes dead code once the heading is dropped** and should be removed rather than left unused, per the project's no-dead-code convention — not kept "in case a heading comes back".

## Risks / Trade-offs

- [Removing the in-content heading changes output for any workflow that scraped or grepped generated `### <Name>` headings outside the plugin] → None known; this is a plugin-internal formatting detail, not a documented interchange format. If Gerald knows of an external consumer, flag it before implementing.
- [The closing-marker fix could be in a shared code path (`resolveBlocks`) also used elsewhere] → the added test in Live Preview view already passes today for the equivalent EOF case, so a correct fix should touch only the reading-view-specific fallback, not the shared block-walking logic. Verify no Live Preview test regresses.
