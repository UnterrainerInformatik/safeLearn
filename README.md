# SafeLearn Repository
As a teacher you probably have to cover a vast field of expertise and to keep up with changes in this very field, constantly updating your teaching materials. Most of the time your materials are scattered over a number of formats and platforms, which doesn't exactly make things easier.

This project is the attempt to unify all teaching materials using Markdown and Obsidian as an editor while using this site as a reader for the students.
As a reader for students it has various benefits, such as responsive design allowing the use of a mobile phone when learning, or customizability of the look-and-feel to suit various tastes.

See a working version of this project, hosted by myself, here:
https://safelearn.unterrainer.info

| USER    | PASSWORD | Explanation                       |
| ------- | -------- | --------------------------------- |
| teacher | teacher  | Teacher-user with full access.    |
| student | student  | Student-user with limited access. |
You will not be able to edit the files, just to watch them.
If you'd like to host your own files, you'll have to fork this repository.
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
### Shortcuts
In view-mode, when visiting your web-page containing the rendered Markdown files, you may use the following keyboard-shortcuts:

| Keys                          | Explanation                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CTRL + ALT + d                | Opens the `print-the-document-as-pdf` view in the same window you are currently in, without opening it in a new tab.          |
| CTRL + ALT + p                | Opens the `print-the-document-as-presentation` view in the same window you are currently in, without opening it in a new tab. |
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
## Obsidian Language Extensions
Here you can find the technical intricacies of the Obsidian-specific language extension implemented in this project [docs](docs-obsidian.md).
## Permissions
You can specify who is able to read whole files, or only parts of it.
Here you can find more information about [permissions](docs-permissions).
## Technical Details
If you're interested about the software used behind the scenes or some of the URLs you may use to do stuff, then look [here](docs-technical-details).
## Development: Building this Project
Here you can find information about [building](docs-building) this project.
## Development: Debugging
Here you can find information about [debugging](docs-debugging) this project when you've decided to help develop it.
## Self-Hosting: Keycloak
If you like to host your own server, you'll need a Keycloak-Server to host your users' credentials that is probably connected to your schools' LDAP in some way. [Here](docs-keycloak) you can find information about that.