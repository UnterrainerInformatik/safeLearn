/**
 * The module bar's client (`exam-navigation`). The bar itself comes with the
 * page (`exam/bar.js`); this turns a choice into navigation to the page for
 * it, and opens the creation dialogs, each holding the element that creates
 * the record. The element navigates to the new record once it exists, and that
 * page's bar has it chosen.
 *
 * A class or course position with nothing chosen and exactly one choice is
 * chosen at once, as if the teacher had chosen it (class-bound-teachers D7):
 * on the module's start page, and on a page reached by choosing a year or a
 * class in the bar. A page reached any other way - a position's link, an
 * emptied position, a link on a page - stays as it is.
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

/**
 * The key under which a page learns that it was reached by choosing a year
 * or a class in the bar, or by the bar choosing a single choice for the
 * teacher: only then, and on the module's start page, does it choose a
 * single choice in turn (class-bound-teachers D7).
 */
const cascadeKey = "sl-exam-bar-cascade";

/** The address of the page shown, as a destination names it. */
function here() {
  return `${window.location.pathname}${window.location.search}`;
}

/** The address `target` names, as `here()` would read it there. */
function addressOf(target) {
  const url = new URL(target, window.location.href);
  return `${url.pathname}${url.search}`;
}

/** Tells the page at `target` that it may go on choosing for the teacher. */
function cascadeTo(target) {
  try {
    window.sessionStorage.setItem(cascadeKey, addressOf(target));
  } catch {
    // Without session storage only the start page chooses.
  }
}

/** Whether this page was reached by a choice of year or class, or by the bar's own; asked once. */
function reachedByChoice() {
  try {
    const reached = window.sessionStorage.getItem(cascadeKey) === here();
    window.sessionStorage.removeItem(cascadeKey);
    return reached;
  } catch {
    return false;
  }
}

/**
 * Whether the module's start page is shown as the start: `/exam/` without a
 * year named. Following the year position's link names one, so that
 * overview stays.
 */
function isModuleStart() {
  return (window.location.pathname === "/exam/" || window.location.pathname === "/exam") && window.location.search === "";
}

/**
 * The class or the course position, the first from the left, that has
 * nothing chosen and offers exactly one choice, with that choice; null when
 * there is none. Never the semester position, and never on a page whose
 * choices do not follow the address (the photo import).
 */
export function singleChoice(bar) {
  if (bar.dataset.current === "photos") return null;
  for (const position of ["class", "course"]) {
    const select = bar.querySelector(`select[data-position="${position}"]`);
    if (!select || select.disabled || select.value !== "") continue;
    const choices = [...select.options].filter((option) => option.value !== "");
    return choices.length === 1 ? { position, value: choices[0].value } : null;
  }
  return null;
}

export function connectBar(bar) {
  publishBottom(bar);
  bar.addEventListener("change", (event) => {
    const select = event.target.closest("select[data-position]");
    if (!select) return;
    const target =
      keptDestination(select.selectedOptions[0], bar.dataset) ?? destination(select.dataset.position, select.value, bar.dataset);
    if (!target) return;
    // A year or a class chosen lets the page it opens choose a single choice to its right;
    // emptying a position, or choosing a course, is the teacher's last word.
    if (select.value !== "" && (select.dataset.position === "year" || select.dataset.position === "class")) cascadeTo(target);
    window.location.assign(target);
  });
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-create]");
    if (button && !button.disabled) openCreator(bar, button.dataset.create);
  });
  // A position with a single choice is chosen at once, one position after the other.
  const reached = reachedByChoice();
  if (!reached && !isModuleStart()) return;
  const single = singleChoice(bar);
  if (!single) return;
  const target = destination(single.position, single.value, bar.dataset);
  // A page that would lead to itself again chooses nothing.
  if (!target || addressOf(target) === here()) return;
  cascadeTo(target);
  window.location.replace(target);
}
