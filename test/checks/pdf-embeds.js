/**
 * Wiki links and embeds that name a PDF, in all three views.
 *
 * Reads `md/test-pdf-link.md`, which links `md/assets/test-pdf mündlich.pdf`
 * with `[[…]]`, and `md/test-pdf-embed.md`, which embeds it with `![[…]]` and
 * `![[…|600x400]]`. The name holds a space and an umlaut on purpose: every
 * address below has to be the percent-encoded one, and has to be served.
 *
 * The student session is used throughout. The PDF is referenced on unrestricted
 * pages only, so a student is served it - which holds only if the attachment
 * gate counts a `[[…]]` link as a reference. `test/attachments.test.js` covers
 * the gate's edge cases without a server.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { applicationUrl, render, setPreferences, sharedSession } from "../harness.js";

const linkPage = "/md/test-pdf-link.md";
const embedPage = "/md/test-pdf-embed.md";
const pdfName = "test-pdf mündlich.pdf";
const pdfPath = "/md/assets/test-pdf%20m%C3%BCndlich.pdf";

/** Requests `address` from inside the page, with the session's cookies. */
function request(page, address) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { credentials: "include" });
    const buffer = await response.arrayBuffer();
    return {
      status: response.status,
      redirected: response.redirected,
      contentType: response.headers.get("content-type"),
      bytes: buffer.byteLength,
    };
  }, address);
}

async function assertServedAsPdf(page, address, why) {
  const answer = await request(page, address);
  assert.ok(
    answer.status === 200 && !answer.redirected && /application\/pdf/.test(answer.contentType ?? "") && answer.bytes > 0,
    `${address} (${why}) should answer 200 application/pdf, but answered ${answer.status}` +
      `${answer.redirected ? ", redirected" : ""} as ${answer.contentType}`
  );
}

/** The wiki-link anchors of the rendered content: text and the path they address. */
function pdfLinks(page, root) {
  return page.$$eval(`${root} a`, (anchors) =>
    anchors
      .filter((anchor) => anchor.getAttribute("href")?.includes("/md/assets/"))
      .map((anchor) => ({ text: anchor.textContent.trim(), path: new URL(anchor.href).pathname, href: anchor.href }))
  );
}

/** Every PDF placeholder of the rendered content, as the browser holds it now. */
function placeholders(page, root) {
  return page.$$eval(`${root} .sl-pdf`, (embeds) =>
    embeds.map((embed) => {
      const frame = embed.querySelector("iframe");
      const link = embed.querySelector("a");
      const rect = frame?.getBoundingClientRect();
      return {
        dataSrc: embed.dataset.src ? new URL(embed.dataset.src).pathname : null,
        width: embed.dataset.width ?? null,
        height: embed.dataset.height ?? null,
        frame: frame
          ? { src: frame.src, path: new URL(frame.src).pathname, width: rect.width, height: rect.height }
          : null,
        link: link ? { text: link.textContent.trim(), path: new URL(link.href).pathname, href: link.href } : null,
        linkAfterFrame: Boolean(frame && link && frame.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    })
  );
}

describe("PDF links and embeds", () => {
  let session;

  before(async () => {
    session = await sharedSession("student");
    await setPreferences(session, {});
  });

  test("a wiki link to a PDF renders as a link to its encoded path, and the PDF is served", async () => {
    for (const view of ["page", "presentation", "document"]) {
      await render(session, linkPage, { view });
      const root = view === "presentation" ? "#revealContent" : "#markdown-content";
      const links = await pdfLinks(session.page, root);
      assert.deepEqual(
        links.map(({ text, path }) => ({ text, path })),
        [
          { text: pdfName, path: pdfPath },
          { text: "Arbeitsblatt", path: pdfPath },
        ],
        `${linkPage} as a ${view} should link the PDF by name and by its own text`
      );
      await assertServedAsPdf(session.page, links[0].href, `linked from ${linkPage} as a ${view}`);
    }
  });

  test("a wiki link to a PDF written as inline code stays as written", async () => {
    await render(session, linkPage, { view: "page" });
    const code = await session.page.$$eval("#markdown-content code", (spans) => spans.map((span) => span.textContent));
    assert.ok(
      code.includes(`[[${pdfName}]]`),
      `${linkPage} should show [[${pdfName}]] verbatim inside code, but its code spans read ${JSON.stringify(code)}`
    );
  });

  test("the sanitized page keeps the placeholder, its size and the encoded link", async () => {
    const embeds = await session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      const document = new DOMParser().parseFromString(await response.text(), "text/html");
      return [...document.querySelectorAll("#revealContent .sl-pdf")].map((embed) => ({
        src: embed.getAttribute("data-src"),
        width: embed.getAttribute("data-width"),
        height: embed.getAttribute("data-height"),
        href: embed.querySelector("a")?.getAttribute("href") ?? null,
        frames: embed.querySelectorAll("iframe").length,
      }));
    }, `${applicationUrl}${encodeURI(embedPage)}?reveal=true`);
    const url = `${applicationUrl}${pdfPath}`;
    assert.deepEqual(
      embeds,
      [
        { src: url, width: null, height: null, href: url, frames: 0 },
        { src: url, width: "600px", height: "400px", href: url, frames: 0 },
      ],
      `${embedPage} should arrive with two placeholders, the second carrying its size, and no iframe yet`
    );
  });

  test("an embedded PDF is shown inline on the page, with its link beneath", async () => {
    await render(session, embedPage, { view: "page" });
    const embeds = await placeholders(session.page, "#markdown-content");
    assert.equal(embeds.length, 2, `${embedPage} should hold two PDF embeds`);
    for (const embed of embeds) {
      assert.ok(embed.frame, `every embed on ${embedPage} should have been given an iframe`);
      assert.equal(embed.frame.path, pdfPath);
      assert.ok(embed.frame.width > 0 && embed.frame.height > 0, "the inline viewer should take up room on the page");
      assert.deepEqual({ text: embed.link?.text, path: embed.link?.path }, { text: pdfName, path: pdfPath });
      assert.ok(embed.linkAfterFrame, "the link should stand beneath the viewer");
      await assertServedAsPdf(session.page, embed.frame.src, `the iframe on ${embedPage}`);
    }
    assert.deepEqual(
      { width: Math.round(embeds[1].frame.width), height: Math.round(embeds[1].frame.height) },
      { width: 600, height: 400 },
      "![[…|600x400]] should show a viewer of 600 by 400 pixels"
    );
  });

  test("an embedded PDF is shown inline on its slide, within the slide", async () => {
    await render(session, embedPage, { view: "presentation" });
    const measured = await session.page.evaluate(async () => {
      const embed = document.querySelector("#revealContent .sl-pdf");
      const { h, v } = Reveal.getIndices(embed.closest("section"));
      Reveal.slide(h, v);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const frame = embed.querySelector("iframe");
      const slides = document.querySelector(".reveal .slides").getBoundingClientRect();
      const rect = frame?.getBoundingClientRect();
      return {
        present: embed.closest("section").classList.contains("present"),
        frame: frame
          ? {
              width: rect.width,
              height: rect.height,
              visible: getComputedStyle(frame).visibility === "visible",
              preventsSwipe: frame.hasAttribute("data-prevent-swipe"),
              within:
                rect.left >= slides.left - 1 &&
                rect.top >= slides.top - 1 &&
                rect.right <= slides.right + 1 &&
                rect.bottom <= slides.bottom + 1,
            }
          : null,
        slides: { left: slides.left, top: slides.top, right: slides.right, bottom: slides.bottom },
        rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
      };
    });
    assert.ok(measured.present, "the slide holding the embed should be the one on screen");
    assert.ok(measured.frame, "the embed on the slide should have been given an iframe");
    assert.ok(measured.frame.width > 0 && measured.frame.height > 0 && measured.frame.visible, "the viewer should be visible");
    assert.ok(
      measured.frame.within,
      `the viewer should stay within the slide: ${JSON.stringify(measured.rect)} in ${JSON.stringify(measured.slides)}`
    );
    assert.ok(measured.frame.preventsSwipe, "scrolling the viewer should not change the slide on a touch screen");
  });

  test("the printable document shows the link to an embedded PDF and no viewer", async () => {
    await render(session, embedPage, { view: "document" });
    const embeds = await placeholders(session.page, "#markdown-content");
    assert.equal(embeds.length, 2, `${embedPage} as a document should still hold both embeds`);
    for (const embed of embeds) {
      assert.equal(embed.frame, null, "the printable document should show no inline viewer");
      assert.deepEqual({ text: embed.link?.text, path: embed.link?.path }, { text: pdfName, path: pdfPath });
    }
  });
});
