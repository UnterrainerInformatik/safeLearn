# API-Admin und Verzeichnis-Endpunkte in safeLearn

Damit das Plugin später Klassen- und Schülerlisten anbieten kann, muss es sie von irgendwo bekommen. Das Backend hier soll sie liefern. Das ist ein Proposal für **dieses** Repo, auch wenn es den `plugin-` Prefix trägt — es existiert nur, weil das Plugin es braucht.

Was dazugehört:

- **Ein OAuth-Client mit API-Admin-Rechten** gegen Keycloak. Ein eigener Zugang, nicht die Session eines angemeldeten Lehrers: die Abfrage geht übers Verzeichnis, nicht über den, der gerade eingeloggt ist.
- **Endpunkte**: alle Klassen auflisten; alle Schüler einer Klasse; alle Lehrer. Quelle sind dieselben LDAP-Gruppen, die `getLdapGroups` (`middlewares/keycloak-middleware.js`) heute schon pro Session ausliest — hier aber verzeichnisweit statt für den einen User.
- **Deployment-Surface**: das ist eine neue Oberfläche an einem Server, dessen veröffentlichte Fläche bewusst eng gehalten ist. Es gibt dafür eine eigene Capability und `test/checks/deployment-surface.js` prüft sie. Jeder neue Endpunkt muss dort mitgedacht und mitgeprüft werden, nicht nachträglich.
- **Wer darf das aufrufen** gehört ins Design, nicht in die Implementierung. Ein Endpunkt, der Schülerlisten herausgibt, ist etwas anderes als einer, der eine Seite rendert.

Datenschutz: Schüler- und Klassenlisten sind personenbezogene Daten. Was die Endpunkte herausgeben (Namen? Ganze Verzeichniseinträge?) und wer sie sehen darf, muss vor der ersten Zeile Code beantwortet sein.

Ohne dieses Proposal sind `plugin-admin-directory-ui` und der Listen-Teil von `plugin-section-authoring` nicht baubar.
