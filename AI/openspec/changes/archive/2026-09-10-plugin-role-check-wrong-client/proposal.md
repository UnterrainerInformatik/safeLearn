## Why

The Obsidian plugin's own "do I hold the directory role" check (`hasDirectoryRole()` in `main.ts`) reads `resource_access[payload.azp]` from its own access token — but `azp` on that token is always `safelearn-plugin`, the plugin's own Keycloak client, which by design (`docs-keycloak.md`, "Plugin login client") never carries client roles of its own. The role the directory endpoint actually gates on lives under `resource_access[<the safeLearn server's own Keycloak client id>]` — e.g. `secureLectures` on the HTL Leonding deployment — a value that is deployment-specific, the same way `keycloakUrl` and `realm` already are. The client-role branch of `hasDirectoryRole()` can therefore never recognize a role granted as a direct Keycloak client role, for any account, on any deployment; it only ever succeeds via the `ldap` claim fallback, and only if that claim happens to also be mapped onto the plugin client's own token. This was found while investigating a report of a teacher/admin account (holding `admin` as a direct client role) being told immediately, in the plugin's own UI, that it holds neither role — while the server itself would have authorized it correctly.

## What Changes

- Add a per-vault setting holding the safeLearn server's own Keycloak client id (the value `keycloak.json`'s `resource` holds server-side), mirroring how `keycloakUrl` and `realm` are already configured rather than assumed.
- Fix `hasDirectoryRole()` to read `resource_access` under that configured client id instead of the token's own `azp`.
- Default the new setting to this project's own convention (`safeLearn`, matching the repo's default `keycloak.json`) so existing installs pointed at the reference deployment keep working without a settings change.

## Capabilities

### Modified Capabilities
- `plugin-directory-auth`: adds the server client id as a configured, per-vault setting (new requirement) alongside the existing instance URL setting.
- `plugin-login-state`: the *logged in* / *logged in without the directory role* distinction is determined by checking the correct client's roles.

## Impact

- **Affected code**: `main.ts` in `safeLearn-Obsidian-plugin` (`SafeLearnPluginData`, `DEFAULT_DATA`, the settings tab, `hasDirectoryRole()`).
- **Affected people**: anyone using the plugin whose teacher/admin role is granted as a direct Keycloak client role rather than (or in addition to) an LDAP `OU=` group — on the HTL Leonding deployment, this includes every account whose `admin` role is a direct client-role grant, which the `ldap` claim cannot express at all.
- **Not affected**: the server-side `/api/admin/directory/search` authorization (`verifyCallerIdentity` in the safeLearn repo) — it already checks the correct, fixed `secureLectures` resource name and was already granting access correctly; only the plugin's own client-side diagnostic was wrong.
