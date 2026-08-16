/**
 * The render pipeline, one feature at a time.
 *
 * Reads `md/test-md-file.md`, which demonstrates every callout type, the
 * collapsible forms, highlighted code, the fragment indices and their reset at
 * headings, the two- and three-column side-by-side layouts, the four image
 * forms, and the PlantUML and Mermaid blocks.
 *
 * One source goes through a fixed chain of rewrites and a break in one of them
 * leaves the rest of the page intact, so each feature is asserted on its own
 * rather than by checking that the page rendered at all.
 *
 * The diagram services are never contacted. PlantUML is proven by decoding the
 * address the application emitted, Mermaid by the element and the script it
 * emitted for it.
 *
 * This is a module, not a test file: `test/content.test.js` imports it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";

import pako from "pako";

import { applicationUrl, render, setPreferences, sharedSession } from "../harness.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const corpusPath = "/md/test-md-file.md";
const corpus = readFileSync(path.join(projectRoot, "md", "test-md-file.md"), "utf8");

/** The icon each callout type is expected to carry, as `lucide-static` names it. */
const calloutIcons = {
  note: "lucide-pencil",
  abstract: "lucide-clipboard-list",
  info: "lucide-info",
  todo: "lucide-circle-check",
  tip: "lucide-flame",
  success: "lucide-check",
  question: "lucide-circle-help",
  warning: "lucide-triangle-alert",
  failure: "lucide-x",
  danger: "lucide-zap",
  bug: "lucide-bug",
  example: "lucide-list",
  quote: "lucide-quote",
};

const remoteImage =
  "https://raw.githubusercontent.com/UnterrainerInformatik/java-http-server/master/docs/standard-request-response-process.png";

/** The alphabet PlantUML's URL encoding uses, in `toPlantUmlEncoding` order. */
const plantUmlAlphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** Turns an encoded PlantUML address back into the bytes it was built from. */
function fromPlantUmlEncoding(encoded) {
  const bytes = [];
  let current = 0;
  let bits = 0;
  for (const character of encoded) {
    const value = plantUmlAlphabet.indexOf(character);
    assert.ok(value >= 0, `"${character}" is not part of the PlantUML alphabet`);
    current = (current << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((current >> bits) & 0xff);
      current &= (1 << bits) - 1;
    }
  }
  return Uint8Array.from(bytes);
}

/**
 * Markdown lexing expands a tab to four spaces before the content reaches the
 * highlighter or the browser, so a source written with tabs arrives indented
 * with spaces. That is the lexer's doing, not the link, callout and fragment
 * rewrites this check is about.
 */
const asLexed = (text) => text.replace(/\t/g, "    ");

/** The body of the first fenced block of `language`, exactly as the source has it. */
function fencedBlock(language) {
  const fence = new RegExp(`^\\s*\`\`\`+\\s*${language}$`, "im");
  const match = fence.exec(corpus);
  assert.ok(match, `md/test-md-file.md should still demonstrate a ${language} block`);
  const start = match.index + match[0].length;
  const end = corpus.indexOf("```", start);
  assert.ok(end > start, `the ${language} block in md/test-md-file.md should be closed`);
  return corpus.slice(start, end);
}

describe("rendering", () => {
  let session;

  before(async () => {
    session = await sharedSession("teacher");
    // Dark mode picks a different Shiki theme, so the code check depends on it.
    await setPreferences(session, {});
  });

  /** Puts the session back on the corpus page and waits until it is on screen. */
  async function showCorpus() {
    const rendered = await render(session, corpusPath);
    // The application serves the body hidden and two scripts reveal it: init()
    // sets `block` once it has read the preferences, and the hot-reload script
    // clears the property on DOMContentLoaded. Either counts as visible, and
    // geometry read before that would be zero everywhere.
    await session.page.waitForFunction(() => document.body.style.display !== "none", {
      timeout: 30000,
    });
    return rendered;
  }

  // ---- 5.1 Callouts ----

  test("every callout type the corpus declares renders as its own element with its icon", async () => {
    await showCorpus();
    const rendered = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content .obsidian-callout")].map((callout) => ({
        collapsible: callout.classList.contains("obsidian-collapsable"),
        icon: callout.querySelector(".obsidian-callout-icon svg")?.getAttribute("class") ?? null,
        title: callout.querySelector(".obsidian-callout-title")?.textContent.trim() ?? null,
        chevron: Boolean(callout.querySelector(".obsidian-callout-chevron")),
      }))
    );

    for (const [type, icon] of Object.entries(calloutIcons)) {
      const title = type.charAt(0).toUpperCase() + type.slice(1);
      const found = rendered.find((callout) => callout.title === title);
      assert.ok(found, `${corpusPath} declares a "${type}" callout, so one titled "${title}" should be rendered`);
      assert.ok(
        found.icon?.includes(icon),
        `the "${type}" callout should carry the ${icon} icon, but carries ${found.icon}`
      );
    }

    // `error` is an alias of `danger` and the corpus gives it a caption, so it is
    // addressed by that caption rather than by a type name.
    const aliased = rendered.find((callout) => callout.title === "collapsable");
    assert.ok(aliased, `${corpusPath} declares an "error" callout captioned "collapsable"`);
    assert.ok(
      aliased.icon?.includes(calloutIcons.danger),
      `"error" is an alias of "danger" and should carry ${calloutIcons.danger}, but carries ${aliased.icon}`
    );

    const captioned = rendered.find((callout) => callout.title === "Sadly, no nesting as of now");
    assert.ok(captioned, "a callout should take its title from the caption the corpus gives it");
  });

  test("a collapsible callout is closed until it is opened, and shows its content afterwards", async () => {
    await showCorpus();
    const collapsibles = await session.page.$$("#markdown-content .obsidian-collapsable");
    assert.equal(
      collapsibles.length,
      2,
      `${corpusPath} demonstrates two collapsible callouts — the long-title form and the "-" form`
    );

    for (const [index, collapsible] of collapsibles.entries()) {
      const closed = await collapsible.evaluate((element) => {
        const content = element.querySelector(".obsidian-callout-content");
        return {
          marked: content.classList.contains("collapsable"),
          open: content.classList.contains("open"),
          height: content.getBoundingClientRect().height,
          text: content.textContent.trim(),
          chevronRotated: Boolean(element.querySelector(".obsidian-callout-chevron.rotated")),
        };
      });
      assert.ok(closed.marked, `collapsible callout ${index + 1} should mark its content collapsible`);
      assert.ok(!closed.open, `collapsible callout ${index + 1} should start closed`);
      assert.equal(closed.height, 0, `collapsible callout ${index + 1} should show nothing while closed`);
      assert.ok(closed.chevronRotated === false, `collapsible callout ${index + 1} should start with its chevron unturned`);
      assert.ok(closed.text.length > 0, `collapsible callout ${index + 1} should have content to reveal`);

      await collapsible.$eval(".obsidian-collapsable-trigger", (trigger) => trigger.click());
      await session.page.waitForFunction(
        (element) => {
          const content = element.querySelector(".obsidian-callout-content");
          return content.classList.contains("open") && content.getBoundingClientRect().height > 0;
        },
        { timeout: 10000 },
        collapsible
      );

      const opened = await collapsible.evaluate((element) => {
        const content = element.querySelector(".obsidian-callout-content");
        return { text: content.textContent.trim(), height: content.getBoundingClientRect().height };
      });
      assert.ok(opened.height > 0, `collapsible callout ${index + 1} should show its content once opened`);
      assert.equal(
        opened.text,
        closed.text,
        `opening collapsible callout ${index + 1} should reveal the content it was hiding, unchanged`
      );
    }
  });

  // ---- 5.2 Fenced code ----

  test("a fenced code block renders as highlighted markup with its content untouched", async () => {
    await showCorpus();
    const highlighted = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content pre.shiki")].map((block) => ({
        classes: block.className,
        spans: block.querySelectorAll("span").length,
        hasCode: Boolean(block.querySelector("code")),
        text: block.textContent,
        inFragment: Boolean(block.closest(".fragment")),
        rewritten: block.querySelectorAll("a, .obsidian-callout, img").length,
      }))
    );
    assert.equal(highlighted.length, 1, `${corpusPath} demonstrates one highlighted code block`);

    const [block] = highlighted;
    assert.ok(block.hasCode, "the code block should be a <pre><code>, not bare text");
    assert.ok(
      block.spans > 10,
      `the code block should be highlighted markup, but carries only ${block.spans} spans`
    );
    assert.equal(
      block.text.replace(/\n+$/, ""),
      asLexed(fencedBlock("java")).replace(/^\n/, "").replace(/\n+$/, ""),
      "the code block's content should survive the link, callout and fragment rewrites unchanged"
    );
    assert.equal(block.rewritten, 0, "nothing inside the code block should have been rewritten into markup");
    assert.ok(!block.inFragment, "the code block should not have been swallowed by a fragment");
  });

  // ---- 5.3 Fragments ----

  test("every fragment carries its index, and the index restarts at the corpus's heading boundaries", async () => {
    await showCorpus();
    const fragments = await session.page.evaluate(() => {
      const root = document.querySelector("#markdown-content");
      const nodes = [...root.querySelectorAll("*")];
      let heading = null;
      const collected = [];
      for (const node of nodes) {
        if (node.tagName === "H2" || node.tagName === "H3") heading = node.textContent.trim();
        if (!node.classList.contains("fragment")) continue;
        collected.push({
          heading,
          index: node.getAttribute("data-fragment-index"),
          inBlockquoteList: Boolean(node.closest("blockquote")) && node.tagName === "LI",
        });
      }
      return {
        collected,
        total: root.querySelectorAll(".fragment").length,
        indexed: root.querySelectorAll(".fragment[data-fragment-index]").length,
      };
    });

    assert.ok(fragments.total > 0, `${corpusPath} should still demonstrate fragments`);
    assert.equal(
      fragments.indexed,
      fragments.total,
      "every element marked as a fragment should carry its index"
    );

    const sections = new Map();
    for (const fragment of fragments.collected) {
      assert.match(
        fragment.index,
        /^\d+$/,
        `a fragment under "${fragment.heading}" carries "${fragment.index}" instead of an index`
      );
      if (!sections.has(fragment.heading)) sections.set(fragment.heading, []);
      sections.get(fragment.heading).push(Number(fragment.index));
    }

    assert.ok(
      sections.size >= 2,
      "the corpus demonstrates fragments under more than one heading, so a reset can be observed"
    );
    for (const [heading, indices] of sections) {
      assert.equal(indices[0], 0, `the first fragment under "${heading}" should restart the index at 0`);
      for (let i = 1; i < indices.length; i++) {
        assert.ok(
          indices[i] >= indices[i - 1],
          `fragment indices under "${heading}" should not go backwards, but ${indices[i - 1]} is followed by ${indices[i]}`
        );
      }
    }

    const blockquoted = fragments.collected.filter((fragment) => fragment.inBlockquoteList);
    assert.ok(
      blockquoted.length >= 3,
      "the corpus demonstrates fragments inside blockquoted lists, and they should be marked too"
    );
    assert.deepEqual(
      blockquoted.slice(0, 3).map((fragment) => Number(fragment.index)),
      [0, 1, 2],
      "the first blockquoted fragment list should number its items 0, 1, 2"
    );
  });

  // ---- 5.4 Side-by-side ----

  test("the side-by-side demonstrations produce exactly two and exactly three columns", async () => {
    await showCorpus();
    const layouts = await session.page.evaluate(() => {
      const root = document.querySelector("#markdown-content");
      return {
        columns: [...root.querySelectorAll(".side-by-side")].map(
          (layout) => layout.querySelectorAll(":scope > .side-by-side-col").length
        ),
        aroundIsOutside: [...root.querySelectorAll("p")]
          .filter((paragraph) =>
            paragraph.textContent.includes("will be below the side-by-side element") ||
            paragraph.textContent.includes("Normal text. Will be displayed centered.")
          )
          .map((paragraph) => Boolean(paragraph.closest(".side-by-side"))),
      };
    });

    assert.deepEqual(
      layouts.columns,
      [2, 3],
      `${corpusPath} demonstrates one two-column and one three-column layout, in that order`
    );
    assert.ok(
      layouts.aroundIsOutside.length >= 4,
      "the corpus surrounds each layout with text before and after it"
    );
    assert.ok(
      layouts.aroundIsOutside.every((inside) => inside === false),
      "text placed before and after a side-by-side layout should stay outside it"
    );
  });

  // ---- 5.5 Images ----

  test("each image form addresses the source it names, with the size suffix as dimensions", async () => {
    await showCorpus();
    const images = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content img")].map((image) => ({
        src: image.getAttribute("src"),
        alt: image.getAttribute("alt"),
        width: image.style.width,
        height: image.style.height,
      }))
    );

    const absolute = images.find((image) => image.src === remoteImage);
    assert.ok(absolute, "the image given as an absolute URL should address exactly that URL");
    assert.equal(absolute.alt, "global-image", "the size suffix should not end up in the description");
    assert.equal(absolute.width, "100px", "the |WxH suffix should become the element's width");
    assert.equal(absolute.height, "300px", "the |WxH suffix should become the element's height");

    const embedded = images.find((image) => image.src?.endsWith("/md/assets/Pasted image 20240315152828.png"));
    assert.ok(embedded, "the Obsidian embed should resolve to the file it names under md/assets");
    assert.equal(embedded.alt, "Pasted image 20240315152828.png", "the embed keeps the file name as its description");

    const relative = images.find((image) => image.src === "/md/assets/test-local-image.jpg");
    assert.ok(relative, "the repository-relative path should be emitted as it was written");
    assert.equal(relative.alt, "local-image");
  });

  // ---- 5.6 PlantUML ----

  test("the PlantUML address encodes the source the corpus holds", async () => {
    await showCorpus();
    const source = await session.page.$eval(
      '#markdown-content img[alt="PlantUML"]',
      (image) => image.getAttribute("src")
    );

    const [service, encoded] = source.split("/svg/");
    assert.ok(encoded, `the PlantUML image should address a /svg/ endpoint, but addresses ${source}`);
    assert.ok(
      service.endsWith("/plantuml"),
      `the PlantUML image should address a PlantUML server, but addresses ${service}`
    );

    const decoded = pako.inflate(fromPlantUmlEncoding(encoded), { to: "string" });
    assert.equal(
      decoded,
      fencedBlock("plantuml"),
      "the address should carry the diagram the corpus declares, encoded the way the service expects"
    );
  });

  // ---- 5.7 Mermaid ----

  test("Mermaid is handed to the browser as markup, and its renderer is served by the application", async () => {
    await showCorpus();
    // Read what the application emitted, not what the page has become: Mermaid
    // runs in the browser and replaces the element's content with the rendered
    // diagram, so the source is only in the response.
    const emitted = await session.page.evaluate(async (address) => {
      const response = await fetch(address, { credentials: "include" });
      const served = new DOMParser().parseFromString(await response.text(), "text/html");
      return {
        blocks: [...served.querySelectorAll("pre.mermaid")].map((block) => block.textContent),
        imports: [...served.querySelectorAll("script[type=module]")]
          .flatMap((script) => [...script.textContent.matchAll(/from\s+"([^"]+)"/g)])
          .map((match) => match[1]),
      };
    }, `${applicationUrl}${corpusPath}`);

    assert.equal(emitted.blocks.length, 1, `${corpusPath} demonstrates one Mermaid diagram`);
    assert.equal(
      emitted.blocks[0].trim(),
      asLexed(fencedBlock("mermaid")).trim(),
      'the <pre class="mermaid"> should carry the diagram source unchanged'
    );

    const mermaidImports = emitted.imports.filter((address) => address.includes("mermaid"));
    assert.ok(mermaidImports.length > 0, "the page should import Mermaid so the browser can render the block");
    for (const address of mermaidImports) {
      assert.ok(
        address.startsWith("/"),
        `Mermaid should be served by the application, but is imported from ${address}`
      );
    }

    // Served by this application, not by a content delivery network.
    const served = await session.page.evaluate(async (addresses) => {
      const answers = [];
      for (const address of addresses) {
        const response = await fetch(address, { credentials: "include" });
        answers.push({ address, status: response.status, type: response.headers.get("content-type") });
      }
      return answers;
    }, mermaidImports);
    for (const answer of served) {
      assert.equal(answer.status, 200, `${answer.address} should be served by the application`);
      assert.match(
        answer.type ?? "",
        /javascript/i,
        `${answer.address} should be served as JavaScript, but is served as ${answer.type}`
      );
    }
  });

  // ---- 5.8 Lists ----

  test("the plain, blockquoted and ordered list forms each render as their own list", async () => {
    await showCorpus();
    const lists = await session.page.evaluate(() =>
      [...document.querySelectorAll("#markdown-content ul, #markdown-content ol")].map((list) => ({
        tag: list.tagName.toLowerCase(),
        items: [...list.querySelectorAll(":scope > li")].map((item) => item.textContent.trim()),
        inBlockquote: Boolean(list.closest("blockquote")),
      }))
    );

    const oneTwoThree = (list) =>
      list.items.length === 3 &&
      list.items[0].startsWith("one") &&
      list.items[1].startsWith("two") &&
      list.items[2].startsWith("three");

    const plain = lists.filter((list) => list.tag === "ul" && !list.inBlockquote && oneTwoThree(list));
    assert.ok(
      plain.length >= 2,
      "the corpus demonstrates the plain list twice, with - and with *, and both should render as lists"
    );

    const quoted = lists.filter((list) => list.tag === "ul" && list.inBlockquote && oneTwoThree(list));
    assert.ok(quoted.length >= 1, "the blockquoted list should render as a list inside the quote");

    const ordered = lists.filter((list) => list.tag === "ol" && list.inBlockquote && oneTwoThree(list));
    assert.equal(ordered.length, 1, "the blockquoted ordered list should render as an <ol> with its three items");
  });

  // ---- Nothing outside the application was needed ----

  test("the corpus page renders without any of the hosts it addresses answering", async () => {
    await showCorpus();
    const refused = [...session.refusedHosts];
    assert.ok(
      refused.includes(new URL(remoteImage).host),
      `the remotely hosted image was fetched instead of being asserted as an address. Refused so far: ${refused.join(", ") || "nothing"}`
    );
    const diagramService = await session.page.$eval(
      '#markdown-content img[alt="PlantUML"]',
      (image) => new URL(image.getAttribute("src")).host
    );
    assert.ok(
      refused.includes(diagramService),
      `${diagramService} was contacted instead of being asserted as an address`
    );
    assert.ok(
      !refused.includes(new URL(applicationUrl).host),
      "the application's own host must never be among the refused ones"
    );
  });
});
