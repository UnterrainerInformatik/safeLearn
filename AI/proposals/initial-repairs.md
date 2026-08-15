# Initial Repairs
Im architecture.md in der section Observations has Du folgende Punkte:

- Reveal.js läuft in zwei Welten: package.json deklariert ^5.0.5 (gelockt auf 5.2.1), aber wrapInReveal lädt Reveal 3.7.0 von jsDelivr — CSS, Theme, JS, Notes-Plugin. Das npm-Paket wird nie referenziert. Die Präsentationsansicht hängt damit zur Laufzeit an einem externen CDN und an einer acht Jahre älteren Major-Version.
- express.static liegt auf dem Applikationsverzeichnis (app.js:332). Jeder authentifizierte User kann /app.js, /utils.js, /obsidian.js und — sofern die Datei neben app.js liegt — /keycloak.json samt Client-Secret abrufen. Das Repo selbst ist sauber: Root-keycloak.json ist gitignored, die getrackten wysiwyg-container-*/keycloak.json enthalten nur Platzhalter.
- Session-Secret ist hartcodiert in keycloak-middleware.js:53, identisch in jedem Deployment aus dieser Quelle. Dazu MemoryStore als Session-Store.
- /hot-reload ist vor checkAuthenticated registriert und damit unauthentifiziert erreichbar (liefert nur Pfade und Reload-Typ, keinen Inhalt).
- docs-permissions.md sagt „There is no role student" — getLdapGroups mappt OU Students aber explizit auf student.
- wrapInReveal verlinkt /obsidian-page.css, das es nicht gibt; jede Präsentation feuert einen Request ins Leere.
- Dazu cors deklariert aber nie importiert, safe-learn als eigene Dependency, .nvmrc: 20 vs. Dockerfile: node:25.6.0, ein paar tote Exports und sechs weitere Doku/Code-Divergenzen.

Davon streiche bitte /hot-reload raus. Das ist Absicht und bleibt so.

Die anderen Dinge kannst du bitte als propose verpacken und reparieren.