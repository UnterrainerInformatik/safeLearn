## 1. Deployment checks first

- [x] 1.1 In `test/deployment-config.test.js`, generalize "the directory-service credentials travel by container environment, not in the image" into one list of secrets (`SESSION_SECRET`, `DIRECTORY_SERVICE_CLIENT_ID`, `DIRECTORY_SERVICE_CLIENT_SECRET`) that must be in the compose `environment:` and must not be in the image's `.env`; update the file's header comment on the two channels. Verify: the check fails on the current workflow, naming `SESSION_SECRET`.
- [x] 1.2 Add a check that no workflow step writes into `site/keycloak.json`, and one that the compose service mounts `/app/keycloak.json` read-only from a file the "Fill .env file for deployment" step (or a step before the SSH deploy) writes under `deploy/`. Verify: both fail on the current workflow and compose file.

## 2. Pipeline and compose (safeLearn)

- [x] 2.1 In `.github/workflows/docs-local.yml`, remove `SESSION_SECRET` from "Fill .env file" and remove the "Touch keycloak.json file" and "Fill keycloak.json file" steps. Verify: `grep -n "site/keycloak\|SESSION_SECRET" .github/workflows/docs-local.yml` shows only the `deploy/.env` line.
- [x] 2.2 Write `${{ secrets.KEYCLOAK_FILE }}` to `deploy/keycloak.json` in the deploy job before "Deploy using SSH", with a comment on why it is not in the image. Verify: check 1.2's pipeline half passes.
- [x] 2.3 In `deploy/docker-compose.yml`, mount `./keycloak.json` to `/app/keycloak.json` read-only with the long syntax and `bind.create_host_path: false`, with a comment like the one on `DIRECTORY_SERVICE_*`. Verify: `docker compose -f deploy/docker-compose.yml config` with a dummy `deploy/.env` and `deploy/keycloak.json` renders the mount; without the file, `docker compose up` refuses to start.
- [x] 2.4 Add `**/keycloak*.json` and `.env` to `.dockerignore`. Verify: a local `docker build` with a dummy `site/keycloak.json` and root `.env` produces an image in which `/app/keycloak.json` and the root `.env` are absent, while `/app/.env` from `site/` is present.
- [x] 2.5 Run `node --test test/deployment-config.test.js`. Verify: all checks green.

## 3. Messages and docs

- [x] 3.1 In `middlewares/keycloak-middleware.js`, change the missing-`SESSION_SECRET` message so it names the container environment (`deploy/.env` → compose `environment:`) or the `.env` next to `app.js` locally, not "/app/.env in the container image". Same for the missing-`keycloak.json` message: name the mount in a deployment. Verify: starting locally without `SESSION_SECRET` prints the new text.
- [x] 3.2 Update `docs-building.md` (`SESSION_SECRET` and `KEYCLOAK_FILE` rows: where they end up), `docs-installation.md` and `docs-keycloak.md` (where a deployment gets `keycloak.json`). Verify: `grep -n "site/keycloak\|-> \`.env\`" docs-*.md` no longer places a secret in the image's `.env`.

## 4. Full verification in safeLearn

- [x] 4.1 Run `npm test`. Verify: green, apart from the known flaky checks (AI/memory/flaky-content-checks.md), which are re-run.

## 5. secureLectures (downstream deployment config)

- [ ] 5.1 After safeLearn is pushed, merge `public/master` into secureLectures and apply 2.1–2.4 to its own `.github/workflows/docs-local.yml`, `deploy/docker-compose.yml` and `.dockerignore`, keeping its local differences (self-hosted runner, path filter, corpus mount, `AUTOSCAN`). Verify: `git grep -n "site/keycloak"` in secureLectures is empty, and a deploy run starts for HEAD.

## 6. After the fixed images are live (Gerald, manual)

- [ ] 6.1 Confirm the pushed image no longer contains the secrets: `docker pull` the image, then `docker run --rm --entrypoint sh <image> -c 'ls /app/keycloak.json; grep -c SESSION_SECRET /app/.env'` shows no file and `0`. Confirm both instances still sign in.
- [ ] 6.2 Rotate the Keycloak client secret of the client in `KEYCLOAK_FILE` and set a new `SESSION_SECRET` (`openssl rand -hex 32`); update the GitHub secrets in every repository that uses these values and re-run the workflows. Expect one forced re-login for all users. Verify: sign-in works with the new values.
- [ ] 6.3 Remove the entry "Öffentliches Image enthält site/.env und keycloak.json" from `AI/open-proposals.md` when archiving.
