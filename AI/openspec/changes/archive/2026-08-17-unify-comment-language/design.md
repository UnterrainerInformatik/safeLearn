## Context

See proposal.md — Why. Two things shape this change: what the German comments are attached to, and why no check will be added to keep them from coming back.

**How the eight were found.** Three passes, because each on its own misses most of them. A search for German diacritics across every `.js`, `.css`, `.html`, `.json`, `.yml` and `.cjs` file outside `node_modules` returns exactly one hit — `obsidian.js:818`. Reading every comment line in the five source files at the repository root returns the rest. A third pass over `obsidian-page.js`, `utils.js`, `middlewares/`, `test/` and `css/` found nothing, so the divergence is confined to `app.js` and `obsidian.js`. That the diacritic search finds one of eight is the whole argument of Decision 2.

**What the comments are attached to.** `preprocessSideBySide` (`obsidian.js:813-834`) rewrites `##side-by-side-start` / `##separator` / `##side-by-side-end` into nested `div`s; its two German comments label a regex and a `map`, and say roughly what the code beside them already says. `postprocessFragments` (`:842-901`) is the substantial one: it parses the rendered HTML with JSDOM and walks it, and its three German comments are the only commentary on a recursive traversal with two pieces of hidden state — `fragmentIndex`, reset at every `H2` or `H3`, and `started`, which flips when a marker comment is met and decides whether subsequent nodes are wrapped at all. `// Text-Node` and `// Element-Node` label two branches of the walk without saying why the branches differ (a text node is replaced by a `span`; an element keeps its identity and is recursed into). That asymmetry is worth a sentence and does not have one in either language.

`app.js:169` is a section banner — `// --- SSE Hot Reload ---` followed by `// Node.js Beispiel` — where the second line adds nothing at all.

**Where the convention can live.** `AI/architecture.md` is the natural home for anything describing the code, and it is tracked — 99 files under `AI/` are, including the whole OpenSpec tree. (The archive guidance in `AI/openspec/config.yaml` still says `AI/` is not tracked and is wrong about that; correcting it is not this change's business, but nothing here may rest on it.) What disqualifies `AI/architecture.md` is not reachability but genre: it is an analysis of what the code does, section 9 of which is a list of things found rather than rules to follow, and a convention placed there is an observation about the repository instead of an instruction to a contributor. `docs-building.md` is what a person reads before they touch the source: short thematic sections, already carrying "The Node Line" and "Sessions Live In The Container", already linked from `README.md` — the same set a fork clones and the same set every other rule in this project lives in.

## Goals / Non-Goals

**Goals:**

- The five source files at the repository root read as one language.
- Where a German comment was the only commentary on non-obvious code, the English one says more than the German one did.
- A contributor to a fork can find out, from a tracked file, what language to write in.

**Non-Goals:**

- Translating the corpus in `md/`. It is teaching material, and its language is the language of the class.
- Translating `AI/proposals/` or the archived source proposals. Those are the author's own words, kept verbatim by an existing decision.
- Rewriting comments that are already English but poor. That is a real backlog and a different change; touching it here would bury eight lines in a hundred.
- Enforcing anything mechanically. See Decision 2.

## Decisions

### Decision 1: Rewrite rather than translate, and only inside the two functions

`// Fragmentmarker` becomes a sentence about what the marker is and what meeting it does to the walk, not "fragment marker". `// Text-Node` and `// Element-Node` are replaced by one comment above the pair explaining why the two branches differ. `// Node.js Beispiel` is deleted outright — the banner above it already says what the section is, and the line was never about anything.

The bound is the two functions and the one banner. A comment elsewhere that could be better is out of scope, so that the diff is eight lines a reviewer can check against the table in the proposal.

### Decision 2: No automatic check

Three detectors were considered and all three were rejected:

- **Diacritics** (`[äöüßÄÖÜ]` in source files). Catches one of the eight. A check that catches one in eight and passes on the rest is worse than none, because a green run reads as "no German here".
- **A German function-word list** (`der`, `die`, `und`, `für`, `nicht`, `bei`, `jede`, …). Catches six of the eight, misses `// Node.js Beispiel` and `// Fragmentmarker`, and reports English as German the first time someone writes `// die() is called here` or names a variable `bei`. It also needs a comment parser to avoid matching string literals, which is a real parser or a fragile regex.
- **A language classifier as a dependency.** A dependency, a model, and a probability threshold, to police eight lines in a repository whose entire toolchain today is `node --test` and Puppeteer.

The honest mechanism is that the rule is written down and the source is read. This change makes the first half true.

*What this accepts.* The drift can recur, and nothing will report it. It recurred once in the life of this project, in two functions, and was found by reading. The `AI/architecture.md` Observations list is where that reading gets recorded, and it is doing its job — this change exists because it did.

### Decision 3: The convention states what is exempt, not only what is required

A rule that says "everything is English" is contradicted by `md/` on its first line and is then worth nothing. The section names the three exemptions — the corpus, hand-written proposals under `AI/`, and conversation — so that a contributor meeting German in this repository knows whether they have found an exception or a mistake.

## Risks / Trade-offs

- **Rewriting rather than translating means the new comments are claims about the code.** A comment saying what `walk()` does can be wrong in a way `// Text-Node` could not. The tasks require reading the function before writing about it, and the fragment behavior is covered by `test/checks/rendering.js`, so a misunderstanding that also changes the code would fail a run — but a merely inaccurate comment would not. Accepted; it is the price of a comment that says something.
- **`docs-building.md` gains a section only tangentially about building.** It is the least wrong of the tracked files, and a `CONTRIBUTING.md` for one rule is a file nobody opens.
