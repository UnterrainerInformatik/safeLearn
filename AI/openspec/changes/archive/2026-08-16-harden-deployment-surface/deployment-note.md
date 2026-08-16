# Deployment note — harden-deployment-surface

## Before deploying: add the repository secret, or the container will not start

This release takes the session secret from the environment and **refuses to start without it**. There is no fallback, on purpose: a built-in value would be identical in every instance built from this public source, and a generated one would start fine while logging everyone out on every deploy.

**Do this first, before the image that requires it is deployed:**

1. Generate a value — any long random string does; it is only ever compared against itself:

   ```bash
   openssl rand -hex 32
   ```

2. Add it as the GitHub repository secret **`SESSION_SECRET`** (`Settings > Secrets and variables > Actions`). The workflow writes it into both the image's `.env` and `deploy/.env`, and `deploy/docker-compose.yml` passes it into the container.

3. Anyone running a WYSIWYG container or a local working tree adds `SESSION_SECRET` to their own `.env` as well — `wysiwyg-container-linux/.env`, `wysiwyg-container-windows/.env`, or the `.env` next to `app.js`. The shipped files carry a placeholder; replace it.

If the secret is missing, the container exits immediately with a message naming the variable and the file to put it in, and restarts in a loop. That is the failure working as designed — loud, immediate and fixed by setting the variable.

## At deploy time: everyone logs in once

The moment the new secret takes effect, cookies signed with the old one stop being accepted. Every open session ends and every user authenticates again — once. Nothing is stored that needs migrating, and nothing is lost.

Sessions are held in the container's memory anyway, so a deploy would have ended them regardless. Worth telling people if the deploy lands during teaching hours.

## After deploying: two things to check from a logged-in browser

The application no longer serves its own directory. It serves an allowlist of locations in `app.js` and nothing else, so both directions are worth confirming once against the running instance:

1. **`/keycloak.json` no longer returns the file.** Request it while logged in. It must answer with the start page — the same answer any path with no file behind it gets — and must not contain `"credentials"` or the client secret. The same holds for `/app.js`, `/utils.js`, `/obsidian.js`, `/package.json` and `/package-lock.json`.
2. **A page with a mermaid diagram still renders one**, and the presentation view still loads. Mermaid pulls further chunks from `/node_modules/mermaid/dist/chunks/…` at runtime, so a broken mount shows up in the browser rather than in the emitted markup. `npm test` asserts the entry modules answer; only a real page proves the chunks do.

If something a page needs 404s — in practice: falls through to the start page — it is an asset that has no mount yet. The fix is one more narrow mount in `app.js`; see `docs-development.md`.

## Rollback

Revert the commit and redeploy. The old code ignores `SESSION_SECRET`, so the deployment keeps working with it set — leave the secret in place. Everyone logs in once more on the way back. Nothing persisted changes shape in either direction.
