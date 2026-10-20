/**
 * The page "Directory status" (`teacher-admin-pages`): the report
 * `getDirectoryStatus()` gives, as a page. While a fetch runs it reads the
 * report again every 2 seconds - the plugin's interval - and stops once the
 * fetch has ended (design D5). The route reads memory only, so neither opening
 * nor polling the page starts a fetch. Skipped records are a count, never named.
 */

import { element, fetchJson, loadI18n } from "./i18n.js";

const root = document.getElementById("slAdmin");
const pollMs = 2000;

function phaseLabel(phase, t) {
  const labels = {
    counting: t("app.admin.directory.phaseCounting"),
    entries: t("app.admin.directory.phaseEntries"),
    roles: t("app.admin.directory.phaseRoles"),
  };
  return labels[phase] ?? phase;
}

/** A label-and-value list, one row per `[label, value]`; a value may be a node. */
function rows(entries) {
  const list = element("dl", "sl-admin-facts");
  for (const [label, value] of entries) {
    const cell = element("dd");
    if (value instanceof Node) cell.append(value);
    else cell.textContent = value;
    list.append(element("dt", null, label), cell);
  }
  return list;
}

function draw(status, { t, format }) {
  const blocks = [];

  const running = [[t("app.admin.directory.fetch"), status.fetching ? t("app.admin.directory.fetchRunning") : t("app.admin.directory.fetchIdle")]];
  if (status.fetching) {
    running.push([t("app.admin.directory.phase"), phaseLabel(status.phase, t)]);
    const done = format.number(status.done, 0);
    const progress = element("div", "sl-admin-progress");
    if (typeof status.total === "number") {
      const bar = element("progress");
      bar.max = Math.max(status.total, 1);
      bar.value = Math.min(status.done, bar.max);
      progress.append(bar, element("span", null, t("app.admin.directory.progressOf", { done, total: format.number(status.total, 0) })));
    } else {
      progress.append(element("span", null, t("app.admin.directory.progressDone", { done })));
    }
    running.push([t("app.admin.directory.progress"), progress]);
    if (status.startedAt !== null) running.push([t("app.admin.directory.startedAt"), format.dateTime(status.startedAt)]);
  }
  blocks.push(element("h2", null, t("app.admin.directory.fetchHeading")), rows(running));

  blocks.push(element("h2", null, t("app.admin.directory.heldHeading")));
  if (status.entries === null) {
    blocks.push(element("p", "sl-admin-empty", t("app.admin.directory.nothingHeld")));
  } else {
    const held = [[t("app.admin.directory.entries"), format.number(status.entries, 0)]];
    if (status.builtAt !== null) held.push([t("app.admin.directory.builtAt"), format.dateTime(status.builtAt)]);
    held.push([t("app.admin.directory.skipped"), format.number(status.skipped, 0)]);
    blocks.push(rows(held));
  }

  root.replaceChildren(...blocks);
  root.dataset.phase = status.phase;
}

const i18n = await loadI18n();

async function refresh() {
  let status;
  try {
    status = await fetchJson("/admin/api/directory/status");
  } catch (error) {
    console.error("[admin] The directory status could not be read:", error);
    root.replaceChildren(element("p", "sl-admin-error", i18n.t("app.admin.failed")));
    return;
  }
  draw(status, i18n);
  if (status.fetching) setTimeout(refresh, pollMs);
}

refresh();
