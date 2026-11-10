Source: AI/open-proposals.md

## Why

The pipeline writes `SESSION_SECRET` into `site/.env` and the whole `KEYCLOAK_FILE` secret (including the OIDC client secret) into `site/keycloak.json`, and the `Dockerfile` copies `site/` into the image. That image is pushed to Docker Hub, where `gufalcon/safe-learn` is public (checked 2026-10-20). Anyone who pulls it can forge session cookies for the demo instance and authenticate as its Keycloak client. For `DIRECTORY_SERVICE_*` the same problem was already fixed by passing the values only through the container's environment. These two are the last secrets still baked into a layer.

## What Changes

- The workflow's "Fill .env file" step (the image's own `.env`) no longer writes `SESSION_SECRET`. The value already reaches the container through `deploy/.env` and the compose file's `environment:` block; the image copy is redundant and only leaks.
- The workflow no longer writes `site/keycloak.json`. Instead, the deployment step writes `KEYCLOAK_FILE` to `deploy/keycloak.json`, which is copied to the deploy directory on the server together with `deploy/.env`, and `deploy/docker-compose.yml` bind-mounts it read-only to `/app/keycloak.json`. The application keeps reading it from its working directory; no application code changes.
- `.dockerignore` excludes `keycloak*.json` and `.env` files outside `site/` as a second line of defense, so a stray local copy can never end up in a build context's layer.
- `test/deployment-config.test.js` gains checks that no secret is written into the image (`SESSION_SECRET`, `keycloak.json`), and that `keycloak.json` reaches the container through a mount the pipeline fills in.
- The startup message for a missing `SESSION_SECRET` and the operator docs (`docs-building.md`, `docs-installation.md`, `docs-keycloak.md`) name the container environment and the mount instead of the image's `.env`.
- secureLectures carries its own copies of the workflow and compose file; the same change is applied there (deployment config, allowed downstream).
- Once the fixed images are deployed, the demo's `SESSION_SECRET` and its Keycloak client secret are rotated. The old layers stay public, so only rotation makes them worthless. Rotating `SESSION_SECRET` logs everyone out once.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `deployment-surface`: adds the requirement that no secret travels inside the published image; secrets reach a deployment only at runtime, through the container environment or a mounted file.

## Impact

- `.github/workflows/docs-local.yml` (both repositories), `deploy/docker-compose.yml` (both repositories), `.dockerignore`.
- `test/deployment-config.test.js`.
- `middlewares/keycloak-middleware.js`: only the text of the missing-secret message.
- Operator docs: `docs-building.md`, `docs-installation.md`, `docs-keycloak.md`.
- Operations: the deploy directory on each server now holds `keycloak.json` next to `.env`. Both already hold secrets of the same sensitivity. GitHub secrets `SESSION_SECRET` and `KEYCLOAK_FILE` keep their names; after rotation their values change in both repositories.
