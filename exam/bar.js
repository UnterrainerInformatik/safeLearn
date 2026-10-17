/**
 * The module's bar (`exam-navigation`): school year, class, course and
 * gradebook, from left to right, on every teacher page of the module, and at
 * its right end the buttons to the question pool and the online tests.
 *
 * Built here, in the page shell, from the database - synchronously, like
 * every other module read - so it is part of the page as it is first shown and
 * costs no request of its own (design.md, D7). It is only ever built inside a
 * `teacherPage` route, so a student, or a teacher in student view, never
 * receives it. `client/bar.js` turns a choice into navigation and opens the
 * creation dialogs.
 */

import { currentYear, getClass, getCourse, getYear, listClasses, listCourses, listYears } from "./classes.js";
import { semesterToday } from "./gradebook.js";
import { semesters } from "./grading.js";
import { embedPlaceholder, wrapInPage } from "../obsidian.js";

const semesterLabels = { ws: "Winter semester", ss: "Whole year" };

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * What the bar shows for a page that names `context` - any of `yearId`,
 * `classId`, `courseId` and `semester`. A position names what is given or
 * follows from the positions to its right (a course's class and year); the
 * current school year is chosen when nothing else is. Positions to the right
 * of what the page names stay empty.
 */
export function barState(db, { yearId = null, classId = null, courseId = null, semester = null } = {}) {
  const course = courseId === null ? null : getCourse(db, courseId);
  const klass = course ? getClass(db, course.classId) : classId === null ? null : getClass(db, classId);
  const years = listYears(db);
  const year = klass ? klass.year : yearId !== null ? getYear(db, yearId) : (currentYear(db) ?? years.at(-1) ?? null);
  return {
    years,
    year,
    classes: year ? listClasses(db, year.id) : [],
    klass,
    courses: klass ? listCourses(db, klass.id) : [],
    course,
    semester: course && semester !== null && semesters.includes(semester) ? semester : null,
  };
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

/**
 * One position: its name, a link to its overview while it has a value, the
 * choice, and - for the first three - a button to create a new one, offered
 * only once every position to its left has a value.
 */
function position({ name, label, href, choices, chosen, enabled, create }) {
  const title = href ? `<a href="${escapeHtml(href)}">${label}</a>` : `<span>${label}</span>`;
  const select = `<select data-position="${name}" aria-label="${label}"${enabled ? "" : " disabled"}>
      ${option("", "–", chosen === null)}
      ${choices.map((choice) => option(choice.value, choice.label, choice.value === chosen)).join("")}
    </select>`;
  const button =
    create === undefined
      ? ""
      : `<button type="button" data-create="${name}" title="${escapeHtml(create.title)}" aria-label="${escapeHtml(create.title)}"${create.offered ? "" : " disabled"}>+</button>`;
  return `<span class="sl-exam-bar-position" data-position="${name}">${title} ${select} ${button}</span>`;
}

/**
 * The query that keeps what the bar has chosen when one of its buttons leads
 * to another page: the rightmost position with a value names the others.
 */
function contextQuery({ year, klass, course }) {
  if (course) return `?course=${course.id}`;
  if (klass) return `?class=${klass.id}`;
  if (year) return `?year=${year.id}`;
  return "";
}

/** A button at the bar's right end, marked while its page is the one shown. */
function pageButton({ name, label, href, current }) {
  return `<a class="sl-exam-bar-page" data-page="${name}" href="${escapeHtml(href)}"${current === name ? ' aria-current="page"' : ""}>${label}</a>`;
}

/**
 * The bar's markup for `context`, as `barState` resolves it. `current` names
 * the page shown when it is one of the bar's buttons (`pool`, `tests`); the
 * bar's choices then stay on that page.
 */
export function renderBar(db, context, current = null) {
  const { years, year, classes, klass, courses, course, semester } = barState(db, context);
  const shownSemester = semester ?? (course ? semesterToday(course.year) : null);
  const query = contextQuery({ year, klass, course });
  return `<nav class="sl-exam-bar" aria-label="Exam module"
      data-year="${year?.id ?? ""}" data-class="${klass?.id ?? ""}" data-course="${course?.id ?? ""}" data-current="${current ?? ""}">
    ${position({
      name: "year",
      label: "School year",
      href: year ? `/exam/?year=${year.id}` : null,
      choices: years.map((candidate) => ({ value: String(candidate.id), label: candidate.current ? `${candidate.name} (current)` : candidate.name })),
      chosen: year ? String(year.id) : null,
      enabled: years.length > 0,
      create: { title: "New school year", offered: true },
    })}
    ${position({
      name: "class",
      label: "Class",
      href: klass ? `/exam/classes/${klass.id}` : null,
      choices: classes.map((candidate) => ({ value: String(candidate.id), label: candidate.name.toUpperCase() })),
      chosen: klass ? String(klass.id) : null,
      enabled: year !== null,
      create: { title: "New class in this school year", offered: year !== null },
    })}
    ${position({
      name: "course",
      label: "Course",
      href: course ? `/exam/courses/${course.id}` : null,
      choices: courses.map((candidate) => ({ value: String(candidate.id), label: candidate.subject })),
      chosen: course ? String(course.id) : null,
      enabled: klass !== null,
      create: { title: "New course in this class", offered: klass !== null },
    })}
    ${position({
      name: "gradebook",
      label: "Gradebook",
      href: course ? `/exam/courses/${course.id}/gradebook?semester=${shownSemester}` : null,
      choices: course ? semesters.map((value) => ({ value, label: semesterLabels[value] })) : [],
      chosen: semester,
      enabled: course !== null,
    })}
    <span class="sl-exam-bar-pages">
      ${pageButton({ name: "pool", label: "Question pool", href: `/exam/pool${query}`, current })}
      ${pageButton({ name: "tests", label: "Online tests", href: `/exam/tests${query}`, current })}
    </span>
  </nav>`;
}

/**
 * A teacher page of the module: the bar for `context`, the heading and one
 * element, in the instance's frame at the whole width. Only for routes behind
 * `teacherPage`. `current` marks the bar's button of this page, if it has one.
 */
export async function teacherShell({ db, startPage, req, title, context, kind, params, current = null }) {
  const body = `
    ${renderBar(db, context, current)}
    <h1>${escapeHtml(title)}</h1>
    ${embedPlaceholder(kind, params)}`;
  return wrapInPage(body, startPage(), req, { title, wide: true });
}

/**
 * The bar's context named by a page's query - `course`, `class` or `year`, an
 * id each - for the pages the bar's buttons open. An id that is not one names
 * nothing; a record there is none of is refused by `barState`.
 */
export function contextFromQuery(query) {
  const id = (value) => (typeof value === "string" && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null);
  return { yearId: id(query.year), classId: id(query.class), courseId: id(query.course) };
}
