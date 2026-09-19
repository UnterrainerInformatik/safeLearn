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

A request reads the first of the two **at most once**, however many permission directives it goes on to evaluate, and a request that evaluates no directive — a stylesheet, an image, the hot-reload stream — does not read it at all. The answer is resolved once into the request's permission context (`permission-context.js`) and every check of that request is decided against it; before that, each directive cost a request of its own, which was around a hundred and forty of them for one page view of a corpus the size of the production one. The write is unchanged: a request that stores a preference posts once, and merges from the context it already holds rather than reading the account again first.

The distinguished name your LDAP federation stores in the user attribute `LDAP_ENTRY_DN` has to arrive in the token under the claim name `ldap`. That is the name the application reads (`getLdapGroups` in `middlewares/keycloak-middleware.js`), and the `OU=` parts of that string are what the class and teacher roles are derived from. An attribute is not a claim, so this needs a mapper of its own — a `User Attribute` mapper on the client's dedicated scope, mapping `LDAP_ENTRY_DN` to the token claim name `ldap` and added to the ID token. Without it the application sees no LDAP groups at all, and every session is a session without a class.

| ATTRIBUTE-NAME                                                                              | TYPE   | DESCRIPTION                                                                                           |
| ------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`config`         | string | Holds several preference-values like dark-mode or not or the preferred font, fontsize or line-height. |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`lastVisitedUrl` | string | Holds the last-visited page of the current user.                                                      |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`LDAP_ENTRY_DN` -> claim `ldap` | string | The distinguished name the LDAP federation fills in. The application reads the claim `ldap` from the ID token and derives the class and teacher roles from its `OU=` parts. |

## Directory search client

`GET /api/admin/directory/search` needs a second, separate confidential client, because the endpoint's caller (a teacher or admin holding a bearer access token) and the identity the server uses to query the directory are deliberately not the same thing — a teacher's own Keycloak account is never used to reach the Admin REST API.

`GET /api/admin/directory/status`, which reports how far a running directory fetch has got and what the held data is, sits behind the exact same gate: the same introspection of the same bearer token, the same teacher-or-admin decision, and the same bare `403` for anyone else — including for a caller presenting no token, which stays indistinguishable from one presenting a valid token without the role. It needs no Keycloak identity of its own, because it makes no Keycloak call at all; it only reports state the server already holds. See [Directory API](docs-technical-details) for both endpoints' shapes.

Create a confidential client with service accounts enabled (e.g. `safelearn-directory-service`), standard flow and direct access grants off — it authenticates as itself, never as a person. On its service account, assign exactly two client roles from `realm-management`: `view-users` (list/read users) and `view-events` (read admin events, used below to detect changes without a full refetch). Do not assign `manage-users`, `view-groups`, `query-groups`, or any realm-admin role — this identity only ever reads, never changes anything, and never needs Keycloak's native Groups feature, which this application does not use. Record the client id and secret as `DIRECTORY_SERVICE_CLIENT_ID` / `DIRECTORY_SERVICE_CLIENT_SECRET` in every deployment's environment, and in `.env` for local development. For the deployment this repository's workflow performs, that means two repository secrets of exactly those names: `.github/workflows/docs-local.yml` writes them into `deploy/.env` and `deploy/docker-compose.yml` passes them to the container. They deliberately do not go into the image's own `.env` — it is baked into a layer that is pushed to a registry. `test/deployment-config.test.js` asserts both of those, so a future variable cannot go missing the way these two did.

The realm also needs **Admin Events** turned on (`Realm settings` -> `Events` -> `Admin events settings` -> `Save events`), with an expiration of at least 30 days. The directory cache (`middlewares/directory-service.js`) uses `GET .../admin-events?resourceTypes=USER&max=1` to ask "has anything changed since the cache was built" instead of relying only on the user count, which misses a role/class reassignment on an existing user. This only sees changes made through Keycloak's own admin API/console — a change picked up straight from the LDAP backend (no periodic sync is configured on the production realm; see `AI/memory/realm-directory-cleanup-investigation.md`) stays invisible to it until Keycloak itself re-syncs that user, same as it already was before this. If Admin Events is off, or the service account lacks `view-events`, the directory cache falls back to the plain count+TTL check it always had — this is a strengthening of that check, not a replacement, and nothing breaks if it's unavailable.

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

### What this realm answers for token lifetimes

Read out of one real exchange against `auth.unterrainer.info` on the `safeLearn` realm, and written down so that a change to this realm's session settings is a known number rather than a guessed one. Nothing in the plugin derives from either figure beyond renewing the access token before it runs out:

| Field | This realm answers | What it is |
| --- | --- | --- |
| `expires_in` | `300` (five minutes) | How long an issued access token is good for. The plugin keeps it in memory only, and renews thirty seconds before it runs out. |
| `refresh_expires_in` | `1800` (thirty minutes) | How long the refresh token issued beside it is good for. This is the realm's SSO Session Idle, and it is also Keycloak's own default, so a deployment that has not touched it answers the same. |

The plugin does not keep `refresh_expires_in`, and a login in progress is not measured by it. A login is given ten minutes — `LOGIN_DEADLINE_MS` in `main.ts`, the plugin's own constant — and a deployment on a realm with different session settings needs nothing configured here.

The two quantities are not the same kind of thing, which is why one is not derived from the other. `refresh_expires_in` measures a session: how long an identity stays good for, or, on a refresh near the end of a session, how little of that session is left. The deadline measures a person: typing a password, clearing a second factor, and finding the phone the second factor is on. An earlier version of the plugin took the first for the second, and a realm that answered `1` on a refresh at the end of a session locked that installation out of logging in permanently — every login was over on the first tick after the browser opened, and only a successful exchange could have overwritten the figure. A realm must not be able to decide that, and now it cannot.

`test/obsidian/plugin.test.js` asserts the access-token figure against a real exchange, so a change to this realm's session settings shows up as a red check naming the new number rather than as a lifetime nobody notices is wrong. The same block asserts that a lifetime stored by an earlier version does not shorten the deadline a login gets.
