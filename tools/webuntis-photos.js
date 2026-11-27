/*
 * Exports the official student photos from WebUntis for safeLearn's photo
 * import (`student-photos`, design D5 and D6). Read tools/webuntis-photos.md
 * first.
 *
 * Paste this whole file into the developer console of a browser tab in which
 * you are logged into WebUntis. It adds a small panel at the top right:
 *
 *   1. Open a lesson's class register in WebUntis (the page with the students'
 *      cards and photos).
 *   2. Check the class in the panel and press "Add this register".
 *   3. Repeat for every class you want; a class added twice is replaced.
 *   4. Press "Download export" and import the file on safeLearn's page
 *      /exam/photos.
 *
 * It uses your existing WebUntis session only. It never asks for, stores or
 * sends a password or token anywhere, and it sends nothing anywhere but to
 * WebUntis itself: every request goes to this tab's own origin, and the
 * export is a file your browser saves. It reads only what the register shows
 * you: the class, each student's family and given name, and the photo.
 *
 * It depends on WebUntis's undocumented web pages - the register's
 * `studentCard` cards, `image.do` and `calendar-entry/detail` - and may need
 * adapting after a WebUntis update.
 */
(() => {
  "use strict";

  const panelId = "safelearn-webuntis-photos";
  const origin = window.location.origin;
  // Kept on the window, so pasting the script again keeps what was collected.
  const state = (window.__safelearnPhotoExport ??= { classes: new Map() });

  // -------------------------------------------------------------- reading

  /** Every document of this tab: the page and its same-origin frames, nested. */
  function documents(root = document, found = []) {
    found.push(root);
    for (const frame of root.querySelectorAll("iframe, frame")) {
      try {
        if (frame.contentDocument) documents(frame.contentDocument, found);
      } catch {
        // A frame of another origin: not WebUntis's, nothing to read there.
      }
    }
    return found;
  }

  /** The register's student cards, from whichever document of the tab shows them. */
  function studentCards() {
    for (const doc of documents()) {
      const cards = [...doc.querySelectorAll(".studentCard__container")];
      if (cards.length > 0) return cards;
    }
    return [];
  }

  /**
   * One card as `{ sourceId, familyName, givenName }`: the WebUntis id from
   * the photo's URL, the card's two text lines as family and given name.
   */
  function readCard(card) {
    const image = card.querySelector('img[src*="image.do"]');
    let sourceId = null;
    if (image) {
      try {
        sourceId = new URL(image.getAttribute("src"), origin).searchParams.get("id");
      } catch {
        sourceId = null;
      }
    }
    const lines = (card.innerText ?? card.textContent ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return { sourceId, familyName: lines[0] ?? "", givenName: lines[1] ?? "" };
  }

  /** A same-origin JSON request; with the session's bearer token when the API asks for one. */
  async function fetchJson(url) {
    let response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (response.status === 401 || response.status === 403) {
      const token = await fetch(`${origin}/WebUntis/api/token/new`, { credentials: "same-origin" }).then((answer) => (answer.ok ? answer.text() : null));
      if (!token) return null;
      response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    }
    return response.ok ? response.json() : null;
  }

  /**
   * The class names of the lesson whose register is open, from the most
   * recent `calendar-entry/detail` this tab loaded, asked again. Empty when
   * it cannot be found; the teacher then types the class.
   */
  async function lessonClasses() {
    const entries = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.startsWith(origin) && entry.name.includes("calendar-entry/detail"));
    const latest = entries.at(-1);
    if (!latest) return [];
    try {
      const detail = await fetchJson(latest.name);
      const klasses = detail?.calendarEntries?.[0]?.klasses ?? [];
      return [...new Set(klasses.map((klass) => klass?.shortName).filter((name) => typeof name === "string" && name.trim()))];
    } catch {
      return [];
    }
  }

  function dataUrlOf(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function digestOf(blob) {
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  /**
   * The student's photo as `{ image, digest }`, fetched from `image.do` with
   * the tab's session and without the white default avatar; null when
   * WebUntis answers no JPEG or PNG.
   */
  async function photoOf(sourceId) {
    if (!sourceId || !/^\d+$/.test(sourceId)) return null;
    const url = `${origin}/WebUntis/image.do?cat=5&id=${encodeURIComponent(sourceId)}&useWhiteAvatarDefault=false`;
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      const type = (response.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
      if (!response.ok || (type !== "image/jpeg" && type !== "image/png")) return null;
      const blob = await response.blob();
      if (blob.size === 0) return null;
      const typed = blob.type === type ? blob : new Blob([blob], { type });
      return { image: await dataUrlOf(typed), digest: await digestOf(typed) };
    } catch {
      return null;
    }
  }

  /**
   * Reads the open register as the students of `className`. A picture that
   * several students share is WebUntis's placeholder, not a photo: those
   * students count as without one.
   */
  async function readRegister(className, report) {
    const cards = studentCards().map(readCard).filter((card) => card.familyName || card.givenName);
    const students = [];
    for (const [index, card] of cards.entries()) {
      report(`Reading ${index + 1} of ${cards.length}…`);
      students.push({ ...card, photo: await photoOf(card.sourceId) });
    }
    const uses = new Map();
    for (const { photo } of students) if (photo) uses.set(photo.digest, (uses.get(photo.digest) ?? 0) + 1);
    return students.map(({ photo, ...student }) => ({ ...student, image: photo && uses.get(photo.digest) === 1 ? photo.image : null, class: className }));
  }

  // ------------------------------------------------------------- the export

  function exportFile() {
    const students = [];
    for (const list of state.classes.values()) {
      for (const student of list) {
        if (!student.image) continue;
        students.push({ class: student.class, familyName: student.familyName, givenName: student.givenName, sourceId: student.sourceId, image: student.image });
      }
    }
    return { format: "safelearn-student-photos", version: 1, source: "webuntis", exportedAt: new Date().toISOString(), students };
  }

  function download() {
    const data = exportFile();
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `webuntis-photos-${data.exportedAt.slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return data.students.length;
  }

  // -------------------------------------------------------------- the panel

  function element(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "style") Object.assign(node.style, value);
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of children) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }

  document.getElementById(panelId)?.remove();
  const status = element("div", { style: { margin: "6px 0", minHeight: "1.2em" } });
  const classInput = element("input", { type: "text", placeholder: "Class, e.g. 5AHIF", style: { width: "9em", marginRight: "6px" } });
  const summary = element("table", { style: { borderCollapse: "collapse", margin: "6px 0", width: "100%" } });
  const button = (label, onclick) => element("button", { type: "button", onclick, style: { marginRight: "6px", padding: "2px 8px", cursor: "pointer" } }, label);

  function drawSummary() {
    summary.replaceChildren(
      element("tr", {}, element("th", { style: { textAlign: "left" } }, "Class"), element("th", {}, "found"), element("th", {}, "without photo"), element("th", {}, "")),
      ...[...state.classes.entries()].map(([name, list]) =>
        element(
          "tr",
          {},
          element("td", {}, name),
          element("td", { style: { textAlign: "center" } }, list.length),
          element("td", { style: { textAlign: "center" } }, list.filter((student) => !student.image).length),
          element("td", {}, button("×", () => {
            state.classes.delete(name);
            drawSummary();
          }))
        )
      )
    );
  }

  async function addRegister() {
    const className = classInput.value.trim().toUpperCase();
    if (studentCards().length === 0) {
      status.textContent = "No class register with student cards is open in this tab.";
      return;
    }
    if (!/^[1-9][A-Z]{1,8}$/.test(className)) {
      status.textContent = "Enter the class this register belongs to, e.g. 5AHIF.";
      return;
    }
    const students = await readRegister(className, (text) => (status.textContent = text));
    state.classes.set(className, students);
    drawSummary();
    status.textContent = `${className}: ${students.length} found, ${students.filter((student) => !student.image).length} without photo.`;
  }

  async function detectClass() {
    const names = await lessonClasses();
    if (names.length === 1) {
      classInput.value = names[0].toUpperCase();
      status.textContent = `This lesson's class: ${classInput.value}. Check it, then add the register.`;
    } else if (names.length > 1) {
      status.textContent = `This lesson has several classes (${names.join(", ")}). Open a lesson of one class only, or type the class whose students you add.`;
    } else {
      status.textContent = "The lesson's class was not found; type it.";
    }
  }

  const panel = element(
    "div",
    {
      id: panelId,
      style: {
        position: "fixed",
        top: "8px",
        right: "8px",
        zIndex: "2147483647",
        width: "22em",
        padding: "10px",
        background: "#fff",
        color: "#222",
        border: "1px solid #888",
        borderRadius: "6px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        font: "13px/1.4 sans-serif",
      },
    },
    element("strong", {}, "safeLearn photo export"),
    element("div", { style: { margin: "6px 0" } }, classInput, button("Detect class", detectClass)),
    element("div", {}, button("Add this register", addRegister), button("Download export", () => {
      const count = download();
      status.textContent = `Export downloaded: ${count} photos.`;
    }), button("Close", () => panel.remove())),
    status,
    summary
  );
  document.body.append(panel);
  drawSummary();
  detectClass();
})();
