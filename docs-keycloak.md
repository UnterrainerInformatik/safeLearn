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
