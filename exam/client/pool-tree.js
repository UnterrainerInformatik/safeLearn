/**
 * The question pool's category tree, where the categories are also maintained
 * (`question-editor`, exam-ui-consistency design D3-D7):
 *
 * - a click on a category chooses it for the list, and its fold (▸/▾) folds;
 * - each category offers 📝 (a new question in it), `+` (a subcategory, by a
 *   small name popup), ✎ (rename, also by a double click on its name) and,
 *   only while it holds nothing, a bin confirmed by a second click; the end of
 *   the tree offers a new top-level category;
 * - a category is dragged onto a category to become its last subcategory, or
 *   between two to stand there; a question row of the list is dragged onto a
 *   category to move it there (`tree-drag.js`);
 * - everything also by keyboard: an ARIA tree with one tab stop, ↑/↓ and ←/→,
 *   Ctrl+X and Ctrl+V for categories and questions, Alt+↑/↓ among siblings,
 *   F2, Insert or `+`, and Delete - listed under the tree.
 *
 * A refusal is shown at the category it concerns, in the tree drawn anew from
 * the server, so a refused move leaves the tree as it was.
 */

import { confirmButton, ExamApiError, examApi, h, t } from "./frame.js";
import { enableTreeDrag } from "./tree-drag.js";

/** Why a request was refused, in a sentence for the teacher. */
function refusal(error) {
  return error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.pool.actionFailed");
}

export class CategoryTree {
  /**
   * `onChoose(id)` follows a chosen category (null for all), `onChanged()`
   * follows any change of categories or questions, and `newQuestionAddress(id)`
   * is the editor's address for a new question in category `id`.
   */
  constructor({ tree, chosenId, onChoose, onChanged, newQuestionAddress }) {
    this.tree = tree;
    this.chosenId = chosenId;
    this.onChoose = onChoose;
    this.onChanged = onChanged;
    this.newQuestionAddress = newQuestionAddress;
    this.collapsed = new Set();
    this.focusedId = null;
    this.cut = null;
    this.notice = null;
    this.status = h("p", { class: "sl-exam-message sl-exam-tree-status", role: "status" });
    this.list = h("ul", { role: "tree", "aria-label": t("exam.pool.categories"), onKeydown: (event) => this.key(event) });
    this.element = h(
      "nav",
      { class: "sl-exam-pool-tree", "aria-label": t("exam.pool.categories") },
      this.list,
      h("p", { class: "sl-exam-tree-end" }, h("button", { type: "button", class: "sl-exam-action sl-exam-tree-add-top", onClick: (event) => this.openPopup(event.currentTarget.parentElement, null, null) }, t("exam.tree.newTopCategory"))),
      this.status,
      h("p", { class: "sl-exam-quiet sl-exam-tree-keys" }, t("exam.tree.keys"))
    );
    this.draw();
  }

  /** Every category by id, with its parent and its siblings. */
  index() {
    const byId = new Map();
    const walk = (nodes, parent) =>
      nodes.forEach((node) => {
        byId.set(node.id, { node, parent, siblings: nodes });
        walk(node.children, node);
      });
    walk(this.tree, null);
    return byId;
  }

  draw() {
    this.byId = this.index();
    if (this.focusedId !== null && this.focusedId !== "" && !this.byId.has(this.focusedId)) this.focusedId = null;
    const all = this.item({ id: "", nameDe: t("exam.pool.allCategories"), children: [] }, 1);
    this.list.replaceChildren(all, ...this.tree.map((node) => this.item(node, 1)));
    // One tab stop: the focused item, else the chosen one, else the first.
    const stop = this.itemOf(this.focusedId ?? this.chosenId ?? "") ?? all;
    stop.tabIndex = 0;
  }

  itemOf(id) {
    return this.list.querySelector(`li[data-category="${id === null ? "" : id}"]`);
  }

  /** One category's item: its row, its message, and its children. */
  item(node, level) {
    const root = node.id === "";
    const open = !this.collapsed.has(node.id);
    const hasChildren = node.children.length > 0;
    const chosen = root ? this.chosenId === null : this.chosenId === node.id;
    const name = h(
      "button",
      {
        type: "button",
        tabIndex: -1,
        class: chosen ? "sl-exam-pool-category is-chosen" : "sl-exam-pool-category",
        "data-category": String(node.id),
        onClick: () => this.choose(root ? null : node.id),
        onDblclick: root ? null : (event) => this.openPopup(event.currentTarget.closest(".sl-exam-tree-row"), null, node),
      },
      node.nameDe,
      root ? null : h("span", { class: "sl-exam-quiet" }, ` (${node.total})`)
    );
    const fold = h(
      "span",
      { class: "sl-exam-tree-fold", "aria-hidden": "true", onClick: hasChildren ? () => this.fold(node.id, open) : null },
      hasChildren ? (open ? "▾" : "▸") : ""
    );
    const tool = (label, title, onClick, className) =>
      h("button", { type: "button", tabIndex: -1, class: `sl-exam-tree-tool ${className}`, title, "aria-label": title, onClick }, label);
    const tools = root
      ? null
      : h(
          "span",
          { class: "sl-exam-tree-tools" },
          h(
            "a",
            { class: "sl-exam-tree-tool sl-exam-tree-new-question", tabIndex: -1, href: this.newQuestionAddress(node.id), title: t("exam.tree.newQuestion", { name: node.nameDe }), "aria-label": t("exam.tree.newQuestion", { name: node.nameDe }) },
            "📝"
          ),
          tool("+", t("exam.tree.addSubcategory", { name: node.nameDe }), (event) => this.openPopup(event.currentTarget.closest(".sl-exam-tree-row"), node, null), "sl-exam-tree-add"),
          tool("✎", t("exam.tree.rename", { name: node.nameDe }), (event) => this.openPopup(event.currentTarget.closest(".sl-exam-tree-row"), null, node), "sl-exam-tree-rename"),
          node.empty
            ? confirmButton({
                class: "sl-exam-tree-tool sl-exam-tree-delete",
                tabIndex: -1,
                title: t("exam.tree.delete", { name: node.nameDe }),
                "aria-label": t("exam.tree.delete", { name: node.nameDe }),
                label: "🗑",
                armed: t("exam.tree.deleteArmed", { name: node.nameDe }),
                action: () => this.act(node.id, () => examApi(`/pool/categories/${node.id}`, { method: "DELETE" })),
              })
            : null
        );
    const notice = this.notice && this.notice.id === node.id ? h("p", { class: "sl-exam-tree-message sl-embed-error", role: "alert" }, this.notice.text) : null;
    return h(
      "li",
      {
        role: "treeitem",
        "data-category": String(node.id),
        "aria-level": String(level),
        "aria-selected": String(chosen),
        "aria-expanded": hasChildren ? String(open) : null,
        "aria-label": root ? node.nameDe : `${node.nameDe} (${node.total})`,
        tabIndex: -1,
        class: this.cut?.kind === "category" && this.cut.id === node.id ? "is-cut" : null,
        onFocus: (event) => {
          if (event.target === event.currentTarget) this.focusedId = root ? "" : node.id;
        },
      },
      h("div", { class: "sl-exam-tree-row", "data-drop": root ? "top" : String(node.id) }, fold, name, tools),
      notice,
      hasChildren && open ? h("ul", { role: "group" }, node.children.map((child) => this.item(child, level + 1))) : null
    );
  }

  choose(id) {
    this.chosenId = id;
    for (const button of this.list.querySelectorAll(".sl-exam-pool-category")) {
      button.classList.toggle("is-chosen", button.dataset.category === String(id ?? ""));
    }
    for (const li of this.list.querySelectorAll("li[role=treeitem]")) li.setAttribute("aria-selected", String(li.dataset.category === String(id ?? "")));
    this.onChoose(id);
  }

  fold(id, open) {
    if (open) this.collapsed.add(id);
    else this.collapsed.delete(id);
    this.focusedId = id;
    this.draw();
    this.itemOf(id)?.focus();
  }

  /** Sends `request`, then draws the tree anew; a refusal is shown at category `at`. */
  async act(at, request, { focus = at } = {}) {
    this.notice = null;
    this.status.textContent = "";
    this.closePopup();
    let failed = null;
    try {
      await request();
    } catch (error) {
      failed = refusal(error);
    }
    if (failed && at !== null) this.notice = { id: at, text: failed };
    else if (failed) this.status.textContent = failed;
    await this.refresh();
    if (focus !== null && focus !== undefined) {
      this.focusedId = focus;
      this.draw();
      this.itemOf(focus)?.focus();
    }
    if (!failed) this.onChanged();
    return failed;
  }

  async refresh() {
    try {
      this.tree = await examApi("/pool/categories");
    } catch (error) {
      console.error("[exam] the category tree could not be loaded:", error);
    }
    if (this.chosenId !== null && !this.index().has(this.chosenId)) {
      this.chosenId = null;
      this.onChoose(null);
    }
    this.draw();
  }

  /** Places category `id` as `zone` (`into`, `before`, `after`) of category `targetId`, or at the end of the top for "top". */
  placeCategory(id, targetId, zone) {
    if (targetId === id) return;
    let body;
    if (targetId === "top") body = { parentId: null, before: null };
    else if (zone === "into") body = { parentId: targetId, before: null };
    else {
      // "After" a category is before the next sibling that is not the dragged one, or the end.
      const { parent, siblings } = this.byId.get(targetId);
      const after = siblings.slice(siblings.findIndex((node) => node.id === targetId) + 1).find((node) => node.id !== id);
      body = { parentId: parent ? parent.id : null, before: zone === "before" ? targetId : (after?.id ?? null) };
    }
    return this.act(id, () => examApi(`/pool/categories/${id}`, { method: "PUT", body }));
  }

  /** Moves question `id` into category `categoryId`; a refusal goes to the tree's status line. */
  moveQuestion(id, categoryId) {
    return this.act(null, () => examApi(`/pool/questions/${id}/category`, { method: "POST", body: { categoryId } }), { focus: categoryId });
  }

  // ------------------------------------------------------------- dragging

  /** Makes categories and the list's question rows (`tr[data-question]` under `root`) draggable. */
  enableDrag(root) {
    enableTreeDrag(root, {
      scroller: this.element,
      sourceOf: (element) => {
        if (element.closest("input, a, .sl-exam-tree-tool, .sl-exam-tree-popup")) return null;
        const name = element.closest(".sl-exam-pool-category");
        if (name && this.list.contains(name) && name.dataset.category !== "") {
          const id = Number(name.dataset.category);
          return { kind: "category", id, label: this.byId.get(id).node.nameDe, element: name.closest(".sl-exam-tree-row") };
        }
        const row = element.closest("tr[data-question]");
        if (row) return { kind: "question", id: Number(row.dataset.question), label: row.querySelector(".sl-exam-pool-name")?.textContent ?? "", element: row };
        return null;
      },
      targetAt: (x, y, item) => {
        const row = document.elementFromPoint(x, y)?.closest(".sl-exam-tree-row");
        if (!row || !this.list.contains(row)) return null;
        const target = row.dataset.drop;
        if (item.kind === "question") return target === "top" ? null : { element: row, zone: "into" };
        if (target === "top") return { element: row, zone: "into" };
        if (Number(target) === item.id) return null;
        const box = row.getBoundingClientRect();
        const share = (y - box.top) / box.height;
        return { element: row, zone: share < 0.25 ? "before" : share > 0.75 ? "after" : "into" };
      },
      drop: (item, row, zone) => {
        const target = row.dataset.drop === "top" ? "top" : Number(row.dataset.drop);
        if (item.kind === "question") this.moveQuestion(item.id, target);
        else this.placeCategory(item.id, target, zone);
      },
    });
  }

  // ------------------------------------------------------------ the popup

  /**
   * The small name popup under `anchor` (D7): a new category under `parent`
   * (null: at the top), or `renamed`'s names. A refusal stays in the popup.
   */
  openPopup(anchor, parent, renamed) {
    this.closePopup();
    const title = renamed ? t("exam.tree.renameTitle", { name: renamed.nameDe }) : parent ? t("exam.tree.newUnder", { name: parent.nameDe }) : t("exam.tree.newAtTop");
    const de = h("input", { type: "text", name: "nameDe", value: renamed?.nameDe ?? "", "aria-label": t("exam.categories.germanName"), placeholder: t("exam.categories.germanName"), required: true, maxlength: "200" });
    const en = h("input", { type: "text", name: "nameEn", value: renamed?.nameEn ?? "", "aria-label": t("exam.categories.englishName"), placeholder: t("exam.categories.englishName"), required: true, maxlength: "200" });
    const message = h("p", { class: "sl-exam-message sl-embed-error", role: "alert" });
    const back = renamed?.id ?? parent?.id ?? null;
    const cancel = () => {
      this.closePopup();
      if (back !== null) this.itemOf(back)?.focus();
    };
    const form = h(
      "form",
      {
        class: "sl-exam-tree-popup",
        role: "dialog",
        "aria-label": title,
        onKeydown: (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
          // Keys typed into the popup are not the tree's.
          event.stopPropagation();
        },
        onSubmit: async (event) => {
          event.preventDefault();
          const names = { nameDe: de.value, nameEn: en.value };
          message.textContent = "";
          try {
            const saved = renamed
              ? await examApi(`/pool/categories/${renamed.id}`, { method: "PUT", body: names })
              : await examApi("/pool/categories", { method: "POST", body: { parentId: parent ? parent.id : null, ...names } });
            this.closePopup();
            if (parent) this.collapsed.delete(parent.id);
            await this.refresh();
            this.focusedId = saved.id;
            this.draw();
            this.itemOf(saved.id)?.focus();
            this.onChanged();
          } catch (error) {
            message.textContent = refusal(error);
          }
        },
      },
      h("strong", {}, title),
      h("label", {}, `${t("exam.tree.german")} `, de),
      h("label", {}, `${t("exam.tree.english")} `, en),
      h(
        "p",
        { class: "sl-exam-actions" },
        h("button", { type: "submit", class: "sl-exam-action sl-exam-action-primary" }, t("exam.tree.ok")),
        h("button", { type: "button", class: "sl-exam-action sl-exam-tree-cancel", onClick: cancel }, t("exam.tree.cancel"))
      ),
      message
    );
    anchor.after(form);
    this.popup = form;
    de.focus();
    de.select();
  }

  closePopup() {
    this.popup?.remove();
    this.popup = null;
  }

  // ----------------------------------------------------------- the keyboard

  /** Cuts a category or a question (`{ kind, id, label }`) for Ctrl+V on a category. */
  cutItem(item) {
    this.cut = item;
    this.status.textContent = t("exam.tree.cut", { name: item.label });
    for (const marked of document.querySelectorAll(".sl-exam-pool .is-cut")) marked.classList.remove("is-cut");
    if (item.kind === "category") this.itemOf(item.id)?.classList.add("is-cut");
    else item.element?.classList.add("is-cut");
  }

  key(event) {
    const li = event.target.closest("li[role=treeitem]");
    if (!li || event.target.closest(".sl-exam-tree-popup")) return;
    const id = li.dataset.category === "" ? "" : Number(li.dataset.category);
    const entry = id === "" ? null : this.byId.get(id);
    const items = [...this.list.querySelectorAll("li[role=treeitem]")];
    const go = (target) => {
      if (!target) return;
      for (const item of items) item.tabIndex = -1;
      target.tabIndex = 0;
      target.focus();
    };
    const ctrl = event.ctrlKey || event.metaKey;
    const done = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      if (entry) this.act(id, () => examApi(`/pool/categories/${id}`, { method: "PUT", body: { move: event.key === "ArrowUp" ? "up" : "down" } }));
      return done();
    }
    switch (event.key) {
      case "ArrowDown":
        go(items[items.indexOf(li) + 1]);
        return done();
      case "ArrowUp":
        go(items[items.indexOf(li) - 1]);
        return done();
      case "ArrowRight":
        if (entry && entry.node.children.length > 0) {
          if (this.collapsed.has(id)) this.fold(id, false);
          else go(li.querySelector("li[role=treeitem]"));
        }
        return done();
      case "ArrowLeft":
        if (entry && entry.node.children.length > 0 && !this.collapsed.has(id)) this.fold(id, true);
        else go(li.parentElement.closest("li[role=treeitem]"));
        return done();
      case "Enter":
      case " ":
        if (event.target !== li) return;
        this.choose(id === "" ? null : id);
        return done();
      case "F2":
        if (entry) this.openPopup(li.querySelector(".sl-exam-tree-row"), null, entry.node);
        return done();
      case "Insert":
      case "+":
        if (entry) this.openPopup(li.querySelector(".sl-exam-tree-row"), entry.node, null);
        else this.openPopup(this.element.querySelector(".sl-exam-tree-end"), null, null);
        return done();
      case "Delete": {
        const bin = li.querySelector(":scope > .sl-exam-tree-row .sl-exam-tree-delete");
        if (bin) {
          bin.click();
          bin.focus();
        }
        return done();
      }
      case "Escape":
        if (this.cut) {
          this.cut = null;
          this.status.textContent = "";
          for (const marked of document.querySelectorAll(".sl-exam-pool .is-cut")) marked.classList.remove("is-cut");
        }
        return;
      default:
    }
    if (ctrl && event.key.toLowerCase() === "x" && entry) {
      this.cutItem({ kind: "category", id, label: entry.node.nameDe });
      return done();
    }
    if (ctrl && event.key.toLowerCase() === "v" && this.cut) {
      const cut = this.cut;
      this.cut = null;
      if (cut.kind === "question") {
        if (entry) this.moveQuestion(cut.id, id);
      } else if (cut.id !== id) {
        this.act(cut.id, () => examApi(`/pool/categories/${cut.id}`, { method: "PUT", body: { parentId: entry ? id : null, before: null } }), { focus: cut.id });
      }
      return done();
    }
  }
}
