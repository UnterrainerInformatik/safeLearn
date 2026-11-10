<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Rendering

## Frontmatter (Obsidian-Properties) nicht anzeigen
Markdown-Files mit YAML-Frontmatter (Obsidian „Properties“) zeigen diesen Block beim Rendern als HTML-Seite und als reveal-Präsentation sichtbar an. Beispiel aus secureLectures: `homework/WMC/GRULE/Hausübung 1 - 4AHIF - Ausgabe 2026-11-10 - Abgabe 2026-12-08.md` beginnt mit

```yaml
---
lang: de-AT
klasse: 4AHIF
nummer: 1
ausgabe: 2026-11-10
abgabe: 2026-12-08
fach: "WMC4 - Web and Mobile Computing"
footer: "4AHIF - WMC4 - Hausübung 1"
punkte: 40
themen:
  - Quarkus - Fundamentals
  - ...
---
```

Diese Properties sind Metadaten (z. B. für die PDF-Erzeugung), kein Inhalt. Im App-Code (`app.js`, `obsidian.js`, `obsidian-page.js`, `utils.js`) gibt es derzeit keinerlei Frontmatter-Behandlung — markdown-it macht aus dem öffnenden `---` vermutlich ein `<hr>` und aus den Zeilen bis zum schließenden `---` eine Setext-Überschrift (`<h2>`). Gewünscht: ein Frontmatter-Block ganz am Dateianfang wird vor dem Rendern entfernt, sowohl im HTML- als auch im reveal-Pfad (bei reveal wäre `---` sonst zusätzlich ein Folientrenner). Zu klären: ob Suchindex und WYSIWYG-/Exam-Pfade denselben Strip brauchen, und ob einzelne Properties später doch genutzt werden sollen (z. B. `lang`, `footer`).
