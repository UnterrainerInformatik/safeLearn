# SafeLearn Repository
As a teacher you probably have to cover a vast field of expertise and to keep up with changes in this very field, constantly updating your teaching materials. Most of the time your materials are scattered over a number of formats and platforms, which doesn't exactly make things easier.

This project is the attempt to unify all teaching materials using Markdown and Obsidian as an editor while using this site as a reader for the students.
As a reader for students it has various benefits, such as responsive design allowing the use of a mobile phone when learning, or customizability of the look-and-feel to suit various tastes.

### Features for Teachers
* One platform for all teaching materials
* Everything is Markdown
* Presentations with Reveal.sj
* One Editor (Obsidian) that's...
	* Cool
	* Really good
	* Completely free
* Customizable document-reading-permissions
	* Show documents to different classes
* Customizable content-reading-permission within a document
	* Hide teacher-notes from students
	* Generate different views on a document to keep exam-questions, answers and testing-questions together in one document.
* Full Obsidian-flavor Markdown support
* Switch between teacher- and student-view
### Features for Students
* Availability
	* Teaching materials are always up-to-date
	* Can be read everywhere and anytime
		* Read up if they miss a lecture
		* Read ahead if something is interesting
* Accessibility
	* From everywhere (web)
	* On any computer
	* On all mobile phones or tablets
* Remember last opened page
* Automatic Table Of Content
* Customizable
	* Font
	* Font-size
	* Line-spacing
	* Light-Mode / Dark-Mode

## Technical Explanation
The purpose of this repository is to provide a platform for all lecture-notes and interactive material for the teacher and students.
It hides behind a configurable Keycloak Authorization Server (version >16 as far as I can tell, most current version is recommended) and thus your material is not publicly available, circumventing various license's restrictions.

The reason why it has its own server is because of server-side authentication as opposed to client-side. When doing client-side you'll send the contents anyways, but hide them until the user is authenticated. That, of course, doesn't help at all avoiding any crawlers looking for unlicensed images. In order to do that you have to go server-side authentication which means that you're not sending anything as long as the user is not authenticated. That, of course, may only be achieved by manipulating the server itself, which sadly is not possible with Github Pages (at least not without a costly Enterprise subscription).

### How To Install
Just fork this repository and adapt it to your needs.
More in the `How To Build / Update`-section of this document.
Don't be afraid! It looks more complicated than it really is. To get it up and running you just have to:
* Get a machine somewhere you have access to
	* A server in your basement (a Raspi4 maybe)...
	* some VM at https://hetzner.com, World4You or the likes
		* Just has to run some Linux with docker installed
* Fork
* Set `action secrets` according to your deployment
* Prepare the deployment-directory on your server
	* create it
	* permissions
* Start the GitHub-action

## Obsidian
As you will probably recognize on your own, the `marked` converter on this site was designed with [Obsidian](https://obsidian.rocks) as an editor in mind.
It is extended so that it supports most of the features `Obsidian` does.
So there are some intricacies you should be aware of when working with it and serving it with this project.
### Recommended Plugins
* Paste URL Into Selection
	* This allows you to paste an URL while having text selected. The selected text will be the link-text in your inserted link.
* PlantUML
	* Just start a code-block and select `plantuml` as the language. Then start plotting your diagram as you'd do in every other editor.
	  If you like a scroll-linked side-by-side view of your edit- and a read-view, just click on the vertical three-dots-button in the top-right corner and select `Reading-view` while holding `CTRL/CMD`
	* The renderer uses the server `https://plantuml.unterrainer.info/plantuml` by default.
	  If you'd like to use any other server, set your secret accordingly.
	  
### Globally Unique File Names
Obsidian uses quick-links like so:
```markdown
# The next line will insert a link to a file.
[[md-file-name-without-extension]]

# The next line will insert an image.
![[image-file-name-with-extension]]
```

In order to be able to do that, you are not allowed to have two files with the exact same file-name within a vault. Even if they are located in different directories.
Same goes for images and other assets.
If you have two files, for example, named `test`, then you'll have to add the complete path in links to any of the two `test` files.

So plan your file-names carefully.
You'll be rewarded with a much faster and smoother editing-experience.

### Security
To restrict the visibility of a whole file or parts of a document's content and therefore effectively hiding it from anyone not having any of the given roles assigned, you specify a comma-separated list of roles.
Anyone who has even one of these roles assigned will be able to view the document or that part of the document you specified the directive for.
#### Here are the rules
* By default everyone has access to a file or document-content.
* There are some roles that are built in...
	* `admin`... is a role for testing-purposes, new features, etc...
	* `teacher`... see everything (except for admin-only). So when you make a document visible to users with the role, let's say `5chif`, then you don't have to specify `teacher`. That is implied.
	* You gain a role either by getting the OU= value set by LDAP (`Teachers` gets translated to `teacher` and `Students` to `students`), or by assigning a client-role with that name.
* If the directive is in the first line of the document (the very first line), then it applies to the whole document.
	* In that case, there is no end-directive.
* Documents that are hidden for a viewer will not be displayed to that viewer, even if the viewer has a direct-link.
* Documents that are hidden for a viewer will not be visible in the directory-tree on the left as well.
* If a directory on the left has only files invisible to the viewer, then the entry of that directory will be invisible as well.

There is no role `student`. Students are just users without the `teacher` role.
#### File Restrictions
Put the security directive on the first line of the document.
```markdown
@@@ 4bhif

# Some Document
Some text in a document only visible to users with the `4bhif` group or `teacher`.
```

```markdown
@@@ teacher

# Some Document
Some text in a document only visible to teachers.
```

You can specify multiple roles, so anyone with ANY of those roles assigned will be able to view the document.
```markdown
@@@ 4bhif, 4chif, 5ahif

# Some Document
Some text in a document only visible to users with the `4bhif` OR `4chif` OR `5ahif` or any combination of those.
```

#### File-Content Restrictions
Put the security directive in the middle of your documents' content.
Don't forget to put in an end-directive in this case.

```markdown
# Some Docuemnt
Some text visible to all.

@@@ teacher
Some text only teachers can read, but not the students.
@@@

Some more text visible to all again.
```
Of course you can use full Obsidian-flavor-markdown within the directives.

#### File-Content Views
There are two views.
```markdown
# Question 23

## Introduction
@@@ #practice
You are a student making an internship at a big company that wants to re-write the legacy software.
@@@
@@@ #exam
You are employed at a company that wants to re-structure their legacy software.
@@@

## Question
* What development tools will you be using?
* Make a plan.
* Explain the steps to get to a finished new product.
@@@ #answer
## Answer
* Java and Javascript.
* Just do it.
* Do it. See, you're done.
@@@
```

### Callouts
Contrary to GitHub or standard MD, Obsidian supports [callouts](https://help.obsidian.md/Editing+and+formatting/Callouts), which are basically colorfully rendered boxes with headings and content (cards, one might say).
Those look great, especially when dealing with long text-flow or when interspersing text with info-points or homework-reminders.

Examples:
```markdown
# A note.
> [!note]
> content
```
![](md/assets/Pasted%20image%2020240315082827.png)

```markdown
# A Warning with 'BOO!' in the heading, instead of the default 'Warning'.
>[!warning] BOO!
>content
```
![](md/assets/Pasted%20image%2020240315082849.png)

```markdown
# A collapsable callout
>[!tip]-
>content
```
![](md/assets/Pasted%20image%2020240315082907.png)

```markdown
# A collapsable callout with 'some long text' as heading.
>[!quote]- some long text
>content
```
![](md/assets/Pasted%20image%2020240315083209.png)

You get the idea.
You can see all the variations [here](https://help.obsidian.md/Editing+and+formatting/Callouts).

They all work with one exception:
![](md/assets/Pasted%20image%2020240315082944.png)
### Image Sizing
The renderer will never touch the image's size, until it won't fit the display. If that occurs, it will just resize it proportionally to fit it.

To display images at a special size, you have the following options.
Those work on normal image-links, like the standard DM ones and the shortcut-links `Obsidian` provides.

```markdown
# Display in 200x200 pixels (x + 'x' + y)
![some alt-text|200x200](assets/my-img.png)
# And as short-link
![[my-img.png|200x200]]

# Display in 200 pixels widths, sized proportionally
![some alt-text|120](assets/my-img.png)
# And as short-link
![[my-img.png|120]]
```


## How To Build / Update
The repository derives from https://github.com/htl-leonding-college/asciidoctor-docker-template and adds functionality to publish the output to a web-server of your liking using DockerHub.
It hides (server-side) all pages behind a OIDC token redirecting to an authentication server of your liking (in the default-case it's client on a Keycloak instance linked to our school's AD service, so we never have to maintain the users because the school does this for us).

You will need a web-server of your own and some way of hosting a private docker-image, since your material won't be protected from students in a public one.
So if you'd like to use the privacy and permissions features of this project, you better host this image somewhere private.

To build, there is a Github action in this repository, but in order to configure it, you'll need several secrets available for the build (add them to your Company/Organisation/clone of this repo).

| NAME                   | DESCRIPTION                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| START_PAGE             | Relative local path to the desired start-page, starting with the app.js directory, which is the root for the webserver (defaults to `/index.html`, which will be the ASCIIDoc-start-page generated by jekyl). So, for example, the correct way to start with index.md located in your `md` sub-directory would be setting this variable to `/md/index.md` (it will run through the markdown-processor alright). |
| SERVER_URL             | This is the URL your server will be available at later, after deploying. Examples are `https://htl.unterrainer.info` or the default `http://localhost:8080`.                                                                                                                                                                                                                                                    |
| PLANTUML_URL           | Defaults to `https://plantuml.unterrainer.info/plantuml`                                                                                                                                                                                                                                                                                                                                                        |
| DEPLOY_DIR             | The absolute path to the installation directory on your target machine (server).                                                                                                                                                                                                                                                                                                                                |
| DEPLOY_SERVER          | The host-address of your server (as accessible from a Github runner).                                                                                                                                                                                                                                                                                                                                           |
| DEPLOY_SSH_PORT        | The port for the SSH connection to your server.                                                                                                                                                                                                                                                                                                                                                                 |
| DEPLOY_SSH_PRIVATE_KEY | The private key for SSH authentication.                                                                                                                                                                                                                                                                                                                                                                         |
| DEPLOY_SSH_USER        | The user for SSH authentication (local user).                                                                                                                                                                                                                                                                                                                                                                   |
| DOCKER_HUB_PASSWORD    | An access-token of your docker-hub account.                                                                                                                                                                                                                                                                                                                                                                     |
| DOCKER_HUB_USER        | The user of your docker-hub account.                                                                                                                                                                                                                                                                                                                                                                            |
| KEYCLOAK_FILE          | The copy-pasted contents of the file you get when you enter your Keycloak-realm as admin -> Client -> Installation -> Keycloak JSON File.                                                                                                                                                                                                                                                                       |
| PORT                   | -> `.env`<br>The port your web-server will be accessible when started later on.<br>This variable will be written to a newly generated `.env` file that will reside in the root-directory of the node web-server.                                                                                                                                                                                                |
| VPN_OVPN_FILE          | The OVPN file of your Open VPN configuration. This is used to reach the deployment-server (target host) to start conversation via SSH.                                                                                                                                                                                                                                                                          |
| VPN_PASSWORD           | The password of your VPN connection.                                                                                                                                                                                                                                                                                                                                                                            |
| VPN_SERVER             | The server to call for opening your VPN connection.                                                                                                                                                                                                                                                                                                                                                             |
| VPN_USERNAME           | The username of your VPN connection.                                                                                                                                                                                                                                                                                                                                                                            |

After starting the build-pipeline on Github for the first time after inserting all these values, you should have a NodeJS server deployed and up-and-running on your target machine, accessible via the PORT you entered as a secret.
Upon entering any page you'll be prompted to login at the given Keycloak server in order to gain access.

If your repository is private, which makes sense, Github will force you to either pay for Github Enterprise, or to have your own, self-hosted Github Runner. Because this repository however is public, the build-action-script refers to the runner as `runs-on: ubuntu-latest`. So in order to use your private self-hosted-runners you'll have to label them `ubuntu-latest` so Github will take care of that. Your runners will have slightly higher priority than the public ones.

## Debugging
To test the portions of the web-site that isn't directly connected to the gh-pages generation and Asciidoc conversion, you may want to start it using VSCode.
Just do the following:
* clone this repository
* open it in VSCode
* open a terminal window
* `npm install`
* `npm run start` (the contents of the start-script are located in the `package.json` file)
* Just press `F5` to start debugging, while the webserver is running in the background
You can use the built-in debugger now.

The following files are changed or omitted in the build-process:

| FILE                              | DESCRIPTION                                                                                                                                                                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| .env                              | -> `pipeline`<br>Will be re-generated from scratch during the pipeline-run using Github secrets.<br>Code is located in this repository in the `yml` file of the action.                                                                                            |
| keycloak.json                     | -> `pipeline`<br>Will be generated from scratch during the pipeline-run using Github secrets.<br>So you're free to place a debugging-file of your own in here. The one that is present connects you to a test-server and will most likely not work with your fork. |
| package.json<br>package-lock.json | -> 'Dockerfile'<br>These files will be copied during the pipeline-run's Docker-Image generation and used to setup the web-server in the Docker container by running `npm install` afterwards.                                                                      |
| app.js                            | -> 'Dockerfile'<br>Is the start-file for the NodeJS server and will be copied during the pipeline-run's Docker-Image generation.                                                                                                                                   |
| all other files...                | Will be ignored by the build-pipeline.                                                                                                                                                                                                                             |
### HttpYac (REST-Tests)
In order to get those working, you'll have to create a file `httpyac.config.js` with the following contents:
```bash
// Configuration file for HttpYac.
// A plugin for VSCode.
module.exports = {
  log: {
    supportAnsiColors: true
  },
  cookieJarEnabled: true,
  envDirName: 'env',
  environments: {
    $default: {
      url: 'http://localhost:8080',
      oidc: 'https://keycloak-server/auth/realms/test/protocol/openid-connect/token',
      userName: 'username',
      password: 'password'
    }
  }
}
```
Then you can run the REST-examples in the `http` directory.

## Keycloak Setup
In order for this setup to work correctly, you'll have to have a Keycloak-client (private with secret) and standard-authorization-flow enabled (should be enabled anyway).
You need the following user-attributes of type `string` with mapper to the token.

| ATTRIBUTE-NAME | TYPE   | DESCRIPTION                                                                                           |
| -------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| config         | string | Holds several preference-values like dark-mode or not or the preferred font, fontsize or line-height. |
| lastPage       | string | Holds the last-visited page of the current user.                                                      |

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



