# WYSIWYG 
If you'd like to run a local container of this server in order to see changes you make on your files on-the-fly, you've come to the right page.

[Back](README.md) to the main page.

The container is a [tier-1](docs-installation.md#tier-1--publishing) instance on your own machine. The same setup, with `READER_ROLES` left empty, also publishes a public site. If your corpus is shared through Nextcloud and mounted on the server, you may not need this container at all: see [Where Your Markdown Lives](docs-installation.md#where-your-markdown-lives).
## How to setup your local container
The container runs in one of two ways, chosen by `AUTH` in its `.env`:

- **Without sign-in (`AUTH=none`, the default).** No Keycloak, no `keycloak.json`, no login. You open `http://localhost:8081` and read your pages. Every reader holds the roles `READER_ROLES` lists, `teacher` by default, so you see the teacher content and get the teacher, exam and answer switches. Your preferences (the switches, light/dark, fonts, the last page you read) are kept in your browser as two cookies, `safelearn_config` and `safelearn_last`, not on any server.
- **With sign-in through Keycloak (`AUTH=keycloak`).** You log in as yourself and see what your account may see, exactly as on the deployed site. This needs access to a Keycloak client.

`AUTH=none` is a choice the `.env` states, never a fallback: a container with `AUTH=keycloak` (or no `AUTH` at all) that cannot read its `keycloak.json` refuses to start, rather than starting without sign-in.

### Prerequisites
- Local [Docker](https://docker.com)-installation (or Docker-Desktop for Windows-installations)
- Free port `8081` on your local machine (you may change that in `.env`)
- Only for `AUTH=keycloak`: access to the keycloak-server that's being used (may be local, or the standard remote one), with `http://localhost:<port>/*` configured as a `valid redirect URL` on its client
### Installation
- Clone this repository
- Copy the contents of the directory `wysiwyg-container-linux` or `wysiwyg-container-windows` to your local host
- **Windows-Only:** Open Docker-Desktop UI and go to Settings -> Resources -> File Sharing. Add your directory to the shared drives this way (the `\md` subdir).
- Adjust the contents of the `.env` file
- Only for `AUTH=keycloak`: adjust the contents of the `keycloak.json` file, uncomment the `keycloak.json` mount in `docker-compose.yml` and `SESSION_SECRET` in `.env`. The mount stays commented out otherwise: Docker answers a mount of a file that does not exist by creating a directory in its place, which would get in the way of switching later.
- Run `./up.sh` to start your container as a persistent container. Both directories ship that script; the Windows one is started from your WSL instance as well, which is why there is no PowerShell variant.

The container runs without the [exam module](docs-exam-module.md): it keeps no data, so a page that places an exam element shows teachers a short notice in its place and students nothing. The exam module cannot be combined with `AUTH=none` at all: it has to know who a reader is, and an instance asked for both refuses to start.

### What `READER_ROLES` does
Without sign-in there is nobody to take roles from, so the container hands every reader the same ones: the comma-separated list in `READER_ROLES`, compared as every role is (case and surrounding spaces do not matter, `teachers` means `teacher`). Whatever it lists, every reader of the container gets — the value is trusted, and the container logs a warning at start-up when it includes `teacher` or `admin`.

- `READER_ROLES=teacher` shows you the corpus as a teacher sees it. Like a teacher who has just logged in, you start in the student view; switch the teacher view on once and the container remembers it.
- `READER_ROLES=teacher,4bhif` adds the content addressed to class `4bhif`.
- **Delete the line, or leave it empty, and the reader holds no role at all**: every `@@@` section and every file restricted to a role is hidden, which is what an anonymous visitor would see. A block addressed to a person by name is never shown without sign-in.

Never run a container with `AUTH=none` and teacher roles where anyone but you can reach it: whoever opens it sees the teacher content, without signing in.
### `.env` File

| Field             | Example-value                    | Description                                                                                                                                                                                                                                                |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WEBSERVER_PORT    | 8081                             | The port your local web-server should expose                                                                                                                                                                                                               |
| PUBLIC_SERVER_URL | http://localhost:8081            | This is important for the keycloak-login process. The port should be the same as in WEBSERVER_PORT.                                                                                                                                                        |
| PUBLIC_START_PAGE | /md/index.md                     | This will open the file `<url>/md/index.md` as the `home`-URL of your site. This file has to exist, so be sure to enter this one correctly.                                                                                                                |
| LOCAL_DEV_MD_DIR  | /home/larifari/secureLectures/md | This is the place of the md-directory within the repository you've cloned  to your local machine. This is the place where your MD-files live.                                                                                                              |
| AUTH              | none                             | `none` runs without sign-in, `keycloak` signs in through Keycloak. Any other value, compared without regard to case and surrounding spaces, refuses the start with a message naming the two accepted ones. |
| READER_ROLES      | teacher                          | Only for `AUTH=none`: the roles every reader holds, comma-separated. Absent or empty, readers hold none and all restricted content is hidden — see above. |
| SESSION_SECRET    | a long random string             | Only for `AUTH=keycloak`, commented out otherwise. The secret the server signs its session cookies with. Any long random value will do — it is only ever compared against itself — but pick your own instead of keeping the placeholder. **With `AUTH=keycloak` the container will not start without it**; it exits with a message naming this variable. Changing it logs you out once. |
| AUTOSCAN          | true                             | This switch enables hot-updating. It tells the server to watch for changes in your MD-directory and reload all files, when it detects those changes.<br>This also enables hot-updating of your opened pages in your browser, if any. This works over SSEs. |
### `keycloak.json` File
Only for `AUTH=keycloak`; with `AUTH=none` the file is not read, even where it is present. This should be self-explanatory for keycloak-users. It's the config file for the keycloak-instance you are using.

| Field           | Explanation                       |
| --------------- | --------------------------------- |
| realm           | The realm.                        |
| auth-server-url | The full URL to the server.       |
| resource        | The client of your application.   |
| secret          | The client-secret of your client. |
### Windows-Explanation
There is a bit of a problem with file mounts on windows / WSL and programs running in either of those two contexts.
While you may access `\\wsl$\<distro>\home\<user>\` from your Windows-context and `/mnt/c/utils/` from you WSL context, the file-events are not propagated over this border (and changes propagate slowly).
On Windows machines you may either choose to...
- ...fully use WSL, clone and push your repo from there using native WSL-installed tools and use the container and files in the `wysiwyg-container-linux`.
- ...fully use Windows, clone and push your repo from there using native Windows-installed tools and use the container and files in the `wysiwyg-container-windows` directory. You still start the container on your WSL-instance in Linux-land. The new docker-desktop has integrated `mutagen` which mirrors the contents of your windows-partition into the container without having to pass so many boundaries, as the filesystem would have to.