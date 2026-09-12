## ADDED Requirements

### Requirement: The total user count and class count are shown up front

The system SHALL show, as soon as the directory query completes with an `ok` outcome, the total number of users and the total number of classes the directory reported, without requiring the person to scroll or search any list to find those totals.

#### Scenario: The directory query succeeds

- **WHEN** the view's directory query completes with an `ok` outcome
- **THEN** the total number of users and the total number of classes the directory reported are both shown, visible without scrolling any list

#### Scenario: The directory query does not succeed

- **WHEN** the view's directory query does not complete with an `ok` outcome
- **THEN** no user/class totals are shown, and the existing failure indication is what the person sees instead
