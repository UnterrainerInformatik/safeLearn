/**
 * Obsidian syntax the renderer resolves itself (`obsidian-syntax-coverage`),
 * against a running instance: footnotes, math, block references, links to
 * headings and blocks, and note embeds, in the page, document and presentation
 * views.
 *
 * Reads `md/test-obsidian-syntax.md`, a file visible to everyone that shows
 * each feature, and `md/test-embed-host.md`, visible to everyone, which embeds
 * a whole note, a section, a block, a teacher-only note, a note with a
 * `@@@ teacher` block, a section inside that block, a missing note and a note
 * that embeds the host back. The embedded notes are `md/test-embed-*.md`; the
 * words in capitals beginning with EINBETTUNG stand only in them, so a word on
 * the host's page can only have come through an embed. `md/test-content-list.md`
 * is the target of the links to another note's headings.
 *
 * What each piece of syntax is, case by case, is `test/obsidian-syntax.test.js`.
 * This module asks what reaches a reader: that the three views carry it, that
 * the anchors lead where they say, that KaTeX's fonts come from the
 * application and from no other host, and that an embed keeps the embedded
 * note's permissions for each role.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import {
  applicationUrl,
  click,
  eventually,
  hostKinds,
  hostsContactedWhile,
  render,
  setPreferences,
  sharedSession,
} from "../harness.js";

const demo = "/md/test-obsidian-syntax.md";
const host = "/md/test-embed-host.md";
const embedded = "/md/test-embed-whole.md";
const embeddedImage = "/md/assets/test-attachment-embed.png";

const views = Object.freeze({ page: "#markdown-content", document: "#markdown-content", presentation: "#revealContent" });

describe("obsidian syntax", () => {
  const sessions = new Map();

  before(async () => {
    for (const role of ["student", "teacher"]) {
      const session = await sharedSession(role);
      await setPreferences(session, {});
      sessions.set(role, session);
    }
  });

  const student = () => sessions.get("student");
  const teacher = () => sessions.get("teacher");

  /** The view's content as a reader reads it, whitespace collapsed. */
  const shownText = (page, view) =>
    page.$eval(views[view], (root) => root.textContent.replace(/\s+/g, " "));

  // ---- Footnotes ----

  test("footnotes are numbered by first use and listed after the page's content", async () => {
    for (const view of ["page", "document"]) {
      const { page } = await render(student(), demo, { view });
      const found = await page.$eval(views[view], (root) => ({
        references: [...root.querySelectorAll("a[data-footnote-ref]")].map((a) => a.textContent.trim()),
        notes: [...root.querySelectorAll("section.footnotes li")].map((li) => li.textContent.replace(/↩\d*/g, "").trim()),
        listLast: (() => {
          const list = root.querySelector("section.footnotes");
          const headings = [...root.querySelectorAll("h2")].filter((h) => !h.closest("section.footnotes"));
          const last = headings[headings.length - 1];
          return Boolean(list && last && last.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
        })(),
      }));
      assert.deepEqual(found.references, ["1", "2", "1", "3"], `${view}: ${JSON.stringify(found)}`);
      assert.deepEqual(found.notes, ["Refactoring, 2002.", "Kent Beck, 2000.", "INLINENOTIZ written where it is referenced."]);
      assert.ok(found.listLast, `${view}: the notes stand after the content`);
      const text = await shownText(page, view);
      assert.ok(text.includes("[^fehlt]"), `${view}: a reference without a definition stays as written`);
      assert.ok(!text.includes("[^1]:"), `${view}: a definition is not shown where it was written`);
    }
  });

  test("in the presentation, the notes stand on the slide of their first reference", async () => {
    const { page } = await render(student(), demo, { view: "presentation" });
    const slides = await page.$$eval("#revealContent > section", (sections) =>
      sections.map((section) => ({
        heading: section.querySelector("h2")?.textContent.trim() ?? null,
        notes: [...section.querySelectorAll(".footnotes li")].map((li) => li.textContent.replace(/↩\d*/g, "").trim()),
      }))
    );
    const footnotes = slides.find((slide) => slide.heading === "Footnotes");
    assert.deepEqual(footnotes?.notes, ["Refactoring, 2002.", "Kent Beck, 2000.", "INLINENOTIZ written where it is referenced."]);
    assert.deepEqual(slides[slides.length - 1], { heading: "Summary", notes: [] }, JSON.stringify(slides));
    assert.equal(await page.$("#revealContent section.footnotes"), null, "the list at the end made no slide");
  });

  // ---- Math ----

  for (const view of Object.keys(views)) {
    test(`formulas are typeset with KaTeX's fonts in the ${view} view, from no other host`, async () => {
      let shown;
      const contacted = await hostsContactedWhile(student(), async () => {
        shown = await render(student(), demo, { view });
      });
      const external = contacted.filter((entry) => entry.kind === hostKinds.external);
      assert.deepEqual(
        external.map((entry) => `${entry.host} (${entry.addresses.join(", ")})`),
        [],
        `the ${view} view reached another host`
      );
      const math = await shown.page.evaluate(async (root) => {
        await document.fonts.ready;
        const container = document.querySelector(root);
        return {
          inline: container.querySelectorAll(".katex:not(.katex-display .katex)").length,
          display: container.querySelectorAll(".katex-display").length,
          errors: [...container.querySelectorAll(".katex-error")].map((error) => error.textContent),
          fonts: [...document.fonts].filter((face) => face.family.replace(/"/g, "").startsWith("KaTeX") && face.status === "loaded").length,
        };
      }, views[view]);
      assert.ok(math.inline >= 3, `${view}: three inline formulas: ${JSON.stringify(math)}`);
      assert.equal(math.display, 1, `${view}: one display formula`);
      assert.deepEqual(math.errors, ["\\frac{a"], `${view}: the broken formula shows its source as an error`);
      assert.ok(math.fonts > 0, `${view}: no KaTeX font face was loaded: ${JSON.stringify(math)}`);
      const text = await shownText(shown.page, view);
      for (const kept of ["Kostet $5 und $10.", "Escaped: $PREIS$.", "$HOME", "and the text goes on."]) {
        assert.ok(text.includes(kept), `${view}: ${JSON.stringify(kept)} is not shown as written`);
      }
    });
  }

  // ---- Blocks and anchors ----

  test("block markers name their blocks and are not shown", async () => {
    const { page } = await render(student(), demo);
    const blocks = await page.evaluate(() =>
      ["block-def-baum", "block-punkt-eins", "block-tabelle-noten"].map((id) => document.getElementById(id)?.tagName ?? null)
    );
    assert.deepEqual(blocks, ["P", "LI", "TABLE"]);
    const marked = await page.evaluate(() =>
      ["block-def-baum", "block-punkt-eins", "block-tabelle-noten"].map((id) => document.getElementById(id).textContent)
    );
    for (const [index, marker] of ["^def-baum", "^punkt-eins", "^tabelle-noten"].entries()) {
      assert.ok(!marked[index].includes(marker), `${marker} is shown in its block`);
    }
    const text = await shownText(page, "page");
    assert.ok(!text.includes("^tabelle-noten"), "the marker line after the table is shown");
    assert.ok(text.includes("2^10"));
    assert.equal(await page.$("[data-block-anchor]"), null);
  });

  test("links name a heading of another note, every segment, and a heading of this page", async () => {
    const { page } = await render(student(), demo);
    const links = await page.$$eval("#markdown-content li a, #markdown-content p a:not([data-footnote-ref])", (anchors) =>
      anchors.map((a) => [a.textContent.trim(), a.getAttribute("href")])
    );
    const target = new URL("/md/test-content-list.md", applicationUrl).href;
    assert.deepEqual(
      links.filter(([, href]) => !href.startsWith("#footnote-")),
      [
        ["test-content-list > Second section", `${target}#second-section`],
        ["test-content-list > Content list: a page of its own > Second section", `${target}#second-section`],
        ["test-content-list > Nichtvorhanden", `${target}#nichtvorhanden`],
        ["jump to the summary", "#summary"],
        ["^def-baum", "#block-def-baum"],
        ["Footnotes", "#footnotes"],
      ]
    );
  });

  test("a link within the page scrolls to its heading", async () => {
    const { page } = await render(student(), demo);
    await click(page, 'a[href="#summary"]');
    // In view and below the fixed top bar; the last heading of a short page
    // cannot scroll all the way up.
    const shown = await eventually(
      () =>
        page.$eval("#summary", (heading) => ({
          hash: window.location.hash,
          top: heading.getBoundingClientRect().top,
          height: window.innerHeight,
          scrolled: window.scrollY,
        })),
      (value) => value.hash === "#summary" && value.top >= 40 && value.top < value.height && value.scrolled > 0
    );
    assert.ok(shown.hash === "#summary" && shown.top >= 40 && shown.top < shown.height && shown.scrolled > 0, JSON.stringify(shown));
  });

  test("a link within a deck shows the slide holding its heading", async () => {
    const { page } = await render(student(), demo, { view: "presentation" });
    await page.waitForFunction(() => window.Reveal?.isReady?.(), { timeout: 15000 });
    await click(page, '#revealContent a[href="#/summary"]', { stable: false }).catch(async () => {
      // The link sits on a slide that is not the current one; following it is
      // what a reader does, and the hash is what the link sets.
      await page.evaluate(() => {
        window.location.hash = "#/summary";
      });
    });
    const heading = await eventually(
      () => page.evaluate(() => window.Reveal.getCurrentSlide()?.querySelector("h2")?.textContent.trim() ?? null),
      (value) => value === "Summary"
    );
    assert.equal(heading, "Summary");
  });

  test("a Content list entry and a wiki link to that heading address the same anchor", async () => {
    const { page } = await render(student(), demo);
    const linked = await page.$eval('#markdown-content a[href$="#second-section"]', (a) => new URL(a.href).hash);
    await render(student(), "/md/test-content-list.md");
    const entry = await page.$$eval(".sidebar-anchors a", (anchors) =>
      anchors.filter((a) => a.textContent.trim() === "Second section").map((a) => a.getAttribute("href"))
    );
    assert.deepEqual(entry, [linked]);
    assert.equal(linked, "#second-section");
  });

  // ---- Note embeds ----

  /** The paragraph an unresolved embed stands in, with the embed's name replaced. */
  const unresolved = (page, name) =>
    page.$$eval(
      "#markdown-content p, #revealContent p",
      (paragraphs, written) =>
        paragraphs
          .filter((p) => p.textContent.trim() === written)
          .map((p) => p.outerHTML.replace(written, "EMBED")),
      `![[${name}]]`
    );

  for (const view of ["page", "presentation"]) {
    test(`a student's embeds in the ${view} view: the visible notes inserted, the others as if missing`, async () => {
      const { page } = await render(student(), host, { view });
      const text = await shownText(page, view);
      for (const word of ["EINBETTUNGGANZ", "EINBETTUNGZWEI", "EINBETTUNGUNTER", "EINBETTUNGBLOCK", "EINBETTUNGOFFEN", "EINBETTUNGSCHLUSS", "EINBETTUNGZYKLUS", "Host closing paragraph."]) {
        assert.ok(text.includes(word), `${view}: ${word} is not shown`);
      }
      for (const word of ["EINBETTUNGEINS", "EINBETTUNGDREI", "EINBETTUNGNACHBAR", "EINBETTUNGLEHRER", "EINBETTUNGVERSTECKT"]) {
        assert.ok(!text.includes(word), `${view}: ${word} is shown to a student`);
      }
      const headings = await page.$$eval("h2, h3", (all) => all.map((heading) => heading.textContent.trim()));
      assert.ok(!headings.includes("Lehrerloesung"), `${view}: the hidden section's heading is shown to a student`);
      assert.ok(text.includes("![[test-embed-host]]"), `${view}: the cycle's embed of the host is not shown as written`);
      const missing = await unresolved(page, "test-embed-does-not-exist");
      assert.equal(missing.length, 1, `${view}: the missing note's embed`);
      assert.deepEqual(await unresolved(page, "test-embed-teacher"), missing, `${view}: the refused embed reads unlike a missing one`);
      assert.deepEqual(await unresolved(page, "test-embed-mixed#Lehrerloesung"), missing, `${view}: the hidden section reads unlike a missing one`);
    });

    test(`a teacher's embeds in the ${view} view include the teacher note and the teacher block`, async () => {
      const { page } = await render(teacher(), host, { view });
      const text = await shownText(page, view);
      for (const word of ["EINBETTUNGGANZ", "EINBETTUNGLEHRER", "EINBETTUNGVERSTECKT"]) {
        assert.ok(text.includes(word), `${view}: ${word} is not shown to a teacher`);
      }
      const headings = await page.$$eval("h2, h3", (all) => all.map((heading) => heading.textContent.trim()));
      assert.ok(headings.includes("Lehrerloesung"), `${view}: the hidden section is not shown to a teacher`);
      assert.deepEqual(await unresolved(page, "test-embed-teacher"), []);
    });
  }

  test("the headings of an embedded section are the page's own: in the Content list and as slides", async () => {
    const { page } = await render(student(), host);
    const listed = await page.$$eval(".sidebar-anchors a", (anchors) => anchors.map((a) => a.textContent.trim()));
    assert.ok(listed.includes("Abschnitt Zwei") && listed.includes("Unterabschnitt"), JSON.stringify(listed));
    const deck = await render(student(), host, { view: "presentation" });
    const headings = await deck.page.$$eval("#revealContent section h2, #revealContent section h3", (all) =>
      all.map((heading) => heading.textContent.trim())
    );
    assert.ok(headings.includes("Abschnitt Zwei") && headings.includes("Unterabschnitt"), JSON.stringify(headings));
  });

  test("an image of an embedded note is served to the student reading the host", async () => {
    const session = student();
    const { page } = await render(session, host);
    assert.ok(await page.$(`#markdown-content img[src$="${embeddedImage}"]`), "the embedded note's image is not on the page");
    const answer = await page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      return { status: response.status, redirected: response.redirected, bytes: (await response.arrayBuffer()).byteLength };
    }, new URL(embeddedImage, applicationUrl).href);
    assert.ok(answer.status === 200 && !answer.redirected && answer.bytes > 0, JSON.stringify(answer));
  });

  test("search finds embedded text in the note it is written in, not in the host", async () => {
    const session = student();
    await render(session, host);
    const answer = await session.page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      return { status: response.status, body: await response.text() };
    }, `${applicationUrl}/search?q=einbettungsuchwort`);
    assert.equal(answer.status, 200, answer.body.slice(0, 200));
    const paths = JSON.parse(answer.body).results.map((result) => result.path);
    assert.deepEqual(paths, [encodeURI(embedded)]);
  });
});
