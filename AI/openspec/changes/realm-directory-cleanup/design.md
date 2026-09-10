## Context

The `unterrainer` realm is fed by a bulk import/sync process from the school's own directory service (the exact process and its cadence are not yet known — establishing that is the first task of this change). A read-only census against the realm (via the existing `DIRECTORY_SERVICE_CLIENT_ID`/`SECRET`, which only holds `view-users`) found:

- 14,288 users total, 14,060 enabled, 228 disabled, against an expected ~1,500.
- `briefRepresentation=true` answers a 100-user page in ~140ms, versus ~8.6s for `briefRepresentation=false` — the cheap shape is enough for a census; only a small, targeted set of accounts needs the expensive one.
- A 100-user sample's `createdTimestamp` clustered almost entirely on 2024-07-10/07-12, with a lone outlier from 2025-09-12 — one identifiable bulk import batch, but this does not by itself distinguish "one big import of the full historical roster" from "the same people imported more than once."
- Usernames follow two patterns: `firstinitial.lastname` (teacher-style) and an opaque alphanumeric id (student-style, e.g. `ad040157`) — neither is safe to dedupe on by itself, since two different people can collide under `firstinitial.lastname` and the alphanumeric ids were not confirmed stable across re-imports.

See proposal.md - Why for the full motivation.

## Goals / Non-Goals

**Goals:**
- Get a real, verified count of duplicate-vs-legitimate accounts, using a signal proven stable across imports.
- Land a documented, applied retention rule for no-longer-enrolled people.
- Leave the import/sync process unable to silently reproduce this state.

**Non-Goals:**
- This change does not touch `middlewares/directory-service.js`'s own performance problem (full-realm enumeration on every search) — tracked separately, referenced here only because a smaller realm shrinks its cost.
- This change does not redesign how safeLearn derives roles from `ldap`/client-role claims (`role-resolution`) — it only changes what accounts exist for those mechanisms to read.
- This change does not decide the school's enrollment/data-retention policy from first principles — that is HTL Leonding's policy decision. This change surfaces the facts needed to make it once (investigation task) and then encodes whatever is decided.

## Decisions

**Identity-matching signal: `LDAP_ENTRY_DN` (the `ldap` user attribute) first, institutional email as fallback, not username.**
Usernames follow two different, independently-assigned schemes (teacher initials, opaque student ids) that are not guaranteed unique or stable across re-imports; a distinguished name from the source directory (or, failing that, an institutional email) is the closest thing to a stable external key already present on every account. Alternative considered: matching on `firstName`+`lastName` — rejected, since two students can share a name and the realm already has ~14k accounts to collide over.

**Investigate before deciding the retention rule, rather than picking "disable after N years" up front.**
Whether former students should be disabled, removed after a retention period, or kept per some existing school policy is not something to invent in this design — HTL Leonding may already have a data-retention obligation that dictates it. The investigation task (tasks.md #1) is scoped to surface enrollment-status signal (if any) and current realm composition; the retention rule itself is a decision task (tasks.md #2) that follows from those facts, not before them.

**Dry run before any destructive action, with the report as the reviewable artifact.**
This is production identity data for real people at a real school. The remediation plan (tasks.md #3) always produces a report of exactly which accounts would be disabled/removed and why, gets it reviewed by a person, and only then applies it — mirroring `realm-directory-integrity`'s "Destructive remediation is reviewed before it runs" requirement.

**Fix the recurrence at the import process, not only the realm's current state.**
A one-time cleanup that leaves the same import behavior in place will drift back to today's state at the next sync. Once the investigation identifies what actually runs the import (tasks.md #1), the fix for its dedupe/retention behavior is scoped as its own task rather than assumed here.

## Risks / Trade-offs

- **[Risk]** A stable external id turns out not to exist or not to be reliably unique even within `LDAP_ENTRY_DN`/email (e.g., shared mailboxes, malformed DNs from a flawed past import) → Mitigation: the investigation task's first output is exactly this — confirming which signal is actually reliable — before any matching logic is built on top of it; if none is reliable, that itself is a finding that goes back to whoever owns the source directory, not a reason to fall back to a weaker heuristic.
- **[Risk]** Disabling or removing an account for someone who is, in fact, still enrolled (a false positive in the retention rule) locks a real student or staff member out → Mitigation: the mandatory dry-run report and human review step before any destructive action, plus the "enrollment status cannot be determined → leave untouched, flag for review" requirement rather than defaulting to retiring ambiguous accounts.
- **[Risk]** The import/sync process is owned or operated outside of anything this repository or Gerald directly controls (e.g., a school IT system) → Mitigation: tasks.md scopes "identify what runs the import" as its own early task; if the fix at the source turns out to be outside this project's reach, the finding and a recommendation are still a valid, real deliverable of this change even if the code/process fix itself has to be handed off.
- **[Trade-off]** Doing this investigation properly (verifying a stable id, checking enrollment signal, building the dry-run report) costs more upfront time than just deleting everything not seen in a fresh export — accepted, because the cost of wrongly retiring a real person's account is much higher than the cost of a slower cleanup.

## Migration Plan

1. Investigation (read-only against the realm) → a findings document: true duplicate count, retention-signal availability, realm composition by pattern/date.
2. Retention-rule decision, written down, based on the investigation's findings.
3. Dry-run report generation against current realm state, reviewed by a person (Gerald, and whoever else HTL Leonding needs to sign off on retiring real accounts).
4. Apply the reviewed report; keep pre-change state (a snapshot/export) for a stated rollback window.
5. Fix the import/sync process per whatever the investigation found was causing the recurrence.

Rollback: the pre-change export from step 4 is what a rollback restores from; nothing in this change deletes an account without that snapshot existing first.
