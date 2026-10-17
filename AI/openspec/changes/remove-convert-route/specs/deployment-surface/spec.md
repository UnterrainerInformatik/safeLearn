## ADDED Requirements

### Requirement: The application fetches no URL a request names

No route SHALL make the application fetch a resource whose address the request supplies, whether as a query parameter, a body field or a header. In particular, the application SHALL NOT forward a request's `Cookie` or `Authorization` header to any host a request names. The conversion route `/convert`, which did both, SHALL NOT exist. A request to it, by `GET` or `POST`, with or without parameters, SHALL be answered exactly as any other path the application does not serve: an authenticated session is sent to the start page, and a request without a session is answered as `checkAuthenticated` answers it.

#### Scenario: A session asks the server to fetch a URL

- **WHEN** an authenticated session requests `GET /convert?url=http://internal.example/`
- **THEN** the application makes no outbound request
- **AND** the session is sent to the start page, as for an unserved path

#### Scenario: A session posts Markdown or a URL for conversion

- **WHEN** an authenticated session posts `{"content": "…"}` or `{"url": "…"}` to `/convert`
- **THEN** no Markdown is rendered and no outbound request is made
- **AND** the answer is the same as for a `POST` to any other unserved path

#### Scenario: The answer reveals nothing about the former route

- **WHEN** an authenticated session requests `/convert` and, separately, a path that never existed
- **THEN** both answers have the same status and the same redirect target
