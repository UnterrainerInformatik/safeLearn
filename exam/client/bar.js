/**
 * The module bar's client (`exam-navigation`). The bar itself comes with the
 * page (`exam/bar.js`); this turns a choice into navigation to the page for
 * it, and opens the creation dialogs, each holding the element that creates
 * the record. The element navigates to the new record once it exists, and that
 * page's bar has it chosen.
 */

import { elementFor, h, t } from "./frame.js";

/**
 * Where a choice leads on the page of one of the bar's buttons (`pool`,
 * `tests`): that page again, for what is now chosen. An emptied position
 * leaves the one to its left chosen.
 */
function samePage(page, position, value, { year, class: klass }) {
  const named = (key, id) => `/exam/${page}?${key}=${encodeURIComponent(id)}`;
  switch (position) {
    case "year":
      return value ? named("year", value) : `/exam/${page}`;
    case "class":
      return value ? named("class", value) : named("year", year);
    case "course":
      return value ? named("course", value) : named("class", klass);
    default:
      return null;
  }
}

/** Where a choice leads; an emptied position leads to the overview of the one to its left. */
function destination(position, value, { year, class: klass, course, current }) {
  const id = encodeURIComponent(value);
  if (current) {
    const target = samePage(current, position, value, { year, class: klass });
    if (target) return target;
  }
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
  year: { kind: "year-new", title: () => t("exam.bar.newYear"), params: () => ({}) },
  class: { kind: "class-new", title: () => t("exam.bar.newClassDialog"), params: (bar) => ({ slYear: bar.dataset.year }) },
  course: { kind: "course-new", title: () => t("exam.bar.newCourseDialog"), params: (bar) => ({ slClass: bar.dataset.class }) },
};

/**
 * Opens the bar's dialog that creates `what` (`year`, `class`, `course`) for
 * what the bar has chosen - also for a page's own "new" button, such as the
 * class page's `+ Course`. Without a bar on the page there is nothing to open.
 */
export function openCreatorOf(what) {
  const bar = document.querySelector(".sl-exam-bar");
  if (bar) openCreator(bar, what);
}

function openCreator(bar, what) {
  const creator = creators[what];
  const name = creator && elementFor(creator.kind);
  if (!name) return;
  const element = document.createElement(name);
  Object.assign(element.dataset, creator.params(bar));
  const dialog = h(
    "dialog",
    { class: "sl-exam-dialog sl-exam", "aria-label": creator.title() },
    h("h3", {}, creator.title()),
    element,
    h("p", {}, h("button", { type: "button", class: "sl-exam-action", onclick: () => dialog.close() }, t("exam.common.cancel")))
  );
  dialog.addEventListener("close", () => dialog.remove());
  bar.after(dialog);
  dialog.showModal();
}

/**
 * Tells the page's styles where the sticky bar ends (`--sl-exam-bar-bottom`),
 * so a column that stays in view can start below it; the bar wraps to more
 * lines on a narrow screen.
 */
function publishBottom(bar) {
  const set = () => document.documentElement.style.setProperty("--sl-exam-bar-bottom", `${Math.ceil(50 + bar.offsetHeight)}px`);
  set();
  if (typeof ResizeObserver === "function") new ResizeObserver(set).observe(bar);
}

/**
 * Where a year's or a class's choice leads when it keeps the class of the same
 * name or the course of the same subject (`data-keep-*` on the option, from
 * `exam/bar.js`): the page shown now, for the kept record - a gradebook in the
 * same semester. Null when it keeps nothing.
 */
function keptDestination(option, { semester, current }) {
  const { keepClass, keepCourse } = option?.dataset ?? {};
  if (keepCourse) {
    if (current) return samePage(current, "course", keepCourse, {});
    if (semester) return destination("gradebook", semester, { course: keepCourse });
    return destination("course", keepCourse, {});
  }
  if (keepClass) return destination("class", keepClass, { current });
  return null;
}

export function connectBar(bar) {
  publishBottom(bar);
  bar.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-position]");
    if (!select) return;
    const target =
      keptDestination(select.selectedOptions[0], bar.dataset) ?? destination(select.dataset.position, select.value, bar.dataset);
    if (target) window.location.assign(target);
  });
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-create]");
    if (button && !button.disabled) openCreator(bar, button.dataset.create);
  });
}
