## 1. Investigation

- [ ] 1.1 Identify what process feeds accounts into the `unterrainer` realm (the school directory sync/import: what runs it, how often, and from what source), and whether it is something this project can change.
- [ ] 1.2 Pull a full (or statistically sufficient) export of `LDAP_ENTRY_DN`, email, username, `enabled`, and `createdTimestamp` for the realm, using `briefRepresentation=true` pagination (~140ms/page vs. ~8.6s/page for the full representation).
- [ ] 1.3 Determine which signal is actually stable and unique per person across the export — `LDAP_ENTRY_DN`, email, or neither — and document the finding, including any accounts where it is missing or malformed.
- [ ] 1.4 Using the confirmed stable signal, quantify true duplicate accounts (same person, multiple enabled accounts) versus distinct people.
- [ ] 1.5 Determine what enrollment-status signal, if any, the realm or source directory exposes (e.g. a graduation-year or class attribute, an LDAP OU, a source-side "active student" flag) that could distinguish current from former students.
- [ ] 1.6 Write up the investigation findings: duplicate count, realm composition (current vs. apparent former students, by whatever signal 1.5 found), and confidence in each.

## 2. Retention rule decision

- [ ] 2.1 Based on 1.5/1.6, propose a concrete, documented retention rule for no-longer-enrolled accounts (e.g. disable at graduation, remove after N years) — or document that no reliable enrollment signal exists and recommend how to get one.
- [ ] 2.2 Get the retention rule reviewed and approved (Gerald, and whoever else HTL Leonding requires for a decision that affects real students' and staff's accounts).
- [ ] 2.3 Record the approved rule in `openspec/specs/realm-directory-integrity/spec.md`'s "Accounts follow a documented enrollment retention rule" requirement context (update the delta/spec if the approved rule needs a more specific scenario than what this change proposed).

## 3. Dry-run report

- [ ] 3.1 Build a read-only report generator that, from the 1.2 export plus the 1.3 matching signal and the 2.1 retention rule, lists every account it would disable, remove, or flag for manual review, with the reason for each.
- [ ] 3.2 Run the report against current realm state and sanity-check a sample of its findings by hand (e.g. spot-check a handful of flagged duplicates and a handful of flagged former students against what's actually known about them).
- [ ] 3.3 Circulate the report for review per 2.2's approval path; do not proceed to section 4 without sign-off.

## 4. Apply

- [ ] 4.1 Export/snapshot the realm's current full user state before changing anything, and confirm the snapshot is restorable — this is the rollback point.
- [ ] 4.2 Apply the reviewed report's changes (disable/remove/leave-flagged) via the Admin API, in batches, logging every change made.
- [ ] 4.3 Re-run the census (`users/count`, enabled/disabled split) and confirm the realm now matches the expected order of magnitude (~1,500) plus whatever legitimately-retained former-student accounts the retention rule keeps.
- [ ] 4.4 Keep the 4.1 snapshot available for the stated rollback window before considering it safe to discard.

## 5. Prevent recurrence

- [ ] 5.1 Based on 1.1, identify the specific behavior in the import/sync process that creates duplicates and/or fails to retire former-student accounts.
- [ ] 5.2 Implement or hand off (per 1.1's finding on who owns that process) the fix so re-running the import does not recreate a duplicate for a person already present, per `realm-directory-integrity`'s "import process does not reintroduce what was cleaned up" requirement.
- [ ] 5.3 Add a monitoring check (even a simple one) that compares the realm's total account count against the expected order of magnitude after each import run, so a future silent reimport is noticed rather than rediscovered by chance.
