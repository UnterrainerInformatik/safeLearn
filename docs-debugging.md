# # Debugging
Here you can find help with debugging the project.

[back](README.md) to the main page.
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