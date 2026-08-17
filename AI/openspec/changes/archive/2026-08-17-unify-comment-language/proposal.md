## Why

Source: `AI/architecture.md` section 9, Code-level observations — the mixed comment languages bullet. No file in `AI/proposals/` corresponds to this change.

Eight comments in this repository are German; everything else — identifiers, comments, all ten documentation files, the corpus's own explanatory prose — is English:

| Location | Comment |
| --- | --- |
| `app.js:169` | `// Node.js Beispiel` |
| `obsidian.js:818` | `// Regex für kompletten Block` |
| `obsidian.js:829` | `// Jede Spalte in divs packen` |
| `obsidian.js:862` | `// Reset bei h2 oder h3` |
| `obsidian.js:867` | `// Fragmentmarker` |
| `obsidian.js:880` | `// Text-Node` |
| `obsidian.js:890` | `// Element-Node` |
| `obsidian.js:894` | `// Rekursiv in Tiefe gehen` |

They sit in two places: the SSE section banner in `app.js`, and `preprocessSideBySide` / `postprocessFragments` in `obsidian.js`.

This is small, and it is worth doing for a reason that is not tidiness. SafeLearn is written to be forked — `README.md` says so, `docs-building.md` walks a stranger through it, and the whole point of the project is that another school can run its own instance. A fork's first encounter with `postprocessFragments` is the function that decides what becomes a Reveal fragment, and it explains itself in a language the reader may not have. The last three of the eight are the ones that matter: they are the only commentary on a recursive DOM walk that removes marker comments and wraps text nodes in spans.

The convention itself is unwritten. Nothing in the repository states that the source is English, so the drift has no rule to have violated and nothing stops it happening again. That is the larger half of this change.

## What Changes

- **The eight comments become English.** Not translated word for word: `// Text-Node` and `// Element-Node` say almost nothing in either language, and the three inside `walk()` are the place to say what the recursion is actually doing — that a fragment index runs per heading section, that a marker comment opens a section, and that from there on every text node and every element becomes a fragment at the current index.
- **The convention is written down where a contributor meets it.** One short section in `docs-building.md`, beside the existing short sections on the Node line and the session store: source, identifiers, comments and documentation are English; issues and conversation are whatever the participants speak.
- **No automatic check is added.** Explained in design.md — every cheap detector for this either catches one of the eight or reports English as German, and a check that catches an eighth reads like a guarantee.
- Not touched: the corpus in `md/`, which is teaching material in the language it is taught in and is not source; the German prose in `AI/proposals/` and the archived source proposals, which are the author's own words and are kept verbatim by decision; the German in this repository's git history.

## Capabilities

### New Capabilities

- `source-conventions`: the language this repository is written in, which parts of it the rule covers, and which parts are deliberately exempt. Small, and stated so that the next divergence has something to be a divergence from.

### Modified Capabilities

None.

## Impact

- `app.js` — one comment (`:169`).
- `obsidian.js` — seven comments, in `preprocessSideBySide` (`:813-834`) and `postprocessFragments` (`:842-901`).
- `docs-building.md` — one new section.
- `AI/architecture.md` — one Observation in section 9 resolves.
- No code changes. No test changes: nothing a run can observe is different, and this change deliberately does not invent a check that pretends otherwise.
- No dependency, configuration or deployment impact.
