Here you find in-depth information about some of the technical background behind the scenes.

[Back](README.md) to the main page.
## MD-File Conversion
This is done using [marked](https://www.npmjs.com/package/marked) which is installed on the web-server (via `package.json`).
You call an MD-file on this server like this:
```http
https://htl.unterrainer.info/md/some-readme.md
```
This starts the conversion, and the file is served in HTML format with the above link in the browser window's location bar.
Any file of the corpus ending on `.md` can be called this way. The server only renders its own corpus files; it does not fetch and convert Markdown from another address.
## Adding Fonts
There are two different directories, where you may copy your TrueType-fonts (`*.ttf`) to.
`/assets/main-fonts/` for fonts that will be available for the main-view.
`/assets/nav-fonts/` for fonts that will be available for the nav-view.

Just copy your desired fonts in there and they will be automatically available upon rebuild.
The display-name will be the file-name bar the extension.
Feel free to rename the files accordingly, but keep in mind that some TTF-fonts don't like that and will stop working (Dyslexia 3 is such an example, hence the long unwieldy name).

The preferences hold the index to the desired font. So you may move some fonts around when adding some, since they will be loaded in directory-order (mostly alphabetically).

Two kinds of file in those directories are not offered as a font, so that they don't take up an index and move everybody's stored preference:

* Anything that is not a `*.ttf`. A licence text placed next to a font (`Lato-OFL.txt`) is not a font.
* A weight-variant, written as the family-name, a dash and the numeric weight (`Lato-300.ttf`, `Lato-700.ttf`). Those are there for a stylesheet that asks for the family and the weight itself — the presentation theme does — and not for the picker, which offers families. `OpenDyslexic3-Regular.ttf` is a family and not a variant; what marks a variant is the number.
## Print Document as PDF
You should open your document in the web-browser and then click on the `presentation` button in the upper right corner.
This should open your document as presentation.
You can now add the parameter `print-pdf` to the path-string like so:
```http
https://safelearn.unterrainer.info/md/presentations/test-presentation.md?reveal=true&print-pdf
```
This then renders your RevealJS presentation as a continuous page that you may print as PDF or on whatever printer you have currently installed.
## Render-Pipeline
When you have a look inside the code, you'll find that the file `obsidian.js` prepares a page in a very particular way before it is rendered to HTML-output. That pipeline — from the three ways Markdown reaches the server to the four ways the finished HTML leaves it — is documented [here](docs-render-pipeline.md).
## Directory API
Two endpoints back the Obsidian plugin's directory features (the person picker, "List classes" and "Show directory info"). Both are registered ahead of the browser-session gate and identify their caller from a bearer access token instead, introspected against Keycloak; both refuse anyone but a teacher or an admin with a bare `403`. See [Directory search client](docs-keycloak) for the two Keycloak identities involved.

### GET /api/admin/directory/search
```http
GET /api/admin/directory/search?q=gera
Authorization: Bearer <access token>
```
`q` is matched case-insensitively against a person's display name *or* any role/group value the directory holds for them (a class name, `teacher`, `examParticipant`, ...). An empty `q` returns the whole directory, which is what "List classes" and the class filter build on. A match carries a display name, the given name and surname it is made of, the person's e-mail address and a role/group map, and nothing else the directory knows about that person:

```json
[
  {
    "name": "Anna Maria Gruber",
    "firstName": "Anna Maria",
    "lastName": "Gruber",
    "email": "anna.gruber@example.org",
    "roles": { "2B": true, "student": true }
  }
]
```

`firstName`/`lastName` are there so the plugin can write chosen people in surname order without splitting the display name, which misfiles every two-word surname. `email` is the one field that shows more than the display name does. It is returned deliberately, for the plugin's "Invitation list…", which writes chosen people with their addresses: it is the institutional address, and only a teacher or admin may search at all. A part or an address the directory does not hold comes back as `""`, never omitted.

It answers one of three ways:

* `200` with the array of matches. An array is what a *successful* search answers with — an empty one means the query matched nobody.
* `202` with the status payload below, when the server has no directory data to match against yet. This is not an error and not an empty match: the server is fetching the realm, which against a realm of ~14,000 LDAP-federated users takes minutes. The request is deliberately **not** held open for that — it used to be, and a reverse proxy in front of the deployment would sever it long before the fetch finished. Repeat the same request unchanged; it answers `200` once the fetch completes. A caller that has data but whose copy is past its refresh interval still gets `200` from that copy, with a refresh started behind the answer rather than in front of it.
* `403` for a caller that is not a teacher or an admin, including one presenting no token or an expired one — the refusals are deliberately indistinguishable from each other.

A `502` means the search itself failed server-side, which is distinct from all of the above.

### GET /api/admin/directory/status
```http
GET /api/admin/directory/status
Authorization: Bearer <access token>
```
Reports what state the directory data is in, and how far along any fetch of it has got, without transferring the directory itself. It reads the server's own memory: no Keycloak call, no disk access, and it never starts a fetch — so it is safe to poll while waiting on one, which is exactly what the plugin does.

```json
{
  "fetching": true,
  "phase": "roles",
  "done": 1712,
  "total": 14289,
  "startedAt": 1757683200000,
  "entries": null,
  "builtAt": null,
  "skipped": 0
}
```

* `phase` is `idle` (nothing running), `counting` (asking Keycloak for its user count and deciding whether the cache can be reused), `entries` (paginating the realm's users) or `roles` (resolving each user's role-mappings). `fetching` is simply `phase !== "idle"`.
* `done`/`total` are the raw figures for the current phase, not one blended percentage — the two phases' relative cost differs per realm, and a bar weighted for one of them would stall and then leap on the other. `total` is `null` while the phase does not know it yet (`counting`), rather than being guessed.
* `entries`, `builtAt` and `skipped` describe the data currently held: how many entries, when it was actually built (not when it was last adopted from disk), and how many records had to be skipped while building it. `entries` and `builtAt` are `null` when nothing is held at all. `skipped` is a count only — the records behind it are named in the server's log, never in an answer.

The same `403` as the search endpoint, for the same reasons.
