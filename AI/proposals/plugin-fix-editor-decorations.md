# Editor-Dekorationen im Plugin reparieren

Die Edit-Ansicht funktioniert nicht so wie gewünscht: beim manuellen Editieren verschieben sich die Tags. Das ist ein Index-Problem.

Du hast beim Lesen von `main.ts` schon mehrere konkrete Ursachen gefunden. Die Liste ist der Ausgangspunkt, nicht das Ergebnis — arbeite sie ab und suche weiter:

- **`main.ts:103`** — `const to = from + "##fragment ".length` nimmt immer die Länge *mit* Leerzeichen (11), auch wenn `##fragment` am Zeilenende ohne Leerzeichen steht (10). Die Dekoration greift ein Zeichen zu weit, über das Zeilenende hinaus. Das ist der wahrscheinlichste Kandidat für das Verschieben.
- **`main.ts:190`** — sortiert die Dekorationen nur nach `from`. `RangeSetBuilder` verlangt Sortierung nach `from` **und** `startSide`; Line-Dekorationen (`from == to`) und Mark/Replace an derselben Position kollidieren.
- **`main.ts:72`** — baut nur bei `docChanged` neu, nicht bei `viewportChanged` und nicht bei Cursor-Bewegung. In Live Preview muss ein Tag sichtbar werden, sobald der Cursor drinsteht, sonst editiert man blind.
- **`main.ts:47`** — `pattern.test(newText)` mit `/g`-Regexes: `lastIndex` bleibt zwischen Aufrufen stehen, jeder zweite Aufruf antwortet falsch.
- **`main.ts:81`** — `view.dom.classList.contains("cm-preview")` ist keine Obsidian-Klasse. `isPreview` dürfte immer `false` sein, womit der ganze Replace-Zweig toter Code ist.
- **`main.ts:199-205`** — `cleanupPreview()` läuft bei jeder Doc-Änderung über `document.querySelectorAll(".markdown-preview-view")` und schreibt in bereits gerendertes DOM. Das ist die Leseansicht, von der Edit-Ansicht aus manipuliert. Gehört getrennt, siehe `plugin-render-hide-tags`.
- **Block-Erkennung**: ein `@@@` in Zeile 1 ohne schließendes `@@@` ist das File-Level-Directive und kein offener Block. Heute öffnet die Logik dort einen Block, der nie zugeht. Ob das hierher gehört oder nach `plugin-edit-tag-support`, entscheide beim Bauen.

Reihenfolge: **nach** der Harness. Vorher ist nicht nachweisbar, dass es besser geworden ist, und genau das ist bei einem Problem, das man nur beim Tippen sieht, der Punkt.
