## Why

The `unterrainer` Keycloak realm at `auth.htl-leonding.ac.at` — the identity source the deployed secureLectures instance authenticates against — holds 14,288 users (14,060 enabled) where HTL Leonding is expected to have roughly 1,500 active accounts, a ~9.5x gap. A read-only census (`users/count`, a sample page) rules out "mostly stale/disabled accounts": the bulk of the 14k are enabled. `createdTimestamp` on the sample clusters heavily on one date (2024-07-10/07-12), consistent with at least one large bulk import from the school's directory service, but whether repeated imports created duplicate accounts for the same person, or one import ever loaded the full historical student roster rather than current enrollment, is not yet established. This realm size is also why the deployed safeLearn instance's own directory search endpoint times out in production (tracked separately) — but that is a symptom, not the problem this change addresses. This change is about the correctness of the identity data itself.

## What Changes

- Investigate what the realm actually holds: quantify genuine duplicate accounts for the same person versus legitimately-retained former students, using a stable identifying signal (LDAP `distinguishedName`/`LDAP_ENTRY_DN`, email, or another external id) rather than username pattern-matching alone.
- Decide, with documented rationale, what "clean" means here: dedupe only, or also retire accounts for people no longer enrolled — and how "no longer enrolled" is determined from what the realm and its source directory actually expose.
- Produce a remediation plan runnable against the real school directory: a dry-run/report step that lists exactly what would change before anything is disabled or deleted, and a rollback story.
- Identify and address the root cause in the import/sync process so the realm does not silently reaccumulate duplicates or unretired accounts after this cleanup.

**BREAKING**: none to safeLearn's application behavior. This changes the content of production identity data for real people (HTL Leonding students and staff) — every destructive step is designed to run as a reviewed dry run first.

## Capabilities

### New Capabilities
- `realm-directory-integrity`: what the realm's user directory is expected to hold — at most one enabled account per person, and a documented, enforced rule for what happens to an account when the person it belongs to is no longer enrolled — so that every other capability reading from this directory (role resolution, directory search) can rely on it not silently drifting back to today's state.

### Modified Capabilities
(none — this does not change how `role-resolution` or `directory-search` behave, only what the data they read is allowed to look like)

## Impact

- **Affected system**: the `unterrainer` realm on `auth.htl-leonding.ac.at` (production identity data, not safeLearn application code or specs).
- **Affected people**: every HTL Leonding student and staff member with an account in that realm — duplicates and stale accounts identified here belong to real people.
- **Affected safeLearn behavior indirectly**: `role-resolution` and `directory-search` (`middlewares/directory-service.js`) both read this realm; a smaller, deduplicated directory also reduces the per-search cost `directory-search`'s own performance fix has to cover, though that fix is tracked separately.
- **Whoever runs the import/sync job** feeding this realm — the process itself may need a change to stop the recurrence, scoped once the investigation identifies its actual behavior.
