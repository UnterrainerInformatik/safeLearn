## 1. Resolution and gate

- [x] 1.1 `obsidian.js`: extract the wiki-link name parsing (`|text`, trailing `\`, `md/` and `/md/` prefix) into one helper, used by `preReplaceObsidianFileLinks`. Verify that the existing `[[page]]` checks in `test/content.test.js` still pass
- [x] 1.2 `preReplaceObsidianFileLinks`: when `mdFilesMap` has no match, fall back to `resolveAttachment` and emit `[text](encoded url)` (design D1). Verify with a new check in `test/content.test.js`: `[[x.pdf]]`, `[[x.pdf|Text]]` and an ambiguous basename (stays raw), and that `[[sub/x.pdf]]` picks the right copy
- [x] 1.3 `extractAttachmentReferences` and `resolveAttachmentReference`: add the kind `wikilink` (design D2), using the helper from 1.1. Verify in `test/attachments.test.js`: extraction (code masked, `[[page]]` resolves to no attachment) and `mayServeAttachment` for a PDF referenced only by `[[…]]`, in an unrestricted place and inside a `@@@ teacher` block (student refused, teacher served)

## 2. Inline PDF

- [x] 2.1 `getHtmlFor`: build every branch's URL with `encodePathPreservingSlashes` (D4). Add the `pdf` branch with the `.sl-pdf` placeholder and the fallback link, passing the size from `parseWidthHeight` as `data-width`/`data-height` (D3). Verify in `test/content.test.js` that the sanitized output still holds the placeholder, its `data-*` attributes and the encoded link for a name with a space and an umlaut
- [x] 2.2 `getPdfEmbedScript()` in `obsidian.js`, included by `wrapInPage` and `wrapInReveal` but not `wrapAsDocument` (D3): upgrade every `.sl-pdf` to an iframe plus link on load (a hot reload is a full reload), idempotently. Verify with a harness check: the page view of a fixture with `![[…pdf]]` has an `iframe` whose `src` returns `200 application/pdf`
- [x] 2.3 CSS: page and slide sizes for `.sl-pdf iframe`, plus `data-prevent-swipe` in the presentation (D5). Verify with a harness check: on `?reveal` the slide holding the embed has a visible iframe within the slide bounds; on `?document` there is a link and no iframe

## 3. Fixtures, docs, run

- [x] 3.1 Test fixture: a small PDF under the test corpus with a space and an umlaut in its name, one page that links it with `[[…]]` and one that embeds it with `![[…]]` and `![[…|600x400]]`. Verify that the checks from 1.2–2.3 use it
- [x] 3.2 `docs-obsidian.md`: PDF links and embeds, including size and the mobile fallback. `docs-render-pipeline.md`: steps 4.6 and 6.2 mention attachments and PDFs. Verify by reading the rendered pages in the app
- [ ] 3.3 Run `npm test` in full and record the result here

### Result of 3.3 (2026-10-20)

Not green, and not for reasons in this change. Run without a `.env`, with a throwaway `SESSION_SECRET` in the environment.

- Offline files (everything but `content`, `smoke` and `exam`): 396 passed, 0 failed, 33 cancelled. The cancelled ones are `invitation-list` and `section-names` tests that read the plugin checkout.
- `test/content.test.js` in full: 123 passed, 8 failed, 42 cancelled. The failures are external: the admin login at the identity provider failed ("the application does not consider the session authenticated"), which cancels `directory-search` and every module after it. The shared demo accounts' preferences changed under the run ("Preference dm ... set to 0, but the application renders with 1"; the exam-view check). The checks this change touches all passed: the three wiki-link checks in `navigation.js`, the image forms in `rendering.js` (updated to expect the percent-encoded address, D4), and all six of `pdf-embeds.js` when run on their own.
- An earlier attempt ran several suites at once against the same port and accounts. Its failures were caused by that overlap and are discarded.
- Still to do: one green run of `npm test` once the realm's admin login works again.
