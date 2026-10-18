## ADDED Requirements

### Requirement: The bar leads to the grading scale

The module's bar SHALL carry, at its right end beside the question pool and the online tests, a button to the grading scale, marked while the scale is the page shown. The module's start page SHALL NOT carry a separate line of links to the module's pages.

#### Scenario: From any page to the scale

- **WHEN** a teacher on a class's page clicks Grading scale in the bar
- **THEN** the grading scale opens and its button in the bar is marked as the current page

#### Scenario: The start page

- **WHEN** a teacher opens `/exam/`
- **THEN** the page lists the school year's classes and has no line of links to the scale or the pool at its end
