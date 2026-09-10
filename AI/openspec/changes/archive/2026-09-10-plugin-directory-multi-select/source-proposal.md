# Verzeichnissuche: vollständig, durchsuchbar, mehrfach auswählbar

Das Klassen-Dropdown hatte 10 Einträge. Es gibt über 30 Klassen. Die Suche hat auch nur innerhalb dieser 10 überhaupt etwas gefunden — was von außen wie „den Schüler gibt es nicht" aussieht und nicht wie „ich habe nur ein Zehntel des Verzeichnisses angeschaut".

Die Ursache ist gefunden und behoben: Keycloaks Admin-API liefert ohne `max` genau die ersten 100 Benutzer und sagt nicht dazu, dass es mehr gibt; der Server hat genau eine Seite geholt und das für das ganze Verzeichnis gehalten. Das ist repariert (der Server blättert jetzt durch), aber es war monatelang unsichtbar falsch, und ein Test, der es beim nächsten Mal auffallen lässt, fehlt bis heute. Darum steht es hier mit drin.

Was ich darüber hinaus brauche, damit der Dialog benutzbar ist:

- **Die Klassenauswahl muss selbst durchsuchbar sein.** Bei über 30 Klassen ist ein `<select>` zum Scrollen kein Auswahlmenü mehr. Ich will „1AH" tippen und die Liste schrumpfen sehen.
- **Mehrfachauswahl bei den Namen.** Ich mache in einem Dokument vier Schüler-Sections. Heute klicke ich ein Ergebnis an, es hängt einen Namen unten an, ich suche neu, ich klicke wieder. Ich will die vier Treffer markieren und alle vier auf einmal übernehmen.
- **Mehrfachauswahl bei den Klassen.** Ich will Sections für 1AHIF *und* 2AHIF. Der Filter kennt heute genau eine Klasse oder „alle".
- **Wenn die Verbindung nicht steht, muss das sofort dastehen.** Nicht erst, wenn ich auf „classes" drücke und nichts kommt. Beim Öffnen des Dialogs gehört sichtbar gemacht, ob das Verzeichnis erreichbar ist — und wenn nicht, warum nicht.

Offen und zu klären:

- **Was heißt „mehrere Klassen" für die Abfrage?** Der Server nimmt genau eine Suchzeichenkette und matcht sie gegen Namen *oder* Rollen; ein „diese Klasse UND jene" gibt es dort nicht. Entweder das Plugin fragt mehrfach und legt zusammen, oder der Endpunkt lernt mehrere Werte. Das erste ist billiger, das zweite ehrlicher — das gehört abgewogen.
- **Wie sieht Mehrfachauswahl aus, ohne den Dialog umzubauen?** Das Textfeld darunter ist die einzige Eingabe, die garantiert immer funktioniert (ein Gast oder ein noch nicht eingetragener Schüler steht in keinem Verzeichnis), und `plugin-verification` findet Feld und Bestätigungsknopf über „das erste `input`/`textarea`" und „der erste `button`" im Dialog. Checkboxen oder ein „Alle übernehmen"-Knopf treten da hinein. Die Prüfungen dürfen dabei nicht stillschweigend das Falsche finden.
- **Wie viel darf der Verbindungszustand verraten?** Dieselbe Grenze wie beim Anmelde-Vorgang: „nicht angemeldet" und „keine Lehrer-/Admin-Rolle" sind von der Antwort des Servers absichtlich nicht zu unterscheiden. „Instanz nicht erreichbar" und „Verzeichnis-Abfrage ist am Server gescheitert" sind es sehr wohl, und das ist genau das, was ich sehen will.
