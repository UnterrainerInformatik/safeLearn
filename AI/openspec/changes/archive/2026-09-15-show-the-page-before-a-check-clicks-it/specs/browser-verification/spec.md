## MODIFIED Requirements

### Requirement: The harness fetches a rendered page by path and view

A content check works on rendered output, and the same source file is served in three views. A caller SHALL be able to ask for a named path in a named view and receive the rendered result without repeating navigation, view selection and the application's own reveal-on-init behavior in every check.

A page view is served hidden and is shown by its own bootstrap once the session's preferences arrive. Until then every element on it measures zero by zero, so a check cannot click one, type into one, or measure one. The harness SHALL therefore return a page that is **shown**, not merely one whose content has appeared in the DOM — otherwise each caller races the bootstrap, and a check that clicks passes or fails according to which answered first.

The wait SHALL be bounded and SHALL fail by naming what it waited for. The application's own hidden period is bounded, so a page that is never shown is a state the application recovers from; a harness that waited on it indefinitely would turn that into a run that never ends.

Where a view is revealed by something other than the page bootstrap, the harness SHALL wait on that view's own readiness rather than on the page bootstrap's.

#### Scenario: Requesting a page in a view

- **WHEN** a caller asks for a corpus path as a page, as a presentation or as a document
- **THEN** the harness navigates to it and returns once the application has rendered it
- **AND** the caller can read both the text and the structure of the result

#### Scenario: A check clicks what it was handed

- **WHEN** a caller asks for a corpus path and then clicks or types into an element of the returned page
- **THEN** that element has the size and position it will have for a reader
- **AND** the outcome does not depend on how long the session's preferences took to arrive

#### Scenario: The page does not render

- **WHEN** the requested path does not render — the application redirects away, or the content never appears
- **THEN** the harness fails with a message naming the path, the view and where the request ended up
- **AND** it does not return an empty result that a check could mistake for an empty page

#### Scenario: The page renders but is never shown

- **WHEN** the requested path renders its content but the application does not show it within the harness's bound
- **THEN** the harness fails with a message naming the path, the view, and that the page stayed hidden
- **AND** it does not return a page whose elements a check would find unclickable for a reason the failure does not explain
