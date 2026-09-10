## Purpose

Defines what the school's Keycloak realm is allowed to hold as its user directory, so that every safeLearn capability reading from it — role resolution, directory search — can rely on one enabled account per real person and on accounts for people no longer enrolled being handled by a documented rule, rather than accumulating without bound.

## ADDED Requirements

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

#### Scenario: A person is no longer enrolled

- **WHEN** a person's enrollment status, as known to the source directory, changes to no-longer-enrolled
- **THEN** their account is handled per the documented retention rule (for example: disabled, or removed after a retention period) rather than left enabled indefinitely with no distinguishing marker

#### Scenario: Enrollment status cannot be determined

- **WHEN** the source directory provides no signal to determine whether a given account's person is currently enrolled
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
