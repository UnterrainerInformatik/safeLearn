## Context

See proposal.md — Why. The eight clauses sit in three requirements of
`plugin-authoring-commands`, all of them about the semester table command. They were written over
two changes: the command itself on 2026-09-14, and the headings-and-day-column change later the same
day, which appended conditions to three of them and so made the missing object visible.

## Goals / Non-Goals

**Goals:**

- Every `WHEN` clause in these three requirements names what is generated, so that the sentence can
  be read once.

**Non-Goals:**

- No behaviour changes, and therefore no code and no checks. Where a reworded clause would describe
  something other than what the checks assert today, the rewording is wrong and not the checks.
- No sweep of the rest of the spec. Only these eight read this way, and a change that also rewrote
  clauses nobody had complained about would be harder to review than the thing it fixes.

## Decisions

**The delta is cut from the live spec rather than retyped.** Each of the three requirements is
copied out of `specs/plugin-authoring-commands/spec.md` whole and the eight lines replaced in place,
each replacement asserted to match exactly once. A requirement retyped by hand would carry a
difference nobody intended into the spec on archive, and in a change whose whole point is wording
that difference would be invisible in review.

**The table is the subject.** "The dialog is generated from" reads as though the dialog were
produced. The command produces a table; the dialog and the range are what it works from and for.

## Risks / Trade-offs

- **A reworded clause could describe a different case than the one the checks cover.** → The
  conditions are carried over unchanged and only the clause in front of them is rebuilt, so what
  each scenario selects for is the same set of inputs it selected for before.

## Migration Plan

None. The spec is the only file that changes, and it changes on archive.
