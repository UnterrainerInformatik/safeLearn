/**
 * The administration pages for teachers (`teacher-admin-pages`): the
 * attachments no page references, and the state of the directory data. Both
 * read process memory only and change nothing.
 *
 * `app.js` mounts this only when readers log in (`AUTH=keycloak`), after
 * `checkAuthenticated` and before the catch-all, whether the exam module is on
 * or off. Every route sits behind the gate in `gate.js`.
 */

import express from "express";
import path from "node:path";

import { unreferencedAttachments, wrapInPage } from "../obsidian.js";
import { getDirectoryStatus } from "../middlewares/directory-service.js";
import { i18nOf } from "../i18n/server.js";
import { adminData, adminPage } from "./gate.js";

export { actsAsTeacherWithIdentity } from "./gate.js";

const clientDir = path.join(import.meta.dirname, "client");

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * A page of its own: the heading, the element its client draws into, and that
 * client, in the instance's frame at the whole width. `title` is a function of
 * the reader's `t` returning the heading.
 */
async function adminShell(req, startPage, title, client) {
  const { t } = await i18nOf(req);
  const heading = title(t);
  const body = `
    <h1>${escapeHtml(heading)}</h1>
    <div class="sl-admin" id="slAdmin" aria-live="polite">${escapeHtml(t("app.embed.loading"))}</div>
    <script type="module" src="/admin/assets/${client}"></script>`;
  return wrapInPage(body, startPage(), req, { title: heading, wide: true });
}

/**
 * `startPage` is `app.js`'s own resolver, for the page frame's "Home" link.
 */
export function registerAdminRoutes(app, { startPage }) {
  const router = express.Router();
  const page = (title, client) => (req, res, next) => {
    adminShell(req, startPage, title, client)
      .then((html) => res.send(html))
      .catch(next);
  };

  // The pages' clients: their directory and nothing beside it, behind the
  // page gate, so a student cannot tell from them that the pages exist.
  router.use("/assets", adminPage, express.static(clientDir));

  router.get("/attachments", adminPage, page((t) => t("app.admin.attachments.title"), "attachments.js"));
  router.get("/directory", adminPage, page((t) => t("app.admin.directory.title"), "directory.js"));

  // Exactly the list the last scan logged and the attachment gate refuses.
  router.get("/api/attachments", adminData, (req, res) => {
    const { scannedAt, paths } = unreferencedAttachments();
    res.json({ scannedAt, count: paths.length, paths });
  });

  // The report the bearer route `/api/admin/directory/status` gives the
  // plugin, unchanged: two routes over one function, so they cannot drift.
  // Memory only - asking never starts a fetch, so the page may poll it.
  router.get("/api/directory/status", adminData, (req, res) => {
    res.json(getDirectoryStatus());
  });

  app.use("/admin", router);
}
