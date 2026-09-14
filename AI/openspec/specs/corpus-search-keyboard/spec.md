# corpus-search-keyboard Specification

## Purpose

Defines how a reader drives the corpus search from the keyboard: what the search field does when it takes focus and from which kind of pointer, the selection that walks the result list and an expanded result's headings, what each arrow key means in each position the selection can hold, where the selection is handed back to the field, and that all of it is an addition which leaves the pointer — and touch in particular — able to operate the search alone. `corpus-search` governs what a result may contain and what a search may never reveal; this capability governs only how the reader moves through results that capability has already decided they may see.

## Requirements

### Requirement: The field offers its content for replacement when the focus did not come from a finger

When the search field takes focus and that focus did not arrive from a touch, the application SHALL select the field's entire content, so that the next character typed replaces the previous query. When the focus arrives from a touch, the application SHALL leave the field exactly as it behaves without this capability. The decision SHALL be made per interaction rather than per device, so that a machine offering both a fine pointer and a touchscreen behaves according to which one was used.

#### Scenario: The field is clicked with a pointing device

- **WHEN** a reader clicks into the search field while it holds a previous query
- **THEN** the whole query is selected
- **AND** the next character typed replaces it

#### Scenario: The reader wants to extend the previous query instead

- **WHEN** the field's content stands selected after such a focus and the reader presses arrow-right
- **THEN** the selection is given up and the caret stands at the end of the text
- **AND** the next character typed is appended to the previous query

#### Scenario: The field is reached from the keyboard

- **WHEN** the field takes focus with no pointer involved
- **THEN** its content is selected, as it is for a fine pointer

#### Scenario: The field is tapped

- **WHEN** a reader taps the search field on a touchscreen while it holds a previous query
- **THEN** nothing is selected and the caret stands where the tap put it

#### Scenario: The reader drags across part of the query

- **WHEN** a reader presses inside the unfocused field and drags across part of its text before releasing
- **THEN** the text that was dragged across is what stands selected

### Requirement: A selection walks the result list while the field keeps the focus

When results are displayed, the application SHALL maintain at most one selected node, drawn from the results and from the headings of results that are expanded, and SHALL mark the selected node visually. The search field SHALL remain the focused element throughout, so that the query can still be edited while a node is selected.

#### Scenario: The reader enters the list

- **WHEN** the caret is in the field, results are displayed, and the reader presses arrow-down
- **THEN** the first result is marked as selected

#### Scenario: Only one node is marked

- **WHEN** the selection is moved from one node to another
- **THEN** the node it left is no longer marked and only the node it reached is

#### Scenario: The query is refined while a node is selected

- **WHEN** a node is selected and the reader types a further character
- **THEN** the character reaches the search field and narrows the query

#### Scenario: There is nothing to enter

- **WHEN** the caret is in the field, no results are displayed, and the reader presses arrow-down
- **THEN** no node is selected and the field behaves as it does without this capability

### Requirement: Arrow-down and arrow-up move through the list as it currently stands

Arrow-down SHALL move the selection to the next node of the list read top to bottom, and arrow-up to the previous one, where the list is the results in their displayed order with the headings of each expanded result following that result. The selection SHALL NOT wrap: at the last node, arrow-down SHALL leave the selection where it is.

#### Scenario: Moving down through results

- **WHEN** a result other than the last is selected and the reader presses arrow-down
- **THEN** the result below it is selected

#### Scenario: The end of the list

- **WHEN** the last node of the list is selected and the reader presses arrow-down
- **THEN** the selection stays on it and the list does not wrap to the top

#### Scenario: An expanded result's headings lie in the path

- **WHEN** a result is expanded and selected, and the reader presses arrow-down
- **THEN** the first of that result's headings is selected, rather than the next result

#### Scenario: Leaving an expanded result's headings downwards

- **WHEN** the last heading of an expanded result is selected and the reader presses arrow-down
- **THEN** the next result is selected

#### Scenario: Moving back up into a heading list

- **WHEN** the result following an expanded result is selected and the reader presses arrow-up
- **THEN** the last heading of that expanded result is selected

### Requirement: Arrow-right opens a result's headings and then steps into them

Arrow-right on a selected result that has headings and is not expanded SHALL expand it and leave the selection on the result. Arrow-right on a selected result that is already expanded SHALL move the selection to its first heading. Arrow-right SHALL do nothing when the selected result has no headings, and nothing when a heading is selected.

#### Scenario: Opening a result

- **WHEN** a result with headings is selected, is not expanded, and the reader presses arrow-right
- **THEN** its headings are shown
- **AND** the selection is still on the result

#### Scenario: Stepping into an open result

- **WHEN** an expanded result is selected and the reader presses arrow-right
- **THEN** its first heading is selected

#### Scenario: A result with nothing to open

- **WHEN** a result that matched under no heading is selected and the reader presses arrow-right
- **THEN** nothing opens and the selection does not move

#### Scenario: A heading has nothing below it

- **WHEN** a heading is selected and the reader presses arrow-right
- **THEN** the selection does not move and nothing opens or closes

### Requirement: Arrow-left closes a heading list and lands on the node it belongs to

Arrow-left on a selected heading SHALL close the heading list it belongs to and select the result that list belongs to. Arrow-left on a selected result that is expanded SHALL close it and leave the selection on that result.

#### Scenario: Leaving a heading list

- **WHEN** a heading is selected and the reader presses arrow-left
- **THEN** that result's headings are no longer shown
- **AND** the result they belong to is selected

#### Scenario: Closing a result the selection already stands on

- **WHEN** an expanded result is selected and the reader presses arrow-left
- **THEN** its headings are no longer shown and the selection stays on the result

### Requirement: The selection is handed back to the field at the top and at the left edge

Arrow-up while the first result is selected, and arrow-left while a result that is not expanded is selected, SHALL both give up the selection and return the caret to the search field, placing it at the end of the query. The application SHALL remember the node the selection stood on when it was handed back, for as long as the query is unchanged. Once the selection has been given up, arrow-left SHALL again move the caret within the query.

#### Scenario: Leaving the list upwards

- **WHEN** the first result is selected and the reader presses arrow-up
- **THEN** no node is marked
- **AND** the caret stands at the end of the query in the search field

#### Scenario: Leaving the list leftwards

- **WHEN** a result that is not expanded is selected and the reader presses arrow-left
- **THEN** no node is marked and the caret stands at the end of the query in the search field

#### Scenario: Arrow-left means the caret again

- **WHEN** the selection has just been given up in either of those ways and the reader presses arrow-left
- **THEN** the caret moves within the query and no node becomes selected

### Requirement: Arrow-right at the end of the query enters the list where the reader left it

When nothing is selected in the field, the caret stands at the end of the query and results are displayed, arrow-right SHALL move the selection into the list: onto the node it was last handed back from if the query has not changed since, and onto the first result otherwise. Entering the list this way SHALL issue no query. Where text is selected in the field, or the caret stands anywhere but at the end of the query, arrow-right SHALL keep its ordinary meaning within the field.

#### Scenario: The reader returns to where they were

- **WHEN** the selection was handed back from the third result, nothing has been typed since, and the reader presses arrow-right
- **THEN** the third result is selected again

#### Scenario: The list is entered for the first time

- **WHEN** the caret stands at the end of the query, results are displayed, the selection has not yet been in this list, and the reader presses arrow-right
- **THEN** the first result is selected

#### Scenario: The whole query stands selected

- **WHEN** the field has just taken focus with its content selected and the reader presses arrow-right
- **THEN** the text selection is given up and the caret stands at the end of the query
- **AND** no node is selected

#### Scenario: The caret stands within the query

- **WHEN** the caret stands anywhere but at the end of the query and the reader presses arrow-right
- **THEN** the caret moves one position to the right and no node is selected

#### Scenario: There is nothing to enter

- **WHEN** the caret stands at the end of the query, no results are displayed, and the reader presses arrow-right
- **THEN** no node is selected

#### Scenario: Entering the list asks nothing

- **WHEN** the reader enters the list with arrow-right
- **THEN** no request is made to the search

### Requirement: Enter follows the selection, exactly as following the link does

Enter while a node is selected SHALL open what a pointer following that node opens: for a result, the document at its beginning; for a heading, the document at that heading. Enter while no node is selected SHALL do nothing.

#### Scenario: A result is followed by key

- **WHEN** a result is selected and the reader presses Enter
- **THEN** the page view of that document opens at its beginning, as it does when the result is clicked

#### Scenario: A heading is followed by key

- **WHEN** a heading is selected and the reader presses Enter
- **THEN** the page view of that document opens at that heading, as it does when the heading is clicked

#### Scenario: Enter with the caret in the field

- **WHEN** no node is selected and the reader presses Enter
- **THEN** nothing is opened and nothing is submitted

### Requirement: Changing the query gives up the selection and the memory of it

When the query is changed, the application SHALL give up the selection and SHALL forget the node it was last handed back from, so that the next entry into the list starts at the first result. When the displayed results are replaced, the selection SHALL be given up and the caret SHALL be in the search field, because a position in the previous list names nothing in the new one.

#### Scenario: The query is narrowed while a node is selected

- **WHEN** a node is selected and a further keystroke produces a new set of results
- **THEN** no node is marked
- **AND** arrow-down enters the new list at its first result

#### Scenario: The memory does not survive a change to the query

- **WHEN** the selection was handed back from the third result and the reader then types a further character
- **THEN** arrow-right selects the first result of the new answer rather than the third

#### Scenario: The query falls below the minimum length

- **WHEN** a node is selected and the reader deletes characters until the query is shorter than the search's minimum
- **THEN** no results are displayed and no node is marked

### Requirement: Expanded and collapsed is one state, shared with the pointer

Whether a result's headings are shown SHALL be a single state per result, set by the expand affordance and by the arrow keys alike. There SHALL be no separate keyboard notion of an expanded result.

#### Scenario: Opened by pointer, walked by key

- **WHEN** a reader expands a result with the expand affordance and then moves the selection onto that result and presses arrow-down
- **THEN** the first of its headings is selected

#### Scenario: Opened by key, closed by pointer

- **WHEN** a reader expands a result with arrow-right and then clicks its expand affordance
- **THEN** its headings are no longer shown

### Requirement: The selected node is brought into view

When the selection moves to a node that is not visible within the result list's own scrolling area, the application SHALL scroll that area so the node is visible. It SHALL NOT scroll the document the reader is on.

#### Scenario: The list is longer than the space it is given

- **WHEN** the selection is moved downwards past the last result visible in the list's scrolling area
- **THEN** the list scrolls so the selected result is visible
- **AND** the page behind the sidebar does not scroll

### Requirement: A key the search acts on does not also do what it would otherwise have done

When a key press moves the selection, expands or collapses a node, or follows a selection, the application SHALL suppress that key's default effect, so that navigating the list does not move the caret within the query and does not scroll the page. Key presses the search does not act on SHALL be left to the rest of the page.

#### Scenario: Walking the list does not move the caret

- **WHEN** a node is selected and the reader presses arrow-down or arrow-up
- **THEN** the caret's position within the query is unchanged and the page does not scroll

#### Scenario: An unrelated shortcut still works

- **WHEN** the caret is in the search field and the reader presses the shortcut that opens the print rendering
- **THEN** it does what it does anywhere else on the page

### Requirement: Navigating the list asks nothing and reaches nothing that is not displayed

Moving the selection, entering the list, leaving it, expanding a result and collapsing it SHALL issue no query. The selection SHALL be able to reach only nodes that are displayed. The field SHALL NOT offer values it has held before: arrow-down SHALL enter the result list and SHALL NOT open a list of earlier queries, so that a browser profile several readers share never shows one reader's queries to another.

#### Scenario: The whole list is walked

- **WHEN** a reader moves the selection from the first node to the last and back
- **THEN** no request is made to the search

#### Scenario: Arrow-down with earlier queries in the browser's own history

- **WHEN** queries have been entered into this field before on this browser profile and the reader presses arrow-down
- **THEN** no list of earlier queries is shown

### Requirement: The selection is exposed programmatically, not only visually

The selected node and whether a result is expanded SHALL be conveyed to assistive technology, and not by appearance alone. The field SHALL name the node currently selected, and a result that can be expanded SHALL report whether it is.

#### Scenario: A node is selected

- **WHEN** the selection stands on a result or a heading
- **THEN** the search field names that node as the one currently selected

#### Scenario: A result is expanded

- **WHEN** a result's headings are shown
- **THEN** that result reports itself as expanded, and as not expanded once they are hidden again

### Requirement: A search operated by touch alone is unaffected

Every result and every heading SHALL remain openable, and every expand affordance operable, without a keyboard. Nothing this capability adds SHALL become the only way to reach a result, a heading, or a result's headings.

#### Scenario: The search is used entirely by touch

- **WHEN** a reader types a query with an on-screen keyboard, taps a result's expand affordance and taps one of its headings
- **THEN** the document opens at that heading, exactly as it does without this capability

#### Scenario: No selection appears without a key

- **WHEN** a reader operates the search by touch only
- **THEN** no node is marked as selected at any point
