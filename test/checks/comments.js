/**
 * Obsidian comments (`obsidian-comments`), against a running instance.
 *
 * Reads `md/test-comments.md`, a file visible to everyone with inline, block
 * and unclosed comments, `%%` in inline code, a Java block and a Mermaid
 * block, and an attachment named only inside a comment. Also reads
 * `md/test-comments-gated.md`, whose `@@@ teacher` on line 1 is followed by a
 * comment on line 2. The words in capitals beginning with KOMMENTAR stand
 * only inside comments and occur nowhere else in the corpus.
 *
 * Every read of a corpus file removes comments right after the whole-file
 * directive is decided. The reads are driven here one by one: the three views,
 * search (index and answer), the navigation tree and the attachment check. A
 * read site that forgot the step would show a comment in exactly one of them.
 * What a comment is, case by case, is `test/comments.test.js`.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { applicationUrl, render, setPreferences, sharedSession } from "../harness.js";

const fixture = "/md/test-comments.md";
const gated = "/md/test-comments-gated.md";
const plain = "/md/test-md-file.md";
const attachment = "/md/assets/test-attachment-comments.png";

const refusal = "You do not have the required permissions to view this content.";

/** Words that stand only inside a comment of the two fixtures. */
const commentWords = [
  "KOMMENTARNOTIZ",
  "KOMMENTARNACHBAR",
  "KOMMENTARZWEI",
  "KOMMENTARDREI",
  "KOMMENTARBLOCK",
  "KOMMENTARLEHRER",
  "KOMMENTARUEBERSCHRIFT",
  "KOMMENTARFOLIE",
  "KOMMENTARENDE",
  "KOMMENTARLETZTEFOLIE",
  "KOMMENTARGESPERRT",
];

/** Text outside every comment, which has to stay. */
const keptText = [
  "Comments fixture",
  "Die Lösung ist",
  "im Skript.",
  "A  B  C",
  "%%OFFENSICHTBAR ohne Partner",
  "Code keeps its marks",
  "The paragraph after the code is shown.",
  "The text before the unclosed comment is shown.",
];

const views = Object.freeze({ page: "#markdown-content", document: "#markdown-content", presentation: "#revealContent" });

describe("comments", () => {
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

  /** The text of the view's content, whitespace collapsed the way a reader sees it. */
  const shownText = async (page, view) =>
    page.$eval(views[view], (root) => root.textContent.replace(/[ \t]+/g, " "));

  // ---- No view renders a comment ----

  for (const view of Object.keys(views)) {
    test(`a student sees the ${view} view without any comment and with everything around them`, async () => {
      const { page } = await render(sessions.get("student"), fixture, { view });
      const text = await page.$eval(views[view], (root) => root.textContent);
      for (const word of commentWords) {
        assert.ok(!text.includes(word), `the ${view} view shows ${word}, which stands inside a comment`);
      }
      const collapsed = await shownText(page, view);
      for (const kept of keptText) {
        const expected = kept.replace(/[ \t]+/g, " ");
        assert.ok(collapsed.includes(expected), `the ${view} view lacks ${JSON.stringify(kept)}, which is outside every comment`);
      }
    });

    test(`code keeps its %% in the ${view} view`, async () => {
      const { page } = await render(sessions.get("student"), fixture, { view });
      const code = await page.$eval(views[view], (root) =>
        [...root.querySelectorAll("code")].map((element) => element.textContent)
      );
      assert.ok(code.includes("%%"), `the inline code \`%%\` is missing: ${JSON.stringify(code)}`);
      assert.ok(
        code.some((block) => block.includes('String.format("%.1f%%", 12.5)')),
        `the Java block lost its format string: ${JSON.stringify(code)}`
      );
    });
  }

  test("a teacher, who may see the @@@ teacher block inside a comment, does not see it either", async () => {
    const { text } = await render(sessions.get("teacher"), fixture);
    assert.ok(!text.includes("KOMMENTARLEHRER"), "the teacher block inside a comment was rendered");
    assert.ok(!text.includes("KOMMENTARNOTIZ"));
  });

  test("the presentation has no slide made of a heading or a setext rule inside a comment", async () => {
    const { page } = await render(sessions.get("student"), fixture, { view: "presentation" });
    const slides = await page.$$eval("#revealContent section:not(.stack)", (sections) =>
      sections.map((section) => section.textContent.trim().split("\n")[0])
    );
    assert.equal(slides.length, 3, `three slides, one per heading outside a comment: ${JSON.stringify(slides)}`);
    assert.match(slides[0], /^Comments fixture/);
    assert.match(slides[1], /^Code keeps its marks/);
    assert.match(slides[2], /^Last slide/);
  });

  test("Mermaid receives its own %% comment and draws the diagram", async () => {
    const session = sessions.get("student");
    const emitted = await session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      const served = new DOMParser().parseFromString(await response.text(), "text/html");
      return [...served.querySelectorAll("pre.mermaid")].map((block) => block.textContent);
    }, `${applicationUrl}${fixture}`);
    assert.equal(emitted.length, 1, `one Mermaid block: ${JSON.stringify(emitted)}`);
    assert.match(emitted[0], /%% layout note for Mermaid itself/);
    assert.match(emitted[0], /KNOTENA --> KNOTENB/);

    const { page } = await render(session, fixture);
    await page.waitForSelector("pre.mermaid svg", { timeout: 15000 }).catch(() => {
      throw new Error(`${fixture}: Mermaid drew no diagram from a block carrying its own %% comment.`);
    });
    const labels = await page.$eval("pre.mermaid svg", (svg) => svg.textContent);
    assert.match(labels, /KNOTENA/);
    assert.match(labels, /KNOTENB/);
  });

  // ---- Search ----

  test("a word that stands only inside comments finds nothing, for either role", async () => {
    for (const role of ["student", "teacher"]) {
      for (const word of ["KOMMENTARNOTIZ", "KOMMENTARLEHRER", "KOMMENTARENDE", "KOMMENTARGESPERRT"]) {
        assert.deepEqual(
          await search(sessions.get(role), word.toLowerCase()),
          [],
          `the ${role} found ${word}, which stands only inside a comment`
        );
      }
    }
  });

  test("a snippet next to a comment quotes the paragraph without it", async () => {
    const results = await search(sessions.get("student"), "suchwortneben");
    const hit = results.find((result) => result.path === encodeURI(fixture));
    assert.ok(hit, `no result for SUCHWORTNEBEN: ${JSON.stringify(results)}`);
    assert.ok(!hit.snippet.includes("KOMMENTARNACHBAR"), `the snippet quotes the comment: ${hit.snippet}`);
    assert.match(hit.snippet, /SUCHWORTNEBEN steht in einem Satz mit einem Kommentar\./);
  });

  // ---- The attachment check ----

  test("an attachment named only inside a comment is served to no one", async () => {
    for (const role of ["student", "teacher"]) {
      const session = sessions.get(role);
      await render(session, fixture);
      assert.ok(!served(await fetchStatus(session, attachment)), `the ${role} is served ${attachment}`);
    }
  });

  // ---- The directive is read before the comments go ----

  test("a student is refused the file whose @@@ teacher is followed by a comment", async () => {
    const { text } = await render(sessions.get("student"), gated);
    assert.match(text, new RegExp(refusal.replace(/\./g, "\\.")));
    assert.doesNotMatch(text, /Gated comments fixture/);
  });

  test("a teacher sees the gated file without its comment", async () => {
    const { text } = await render(sessions.get("teacher"), gated);
    assert.match(text, /Gated comments fixture/);
    assert.ok(!text.includes("KOMMENTARGESPERRT"));
  });

  test("the gated file is absent from the student's navigation tree and present in the teacher's", async () => {
    for (const [role, expected] of [["student", false], ["teacher", true]]) {
      const session = sessions.get(role);
      await render(session, plain);
      const entries = await session.page.evaluate(() =>
        [...document.querySelectorAll(".sidebar-dirlist a")].map((a) => decodeURIComponent(a.getAttribute("href")))
      );
      assert.equal(
        entries.some((href) => href.endsWith("test-comments-gated.md")),
        expected,
        `the ${role}'s tree ${expected ? "lacks" : "lists"} ${gated}`
      );
    }
  });

  test("search finds the gated file for the teacher and not for the student", async () => {
    const teacher = await search(sessions.get("teacher"), "gesperrtinhalt");
    assert.ok(
      teacher.some((result) => result.path === encodeURI(gated)),
      `the teacher does not find ${gated}: ${JSON.stringify(teacher)}`
    );
    assert.deepEqual(await search(sessions.get("student"), "gesperrtinhalt"), []);
  });
});
