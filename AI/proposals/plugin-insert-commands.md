# Menü-Punkte zum Einfügen von Tags

Es soll Kommandos geben, die die Tags einfügen, statt sie zu tippen:

- **Side-by-side einfügen** — legt `##side-by-side-start` / `##separator` / `##side-by-side-end` um die Auswahl oder an die Cursorposition. Bei mehr als zwei Spalten entsprechend mehrere `##separator`; die Spaltenzahl soll abgefragt werden oder es gibt je einen Eintrag für zwei und drei.
- **Fragment einfügen** — `##fragment` in eigener Zeile vor dem Block.

Erreichbar über die Command-Palette und über das Kontextmenü im Editor.

Ein Detail, das drüben hängt: safeLearn setzt beim Rendern **Leerzeilen um jede Spalte**, weil der Inhalt an der Stelle noch Markdown ist und in einem HTML-Block nur geparst wird, wenn eine Leerzeile ihn von den Tags trennt (`obsidian.js`, `preprocessSideBySide`). Was das Kommando einfügt, muss zu dem passen, was der Renderer erwartet — sonst sieht es in Obsidian richtig aus und rendert drüben falsch. Beim Bauen die Funktion drüben lesen, nicht raten.

Später kommen hier die Permission-Sections dazu (siehe `plugin-section-authoring`). Das Menü sollte von Anfang an so gebaut sein, dass das reinpasst, statt zwei getrennte Menüs zu haben.

## Entschieden (2026-08-17)

- **Zwei Side-by-side-Kommandos, keines für drei Spalten.** Eines legt zwei Spalten an, ohne zu fragen — das ist der Normalfall. Eines fragt die Spaltenzahl ab, für die seltenen Fälle. Drei Spalten kommen ab und zu vor, aber nicht oft genug für einen eigenen Eintrag in der Palette, den man jedes Mal überliest.
- **Eine Auswahl wird ganz umschlossen, nicht auf Spalten verteilt.** `##side-by-side-start` davor, `##side-by-side-end` dahinter, keine Separatoren hinein. Wer mehrere Absätze markiert hat, will sie nicht an einer geratenen Stelle geteilt bekommen; die Separatoren setzt man selbst — beim n-Spalten-Kommando ist es dieselbe Regel mit n − 1 Separatoren nach dem Inhalt.
