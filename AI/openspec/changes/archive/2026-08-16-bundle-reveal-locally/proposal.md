## Why

The presentation view is the only part of SafeLearn that cannot run without the public internet. `wrapInReveal` in `obsidian.js` loads Reveal.js **3.7.0** — `reveal.css`, the `moon` theme, both print stylesheets, `reveal.min.js` and the notes plugin — from `cdn.jsdelivr.net`, plus `headjs@1.0.3` from the same host and the Lato webfont from `fonts.googleapis.com`. Meanwhile `package.json` declares `reveal.js ^5.0.5`, locked to 5.2.1 and installed into every image the `Dockerfile` builds, and nothing ever references it.

Three things follow. A classroom without working internet gets an unstyled, non-functioning deck although the software is sitting on disk. Every student opening a presentation announces that fact to two third-party hosts. And the version actually running is eight years and two majors behind the one the project claims to depend on, so it receives neither fixes nor the browser-compatibility work of the line the project believes it is on.

The repair is not a version bump. Reveal 5 replaced the `dependencies` plugin loader that `headjs` existed to serve, dropped the separate print stylesheets, and renamed parts of the configuration the current call still passes. And the bundled `moon` theme carries the problem forward on its own: `dist/theme/moon.css:6` imports the Lato webfont straight from Google, so serving the npm package unchanged would leave a third-party request in place.

## What Changes

- The presentation view loads Reveal from the installed 5.2.1 package instead of the CDN: `dist/reveal.css`, `dist/reset.css` and `plugin/notes/notes.js` are served by the deployment through mounts in `app.js`'s allowlist, alongside the two mermaid mounts that already work this way.
- `headjs@1.0.3` is dropped. It existed only to drive Reveal 3's `dependencies` loader, which Reveal 5 replaced with `plugins`.
- The `Reveal.initialize` call is migrated from the 3.7.0 API to 5.2.1: `dependencies` becomes `plugins: [RevealNotes]`, the options Reveal 5 no longer honours are dropped rather than carried along as decoration, and the commented-out blocks for multiplex, parallax backgrounds and the unused markdown and highlight plugins go with them.
- The script that injects `css/print/pdf.css` or `css/print/paper.css` on `?print-pdf` is removed. Reveal 5 ships print handling inside `reveal.css`; those files no longer exist in the package. PDF export keeps working through `?print-pdf` and `pdfMaxPagesPerSlide`.
- The `moon` theme is served from a project-held derivation rather than from the package directly, with the `@import` of the Google-hosted Lato replaced by an `@font-face` over the `Lato.ttf` already present in `assets/main-fonts/`. The derivation records which upstream version it was taken from, so a Reveal upgrade is told to revisit it.
- The `<link>` to `fonts.googleapis.com` in the wrapper's head is removed; the same local Lato serves it.
- The verification harness learns to report which hosts a rendered page actually contacts, observed on the network rather than scanned off the DOM — a CSS `@import` is invisible to the existing `sameOriginReferences`, which is precisely how the theme's Google request would survive a repair that believed itself complete.
- The presentation check asserts that the view contacts no host but the deployment's own, and that its Reveal assets resolve.

Not in scope: the choice of theme (`moon` stays), the deck's own layout rules in `css/reveal.css`, and the remaining bullets of `AI/proposals/initial-repairs.md` (housekeeping, documentation divergences), which belong to their own change.

## Capabilities

### New Capabilities

- `presentation-view`: What the presentation view is, where its rendering engine comes from, and the rule that it depends on no host but the deployment serving it. Covers deck navigation, speaker notes and PDF export as behavior that must survive the engine change.

### Modified Capabilities

- `browser-verification`: The harness gains the ability to report the external hosts a rendered page contacts. Today it exposes same-origin references only, and only those written as `href`/`src` attributes, so neither a cross-origin asset nor a stylesheet-level `@import` is observable to a check.
- `content-verification`: The requirement covering the presentation and document views gains the guarantee that the presentation view is proven to be self-contained, not only structurally correct.

## Impact

- **Code**: `obsidian.js` (`wrapInReveal` — head, plugin loading, the `Reveal.initialize` call, the print-stylesheet script), `app.js` (two new static mounts in the allowlist), `css/` (the theme derivation), `test/harness.js` (host observation), `test/checks/presentation.js` (the new assertion), `test/checks/deployment-surface.js` (the new mounts in the positive asset list).
- **Dependencies**: `reveal.js@5.2.1` goes from declared-but-unused to actually loaded. No package is added or removed. `headjs` was never a dependency — it was a URL.
- **Deployment**: The `Dockerfile` already runs `npm install --omit=dev` in the image, so `node_modules/reveal.js` is present where the new mounts point. No build step and no image change.
- **Behavior**: The presentation view renders through a different major version of Reveal. Transitions, scaling, fragments and keyboard navigation are all Reveal's, so the deck will not look pixel-identical to the 3.7.0 rendering — the migration keeps the configured intent (`convex` transition, 90% sizing, progress bar, slide numbers), not the exact output.
- **Operations**: Presentations work without internet access. A deployment behind a restrictive egress policy no longer needs `cdn.jsdelivr.net` or `fonts.googleapis.com` reachable.
