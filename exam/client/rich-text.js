/**
 * `<sl-rich-text>`: the editor's narrow formatted-text field (exam-question-editor
 * design D3) - a `contenteditable` region under a toolbar with bold, italic,
 * inline code, code block, bulleted and numbered list, and image. Its `value`
 * is its HTML, which the server sanitizes again on every save; the filter on
 * paste only keeps the field tidy and protects nothing.
 *
 * Bold, italic and the lists use `document.execCommand`, which is deprecated
 * but has no standard replacement yet; the code buttons work on the selection's
 * `Range` themselves. An image - from the button, pasted or dropped - is
 * uploaded first (`POST /exam/api/pool/uploads`) and inserted by the address
 * the upload answers, never inline.
 *
 * Fires `input` when its content changes.
 */

import { apiError, ExamApiError, h, t } from "./frame.js";

/** What a paste keeps: these elements, without any attribute. Everything else is unwrapped. */
const pastedTags = new Set(["P", "BR", "B", "STRONG", "I", "EM", "CODE", "PRE", "UL", "OL", "LI"]);
const droppedTags = new Set(["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "HEAD", "TITLE", "META", "LINK"]);

export const imageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Uploads an image file and resolves to its staged address. Rejects with an
 * `ExamApiError` carrying the server's reason (too large, not an image).
 */
export async function uploadImage(file) {
  const response = await fetch("/exam/api/pool/uploads", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/octet-stream" },
    body: file,
  });
  let answer = null;
  try {
    answer = await response.json();
  } catch {
    // No answer of the module's own.
  }
  if (!response.ok) throw apiError(response.status, answer?.error);
  return answer.src;
}

/** Pasted HTML reduced to the tags the field keeps, without attributes. */
export function filterPasted(html) {
  const source = new DOMParser().parseFromString(html, "text/html").body;
  const copy = (node, into) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        into.append(child.textContent);
      } else if (child.nodeType === Node.ELEMENT_NODE && !droppedTags.has(child.tagName)) {
        if (pastedTags.has(child.tagName)) {
          const kept = document.createElement(child.tagName.toLowerCase());
          copy(child, kept);
          into.append(kept);
        } else {
          copy(child, into);
        }
      }
    }
  };
  const result = document.createElement("div");
  copy(source, result);
  return result.innerHTML;
}

class RichText extends HTMLElement {
  constructor() {
    super();
    this.area = h("div", {
      class: "sl-rich-text-area",
      contenteditable: "true",
      role: "textbox",
      "aria-multiline": "true",
      spellcheck: "true",
    });
    this.status = h("span", { class: "sl-rich-text-status", role: "status" });
    this.fileInput = h("input", { type: "file", accept: imageTypes.join(","), hidden: true });
    this.fileInput.addEventListener("change", () => {
      const [file] = this.fileInput.files;
      this.fileInput.value = "";
      if (file) this.insertImageFile(file);
    });
    this.area.addEventListener("input", () => this.changed());
    this.area.addEventListener("paste", (event) => this.paste(event));
    this.area.addEventListener("drop", (event) => this.drop(event));
    this.area.addEventListener("keydown", (event) => this.keydown(event));
  }

  connectedCallback() {
    if (this.toolbar) return;
    const button = (label, title, action, name) =>
      h(
        "button",
        {
          type: "button",
          title,
          "aria-label": title,
          "data-action": name,
          // Keeps the selection in the area while the button is pressed.
          onMousedown: (event) => event.preventDefault(),
          onClick: () => {
            this.area.focus();
            action();
            this.changed();
          },
        },
        label
      );
    this.toolbar = h(
      "div",
      { class: "sl-rich-text-toolbar", role: "toolbar", "aria-label": t("exam.richText.formatting") },
      button(h("b", {}, "B"), t("exam.richText.bold"), () => document.execCommand("bold"), "bold"),
      button(h("i", {}, "I"), t("exam.richText.italic"), () => document.execCommand("italic"), "italic"),
      button(h("code", {}, "</>"), t("exam.richText.inlineCode"), () => this.toggleInlineCode(), "code"),
      button("{ }", t("exam.richText.codeBlock"), () => this.toggleCodeBlock(), "codeblock"),
      button("•", t("exam.richText.bulletedList"), () => document.execCommand("insertUnorderedList"), "ul"),
      button("1.", t("exam.richText.numberedList"), () => document.execCommand("insertOrderedList"), "ol"),
      button("🖼", t("exam.richText.image"), () => this.fileInput.click(), "image")
    );
    if (this.hasAttribute("aria-label")) this.area.setAttribute("aria-label", this.getAttribute("aria-label"));
    this.replaceChildren(this.toolbar, this.area, this.status, this.fileInput);
  }

  get value() {
    return this.area.innerHTML;
  }

  set value(html) {
    this.area.innerHTML = html ?? "";
  }

  focus() {
    this.area.focus();
  }

  changed() {
    this.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** The selection's range if it lies inside this field, or null. */
  range() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return this.area.contains(range.commonAncestorContainer) ? range : null;
  }

  /** The nearest `tag` element around `node` inside the field, or null. */
  enclosing(node, tag) {
    for (let at = node; at && at !== this.area; at = at.parentNode) {
      if (at.nodeType === Node.ELEMENT_NODE && at.tagName === tag) return at;
    }
    return null;
  }

  /** Replaces `element` by its children. */
  unwrap(element) {
    element.replaceWith(...element.childNodes);
  }

  selectContents(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /** Wraps the selection in `<code>`, or unwraps the inline code the caret is in. */
  toggleInlineCode() {
    const range = this.range();
    if (!range) return;
    const code = this.enclosing(range.commonAncestorContainer, "CODE");
    if (code && !this.enclosing(code, "PRE")) {
      this.unwrap(code);
      return;
    }
    if (range.collapsed) return;
    const wrapper = document.createElement("code");
    wrapper.textContent = range.toString();
    range.deleteContents();
    range.insertNode(wrapper);
    this.selectContents(wrapper);
  }

  /**
   * Turns the selected text - or the paragraph the caret is in - into a code
   * block, or a code block back into a paragraph.
   */
  toggleCodeBlock() {
    const range = this.range();
    if (!range) return;
    const pre = this.enclosing(range.commonAncestorContainer, "PRE");
    if (pre) {
      const paragraph = document.createElement("p");
      paragraph.textContent = pre.textContent;
      pre.replaceWith(paragraph);
      this.selectContents(paragraph);
      return;
    }
    const block = document.createElement("pre");
    const code = document.createElement("code");
    block.append(code);
    if (range.collapsed) {
      const paragraph = this.enclosing(range.startContainer, "P");
      code.textContent = paragraph ? paragraph.textContent : "";
      if (paragraph) paragraph.replaceWith(block);
      else range.insertNode(block);
    } else {
      code.textContent = range.toString();
      range.deleteContents();
      range.insertNode(block);
    }
    this.selectContents(code);
  }

  /** Inside a code block, Enter is a line break rather than a new block. */
  keydown(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    const range = this.range();
    if (range && this.enclosing(range.startContainer, "PRE")) {
      event.preventDefault();
      document.execCommand("insertText", false, "\n");
    }
  }

  insertHtml(html) {
    if (!this.range()) {
      this.area.focus();
      const end = document.createRange();
      end.selectNodeContents(this.area);
      end.collapse(false);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(end);
    }
    document.execCommand("insertHTML", false, html);
    this.changed();
  }

  paste(event) {
    const data = event.clipboardData;
    if (!data) return;
    const images = [...data.files].filter((file) => file.type.startsWith("image/"));
    event.preventDefault();
    if (images.length > 0) {
      for (const file of images) this.insertImageFile(file);
      return;
    }
    const html = data.getData("text/html");
    if (html) {
      this.insertHtml(filterPasted(html));
      return;
    }
    document.execCommand("insertText", false, data.getData("text/plain"));
  }

  drop(event) {
    // Any dropped file goes to the upload, which refuses what is not an image.
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length === 0) return;
    event.preventDefault();
    // The caret goes where the image was dropped.
    const at = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (at && this.area.contains(at.startContainer)) {
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(at);
    }
    for (const file of files) this.insertImageFile(file);
  }

  /** Uploads `file` and inserts it at the caret; a refusal is shown under the field. */
  async insertImageFile(file) {
    this.status.textContent = t("exam.richText.uploading");
    this.status.classList.remove("sl-embed-error");
    // Where the caret is now; the upload takes a moment.
    const range = this.range()?.cloneRange() ?? null;
    try {
      const src = await uploadImage(file);
      this.status.textContent = "";
      if (range) {
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
      const img = document.createElement("img");
      img.setAttribute("src", src);
      img.setAttribute("alt", "");
      this.insertHtml(img.outerHTML);
    } catch (error) {
      this.status.classList.add("sl-embed-error");
      this.status.textContent =
        error instanceof ExamApiError && error.status < 500 && error.message ? error.message : t("exam.richText.uploadFailed");
    }
  }
}

if (!customElements.get("sl-rich-text")) customElements.define("sl-rich-text", RichText);
