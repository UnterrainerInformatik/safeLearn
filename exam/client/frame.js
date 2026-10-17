/**
 * What every element of the exam module's client shares: the API call, the
 * frame an element is drawn in, a small DOM builder, and the registry of
 * element names per kind. A module of its own, so the element modules can
 * import it without importing the entry script that mounts them.
 */

/**
 * The error an API call rejects with: the status, and the module's own message
 * where it sent one (a refused input, a duplicate), for the element to show.
 */
export class ExamApiError extends Error {
  constructor(status, message) {
    super(message ?? `The exam module answered ${status}.`);
    this.status = status;
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
    let message;
    try {
      message = (await response.json()).error;
    } catch {
      // No message of the module's own.
    }
    throw new ExamApiError(response.status, message);
  }
  return response.json();
}

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
  for (const child of children.flat()) {
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
    this.showStatus("Loading…");
    return Promise.resolve()
      .then(() => this.load())
      .then((data) => this.show(this.render(data)))
      .catch((error) => {
        console.error(`[exam] ${this.localName} could not be loaded:`, error);
        this.showStatus(
          error instanceof ExamApiError && error.status === 404
            ? "This record does not exist."
            : "This element could not be loaded.",
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
