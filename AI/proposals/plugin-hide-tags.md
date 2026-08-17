# Tags verstecken — in beiden Ansichten

In Obsidian sollen die safeLearn-Tags verschwinden. Sie sind Anweisungen an den Renderer drüben, kein Text, den man lesen will. In der Leseansicht verschwinden sie ganz; in der Edit-Ansicht verschwinden sie, solange man nicht in der Zeile steht. Statt der Marker trägt ein eingeschränkter Block seinen Namen als Überschrift, so wie eine Tabelle ihre Kopfzeile trägt.

Das war zuerst zwei Proposals — `plugin-render-hide-tags` für die Leseansicht, `plugin-edit-hide-directives` für den Editor. Sie sind hier zusammengelegt, weil die Antworten auf ihre offenen Fragen dieselben geworden sind: dieselbe Überschrift, derselbe Rahmen, dieselbe Behandlung der File-Level-Direktive. Zwei Changes hätten dieselbe Widget-Logik zweimal spezifiziert und wären genau dort auseinandergelaufen, wo sie übereinstimmen müssen — beide beantworten dieselbe Frage, nämlich was ein Lehrer sieht, der schreibt, statt der Anweisung an den Server.

Es gilt der volle Tag-Satz aus `plugin-edit-tag-support`, inklusive File-Level-Directive und Time-Windows.

## Was heute im Weg steht

`cleanPreview()` (`main.ts:16-61`) macht das Verstecken heute, auf eine Art, die der falsche Ansatz ist:

- Es läuft über `el.querySelectorAll("*")`, also über **jeden** Knoten des gerenderten Dokuments, und prüft dessen gesamten `textContent`.
- Es ersetzt Text-Knoten durch frisch gebaute `<span>` (`main.ts:53-57`). Damit überschreibt es Obsidians eigenes Rendering und verliert bei verschachtelten Elementen die Formatierung — ein `##fragment` in einer Zeile mit Fettdruck nimmt den Fettdruck mit.
- `pattern.test(newText)` mit `/g`-Regexes (`main.ts:47`) — `lastIndex` bleibt stehen, jeder zweite Aufruf antwortet falsch. Das allein erklärt schon, warum Tags mal verschwinden und mal nicht.
- Und das ViewPlugin ruft dieselbe Funktion bei **jeder** Doc-Änderung über das ganze Dokument (`main.ts:199-205`), aus der Edit-Ansicht heraus. Dass das nicht sein darf, steht inzwischen als Requirement in `plugin-editor-decorations` („The editor does not modify rendered output") — der Code sagt es noch nicht.

Stattdessen: ein Markdown-Post-Processor, der die Stellen findet und ausblendet, statt gerendertes DOM umzubauen. Ein Tag, das eine ganze Zeile ist, verschwindet als Zeile; ein Tag mitten im Text verschwindet als Textstück, ohne das umgebende Element anzufassen.

## Warum das nicht in `plugin-edit-tag-support` gehört

Das ist kein weiterer Farbkanal, sondern ein anderer Mechanismus. Alles, was das Plugin heute im Editor tut, ist **markieren**: eine `Decoration.mark` oder `Decoration.line` legt Klassen auf Text, der stehen bleibt. Text verstecken und durch ein Label ersetzen ist eine `Decoration.replace` mit Widget, und die hat eigene Fehlermodi, die nichts mit Markierungen zu tun haben — ein atomarer Bereich, in den der Cursor nicht hineinkommt, Editieren an seinem Rand, Undo über die Ersetzung hinweg, und die Frage, was beim Selektieren über die Zeile passiert.

Drei Dinge stehen dem heute ausdrücklich entgegen, und jedes davon ist eine Entscheidung, die getroffen wurde und nicht bloß eine Lücke:

- **`design.md` von `plugin-edit-tag-support`** nennt Tag-Verstecken als Non-Goal.
- **Die Capability `plugin-editor-decorations`** sagt, was markiert wird. Dass etwas *ersetzt* werden darf, steht in keinem Requirement.
- **Mehrere laufende Checks** in `test/obsidian/plugin.test.js` prüfen den Markierungs-Text `"@@@ 4bhif"` in Live Preview. Wenn die Zeile im Ruhezustand nicht mehr aus ihren eigenen Zeichen besteht, sagen die etwas anderes aus als heute.

Beide Punkte sind unten ausformuliert, damit sie beim Bauen nicht nebenbei passieren.

## Was in beiden Ansichten gleich ist

**Die Überschrift baut die Einträge als Chips neu auf.** Jeder Eintrag wird ein eigenes Element, das seine Kategorie trägt — dieselben sechs Unterscheidungen, die `plugin-edit-tag-support` bereits pro Eintrag markiert (`main.ts:483-487`): Eintrag, mit Zeitfenster, mit einem Fenster das der Server wegwirft, View-Schalter, Schalter der nichts auflöst, und die Direktive aus der nichts lesbar ist. Ohne das wäre genau die Information weg, die der Punkt der Sache war: dass `4bhif[gestern]` dauerhaft freigibt, sähe man sonst nicht mehr, ohne die Zeile anzuklicken.

**Eine Zeitklammer wird wörtlich übernommen, nicht in Sprache übersetzt.** `4bhif[2026-08-01..2026-08-20]` steht so in der Überschrift, wie es im Dokument steht. Ein Plugin, das daraus „1.–20. August" macht, behauptet eine Deutung — und der Server verwirft manche Fenster, die dabei plausibel aussehen würden. Das Plugin enforced nichts; sein einziger Wert ist, dass es nichts behauptet, was der Server nicht tut.

**Eine Direktive, aus der nichts lesbar ist, bekommt eine warnende Überschrift.** Ihr Block wird vom Server jedem Leser vorenthalten, auch einem Admin. Eine Überschrift mit einem Namen würde das Gegenteil behaupten, gar keine Überschrift wäre die Zeile, die spurlos verschwindet. Also verschwindet sie wie jede andere, aber im Stil von `permission-withheld` und mit einer Aussage, die sagt, dass niemand den Block sieht.

**Die File-Level-Direktive bekommt dieselbe Kopfzeile wie ein Block, in einem Kasten ohne untere Kante.** Sie steht in Zeile 1, gilt für die ganze Datei und hat keinen schließenden Marker — es gibt keinen Kasten, auf den eine Kopfzeile passt. Der nach unten offene Rahmen sagt selbst, dass die Geltung nicht aufhört. Es braucht kein zweites Widget nur für diesen Fall, und beide Ansichten geben dieselbe Antwort.

**Der Rahmen ist in beiden Ansichten derselbe.** Nicht die Callout-Form mit Streifen links, die in `plugin-render-hide-tags` zuerst erwogen war, sondern die volle Kastenform, die auch der Editor zeigt. Ein Lehrer soll beim Wechsel der Ansicht nicht zweimal lernen müssen, was er sieht.

## Nur die Edit-Ansicht

**Die Zeile klappt auf, wenn der Cursor in ihr steht oder eine Selektion sie berührt.** „Cursor in der Zeile" ist die Konvention, die Obsidian für seine eigene Syntax benutzt, und das Plugin rebuildet bei Cursor-Bewegungen schon heute. Eine Selektion, die über den Block hinweggeht, zeigt die Zeile ebenfalls — sonst kopiert man Text, dessen Inhalt man nicht sieht. Die Zeilen direkt darüber und darunter tun nichts; sie sollen beim Durchscrollen mit dem Cursor nicht flackern.

## Nur die Leseansicht

**Side-by-side wird als Spalten nachgebaut.** Die Marker verschwinden zu lassen und den Inhalt untereinander laufen zu lassen, hieße: die Leseansicht sagt nichts darüber, wie die Seite drüben aussieht — und genau dafür ist das Plugin da. Die Spaltenbreiten werden nie exakt die von reveal.js sein; das ist hingenommen. Wie der Renderer die Spalten schneidet, steht in `preprocessSideBySide` (`obsidian.js:885`) — beim Bauen die Funktion lesen, nicht raten.

**`##fragment` verschwindet spurlos.** Keine Markierung, kein Rest. Dass dort ein Fragment sitzt, sieht man in der Edit-Ansicht; die Leseansicht soll sich wie ein normales Dokument lesen.

## Was an der Capability zu ändern ist

`plugin-editor-decorations` beschreibt heute ein Plugin, das ausschließlich markiert. Der Change muss zwei Dinge tun, und beide gehören als Delta in den Change, nicht vorab in die Haupt-Spec:

**Ein neues Requirement, das die Ersetzung überhaupt erlaubt** — heute erlaubt sie keines. Es muss sagen, dass die Direktiv-Zeile im Ruhezustand nicht aus ihren eigenen Zeichen besteht, und wann sie es wieder tut:

> ### Requirement: A directive line is shown as the heading of the block it opens
>
> While the cursor is elsewhere, a directive line SHALL be replaced by a heading of the block it opens, rather than shown as its own characters. The heading SHALL carry each entry of the directive with the distinction that entry carries, and SHALL reproduce a time window as it is written rather than restating it, so that nothing is claimed of an entry that the server does not do with it. The replacement SHALL be lifted while the cursor is in the line or a selection touches it, and the line's own characters SHALL then be present and editable.

**Eine Präzisierung des bestehenden Requirements „What is marked reflects the document as it is currently shown".** Sein Satz „a tag becomes editable when the cursor is in it" liest sich heute so, als seien die Zeichen sonst da und bloß nicht editierbar. Für die Direktiv-Zeile sind sie im Ruhezustand nicht da. Der Satz braucht die Bedingung davor; sein Scenario „The cursor enters a tag" bleibt gültig, weil es genau das gewünschte Verhalten beschreibt.

Das Requirement „The editor does not modify rendered output" bleibt unverändert und wird durch diesen Change endlich auch im Code wahr — der ViewPlugin-Aufruf von `cleanPreview()` fällt weg.

## Welche Checks das umschreibt

Alle Checks, die den Text einer Direktiv-Zeile in Live Preview erwarten, sagen nach dem Change etwas anderes aus. Sie sind bewusst umzuschreiben, nicht nebenbei:

- `a file-level directive on line 1 does not swallow the block below it` (`plugin.test.js:451`) — erwartet `L3C0:"@@@ 4bhif"` und `L5C0:"@@@"`
- `an unreadable entry leaves the entries beside it marked...` (`:525`) — vergleicht gegen `MIXED_DIRECTIVE`
- `a closing marker with nothing open does not turn what follows into a block` (`:555`)
- `a directive naming several things is marked as several things` (`:591`)
- `the first line is marked as gating the file, and the same text later as opening a block` (`:618`)
- `a directive with nothing readable in it is marked as withheld from everyone` (`:691`)
- `a file-level directive nothing can be read from is marked as both` (`:712`)
- `a switch, a switch that resolves to nothing, and a class are three different markings` (`:731`)
- `a permission block is decorated in the editor` (`:192`) und `a corpus file in live preview carries the plugin's own markers` (`:152`)

Einer davon widerspricht dem Change direkt statt bloß im Detail: **`the cursor entering a tag changes no text and leaves the tag marked` (`:420`)**. Er behauptet, der Cursor ändere nichts an dem, was dasteht. Nach dem Change ändert er genau das — das ist der Punkt. Der Check muss die neue Aussage prüfen: dass der Cursor den Dokumenttext nicht ändert, wohl aber, was gezeigt wird.

Dazu kommen neue Checks für das, was es vorher nicht gab: die Zeile im Ruhezustand, die Zeile bei berührender Selektion, die Überschrift mit wörtlicher Zeitklammer, der nach unten offene Kasten in Zeile 1, die warnende Überschrift der unlesbaren Direktive, die nachgebauten Spalten in der Leseansicht.

## Reihenfolge

Nach `plugin-edit-tag-support` — die Grammatik, die pro Eintrag entscheidet, ist das, woraus die Überschrift ihren Inhalt zieht. Vor `plugin-insert-commands` und `plugin-section-authoring` nicht nötig, aber angenehm: was die dort eingefügt wird, sieht man danach so, wie es drüben wirkt.
