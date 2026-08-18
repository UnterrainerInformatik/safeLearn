Here you find information about the keycloak-setup when you're trying to host it yourself.

[Back](README.md) to the main page.
## Keycloak Setup
In order for this setup to work correctly, you'll have to have a Keycloak-client (private with secret) and standard-authorization-flow enabled (should be enabled anyway).
```yml
client-authentication: on
Authorization: off
Authentication flow: ['Standard flow', 'Direct access grants']
...
and the appropriate URL settings
```
You need the following user-attributes of type `string` with mapper to the token.
You also need to add the user-attributes to the user-profile first (`Realm settings` -> `User profile (Attribute group = none, not user-metadata)`) in order to allow for the addition of data to your users. Be sure to set those to `allow edit and view for User and Admin` so that the application is able to change the values.
The application uses the following endpoints of the Keycloak-API to do that:
- `GET {{keycloakUrl}}/realms/{{realm}}/account`
- `POST {{keycloakUrl}}/realms/{{realm}}/account`
The distinguished name your LDAP federation stores in the user attribute `LDAP_ENTRY_DN` has to arrive in the token under the claim name `ldap`. That is the name the application reads (`getLdapGroups` in `middlewares/keycloak-middleware.js`), and the `OU=` parts of that string are what the class and teacher roles are derived from. An attribute is not a claim, so this needs a mapper of its own — a `User Attribute` mapper on the client's dedicated scope, mapping `LDAP_ENTRY_DN` to the token claim name `ldap` and added to the ID token. Without it the application sees no LDAP groups at all, and every session is a session without a class.

| ATTRIBUTE-NAME                                                                              | TYPE   | DESCRIPTION                                                                                           |
| ------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`config`         | string | Holds several preference-values like dark-mode or not or the preferred font, fontsize or line-height. |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`lastVisitedUrl` | string | Holds the last-visited page of the current user.                                                      |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`LDAP_ENTRY_DN` -> claim `ldap` | string | The distinguished name the LDAP federation fills in. The application reads the claim `ldap` from the ID token and derives the class and teacher roles from its `OU=` parts. |

## Directory search client

`GET /api/admin/directory/search` needs a second, separate confidential client, because the endpoint's caller (a teacher or admin holding a bearer access token) and the identity the server uses to query the directory are deliberately not the same thing — a teacher's own Keycloak account is never used to reach the Admin REST API.

Create a confidential client with service accounts enabled (e.g. `safelearn-directory-service`), standard flow and direct access grants off — it authenticates as itself, never as a person. On its service account, assign exactly one client role: `view-users` from `realm-management`. Do not assign `manage-users`, `view-groups`, `query-groups`, or any realm-admin role — this identity only ever lists users, never changes them, and never needs Keycloak's native Groups feature, which this application does not use. Record the client id and secret as `DIRECTORY_SERVICE_CLIENT_ID` / `DIRECTORY_SERVICE_CLIENT_SECRET` in every deployment's environment, and in `.env` for local development.

The endpoint verifies its caller by introspecting the bearer token against `{{keycloakUrl}}/realms/{{realm}}/protocol/openid-connect/token/introspect`, authenticated with the existing `safeLearn` client's own credentials above — no separate setup for that half. It accepts either source of the teacher/admin role: the `ldap` claim's `OU=` parts (the same mapper described above), if that mapper is also flagged to be added to the **access token** and not only the ID token; or a `teacher`/`admin` client role assigned directly to the account in Keycloak, independent of LDAP. At least one of the two needs to reach the access token for an account to use this endpoint.

## Plugin login client

The Obsidian plugin (`plugin-admin-directory-ui`) authenticates as the person using it, not as a service — it needs its own Authorization Code + PKCE login, separate from both the clients above. It runs entirely on that person's own machine, so unlike the two confidential clients above it cannot hold a secret: anything shipped inside the plugin is readable by whoever installs it. It must therefore be a public client protected by PKCE instead of a secret.

Create a public client with client id `safelearn-plugin` (this project's own convention — the plugin's code has it as a fixed constant, not a setting):

* `Client authentication` off (public, no secret)
* Standard flow **on**, Direct Access Grants **off** (no password grant), Implicit flow and Service accounts roles off
* Valid Redirect URIs: `obsidian://safelearn-formatter-auth` (namespaced by the plugin's manifest id) — no Web Origins entry, since the redirect is a full page navigation in the system browser, not a CORS fetch
* PKCE Code Challenge Method set to `S256` (**required**, not merely allowed)
* No client roles of its own — what a login is allowed to do comes from the roles already on that person's account, checked the same way the server itself checks them, via the directory search client's introspection above

The PKCE setting has moved around the admin console across Keycloak versions. On older versions it sits under the client's `Advanced` tab → `Advanced Settings`. On newer versions it moved to the client's `Settings` page itself, labeled `PKCE Method` — it stays visible there after creation too, so it can still be changed later through the UI; it was only ever the `Advanced` tab location that stopped applying. If your version has it in neither place, it is always reachable as the client attribute `pkce.code.challenge.method`, independent of the UI entirely:

```bash
kcadm.sh update clients/$CLIENT_UUID -r safeLearn -s 'attributes."pkce.code.challenge.method"=S256'
```

(`$CLIENT_UUID` via `kcadm.sh get clients -r safeLearn -q clientId=safelearn-plugin --fields id`.) The same applies over the raw Admin REST API — `GET` the client, add the attribute to the JSON, `PUT` the whole object back; a partial `PUT` would wipe the rest of its configuration, including the redirect URI above.
