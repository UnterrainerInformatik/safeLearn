## Why

Three things from the first real sittings (Gerald, 2026-10-19):

1. The view for the class on the board (`/exam/sittings/<id>/screen`) shows how many are writing, have submitted and have not started. Its clock and time left run, but those counts stay at what they were when the page was opened. The teacher's own live view updates as it should.
2. After a sitting is over, the teacher still wants to see how long each student was away from the test page. That information is in the live view, but neither the online tests' list nor the test's page links the live view of a sitting that is over. So the list cannot be found after the test.
3. In the question pool's category tree, each category's tools (📝 new question, `+` subcategory, ✎ rename, 🗑 delete) stand to the right of its name. With deep nesting or long names the row gets wider than the tree's panel, and the tools end up outside it where nobody can see them.

## What Changes

- **The class screen keeps its counts current.** A student who starts or submits is counted on the board within a few seconds, without a reload, however long the page has been open. The screen gets its updates by fetching a snapshot every few seconds instead of holding an event stream of its own (design D1). It shows no name and nothing to click, as before.
- **The live view stays reachable after the sitting is over.** The online tests' list and the test's page link the live view of every sitting, including one that is over. An ended sitting's live view shows each participant's final status, their focus (share, how often and how long they left), and the refused browsers. The link to the class screen is still offered only until the sitting is over.
- **Time away is given in minutes once it reaches a minute.** "left 3×, 4 min 12 s" instead of "left 3×, 252 s". Below a minute it stays in seconds.
- **One menu button per category, at the start of the row.** The four tools of a category are replaced by a single `⋯` button between the fold and the name. It opens a small menu with New question, New subcategory, Rename and, only for an empty category, Delete, confirmed by the module's usual second click. Because the button comes before the name, a long name can no longer push it out of view. Double-click to rename, the keyboard shortcuts and drag and drop stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `online-test`: the course's list links the live view of a sitting that is over too; the live view of an ended sitting stays available with each participant's focus record; time away is shown in minutes from one minute on; new requirement that the class screen keeps its counts current without a reload.
- `question-editor`: a category's tools are offered from one menu button at the start of its row instead of separate icons after its name.

## Impact

- `exam/client/live.js`: the screen view polls snapshots instead of opening the stream; the time-away text gets minutes.
- `exam/client/tests.js`: `sittingLinks` splits into the live-view link (every state) and the class-screen link (not over).
- `exam/client/pool-tree.js`, `css/exam.css`: the row menu, its keyboard and focus handling; the old `.sl-exam-tree-tools` icons go.
- `i18n/de.json`, `i18n/en.json`: new texts for the menu, its button and the minute format.
- `test/exam.test.js`: the screen's counts after a start and a submit; the live link on an ended sitting; the tree menu, also with a long name in a deep path. Existing tree tests that click `.sl-exam-tree-add`/`-rename`/`-delete` move to the menu.
- No server, API or database change.
