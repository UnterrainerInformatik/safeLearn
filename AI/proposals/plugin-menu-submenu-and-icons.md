# Die Insert-Einträge in ein eigenes Untermenü, mit Icon

Das Kontextmenü des Editors gehört Obsidian, und andere Plugins schreiben da auch hinein. Die safeLearn-Kommandos stehen heute als flache Liste darin — über `menu.addItem(...).setSection("safelearn")`, also in einem eigenen Abschnitt, aber auf derselben Ebene wie alles andere. Bei fünf Einträgen ist das schon die Hälfte des Menüs, und jeder einzelne davon ist etwas, das ein Lehrer selten braucht.

Was sich ändern soll:

- **Ein Untermenü `safeLearn >`.** Ein Eintrag im Hauptmenü, alles andere darunter. Wer nichts von safeLearn will, liest eine Zeile statt fünf.
- **Jeder Eintrag bekommt ein führendes Icon.** Obsidian liefert dafür Lucide-Namen an `setIcon(...)`; das Repo hat mit `lucide-static` schon eine Abhängigkeit auf denselben Satz, das ist also kein neuer Namensraum, den jemand erfinden muss.

Was dabei zu klären ist:

- **Die Kommando-Palette bleibt flach.** Sie kennt keine Untermenüs, und `AUTHORING_COMMANDS` speist heute beide Oberflächen aus einer Liste — genau damit keine Oberfläche einen Eintrag hat, den die andere nicht hat. Ein Untermenü darf diese eine Liste nicht in zwei aufteilen; das Icon und die Schachtelung gehören an die Liste, nicht neben sie.
- **Der Check, der beide vergleicht, muss mitwachsen.** `every command Obsidian holds for this plugin is in the editor's context menu` (`test/obsidian/plugin.test.js`) liest heute `.menu .menu-item .menu-item-title` und findet die Einträge, weil sie im Hauptmenü stehen. Sobald sie eine Ebene tiefer liegen, findet er nichts mehr und wäre grün, ohne irgendetwas zu prüfen — das ist der Fehlermodus, gegen den der Check überhaupt geschrieben wurde. Er muss das Untermenü aufklappen.
- **Welches Icon wofür**, und ob ein Eintrag ohne passendes Icon lieber gar keines bekommt als ein beliebiges.

Reihenfolge: unabhängig von allem anderen; berührt nur `onload` und die Kommando-Liste in `main.ts`.
