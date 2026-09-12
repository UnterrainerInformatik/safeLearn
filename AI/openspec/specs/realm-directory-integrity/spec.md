# realm-directory-integrity Specification

## Purpose
Defines what the school's Keycloak realm is allowed to hold as its user directory, so that every safeLearn capability reading from it — role resolution, directory search — can rely on one enabled account per real person and on accounts for people no longer enrolled being handled by a documented rule, rather than accumulating without bound.

## Requirements

### Requirement: The directory's federation scope covers only real people

The realm's LDAP federation SHALL be scoped to the directory subtrees that hold the school's actual students and staff, and SHALL NOT reach subtrees holding synthetic, test, or otherwise unrelated accounts. Scope is the realm's first line of defence: an account outside the federation's scope is never imported, so it can never need cleaning up.

#### Scenario: The source directory holds a subtree of non-people

- **WHEN** the source LDAP directory contains a subtree whose entries do not correspond to current students or staff (a test fixture, a service-account tree, a decommissioned department)
- **THEN** the federation's configured scope excludes that subtree, rather than importing its entries and relying on a later cleanup pass to remove them

#### Scenario: Cleaning up inside Keycloak alone

- **WHEN** accounts that the federation's scope still reaches are deleted from Keycloak
- **THEN** this is understood not to be a durable fix — the next import of any kind restores them — and the scope itself is narrowed instead

### Requirement: One enabled account per person

The realm SHALL hold at most one enabled account for a given real person, identified by a stable external signal (the LDAP distinguished name, an institutional email, or another external id that does not change across re-imports) rather than by username or display-name matching alone.

#### Scenario: A re-import matches an existing account

- **WHEN** an import run supplies a person whose stable external id already matches an existing enabled account in the realm
- **THEN** the import updates that existing account rather than creating a second one

#### Scenario: A duplicate is found in the current directory

- **WHEN** two or more enabled accounts share the same stable external id
- **THEN** the accounts are treated as a duplicate to resolve, not as two distinct people

### Requirement: Accounts follow a documented enrollment retention rule

The realm SHALL apply one documented rule for what happens to a person's account once they are no longer currently enrolled (graduated, withdrawn, or otherwise no longer a student or staff member), and that rule SHALL be applied consistently rather than left to accumulate as an accident of import history.

**Approved rule (2026-09-10, Gerald)**: a federated account (one carrying `LDAP_ENTRY_DN`/`LDAP_ID`) is removed as soon as a periodic LDAP full sync finds no matching entry for it in the live source directory anymore — no additional grace period beyond the sync's own cadence, since the live directory is the authoritative signal (investigation found Keycloak's own stored timestamps too unreliable to use instead, see `investigation-findings.md`). Accounts with neither `LDAP_ENTRY_DN` nor `LDAP_ID` (manually created directly in Keycloak) are never touched by this rule — they are not federated, so they cannot be evaluated against LDAP presence at all. This rule presupposes the scope requirement above and cannot substitute for it: an account that is present in the source directory but does not belong to a real student or staff member (the `OU=TestUsers` fixture that made up 84% of this realm) is never caught by a presence check, because it is genuinely present.

#### Scenario: A person is no longer enrolled

- **WHEN** a federated account's person is no longer present in the source LDAP directory at the time of a full sync
- **THEN** the account is removed as part of that sync — not merely disabled, and not left for a separate retention window

#### Scenario: A manually-created account is never evaluated

- **WHEN** an account has neither `LDAP_ENTRY_DN` nor `LDAP_ID`
- **THEN** the enrollment retention rule above does not apply to it, regardless of how long it has existed or when it was last modified

#### Scenario: Enrollment status cannot be determined

- **WHEN** the source directory provides no signal to determine whether a given account's person is currently enrolled (for example, the LDAP sync itself is unavailable or fails)
- **THEN** that account is left untouched and flagged for manual review rather than assumed to be safe to retire

### Requirement: Destructive remediation is reviewed before it runs

Any change to the realm that disables or removes an existing account SHALL be preceded by a report listing exactly which accounts would be affected and why, reviewed by a person before the change is applied, and SHALL be reversible within a stated rollback window.

#### Scenario: A cleanup run is proposed

- **WHEN** a remediation pass identifies accounts to disable or remove
- **THEN** it first produces a report of those accounts and the reason each was selected, without changing any account

#### Scenario: A reviewed cleanup run is applied

- **WHEN** a person has reviewed and approved the report
- **THEN** the accounts it names are changed, and the pre-change state is retained long enough to reverse the change if it proves wrong

### Requirement: The import process does not reintroduce what was cleaned up

The process that feeds accounts into the realm SHALL NOT recreate a duplicate for a person who already has an enabled account, and SHALL NOT leave a newly no-longer-enrolled person's account without the retention rule above eventually being applied to it.

#### Scenario: The same source data is imported again

- **WHEN** the import process runs again against source data it has already imported once
- **THEN** no additional account is created for a person already present in the realm

#### Scenario: The realm's account count is monitored

- **WHEN** an import run finishes
- **THEN** the resulting total account count is checked against the expected order of magnitude for the school, so a reimport that silently balloons the realm again is noticed rather than discovered later by chance

#### Scenario: The directory is enumerated over the admin API

- **WHEN** a client pages through the realm's users over the Keycloak admin API
- **THEN** it stops at a total it fetched beforehand from `users/count`, so the enumeration stays within Keycloak's local database and does not cause the federation to import further entries as a side effect of being read
