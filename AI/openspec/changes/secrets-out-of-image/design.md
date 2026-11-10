## Context

A deployed instance gets its configuration through two channels, as `test/deployment-config.test.js` describes:

- **The image's `.env`**: the "Fill .env file" step writes `site/.env`, the `Dockerfile` copies `site/` to `/app`, and `npm run prod` loads it with `node -r dotenv/config`.
- **The container environment**: "Fill .env file for deployment" writes `deploy/.env`, the SSH deploy copies `deploy/` to `DEPLOY_DIR`, and `deploy/docker-compose.yml` interpolates it into `environment:`.

`SESSION_SECRET` already goes through both. dotenv never overwrites a variable that is already set, so the container's value wins and the image copy has no effect at all.

`keycloak.json` only goes through the first channel: "Fill keycloak.json file" writes `site/keycloak.json`, and the image gets it via `COPY site/ /app`. The application reads it from its working directory in three places (`middlewares/keycloak-middleware.js`, `middlewares/directory-service.js`, `permission-context.js` via the middleware). The static allowlist in `app.js` already makes sure it is never served over HTTP.

The WYSIWYG compose templates already bind-mount `./keycloak.json` to `/app/keycloak.json` when they run with Keycloak, so that pattern already exists in the repository.

## Goals / Non-Goals

**Goals:**
- The published image carries no secret.
- The deployment checks enforce this.
- No application code change beyond message text.

**Non-Goals:**
- Removing the old images or layers from Docker Hub. Pulled copies cannot be recalled; rotation is what neutralizes them.
- Moving the non-secret values (`NEXT_PUBLIC_*`, `NEXT_AUTOSCAN`) out of the image's `.env`.
- Changing how local development reads `.env` and `keycloak.json` at the repository root.
- Docker secrets or a secret manager. One container per host does not need them.

## Decisions

**D1: Mount `keycloak.json` from the deploy directory rather than passing it as an environment variable.**
The pipeline writes `${{ secrets.KEYCLOAK_FILE }}` to `deploy/keycloak.json` in the "Fill .env file for deployment" step's neighbour, the SSH deploy copies it to `DEPLOY_DIR`, and compose mounts it as `./keycloak.json:/app/keycloak.json:ro`. An environment variable holding the JSON (e.g. `KEYCLOAK_JSON`) was considered. It would need a code change in three readers and a fallback order between file and variable, and multi-line JSON in a compose `.env` is fragile. The mount keeps every reader as it is and matches the WYSIWYG templates.

The relative source `./keycloak.json` resolves against the compose file's directory, which is `DEPLOY_DIR`, where `up.sh` runs. If the file is missing, Docker creates an empty *directory* at the bind source. The middleware then fails to read it and refuses to start with its existing message, which names `keycloak.json`. That is loud enough. Using the long mount syntax with `bind.create_host_path: false` makes compose fail before the start instead, with a clearer message, so the long syntax is used.

**D2: Drop `SESSION_SECRET` from the image's `.env` and change nothing else for it.**
It already arrives through the container environment.

**D3: Extend `test/deployment-config.test.js` rather than adding a new file.**
New checks:
- `SESSION_SECRET` is not in `imageEnv` (generalizing the existing directory-service check into one list of secrets: `SESSION_SECRET`, `DIRECTORY_SERVICE_CLIENT_ID`, `DIRECTORY_SERVICE_CLIENT_SECRET`).
- No workflow step writes into `site/keycloak.json` (any redirect or `touch` targeting `site/keycloak`).
- The compose service mounts `/app/keycloak.json` read-only, and the pipeline writes the mount's source file in `deploy/`.
The test reads the workflow as text, as it already does. secureLectures does not ship tests (downstream rule), so there the check runs only in safeLearn against safeLearn's copies.

**D4: `.dockerignore` gains `**/keycloak*.json` and `.env`.**
dockerignore patterns are relative to the context root, so `.env` matches only the root file and `site/.env` (which still carries the non-secret values) keeps going in. `**/keycloak*.json` matches at any depth, including `site/`, so even a stale workflow that writes `site/keycloak.json` cannot bake it in again. It also keeps a developer's root `keycloak.json` and `.env` out of a local build context. Neither is copied today, but they would be one `COPY *.json` away.

**D5: Rotate after the fixed image is live, not before.**
Rotating first would put the new values into one more public image. Order: deploy the fixed pipeline in safeLearn and secureLectures, check that `docker history` / the pushed layers contain no `keycloak.json`, then rotate `SESSION_SECRET` and the Keycloak client secret of the demo instance's client, update the GitHub secrets, and re-run the workflows. This is Gerald's manual step; the tasks list it so it is not forgotten.

## Risks / Trade-offs

- [The first deploy after the change finds no `keycloak.json` on the server, because the order of steps is wrong] → The file is written in the same step as `deploy/.env`, before the SSH copy; compose with `create_host_path: false` refuses to start rather than starting broken. Checked by D3.
- [secureLectures drifts: safeLearn is fixed, the downstream copy still bakes secrets in] → Same task group applies the change there, and `git grep site/keycloak` in secureLectures is part of the verification.
- [Rotating `SESSION_SECRET` logs out every user of the instance] → Done once, outside teaching hours; documented in `docs-building.md` already.
- [Unknown which repository pushes `gufalcon/safe-learn`] → Both are fixed, so it does not matter for the code. For rotation, the secrets of whichever instance uses that image are rotated; if both share them, both.
- [The deploy directory on the server now holds the client secret as a file] → It already holds `.env` with `SESSION_SECRET` and the directory-service secret; same host, same permissions.

## Migration Plan

1. Merge in safeLearn; the workflow builds an image without the secrets and deploys `deploy/keycloak.json` with the compose file.
2. Merge into secureLectures with the same edits to its own workflow and compose file; check that a deploy run starts for HEAD (path filter covers `.github/workflows/docs-local.yml` and `deploy/**`).
3. Verify both instances sign in.
4. Rotate secrets (D5).

Rollback: revert the commit; the old workflow writes `site/keycloak.json` again, and a leftover `keycloak.json` in `DEPLOY_DIR` is harmless.
