# Verzeichnis-Abfragen im Plugin

Das Plugin fragt die Endpunkte aus `plugin-admin-api-backend` ab und macht sie bedienbar. Das ist die Seite, die ich als Lehrer sehe:

- „Liste alle Klassen" — als Kommando, das die Antwort anzeigt.
- Ein Auswahl-Menü mit Schülern, **filterbar nach Klasse**, und eines mit Lehrern.

Zwei Dinge müssen dafür geklärt werden, und beide sind offen:

- **Wie weist sich das Plugin gegenüber safeLearn aus?** Ein Token in den Plugin-Settings, ein Device-Flow gegen Keycloak, etwas anderes. Ein Token im Klartext in den Settings eines Obsidian-Plugins ist die bequeme und die schlechteste Variante — das gehört abgewogen, nicht entschieden weil es schnell geht.
- **Welche Instanz?** Die URL der safeLearn-Instanz gehört in die Plugin-Settings; sie ist pro Schule anders. Das Plugin ist bei Obsidian registriert und wird auch von Leuten installiert, die gar keine safeLearn-Instanz haben — ohne konfigurierte URL muss es sich still verhalten, nicht Fehler werfen.

Reihenfolge: nach `plugin-admin-api-backend`, ohne das hier nichts abzufragen ist.
