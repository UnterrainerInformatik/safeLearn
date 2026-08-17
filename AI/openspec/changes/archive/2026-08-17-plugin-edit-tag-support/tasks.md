## 1. Establish the oracle before mirroring anything

- [x] 1.1 Write a table of edge-case directive lines covering each conclusion the grammar has to reach: a plain role, a role with spaces, a role with a `from` window, a `to` window, a `start to end` window, a window with a timezone suffix, an unparseable window, a bracket inside the role part, text after the closing bracket, an empty token between commas, each of the three view switches, a switch that is none of the three, and a directive whose every entry is unreadable.
- [x] 1.2 Add a check to the content-verification suite that feeds each line to `parseFirstLineForPermissions` from `obsidian.js` and records the server's conclusion per entry — whether it survived, and whether it kept a window. This is the oracle; it must pass against the server alone, before the plugin has any grammar to compare with.

## 2. The directive grammar in the plugin

- [x] 2.1 Add `parseDirectiveEntries(text)` to the recognition block at the top of `main.ts`, returning one record per comma-separated token with the offset and length of the token, of its role part, and of its window part. Follow the block's existing rule: every pattern comes from a function, never a shared constant.
- [x] 2.2 Mirror `parsePermissionEntry` — the token pattern, the trim, the lowercase — so that a token the server refuses is reported as unreadable rather than as a role.
- [x] 2.3 Mirror the success condition of `parsePermissionWindow` and `parseLocalDateTime`: whether the server would keep the window, not what time it denotes. Reject and accept exactly what the server does, including the permissive cases (`2025-13-45` is accepted; `2025` alone is not).
- [x] 2.4 Classify the `#` prefix: mark the entry as a view switch, and separately whether it is one of the three the server resolves.
- [x] 2.5 Extend the oracle check from 1.2 to run the plugin's grammar over the same table and assert the same conclusion per entry. Record any deliberate divergence in `AI/architecture.md` §9; leave none unrecorded.

## 3. What the editor marks

- [x] 3.1 Have `resolveBlocks` report the file-level directive line it already recognizes, rather than leaving `buildDecorations` to derive it a second time.
- [x] 3.2 Emit a line marking for the file-level directive, distinct from the block-opening marking that the same text on a later line receives.
- [x] 3.3 Emit per-entry marks on every directive line — the shared entry class plus the classes for timed, broken window, view switch and unresolved switch, combined on the same range.
- [x] 3.4 Emit the line marking for a directive whose every entry is unreadable, since the server withholds that block from every reader.
- [x] 3.5 Confirm the decoration set stays well-formed where an entry mark and a line marking meet at one position — the set is still handed to `Decoration.set(ranges, true)` and the library still sorts it.
- [x] 3.6 Add the new classes to `styles.css` and to the frozen `markerClasses` list in `test/obsidian/harness.js`, which is what the harness reads decorations back through.

## 4. Prove it in the harness

- [x] 4.1 Write the wrong-on-purpose documents through the harness's `writeDocument` — broken windows, unreadable entries, mixed directives — so they live in the rebuilt vault and never in `md/`.
- [x] 4.2 Assert each new requirement from `specs/plugin-editor-decorations/spec.md`: entries marked individually, the file-level form distinguished from the block form, timed distinguished from permanent, a discarded window shown as discarded, a switch distinguished from an address, an unresolved switch distinguished from both.
- [x] 4.3 Assert the isolation the modified requirement demands: one unreadable entry beside readable ones leaves the readable ones marked as they would be without it.
- [x] 4.4 Assert time-independence explicitly — a window whose end has passed is marked exactly as one that has not yet opened — and confirm the suite's existing assertion that recognition does not depend on when it is examined still passes.
- [x] 4.5 Run the full plugin suite and the content-verification suite; both green.

## 5. Settle the appearance

- [x] 5.1 Open real corpus documents in the harness and take screenshots of the new markings in Live Preview and Source mode.
- [x] 5.2 Review them with Gerald and settle the visual channels in `styles.css`. If the page reads as noise, reduce the channels rather than the conclusions.
- [x] 5.3 Update `README.md` in the plugin repository to describe the tag forms the plugin now shows.
