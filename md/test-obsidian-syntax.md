# Obsidian syntax fixture

A file visible to everyone that shows the Obsidian syntax safeLearn renders
itself: footnotes, math, block references and links to headings and blocks.

## Footnotes

Fowler wrote it.[^src] Beck agreed.[^1] Both said so twice.[^src] An inline
note stands in place.^[INLINENOTIZ written where it is referenced.]

A reference without a definition stays as written: [^fehlt].

[^1]: Kent Beck, 2000.
[^src]: Refactoring, 2002.

## Math

Pythagoras: $a^2 + b^2 = c^2$. In brackets ($x_1$) and as a word part $x$-Achse.

$$
\frac{a}{b} = \sqrt{c}
$$

Kostet $5 und $10. Escaped: \$PREIS\$. Code keeps it: `$HOME`.

A formula that does not parse: $\frac{a$ and the text goes on.

## Blocks

A tree is a connected graph without cycles. ^def-baum

- Erster Punkt ^punkt-eins
- Zweiter Punkt

| Note | Punkte |
|------|--------|
| 1    | 90     |

^tabelle-noten

Exponent in text: 2^10.

## Links

- To a heading of another note: [[test-content-list#Second section]]
- With nested headings: [[test-content-list#Content list: a page of its own#Second section]]
- To a heading that does not exist: [[test-content-list#Nichtvorhanden]]
- Within this page: [[#Summary|jump to the summary]]
- To a block of this page: [[#^def-baum]]

## Summary

The last slide. Back to the [[#Footnotes]].
