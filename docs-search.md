# Search Function
Here you can find how the search field beside the navigation tree answers a query: what the server does with it, why it is answered in two passes, and what it is deliberately unable to tell you.

[Back](README.md) to the main page.
## The Shape Of It
One rule runs through all of it: **the index proposes, the file decides.** The in-memory index a scan left behind is allowed to say *which files are worth opening* and nothing else. Every word that reaches a reader — every heading, every snippet, the order of the results — comes out of a fresh read of the file itself, filtered through the very same permission implementation a rendered page goes through.

That split is what makes a search safe rather than careful. There is no second copy of the permission rules to keep in step with the first, and there is no state that could go stale in a way that discloses something: a stale index costs a wasted read, never a leak.

```plantuml
title One query - from keystroke to answer

actor Reader
participant "Search field\n(obsidian-page.js)" as Field
participant "GET /search\n(app.js)" as Route
participant "searchCorpus\n(obsidian.js)" as Search
participant "Index\n(lastIndexEntries)" as Index
database "md/\non disk" as Disk
participant "Permission context\n(role-resolution)" as Perms

Reader -> Field: types a character
Field -> Field: the way back into the list is given up,\nthe pending debounce is cancelled

alt shorter than minimumQueryLength (3 characters)
  Field -> Field: nothing is asked and nothing is shown
else three characters or more
  Field -> Field: wait searchDebounceMs (250 ms),\nthen number this query
  Field -> Route: GET /search?q=... with cache: no-store
  Route -> Route: checkAuthenticated
  Route -> Search: searchCorpus(req, query)

  group Pass 1 - the index proposes
    Search -> Index: case-insensitive substring over\nthe recorded path and text
    Index --> Search: candidate paths
    note right of Index
      Touches no disk and asks no
      permission question. Deliberately
      generous: it may propose a file
      that turns out to answer nothing.
    end note
  end

  group Pass 2 - the file decides, all candidates at once
    Search -> Disk: read every candidate
    Disk --> Search: the text as it stands right now
    Search -> Perms: resolveFileVisibility() and, per block,\nhasSomeRoles() - the page's own implementations
    Perms --> Search: the passages this session may read
    note right of Perms
      One permission context per request,
      joined by all candidates: a whole
      query costs the identity provider a
      single lookup however many files
      it opens.
    end note
    Search -> Search: match inside each passage,\nthen headings, snippet and rank
  end

  Search --> Route: { results: [ ... ] }
  Route --> Field: 200 - the results and nothing else
  Field -> Field: discard the answer if a newer\nquery has been issued meanwhile
  Field -> Reader: the list, rebuilt whole
end
```
## The Route
`GET /search?q=…` is registered beside the content routes in `app.js` and gated exactly as they are: `checkAuthenticated` refuses a request without a session before anything else runs, so an unauthenticated search is refused the way an unauthenticated page is. Every query is authorized afresh against the permission context of that very request, which is why a view preference changed between two keystrokes takes effect on the second.

A query shorter than `minimumQueryLength` is refused with a `400` rather than answered with an empty list. A refusal is the only answer that says nothing at all about what is there.

Both numbers live in `obsidian.js` and are handed to the field as `data-` attributes, so the minimum length and the debounce are one decision each rather than two copies that can drift:

| SETTING | VALUE | WHY |
| --- | --- | --- |
| `minimumQueryLength` | 3 characters | Measured against the production corpus (279 files, 1.41 MB): the median one-character query proposes 273 of 279 files, two characters 173, three 101, four 42. One and two characters measure the corpus rather than search it. |
| `searchDebounceMs` | 250 ms | Longer than an answer takes — the slowest three-character query measured is answered in about 90 ms — so the reader never waits on a queue, and short enough not to feel like a delay. It also means that typing issues no query at all until the reader pauses, so a probe costs a pause each. |

Both are security parameters rather than comfort ones: together they bound how fast a reader can probe the corpus, and the minimum length bounds how much of it one probe can be about.
## Pass One: The Index Proposes
`candidatePaths()` walks `lastIndexEntries`, the map a scan built, and keeps every file whose path or whose recorded text contains the query case-insensitively. That map holds each file's full text because the scan reads it anyway — the whole-file directive, the inline blocks and the text all come out of one read, and an entry whose `mtime` has not moved is carried forward instead of being read again. `corpus-index` governs what a scan records.

This pass touches no disk and asks no permission question. It is deliberately generous: a file it proposes may turn out to be one this session may not see, or one whose text has changed since the scan. Both are settled by reading the file.
## Pass Two: The File Decides
Each candidate is then handed to `answerFromFile()`, which repeats — in the same order — exactly what the page handler does before it renders anything.

```plantuml
title A candidate file, from the disk to a result - answerFromFile()

start
:read the file from disk;
note right
  The index proposed this file.
  It decides nothing about it.
end note
if (is it still there?) then (yes)
else (no)
  :contributes nothing;
  stop
endif
:drop the leading invisible marks;

partition #MistyRose "the whole-file directive, as the page resolves it" {
  if (does the first line carry one?) then (yes)
    :resolveFileVisibility(req, permissions);
    if (visible to this session?) then (no)
      :contributes nothing;
      note right
        The same answer a file that does not
        match gives. Neither the name nor the
        path appears anywhere in the response.
      end note
      stop
    else (yes)
      :drop the directive line;
    endif
  else (no)
  endif
}

partition #AliceBlue "filterForbiddenSegments - the passages this session may read" {
  :every inline permission block decided by hasSomeRoles(),\nall of them against one reference date;
  :the survivors are handed back as a LIST,\neach carrying the offset it was taken from;
  note right
    Never as a joined string. Removing a block
    makes the text before it and the text after
    it adjacent, and a term found across that
    seam is a term nobody wrote.
  end note
}

partition #Lavender "matched inside each passage, never across two" {
  :occurrencesIn() - every hit, per passage;
  :headingsOf() - each heading's text and which\noccurrence of that text it is, counted over\nthe filtered content and nowhere else;
  :headingAt() - the heading each hit stands under;
}

if (any hit, or does the file name match?) then (yes)
else (no)
  :contributes nothing;
  stop
endif

:snippetAround(first hit) - 60 characters either side,\nclipped to that one passage's own bounds;
:one entry per heading a hit was found under,\nin the order the filtered content puts them in;
:prominent = a hit in the name or in a heading;
:{ name, path, snippet, headings };
note right
  "prominent" orders the answer and is then
  stripped from it: what is not shown is not sent.
end note
stop
```

Three things in that flow are worth saying out loud:

- **Nothing here restates a permission rule.** `resolveFileVisibility` and `hasSomeRoles` are the two the rendered page reaches, reached again. `role-resolution` governs both.
- **The filter hands back a list, not a string.** `filterForbiddenSegments` is the one implementation of inline block filtering and has two callers: the render pipeline joins the passages (`removeForbiddenContent`), and the search matches inside each of them separately. A caller that never sees two passages in one string cannot report a match across the place a hidden block was cut out — the seam is closed by construction rather than by a boundary check every future caller would have to remember.
- **The occurrence number is counted over the filtered content.** A corpus of exam questions repeats `## Answer` dozens of times, and the reader has to land on the one the search found. The page in front of them is the same document filtered the same way, so the two counts agree.
## Why The Split Is The Whole Safety Argument
Because the second pass reads the file, an index that has gone stale can cost a candidate that turns out to match nothing, or a candidate it failed to propose in the first place. It cannot disclose anything:

| WHAT CHANGED SINCE THE LAST SCAN | WHAT THE SEARCH DOES |
| --- | --- |
| A file was given a directive the session lacks the roles for | proposed by the index, then refused by `resolveFileVisibility` — no result |
| A file's directive was removed | proposed and answered; the session may now see it, and does |
| A file's text no longer holds the term | opened, matched against the text on disk, contributes nothing |
| A file was deleted | the read fails and it contributes nothing; no error reaches the reader |

Every one of those outcomes is indistinguishable from a file that simply does not match — which is also what a file the session may not see looks like.
## Matching And Ranking
Matching is **case-insensitive substring**, over the filtered text. No stemming, no fuzziness, no typo tolerance: a query is a prefix or an interior of the words it finds, so a reader searching a German compound's first element finds the compound. `occurrencesIn()` uses a regular expression over the original text rather than `indexOf` over a lowercased copy, because lowercasing changes the length of a few characters and an offset taken against a copy of a different length would quote the wrong part of the passage.

Ranking has exactly one rule and a tie-breaker: a hit in the document's name or in one of its headings is what the reader was probably looking for and comes first; a hit that falls only in body text is what they get when it was not. Within each of the two groups the results are ordered by name, case-insensitively.
## The Shape Of A Result
A result is a **document**, not an occurrence. It carries its name, its path, one snippet, and the headings its hits were found under:

```json
{
  "name": "Sorting Algorithms",
  "path": "/md/algorithms/sorting.md",
  "snippet": "…comparison sorts, of which quicksort is the one that…",
  "headings": [ { "text": "Quicksort", "occurrence": 1 } ]
}
```

One snippet per document is what the sidebar has room to show, and what is not shown is not sent. The list itself is built client-side with `createElement` and `textContent` throughout: a snippet is corpus text quoted back, and corpus text is written by people who may write angle brackets, so assembling the list as markup would make every document containing a `<script>` in a code fence a hazard on the way to the reader.
## What The Search Deliberately Does Not Do
Every item here is an absence that was decided on, not a feature that is missing:

- **No total, no count taken before filtering, no "N more".** The difference between such a number and what is displayed would measure the part of the corpus this session may not see. The route sends the list and has nothing else to send.
- **No marker where something was withheld.** An answer about hidden content has to be indistinguishable from an answer about content that does not exist.
- **No completion, suggestion or correction.** All three would have to be derived from a vocabulary, and a vocabulary assembled over the corpus is exactly the thing that may not reach a reader. If one is ever added, it has to be built from filtered content only.
- **No client-side caching of answers.** The field fetches with `cache: no-store`; an answer served out of the browser's cache would be an answer that was authorized once and shown again.
- **No assembling of one list out of two answers.** A result list is replaced whole, and an answer is dropped when a newer query has been issued since — broad queries can come back after narrower ones started later.
- **No browser history in the field.** `autocomplete="off"` is load-bearing rather than tidy: `↓` in a text input is also the key that opens the browser's own list of values the field has held before, and on a machine several readers share, that list is other readers' queries.
## Following A Hit
Following a result opens the **page view**, whatever view the reader was in — the print and presentation renderings display the same Markdown source and are selected by query parameter, so a hit belongs to the document rather than to one of its renderings. Following the result itself opens the document at its beginning; following one of its headings lands on that heading.

```plantuml
title Following a hit to its heading - why it is not an anchor

start
:the heading link carries\n?heading=<text>&occurrence=<n>;
note right
  Not a #fragment. makeContentMap gives every
  heading a fresh uuid on every render, so an
  id means nothing outside the render that
  produced it - and the browser resolves a
  fragment during load, while the body is
  still hidden, landing at the top.
end note
:the page view is requested;
:rendered and filtered for this session - again,\nfrom the file, by the same implementation;
:the body is served hidden;
:revealPage() reveals it;
:safeLearnRestorePosition();
:safeLearnJumpToHeading();
note right
  Called immediately after the restore, in the
  same task as the reveal: a hidden body has no
  scroll height, and nothing is painted between
  the two, so the reader's first frame is
  already in position.
end note
if (a .docanchor with that text, at that occurrence?) then (found)
  :scroll to it, less the 50 px fixed header;
  note right
    The offset is applied here rather than
    repaired afterwards, which is what the
    hashchange listener does for hand-written
    hash links.
  end note
else (not found)
  :stay at the top, silently;
  note right
    Which is what makes a hand-written target
    useless for probing: a heading that is absent
    and a heading that was filtered out of this
    session's copy look exactly alike from here.
  end note
endif
stop
```
## Driving It From The Keyboard
The reader's hands are already on the keys when the query is typed, so every step after it can be taken there too. The search field keeps the focus throughout — the selection is a mark on a node, not a focus ring — which is what lets the query go on being refined while a result stands selected. The field is a `combobox` over the result list and writes `aria-activedescendant` from the same place it writes the mark, so what is seen and what is announced cannot disagree.

| KEY | IN THE FIELD | ON A RESULT | ON A HEADING |
| --- | --- | --- | --- |
| `↓` | enters the list at the first result | the next node below | the next node below |
| `↑` | — | the node above; from the first result, back to the field | the node above |
| `→` | at the end of the query: back into the list, where it was left | closed: opens its headings; open: steps into the first of them | — |
| `←` | — | open: closes it; closed: back to the field | closes the heading list and lands on the result |
| `⏎` | — | opens the document at its beginning | opens the document at that heading |

Three things follow from the field keeping the focus, and each is a decision rather than an accident:

- **`←` and `→` mean the list while something is selected**, so both of them lead back to the field at the edges — `↑` at the first result and `←` on a result that is not open. The way back to a caret is a key the reader's hand is already on.
- **`→` means one step right, and when there is nothing left to the right, one level in.** With the whole query selected it collapses the selection; with the caret inside the query it moves one character; only at the end of the query does it mean the list. Extending a query and stepping into the results therefore never contend for the key.
- **`→` resumes and `↓` starts at the top.** Leaving the list is not losing your place: as long as nothing is typed, `→` goes back to the node the selection was handed back from, while `↓` is always the first result. Typing anything forgets it, so the memory can never point into a list the reader is no longer looking at.

Focusing the field selects the query it holds, so the next character typed replaces it; `→` gives that up and puts the caret at the end for a reader who wanted to extend it instead. That selection is held to a focus a finger did not cause — the decision is the `pointerType` of the press the focus followed, not what the machine is capable of — so a tap leaves the field exactly as it behaves without any of this, and a laptop with a touchscreen gets the convenience from its trackpad and the old behaviour from its screen.

**None of this is the only way to anything.** Every result, every heading and every expand affordance is operated by pointer and by touch alone; whether a result is expanded is one state that the chevron and `→` both set. `Escape` is deliberately unbound — `type="search"` clears the field natively.

Navigating asks nothing. The selection walks nodes that are already on screen, and a node is on screen because the two passes above already decided this session may see it — so holding `↓` measures nothing that reading the list does not already show.
## Where The Code Is
| WHERE | WHAT IT DOES |
| --- | --- |
| `app.js` — `GET /search` | the gate, the minimum length, and an answer that carries the results and nothing else |
| `obsidian.js` — `searchCorpus()` | the two passes, the concurrency and the ranking |
| `obsidian.js` — `candidatePaths()` | pass one: the whole of what the index is allowed to decide |
| `obsidian.js` — `answerFromFile()` | pass two: one candidate, read and filtered and quoted |
| `obsidian.js` — `filterForbiddenSegments()` | the passages this session may read, as a list, shared with the render pipeline |
| `obsidian.js` — `readCorpusFile()` | what the index records about a file, out of one read |
| `obsidian-page.js` — `onSearchInput()` and below | the debounce, the generation counter, the list and the keys |
| `obsidian.js` — `safeLearnJumpToHeading()` | the jump, after the reveal and in the same task |

`npm test` holds the code to all of it: `test/checks/search.js` drives the two passes against the fixtures under `md/` — including the staleness cases and the seam a removed block leaves behind — and `test/checks/search-keyboard.js` walks a result list on the keys and counts the requests over the whole walk to keep navigation from asking anything.

The rules themselves, as requirements with their scenarios, are in `openspec/specs/corpus-search/spec.md` and `openspec/specs/corpus-search-keyboard/spec.md`.
