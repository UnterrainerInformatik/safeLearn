# Edit-Ansicht um den vollen Tag-Satz erweitern

Das Plugin kennt heute drei Dinge: `##fragment`, `@@@ rolle` und `##side-by-side-start/separator/end`. safeLearn kann inzwischen mehr, und die Edit-Ansicht soll den vollen heutigen Satz darstellen.

| Tag | im Plugin heute | wo es hier steht |
| --- | --- | --- |
| File-Level-Directive in Zeile 1 — `@@@ 4bhif, 5ahif`, **ohne** schließendes `@@@`, gilt für die ganze Datei | nein; die Blocklogik öffnet an Zeile 1 einen Block, der nie schließt | `AI/architecture.md` §7, "The two directive forms" |
| Time-Windows an jeder Rolle — `4ahif[2025-11-28T08:00:00]` (ab), `[to 2025-12-01T12:00:00]` (bis), `[start to end]` | nein; die Rollen-Regex `[^\s,]+` bricht am Leerzeichen in `[a to b]` | §7, "Time windows" |
| Pseudo-Rollen `#exam`, `#practice`, `#answer` | nur zufällig, als gewöhnliche Rollen | §7, "View pseudo-roles" |

Darstellung: die drei sollen **unterscheidbar** sein. Eine Rolle mit Zeitfenster ist etwas anderes als eine dauerhafte — man muss beim Draufschauen sehen, dass dieser Block irgendwann auf- oder zugeht. Und eine Pseudo-Rolle ist überhaupt keine Rolle, sondern ein Schalter für die Ansicht. Wie genau das aussieht, entscheiden wir wenn wir es sehen; dafür ist die Harness da.

Ein Detail, das leicht untergeht: die Rollen, die ein Directive nennt, sind **nicht** dieselbe Menge wie die Rollen, die eine Session hält. `admin`, `teacher`, `teachers`, `student`, `students` sind reserviert, alles andere kann ein Klassenname oder ein Personenname sein. Das Plugin kann also nicht validieren, ob eine Rolle „existiert" — es kann nur die Form prüfen.

Reihenfolge: **nach** `plugin-fix-editor-decorations`. Auf kaputten Indices weitere Tags aufzusetzen macht die Fehlersuche doppelt so teuer.
