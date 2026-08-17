# Sections aus Listen erzeugen

Das ist der eigentliche Zweck der beiden Admin-Proposals: nicht Listen anschauen, sondern damit Dokumente bauen.

- **„Lege bitte eine Private Section pro Schüler der Klasse XYHIF in diesem Dokument an."** Für jeden Schüler ein `@@@ <name>` / `@@@`-Block, in der Reihenfolge der Liste, mit einer Überschrift dazwischen.
- **„Diese Section ist nur sichtbar für: …"** Ein Auswahlmenü über Schüler (filterbar nach Klasse) und Lehrer, das aus der Auswahl das Directive baut und um die markierte Stelle legt.

Ein Detail, das von hier kommt und leicht kaputtgeht: der **Name** eines Users wird drüben als Rolle behandelt — `@@@ Stu Dent` adressiert eine Person (`AI/architecture.md` §7, "Where roles come from"). Aber `admin`, `teacher`, `teachers`, `student` und `students` sind reserviert; ein Anzeigename, der so heißt, wird verworfen statt zur Rolle. Ein erzeugtes Directive muss diese fünf also kennen und darf sie nicht als Namen einsetzen. Ebenso: alle Vergleiche drüben sind lowercase und getrimmt, ein erzeugter Name muss das aushalten.

**Dieser Teil geht auch ohne Backend.** Die Textmanipulation selbst funktioniert mit einer von Hand eingegebenen oder eingefügten Namensliste. Deshalb ein eigenes Proposal: es kann vorgezogen werden, wenn `plugin-admin-api-backend` sich hinzieht — und dann ist es fertig, wenn die Listen kommen.

## Entschieden (2026-08-17)

- **Die Namensliste kommt aus einem Eingabefeld im Kommando**, ein Name pro Zeile. Man kopiert die Klasse aus einer Mail oder Tabelle hinein. Keine Liste aus dem markierten Text, keine Datei im Vault — letztere wäre eine zweite Wahrheit neben dem Backend, das später ohnehin kommt.
- **Die Überschrift steht innerhalb des Blocks**, eine Ebene unter der letzten Überschrift über der Einfügestelle. Das ist keine Formatfrage, sondern eine Datenschutzfrage: der Server entfernt nur, was zwischen den Markern steht. Eine Überschrift davor bliebe jedem erhalten, und damit sähe jeder Schüler die Namen aller anderen.
- **Ein reservierter Name wird trotzdem eingesetzt**, so wie er in der Liste stand. Das korrigiert den Satz oben, das Kommando dürfe die fünf nicht als Namen einsetzen: es setzt sie ein und entscheidet nichts. Sichtbar wird die Kollision durch die Editor-Markierung, die `Students` als Rolle ausweist statt als Person — das Dokument zeigt, was der Server daraus liest, und genau dafür gibt es die Markierung.
- **Namen werden getrimmt, die Schreibweise bleibt erhalten.** `@@@ Stu Dent`, nicht `@@@ stu dent`. Der Vergleich drüben ist ohnehin lowercase, die Schreibweise ändert an der Wirkung also nichts — und ein Dokument voller kleingeschriebener Personennamen liest sich schlecht.
