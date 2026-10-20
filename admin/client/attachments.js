/**
 * The page "Unreferenced attachments" (`teacher-admin-pages`): the list the
 * last scan holds, grouped by folder, its count and the time of that scan,
 * and a button that copies the paths, one per line, ready for `git rm`.
 * Read-only; nothing is served, previewed or deleted from here.
 */

import { element, fetchJson, loadI18n } from "./i18n.js";

const root = document.getElementById("slAdmin");

/** The paths by folder, in the order the sorted list first names each folder. */
function byFolder(paths) {
  const folders = new Map();
  for (const path of paths) {
    const cut = path.lastIndexOf("/");
    const folder = cut < 0 ? "" : path.slice(0, cut);
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder).push(cut < 0 ? path : path.slice(cut + 1));
  }
  return folders;
}

/**
 * Puts `text` on the clipboard. Where the browser refuses (a page not served
 * over a secure origin), a read-only field holding the list is shown and
 * selected instead, so it can be copied by hand.
 */
async function copy(text, button, status, t) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = t("app.admin.attachments.copied");
  } catch {
    let field = root.querySelector(".sl-admin-copy-fallback");
    if (!field) {
      field = element("textarea", "sl-admin-copy-fallback");
      field.readOnly = true;
      field.rows = 8;
      field.setAttribute("aria-label", t("app.admin.attachments.copyPaths"));
      button.closest(".sl-admin-head").after(field);
    }
    field.value = text;
    field.focus();
    field.select();
    status.textContent = t("app.admin.attachments.copyByHand");
  }
}

function draw({ scannedAt, count, paths }, { t, format }) {
  root.replaceChildren();

  const head = element("div", "sl-admin-head");
  const summary = element("div", "sl-admin-summary");
  if (scannedAt === null) {
    summary.append(element("p", "sl-admin-count", t("app.admin.attachments.noScan")));
  } else {
    const countText = count === 0 ? t("app.admin.attachments.none") : t("app.admin.attachments.count", { count, n: format.number(count, 0) });
    summary.append(
      element("p", "sl-admin-count", countText),
      element("p", "sl-admin-scanned", t("app.admin.attachments.scannedAt", { time: format.dateTime(scannedAt) }))
    );
  }
  head.append(summary);

  if (count > 0) {
    const actions = element("div", "sl-admin-actions");
    const button = element("button", "sl-button sl-admin-copy", t("app.admin.attachments.copyPaths"));
    button.type = "button";
    const status = element("span", "sl-admin-copy-status");
    status.setAttribute("role", "status");
    button.addEventListener("click", () => copy(paths.join("\n"), button, status, t));
    actions.append(button, status);
    head.append(actions);
  }
  root.append(head);

  for (const [folder, names] of byFolder(paths)) {
    const block = element("section", "sl-admin-folder");
    block.append(element("h2", "sl-admin-folder-name", folder === "" ? t("app.admin.attachments.topFolder") : `${folder}/`));
    const list = element("ul", "sl-admin-paths");
    for (const name of names) list.append(element("li", null, name));
    block.append(list);
    root.append(block);
  }
}

const i18n = await loadI18n();
try {
  draw(await fetchJson("/admin/api/attachments"), i18n);
} catch (error) {
  console.error("[admin] The unreferenced attachments could not be read:", error);
  root.replaceChildren(element("p", "sl-admin-error", i18n.t("app.admin.failed")));
}
