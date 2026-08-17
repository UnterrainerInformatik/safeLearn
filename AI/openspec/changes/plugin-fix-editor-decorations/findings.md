# What was confirmed before the repair was written

Section 1 of `tasks.md` asks for three things to be established rather than
assumed. This is what they turned out to be. Two of them change how section 3 is
written, so they are recorded here rather than left in a terminal.

## 1.1 `Decoration.set(ranges, true)` sorts by position *and* start side

Confirmed against `@codemirror/view` 6.37.0 with `@codemirror/state` 6.5.2, the
versions in the plugin checkout. A set mixing a line decoration and a mark
decoration at the same position, handed over deliberately unsorted:

| What | Result |
| --- | --- |
| `Decoration.set(ranges, true)` | accepted, ordered `0..0 line`, `0..10 mark`, `15..15 line`, `20..30 mark` |
| `Decoration.set(ranges)` | throws `Ranges must be added sorted by 'from' position and 'startSide'` |
| sort by `from` alone, then `RangeSetBuilder` — what the plugin does today | throws the same |

`startSide` is `-200000000` for a line decoration and `500000000` for a mark, so
at one position the line marking must come first. Sorting by `from` alone cannot
know that. Decision 3 holds; the explicit-rank fallback is not needed.

One caveat, named rather than glossed: rollup marks `@codemirror/view` and
`@codemirror/state` external, so what runs inside Obsidian is Obsidian's own
copy, not the checkout's. That copy is a 6.x with the same contract — it raises
the identical message under 1.2 below. The runtime confirmation of the
*sorting* half is the constructed-collision check of section 3 going green in
section 5; until then this is established for 6.37.0 only.

## 1.2 What the ordering defect does today: nothing, on the corpus

`npm run test:obsidian` passes, nine checks. Opening `test-md-file.md` — which
carries permission blocks *and* fragments — editing it and scrolling it raised
**nothing at all**: no page error, no console error, and 36 markers were placed.

So the defect is milder than the design assumed, and for a reason worth writing
down: the builder only rejects a set when a line marking and a mark meet at one
position, and that needs a `##fragment` at the *start* of a line *inside* a
block. No corpus file does that. The corpus puts fragments outside blocks and
puts nothing but text inside them.

Constructed to order, it throws exactly as Decision 3 predicts:

```
@@@ teacher
##fragment
Gated text.
@@@
```

> `console.error :: Error: Ranges must be added sorted by 'from' position and 'startSide'`

and `markers()` returns `[]` — the whole set lost, on a document where two
markings were due. This is the baseline the error-collecting check asserts
against, and it settles a design question the design left open: the error
arrives on **`console.error`**, not as a page error. Obsidian catches what the
view plugin throws and logs it. A collector subscribing only to `pageerror`
would see a clean run.

**What this changes:** the "a line-level and a character-level marking meet at
one position" scenario cannot be checked against the corpus. It joins the
file-level directive as a case needing a constructed document (2.3), and it is
the second reason that harness addition exists.

A second constructed document was read at the same time, for the file-level
directive:

```
@@@ teacher      <- line 1, gates the file, never closed
                 <- blank
@@@ 4bhif        <- a real block opens
Gated.
@@@              <- and closes
...
```

Today the plugin marks **five** lines as `permission-block` — lines 1 through 5,
because line 1 opened the block and line 5 closed the one line 1 opened. The
block that a person actually wrote is lines 3 to 5. So the observable of
Decision 6 is not "nothing is marked" but "the marking starts two lines too
early", which is what the rewritten check asserts.

## 1.3 The renderer's recognition rules, re-read at implementation time

Read from `obsidian.js` and `app.js` today. No divergence from what Decision 2
recorded at planning time.

| Form | Where | The rule |
| --- | --- | --- |
| `##fragment` | `preprocessFragments`, `obsidian.js:911` | `/##fragment(?=\s|$)/g` — case-sensitive, anywhere in the line, every occurrence, valid wherever whitespace or the end of the text follows |
| `##side-by-side-start` … `##side-by-side-end` | `preprocessSideBySide`, `obsidian.js:885` | `new RegExp("##side-by-side-start[\\s\\S]*?##side-by-side-end", "g")` — one non-greedy block, plain substrings, case-sensitive, not line-anchored |
| `##separator` | `preprocessSideBySide`, `obsidian.js:899` | plain `split` **inside** such a block only; one standing outside is deliberately left alone |
| `@@@ roles` … `@@@` | `inlinePermissionRegex`, `obsidian.js:56` | `/^[ \t]*@@@(.*?)\n([\s\S]*?)@@@/gms` — line-anchored at the opening, leading tabs and spaces allowed; the closing `@@@` is not anchored |
| first line `@@@ roles` | `app.js:106-122` with `parseFirstLineForPermissions`, `obsidian.js:249` | `/^\s*@@@\s*(.*)/` on `d.split("\n")[0]`, matched and the line stripped **before** `preParse` runs, so the block form never sees it |

## 3.5 The run at the end of section 3

**25 checks: 14 green, 11 red.** This is the count section 5 compares against; a
check that vanished rather than turning green is not a pass.

Red, each for the repair it was written for:

| Check | Waiting on |
| --- | --- |
| every fragment marking covers the tag and not what follows it | 4.1, 4.2 — seven corpus markings are 11 characters where the tag is 10 |
| typing at the end of a tag's line leaves the marking on the tag | 4.2 |
| inserting a line above a tag moves the marking with it | 4.2 |
| the cursor entering a tag changes no text and leaves the tag marked | 4.2 (the cursor half of it is green already — see below) |
| a file-level directive on line 1 does not swallow the block below it | 4.6 — the marking starts on line 1 instead of line 3 |
| an unterminated block leaves the tags after it marked | 4.7 — the block is dropped entirely |
| a closing marker with nothing open does not turn what follows into a block | 4.7 — and it collides, so the document loses every marking |
| a line marking and a tag marking at one position are both applied | 4.3 — `Ranges must be added sorted by 'from' position and 'startSide'` |
| a line carrying two fragments has both marked | 4.1 — only the first is found |
| a fragment the server acts on is marked, one it ignores is not | 4.1, 4.2 |
| typing in the editor leaves a rendered view beside it alone | 4.8 — a tag planted in a rendered view is stripped out of it by a keystroke in another document's editor |

Green before the repair as well, and stated here so that section 5 does not read
them as passes it earned:

- **a tag scrolled to for the first time is marked** and **the same document
  examined twice reports the same markings** — the plugin decorates the whole
  document today, so a scroll finds markings that were already there. Both stop
  being free the moment decorations are emitted per viewport (4.5), which is
  exactly what they are there to catch.
- **no corpus document raises an error** — established under 1.2; the corpus
  cannot produce the collision.
- **the cursor entering a tag** — the cursor half is green because nothing is
  ever hidden in the editor today, and the check is red only on the extent. The
  selection-change rebuild (4.4) has no observable of its own while the editor
  marks rather than hides; it is verified by reverting it in 5.2.
- **the rendered view does not show the tag text** — the recording of 3.4.
- **a tag ending its line is covered exactly** — the editor clips a mark
  decoration at the end of the line it starts on, so the over-wide range is not
  visible in the rendered result. The check states the property; the extent
  defect is caught by the corpus check above.

## 5.1 The run at the end of section 4

**26 checks, all green.** One more than section 3 recorded: task 4.5 asks in its
own words for the block-above-the-viewport case to be verified, and that is a
check rather than a look — *a block that opens above the viewport still marks
what is on screen*. It was added while 4.5 was implemented and is the only
addition; the other 25 are the ones section 3 wrote, none removed.

One thing worth recording from this run: **the reading view still hides its tags
after the editor stopped rewriting it**. The design named the opposite as a risk
— that the editor's call had been masking a post-processor which never worked
alone — and the check written for 3.4 says it had not. Nothing is left over for
`plugin-render-hide-tags` on that point.

## 5.2 Each repair put back, one at a time

| Reverted | What went red |
| --- | --- |
| 4.1 the rule is not the renderer's | a fragment the server acts on is marked, one it ignores is not |
| 4.2 the extent is a computed length | every fragment marking covers the tag …, and five more |
| 4.3 the plugin sorts, not the library | **nothing** — see below |
| 4.4 rebuild on a text change only | a tag scrolled to for the first time is marked, a block that opens above the viewport …, and two reads that scroll first |
| 4.5 block state from the visible range only | a block that opens above the viewport still marks what is on screen |
| 4.6 line 1 is read as a block opening | a file-level directive on line 1 does not swallow the block below it |
| 4.7 a bare closing marker opens a block | a closing marker with nothing open does not turn what follows into a block |
| 4.7 an unterminated block is dropped | an unterminated block leaves the tags after it marked |
| 4.8 the editor rewrites rendered output | typing in the editor leaves a rendered view beside it alone |

**4.3 on its own changes nothing observable, and that is a result rather than a
gap.** Putting `RangeSetBuilder` and a sort by `from` back leaves all 26 green,
because 4.5 changed *how the set is assembled*: it is now built line by line, so
a line marking is pushed before the tag marking on the same line and an array
sorted by position alone is already in the order the builder demands. Reverting
the assembly order as well — block markings collected at the end, the way the old
scan produced them — turns three checks red, among them *a line marking and a tag
marking at one position are both applied*. So the check does notice; what it
notices is the set being assembled in an order the plugin's own sort cannot
repair, and after 4.5 the plugin no longer produces such an order by itself.
Decision 3 is kept for what it was chosen for: it is the form that cannot be
violated by a later change to the assembly order, and that order is now the only
thing standing between this defect and its return.

**4.9 has no check, deliberately.** It changes a line the plugin logs when it
loads, from German to English. No requirement in either capability is about it,
and a check asserting a log string would pin the wording of a message rather than
any behavior. It is recorded here instead.

## 5.4 Two runs from a removed runtime directory

Both green, 26 of 26 — but the first attempt was not, and the failure is the one
the previous change left unexplained. It is explained now.

*inserting a line above a tag moves the marking with it* failed on the first run
after `test/.runtime/obsidian` was removed, and passed on the second. The
screenshot the wrapper left showed why: on a first run Obsidian brings up its
community-plugins settings by itself, and the modal has the keyboard. The
keystrokes went into a search field, the document never changed, and the check
compared markings that nothing had moved.

Two harness repairs, both in this repository:

- `start()` now puts away anything modal before handing the page over.
- `type()` reads the document before and after and refuses to return quietly if
  nothing changed. This is what turns the failure from intermittent into
  immediate — and it is worth noting that the *other* typing check passed
  throughout, because "the markings did not change" is exactly what it asserts.
  A check can be satisfied by its input never arriving.
