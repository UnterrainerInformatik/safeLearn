# Der Insert-Button klebt am Eingabefeld

Beide Dialoge des Plugins bauen ihren Inhalt als Folge von Elementen direkt in `contentEl`: Überschrift, Eingabefeld, Button. Dazwischen steht nichts — `ColumnCountModal` (`main.ts`) setzt Feld und Button unmittelbar nacheinander, `NameListModal` genauso mit einer `textarea` statt des Zahlenfelds. Auf dem Bildschirm berührt der Button die Unterkante des Felds.

Das ist eine Kleinigkeit und trotzdem eine, die man bei jeder Benutzung sieht: es liest sich nicht als „hier eingeben, dann bestätigen", sondern als ein zusammengewachsenes Element, und beim Klicken trifft man leicht daneben.

Was zu klären ist:

- **Wo der Abstand herkommt.** Obsidian hat für Dialog-Buttons eine eigene Form — `new Setting(contentEl).addButton(...)`, beziehungsweise ein `modal-button-container` — die von der Theme-Gestaltung des Nutzers mitgetragen wird. Ein `style.marginTop` im Code wäre der schnelle Weg und der, der in jedem zweiten Theme wieder falsch aussieht. Das gehört abgewogen, nicht entschieden, weil es schneller geht.
- **Ob beide Dialoge dieselbe Form bekommen.** Sie stellen unterschiedliche Fragen — eine Zahl, eine Namensliste — aber sie sind beide „ein Feld und eine Bestätigung", und zwei verschiedene Layouts dafür wären eine Unterscheidung ohne Aussage.
- **Was ein Check dazu sagen kann.** `test/obsidian/plugin.test.js` bedient beide Dialoge bereits (`answerColumnCount`, `answerNameList`) und findet Feld und Button über `.modal-container input` beziehungsweise `.modal-container button`. Wenn der Button in einen Container umzieht, müssen die Helfer ihn dort finden. Und was hier eigentlich behauptet wird, ist eine Geometrie — dass zwischen den beiden Kästen Platz ist — also liest sich das wie `columnsAreSideBySide`: die gelegten Boxen, nicht die Klassenliste.

Reihenfolge: unabhängig von allem anderen; berührt nur die beiden Modal-Klassen in `main.ts` und gegebenenfalls `styles.css`.
