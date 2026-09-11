<!-- Offene Punkte, die noch nicht zu einem OpenSpec-Change geworden sind.
     Format: # <Kategorie>, darunter ## <Titel>, gefolgt von einer freien Beschreibung.
     Ein Eintrag wird gelöscht, sobald daraus ein Change unter openspec/changes/ entstanden ist
     (der Change trägt dazu die Zeile "Source: AI/open-proposals.md" in proposal.md). -->

# Darstellungsfehler

## Parsing Fehler bei End @@@ Block
 Wenn nach einem Block mit @@@ kein Enter mehr nach dem End-token kommt, wird dieser nicht als solcher erkannt und es erscheint ein @@@ im Text-Rahmen. Beispiel:
 ```text
{at}{at}{at} gerald
{at}{at}{at}{EOF}
 ```

## Anzeige Schülerblock
wenn ich einen Block einfüge pro Namen (Schülerblöcke einer Klasse einfügen), dann machst Du eine ### Überschrift mit dem Namen der Person rein. Lass das. Lass ihn leer (eine Leerzeile reicht als Inhalt des eingefügten Blocks), weil die UI ist jetzt schon so gut mit unserem Plugin, dass man das auch so ohne erkennt und der Schüler weiß eh wie er heißt :)

# Allgemein
