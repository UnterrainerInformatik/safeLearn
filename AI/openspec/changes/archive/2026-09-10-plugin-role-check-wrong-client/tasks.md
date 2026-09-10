## 1. Settings

- [x] 1.1 Add `serverClientId: string` to `SafeLearnPluginData`, defaulted to `"safeLearn"` in `DEFAULT_DATA`.
- [x] 1.2 Add the corresponding field to the settings tab, next to the existing Keycloak URL / realm fields, with help text making clear it is the safeLearn server's own Keycloak client id (`keycloak.json`'s `resource`), not the plugin's.

## 2. Role check

- [x] 2.1 Change `hasDirectoryRole()` to read `resource_access` under the configured `serverClientId` setting instead of the token's own `azp` claim.
- [x] 2.2 Leave the `ldap`-claim fallback unchanged.
- [x] 2.3 Update the function's own doc comment (currently describes the `azp`-based approach) to match.

## 3. Verification

- [x] 3.1 Add/update a test exercising `hasDirectoryRole()` for an identity whose role is a direct client role under the configured server client id (not under `safelearn-plugin`) - it must now report *logged in*.
- [x] 3.2 Add/update a test confirming an identity holding neither source still reports *logged in without the directory role*.
- [x] 3.3 Confirm existing `ldap`-claim-only test cases (`test/directive-grammar.test.js`, `test/obsidian/plugin.test.js` role-related cases) still pass unchanged.
- [ ] 3.4 Manually verify against the HTL Leonding deployment: with `serverClientId` set to `secureLectures`, an account holding `admin` only as a direct client role (no `ldap` OU) now shows *logged in*, not *logged in without the directory role*.
