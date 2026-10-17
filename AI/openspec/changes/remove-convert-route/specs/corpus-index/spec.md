## REMOVED Requirements

### Requirement: Content with no index entry is governed by the directive it carries

**Reason**: The application no longer renders Markdown that has no corpus file behind it. Its only source, the conversion route `/convert` (from a request body or a fetched URL), is removed, so the requirement has no case left to govern.

**Migration**: None for readers, since every rendered page is a corpus file and is governed by the whole-file rule like any other. The scenario "The index is not consulted for a page" lives on in the requirement "A page follows the directive on disk, not the index".

## ADDED Requirements

### Requirement: A page follows the directive on disk, not the index

When a corpus file is requested, the application SHALL decide its whole-file visibility from the directive in the file as it is read for that request, not from the directive the last scan recorded. The shared implementation that decides whether a session may see a file SHALL therefore operate on a directive the caller has already parsed, so that the page and the navigation tree reach the same rule from their two sources.

#### Scenario: The index is not consulted for a page

- **WHEN** a file's directive is edited and a session requests that file before any scan has run
- **THEN** the response reflects the directive as it now stands on disk, not the one the index recorded
