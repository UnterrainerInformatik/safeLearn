# Der Anmelde-Vorgang muss sichtbar sein

Ich wollte mich im Plugin anmelden, um an die Klassen auf dem Server zu kommen. Im Browser war ich an safeLearn bereits angemeldet. Die Login-Seite ging auf, der Browser sprang sofort zurück zu Obsidian — und dort stand weiter nur „Login". Nochmal geklickt, dasselbe. Ich habe den Laptop zugeklappt und in der Arbeit wieder aufgemacht: da stand „angemeldet", und die Klassen waren da.

Die Anmeldung hatte also von Anfang an funktioniert. Nur hat es mir niemand gesagt, und das ist der eigentliche Fehler. Der akute Fall — der Settings-Tab wird nach dem Callback nicht neu gezeichnet — ist bereits behoben; der Tab zeichnet sich jetzt neu und meldet Erfolg wie Misserfolg. Aber das war ein Pflaster auf einer Stelle, und ich will den ganzen Vorgang wasserdicht:

- **Ich muss zu jedem Zeitpunkt wissen, wo ich stehe.** Nicht angemeldet. Anmeldung läuft (seit wann, gegen welche Instanz). Angemeldet, als wer. Angemeldet, aber ohne die Rolle, die das Verzeichnis verlangt. Fehlgeschlagen. Fünf Zustände, jeder benannt — nicht ein Knopf, der einmal „Login" und einmal „Log out" heißt und dazwischen nichts sagt.
- **Wenn etwas schiefgeht, muss dastehen, was.** Der Callback ist nie angekommen. Das `state` hat nicht gepasst (die Anmeldung ist in einem anderen Vault gelandet — das passiert bei `obsidian://` regelmäßig und sieht heute aus wie „nichts passiert"). Keycloak hat den Token-Tausch abgelehnt, mit Status. Die Keycloak-URL oder der Realm stimmen nicht. Der Redirect ist am Client nicht eingetragen. Heute landet all das im Developer-Log, wo es niemand sucht.
- **Wiederholen muss einfach sein.** Ein erreichbarer „Nochmal anmelden"-Knopf, egal in welchem Zustand ich hänge. Eine laufende Anmeldung abbrechen können. Und eine Anmeldung, die nie zurückkommt, muss von selbst verfallen statt für immer als offen in `pendingLogins` zu stehen.

Offen und zu klären, bevor das gebaut wird:

- **Wo steht der Zustand, wenn der Settings-Tab zu ist?** Ich klicke „Login" im Settings-Tab, aber der Callback kann Minuten später kommen, und dann schaue ich woanders hin. Statusleiste, Notice, beides — das gehört entschieden, nicht nebenbei gemacht.
- **Wie unterscheidet man „Callback kam nie an" von „ist in einem anderen Fenster gelandet"?** Ein Timeout ist die einfache Antwort und vielleicht die falsche: der Vault, der den Callback bekommen hat, weiß mehr als der, der wartet. Ob die beiden voneinander wissen können, weiß ich nicht.
- **Wie viel darf angezeigt werden?** `plugin-directory-auth` macht die Antwort des Servers absichtlich ununterscheidbar — „nicht angemeldet" und „keine Rolle" sehen für das Plugin gleich aus. Was das Plugin *selbst* weiß (kein Token gehalten, Server nicht erreichbar, Keycloak hat mit Status X abgelehnt), darf es sagen, ohne dass diese Eigenschaft fällt. Wo genau die Grenze verläuft, gehört aufgeschrieben statt jedesmal neu abgewogen.
