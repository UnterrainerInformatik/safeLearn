/**
 * What every element of the exam module's client shares: the API call, the
 * frame an element is drawn in, a small DOM builder, and the registry of
 * element names per kind, and the reader's texts and formats. A module of its
 * own, so the element modules can import it without importing the entry
 * script that mounts them.
 */

import { loadI18n } from "./i18n.js";

/**
 * The error an API call rejects with: the status, and the module's own message
 * where it sent one (a refused input, a duplicate), for the element to show -
 * with every problem at its field for a question the editor cannot save.
 */
export class ExamApiError extends Error {
  constructor(status, message, problems = null) {
    super(message ?? t("exam.frame.answeredStatus", { status }));
    this.status = status;
    this.problems = problems;
  }
}

/**
 * A request to the module's API with the session cookie. `body`, if given, is
 * sent as JSON. Resolves to the answer's JSON; rejects with an `ExamApiError`
 * for any answer that is not a success.
 */
export async function examApi(path, { method = "GET", body } = {}) {
  const init = {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`/exam/api${path}`, init);
  if (!response.ok) {
    let answer = {};
    try {
      answer = await response.json();
    } catch {
      // No message of the module's own.
    }
    throw new ExamApiError(response.status, answer?.error, answer?.problems ?? null);
  }
  return response.json();
}

let me = null;

/**
 * What `/me` answers - who the module takes this session for, and the
 * school's periods - asked once per page and shared by every element on it.
 */
export function examMe() {
  me ??= examApi("/me").catch((error) => {
    me = null;
    throw error;
  });
  return me;
}

// Asked at once, while the catalogs load; an element asking later joins it.
examMe().catch(() => {});

/**
 * The reader's texts and formats (`ui-language`, `locale-formats`): `t(key,
 * params)` and the formatters of `i18n/format.js`, loaded before any element
 * of this page is drawn.
 */
export const { t, format, lang } = await loadI18n();

/**
 * Builds an element: `h("a", { href: "/x", class: "y" }, "text", child)`.
 * Properties starting with `on` become listeners; text is always set as text,
 * never as markup, so nothing from the database is ever parsed as HTML.
 */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "class") {
      element.className = value;
    } else if (key in element && typeof value !== "string") {
      element[key] = value;
    } else {
      element.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

/**
 * The frame every element is drawn in: a status line while it loads, the
 * element's content once it has it, and a message in place of the content if
 * loading failed. A subclass implements `load()` (returning data) and
 * `render(data)` (returning a node or HTML text); `reload()` draws it anew.
 */
export class ExamElement extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    this.reload();
  }

  reload() {
    this.showStatus(t("app.embed.loading"));
    return Promise.resolve()
      .then(() => this.load())
      .then((data) => this.show(this.render(data)))
      .catch((error) => {
        console.error(`[exam] ${this.localName} could not be loaded:`, error);
        this.showStatus(
          error instanceof ExamApiError && error.status === 404 ? t("exam.frame.notFound") : t("exam.frame.loadFailed"),
          true
        );
      });
  }

  /** The placeholder's `data-sl-*` parameters, without the prefix. */
  get params() {
    const params = {};
    for (const [key, value] of Object.entries(this.dataset)) {
      if (key.startsWith("sl") && key.length > 2) {
        params[key.charAt(2).toLowerCase() + key.slice(3)] = value;
      }
    }
    return params;
  }

  showStatus(text, failed = false) {
    const status = document.createElement("span");
    status.className = failed ? "sl-embed-status sl-embed-error" : "sl-embed-status";
    status.textContent = text;
    this.replaceChildren(status);
  }

  show(content) {
    if (typeof content === "string") {
      this.innerHTML = content;
    } else {
      this.replaceChildren(content);
    }
  }

  async load() {
    throw new Error(`${this.localName} implements no load().`);
  }

  render() {
    return "";
  }
}

/** The element names per kind. */
const elements = new Map();

export function defineExamElement(kind, constructor) {
  const name = `sl-exam-${kind}`;
  if (!customElements.get(name)) customElements.define(name, constructor);
  elements.set(kind, name);
}

/** The element name that draws `kind`, or undefined while none is built. */
export function elementFor(kind) {
  return elements.get(kind);
}

// ------------------------------------------------------------ the buttons
//
// Every action of the module is one of these (`exam-ui-conventions`): one
// look (`.sl-exam-action` in css/exam.css), at most one primary per section,
// and one way of asking before something is destroyed.

/** The classes of a module button of `kind` (`primary`, `default`, `danger`). */
function actionClass(kind, extra) {
  return ["sl-exam-action", kind && kind !== "default" ? `sl-exam-action-${kind}` : null, extra].filter(Boolean).join(" ");
}

/**
 * A button that acts: `button({ label, kind, action })`. `kind` is `primary`,
 * `default` or `danger`; `type` is `submit` for a form's own button. Further
 * properties go to the element as with `h()`.
 */
export function button({ label, kind = "default", action, class: className, type = "button", ...props }) {
  return h("button", { ...props, type, class: actionClass(kind, className), onClick: action }, label);
}

/**
 * A way to another page that is an action, such as Back to the pool or Class
 * screen: an `a` drawn exactly like a button, so middle-click and "open in a
 * new tab" keep working. `newWindow` opens it in a window of its own.
 */
export function linkButton({ label, href, kind = "default", newWindow = false, class: className, ...props }) {
  return h(
    "a",
    { ...props, href, class: actionClass(kind, className), target: newWindow ? "_blank" : undefined, rel: newWindow ? "noopener" : undefined },
    label
  );
}

/** How long an armed confirmation button waits for its second click. */
const ARMED_MS = 5000;

/**
 * A button that acts only on a second click, its label telling what the
 * second one does - the module's one way of asking twice, never a browser
 * dialog. It falls back to its first state when it loses the focus, on Escape,
 * on a click anywhere else, and after five seconds; the armed label is
 * announced (`aria-live`). `kind` defaults to `danger`; `action` gets the
 * second click's event.
 */
export function confirmButton({ class: className, label, armed, action, kind = "danger", ...props }) {
  const element = h("button", { ...props, type: "button", class: actionClass(kind, className), "aria-live": "polite" }, label);
  // A button named by `aria-label` (an icon) is renamed while armed, too.
  const named = element.getAttribute("aria-label");
  let timer;
  const elsewhere = (event) => {
    if (!element.contains(event.target)) disarm();
  };
  const disarm = () => {
    clearTimeout(timer);
    document.removeEventListener("pointerdown", elsewhere, true);
    if (element.dataset.armed !== "1") return;
    delete element.dataset.armed;
    element.textContent = label;
    if (named !== null) element.setAttribute("aria-label", named);
  };
  element.addEventListener("click", (event) => {
    if (element.dataset.armed !== "1") {
      element.dataset.armed = "1";
      element.textContent = armed;
      if (named !== null) element.setAttribute("aria-label", armed);
      timer = setTimeout(disarm, ARMED_MS);
      document.addEventListener("pointerdown", elsewhere, true);
      return;
    }
    disarm();
    action(event);
  });
  element.addEventListener("blur", disarm);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") disarm();
  });
  element.disarm = disarm;
  return element;
}

// ------------------------------------------------------- table conventions
//
// What every module table shares (`gradebook-sheet`): a marked row as a
// reading aid, leading columns that stay in place while the table scrolls
// sideways, and fields saved as they change.

/**
 * Marks the row a click or a focus lands in, one row per table: marking
 * another unmarks the first. Client state only - nothing is stored or sent
 * (design.md, D6). Returns the table.
 */
export function markRows(table) {
  const mark = (event) => {
    const row = event.target.closest("tbody tr");
    if (!row || row.closest("table") !== table) return;
    for (const marked of table.querySelectorAll("tr.is-marked")) {
      if (marked !== row) marked.classList.remove("is-marked");
    }
    row.classList.add("is-marked");
  };
  table.addEventListener("click", mark);
  table.addEventListener("focusin", mark);
  return table;
}

/**
 * Keeps the cells marked `data-sticky="<n>"` in place when `table` scrolls
 * sideways in its wrapper: each gets `position: sticky` (by its class) and a
 * `left` offset measured from the rendered widths of the sticky columns before
 * it. Fixed widths would cut long names, so the offsets are measured - once
 * the table is drawn, and again whenever its size changes, which is what a new
 * font size or typeface does without a redraw (design.md, D5).
 */
export function stickyColumns(table) {
  const measure = () => {
    const cells = [...table.querySelectorAll("[data-sticky]")];
    if (cells.length === 0 || !table.isConnected) return;
    const first = new Map();
    for (const cell of cells) {
      const index = Number(cell.dataset.sticky);
      if (!first.has(index)) first.set(index, cell);
    }
    const indices = [...first.keys()].sort((a, b) => a - b);
    const origin = first.get(indices[0]).getBoundingClientRect().left;
    const offsets = new Map(indices.map((index) => [index, first.get(index).getBoundingClientRect().left - origin]));
    for (const cell of cells) {
      cell.classList.add("sl-exam-sticky");
      cell.style.left = `${offsets.get(Number(cell.dataset.sticky))}px`;
    }
  };
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => {
      // Measured from the cells' natural places, so the old offsets go first.
      for (const cell of table.querySelectorAll("[data-sticky]")) cell.style.left = "";
      measure();
    }).observe(table);
  }
  requestAnimationFrame(measure);
  return table;
}

/** Fields with a write in flight, for the leave-page prompt. */
const saving = new Set();

window.addEventListener("beforeunload", (event) => {
  if (saving.size === 0) return;
  event.preventDefault();
  event.returnValue = "";
});

/** Why a save was refused, in a sentence for the teacher. */
function refusal(error) {
  return error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.frame.saveFailed");
}

/**
 * Saves `field` whenever its value changes - on the `change` event, so a value
 * goes out once it is complete (design.md, D4). `save(value)` sends it and
 * resolves to the server's answer, handed to `onSaved(answer, value)`.
 * `check(value)` may refuse a value at the field before any request, by
 * returning the reason.
 *
 * One request per field is in flight at a time; a value typed meanwhile waits
 * behind it, and only the latest does, so a slow answer never overwrites a
 * newer value. The field shows `is-saving`, briefly `is-saved`, or `is-refused`
 * with the reason as its title - keeping the typed value, while the stored one
 * stays as it was. `field.saveNow()` saves the current value at once.
 */
export function saveOnChange(field, { save, onSaved = () => {}, check = () => null, value = () => field.value }) {
  let inFlight = false;
  let queued;
  let hasQueued = false;
  let savedTimer;
  // The value last sent: the same value again is not sent twice.
  let sent = value();

  const state = (name, reason = null) => {
    field.classList.toggle("is-saving", name === "saving");
    field.classList.toggle("is-saved", name === "saved");
    field.classList.toggle("is-refused", name === "refused");
    if (reason) {
      field.title = reason;
      field.setAttribute("aria-invalid", "true");
    } else {
      field.removeAttribute("title");
      field.removeAttribute("aria-invalid");
    }
  };

  const send = async (current) => {
    inFlight = true;
    saving.add(field);
    clearTimeout(savedTimer);
    state("saving");
    try {
      const answer = await save(current);
      if (!hasQueued) {
        state("saved");
        savedTimer = setTimeout(() => field.classList.remove("is-saved"), 1500);
      }
      onSaved(answer, current);
    } catch (error) {
      if (!hasQueued) state("refused", refusal(error));
    } finally {
      inFlight = false;
      saving.delete(field);
      if (hasQueued) {
        hasQueued = false;
        send(queued);
      }
    }
  };

  const changed = () => {
    const current = value();
    const reason = check(current);
    if (reason) {
      hasQueued = false;
      state("refused", reason);
      return;
    }
    if (current === sent && !field.classList.contains("is-refused")) {
      hasQueued = false;
      return;
    }
    sent = current;
    if (inFlight) {
      queued = current;
      hasQueued = true;
      return;
    }
    send(current);
  };

  field.addEventListener("change", changed);
  field.saveNow = changed;
  return field;
}
