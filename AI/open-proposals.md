<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Directory-Search

## Offen: Aufbewahrungsregel läuft nirgends
Die 2026-09-10 beschlossene Regel — ein föderiertes Konto verschwindet, sobald ein voller LDAP-Sync es in der Quelle nicht mehr findet (Capability `realm-directory-integrity`) — ist nicht scharf geschaltet: beide Provider stehen auf `fullSyncPeriod=-1`/`changedSyncPeriod=-1`, es läuft also kein periodischer Sync. Und Keycloaks voller Sync *entfernt* von sich aus nichts; er importiert und aktualisiert nur. Was tatsächlich aufräumt, ist der Mechanismus, der beim Provider-Split am 2026-09-13 sichtbar wurde (siehe [[keycloak-dead-federation-link-deletes-on-read]]): ein Konto, dessen Provider es nicht mehr findet, wird beim nächsten Zugriff gelöscht. Zu klären, bevor die Regel als umgesetzt gilt.

Dazu am 2026-09-13 beobachtet: **manuell ausgelöste Syncs setzen `lastSync` nicht.** Nach zwei vollen Syncs über `ldap-teachers` steht dort immer noch gar kein `lastSync`, und `ldap-students` trägt unverändert seinen Wert vom 2025-10-19. Damit ist „Sync changed users" hier kein Delta: auf `ldap-teachers` beginnt das Fenster bei 1970 (also faktisch ein Full Sync), auf `ldap-students` im Oktober 2025. Solange kein periodischer Sync läuft, ist „Sync all users" die einzige Variante mit vorhersagbarem Verhalten — bei 1.978 Konten kostet sie ohnehin nur Sekunden (heute: 3,1 s für 1.721 Studenten, 1,0 s für 250 Lehrer).

# Rendering

## Weitere Obsidian-Syntax, die der Renderer nicht kennt
Bestandsaufnahme vom 2026-11-11. Gerendert wird mit `marked` (`gfm`, `breaks`); vorher kümmert sich `preParse` nur um Permissions, Embeds (`![[…]]` auf Attachments), PlantUML, Mermaid, Wiki-Links, Callouts, Fragmente und Side-by-Side. Alles andere aus Obsidian geht roh an `marked`. Geprüft wurde mit `marked` allein, und gezählt wurde in `safeLearn/md`, `secureLectures/md` und im Nextcloud-Vault. Die meisten Treffer dort stehen in Code-Blöcken (Java-Format-Strings, `$$Lambda`, XML), echte Nutzung ist also selten. Sortiert nach Schwere:

1. **Kommentare `%%…%%` (inline und als Block) werden angezeigt.**
   *Wozu:* ein Kommentar nur für den Autor, den Obsidian beim Lesen ausblendet (im Editor sichtbar), etwa Notizen an sich selbst („hier noch Beispiel ergänzen“, „Lösung: 42“) oder auskommentierte Absätze. Er geht inline (`Text %%Notiz%% Text`) oder als Block über mehrere Zeilen zwischen zwei `%%`-Zeilen.
   *Problem:* Bei uns steht er im Fließtext, in reveal und in den Such-Snippets. Wer dort Notizen für Lehrer ablegt, zeigt sie also Schülern. Zu beachten: `%%` in Code (`"%.1f%%"`, `mvnw.cmd`) muss bleiben.
2. **Fußnoten `[^1]` mit `[^1]: Text`, Inline-Fußnoten `^[…]`.**
   *Wozu:* Anmerkungen am Seitenende, wie in wissenschaftlichen Texten. Im Text steht eine Hochzahl `[^1]`, irgendwo darunter die Definition `[^1]: Quelle: Fowler, 2002`. Gerendert wird eine verlinkte Hochzahl, und unten sammeln sich alle Fußnoten. `^[Text]` ist die Kurzform direkt an der Stelle, nummeriert wird automatisch.
   *Problem:* `marked` liest die Definition als Link-Referenz: Der Fußnotentext verschwindet, und aus `[^1]` wird ein Link auf „Text“. `^[…]` bleibt als Rohtext stehen.
3. **Mathe `$…$` / `$$…$$`.**
   *Wozu:* Formeln in LaTeX-Schreibweise. `$a^2 + b^2 = c^2$` steht im Fließtext, `$$ \frac{a}{b} $$` wird als abgesetzte, zentrierte Formel gesetzt. Gebraucht für Mathematik, Physik, Komplexität (`$O(n \log n)$`) usw.
   *Problem:* Die Formel wird nicht gesetzt, sondern als Rohtext gezeigt. Bei einer Einführung darf `$5 und $10` nicht zur Formel werden, und `$` in Code muss bleiben.
4. **Block-Referenzen `^abc123`.**
   *Wozu:* gibt einem einzelnen Absatz oder Listenpunkt einen festen Namen. Hängt `^abc123` am Absatzende, kann man von woanders mit `[[Note#^abc123]]` genau auf diesen Absatz verlinken oder ihn einbetten. Das ist feiner als ein Link auf eine Überschrift. Beim Lesen ist der Marker unsichtbar.
   *Problem:* Der Marker steht bei uns sichtbar im Text, und Links darauf springen nirgends hin.
5. **Links auf Überschriften `[[Note#Überschrift]]` und `[[#Überschrift]]`.**
   *Wozu:* `[[Note#Installation]]` führt zur Überschrift „Installation“ in einer anderen Note, `[[#Installation]]` springt innerhalb derselben Seite. Gebraucht für Inhaltsverzeichnisse und Querverweise („siehe Abschnitt X“).
   *Problem:* zu prüfen, ob das Ziel gefunden und angesprungen wird. `parseWikiLink` trennt `#` nicht ab.
6. **Notiz-Einbettung `![[Note]]` / `![[Note#Überschrift]]`.**
   *Wozu:* fügt den Inhalt einer anderen Note an dieser Stelle ein (Transklusion), mit `#Abschnitt` auch nur einen Abschnitt. So pflegt man einen Baustein einmal (eine Definition, eine Tabelle, eine Aufgabenstellung) und zeigt ihn an mehreren Stellen, etwa in Skript und Hausübung.
   *Problem:* Die Embeds lösen nur Attachments auf, eine eingebettete Notiz bleibt vermutlich als Rohtext stehen. Zu prüfen. Bei einer Umsetzung gelten die Permissions der eingebetteten Note.
7. **Text direkt über `---` ohne Leerzeile.**
   *Wozu:* In Markdown hat `---` zwei Bedeutungen. Mit Leerzeile davor ist es eine Trennlinie, in reveal bei uns ein Folienwechsel. Direkt unter einer Textzeile macht es diese Zeile zur Überschrift („Setext“-Schreibweise, ein Überbleibsel aus der Anfangszeit von Markdown).
   *Problem:* Wer zwischen zwei Folien die Leerzeile vergisst, bekommt eine `<h2>`, die niemand wollte, und vermutlich keinen Folienwechsel. Zu prüfen, wie `splitForReveal` das sieht.

Schon in Ordnung und deshalb nicht Teil des Punkts: HTML-Kommentare `<!-- … -->` (der Sanitizer entfernt sie), einklappbare Callouts `> [!info]-`, `\|` in Wiki-Links innerhalb von Tabellen, BOM und unsichtbare Zeichen am Dateianfang, und Frontmatter (eigener Change `frontmatter-properties`).
