/**
 * What a rendered page presents to the person reading it.
 *
 * Every other check in this suite asks whether the right thing is on the page.
 * This one asks what it looks like once it is there: whether anything blurs or
 * thins the glyphs, whether a narrow screen gets a layout of its own or a
 * desktop one shrunk onto it, whether the families the stylesheets name resolve
 * to files this deployment ships, whether code keeps the size of the prose
 * around it, and whether the dark theme and the link states are readable.
 *
 * Almost all of it is read off a rendered page rather than out of a stylesheet,
 * because that is where the two mistakes this change was built around showed up:
 * a theme rule outranked by a scoping rule added beside it, and an `!important`
 * on a colour swallowing the link rule below it. Neither was visible in the
 * selectors; both were obvious in a picture.
 *
 * The one exception is the visited link, which Chrome will not report - see
 * `linkAppearance`, and the self-check that keeps it honest.
 *
 * This is a module, not a test file: `test/content.test.js` imports it so the
 * whole content suite runs in one process and logs in twice.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";

import { applicationUrl, render, setPreferences, sharedSession } from "../harness.js";

const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const styleDir = path.join(projectRoot, "css");

/** The corpus page this file reads: it carries prose, links, a code block and inline code. */
const corpusPath = "/md/test-md-file.md";

/** The text size the size assertions are made against, in pixels. */
const readerSize = 18;

/** WCAG's contrast floor for body text at the AAA level. */
const aaaBodyText = 7;

/**
 * The generic families a chain may name. `system-ui` and the `ui-` family are
 * keywords like `serif` is: they name whatever the platform considers that kind
 * of face, so they always resolve.
 */
const genericFamilies = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

/**
 * The system faces this project's fallback chains reach for on purpose, named
 * one by one rather than waved through by a pattern. A chain may name these
 * because they are what the platform already has; anything else has to be a
 * family this deployment declares, or it resolves to nothing. Adding a name here
 * is therefore a decision somebody makes rather than a check nobody notices.
 */
const systemFallbacks = new Set(
  [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Helvetica",
    "Arial",
    "Impact",
    "SFMono-Regular",
    "Menlo",
    "Consolas",
    "Apple Color Emoji",
    "Segoe UI Emoji",
  ].map((name) => name.toLowerCase())
);

// ################### Reading the stylesheets from disk ###################

/** Every `css/*.css` file, as `{ file, text }`. */
function styleSheetsOnDisk() {
  return readdirSync(styleDir)
    .filter((entry) => entry.endsWith(".css"))
    .map((entry) => ({
      file: `css/${entry}`,
      text: readFileSync(path.join(styleDir, entry), "utf8"),
    }));
}

/** Every custom property `css/` declares, by name. */
function customProperties(sheets) {
  const properties = new Map();
  for (const sheet of sheets) {
    for (const [, name, value] of sheet.text.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      properties.set(name, value.trim());
    }
  }
  return properties;
}

/**
 * A declared value with a `var()` followed to the property it names, because a
 * declaration written as `var(--r-heading-text-shadow)` says what it is worth
 * where that property is declared rather than where it is used. Returned
 * unchanged when it is not a bare `var()`, or when nothing declares the name.
 */
function resolveVariable(value, properties) {
  const variable = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (!variable) return value;
  const resolved = properties.get(variable[1]);
  return resolved === undefined ? value : resolveVariable(resolved, properties);
}

/** Splits a font-family value into its names, unquoted and trimmed. */
function familyNames(value) {
  return value
    .split(",")
    .map((name) => name.trim().replace(/^["']|["']$/g, ""))
    .filter((name) => name.length > 0);
}

/**
 * Every font-family chain `css/` declares, with the file and the declaration it
 * came from.
 *
 * A chain reached through a custom property is followed to the property's own
 * declaration, because `font-family: var(--r-heading-font)` names its families
 * there rather than at the point of use.
 */
function declaredChains(sheets) {
  const properties = customProperties(sheets);
  const chains = [];
  for (const sheet of sheets) {
    // Not inside an @font-face, where `font-family` names the family being
    // declared rather than a chain being reached for.
    const withoutFontFaces = sheet.text.replace(/@font-face\s*\{[^}]*\}/g, "");
    for (const [, rawValue] of withoutFontFaces.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
      const value = rawValue.trim();
      const resolved = resolveVariable(value, properties);
      assert.ok(
        !resolved.startsWith("var("),
        `${sheet.file} reaches for ${value}, but no stylesheet in css/ declares that property`
      );
      chains.push({ file: sheet.file, declaration: value, names: familyNames(resolved) });
    }
  }
  return chains;
}

/** Every `@font-face` family name `css/` declares, including through its `@import`s. */
function familiesDeclaredByStyleSheets(sheets) {
  const declared = new Set();
  const collect = (text) => {
    for (const [, name] of text.matchAll(
      /@font-face\s*\{[^}]*?font-family\s*:\s*["']?([^;"'}]+)["']?/g
    )) {
      declared.add(name.trim().toLowerCase());
    }
  };
  for (const sheet of sheets) {
    collect(sheet.text);
    // An @import pointing outside css/ carries families too — the deck's
    // heading face is declared by the package the theme imports from.
    for (const [, target] of sheet.text.matchAll(/@import\s+url\(\s*["']?([^)"']+)["']?\s*\)/g)) {
      const onDisk = path.join(projectRoot, target.replace(/^\//, ""));
      try {
        collect(readFileSync(onDisk, "utf8"));
      } catch {
        // Served but not readable from here: the families check reports the
        // name it could not resolve rather than guessing that it exists.
      }
    }
  }
  return declared;
}

// ################### Reading colour off the page ###################

/** Relative luminance of an `rgb(r, g, b)` string, per WCAG. */
function luminance(colour) {
  const [red, green, blue] = colour.match(/[\d.]+/g).slice(0, 3).map(Number);
  const channel = (value) => {
    const fraction = value / 255;
    return fraction <= 0.03928 ? fraction / 12.92 : ((fraction + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** The WCAG contrast ratio between two `rgb()` strings, rounded to two places. */
function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

/**
 * Runs in the browser. The colour of `selector`'s text and the background it is
 * actually read against — the nearest ancestor that paints one, since a
 * paragraph paints nothing and inherits no background.
 */
const measurePair = (page, selector) =>
  page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!element) return null;
    let behind = element;
    let background = getComputedStyle(behind).backgroundColor;
    const unpainted = (colour) => /rgba\(0, 0, 0, 0\)|transparent/.test(colour);
    while (behind && unpainted(background)) {
      behind = behind.parentElement;
      // Nothing between here and the root paints one, so what is behind the
      // text is the browser's own canvas, and that is white.
      if (!behind) return { foreground: getComputedStyle(element).color, background: "rgb(255, 255, 255)" };
      background = getComputedStyle(behind).backgroundColor;
    }
    return { foreground: getComputedStyle(element).color, background };
  }, selector);

// ################### Reading the link states ###################

/**
 * Runs in the browser. What the page's own stylesheets say a link matching
 * `selector` looks like, in the `:link` state and in the `:visited` state.
 *
 * Chrome answers `getComputedStyle` for a visited link with its *unvisited*
 * style. That is a privacy rule rather than a defect, and it is the one thing in
 * this file that cannot be read off the element. What is read instead is the
 * CSSOM the page itself parsed: every rule in every sheet it loaded, matched
 * against this element with the state's pseudo-class substituted, resolved by
 * importance, specificity and order.
 *
 * That is a cascade reimplemented inside a check, which is worth nothing unless
 * it is held against the real one — so the `:link` state is computed the same
 * way and the caller asserts it equals what the browser computed. A walker that
 * gets specificity wrong fails there, loudly, instead of passing a wrong
 * `:visited` quietly.
 */
const linkAppearance = (page, selector) =>
  page.evaluate((query) => {
    const element = document.querySelector(query);
    if (!element) return null;

    /** Every style rule the page loaded, in the order the cascade sees them. */
    const rules = [];
    const walk = (list, applies) => {
      for (const rule of list) {
        if (rule.styleSheet) {
          try {
            walk(rule.styleSheet.cssRules, applies);
          } catch {
            /* A sheet another origin served; this page loads none. */
          }
        } else if (rule.media && rule.cssRules) {
          // A rule inside a query that does not match is not in the cascade at
          // this width, and this check is about the width the page is at.
          if (applies && !window.matchMedia(rule.media.mediaText).matches) continue;
          walk(rule.cssRules, applies);
        } else if (rule.selectorText && rule.style) {
          rules.push(rule);
        }
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules, true);
      } catch {
        /* Same. */
      }
    }

    /** Specificity of one compound selector, as one comparable number. */
    const specificity = (selectorText) => {
      // :not()/:is()/:has() take the specificity of their argument; nothing in
      // css/ nests them, so one unwrapping pass is enough.
      const flat = selectorText.replace(/:(?:not|is|has)\(([^()]*)\)/g, " $1 ");
      const ids = flat.match(/#[\w-]+/g) || [];
      const classes = flat.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+(?:\([^()]*\))?/g) || [];
      const elements =
        flat
          .replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|::?[\w-]+(?:\([^()]*\))?/g, " ")
          .match(/[\w-]+/g) || [];
      return ids.length * 10000 + classes.length * 100 + elements.length;
    };

    /**
     * Whether one compound selector reaches this element in `state`. A link and
     * the same link once followed differ only in the pseudo-class, so a
     * `:visited` rule reaches it exactly when the same selector with `:link`
     * does — which is a question the browser will answer.
     */
    const reaches = (compound, state) => {
      const other = state === "link" ? ":visited" : ":link";
      if (compound.includes(other)) return false;
      const probe = state === "visited" ? compound.replaceAll(":visited", ":link") : compound;
      try {
        return element.matches(probe);
      } catch {
        return false;
      }
    };

    /** The declaration that wins for `property` in `state`, or null. */
    const winner = (property, state) => {
      let best = null;
      rules.forEach((rule, order) => {
        const value = rule.style.getPropertyValue(property);
        if (!value) return;
        const important = rule.style.getPropertyPriority(property) === "important" ? 1 : 0;
        for (const compound of rule.selectorText.split(",")) {
          const trimmed = compound.trim();
          if (!reaches(trimmed, state)) continue;
          const rank = [important, specificity(trimmed), order];
          if (
            !best ||
            rank[0] > best.rank[0] ||
            (rank[0] === best.rank[0] &&
              (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] >= best.rank[2])))
          ) {
            best = { rank, value: value.trim() };
          }
        }
      });
      return best ? best.value : null;
    };

    // Colours are written as hex in the stylesheets and reported as rgb() by
    // getComputedStyle, so a declared value is put through the browser before
    // being compared with one.
    const probe = document.createElement("span");
    document.body.appendChild(probe);
    const asComputed = (value) => {
      if (value === null) return null;
      probe.style.color = "";
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };

    const state = (name) => ({
      colour: asComputed(winner("color", name)),
      underline: winner("text-decoration-line", name),
    });
    const answer = {
      link: state("link"),
      visited: state("visited"),
      browserColour: getComputedStyle(element).color,
      browserUnderline: getComputedStyle(element).textDecorationLine,
    };
    probe.remove();
    return answer;
  }, selector);

// ################### The checks ###################

describe("legibility", () => {
  let session = null;

  before(async () => {
    session = await sharedSession("student");
    await setPreferences(session, { fs: readerSize, dm: 0 });
  });

  /** Puts the session on the corpus page and waits until its owner has shown it. */
  async function showCorpus({ dark = false, width = null } = {}) {
    if (width) await session.page.setViewport({ width, height: 900 });
    await setPreferences(session, { fs: readerSize, dm: dark ? 1 : 0 });
    const rendered = await render(session, corpusPath);
    await session.page.waitForFunction(() => document.body.style.display === "", {
      timeout: 30000,
    });
    return rendered;
  }

  // ---- Nothing softens the glyphs ----

  test("the prose carries no shadow and asks for no rasterisation but the platform's", async () => {
    await showCorpus();
    const prose = await session.page.evaluate(() => {
      const paragraph = document.querySelector("#markdown-content p");
      if (!paragraph) return null;
      const read = (element) => ({
        shadow: getComputedStyle(element).textShadow,
        smoothing: getComputedStyle(element).getPropertyValue("-webkit-font-smoothing"),
      });
      return { paragraph: read(paragraph), body: read(document.body) };
    });

    assert.ok(prose, `${corpusPath} should render prose to measure`);
    for (const [where, measured] of Object.entries(prose)) {
      assert.equal(
        measured.shadow,
        "none",
        `the ${where} should cast no shadow behind its text, but resolves to ${measured.shadow}. ` +
          `A shadow is a blurred copy of every glyph, which is the opposite of sharp.`
      );
      assert.equal(
        measured.smoothing,
        "auto",
        `the ${where} should leave rasterisation to the platform, but asks for ${measured.smoothing}`
      );
    }

    // The other half of the rule, which Chrome cannot answer: -moz-osx-font-smoothing
    // is dropped at parse time here, so it is read where it is written instead.
    const sheets = styleSheetsOnDisk();
    const properties = customProperties(sheets);
    for (const sheet of sheets) {
      for (const property of ["-webkit-font-smoothing", "-moz-osx-font-smoothing", "text-shadow"]) {
        const declared = new RegExp(`(^|[;{\\s])${property}\\s*:\\s*([^;}]+)`, "g");
        for (const [, , raw] of sheet.text.matchAll(declared)) {
          const value = resolveVariable(raw.trim().replace(/\s*!important$/, ""), properties);
          assert.equal(
            value,
            "none",
            `${sheet.file} declares ${property}: ${raw.trim()}. A reader spends hours on this ` +
              `text, so an effect that trades sharpness for style is paid for on every line.`
          );
        }
      }
    }
  });

  // ---- A page is laid out at the width of the device ----

  test("the page and document views declare a viewport, and neither pins the scale", async () => {
    const emitted = await session.page.evaluate(async (base) => {
      const views = { page: "", document: "?document=true", presentation: "?reveal=true" };
      const found = {};
      for (const [view, query] of Object.entries(views)) {
        const response = await fetch(`${base}${query}`, { credentials: "include" });
        const served = new DOMParser().parseFromString(await response.text(), "text/html");
        found[view] = [...served.querySelectorAll('meta[name="viewport"]')].map((meta) =>
          meta.getAttribute("content")
        );
      }
      return found;
    }, `${applicationUrl}${corpusPath}`);

    for (const view of ["page", "document"]) {
      assert.equal(
        emitted[view].length,
        1,
        `the ${view} view should declare exactly one viewport, but declares ${emitted[view].length}. ` +
          `Without one a phone lays the page out at an assumed desktop width and scales the result down.`
      );
      const [content] = emitted[view];
      assert.match(
        content,
        /width\s*=\s*device-width/,
        `the ${view} view should lay the page out at the device's width, but declares "${content}"`
      );
      assert.ok(
        !/maximum-scale|user-scalable\s*=\s*no/.test(content),
        `the ${view} view must leave the reader their zoom, but declares "${content}"`
      );
    }

    // Stated rather than left to be noticed: the deck is the one view that pins
    // its scale, because Reveal computes a deck's own scale against the viewport.
    assert.equal(emitted.presentation.length, 1, "the presentation view should keep its viewport");
    assert.match(
      emitted.presentation[0],
      /user-scalable\s*=\s*no/,
      "the presentation view keeps its scale pinning; that is what lets a deck size itself"
    );
  });

  test("a narrow viewport gets the layout written for it rather than a desktop one shrunk", async () => {
    await showCorpus({ width: 390 });
    try {
      const narrow = await session.page.evaluate(() => {
        const content = document.querySelector("#markdown-content");
        const sidebar = document.querySelector("#sidebar");
        const widest = [...document.querySelectorAll("#markdown-content *")]
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            classes: element.className,
            right: element.getBoundingClientRect().right,
            text: (element.textContent || "").trim().slice(0, 60),
          }))
          .sort((a, b) => b.right - a.right)[0];
        return {
          layoutWidth: document.documentElement.clientWidth,
          contentWidth: content.getBoundingClientRect().width,
          sidebarWidth: sidebar.getBoundingClientRect().width,
          burgerShown: getComputedStyle(document.querySelector(".topbar-burger")).opacity,
          documentScroll: document.documentElement.scrollWidth,
          widest,
        };
      });

      assert.equal(
        narrow.layoutWidth,
        390,
        `a 390px viewport should lay the page out at 390px, but it laid out at ${narrow.layoutWidth}px. ` +
          `That is the viewport declaration not reaching the browser.`
      );
      assert.equal(
        narrow.sidebarWidth,
        0,
        `the navigation column should fold away below 1024px, but stands ${narrow.sidebarWidth}px wide`
      );
      assert.equal(
        narrow.burgerShown,
        "1",
        "the burger that brings the folded navigation back should be visible at this width"
      );
      assert.ok(
        narrow.contentWidth <= narrow.layoutWidth,
        `the content column should fit the viewport, but is ${narrow.contentWidth}px wide in ${narrow.layoutWidth}px`
      );
      assert.ok(
        narrow.documentScroll <= narrow.layoutWidth + 1,
        `nothing should push the page sideways at ${narrow.layoutWidth}px, but it scrolls to ` +
          `${narrow.documentScroll}px. The widest element is the <${narrow.widest.tag}> with ` +
          `class "${narrow.widest.classes}", reaching ${Math.round(narrow.widest.right)}px: ` +
          `"${narrow.widest.text}"`
      );

      // The column is an overlay at this width and the burger is the only way
      // back out of it, so the burger has to survive it being open. It did not:
      // the column's first link stood exactly where the burger is, and a reader
      // tapping to close the navigation navigated Home instead.
      const onTheBurger = () =>
        session.page.evaluate(() => {
          const burger = document.querySelector(".topbar-burger");
          const box = burger.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return {
            reaches: Boolean(hit && (hit === burger || burger.contains(hit))),
            instead: hit ? `<${hit.tagName.toLowerCase()}> "${(hit.textContent || "").trim().slice(0, 30)}"` : "nothing",
          };
        });

      const closed = await onTheBurger();
      assert.ok(closed.reaches, `a tap on the burger should reach it, but lands on ${closed.instead}`);

      await session.page.click(".topbar-burger");
      await session.page.waitForFunction(
        () => document.querySelector("#sidebar").getBoundingClientRect().width > 0,
        { timeout: 10000 }
      );
      const opened = await onTheBurger();
      assert.ok(
        opened.reaches,
        `with the navigation open, a tap on the burger that closes it lands on ${opened.instead} instead`
      );
      await session.page.click(".topbar-burger");
    } finally {
      await session.page.setViewport({ width: 1280, height: 900 });
    }
  });

  // ---- Every font family a stylesheet names resolves ----

  test("every family css/ names is one this deployment declares, a generic, or a named system face", async () => {
    await showCorpus();
    // The names the renderer emits, read from the page it emitted them into
    // rather than from a list this file keeps in step by hand.
    const shipped = await session.page.evaluate(() =>
      [...document.querySelectorAll("head style")]
        .flatMap((style) => [
          ...style.textContent.matchAll(/@font-face\s*\{[^}]*?font-family\s*:\s*"([^"]+)"/g),
        ])
        .map((match) => match[1])
    );
    assert.ok(
      shipped.length > 0,
      "the page should declare the fonts this deployment ships; none were emitted"
    );
    assert.ok(
      shipped.every((name) => /^(main|nav) /.test(name)),
      `getFontImports() names a shipped family "main <basename>" or "nav <basename>". ` +
        `It emitted: ${shipped.join(", ")}`
    );

    const sheets = styleSheetsOnDisk();
    const declared = new Set([
      ...shipped.map((name) => name.toLowerCase()),
      ...familiesDeclaredByStyleSheets(sheets),
    ]);

    for (const chain of declaredChains(sheets)) {
      for (const name of chain.names) {
        const lowered = name.toLowerCase();
        assert.ok(
          declared.has(lowered) || genericFamilies.has(lowered) || systemFallbacks.has(lowered),
          `${chain.file} asks for "${name}" in "font-family: ${chain.declaration}", and nothing ` +
            `declares that family. A name matching nothing hands the text to whatever the browser ` +
            `defaults to, which differs from reader to reader and is typically a serif where a sans ` +
            `was meant. A font this deployment ships is named "main <basename>" or "nav <basename>" ` +
            `after getFontImports(); see docs-development.md.`
        );
      }

      // A chain reaching for a shipped face has to land somewhere when the file
      // does not arrive, and the browser's own default is not somewhere.
      const reachesDeclared = chain.names.some((name) => declared.has(name.toLowerCase()));
      if (!reachesDeclared) continue;
      const last = chain.names[chain.names.length - 1].toLowerCase();
      assert.ok(
        genericFamilies.has(last),
        `${chain.file} reaches for a declared family in "font-family: ${chain.declaration}" but ends ` +
          `at "${chain.names[chain.names.length - 1]}". A chain naming a shipped font ends in a ` +
          `generic family, so a font that fails to load degrades to a related shape.`
      );
    }
  });

  test("the bar above the page, the navigation column and the menu share the reader's navigation font", async () => {
    await showCorpus();
    const chrome = await session.page.evaluate(() => {
      const of = (selector) => {
        const element = document.querySelector(selector);
        return element
          ? { classed: element.classList.contains("nav-font"), family: getComputedStyle(element).fontFamily }
          : null;
      };
      return { topbar: of("#topbar"), sidebar: of("#sidebar"), menu: of("#topdown-menu") };
    });

    for (const [where, measured] of Object.entries(chrome)) {
      assert.ok(measured, `the page should render its ${where}`);
      assert.ok(
        measured.classed,
        `the ${where} should follow the reader's navigation font, which is what .nav-font marks`
      );
    }
    assert.equal(
      chrome.topbar.family,
      chrome.sidebar.family,
      `the bar above the page renders in ${chrome.topbar.family} while the navigation column ` +
        `renders in ${chrome.sidebar.family}. One reader's chrome should be one font.`
    );
    assert.equal(chrome.menu.family, chrome.sidebar.family, "the menu should follow it too");
  });

  // ---- Code sits at the size of the prose around it ----

  test("inline code and a code block share one face, both in proportion to the reader's size", async () => {
    await showCorpus();
    const code = await session.page.evaluate(() => {
      const block = document.querySelector("#markdown-content pre.shiki");
      const inline = document.querySelector("#markdown-content :not(pre) > code");
      const paragraph = document.querySelector("#markdown-content p");
      const read = (element) =>
        element
          ? {
              size: parseFloat(getComputedStyle(element).fontSize),
              family: getComputedStyle(element).fontFamily,
              wordBreak: getComputedStyle(element).wordBreak,
              overflowWrap: getComputedStyle(element).overflowWrap,
            }
          : null;
      return {
        block: read(block),
        inline: read(inline),
        prose: read(paragraph),
        root: parseFloat(getComputedStyle(document.querySelector("#markdown-content")).fontSize),
      };
    });

    assert.ok(code.block, `${corpusPath} should still render a highlighted code block`);
    assert.ok(code.inline, `${corpusPath} should still name an identifier in its prose`);
    assert.equal(code.root, readerSize, "the reader's chosen size should be the one in effect");

    const expected = Math.round(readerSize * 0.9 * 100) / 100;
    for (const [where, measured] of [["block", code.block], ["inline", code.inline]]) {
      assert.ok(
        Math.abs(measured.size - expected) < 0.05,
        `${where} code should sit at ${expected}px beside ${readerSize}px prose, but sits at ` +
          `${measured.size}px. Left unstyled an inline span falls to the browser's own monospace ` +
          `default, at a size that holds only by the accident of an unrelated inline style.`
      );
    }
    assert.equal(
      code.inline.family,
      code.block.family,
      `an identifier named in a sentence renders in ${code.inline.family} while the block below it ` +
        `renders in ${code.block.family}. In a corpus that names identifiers in nearly every ` +
        `paragraph, that is a change of face in the middle of most lines.`
    );
    assert.notEqual(
      code.inline.family,
      code.prose.family,
      "inline code should still read as code rather than as the prose around it"
    );

    // A long token wraps at the edge rather than being cut mid-word.
    const wrapping = await session.page.evaluate(() => {
      const of = (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).wordBreak : null;
      };
      return { block: of("#markdown-content pre.shiki"), title: of(".topbar-title") };
    });
    for (const [where, value] of Object.entries(wrapping)) {
      assert.notEqual(
        value,
        "break-all",
        `the ${where} breaks a long token at an arbitrary character; it should wrap at the edge instead`
      );
    }
    for (const [where, measured] of [["block", code.block], ["inline", code.inline]]) {
      assert.equal(
        measured.overflowWrap,
        "anywhere",
        `${where} code should let a token too long for the line wrap rather than overflow`
      );
    }
  });

  test("changing the reader's text size moves the code with it", async () => {
    const larger = 24;
    await setPreferences(session, { fs: larger, dm: 0 });
    await render(session, corpusPath);
    await session.page.waitForFunction(() => document.body.style.display === "", { timeout: 30000 });

    const sizes = await session.page.evaluate(() => ({
      block: parseFloat(
        getComputedStyle(document.querySelector("#markdown-content pre.shiki")).fontSize
      ),
      inline: parseFloat(
        getComputedStyle(document.querySelector("#markdown-content :not(pre) > code")).fontSize
      ),
    }));

    const expected = Math.round(larger * 0.9 * 100) / 100;
    for (const [where, size] of Object.entries(sizes)) {
      assert.ok(
        Math.abs(size - expected) < 0.05,
        `${where} code should follow the reader to ${expected}px when they choose ${larger}px prose, ` +
          `but stayed at ${size}px`
      );
    }
    await setPreferences(session, { fs: readerSize, dm: 0 });
  });

  // ---- The dark theme is legible over a long session ----

  test("both themes clear AAA for body text, and the dark one stops short of the maximum", async () => {
    for (const dark of [false, true]) {
      await showCorpus({ dark });
      const measured = await measurePair(session.page, "#markdown-content p");
      assert.ok(measured, `${corpusPath} should render prose in the ${dark ? "dark" : "light"} theme`);

      const ratio = contrast(measured.foreground, measured.background);
      assert.ok(
        ratio >= aaaBodyText,
        `${dark ? "dark" : "light"} prose measures ${ratio}:1 (${measured.foreground} on ` +
          `${measured.background}), below the ${aaaBodyText}:1 WCAG asks of body text`
      );

      if (!dark) continue;

      assert.notEqual(
        measured.foreground,
        "rgb(255, 255, 255)",
        "the dark theme should not set pure white: at that separation light glyphs bloom into the " +
          "dark, which a reader feels as fatigue rather than sees as a defect"
      );
      const maximum = contrast("rgb(255, 255, 255)", measured.background);
      assert.ok(
        ratio < maximum,
        `the dark pairing measures ${ratio}:1, which is the most that background can reach ` +
          `(${maximum}:1). It should clear the threshold comfortably without going to the maximum.`
      );
    }
  });

  // ---- A link looks the same whether or not it has been followed ----

  test("a link in the text looks the same followed or not, in both themes, and is underlined", async () => {
    for (const dark of [false, true]) {
      await showCorpus({ dark });
      const theme = dark ? "dark" : "light";

      const content = await linkAppearance(session.page, "#markdown-content a[href]");
      assert.ok(content, `${corpusPath} should render a link in its text`);

      // The walker, held against the cascade it is imitating.
      assert.equal(
        content.link.colour,
        content.browserColour,
        `this check computes the ${theme} link's colour from the page's own stylesheets so it can ` +
          `report the visited state, which Chrome will not. It computed ${content.link.colour} where ` +
          `the browser computes ${content.browserColour}, so the computation is wrong and nothing ` +
          `it says about the visited state can be trusted.`
      );
      assert.equal(content.link.underline, content.browserUnderline, "and its underlining likewise");

      assert.equal(
        content.visited.colour,
        content.link.colour,
        `a ${theme} link in the text is ${content.link.colour} before it is followed and ` +
          `${content.visited.colour} afterwards. Where a reader has been is invisible to the author, ` +
          `so a page that changes with it is a page nobody can see whole.`
      );
      assert.equal(
        content.visited.underline,
        content.link.underline,
        `a ${theme} link in the text is "${content.link.underline}" before it is followed and ` +
          `"${content.visited.underline}" afterwards`
      );
      assert.equal(
        content.link.underline,
        "underline",
        `a link standing in prose should be underlined, so it is not marked by colour alone; ` +
          `the ${theme} one is "${content.link.underline}"`
      );

      const background = (await measurePair(session.page, "#markdown-content p")).background;
      const ratio = contrast(content.link.colour, background);
      assert.ok(
        ratio >= aaaBodyText,
        `the ${theme} link measures ${ratio}:1 (${content.link.colour} on ${background}). A theme ` +
          `rule outranked by the rule scoping content links is how this reads 1.3:1 and looks ` +
          `like prose on a near-black page.`
      );
      if (dark) {
        assert.notEqual(
          content.link.colour,
          (await measurePair(session.page, "#markdown-content p")).foreground,
          "a dark link should be told from the prose it stands in"
        );
      }

      // The navigation is the other half of the rule: a list of links is not
      // prose, and its items may go without an underline — but not without
      // agreeing with themselves.
      const navigation = await linkAppearance(session.page, "#sidebar .sidebar-menu a[href]");
      assert.ok(navigation, "the navigation column should render links");
      assert.equal(
        navigation.link.colour,
        navigation.browserColour,
        "the walker should agree with the browser on the navigation link too"
      );
      assert.equal(
        navigation.visited.colour,
        navigation.link.colour,
        `a ${theme} navigation link is ${navigation.link.colour} before it is followed and ` +
          `${navigation.visited.colour} afterwards`
      );
      assert.equal(
        navigation.visited.underline,
        navigation.link.underline,
        "and should keep its underlining, or its absence, either way"
      );
    }
    await setPreferences(session, { fs: readerSize, dm: 0 });
  });
});
