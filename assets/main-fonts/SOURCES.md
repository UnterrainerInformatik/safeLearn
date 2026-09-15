# Where these files came from

Every cut of a typeface has to come from the same release as the regular beside
it. A bold drawn against a different regular has different metrics, and the
spacing it shifts is not something any check here would fail on — so the release
is written down rather than remembered, and the next person fetching a cut knows
what to match.

`test/checks/legibility.js` reads the files themselves, not this table: it asserts
that each one carries the weight and the italic bit its name claims. This table
records the one thing the file cannot say, which is where to get another one like
it.

| typeface | version | release |
| --- | --- | --- |
| EB Garamond | 1.003 | Google Fonts, `fonts.google.com/download/list?family=EB+Garamond`, `static/` |
| FiraCode | 5.002 | Google Fonts, `family=Fira+Code`, `static/` — not tonsky's own release, whose statics are drawn on a 1950 em square where this deployment's regular is on 2000 |
| Inter | 3.019 (git-0a5106e0b) | `github.com/rsms/inter`, release `v3.19`, *Inter Hinted for Windows/Desktop* |
| Lato | 1.104 | Google Fonts, `family=Lato` |
| Montserrat | 9.000 | Google Fonts, `family=Montserrat`, `static/` |
| NotoSans | 2.015 | Google Fonts, `family=Noto+Sans`, `static/NotoSans-*` |
| NotoSans Condensed | 2.015 | Google Fonts, `family=Noto+Sans`, `static/NotoSans_Condensed-*` |
| Open Sans | 3.003 | Google Fonts, `family=Open+Sans`, `static/` |
| OpenDyslexic3-Regular | regular 1.000, cuts 0.920 | the regular is from the pre-2019 OpenDyslexic3 distribution; the cuts are `github.com/antijingoist/opendyslexic`, release `v0.91.12`, as `.otf` — see below |
| Oswald | 4.103 | Google Fonts, `family=Oswald`, `static/` |
| Ubuntu Mono | 0.80 | Google Fonts, `family=Ubuntu+Mono` |

The version of a cut is not always the version of the regular already shipped
beside it — EB Garamond, Montserrat and Noto Sans have all moved on since their
regular was taken. What was checked before anything was landed is the thing that
matters: the upstream regular's em square and vertical metrics against the
regular on disk, identical in every case. A release whose regular differs is the
wrong release, and none of that family was taken.


## OpenDyslexic3 is the one family whose cuts come from another build

No release still publishes cuts under the name `OpenDyslexic3`. What upstream
ships now is `OpenDyslexic` 0.92, a later build of the same typeface, in `.otf`
and under a different name — so the choice was between leaving the one font here
chosen for readability with a synthesised bold, and taking a bold drawn for a
neighbouring build. The bold was taken. Two things were accepted in doing it, and
neither is a mistake to be found and fixed later:

- **The bold is OS/2 weight 800, not 700.** The `@font-face` descriptor says 700,
  which is what the browser selects on, so a heading resolves to it. What the
  file calls itself differs from the slot it fills.
- **The faces sit on different vertical metrics** — ascender 1300, descender -520,
  against the shipped regular's 1556 and -426. A line of bold occupies a
  different box from the line of prose above it.

`obsidian.js` records this as `cutsFromAnotherBuild` on the typeface, and
`test/checks/legibility.js` reads that column so the mismatch reads as a decision
rather than as a file somebody got wrong. If a build of OpenDyslexic3 with its
own cuts ever turns up, they drop in and the column comes out.

The `.otf` is also why the scanner and `getFontImports()` know four containers
rather than one: `.ttf`, `.otf`, `.woff` and `.woff2`, offered smallest-first in
a single `src`. Nothing here is a web format yet, and converting the payload is
worth its own change — but the pipeline no longer has to be taught what they are.
