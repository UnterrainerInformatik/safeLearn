## Context

See `proposal.md` — Why. What shapes the approach here is the shape of the two halves that have to meet.

**What the wrapper emits today.** `wrapInReveal` (`obsidian.js:1917-2124`) is a template literal in two parts. Its head carries a Google Fonts `<link>`, `reveal.css` and `theme/moon.css` from `cdn.jsdelivr.net/npm/reveal.js@3.7.0`, the project's own `/css/reveal.css`, the favicon, `getFontImports()`, `getMermaidScriptEntry()` and `getAutoReloadScript()`, and a script that appends `css/print/pdf.css` or `css/print/paper.css` depending on `?print-pdf`. Its tail loads `headjs@1.0.3` and `reveal.min.js` from the same CDN, then calls `Reveal.initialize` with roughly forty options, a `dependencies` array whose only live entry is the notes plugin, and a `markdown` block for a plugin that is never loaded.

**What the package offers.** `node_modules/reveal.js` at 5.2.1 ships `dist/reveal.js` (UMD, exposing a global `Reveal`), `dist/reveal.css`, `dist/reset.css`, `dist/theme/*.css` with `dist/theme/fonts/` beside them, and `plugin/notes/` containing `notes.js` (global `RevealNotes`) and `speaker-view.html`. The package's own `index.html` shows the intended usage: stylesheets by `<link>`, engine and plugins by `<script>`, then `Reveal.initialize({ plugins: [RevealNotes] })`.

**Three constraints from the existing code.**

1. `app.js` serves an allowlist of mounts, not the application directory (`app.js:340-393`), and `test/checks/deployment-surface.js` asserts both directions. Anything newly referenced needs its own mount or it falls through to the catch-all redirect and silently answers with the start page.
2. `dist/theme/moon.css:6` imports Lato from `fonts.googleapis.com`, and `dist/theme/moon.css:5` imports `./fonts/league-gothic/league-gothic.css` relative to itself. The first must go; the second must keep resolving.
3. `test/harness.js:731` (`sameOriginReferences`) collects `[href]`/`[src]` attributes and discards anything cross-origin (`:745`). It cannot see a request a stylesheet issues, which is exactly the class the Google import belongs to. Verifying this change with the tool that exists would produce a green run over an unrepaired defect.

## Goals / Non-Goals

**Goals:**

- The presentation view renders with no request leaving the deployment.
- The engine version is determined by `package.json` alone — no version string anywhere in application source.
- The verification can observe the difference, so a regression to a CDN is caught rather than argued about.
- Deck behavior a teacher operates (navigation, fragments, notes, PDF export) is preserved across the major-version jump.

**Non-Goals:**

- Pixel-identical rendering against Reveal 3.7.0. The point of the change is to run a different engine; the visual result follows from it.
- A build step. The project has none, and this change does not introduce one — files are served from `node_modules` and `css/` as they are on disk.
- Reworking `css/reveal.css`, the deck's own layout rules. It is touched only where it names a font family that has to resolve locally.
- The other bullets of `AI/proposals/initial-repairs.md`.

## Decisions

### 1. Mount the package's directories, do not copy its files into the repo

`/node_modules/reveal.js/dist` and `/node_modules/reveal.js/plugin/notes` become `express.static` mounts behind `checkAuthenticated`, exactly as the two mermaid mounts already are (`app.js:384-393`). The alternative — copying `reveal.js` and `reveal.css` into `assets/` or `css/` — was rejected because it decouples the served files from `package.json` and reintroduces, in a slower form, the very drift this change exists to remove: an upgrade would bump the manifest and leave the copies behind.

Mounting the directories rather than the individual files follows the reasoning already written at the mermaid mounts: a bundle may fetch further files of its own at runtime. `plugin/notes` must be a directory mount in any case, because the speaker view opens `speaker-view.html` from it — serving `notes.js` alone yields a notes plugin whose window comes up blank.

The mounts are directory-scoped rather than `/node_modules`-wide, so installing a further dependency does not publish it. That is the standing rule in `deployment-surface`'s spec, and the reason the mermaid mounts are two entries instead of one.

### 2. Hold the theme as a project-owned derivation, not as the package's file

`moon.css` cannot be served as it stands: its Google Fonts `@import` would defeat the change. Four options were weighed.

- **Serve it unchanged** — rejected; leaves the third-party request, which is the point of the change.
- **Rewrite it at request time** in a handler that strips the `@import` — rejected; a served file that does not match the file on disk is a debugging trap, and the mechanism would be invisible to anyone reading either.
- **Drop the package theme** and set the `--r-*` variables directly in `css/reveal.css` — rejected; the moon appearance would have to be reconstructed by hand and would drift from any upstream fix.
- **Chosen: a derivation under `css/`**, taken from `dist/theme/moon.css`, with the Lato `@import` replaced by a local `@font-face` block and the League Gothic `@import` re-pointed at its served address under `/node_modules/reveal.js/dist/theme/fonts/`.

The derivation carries a header naming the upstream file and version it came from and why it exists, so a Reveal upgrade is told to revisit it. This is the cost the user accepted when choosing full offline operation: one file that has to be re-derived on a theme change. It is bounded — the file is a leaf, nothing imports it but the wrapper.

### 3. Ship the Lato weights the deck actually uses

`assets/main-fonts/Lato.ttf` exists but is Regular only — its name table reads `Lato / Regular`, weight 400. The deck asks for more: `css/reveal.css:18` sets `font-weight: 300`, headings and `<strong>` reach for 700, and the original CDN link requested `Lato:300,700`. Served with Regular alone, every one of those weights is synthesized by the browser, and the deck comes out visibly coarser than before — the change would be paid for in typography.

So the derivation's `@font-face` block declares Lato at 300, 400 and 700, and the two missing files are added to `assets/main-fonts/` under their weight-qualified names. Lato is Open Font License, so redistribution in the repository is permitted; the license text is placed beside the files.

The `getFontImports()` mechanism is deliberately not reused for this. It registers families as `"main Lato"` and `"nav Lato"` for the font *picker* — a different naming scheme for a different purpose, and the theme needs the family called `Lato`. The two registrations coexist without conflict.

If the weight files are judged not worth carrying, the fallback is Regular alone with synthesis — a one-line change to the `@font-face` block, decided in review rather than discovered later.

### 4. Migrate the configuration by intent, drop what the engine no longer reads

The `Reveal.initialize` call is rewritten rather than patched:

- `dependencies: [{ src: '…/notes.js', async: true }]` → `plugins: [ RevealNotes ]`, with `plugin/notes/notes.js` loaded by `<script>` before initialization. Reveal 5 still *accepts* a `dependencies` key (`js/config.js:328`) but no longer loads from it — left in place it would be a silent no-op that reads like working code.
- `headjs` is removed. It existed only to drive that loader.
- `hideAddressBar` is dropped: it is gone from Reveal 5's config, so it is now an unread key.
- The `markdown: { smartypants: true }` block is dropped. The markdown plugin is not loaded — SafeLearn renders Markdown server-side through `marked` — so the option has never had a reader.
- `autoSlideMethod: Reveal.navigateNext` is dropped rather than translated. `autoSlide` is `0`, so the method is never called; and the expression reads `Reveal.navigateNext` off the global at object-literal time, before initialization, which is not the instance method it appears to be.
- The commented-out blocks (multiplex, parallax, the markdown and highlight plugin entries) are removed with them. They document a 3.7.0 configuration that no longer applies.
- Everything with a live reader is carried over unchanged: `controls`, `width`/`height` at 90%, `margin`, `minScale`/`maxScale`, `progress`, `defaultTiming`, `slideNumber`, `history`, `keyboard`, `overview`, `center`, `touch`, `loop`, `rtl`, `shuffle`, `fragments`, `embedded`, `help`, `showNotes`, `autoPlayMedia`, `autoSlide`, `autoSlideStoppable`, `mouseWheel`, `previewLinks`, `transition: 'convex'`, `transitionSpeed`, `backgroundTransition`, `viewDistance`, `display`, and the `pdfMaxPagesPerSlide` in the `Reveal.configure` call after it.

### 5. Delete the print-stylesheet injector

Reveal 3.7.0 needed `css/print/pdf.css` or `css/print/paper.css` swapped in at runtime; 5.2.1 has no such files in `dist/` and carries print handling inside `reveal.css`. The inline script that built that `<link>` is removed. PDF export continues to work the way it is documented — `?print-pdf` plus `pdfMaxPagesPerSlide` — which is why the specs keep it as a scenario rather than treating it as an implementation detail.

`dist/reset.css` is added to the head alongside `reveal.css`, matching the package's own `index.html`. Reveal 3.7.0's `reveal.css` bundled its reset; 5.2.1's does not.

### 6. Observe hosts on the network, not in the DOM

The harness gains a function that records the hosts a page contacted while loading, using Puppeteer's request events rather than a DOM scan. `sameOriginReferences` stays as it is — it answers a different question (does what the page names resolve, and as the right type) and the existing checks depend on it.

A DOM scan was rejected outright: it is what would have missed `moon.css`'s `@import`, and this change is precisely the case that proves the method insufficient. Two hosts are legitimate — the application under test and the Keycloak instance the session authenticates against — so the reported set distinguishes them rather than the check hardcoding an allowlist of names.

The presentation check then fails on any other host, naming both the host and the address that caused the request, so a failure points at the reference rather than at the fact of one.

## Risks / Trade-offs

- **The deck looks different after the upgrade.** Two majors of layout, scaling and transition work sit between the versions → Accepted and stated in the proposal, since running a current engine is the goal. The verification asserts structure and self-containment, not appearance; the visual check is a human opening a deck, which the tasks call for explicitly.

- **The theme derivation goes stale against an upstream fix.** A Reveal upgrade changes `dist/theme/moon.css` and the copy under `css/` does not follow → The derivation's header names its upstream version, and the specs require exactly that record, so an upgrade has a written instruction to re-derive. It is a leaf file with one consumer, so the re-derivation is mechanical.

- **`node_modules` becomes part of the served surface at a second place.** Every mount widens what a deployment publishes → The mounts are the two package subdirectories the wrapper addresses, not `/node_modules`, and `deployment-surface`'s spec already forbids the wider form. `test/checks/deployment-surface.js` covers both directions, so a later widening fails a run.

- **Speaker notes break quietly.** The speaker view opens in a second window; a missing `speaker-view.html` shows as an empty window, not as an error the suite would see → It is the reason `plugin/notes` is mounted as a directory, and opening the speaker view is a named manual step in the tasks.

- **The Lato weight files are new binaries in the repository.** They enlarge the tree and carry a license obligation → Lato is OFL, redistribution is permitted, the license ships beside the files, and the two files are small. The alternative is documented in Decision 3 for review.

- **The new host observation makes an existing green run red.** Any other view that quietly contacts a third party would surface once the harness can see it → That is the intended effect, but it can turn a scoped change into an open-ended one. The new assertion is applied to the presentation check only; if the page view turns out to contact a third party as well, it is recorded as a finding for its own change rather than repaired here.

## Migration Plan

No data, no schema, no configuration change. The unit of deployment is the image, and `npm install --omit=dev` in the `Dockerfile` already places `reveal.js@5.2.1` where the new mounts point.

Rollback is `git revert` of the change plus a redeploy. Nothing outside the application holds state that would have moved, and a rolled-back deployment resumes loading from the CDN as before.

## What the verification found

Recorded while implementing, so the two things that turned out differently from the plan are written down rather than rediscovered.

**The deck's appearance across the two majors** (task 8.6, `md/presentations/test-presentation.md` at 1440×900, the same four views under 3.7.0 and under 5.2.1). The theme is unchanged: the same background (`#002b36`), the same League Gothic headings in the same size and color, the same progress bar, controls and slide number, the same overview grid, and the same slide breaks. What differs:

- Body text is a little wider and a little cleaner. It is set in the real Lato Light now; before, the browser synthesized weight 300 out of Lato Regular. With the real face come its ligatures — the `ti` in "Continuous Integration" is one glyph where it used to be two.
- Everything sits one to five pixels lower or further left. Reveal 5's layout and scaling arithmetic differs from 3.7.0's; nothing reflows, nothing wraps differently.
- The slide number reads `1 . 1` rather than `1.1`. Reveal 5 puts each part in its own element with whitespace between them.
- The navigation arrows are marginally larger and sit a few pixels differently, which is Reveal 5's own control styling.

**`speaker-view.html` is not fetched at runtime** (task 8.3). Decision 1 mounts `plugin/notes` as a directory partly because "the speaker view opens `speaker-view.html`". In 5.2.1 it does not: `notes.js` carries the speaker view inside itself and writes it into a window opened on `about:blank`, and the package's `speaker-view.html` is the source that build reads. The speaker view was verified to work — a second window, the current slide in an iframe of this application, and the current slide's `aside.notes` shown there while the audience's copy stays `display: none`. The directory mount was kept as the tasks specify, for the reason the mermaid mounts give and because a later Reveal that goes back to fetching the file would find it served; the comment at the mount says what is true today.

One operational note belongs in the documentation with the change: presentations no longer require egress to `cdn.jsdelivr.net` or `fonts.googleapis.com`. A deployment whose egress policy was written around those hosts can drop them.
