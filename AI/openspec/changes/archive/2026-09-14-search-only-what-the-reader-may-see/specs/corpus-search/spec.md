## Purpose

Defines what a search over the Markdown corpus may return and what it may never reveal: that every result is derived from a fresh read of the file it names and filtered through the same permission implementation a rendered page uses, how a query is matched and ranked, the shape of a result, each channel through which a search could otherwise disclose content or the existence of content the session may not see, and how following a hit lands the reader on the heading it was found under. `role-resolution` governs which roles a session holds and how a directive is evaluated against them; `corpus-index` governs what a scan records; this capability governs what a reader may be told about the corpus in answer to a query.

## ADDED Requirements

### Requirement: The index proposes, the file decides

A search MAY use the index to choose which files to open. It SHALL NOT derive a result's visibility, its text, or its existence from the index. For every file the index proposes, the application SHALL read that file and decide visibility from what it reads, through the same implementation that decides it for a rendered page. An index that no longer matches the corpus SHALL therefore be able to cost a missed candidate or a candidate that turns out to match nothing, and SHALL NOT be able to disclose anything.

#### Scenario: A file is restricted after the last scan

- **WHEN** a file that the index recorded as unrestricted is given a whole-file directive naming a role the searching session lacks, and no scan has run since
- **THEN** a query matching its text returns no result for that file
- **AND** the answer does not distinguish itself from a query that matches nothing anywhere

#### Scenario: A file is relaxed after the last scan

- **WHEN** a whole-file directive is removed from a file and no scan has run since
- **THEN** a session that could not see it before may receive it as a result

#### Scenario: A file's text changed after the last scan

- **WHEN** a file's text is edited so that it no longer contains the queried term, and no scan has run since
- **THEN** the file is opened as a candidate and contributes no result, because the text that decides is the text on disk

### Requirement: A query is answered over filtered content only

For each candidate file, the application SHALL resolve the whole-file directive first, and SHALL then remove every inline block the session may not see, before any matching, ranking or quoting is performed. Matching, ranking and snippets SHALL operate on the text that survives that removal and on no other text. The decision about who may see a block SHALL be reached through the implementation `role-resolution` governs, and SHALL NOT be restated by the search.

#### Scenario: A term occurs only in a restricted block

- **WHEN** a session searches a term that occurs in the corpus only inside an inline block addressed to roles it does not hold
- **THEN** no result is returned for the file containing that block

#### Scenario: A term occurs in a block addressed to another person by name

- **WHEN** a session searches a term that occurs only in a block addressed to a different person by name
- **THEN** no result is returned, and the session is told nothing about that person or that block

#### Scenario: The same session changes its view

- **WHEN** a session runs the same query before and after switching the teacher, exam or answer view
- **THEN** the results change exactly as the rendered pages do for that same switch

#### Scenario: A term is visible to one session and not another

- **WHEN** a teacher session and a student session run the same query against a corpus where the term occurs in a block only the teacher may see
- **THEN** the teacher receives a result for it and the student receives none

### Requirement: A match never spans the place where hidden content was removed

Removing a block from a document makes the text before it and the text after it adjacent. The application SHALL NOT report a match that exists only across such a seam, because that match is on text that never existed in the document as written.

#### Scenario: Removal creates a term that was never written

- **WHEN** removing a hidden block places the end of one retained passage directly against the start of the next, such that the joined text contains the queried term although neither passage does
- **THEN** no match is reported for it

### Requirement: A search discloses nothing about content the session may not see

Beyond the content itself, the application SHALL NOT disclose the name, the path, or the existence of a file the session may not see, and SHALL NOT disclose that any content was withheld. An answer about hidden content SHALL be indistinguishable from an answer about content that does not exist.

#### Scenario: A query matches a restricted file's name

- **WHEN** a session searches a term occurring in the file name or path of a file whose whole-file directive excludes it
- **THEN** no result is returned, and the file's name and path appear nowhere in the response

#### Scenario: Nothing announces an omission

- **WHEN** a query would have matched content the session may not see
- **THEN** the response contains no notice, marker, placeholder or gap indicating that something was withheld

### Requirement: Any count shown is a count of what is shown

The application SHALL NOT report a number of matches, files or occurrences that includes anything the session is not shown. There SHALL be no total hit count computed before filtering and no indication of further results beyond those returned, because the difference between such a number and what is displayed measures the hidden corpus.

#### Scenario: Results are counted

- **WHEN** a session is shown a count alongside its results
- **THEN** that count equals the number of results it has been shown

#### Scenario: Two sessions differ in what they may see

- **WHEN** a teacher session and a student session run the same query and the teacher may see strictly more
- **THEN** neither response contains a number from which the size of the difference could be read

### Requirement: No query assistance is derived from content the session may not see

Any suggestion, completion, correction or other assistance the search offers SHALL be derived only from content the session may see. A vocabulary assembled over the unfiltered corpus SHALL NOT reach the reader in any form.

#### Scenario: A completion would reveal a restricted term

- **WHEN** a session types a prefix that, across the whole corpus, is completed only by a term occurring solely in content it may not see
- **THEN** no completion is offered for that term

### Requirement: Matching is substring and case-insensitive

The application SHALL match a query as a case-insensitive substring of the filtered text. It SHALL NOT reduce words to stems and SHALL NOT apply fuzzy or typo-tolerant matching, so that a query is a prefix or interior of the words it finds and a reader searching a German compound's first element finds the compound.

#### Scenario: A query matches inside a longer word

- **WHEN** a session searches a term that occurs in the corpus only as the first element of a longer compound word
- **THEN** the document containing that compound is returned

#### Scenario: Case differs

- **WHEN** a session searches a term whose casing differs from every occurrence in the corpus
- **THEN** those occurrences are found

### Requirement: A hit in a heading or a file name outranks a hit in body text

The application SHALL rank a result carrying a match in the document's name or in one of its headings above a result whose matches fall only in body text.

#### Scenario: Two documents match

- **WHEN** a query matches the name or a heading of one document and only the body text of another
- **THEN** the first is ranked above the second

### Requirement: A result is a document that can be expanded to its matching headings

A result SHALL identify one document by its name and its path, and SHALL be expandable to the headings within that document under which matches were found. The reader SHALL be able to open the document itself or to follow one of those headings. Both the headings offered and their order SHALL be derived from the filtered content.

#### Scenario: A document matches under several headings

- **WHEN** a document contains matches under more than one heading the session may see
- **THEN** the result can be expanded to those headings
- **AND** a heading whose section the session may not see is not among them

#### Scenario: A result is opened directly

- **WHEN** the reader follows the result rather than one of its headings
- **THEN** the document is opened at its beginning

### Requirement: A result opens the page view

Following a result SHALL open the document's page view. The print and presentation renderings SHALL NOT be separate search targets, since they display the same Markdown source selected by query parameter.

#### Scenario: A result is followed from any view

- **WHEN** a reader follows a search result
- **THEN** the page view of that document is opened, whatever view the reader was in

### Requirement: Following a hit lands on its heading after the page is revealed

A result SHALL carry the identity of the heading it was found under — its text together with its occurrence within the document — rather than an anchor generated by a render. The jump SHALL be performed by script after the page has been revealed, in the same task as the reveal, so the reader's first painted frame is already in position and the fixed header's offset is applied rather than corrected afterwards. A target that cannot be found in the revealed page SHALL be a silent no-op.

#### Scenario: A reader follows a heading

- **WHEN** a reader follows one of a result's headings
- **THEN** the document opens scrolled to that heading, without a visible jump from the top of the page

#### Scenario: A document repeats a heading

- **WHEN** the heading a result names occurs more than once in the document
- **THEN** the reader lands on the occurrence the search found, counted over the content that session is served

#### Scenario: A hand-written target names something the session may not see

- **WHEN** a request carries a heading target that is absent from the page as filtered for that session
- **THEN** the page is shown from its beginning and nothing reports whether the target was absent or merely empty

#### Scenario: The document changed since the search

- **WHEN** the document has been edited so that the named heading and occurrence no longer exist
- **THEN** the page is shown from its beginning rather than at a guessed position

### Requirement: Every query is authenticated and authorized afresh

The search SHALL be reachable only to an authenticated session, and each query SHALL be answered against the session's permissions as they stand when it is answered. An incremental search SHALL therefore re-authorize on every query it issues, and SHALL be debounced so that the rate at which queries can be issued is bounded.

#### Scenario: An unauthenticated request

- **WHEN** a request reaches the search without an authenticated session
- **THEN** it is refused, as every other content route refuses it

#### Scenario: A preference changes between keystrokes

- **WHEN** a session changes a view preference while an incremental search is in progress
- **THEN** the next query is answered against the new preference
