/**
 * The dialog a teacher chooses an offline test's handout in (`exam-handout`,
 * exam-offline-sittings design D5): the tree of the corpus's Markdown files,
 * with a search field above it that narrows the tree to the files whose name
 * contains the typed text, in any letter case, and the folders that lead to
 * them. A file the course's class can read already is marked, and choosing it
 * asks once more with that warning - it is not refused.
 *
 * The list comes from the module's API as it stands; the tree and the search
 * are built here.
 */

import { examApi, h, t } from "./frame.js";

/** The files as a tree of folders: `{ folders: Map<name, node>, files: [] }`. */
function treeOf(files) {
  const root = { folders: new Map(), files: [] };
  for (const file of files) {
    let node = root;
    for (const part of file.folder === "" ? [] : file.folder.split("/")) {
      if (!node.folders.has(part)) node.folders.set(part, { folders: new Map(), files: [] });
      node = node.folders.get(part);
    }
    node.files.push(file);
  }
  return root;
}

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

/**
 * Opens the picker for the course `courseId`. Resolves to the chosen file's
 * path, or null when the dialog is closed without a choice.
 */
export function pickHandout(courseId) {
  return new Promise((resolve) => {
    let chosen = null;
    const search = h("input", { type: "search", class: "sl-exam-picker-search", placeholder: t("exam.handouts.searchPlaceholder"), "aria-label": t("exam.handouts.searchLabel") });
    const tree = h("div", { class: "sl-exam-picker-tree", role: "tree" }, h("p", { class: "sl-exam-quiet" }, t("app.embed.loading")));
    const warning = h("p", { class: "sl-exam-message sl-exam-picker-warning", role: "status" });
    let pending = null;
    const choose = (file) => {
      // A file the class can read already is set only on a second click, after the warning.
      if (file.classReadable && pending !== file.path) {
        pending = file.path;
        warning.textContent = t("exam.handouts.classReadable", { path: file.path });
        return;
      }
      chosen = file.path;
      dialog.close();
    };
    const fileItem = (file) =>
      h(
        "li",
        { role: "treeitem", class: "sl-exam-picker-file" },
        h(
          "button",
          { type: "button", class: "sl-exam-picker-choose", "data-path": file.path, "data-class-readable": file.classReadable ? "1" : null, onClick: () => choose(file) },
          file.name
        ),
        file.classReadable ? h("span", { class: "sl-exam-picker-readable", title: t("exam.handouts.classReadableShort") }, ` ${t("exam.handouts.classReadableShort")}`) : null
      );
    const folderItem = (name, node, open) =>
      h("li", { role: "treeitem", class: "sl-exam-picker-folder" }, h("details", { open }, h("summary", {}, name), branch(node, open)));
    const branch = (node, open) =>
      h(
        "ul",
        { role: "group" },
        [...node.folders.entries()].sort(([a], [b]) => byName(a, b)).map(([name, child]) => folderItem(name, child, open)),
        [...node.files].sort((a, b) => byName(a.name, b.name)).map(fileItem)
      );
    let files = [];
    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const shown = query === "" ? files : files.filter((file) => file.name.toLowerCase().includes(query));
      tree.replaceChildren(shown.length === 0 ? h("p", { class: "sl-exam-quiet" }, t("exam.handouts.noMatch")) : branch(treeOf(shown), query !== ""));
    };
    search.addEventListener("input", draw);
    const dialog = h(
      "dialog",
      { class: "sl-exam-dialog sl-exam sl-exam-picker", "aria-label": t("exam.handouts.pickerTitle") },
      h("h3", {}, t("exam.handouts.pickerTitle")),
      search,
      warning,
      tree,
      h("p", {}, h("button", { type: "button", class: "sl-exam-action", onClick: () => dialog.close() }, t("exam.common.cancel")))
    );
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(chosen);
    });
    // Inside the content, so the dialog takes the page's dark mode.
    (document.querySelector("#markdown-content") ?? document.body).append(dialog);
    dialog.showModal();
    search.focus();
    examApi(`/courses/${courseId}/handout-files`).then(
      (answer) => {
        files = answer.files;
        draw();
      },
      (error) => {
        tree.replaceChildren(h("p", { class: "sl-exam-message" }, error.message));
      }
    );
  });
}
