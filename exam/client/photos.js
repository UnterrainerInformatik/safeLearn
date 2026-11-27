/**
 * The photo import page (`student-photos`, design D4 and D7), for a session
 * holding `student-images` that acts as an admin:
 *
 * - `photos`: the export file of the WebUntis tool or a set of JPEG/PNG files
 *   chosen or dropped, read and scaled here to at most 600 px, then matched by
 *   the server against the directory from their metadata alone. The three
 *   lists - matched, ambiguous with the people to pick from, unmatched - come
 *   before anything is stored; storing sends one photo per confirmed match
 *   and reports the number stored. Below, the photos the module holds per
 *   class, those whose person the directory no longer holds, and the three
 *   deletions, each confirmed with its number.
 *
 * The API refuses every other session; this element only draws what it answers.
 */

import { apiError, button, confirmButton, defineExamElement, ExamApiError, ExamElement, examApi, format, h, t } from "./frame.js";
import { displayClass } from "./classes.js";

/** What the server stores at most: bytes and the longer side in pixels (`exam/photos.js`). */
const limitBytes = 256 * 1024;
const limitPixels = 600;
/** The largest number of entries one match request takes (`matchLimit` on the server). */
const matchChunk = 500;

/** The bytes of a data URL as a Blob, or null for anything that is not an image's. */
function blobOfDataUrl(value) {
  const found = typeof value === "string" ? /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\s]+)$/.exec(value) : null;
  if (!found) return null;
  const binary = atob(found[2].replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: found[1] });
}

/**
 * The image as it is uploaded: unchanged when it is a JPEG or PNG within the
 * limits, otherwise drawn into a canvas at most 600 px on its longer side and
 * encoded as JPEG. Null when the browser cannot read it as an image.
 */
async function scaled(blob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const longer = Math.max(bitmap.width, bitmap.height);
  const fits = longer <= limitPixels && blob.size <= limitBytes && (blob.type === "image/jpeg" || blob.type === "image/png");
  if (fits) {
    bitmap.close();
    return blob;
  }
  const factor = Math.min(1, limitPixels / longer);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * factor));
  canvas.height = Math.max(1, Math.round(bitmap.height * factor));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.6]) {
    const encoded = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (encoded && encoded.size <= limitBytes) return encoded;
  }
  return null;
}

/**
 * The photos in the chosen files, as `{ key, file, class, familyName,
 * givenName, source, blob }`: every student of an export file, every image
 * file as itself. `failed` counts what could not be read as a photo.
 */
async function readFiles(files) {
  const items = [];
  let failed = 0;
  for (const file of files) {
    const isExport = file.type === "application/json" || /\.json$/i.test(file.name);
    if (!isExport) {
      const blob = await scaled(file);
      if (blob) items.push({ key: file.name, file: file.name, class: "", familyName: "", givenName: "", source: file.name, blob });
      else failed += 1;
      continue;
    }
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      data = null;
    }
    if (data?.format !== "safelearn-student-photos" || !Array.isArray(data.students)) {
      failed += 1;
      continue;
    }
    for (const [index, student] of data.students.entries()) {
      const original = blobOfDataUrl(student?.image);
      const blob = original ? await scaled(original) : null;
      if (!blob) {
        failed += 1;
        continue;
      }
      const name = [student.familyName, student.givenName].filter(Boolean).join(" ");
      items.push({
        key: `${file.name}#${index}`,
        file: null,
        class: String(student.class ?? ""),
        familyName: String(student.familyName ?? ""),
        givenName: String(student.givenName ?? ""),
        source: `${displayClass(String(student.class ?? ""))} ${name}`.trim(),
        blob,
      });
    }
  }
  return { items, failed };
}

/** A person as the lists write them: family name first, the class beside it. */
function personText(person) {
  const name = [person.familyName, person.givenName].filter(Boolean).join(" ") || person.username;
  return `${name} (${person.username}${person.class ? `, ${displayClass(person.class)}` : ""})`;
}

/** Sends one photo; resolves to the stored record, rejects like `examApi`. */
async function storePhoto(username, blob) {
  const response = await fetch(`/exam/api/photos/${encodeURIComponent(username)}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  let answer = {};
  try {
    answer = await response.json();
  } catch {
    // No answer of the module's own.
  }
  if (!response.ok) throw apiError(response.status, answer?.error);
  return answer;
}

class PhotoImport extends ExamElement {
  async load() {
    return examApi("/photos/summary");
  }

  render(summary) {
    this.result = h("div", { class: "sl-exam-photos-result", "aria-live": "polite" });
    this.summaryHolder = h("div", { class: "sl-exam-photos-summary" }, this.summarySection(summary));
    const input = h("input", {
      type: "file",
      multiple: true,
      accept: ".json,application/json,image/jpeg,image/png",
      "aria-label": t("exam.photos.files"),
      onChange: () => {
        if (input.files.length > 0) this.read([...input.files]);
        input.value = "";
      },
    });
    const drop = h(
      "label",
      {
        class: "sl-exam-import-drop",
        onDragover: (event) => {
          event.preventDefault();
          drop.classList.add("is-dragging");
        },
        onDragleave: () => drop.classList.remove("is-dragging"),
        onDrop: (event) => {
          event.preventDefault();
          drop.classList.remove("is-dragging");
          const dropped = [...(event.dataTransfer?.files ?? [])];
          if (dropped.length > 0) this.read(dropped);
        },
      },
      h("span", {}, t("exam.photos.chooseFiles")),
      input
    );
    return h(
      "div",
      { class: "sl-exam sl-exam-photos" },
      h("p", { class: "sl-exam-quiet" }, t("exam.photos.explained")),
      h("h2", {}, t("exam.photos.importHeading")),
      drop,
      this.result,
      h("h2", {}, t("exam.photos.heldHeading")),
      this.summaryHolder
    );
  }

  /** Reads the files, has the server match them, and draws the three lists. */
  async read(files) {
    this.revokePreviews();
    this.result.replaceChildren(h("p", { class: "sl-exam-quiet" }, t("exam.photos.reading")));
    const { items, failed } = await readFiles(files);
    if (items.length === 0) {
      this.result.replaceChildren(h("p", { class: "sl-embed-error" }, t("exam.photos.nothingRead")));
      return;
    }
    const answer = { matched: [], ambiguous: [], unmatched: [] };
    try {
      for (let at = 0; at < items.length; at += matchChunk) {
        const entries = items.slice(at, at + matchChunk).map(({ key, file, class: className, familyName, givenName }) => ({ key, file, class: className, familyName, givenName }));
        const part = await examApi("/photos/match", { method: "POST", body: { entries } });
        for (const list of ["matched", "ambiguous", "unmatched"]) answer[list].push(...part[list]);
      }
    } catch (error) {
      this.result.replaceChildren(h("p", { class: "sl-embed-error" }, error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.photos.matchFailed")));
      return;
    }
    this.drawMatching(new Map(items.map((item) => [item.key, item])), answer, failed);
  }

  revokePreviews() {
    for (const url of this.previews ?? []) URL.revokeObjectURL(url);
    this.previews = [];
  }

  preview(item) {
    const url = URL.createObjectURL(item.blob);
    this.previews.push(url);
    return h("img", { class: "sl-exam-photos-preview", src: url, alt: "" });
  }

  /** The matching as three lists; only what the admin leaves ticked or picks is stored. */
  drawMatching(items, { matched, ambiguous, unmatched }, failed) {
    // key -> the username it is stored for, or null while nobody is chosen.
    const chosen = new Map();
    const storeButton = button({ label: "", kind: "primary", class: "sl-exam-photos-store", action: () => this.store(items, chosen, storeButton) });
    const count = () => {
      const n = [...chosen.values()].filter(Boolean).length;
      storeButton.textContent = t("exam.photos.store", { count: n });
      storeButton.disabled = n === 0;
    };
    const table = (head, rows) => h("table", { class: "sl-exam-table sl-exam-photos-table" }, h("thead", {}, h("tr", {}, head.map((text) => h("th", {}, text)))), h("tbody", {}, rows));

    const matchedRows = matched.map(({ key, person }) => {
      chosen.set(key, person.username);
      const box = h("input", {
        type: "checkbox",
        checked: true,
        "aria-label": t("exam.photos.storeFor", { person: personText(person) }),
        onChange: (event) => {
          chosen.set(key, event.target.checked ? person.username : null);
          count();
        },
      });
      return h("tr", { "data-key": key }, h("td", {}, box), h("td", {}, this.preview(items.get(key))), h("td", {}, items.get(key).source), h("td", {}, personText(person)));
    });
    const ambiguousRows = ambiguous.map(({ key, candidates }) => {
      chosen.set(key, null);
      const select = h(
        "select",
        {
          "aria-label": t("exam.photos.pickFor", { source: items.get(key).source }),
          onChange: (event) => {
            chosen.set(key, event.target.value || null);
            count();
          },
        },
        h("option", { value: "" }, t("exam.photos.pickNobody")),
        candidates.map((candidate) => h("option", { value: candidate.username }, personText(candidate)))
      );
      return h("tr", { "data-key": key }, h("td", {}, this.preview(items.get(key))), h("td", {}, items.get(key).source), h("td", {}, select));
    });
    const unmatchedRows = unmatched.map(({ key }) => h("tr", { "data-key": key }, h("td", {}, this.preview(items.get(key))), h("td", {}, items.get(key).source)));
    count();

    this.result.replaceChildren(
      h(
        "div",
        { class: "sl-exam-photos-matching" },
        failed > 0 ? h("p", { class: "sl-embed-error" }, t("exam.photos.unreadable", { count: failed })) : null,
        h("h3", {}, t("exam.photos.matchedHeading", { count: matched.length })),
        matched.length > 0 ? table(["", "", t("exam.photos.source"), t("exam.photos.person")], matchedRows) : null,
        h("h3", {}, t("exam.photos.ambiguousHeading", { count: ambiguous.length })),
        ambiguous.length > 0 ? [h("p", { class: "sl-exam-quiet" }, t("exam.photos.ambiguousExplained")), table(["", t("exam.photos.source"), t("exam.photos.person")], ambiguousRows)] : null,
        h("h3", {}, t("exam.photos.unmatchedHeading", { count: unmatched.length })),
        unmatched.length > 0 ? [h("p", { class: "sl-exam-quiet" }, t("exam.photos.unmatchedExplained")), table(["", t("exam.photos.source")], unmatchedRows)] : null,
        h("p", { class: "sl-exam-actions" }, storeButton)
      )
    );
  }

  /** Stores every chosen photo, one request each, with the progress shown. */
  async store(items, chosen, storeButton) {
    const jobs = [...chosen.entries()].filter(([, username]) => username);
    storeButton.disabled = true;
    const progress = h("p", { class: "sl-exam-photos-progress", role: "status" });
    storeButton.after(progress);
    let stored = 0;
    const refused = [];
    for (const [index, [key, username]] of jobs.entries()) {
      progress.textContent = t("exam.photos.storing", { done: index, count: jobs.length });
      try {
        await storePhoto(username, items.get(key).blob);
        stored += 1;
      } catch (error) {
        refused.push(`${items.get(key).source}: ${error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.photos.storeFailed")}`);
      }
    }
    this.revokePreviews();
    this.result.replaceChildren(
      h("p", { class: "sl-exam-photos-stored", role: "status" }, t("exam.photos.stored", { count: stored })),
      refused.length > 0 ? h("ul", { class: "sl-embed-error" }, refused.map((line) => h("li", {}, line))) : null
    );
    await this.refreshSummary();
  }

  async refreshSummary() {
    try {
      this.summaryHolder.replaceChildren(this.summarySection(await examApi("/photos/summary")));
    } catch (error) {
      this.summaryHolder.replaceChildren(h("p", { class: "sl-embed-error" }, error instanceof ExamApiError ? error.message : t("exam.photos.summaryFailed")));
    }
  }

  /** One deletion, confirmed with its number; the server refuses a number that changed meanwhile. */
  deleteButton(label, armed, body) {
    return confirmButton({
      class: "sl-exam-photos-delete",
      label,
      armed,
      action: async () => {
        try {
          const { deleted } = await examApi("/photos/delete", { method: "POST", body });
          this.result.replaceChildren(h("p", { class: "sl-exam-photos-deleted", role: "status" }, t("exam.photos.deleted", { count: deleted })));
        } catch (error) {
          this.result.replaceChildren(h("p", { class: "sl-embed-error" }, error instanceof ExamApiError && error.status < 500 ? error.message : t("exam.photos.deleteFailed")));
        }
        await this.refreshSummary();
      },
    });
  }

  summarySection(summary) {
    const notice =
      summary.directory === "ready"
        ? null
        : h("p", { class: "sl-exam-quiet sl-exam-photos-directory" }, summary.directory === "loading" ? t("exam.photos.directoryLoading") : t("exam.photos.directoryUnavailable"));
    const classRows = summary.classes.map(({ name, photos }) =>
      h(
        "tr",
        { "data-class": name },
        h("td", {}, displayClass(name)),
        h("td", {}, format.number(photos)),
        h("td", {}, this.deleteButton(t("exam.photos.deleteClass"), t("exam.photos.deleteClassArmed", { count: photos, name: displayClass(name) }), { scope: "class", className: name, expected: photos }))
      )
    );
    const withoutPerson = summary.withoutPerson;
    return h(
      "div",
      {},
      notice,
      h("p", { class: "sl-exam-photos-total" }, t("exam.photos.total", { count: summary.total })),
      classRows.length > 0
        ? h(
            "table",
            { class: "sl-exam-table sl-exam-photos-classes" },
            h("thead", {}, h("tr", {}, h("th", {}, t("exam.photos.class")), h("th", {}, t("exam.photos.photos")), h("th", {}, ""))),
            h("tbody", {}, classRows)
          )
        : null,
      withoutPerson === null
        ? null
        : h(
            "div",
            { class: "sl-exam-photos-without" },
            h("p", {}, t("exam.photos.withoutPerson", { count: withoutPerson.length })),
            withoutPerson.length > 0
              ? [
                  h("details", {}, h("summary", {}, t("exam.photos.showUsernames")), h("ul", {}, withoutPerson.map((username) => h("li", {}, username)))),
                  h("p", { class: "sl-exam-actions" }, this.deleteButton(t("exam.photos.deleteWithout"), t("exam.photos.deleteWithoutArmed", { count: withoutPerson.length }), { scope: "withoutPerson", expected: withoutPerson.length })),
                ]
              : null
          ),
      summary.total > 0 ? h("p", { class: "sl-exam-actions" }, this.deleteButton(t("exam.photos.deleteAll"), t("exam.photos.deleteAllArmed", { count: summary.total }), { scope: "all", expected: summary.total })) : null,
      h("p", { class: "sl-exam-quiet sl-exam-photos-backups" }, t("exam.photos.backupsNote"))
    );
  }
}

defineExamElement("photos", PhotoImport);
