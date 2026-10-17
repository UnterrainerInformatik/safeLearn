/**
 * The module bar's client (`exam-navigation`). The bar itself comes with the
 * page (`exam/bar.js`); this turns a choice into navigation to the page for
 * it, and opens the creation dialogs, each holding the element that creates
 * the record. The element navigates to the new record once it exists, and that
 * page's bar has it chosen.
 */

import { elementFor, h } from "./frame.js";

/** Where a choice leads; an emptied position leads to the overview of the one to its left. */
function destination(position, value, { year, class: klass, course }) {
  const id = encodeURIComponent(value);
  switch (position) {
    case "year":
      return value ? `/exam/?year=${id}` : "/exam/";
    case "class":
      return value ? `/exam/classes/${id}` : `/exam/?year=${encodeURIComponent(year)}`;
    case "course":
      return value ? `/exam/courses/${id}` : `/exam/classes/${encodeURIComponent(klass)}`;
    case "gradebook":
      return value ? `/exam/courses/${encodeURIComponent(course)}/gradebook?semester=${id}` : `/exam/courses/${encodeURIComponent(course)}`;
    default:
      return null;
  }
}

/** The element a "new …" button opens, and the parameters it needs. */
const creators = {
  year: { kind: "year-new", title: "New school year", params: () => ({}) },
  class: { kind: "class-new", title: "New class", params: (bar) => ({ slYear: bar.dataset.year }) },
  course: { kind: "course-new", title: "New course", params: (bar) => ({ slClass: bar.dataset.class }) },
};

function openCreator(bar, what) {
  const creator = creators[what];
  const name = creator && elementFor(creator.kind);
  if (!name) return;
  const element = document.createElement(name);
  Object.assign(element.dataset, creator.params(bar));
  const dialog = h(
    "dialog",
    { class: "sl-exam-dialog sl-exam", "aria-label": creator.title },
    h("h3", {}, creator.title),
    element,
    h("p", {}, h("button", { type: "button", onclick: () => dialog.close() }, "Cancel"))
  );
  dialog.addEventListener("close", () => dialog.remove());
  bar.after(dialog);
  dialog.showModal();
}

export function connectBar(bar) {
  bar.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-position]");
    if (!select) return;
    const target = destination(select.dataset.position, select.value, bar.dataset);
    if (target) window.location.assign(target);
  });
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-create]");
    if (button && !button.disabled) openCreator(bar, button.dataset.create);
  });
}
