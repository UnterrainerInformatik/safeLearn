## ADDED Requirements

### Requirement: The evaluation context is fixed for the duration of a request

The context a directive is evaluated against — the session's role set, the view preferences that govern the exam, teacher and answer views, and the reference time that a directive's permission windows are compared to — SHALL be resolved once per request and SHALL NOT change while that request is served. Every directive that request evaluates SHALL be decided against that one context, whether it gates a whole file or an inline block, and whether it is reached while building the navigation tree or while filtering the content of a document.

This is what the existing requirement that the role set must not depend on evaluation order asks for, stated so that it holds by construction: with one context per request there is no second assembly that could disagree with the first.

#### Scenario: A preference is written while a page is being assembled

- **WHEN** a session changes one of its view preferences in a second request while a page requested by the first is still being assembled
- **THEN** that page is finished against the preferences it started with, so its navigation tree and its content are the same session's view of the corpus
- **AND** the next page the session requests is the first one decided against the new preference

#### Scenario: A permission window closes during a render

- **WHEN** a document carries several directives whose time window ends at a moment falling between the evaluation of the first of them and the last
- **THEN** all of them are decided against the same reference time, so the window is open for all of them or closed for all of them

#### Scenario: A request stores a preference of its own

- **WHEN** a request writes a new value for one of the session's view preferences
- **THEN** whatever that same request evaluates afterwards uses the value it has just written, rather than the value it replaced

#### Scenario: The same file is judged twice in one request

- **WHEN** a session opens a file that the navigation tree of the same response also lists
- **THEN** the tree and the page reach the same verdict on that file, because both were decided against the same context

### Requirement: Resolving the context costs at most one identity-provider lookup per request

Assembling the evaluation context SHALL query the identity provider at most once per request, however many directives that request goes on to evaluate. A request that evaluates no directive SHALL NOT query it at all. The number of lookups a request causes SHALL NOT grow with the number of files in the corpus, the number of entries in the navigation tree, or the number of gated blocks in the document being rendered.

#### Scenario: A page whose tree and content are both gated

- **WHEN** a session opens a document carrying inline directives, served alongside a navigation tree of files that carry whole-file directives
- **THEN** the identity provider is queried once while that request is served

#### Scenario: A request that asks no permission question

- **WHEN** a session requests something whose handling evaluates no directive
- **THEN** the identity provider is not queried for that request

#### Scenario: The corpus grows

- **WHEN** files carrying whole-file directives are added to the corpus
- **THEN** the number of identity-provider lookups one page view causes is the same as before

### Requirement: A failed context resolution is settled once for the whole request

When the lookup that supplies the view preferences fails, the request SHALL settle on their default values — the exam view off, the teacher view off, answers hidden — for the whole of its duration, and SHALL record the failure in the server log once rather than once per directive. No request SHALL decide one part of its answer against one set of preferences and another part against a different set.

The roles themselves are unaffected by such a failure, because they are carried in the session rather than read by the lookup. The defaults therefore narrow what the session is shown and never widen it: the teacher view off applies the student-view downgrade, the exam view off yields the practice variant, and answers stay hidden.

#### Scenario: The lookup fails while a page is rendered

- **WHEN** the preference lookup fails during a request that renders a document containing content gated by the teacher view
- **THEN** every directive of that page is decided against the default preferences, so the whole page is the view a session without the elevated roles is shown
- **AND** the page is served rather than refused

#### Scenario: A later request succeeds

- **WHEN** the lookup succeeds again on a subsequent request
- **THEN** that request is decided against the session's stored preferences, with nothing carried over from the failed one
