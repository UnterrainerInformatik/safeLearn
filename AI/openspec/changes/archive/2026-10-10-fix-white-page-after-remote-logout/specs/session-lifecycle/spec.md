## Purpose

Defines what SafeLearn does when a session it holds ends at the identity provider — by a logout there or in another application on the same realm — so that the user is sent back to the login instead of being shown a broken page, and so that one ended session cannot take the application down for everyone else.

## ADDED Requirements

### Requirement: A session the identity provider no longer honours ends locally

When the identity provider refuses to renew a session's tokens because that session no longer exists there, the application SHALL end its own session for that user in the same request. From then on the session SHALL NOT count as authenticated, and no request SHALL be served content on its behalf. A session whose renewal fails for any other reason, such as the identity provider being unreachable, SHALL NOT be ended by that failure alone.

#### Scenario: The user signed out at the identity provider

- **WHEN** a user with an open page signs out at the identity provider, directly or through another application on the same realm
- **AND** the application next needs to renew that session's tokens
- **THEN** the application treats the session as ended
- **AND** no later request carrying that session's cookie is answered as authenticated

#### Scenario: The identity provider cannot be reached during a renewal

- **WHEN** a renewal fails because the identity provider does not answer, or answers with a server error
- **THEN** the session is not ended because of that failure
- **AND** the request is still answered, not left hanging and not failed with a crash

### Requirement: The request that finds a session ended is sent to authenticate

A request that arrives without a valid session, or whose session has just ended, SHALL be answered according to what asked for it. A top-level page navigation SHALL be sent into the login and, once that succeeds, returned to the address it asked for. A request that a page makes on its own SHALL be answered with an authentication error and no content. That covers scripts, modules, stylesheets, fonts, images, programmatic requests and the reload stream. It SHALL NOT be redirected to the login page, which such a request cannot use.

#### Scenario: Clicking a link after signing out elsewhere

- **WHEN** a user who has signed out at the identity provider clicks a link on a page that is still open
- **THEN** the browser arrives at the identity provider's login, not at a blank or partly rendered page
- **AND** after logging in again, the user lands on the page the link pointed to

#### Scenario: A page's sub-resource is requested without a session

- **WHEN** a script, module, stylesheet, image or programmatic request reaches the application without a valid session
- **THEN** it is answered with an authentication error status
- **AND** the answer is not the login page and not a redirect to it

#### Scenario: Reloading after signing out elsewhere

- **WHEN** a user who has signed out at the identity provider reloads an open page or enters its address
- **THEN** the browser arrives at the identity provider's login, as it does today

### Requirement: One request's failure does not end other sessions

An error raised while handling one request SHALL be confined to that request. It SHALL NOT terminate or restart the application, and it SHALL NOT discard any other session. That includes errors raised during authentication or token renewal.

#### Scenario: An ended session sends further requests

- **WHEN** a browser keeps sending requests with the cookie of a session that has ended at the identity provider
- **THEN** the application keeps running
- **AND** every other user's session remains valid and their next request is answered without a new login

#### Scenario: A request fails inside the application

- **WHEN** handling a request raises an error that nothing more specific catches
- **THEN** that request is answered with a server error
- **AND** the error is recorded in the server log
- **AND** the application keeps serving other requests
