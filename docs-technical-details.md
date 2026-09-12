Here you find in-depth information about some of the technical background behind the scenes.

[Back](README.md) to the main page.
## MD-File Conversion
This is done using [marked](https://www.npmjs.com/package/marked) which is installed on the web-server (via `package.json`).
With the help of this you can link to any MD-file and show it in the context of your site.
Just put a link into your [Asciidoc](https://asciidoctor.org/) page like this:
```http
link:https://htl.unterrainer.info/convert?url=https%3A%2F%2Fhtl.unterrainer.info%2Fmd%2Fmy-md-file.md[SHOW an MD-file]
```
The Converter will download it for you and display the converted HTML-content.
Or, even simpler, you may call an MD-file on this server like this:
```http
https://htl.unterrainer.info/md/some-readme.md
```
This would start the conversion and the file will be served in HTML format displaying the above link in the browser window's location bar.

There are different ways to call MD-files here:
## Direct Call
You can directly call any MD files (ending on .md) on the server.
NodeJS will convert it automatically and present the conversion-result (HTML) instead.
### GET url
There is a specific `GET` endpoint that takes the `URL` of your MD-file and delivers the converted `HTML` page including full `html` and `body` tags.
Example:
```http
GET http://htl.unterrainer.info/convert/?url=https%3A%2F%2Fraw.githubusercontent.com%2FUnterrainerInformatik%2Fcheatsheets%2Fmaster%2Flinux_cheat_sheet.md
```
### POST url
This endpoint can be used to get the conversion of the given `URL` without wrapping any of it in additional tags. This output is nice, if you'd like to load and convert an MD-file on the internet and have the result in your JavaScript in a variable.
It returns a JSON object containing a single field `html`.
Example:
```http
POST http://htl.unterrainer.info/convert
{
  "url": "https://raw.githubusercontent.com/UnterrainerInformatik/cheatsheets/master/linux_cheat_sheet.md"
}

# which will return the following object:
{
  "html": "..."
}
```
### POST content
This endpoint can be used to get the conversion of the given MD-content without wrapping any of it in additional tags. This output is nice, if you'd like to load and convert an MD-file you have available as a string and have the result in your JavaScript in a variable.
It returns a JSON object containing a single field `html`.
Example:
```http
POST http://htl.unterrainer.info/convert
{
  "content": "# TEST\n\nThis is a test file.\n\n## Subtitle"
}

# which will return the following object:
{
  "html": "..."
}
```
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
When you have a look inside the code, you'll find that the file `obsidian.js` prepares a page in a very particular way before it is rendered to HTML-output. Here I want to document that pipeline.

1. File is loaded from disk (`app.js`)
2. Accesstoken is refreshed, so it and all contained roles and attributes are actually current
3. `preParse` is called preparing the content for HTML-conversion
	1. `removeForbiddenContent` parses for file- and inline-permissions and removes forbidden parts of the file
	2. `preReplacePlantUml` replaces the code tags containing PlantUML-code with a rendered version of it by calling a proper PlantUML conversion service and inserting the SVG of that output here instead of the code-tags
	3. `preMarkCode` parses the file for code-marks (cannot be nested) and replaces them for later use of the marks (the content of the code-tags parsed is saved in an array for later insertion)
	4. `preReplaceObsidianFileLinks` replaces Obsidian- (or Wiki-) style links with proper links your browser can understand
	5. `preMarkCallouts` parses for callouts (may be nested) and replaces their tags inline with appropriate start- and end-tags of our own
	6. `unmarkCode` replaces the code-marks by the content of the previously saved array
4. `manipulateHtml` is called actually converting the file
	1. `replacePreMarkCallouts` renders the proper callouts pre-marked earlier on
	2. `replaceObsidianImageLinks` deals with the Obsidian- (or Wiki-) specific image links (shortform) by expanding that into a proper image-tag
	3. `replaceObsidianImageLatResizeValues` deals with the conditional image resizing described in the Obsidian-specific document [here](docs-obsidian)
	4. `makeContentMap` generates the map of the files' content later on displayed on the left navbar
5. `DOMPurify.santitize` is called before sending the response to the client
## Directory API
Two endpoints back the Obsidian plugin's directory features (the person picker, "List classes" and "Show directory info"). Both are registered ahead of the browser-session gate and identify their caller from a bearer access token instead, introspected against Keycloak; both refuse anyone but a teacher or an admin with a bare `403`. See [Directory search client](docs-keycloak) for the two Keycloak identities involved.

### GET /api/admin/directory/search
```http
GET /api/admin/directory/search?q=gera
Authorization: Bearer <access token>
```
`q` is matched case-insensitively against a person's display name *or* any role/group value the directory holds for them (a class name, `teacher`, `examParticipant`, ...). An empty `q` returns the whole directory, which is what "List classes" and the class filter build on. A match carries a display name and a role/group map, and nothing else the directory knows about that person.

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
