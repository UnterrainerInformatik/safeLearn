## ADDED Requirements

### Requirement: The harness reports the hosts a rendered page contacts

A caller SHALL be able to ask the harness which hosts a page reached out to while rendering, so a check can assert that a view is self-contained. The answer SHALL be taken from what the browser actually requested, not from what the page's markup names: a stylesheet can pull a further host in through an `@import` or a `url()` without any element on the page mentioning it, and a check reading markup alone would report such a page as clean.

#### Scenario: Reading the hosts a page contacted

- **WHEN** a caller loads a page through the harness and asks which hosts it contacted
- **THEN** it receives every host the browser issued a request to while rendering that page, each with the address that caused it
- **AND** requests a loaded stylesheet issued are included, not only those written as an element's `href` or `src`

#### Scenario: A page that reaches a third party

- **WHEN** a rendered page causes a request to a host other than the application under test
- **THEN** that host appears in the answer whether the request succeeded, failed or was refused
- **AND** a check can therefore fail on it without depending on the third party being reachable

#### Scenario: The identity provider

- **WHEN** a caller asks which hosts a page contacted
- **THEN** the identity provider is distinguishable from other external hosts, since authentication legitimately leaves the deployment while content must not
