/**
 * The exam module's client (design.md, D4): a plain ES module with custom
 * elements, no framework and no build step.
 *
 * A page view loads this script only when the module is active and the page
 * carries at least one placeholder (`<div class="sl-embed" data-sl-embed=…>`).
 * It mounts one element per placeholder. It takes no part in revealing the
 * page: the page is shown by its usual owner, and each element shows its own
 * loading and error state inside its own area (`exam-embedding`).
 */

/**
 * A request to the module's API with the session cookie. Rejects with an
 * error naming the status for any answer that is not a success.
 */
export async function examApi(path, init = {}) {
  const response = await fetch(`/exam/api${path}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`The exam module answered ${response.status}.`);
  }
  return response.json();
}

/**
 * The frame every element is drawn in: a status line while it loads, the
 * element's content once it has it, and a message in place of the content if
 * loading failed. A subclass implements `load()` (returning data) and
 * `render(data)` (returning a node or HTML text).
 */
export class ExamElement extends HTMLElement {
  connectedCallback() {
    if (this.started) return;
    this.started = true;
    this.showStatus("Loading…");
    Promise.resolve()
      .then(() => this.load())
      .then((data) => this.show(this.render(data)))
      .catch((error) => {
        console.error(`[exam] ${this.localName} could not be loaded:`, error);
        this.showStatus("This element could not be loaded.", true);
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

/**
 * The element names per kind. A kind the module places but whose element is
 * not built yet shows that in its own area instead of loading forever.
 */
const elements = new Map();

export function defineExamElement(kind, constructor) {
  const name = `sl-exam-${kind}`;
  if (!customElements.get(name)) customElements.define(name, constructor);
  elements.set(kind, name);
}

function mount(placeholder) {
  const kind = placeholder.dataset.slEmbed;
  const name = elements.get(kind);
  if (!name) {
    const status = placeholder.querySelector(".sl-embed-status") ?? placeholder;
    status.classList.add("sl-embed-error");
    status.textContent = "This element is not available on this instance yet.";
    return;
  }
  const element = document.createElement(name);
  for (const [key, value] of Object.entries(placeholder.dataset)) {
    element.dataset[key] = value;
  }
  placeholder.replaceChildren(element);
}

function mountAll() {
  for (const placeholder of document.querySelectorAll(".sl-embed[data-sl-embed]")) {
    if (placeholder.dataset.slMounted) continue;
    placeholder.dataset.slMounted = "1";
    mount(placeholder);
  }
}

// A module script runs after the document has been parsed, so every
// placeholder is already there.
mountAll();
