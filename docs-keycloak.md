Here you find information about the keycloak-setup when you're trying to host it yourself.

[Back](README.md) to the main page.
## Keycloak Setup
In order for this setup to work correctly, you'll have to have a Keycloak-client (private with secret) and standard-authorization-flow enabled (should be enabled anyway).
You need the following user-attributes of type `string` with mapper to the token.
You also need to add the user-attributes to the user-profile first (`Realm settings` -> `User profile (Attribute group = none, not user-metadata)`) in order to allow for the addition of data to your users. Be sure to set those to `allow edit and view for User and Admin` so that the application is able to change the values.
The application uses the following endpoints of the Keycloak-API to do that:
- `GET {{keycloakUrl}}/realms/{{realm}}/account`
- `POST {{keycloakUrl}}/realms/{{realm}}/account`
The user-metadata field `LDAP_ENTRY_DN` will be automatically present because of the LDAP mapper in your Keycloak instance. It will be readable from the `access-token`. So there are no additional setup-steps requried.

| ATTRIBUTE-NAME                                                                              | TYPE   | DESCRIPTION                                                                                           |
| ------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`config`         | string | Holds several preference-values like dark-mode or not or the preferred font, fontsize or line-height. |
| Client -> Client Scopes -> ...-dedicated -> Add Mapper (User Attribute)<br>`lastVisitedUrl` | string | Holds the last-visited page of the current user.                                                      |
