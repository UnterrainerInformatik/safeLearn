## Context

See proposal.md — Why. The render pipeline (`AI/architecture.md` §6) runs `preParse` on the Markdown source, then `marked.parse`, then `manipulateHtml` on the HTML, then `DOMPurify.sanitize`. Two `marked` instances exist, `markedLight` and `markedDark`, which differ only in their Shiki theme and are chosen per request by the preference `dm`.

## Goals / Non-Goals

**Goals:**

- Render what Obsidian 1.14 writes, so that a highlight coloured in the vault is coloured on the page.
- Stay legible in the light page, the dark page and the deck.

**Non-Goals:**

- Any colour syntax Obsidian does not have — free text colour, hex values, the community plugins' `~={…}=~`. Obsidian has none of these natively; following a plugin's syntax would bind the corpus to that plugin.
- Highlights spanning a line break. Obsidian's syntax is inline; the case is left as text rather than guessed at.
- Anything in the Obsidian plugin.

## Decisions

### A `marked` inline extension, not a `preParse` rewrite

The other Obsidian syntaxes are rewritten by regex in `preParse`, and code blocks are parked around those passes (`preMarkCode`/`unmarkCode`) so the rewrites cannot reach into code. A highlight is different in kind: it is inline formatting that may contain other inline formatting (`==🔵**bold** [link](…)==`) and must not be formed inside an inline code span, which the parking does not cover. An inline tokenizer gets both for free — the lexer never hands code spans or fenced blocks to it, and the content is lexed again as inline tokens, so emphasis and links inside it render as they would anywhere else.

Alternative considered: a regex in `preParse` emitting `<mark>`. It would need its own protection of inline code and would emit HTML into Markdown, where `marked` then decides what of it to parse.

### Where the grammar draws its edges

`^==(?!=)(emoji)?️?((?:[^=\n]|=(?!=))*?[^\s=])==`:

- `(?!=)` after the opening pair keeps `a === b == c` as text.
- The content may hold a single `=` (`==a= b==`) but not `==`, and no line break.
- The last character is not blank, so `== ==` stays text.
- An optional U+FE0F after the emoji, because some keyboards append the variation selector and the result looks identical.

An emoji outside the six (`==⚫x==`) is not a colour; it renders as a plain highlight with the emoji as part of the text, which is what it is.

### Class names and tints

`<mark class="sl-mark">` for every highlight, plus `sl-mark-<colour>`. The `sl-` prefix because `.highlight` is already taken in `css/fixes.css` for the active navigation entry. DOMPurify's defaults keep `mark` and `class`, so the sanitizer needs no configuration.

The tints are Obsidian's base colours (light: `--color-red` 233,49,71 … ; dark: 251,70,76 …) at 22–40 % alpha, with `color: inherit`, so the glyph colour — and therefore the contrast `reading-legibility` measures — is that of the surrounding text.

### One stylesheet, linked from both chains

`css/main.css` is the page's and the document's entry point; the deck does not load it and links its own files from `wrapInReveal`. `css/highlights.css` is imported by the former and linked by the latter. The deck's moon theme is dark, so `.reveal mark…` takes the dark tints alongside `.dark-mode mark…`.

## Risks / Trade-offs

- **Obsidian may extend the palette.** A seventh emoji would render as a plain highlight showing the emoji — visible and harmless — until the table in `highlightColors` gains it.
- **The tints are approximations.** Obsidian's exact highlight alphas are theme-dependent and not documented; the goal is the same colour family and legibility, not pixel identity with any one theme.
