Here you find in-depth information about some of the technical background behind the scenes.

[Back](README.md) to the main page.
## MD-File Conversion
This is done using [marked](https://www.npmjs.com/package/marked) which is installed on the web-server (via `package.json`).
With the help of this you can link to any MD-file and show it in the context of your site.
Just put a link into your [Asciidoc](https://asciidoctor.org/) page like this:
```bash
link:https://htl.unterrainer.info/convert?url=https%3A%2F%2Fhtl.unterrainer.info%2Fmd%2Fmy-md-file.md[SHOW an MD-file]
```
The Converter will download it for you and display the converted HTML-content.
Or, even simpler, you may call an MD-file on this server like this:
```bash
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
```bash
GET http://htl.unterrainer.info/convert/?url=https%3A%2F%2Fraw.githubusercontent.com%2FUnterrainerInformatik%2Fcheatsheets%2Fmaster%2Flinux_cheat_sheet.md
```
### POST url
This endpoint can be used to get the conversion of the given `URL` without wrapping any of it in additional tags. This output is nice, if you'd like to load and convert an MD-file on the internet and have the result in your JavaScript in a variable.
It returns a JSON object containing a single field `html`.
Example:
```bash
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
```bash
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
## Print Document as PDF
You should open your document in the web-browser and then click on the `presentation` button in the upper right corner.
This should open your document as presentation.
You can now add the parameter `print-pdf` to the path-string like so:
```bash
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