# Sections aus Listen erzeugen

Das ist der eigentliche Zweck der beiden Admin-Proposals: nicht Listen anschauen, sondern damit Dokumente bauen.

- **„Lege bitte eine Private Section pro Schüler der Klasse XYHIF in diesem Dokument an."** Für jeden Schüler ein `@@@ <name>` / `@@@`-Block, in der Reihenfolge der Liste, mit einer Überschrift dazwischen.
- **„Diese Section ist nur sichtbar für: …"** Ein Auswahlmenü über Schüler (filterbar nach Klasse) und Lehrer, das aus der Auswahl das Directive baut und um die markierte Stelle legt.

Ein Detail, das von hier kommt und leicht kaputtgeht: der **Name** eines Users wird drüben als Rolle behandelt — `@@@ Stu Dent` adressiert eine Person (`AI/architecture.md` §7, "Where roles come from"). Aber `admin`, `teacher`, `teachers`, `student` und `students` sind reserviert; ein Anzeigename, der so heißt, wird verworfen statt zur Rolle. Ein erzeugtes Directive muss diese fünf also kennen und darf sie nicht als Namen einsetzen. Ebenso: alle Vergleiche drüben sind lowercase und getrimmt, ein erzeugter Name muss das aushalten.

**Dieser Teil geht auch ohne Backend.** Die Textmanipulation selbst funktioniert mit einer von Hand eingegebenen oder eingefügten Namensliste. Deshalb ein eigenes Proposal: es kann vorgezogen werden, wenn `plugin-admin-api-backend` sich hinzieht — und dann ist es fertig, wenn die Listen kommen.
