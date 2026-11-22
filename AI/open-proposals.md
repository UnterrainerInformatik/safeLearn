<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Permissions

## Fences verschachteln oder kombinieren
`@@@`-Blöcke lassen sich heute weder verschachteln noch sinnvoll kombinieren:

- **Verschachteln ist ausgeschlossen.** So steht es in der Spec `permission-block-grammar`, Requirement „Stray and nested markers do not shift later blocks“, und in `docs-permissions.md` (Abschnitt „Where a block begins and ends“). Eine öffnende Zeile innerhalb eines Blocks öffnet nichts und wird verschluckt. Der Block endet an der ersten Zeile, die nur `@@@` enthält. Mit diesem Schließer ist Verschachteln grundsätzlich mehrdeutig: Man bräuchte unterscheidbare Schließer, etwa eine Tiefe über die Anzahl der `@`, oder benannte Schließer. Server und Obsidian-Plugin müssten die Änderung gleich lesen.
- **Kombinieren in einem Fence hat eine Falle.** In `utils.js` `hasRoles` überschreibt jeder `#`-Marker eines Fences das Ergebnis des vorigen (`clientAccess = …` in der Schleife über `clientViews`), statt mit ihm UND-verknüpft zu werden. `@@@ #exam #answer` wird also nur nach `#answer` entschieden. Wer kombiniert, bekommt still etwas anderes, als er geschrieben hat.

Anlass (2026-11-22): die Diskussion über die Umbenennung von `#exam`/`#practice`/`#answer` nach Sichtbarkeit statt nach Inhalt (Kandidaten `#private`/`#public` als Umschalt-Paar und `#answer` bzw. `#spoiler` zum Ein- und Ausblenden). Eine Lösung, die nur der Lehrer sieht, also „privat UND Antwort“, ließe sich mit Kombinieren oder Verschachteln ausdrücken statt mit einem eigenen Marker. Zu klären: ob Verschachteln überhaupt gewollt ist oder ob ein UND im selben Fence reicht, und wie sich die `#`-Marker mit Rollen und Klassen verknüpfen (z. B. `@@@ 4ahif #answer`). Mindestens die stille Überschreibung sollte weg, entweder als UND oder als Fehler.
