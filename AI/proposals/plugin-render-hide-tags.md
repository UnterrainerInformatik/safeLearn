# Tags in der Leseansicht verstecken

In Obsidians Reading View sollen die safeLearn-Tags verschwinden. Sie sind Anweisungen an den Renderer drüben, kein Text, den man lesen will. Es gilt derselbe volle Tag-Satz wie in `plugin-edit-tag-support`, inklusive File-Level-Directive und Time-Windows.

Heute macht das `cleanPreview()` (`main.ts:16-61`), und zwar auf eine Art, die ich für den falschen Ansatz halte:

- Es läuft über `el.querySelectorAll("*")`, also über **jeden** Knoten des gerenderten Dokuments, und prüft dessen gesamten `textContent`.
- Es ersetzt Text-Knoten durch frisch gebaute `<span>` (`main.ts:53-57`). Damit überschreibt es Obsidians eigenes Rendering und verliert bei verschachtelten Elementen die Formatierung — ein `##fragment` in einer Zeile mit Fettdruck nimmt den Fettdruck mit.
- `pattern.test(newText)` mit `/g`-Regexes (`main.ts:47`) — `lastIndex` bleibt stehen, jeder zweite Aufruf antwortet falsch. Das allein erklärt schon, warum Tags mal verschwinden und mal nicht.
- Und das ViewPlugin ruft dieselbe Funktion bei **jeder** Doc-Änderung über das ganze Dokument (`main.ts:199-205`), aus der Edit-Ansicht heraus.

Was ich stattdessen will: ein Markdown-Post-Processor, der die Stellen findet und ausblendet, statt gerendertes DOM umzubauen. Ein Tag, das eine ganze Zeile ist, verschwindet als Zeile; ein Tag mitten im Text verschwindet als Textstück, ohne das umgebende Element anzufassen.

**Ein eingeschränkter Block bleibt sichtbar, dezent.** Die Marker (`@@@ teacher` und das schließende `@@@`) verschwinden, aber der Block dazwischen wird kenntlich gemacht — ein Rahmen mit Hintergrundfarbe oder ein Streifen links, so wie Obsidian das bei Callouts macht. Drüben sieht ein Schüler den Block gar nicht; hier schreibt aber der Lehrer, und der muss beim Lesen sehen, was wem gehört, ohne in die Edit-Ansicht wechseln zu müssen.

Das gilt für die Block-Form. Das File-Level-Directive in Zeile 1 hat keinen Block, den man umranden könnte — wie das aussieht (Kopfzeile? gar nichts?), entscheiden wir wenn wir es sehen.
