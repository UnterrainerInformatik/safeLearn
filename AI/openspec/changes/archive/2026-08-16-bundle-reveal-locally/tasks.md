## 1. Serve the installed package

- [x] 1.1 Add two `express.static` mounts to the allowlist in `app.js`, beside the mermaid ones (`app.js:384-393`) and behind `checkAuthenticated`: `/node_modules/reveal.js/dist` → `node_modules/reveal.js/dist`, and `/node_modules/reveal.js/plugin/notes` → `node_modules/reveal.js/plugin/notes`.
- [x] 1.2 Comment the mounts in the voice of the surrounding block: why the directory rather than the file (the theme pulls `fonts/` in by relative `@import`; the speaker view opens `speaker-view.html`), and why two scoped mounts rather than one over `/node_modules`.
- [x] 1.3 Add the new assets to the positive list in `test/checks/deployment-surface.js` (`:56`): `/node_modules/reveal.js/dist/reveal.js`, `/dist/reveal.css`, `/dist/reset.css`, `/dist/theme/fonts/league-gothic/league-gothic.css` and `/plugin/notes/notes.js`, each with the type it must come back as.
- [x] 1.4 Confirm the negative half still holds: a path inside `node_modules/reveal.js` outside the two mounts — `package.json`, `js/reveal.js`, `plugin/markdown/markdown.js` — is not served.

## 2. Lato, locally

- [x] 2.1 Add Lato Light (300) and Bold (700) as TrueType files to `assets/main-fonts/`, named so the weight is readable from the filename and so the existing font scanner's family derivation is not disturbed — check how `scanFiles` derives a family name from a filename before choosing the names (`obsidian.js:457`, `:670`).
- [x] 2.2 Place the Open Font License text beside them.
- [x] 2.3 Verify the two files are the weights they claim: read each one's name table and confirm 300 and 700, rather than trusting the filename.
- [x] 2.4 Check the font picker after adding them: `mainFontsArray` is built from this directory, so the settings menu will list the new files. Decide whether they belong in the picker or whether the scanner should pass over weight variants, and implement whichever the code already implies.

## 3. The theme derivation

- [x] 3.1 Create the derived theme under `css/` from `node_modules/reveal.js/dist/theme/moon.css` (5.2.1).
- [x] 3.2 Replace the `@import` of `fonts.googleapis.com` (`:6`) with an `@font-face` block declaring `Lato` at 300, 400 and 700 over the files in `assets/main-fonts/`.
- [x] 3.3 Re-point the League Gothic `@import` (`:5`) from `./fonts/league-gothic/league-gothic.css` to its served address under `/node_modules/reveal.js/dist/theme/fonts/`, and confirm the font files it references in turn resolve through the mount from that new base.
- [x] 3.4 Give the file a header naming the upstream file, the version it was derived from, why it is not used unchanged, and what to do on a Reveal upgrade.
- [x] 3.5 Search the file for any further absolute or third-party address beyond the two `@import`s, so the derivation does not carry one through unnoticed.

## 4. The presentation wrapper

- [x] 4.1 In `wrapInReveal` (`obsidian.js:1917`), replace the head's CDN stylesheets and the Google Fonts `<link>` with `/node_modules/reveal.js/dist/reset.css`, `/node_modules/reveal.js/dist/reveal.css` and the derived theme from `css/`. Keep `/css/reveal.css` after them — it overrides the theme and must stay last.
- [x] 4.2 Delete the inline script that appends `css/print/pdf.css` or `css/print/paper.css` on `?print-pdf` (`obsidian.js:1946-1952`). Reveal 5 carries print handling inside `reveal.css`.
- [x] 4.3 In the tail, replace the two CDN `<script>` tags with `/node_modules/reveal.js/dist/reveal.js` and `/node_modules/reveal.js/plugin/notes/notes.js`. `headjs` goes without replacement.
- [x] 4.4 Rewrite the `Reveal.initialize` call per design Decision 4: `dependencies` → `plugins: [ RevealNotes ]`; drop `hideAddressBar`, the `markdown` block and `autoSlideMethod`; remove the commented-out multiplex, parallax and plugin blocks; carry every remaining option over unchanged. Leave the `Reveal.configure({ pdfMaxPagesPerSlide: 1 })` call after it.
- [x] 4.5 Update the comment above the call — it points at `#configuration` and `#dependencies` in the Reveal 3 README; the current addresses are `revealjs.com/config/` and `revealjs.com/plugins/`.
- [x] 4.6 Grep the whole working tree for `jsdelivr`, `googleapis` and `headjs` and confirm no reference is left outside `AI/` and the archived changes.

## 5. Host observation in the harness

- [x] 5.1 Add a function to `test/harness.js` that records which hosts a page contacted while loading, from Puppeteer's request events rather than from the DOM, and returns each host with the address that caused the request. Leave `sameOriginReferences` (`:731`) untouched.
- [x] 5.2 Have it distinguish the application under test and the configured identity provider from any other host, so a check does not hardcode host names.
- [x] 5.3 Make sure a request that failed or was refused is still recorded — a check must be able to fail on a third-party host without that host being reachable.
- [x] 5.4 Verify the recorder catches a request issued from inside a stylesheet, not only one written as an element attribute. Prove it against a case that behaves like the defect this change removes rather than assuming it.
- [x] 5.5 Document the function in `docs-testing.md` under "What the harness gives you", alongside the four things listed there today.

## 6. The presentation check

- [x] 6.1 Add the scenario from the `content-verification` delta to `test/checks/presentation.js`: the presentation view contacts no host but the application and its identity provider, and the failure names the host and the causing address.
- [x] 6.2 Keep the existing same-origin reference check as it stands; the new assertion sits beside it, not in place of it.
- [x] 6.3 Leave `knownDangling` (`:45`) empty — this change introduces no dangling reference and repairs none.
- [x] 6.4 Update `test/coverage-map.json` so the files this change touches name the checks that guard them, and confirm `test/coverage.test.js` passes.

## 7. Documentation

- [x] 7.1 `AI/architecture.md`: the `reveal.js` row in the dependency table (`:53`) no longer reads "declared but not referenced"; the stylesheet count and the `css/reveal.css` note (`:152`) account for the derived theme; the PDF row (`:133`) drops the `pdf.css` swap; the Puppeteer paragraph (`:74`) no longer names the Reveal CDN among the addresses that are asserted but not fetched.
- [x] 7.2 `AI/architecture.md` Observations: strike the Reveal.js divergence (`:310`) and the Google Fonts entry (`:314`) the way the entries settled by earlier changes were struck, naming this change.
- [x] 7.3 `AI/proposals/initial-repairs.md`: strike bullet 1 and record what settled it, following the form the three settled bullets already use.
- [x] 7.4 `docs-technical-details.md`: the `?print-pdf` section (`:68-75`) still describes the behavior correctly — confirm it, and correct it only if the Reveal 5 output makes it wrong.
- [x] 7.5 Note in `docs-building.md` that a deployment no longer needs egress to `cdn.jsdelivr.net` or `fonts.googleapis.com`.

## 8. Verification

- [x] 8.1 Run `npm test` and get a green run.
- [x] 8.2 Open a deck in a browser and drive it: horizontal and vertical navigation, overview mode, the progress bar, the slide number, and a page whose source marks a fragment.
- [x] 8.3 Open the speaker view and confirm the second window renders and shows the current slide's notes.
- [x] 8.4 Load a deck with `?print-pdf` and print it, confirming one slide per page.
- [x] 8.5 Prove the offline claim rather than inferring it: load a deck with the browser's network restricted to the deployment, and confirm it renders with styling, navigation and fragments intact.
- [x] 8.6 Compare a deck against the pre-change rendering and record what changed visually, so the difference is a noted consequence rather than a later surprise.
