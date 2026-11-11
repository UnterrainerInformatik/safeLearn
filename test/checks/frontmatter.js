/**
 * A corpus file with Obsidian properties in front of its directive
 * (`frontmatter-properties`), against a running instance.
 *
 * Reads `md/test-frontmatter.md` (frontmatter, then `@@@ teacher`),
 * `md/test-frontmatter-header-only.md` (a text header and a list footer) and
 * `md/test-frontmatter-broken.md` (a block that is not valid YAML). The words
 * in capitals occur in those files' properties and nowhere else in the corpus.
 *
 * Every read of a corpus file strips the block first, so the directive after
 * it gates the file everywhere the directive on line 1 does: the page, the
 * navigation tree, search and the attachment check. Those are driven here one
 * by one, for a student and a teacher, because a read site that forgot the
 * step would show it in exactly one of them. What the block yields - search
 * text, the properties message, header and footer - is checked in all three
 * views. What the splitter itself decides is `test/frontmatter.test.js`.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { applicationUrl, render, setPreferences, sharedSession } from "../harness.js";

const fixture = "/md/test-frontmatter.md";
const headerOnly = "/md/test-frontmatter-header-only.md";
const broken = "/md/test-frontmatter-broken.md";
const plain = "/md/test-md-file.md";
const attachment = "/md/assets/test-attachment-frontmatter.png";

const refusal = "You do not have the required permissions to view this content.";
const footer = "4AHIF - WMC4 - Hausübung 1";

/** A value only in the fixture's `themen` list, and a name only in its properties. */
const topicValue = "THEMENWERTEINS";
const propertyName = "EIGENSCHAFTSNAME";

/** Text of the block that must never appear as content. */
const blockLines = [topicValue, propertyName, "klasse:", "ausgabe:", "2026-12-08", "<b>x</b>"];

describe("frontmatter", () => {
  const sessions = new Map();

  before(async () => {
    for (const role of ["student", "teacher"]) {
      const session = await sharedSession(role);
      await setPreferences(session, {});
      sessions.set(role, session);
    }
  });

  const search = async (session, query) => {
    const answer = await session.page.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      return { status: response.status, body: await response.text() };
    }, `${applicationUrl}/search?q=${encodeURIComponent(query)}`);
    assert.equal(answer.status, 200, `searching ${query} answered ${answer.status}: ${answer.body.slice(0, 200)}`);
    return JSON.parse(answer.body).results;
  };

  const fetchStatus = (session, reference) =>
    session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      const bytes = (await response.arrayBuffer()).byteLength;
      return { status: response.status, redirected: response.redirected, bytes };
    }, new URL(reference, applicationUrl).href);

  const served = (answer) => answer.status === 200 && !answer.redirected && answer.bytes > 0;

  // ---- The directive after the block gates the file ----

  test("a student is refused the file whose @@@ teacher follows its frontmatter", async () => {
    const { text } = await render(sessions.get("student"), fixture);
    assert.match(text, new RegExp(refusal.replace(/\./g, "\\.")));
    assert.doesNotMatch(text, /Frontmatter fixture/);
  });

  test("the file is absent from the student's navigation tree and present in the teacher's", async () => {
    for (const [role, expected] of [["student", false], ["teacher", true]]) {
      const session = sessions.get(role);
      await render(session, plain);
      const entries = await session.page.evaluate(() =>
        [...document.querySelectorAll(".sidebar-dirlist a")].map((a) => decodeURIComponent(a.getAttribute("href")))
      );
      assert.equal(
        entries.some((href) => href.endsWith("test-frontmatter.md")),
        expected,
        `the ${role}'s tree ${expected ? "lacks" : "lists"} ${fixture}`
      );
    }
  });

  test("its attachment is served as its page is: to the teacher and not to the student", async () => {
    await render(sessions.get("teacher"), fixture);
    assert.ok(served(await fetchStatus(sessions.get("teacher"), attachment)), "the teacher is served it");
    await render(sessions.get("student"), fixture);
    assert.ok(!served(await fetchStatus(sessions.get("student"), attachment)), "the student is not");
  });

  // ---- Nothing of the block is content ----

  for (const view of ["page", "document", "presentation"]) {
    test(`a teacher sees the ${view} view without any line of the block`, async () => {
      const { page } = await render(sessions.get("teacher"), fixture, { view });
      // What is shown: the page's closed properties message is left out, since
      // it holds the properties by design and is only opened on request.
      const text = await page.$eval(view === "presentation" ? "#revealContent" : "#markdown-content", (root) => {
        const copy = root.cloneNode(true);
        copy.querySelectorAll("dialog").forEach((dialog) => dialog.remove());
        return copy.textContent;
      });
      assert.match(text, /Frontmatter fixture/);
      for (const line of blockLines) {
        assert.ok(!text.includes(line), `the ${view} view shows ${JSON.stringify(line)} from the frontmatter`);
      }
      if (view !== "presentation") {
        const rules = await page.$$eval("#markdown-content > hr", (hrs) => hrs.length);
        assert.equal(rules, 0, `the ${view} view starts with a rule where the block was`);
      }
    });
  }

  test("the presentation view has no slide made of the block", async () => {
    const { page } = await render(sessions.get("teacher"), fixture, { view: "presentation" });
    const slides = await page.$$eval("#revealContent section:not(.stack)", (sections) =>
      sections.map((section) => section.textContent.trim())
    );
    assert.equal(slides.length, 3, `three slides, one per heading: ${JSON.stringify(slides)}`);
    assert.match(slides[0], /^Frontmatter fixture/);
  });

  // ---- Search ----

  test("a teacher finds the file by a value of its themen list, with that value as snippet and no heading", async () => {
    const results = await search(sessions.get("teacher"), topicValue.toLowerCase());
    const hit = results.find((result) => result.path === encodeURI(fixture));
    assert.ok(hit, `no result for ${topicValue}: ${JSON.stringify(results)}`);
    assert.equal(hit.snippet, topicValue);
    assert.deepEqual(hit.headings, []);
  });

  test("a property name is not content", async () => {
    assert.deepEqual(await search(sessions.get("teacher"), propertyName), []);
  });

  test("a student finds nothing in the properties of a file they may not see", async () => {
    assert.deepEqual(await search(sessions.get("student"), topicValue), []);
  });

  // ---- The properties message ----

  test("the page view's properties button shows every property, markup as text", async () => {
    const { page } = await render(sessions.get("teacher"), fixture);
    assert.equal(await page.$eval("#slProperties", (dialog) => dialog.open), false, "hidden until asked for");
    await page.click("#slPropertiesButton");
    await page.waitForFunction(() => document.getElementById("slProperties").open, { timeout: 5000 });
    const shown = await page.$eval("#slProperties .sl-properties-list", (list) => ({
      names: [...list.children].filter((el) => el.tagName === "DT").map((dt) => dt.textContent),
      values: [...list.children].filter((el) => el.tagName === "DD").map((dd) => dd.textContent),
      topics: [...list.querySelectorAll("dd ul li")].map((li) => li.textContent),
      bold: list.querySelectorAll("b").length,
    }));
    assert.deepEqual(shown.names, ["lang", "klasse", "ausgabe", "abgabe", propertyName, "markup", "footer", "themen"]);
    assert.equal(shown.values[1], "4AHIF");
    assert.equal(shown.values[2], "2026-11-10");
    assert.equal(shown.values[5], "<b>x</b>", "the value is shown as its characters");
    assert.equal(shown.bold, 0, "and not as bold text");
    assert.deepEqual(shown.topics, ["Quarkus CDI", topicValue]);
    await page.click("#slProperties .sl-properties-close");
    await page.waitForFunction(() => !document.getElementById("slProperties").open, { timeout: 5000 });
  });

  test("no properties button without properties, and none in the document or presentation view", async () => {
    for (const [pagePath, view] of [[plain, "page"], [broken, "page"], [fixture, "document"], [fixture, "presentation"]]) {
      const { page } = await render(sessions.get("teacher"), pagePath, { view });
      assert.equal(await page.$("#slPropertiesButton"), null, `${pagePath} as ${view} offers a properties button`);
      assert.equal(await page.$("#slProperties"), null, `${pagePath} as ${view} carries a properties message`);
    }
  });

  // ---- header and footer ----

  for (const view of ["page", "document"]) {
    test(`the ${view} view shows the footer below the content`, async () => {
      const { page } = await render(sessions.get("teacher"), fixture, { view });
      const found = await page.$eval("#markdown-content", (root) => {
        const footer = root.querySelector(".sl-file-footer");
        const lastHeading = [...root.querySelectorAll("h2")].pop();
        return {
          footer: footer?.textContent ?? null,
          below: footer !== null && lastHeading !== undefined && footer.getBoundingClientRect().top > lastHeading.getBoundingClientRect().bottom,
          header: root.querySelector(".sl-file-header")?.textContent ?? null,
        };
      });
      assert.deepEqual(found, { footer, below: true, header: null });
    });

    test(`the ${view} view shows a text header and no list footer`, async () => {
      const { page } = await render(sessions.get("teacher"), headerOnly, { view });
      const found = await page.$eval("#markdown-content", (root) => ({
        header: root.querySelector(".sl-file-header")?.textContent ?? null,
        footer: root.querySelector(".sl-file-footer")?.textContent ?? null,
        first: root.firstElementChild?.className ?? null,
      }));
      assert.deepEqual(found, { header: "WMC4", footer: null, first: "sl-file-header" });
    });
  }

  test("an unreadable block is stripped, and the page shows no header, footer or button", async () => {
    const { page, text } = await render(sessions.get("teacher"), broken);
    assert.match(text, /Frontmatter that cannot be read/);
    assert.ok(!text.includes("BROKENFOOTER") && !text.includes("unclosed"), "nothing of the block is shown");
    assert.equal(await page.$(".sl-file-header, .sl-file-footer, #slPropertiesButton"), null);
  });

  test("the presentation view shows the footer on the first and the last slide, and every slide fits", async () => {
    const { page } = await render(sessions.get("teacher"), fixture, { view: "presentation" });
    await page.waitForFunction(() => window.Reveal && Reveal.isReady(), { timeout: 10000 });
    const onSlide = () =>
      page.evaluate(() => {
        const overlay = document.querySelector(".reveal > .sl-deck-footer");
        const box = overlay?.getBoundingClientRect();
        return {
          footer: overlay?.textContent ?? null,
          visible: !!box && box.height > 0 && box.bottom <= window.innerHeight && box.top >= 0,
          header: document.querySelector(".reveal > .sl-deck-header") !== null,
          fit: Reveal.getCurrentSlide().hasAttribute("data-sl-fit"),
        };
      });
    await page.evaluate(() => Reveal.slide(0));
    assert.deepEqual(await onSlide(), { footer, visible: true, header: false, fit: false }, "first slide");
    await page.evaluate(() => Reveal.slide(Reveal.getTotalSlides() - 1));
    await page.waitForFunction(() => Reveal.isLastSlide(), { timeout: 5000 });
    assert.deepEqual(await onSlide(), { footer, visible: true, header: false, fit: false }, "last slide");
  });

  test("the presentation view shows a text header and no list footer", async () => {
    const { page } = await render(sessions.get("teacher"), headerOnly, { view: "presentation" });
    const found = await page.evaluate(() => ({
      header: document.querySelector(".reveal > .sl-deck-header")?.textContent ?? null,
      footer: document.querySelector(".reveal > .sl-deck-footer")?.textContent ?? null,
    }));
    assert.deepEqual(found, { header: "WMC4", footer: null });
  });

  test("the print view carries the footer on every page", async () => {
    const session = sessions.get("teacher");
    await session.page.goto(`${applicationUrl}${fixture}?print-pdf=true&reveal=true`, { waitUntil: "domcontentloaded" });
    await session.page.waitForSelector(".reveal .pdf-page", { timeout: 20000 });
    await session.page.waitForFunction(
      () => document.querySelectorAll(".reveal .pdf-page > .sl-deck-footer").length > 0,
      { timeout: 10000 }
    );
    const pages = await session.page.$$eval(".reveal .pdf-page", (all) =>
      all.map((pdfPage) => pdfPage.querySelector(":scope > .sl-deck-footer")?.textContent ?? null)
    );
    assert.ok(pages.length >= 3, `the print view has ${pages.length} pages`);
    assert.deepEqual(pages, pages.map(() => footer));
  });
});
