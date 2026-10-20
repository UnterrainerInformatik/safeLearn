## Context

The two wiki-link forms run through different steps of the render pipeline (`docs-render-pipeline.md`):

- `[[…]]` is handled before `marked`, in `preReplaceObsidianFileLinks` (`obsidian.js`). It looks the basename up in `mdFilesMap` only, which holds `.md` files without their extension. `handout.pdf` is not there, so the match is returned unchanged and the reader sees `[[handout.pdf]]`.
- `![[…]]` is handled after `marked`, in `replaceEmbedsIn` → `resolveAttachment` → `getHtmlFor`. A PDF resolves, but `getHtmlFor` has no branch for it and falls back to `<a href="…">name</a>`, with the path not percent-encoded.
- The attachment gate decides from `extractAttachmentReferences`. It knows `![[…]]`, Markdown links and images, reference definitions and HTML attributes, but not `[[…]]`. A rendered `[[handout.pdf]]` link would therefore point at a file the gate refuses.
- Every page goes through `sanitizeHtml` (DOMPurify defaults), which strips `<iframe>`, `<object>` and `<embed>`. The application sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`, so the deployment may frame its own `/md/…` files.
- The page view and the document view load `/obsidian-page.js`; the presentation does not, it has its own inline script. All three views include the inline script `getAutoReloadScript()` returns.

## Goals / Non-Goals

**Goals:**
- One resolution rule for `[[name]]` and `![[name]]` attachments, shared by renderer and gate (spec `attachment-access`, "resolves the way the page renders it").
- An inline PDF on page and slide without loosening the sanitizer for author-written HTML.

**Non-Goals:**
- A PDF.js-based viewer or page-by-page slides from a PDF. The browser's own PDF viewer is enough.
- Indexing PDF text for the corpus search.
- Embedding other document types (Office files, ZIPs): they keep rendering as a link.

## Decisions

### D1: `[[…]]` falls back to attachments in the same step

`preReplaceObsidianFileLinks` first tries `mdFilesMap` as today. If that finds nothing, it calls `resolveAttachment(name)`. On a hit it emits a Markdown link `[text](url)` with the url built by `encodePathPreservingSlashes(dirPrefix + file)`, just like the `.md` branch. This way `marked` produces the `<a>` and nothing after it has to know about the new case.

*Alternative:* handle `[[…]]` attachments after `marked`, like embeds. This was rejected because the `.md` link branch already lives before `marked`, and splitting one syntax across two steps makes the order more fragile.

### D2: The gate learns `[[…]]` as a reference of kind `wikilink`

`extractAttachmentReferences` gets a third pattern `(?<!!)\[\[([^\]\n]+)\]\]`. It strips `|text` and a trailing `\`, exactly as the renderer does, and records `{ raw, kind: "wikilink" }`. `resolveAttachmentReference` treats `wikilink` like `embed` (`resolveAttachment(raw)`). A name that resolves to a Markdown page resolves to no attachment and is ignored, as before. Code is already masked by `maskCode`.

To keep the two rules from drifting, the name parsing (`|`, trailing `\`, `md/` prefix) moves into one helper that both `preReplaceObsidianFileLinks` and `extractAttachmentReferences` call.

### D3: An inline PDF is a placeholder that survives sanitizing, upgraded on the client

For `pdf`, `getHtmlFor` emits:

```html
<div class="sl-pdf" data-src="<encoded url>" data-width="…" data-height="…">
  <a href="<encoded url>" target="_blank" rel="noopener">name.pdf</a>
</div>
```

DOMPurify keeps `div`, `a` and `data-*` (it drops `target`, so the client sets it). An inline script, returned by `getPdfEmbedScript()` in `obsidian.js` the way `getAutoReloadScript()` returns its own, runs on load, inserts `<iframe src="data-src" title="name.pdf" loading="lazy">` before the link in every `.sl-pdf` not yet upgraded and applies the size. A hot reload is a full `location.reload()`, so running on load covers it. `wrapInPage` and `wrapInReveal` include the script; `wrapAsDocument` does not, so the document view keeps the link only, as the spec requires for printing.

*Correction (2026-10-20, during apply):* an earlier version put this function in `obsidian-page.js`, on the assumption that the deck loads it and the document view does not. It is the other way round, so the function moved to a script of its own that exactly the two viewing modes include.

*Alternatives:*
- Allow `iframe` in the sanitizer (`ADD_TAGS`), possibly with a hook restricted to `/md/…` sources. This was rejected because it widens the one sanitizer also used by the exam question import. A same-origin-only hook would be security-relevant code for a display feature.
- `<object type="application/pdf">` is just as stripped and has no advantage over an iframe.

### D4: Encoded URLs in `getHtmlFor`

All branches of `getHtmlFor` (image, video, audio, link) build their URL with `encodePathPreservingSlashes`. The attachment router already decodes `req.path` before it normalizes, so encoded and unencoded requests resolve to the same file and the grant keys stay unchanged.

### D5: Presentation

The slide gets the same placeholder. In the CSS, `.reveal .sl-pdf iframe` gets the width of the slide and a height of about 70% of the slide, unless the author gave a size. Reveal's `data-prevent-swipe` is set on the iframe so that scrolling in the PDF does not change the slide on touch devices.

## Risks / Trade-offs

- [Mobile browsers (Android Chrome, iOS Safari) do not display a PDF inline, or show only the first page] → The link under the viewer is always rendered and opens the PDF on its own.
- [Grants: the PDF is requested by the iframe after the page load] → `recordAttachmentGrants` already grants every reference of the rendered page, so the iframe request is covered by the grant. D2 makes this hold for `[[…]]` too.
- [A teacher wrote `[[something.pdf]]` expecting raw text] → This is unlikely. It now becomes a link, which is what Obsidian shows too.
- [Large PDFs slow down a page with several embeds] → `loading="lazy"` on the iframe.
