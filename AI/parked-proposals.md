<!-- Zurückgestellte Punkte ("Back-Backlog"). Gemerkt, aber bewusst nicht aktiv verfolgt:
     meist instanzspezifisch (Daten einer bestimmten Schule/eines bestimmten AD), wofür
     safeLearn selbst kaum etwas einbauen soll. Wird beim Session-Start und bei
     "was ist zu tun?" NICHT angeboten — nur auf ausdrückliche Nachfrage.
     Format wie AI/open-proposals.md. Zurück in den Backlog = Eintrag dorthin verschieben. -->

# Directory-Search

## Lehrer ohne Namen im AD (offen)
118 Lehrer-Konten haben im AD weder `givenName` noch `sn` und erscheinen im Personen-Picker als Kennung statt als Name. Nach dem Provider-Split am 2026-09-13 neu gemessen: unverändert 118 (von jetzt 250) — es ist also eine Datenlücke im AD, kein Mapper-Problem. Zu beheben entweder an der Quelle (Gerald hat dort keinen Schreibzugriff) oder durch eine lesbarere Darstellung der Kennung im Picker.

## Alte 5. Klassen blähen die Klassenlisten auf (offen, keine Lösung in Sicht)
Im LDAP liegen in den 5. Klassen auch Schüler früherer Jahrgänge. Das ist an sich korrekt: Wer die Matura noch nicht geschafft hat oder noch nicht antreten darf, wird vom Admin nicht aus dem AD entfernt. Eine 5. Klasse hat dadurch teilweise rund 70 Mitglieder, und eine Klassenliste daraus zu erstellen wird mühsam, weil die aktuellen Schüler zwischen den Altfällen herausgesucht werden müssen. Eine Lösung gibt es noch nicht. Vorher wäre zu klären, ob das AD überhaupt ein Merkmal liefert, das aktuelle von früheren Jahrgängen unterscheidet (etwa Anlagedatum, Gruppen oder ein Attribut). Dabei nur Aggregate erheben, siehe [[pii-handling-real-data]].
