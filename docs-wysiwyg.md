# WYSIWYG 
If you'd like to run a local container of this server in order to see changes you make on your files on-the-fly, you've come to the right page.

[Back](README.md) to the main page.
## How to setup your local container
### Prerequisites
- Local [Docker](https://docker.com)-installation (or Docker-Desktop for Windows-installations)
- Some access to the keycloak-server that's being used (may be local, or the standard remote one)
- Free port `8081` on your local machine (you may change that, but it has to be configured on the keycloak-client as a `valid redirect URL` like `http://localhost:<port>/*`)
### Installation
- Clone this repository
- Copy the contents of the directory `wysiwyg-container-linux` or `wysiwyg` to your local host
- **Windows-Only:** Open Docker-Desktop UI and go to Settings -> Resources -> File Sharing. Add your directory to the shared drives this way (the `\md` subdir).
- Adjust the contents of the `.env` file
- Adjust the contents of the `keycloak.json` file
- Run `./up.sh` on linux or `./up.ps1` on windows to start your container as a persistent container
### `.env` File

| Field             | Example-value                    | Description                                                                                                                                                                                                                                                |
| ----------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WEBSERVER_PORT    | 8081                             | The port your local web-server should expose                                                                                                                                                                                                               |
| PUBLIC_SERVER_URL | http://localhost:8081            | This is important for the keycloak-login process. The port should be the same as in WEBSERVER_PORT.                                                                                                                                                        |
| PUBLIC_START_URL  | /md/index.md                     | This will open the file `<url>/md/index.md` as the `home`-URL of your site. This file has to exist, so be sure to enter this one correctly.                                                                                                                |
| LOCAL_DEV_MD_DIR  | /home/larifari/secureLectures/md | This is the place of the md-directory within the repository you've cloned  to your local machine. This is the place where your MD-files live.                                                                                                              |
| AUTOSCAN          | true                             | This switch enables hot-updating. It tells the server to watch for changes in your MD-directory and reload all files, when it detects those changes.<br>This also enables hot-updating of your opened pages in your browser, if any. This works over SSEs. |
### `keycloak.json` File
This should be self-explanatory for keycloak-users. It's the config file for the keycloak-instance you are using.

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
- ...fully use Windows, clone and push your repo from there using native Windows-installed tools and use the container and files in the `wysiwyg-container-windows` directory. Then you have to use Powershell to start and stop the container.