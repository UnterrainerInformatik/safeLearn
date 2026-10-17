/**
 * The pool's category page (`question-editor`), for teachers:
 *
 * - `pool-categories`: the category tree with, per category, renaming in both
 *   languages, moving up and down among its siblings, moving under another
 *   category or to the top, adding a subcategory, and deleting it while it is
 *   empty. The server refuses a duplicate name among siblings, a move into the
 *   category's own subtree and deleting a category that holds anything; the
 *   refusal is shown above the tree.
 *
 * The API refuses every session not acting as a teacher; this element only
 * draws what it answers.
 */

import { defineExamElement, ExamApiError, ExamElement, examApi, h } from "./frame.js";
import { poolAddress } from "./question-editor.js";

/** The ids of `node` and everything below it. */
function subtree(node) {
  return [node.id, ...node.children.flatMap(subtree)];
}

/** Every node of the tree with its depth, in order. */
function flatten(tree, depth = 0) {
  return tree.flatMap((node) => [{ node, depth }, ...flatten(node.children, depth + 1)]);
}

class PoolCategories extends ExamElement {
  async load() {
    return examApi("/pool/categories");
  }

  render(tree) {
    this.tree = tree;
    this.message = h("p", { class: "sl-exam-message", role: "status" }, this.lastMessage ?? "");
    this.lastMessage = null;
    return h(
      "div",
      { class: "sl-exam sl-exam-categories" },
      h("p", {}, h("a", { href: poolAddress(null, this.params.course) }, "Back to the pool")),
      this.message,
      h("h2", {}, "New category at the top"),
      this.namesForm({ submit: "Create", onSave: (names) => this.act(() => examApi("/pool/categories", { method: "POST", body: { parentId: null, ...names } }), "Created.") }),
      h("h2", {}, "Categories"),
      tree.length === 0 ? h("p", { class: "sl-exam-quiet" }, "There is no category yet.") : h("ul", { class: "sl-exam-categories-tree" }, tree.map((node, index) => this.node(node, tree, index)))
    );
  }

  /** A German and an English name with a button; `onSave` gets `{ nameDe, nameEn }`. */
  namesForm({ nameDe = "", nameEn = "", submit, onSave }) {
    const de = h("input", { type: "text", name: "nameDe", value: nameDe, placeholder: "German name", "aria-label": "German name", required: true, maxlength: "200" });
    const en = h("input", { type: "text", name: "nameEn", value: nameEn, placeholder: "English name", "aria-label": "English name", required: true, maxlength: "200" });
    return h(
      "form",
      {
        class: "sl-exam-categories-names",
        onSubmit: (event) => {
          event.preventDefault();
          onSave({ nameDe: de.value, nameEn: en.value });
        },
      },
      de,
      en,
      h("button", { type: "submit" }, submit)
    );
  }

  node(node, siblings, index) {
    const excluded = new Set(subtree(node));
    const target = h(
      "select",
      { "aria-label": `Move ${node.nameDe} under` },
      h("option", { value: "" }, "(the top)"),
      flatten(this.tree)
        .filter(({ node: candidate }) => !excluded.has(candidate.id))
        .map(({ node: candidate, depth }) =>
          h("option", { value: String(candidate.id), selected: candidate.id === node.parentId }, `${"  ".repeat(depth)}${candidate.nameDe}`)
        )
    );
    if (node.parentId === null) target.value = "";
    const panel = h("div", { class: "sl-exam-categories-panel", hidden: true });
    const open = (content) => {
      panel.replaceChildren(content);
      panel.hidden = false;
      panel.querySelector("input")?.focus();
    };
    const button = (label, title, action, disabled = false) =>
      h("button", { type: "button", title, "aria-label": `${title}: ${node.nameDe}`, disabled, onClick: action }, label);
    const held = node.questions === node.total ? `${node.questions}` : `${node.questions}, ${node.total} with below`;
    return h(
      "li",
      { "data-category": String(node.id) },
      h(
        "div",
        { class: "sl-exam-categories-line" },
        h("span", { class: "sl-exam-categories-name" }, node.nameDe, h("span", { class: "sl-exam-quiet" }, ` / ${node.nameEn} (${held})`)),
        h(
          "span",
          { class: "sl-exam-categories-tools" },
          button("↑", "Move up", () => this.act(() => this.update(node, { move: "up" })), index === 0),
          button("↓", "Move down", () => this.act(() => this.update(node, { move: "down" })), index === siblings.length - 1),
          button("Rename", "Rename", () =>
            open(this.namesForm({ nameDe: node.nameDe, nameEn: node.nameEn, submit: "Save", onSave: (names) => this.act(() => this.update(node, names), "Renamed.") }))
          ),
          target,
          button("Move", "Move under the chosen category", () =>
            this.act(() => this.update(node, { parentId: target.value === "" ? null : Number(target.value) }), "Moved.")
          ),
          button("+ Subcategory", "Add a subcategory", () =>
            open(this.namesForm({ submit: "Create", onSave: (names) => this.act(() => examApi("/pool/categories", { method: "POST", body: { parentId: node.id, ...names } }), "Created.") }))
          ),
          button("Delete", "Delete", () => {
            if (!window.confirm(`Delete the category ${node.nameDe}?`)) return;
            this.act(() => examApi(`/pool/categories/${node.id}`, { method: "DELETE" }), "Deleted.");
          })
        )
      ),
      panel,
      node.children.length > 0 ? h("ul", {}, node.children.map((child, childIndex) => this.node(child, node.children, childIndex))) : null
    );
  }

  update(node, body) {
    return examApi(`/pool/categories/${node.id}`, { method: "PUT", body });
  }

  /** Sends `request`; on success draws the tree anew, on a refusal says why and keeps it. */
  async act(request, done = "") {
    this.message.classList.remove("sl-embed-error");
    try {
      await request();
      this.lastMessage = done;
      await this.reload();
    } catch (error) {
      this.message.classList.add("sl-embed-error");
      this.message.textContent = error instanceof ExamApiError && error.status < 500 ? error.message : "That did not work. Please try again.";
    }
  }
}

defineExamElement("pool-categories", PoolCategories);
