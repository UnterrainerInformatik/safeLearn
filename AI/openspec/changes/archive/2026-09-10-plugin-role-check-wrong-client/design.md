## Context

`hasDirectoryRole()` (`main.ts:691-699`) is documented as diagnostic-only — "nothing else gates on this, since the endpoint's own refusal already collapses 'no role' into the same response as 'not logged in'" — but it drives the *logged in* vs *logged in without the directory role* distinction in `plugin-login-state`, which is what the person actually sees. It currently derives the client to check for `resource_access` roles from the held token's own `azp` claim. For the plugin's token that is always `safelearn-plugin` (`DIRECTORY_CLIENT_ID`), a client that by design never carries teacher/admin client roles (`docs-keycloak.md`) — so this branch can never succeed, on any deployment, for any account whose role is a direct client-role grant. See proposal.md - Why for how this was found.

## Goals / Non-Goals

**Goals:**
- Make the plugin's own role diagnostic check the same client the server's `verifyCallerIdentity` actually gates on, so the two never disagree for reasons that have nothing to do with the account's real roles.
- Keep the fix deployment-agnostic: no hardcoded client id, since `secureLectures` is specific to the HTL Leonding deployment.

**Non-Goals:**
- Not changing the server side (`verifyCallerIdentity`/`utils.js`) — it already checks the correct, fixed resource and was not part of this bug.
- Not changing `directory-search`'s own performance behavior (tracked separately).
- Not attempting to auto-discover the server's client id from the instance URL — no endpoint currently exposes it, and adding one is a server-side change out of scope here.

## Decisions

**A new setting, not a derived value.** The server's Keycloak client id (`resource` in its own `keycloak.json`) is not obtainable from anything the plugin already has — the instance URL and realm don't imply it, and `keycloak.json` is deliberately never served to a browser. Treating it as a setting, defaulted to `safeLearn`, mirrors exactly how `keycloakUrl` and `realm` are already handled (same comment in `main.ts` already calls out that these "vary per deployment"). Alternative considered: have the server expose its own client id via a small unauthenticated endpoint — rejected as a needless new server surface for a value an admin can just type in once, the same way they already type in the instance URL.

**Existing installs need no action.** `data.json` is loaded with `Object.assign(DEFAULT_DATA, loadedData)`-style merging already (per how `DEFAULT_DATA` is used elsewhere in the file); adding a new key with a default value works the same way `refreshTokenLifetimeSeconds` was added before it — an install that predates this change simply gets the default (`safeLearn`) until changed, matching this project's own reference deployment.

**Keep the `ldap` fallback exactly as it is.** The bug is specifically the client-role branch; the `ldap`-claim branch already checks the token's own `ldap` claim directly and has no client-id ambiguity to fix. Not touched here.

## Risks / Trade-offs

- **[Risk]** A deployment's admin never sets the new setting, and their server's client id differs from `safeLearn` → the diagnostic is wrong again, in the same direction as today → Mitigation: this is strictly better than today (works out of the box for the reference deployment, same as `keycloakUrl`/`realm` already do), and the setting sits next to those two in the same settings section, so anyone who had to configure a self-hosted instance already knows to look there.
- **[Risk]** Someone reads this as fixing the actual authorization, not just a diagnostic → Mitigation: no behavior of the directory search call itself changes; this only affects what `plugin-login-state` shows. Worth calling out plainly in the settings tab's existing help text for this section (a wording tweak, not a new task group).
