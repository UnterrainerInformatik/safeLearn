/**
 * The module's bar (`exam-navigation`): school year, class, course and
 * gradebook, from left to right, on every teacher page of the module.
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

/** The bar's markup for `context`, as `barState` resolves it. */
export function renderBar(db, context) {
  const { years, year, classes, klass, courses, course, semester } = barState(db, context);
  const shownSemester = semester ?? (course ? semesterToday(course.year) : null);
  return `<nav class="sl-exam-bar" aria-label="Exam module"
      data-year="${year?.id ?? ""}" data-class="${klass?.id ?? ""}" data-course="${course?.id ?? ""}">
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
  </nav>`;
}

/**
 * A teacher page of the module: the bar for `context`, the heading and one
 * element, in the instance's frame at the whole width. Only for routes behind
 * `teacherPage`.
 */
export async function teacherShell({ db, startPage, req, title, context, kind, params }) {
  const body = `
    ${renderBar(db, context)}
    <h1>${escapeHtml(title)}</h1>
    ${embedPlaceholder(kind, params)}`;
  return wrapInPage(body, startPage(), req, { title, wide: true });
}
