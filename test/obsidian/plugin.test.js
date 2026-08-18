/**
 * What the SafeLearn plugin does inside Obsidian.
 *
 * These checks state the behavior the plugin is supposed to have, not the
 * behavior it happens to have. Where the two disagree the check is red, and the
 * repair is what turns it green - which is the whole reason the harness was
 * built before the repair was written. Three checks here previously asserted
 * today's defects on purpose so that a repair would turn them red; they were
 * rewritten in place by `plugin-fix-editor-decorations` rather than deleted, so
 * the coverage they carried is still here.
 *
 * `plugin-hide-tags` rewrote a further set of them, and for a reason worth
 * stating: a directive line at rest is no longer made of its own characters, so
 * every check that compared against that text was saying something the change is
 * entitled to alter. Two things were done to each, deliberately rather than
 * until it went green. Where a check was about *which lines* a block covers, it
 * now asserts the lines. Where it was about what the plugin concluded per entry,
 * it puts the cursor in the line first - a marking on characters cannot be read
 * from a line whose characters are not shown, and a check reading it at rest
 * would find nothing and pass against anything.
 *
 * A few checks are green before the repair as well. They are not idle: each
 * states a requirement that no single line of the repair produces on its own -
 * a scroll shows the right markings today because the plugin decorates the whole
 * document, and stops doing so for free once decorations are emitted per
 * viewport. Those are the checks that notice when a repair is done halfway.
 *
 * Run with `npm run test:obsidian`. It opens a real Obsidian window, needs no
 * login and starts no server.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  answerColumnCount,
  answerNameList,
  blockBoxes,
  closeExtraViews,
  columns,
  columnsAreSideBySide,
  corpusPath,
  cursorPosition,
  dialogBoxes,
  documentText,
  editorMenuItems,
  forgetNotices,
  forgetRaised,
  headings,
  noticesShown,
  markers,
  moveCursorInto,
  obsidianVersion,
  open,
  placeCursorAfter,
  placeCursorAtStart,
  plantInRenderedView,
  plantedText,
  provokeError,
  raised,
  registeredCommands,
  renderedHtml,
  reveal,
  runCommand,
  screenshot,
  scrollTo,
  selectAcross,
  shutdown,
  start,
  styleOf,
  type,
  vaultPath,
  views,
  visibleText,
  writeDocument,
} from "./harness.js";

const FRAGMENTS = "test-md-file.md";
const PSEUDO_ROLES = "test-exam-practice-question.md";

/** The one form the renderer acts on, and therefore the only one that may be marked. */
const FRAGMENT = "##fragment";

/** What stands in the editor where a fragment marker's characters are, at rest. */
const FRAGMENT_ICON = "🔀";

/**
 * Runs a check and, if it fails, leaves an image of what was on screen before
 * rethrowing with the path appended. A defect about what something looks like,
 * reported as an assertion message alone, cannot be judged afterwards - the
 * server harness attaches a screenshot to a failed login for the same reason.
 */
async function watched(name, body) {
  try {
    await body();
  } catch (failure) {
    let shot = null;
    try {
      shot = await screenshot(name);
    } catch {
      // A screenshot that cannot be taken must not replace the real failure.
    }
    if (shot) failure.message += `\n  A screenshot of this is at ${shot}.`;
    throw failure;
  }
}

/** Every marking of one kind, in document order, as `L<line>C<column>:"<text>"`. */
function shapeOf(found, kind) {
  return found
    .filter((m) => (kind ? m.marker === kind : true))
    .sort((a, b) => (a.from ?? 0) - (b.from ?? 0))
    .map((m) => `L${m.line}C${m.column}:${JSON.stringify(m.text)}`);
}

/**
 * Where the fragment icons stand, in document order, as `L<line>C<column>`.
 *
 * Without the text, because there is none to compare: a fragment at rest is
 * shown as the icon that replaced its characters, and every icon says the same
 * thing. What a check about a fragment is asking is *where* it is - the position
 * comes from `posAtDOM`, so an icon that stayed behind at an offset after an
 * edit reports a line the tag no longer stands on.
 */
function iconsOf(found) {
  return found
    .filter((m) => m.marker === "fragment-icon")
    .sort((a, b) => (a.from ?? 0) - (b.from ?? 0))
    .map((m) => `L${m.line}C${m.column}`);
}

/**
 * Which lines carry a marking of one kind, in order.
 *
 * Several checks below are about *which lines* a block covers, and were written
 * against the text of those lines because the text was there to compare. It is
 * no longer: a directive line at rest is shown as its heading, so the line that
 * opens a block reports the heading's text rather than `@@@ teacher`. Asserting
 * the line numbers says what those checks meant and stops saying something the
 * change is entitled to alter.
 */
function linesWith(found, kind) {
  return found
    .filter((m) => m.marker === kind)
    .map((m) => m.line)
    .sort((a, b) => a - b);
}

/** Every heading's chips, as `"<text>" <kinds>`, dropping the positions. */
function chipsOf(shown) {
  return shown.flatMap((heading) =>
    heading.chips.map((chip) => `${JSON.stringify(chip.text)} ${chip.kinds.join(",") || "entry"}`)
  );
}

/**
 * Every marked entry of a directive, in document order, with everything said
 * about it: `L<line>C<column>:"<text>" entry,timed`.
 *
 * Two things have to be undone to get there, and neither is the plugin's doing.
 *
 * The conclusions about one entry are combined on one range, so the harness
 * reports the same element once per class it carries; grouping those back
 * together is what makes "this entry is a switch and nothing else" a thing a
 * check can state, rather than four separate absences.
 *
 * And one marking is not one element. The editor cuts a decoration wherever its
 * own highlighting starts a token, so `#exam` arrives as `#` and `exam` and
 * `4bhif[gestern]` as four pieces - each carrying the whole marking, each a span
 * of its own. Pieces that touch and say the same thing are one marking, and a
 * check that could not put them back together would be asserting about
 * Obsidian's tokenizer rather than about what the plugin marked. Two entries
 * never touch: a comma stands between them.
 */
function entriesOf(found) {
  const elements = new Map();
  for (const marker of found.filter((m) => m.marker.startsWith("safelearn-entry"))) {
    const at = elements.get(marker.from) ?? { ...marker, classes: [] };
    at.classes.push(marker.marker.replace(/^safelearn-entry-?/, "") || "entry");
    elements.set(marker.from, at);
  }

  const entries = [];
  for (const piece of [...elements.values()].sort((a, b) => (a.from ?? 0) - (b.from ?? 0))) {
    const classes = piece.classes.sort().join(",");
    const previous = entries[entries.length - 1];
    if (previous && previous.to === piece.from && previous.classes === classes) {
      previous.text += piece.text;
      previous.to = piece.to;
      continue;
    }
    entries.push({ line: piece.line, column: piece.column, text: piece.text, to: piece.to, classes });
  }
  return entries.map((e) => `L${e.line}C${e.column}:${JSON.stringify(e.text)} ${e.classes}`);
}

/** The same, with the positions dropped: what was marked, and as what. */
function entryKindsOf(found) {
  return entriesOf(found).map((entry) => entry.replace(/^L\d+C\d+:/, ""));
}

/**
 * A directive holding one of everything, used by several checks below. Its
 * entries sit at columns 4, 11, 41, 48 and 57 of the line - the columns are
 * written out where they are asserted, because a marking that covers the right
 * text at the wrong place is exactly the defect this harness exists to catch.
 */
const MIXED_DIRECTIVE = "@@@ 4bhif, teacher[2025-11-28T08:00:00], #exam, ]kaputt, 5bhif[gestern]";

before(async () => {
  await start();
  console.log(`    Obsidian ${obsidianVersion()}`);
});

after(async () => {
  await shutdown();
});

describe("the plugin is loaded and decorating", () => {
  // Re-examined for `plugin-hide-tags` and left alone. It asks whether the
  // plugin put any of its classes on the document at all, and the answer is not
  // a statement about what a directive line is made of - the set of classes it
  // reads through grew, and nothing else about it changed. The same holds for
  // `a permission block is decorated in the editor` further down: a block's
  // line markings are what they were, whatever those lines are shown as.
  test("a corpus file in live preview carries the plugin's own markers", async () =>
    watched("loaded", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      const found = await markers(container);
      assert.ok(
        found.length > 0,
        `The plugin put none of its classes on ${FRAGMENTS} in live preview. Either it did not ` +
          `load, or it decorated nothing - both are the harness's problem before they are the ` +
          `plugin's.`
      );
    }));
});

describe("each view state is reachable and distinct", () => {
  test("live preview shows the editor", async () =>
    watched("live-preview", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      assert.equal(container, ".cm-content");
      await reveal(container, "Fragmented Text.");
      assert.ok((await visibleText(container)).includes("Fragmented Text."));
    }));

  test("source mode shows the editor", async () =>
    watched("source", async () => {
      const container = await open(FRAGMENTS, views.source);
      assert.equal(container, ".cm-content");
      await reveal(container, "Fragmented Text.");
      assert.ok((await visibleText(container)).includes("Fragmented Text."));
    }));

  test("reading view shows rendered output", async () =>
    watched("reading", async () => {
      const container = await open(FRAGMENTS, views.reading);
      assert.equal(container, ".markdown-reading-view");
      await reveal(container, "Fragmented Text.");
      assert.ok((await visibleText(container)).includes("Fragmented Text."));
    }));
});

describe("the tags the corpus carries", () => {
  test("a permission block is decorated in the editor", async () =>
    watched("permission-block", async () => {
      const container = await open(PSEUDO_ROLES, views.livePreview);
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker === "permission-block"),
        `No permission-block marker on ${PSEUDO_ROLES}, which opens with @@@ #exam.`
      );
    }));

  test("a side-by-side block is decorated in the editor", async () =>
    watched("side-by-side", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      await reveal(container, "##side-by-side-start");
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker.startsWith("side-by-side")),
        `No side-by-side marker on ${FRAGMENTS}, which holds two such blocks.`
      );
    }));
});

// ################### That the harness reports what it claims to ###################

describe("the harness reports what it claims to", () => {
  // Everything below this point rests on these three. A collector that reports
  // nothing whatever happens, or a vault write that reached the corpus, would
  // make the checks after it meaningless rather than wrong - which is worse.

  test("an error raised in the renderer is reported, on both channels", async () =>
    watched("harness-error-channel", async () => {
      forgetRaised();
      await provokeError("harness self-check");
      const seen = raised();
      forgetRaised();

      assert.ok(
        seen.some((e) => e.kind === "console.error" && e.text.includes("harness self-check")),
        `A console error was raised and the harness did not report it. Collected: ` +
          `${JSON.stringify(seen)}`
      );
      assert.ok(
        seen.some((e) => e.kind === "pageerror" && e.text.includes("harness self-check")),
        `An uncaught error was raised and the harness did not report it. The ordering defect ` +
          `arrives on the console channel, but a defect that escapes Obsidian's own handlers ` +
          `arrives here, and a collector watching one channel would miss the other. Collected: ` +
          `${JSON.stringify(seen)}`
      );
    }));

  test("a document a check constructs is in the run's vault and not in the corpus", async () =>
    watched("harness-constructed-document", async () => {
      const name = "constructed-harness-self-check.md";
      await writeDocument(name, "Written by a check, into the disposable vault.\n");

      assert.ok(
        existsSync(path.join(vaultPath(), name)),
        `${name} was written but is not in the run's vault at ${vaultPath()}.`
      );
      assert.ok(
        !existsSync(path.join(corpusPath(), name)),
        `${name} reached the corpus at ${corpusPath()}. The corpus is what the authenticated ` +
          `suite asserts against, and a plugin check must not be able to change it.`
      );
    }));

  test("a document a check tries to write outside the vault is refused", async () =>
    watched("harness-vault-escape", async () => {
      await assert.rejects(
        () => writeDocument("../../md/written-by-a-plugin-check.md", "x"),
        /outside the run's vault/,
        "A check was able to name a path outside the vault. The guard is the only thing standing " +
          "between a typo in a check and a rewritten corpus."
      );
      assert.ok(
        !existsSync(path.join(corpusPath(), "written-by-a-plugin-check.md")),
        "The refused write reached the corpus anyway."
      );
    }));
});

// ################### A decoration covers exactly the tag it marks ###################

describe("a decoration covers exactly the tag it marks", () => {
  test("every fragment stands as its icon, and only the tag is gone", async () =>
    watched("fragment-extent", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      await reveal(container, "Fragmented Text.");
      const found = await markers(container);
      const icons = found.filter((m) => m.marker === "fragment-icon");

      assert.ok(
        icons.length > 0,
        "No fragment icons at all. If a decoration range was malformed, the editor may have " +
          "rejected the whole set - which is the same defect, louder. See the check for a " +
          "well-formed set."
      );

      // The extent used to be readable from the marking's own text. A tag at
      // rest has none now, so it is read where it is visible instead: the corpus
      // writes `- ##fragment two`, and a replacement one character too long
      // takes the space after the tag with it.
      const shown = await visibleText(container);
      assert.ok(
        shown.includes(`${FRAGMENT_ICON} two`),
        `The corpus writes ${JSON.stringify("- ##fragment two")}, so what stands on that line is ` +
          `the icon, a space and the word. The extent has to come from the text that matched: ` +
          `${FRAGMENT} is ${FRAGMENT.length} characters, never ${FRAGMENT.length + 1}. On screen: ` +
          `${JSON.stringify(shown)}`
      );
      assert.ok(
        !shown.includes(FRAGMENT),
        `A tag's own characters are on screen with the cursor nowhere near them. On screen: ` +
          `${JSON.stringify(shown)}`
      );
    }));

  test("a tag ending its line is replaced exactly, and the next line is untouched", async () =>
    watched("fragment-end-of-line", async () => {
      const name = "constructed-end-of-line.md";
      await writeDocument(name, ["##fragment", "Text after it.", "", "##fragment"].join("\n"));
      const container = await open(name, views.livePreview);
      // Off the tags, so both stand at rest. A cursor left at the start of the
      // document rests in the first one and would show its characters instead.
      await placeCursorAfter("Text after it.");

      assert.deepEqual(
        iconsOf(await markers(container)),
        ["L1C0", "L4C0"],
        "A tag standing at the end of its line is replaced from its first character to its last, " +
          "and nothing on the line after it is. A decoration whose end is computed from an " +
          "assumed spelling of the tag reaches past the line it is on."
      );
      assert.ok(
        (await visibleText(container)).includes("Text after it."),
        "The line after a tag that ends its own line is still on screen whole. A replacement " +
          "reaching past the end of its line would swallow the newline and the line below it."
      );
    }));
});

// ################### A decoration stays on its tag while the document is edited ###################

describe("a decoration stays on its tag while the document is edited", () => {
  test("typing at the end of a tag's line leaves the marking on the tag", async () =>
    watched("fragment-typing-same-line", async () => {
      const name = "constructed-typing.md";
      await writeDocument(name, ["Alpha ##fragment beta", "Gamma ##fragment delta"].join("\n"));
      const container = await open(name, views.livePreview);
      const before = iconsOf(await markers(container));

      await placeCursorAfter("Alpha ##fragment beta");
      await type("x");

      const after = iconsOf(await markers(container));
      assert.deepEqual(
        after,
        before,
        `Typing at the end of a line that carries a tag changed where the tag is marked. Before: ` +
          `${JSON.stringify(before)}. The typed character is not part of the tag and no marking ` +
          `may grow to include it.`
      );
      assert.deepEqual(
        after,
        ["L1C6", "L2C6"],
        "Each tag is marked where it stands, covering itself and nothing else."
      );
    }));

  test("inserting a line above a tag moves the marking with it", async () =>
    watched("fragment-typing-earlier-line", async () => {
      const name = "constructed-inserting.md";
      await writeDocument(name, ["Alpha ##fragment beta", "Gamma ##fragment delta"].join("\n"));
      const container = await open(name, views.livePreview);

      // Split the first line in two, which pushes everything below it down by
      // one. The second tag has not been touched and must not have stayed behind
      // at the position it used to occupy.
      await placeCursorAfter("Alpha ##fragment beta");
      await type("\n");

      assert.deepEqual(
        iconsOf(await markers(container)),
        ["L1C6", "L3C6"],
        "A line was inserted above the second tag, so that tag is now on line 3. A marking that " +
          "still reports line 2 stayed at an offset rather than following its text."
      );
    }));
});

// ################### What is marked reflects the document as it is currently shown ###################

describe("what is marked reflects the document as it is currently shown", () => {
  test("a tag scrolled to for the first time is marked, with no edit", async () =>
    watched("scroll-into-view", async () => {
      const container = await open(FRAGMENTS, views.livePreview);
      // Deliberately not `reveal`: that moves the cursor to the line first, so a
      // plugin that only reacts to the cursor would pass a check meant for
      // scrolling.
      const scrolled = await scrollTo("##side-by-side-start");

      assert.equal(
        scrolled.changed,
        false,
        "Scrolling changed the document text. Then the check no longer says what it claims to: a " +
          "plugin that only rebuilds on an edit would pass it."
      );
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker.startsWith("side-by-side")),
        "A block was scrolled into view for the first time in this session and carries no " +
          "marking. Marking has to be brought up to date when the visible region changes, not " +
          "only when the text does."
      );
    }));

  test("a block that opens above the viewport still marks what is on screen", async () =>
    watched("block-above-the-viewport", async () => {
      // Long enough that its opening marker is off screen once the middle of it
      // is reached. Marking only what is visible is fine; deciding what is
      // *inside a block* from only what is visible is not, because the line that
      // opened it is three screens up.
      const filler = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of gated content.`);
      const name = "constructed-long-block.md";
      await writeDocument(
        name,
        ["Intro.", "@@@ teacher", ...filler, "##fragment", ...filler, "@@@", "", "After it."].join("\n")
      );
      const container = await open(name, views.livePreview);
      const marked = await scrollTo(FRAGMENT);

      assert.equal(marked.changed, false, "Scrolling changed the document text.");
      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker === "fragment-icon" && m.text === FRAGMENT_ICON),
        `The tag in the middle of the block is not marked. Found: ${JSON.stringify(shapeOf(found))}`
      );
      assert.ok(
        found.some((m) => m.marker === "permission-block"),
        "Lines in the middle of the block are not marked as being in one. The marker that opened " +
          "it is far above the viewport, so a scan that looks only at what is on screen cannot " +
          "know they are inside anything."
      );
    }));

  test("the cursor entering a directive line changes no text and changes what is shown", async () =>
    watched("cursor-into-directive", async () => {
      // This check used to say that the cursor changes nothing about what
      // stands on the line. For a directive line it now changes exactly that,
      // and that is the point of the change: the line stands as the heading of
      // the block it opens while nothing is in it, and as its own characters
      // while the cursor is. What may never change is the document.
      const name = "constructed-cursor-directive.md";
      await writeDocument(name, ["Intro.", "@@@ teacher", "Gated.", "@@@"].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      const atRest = await visibleText(container);
      assert.ok(
        !atRest.includes("@@@ teacher"),
        `With the cursor on another line, the directive stands as the heading of its block and ` +
          `not as its own characters. On screen: ${JSON.stringify(atRest)}`
      );
      assert.deepEqual(
        chipsOf(await headings(container)),
        ['"teacher" entry'],
        "What stands there instead names what the directive names."
      );

      const moved = await moveCursorInto("@@@ teacher");
      assert.equal(
        moved.changed,
        false,
        "Moving the cursor changed the document text. The characters that appear are the ones the " +
          "document already held; a plugin that wrote them in would be editing a person's file to " +
          "show it to them."
      );
      assert.ok(
        (await visibleText(container)).includes("@@@ teacher"),
        "The line's own characters are not on screen while the cursor is in them, so a person " +
          "cannot edit the directive they are standing in."
      );
      assert.deepEqual(
        entriesOf(await markers(container)),
        ['L2C4:"teacher" entry'],
        "With the line shown as its own characters, its entries carry their markings again - the " +
          "two states are the heading and what a directive line has always shown, with nothing " +
          "in between."
      );
      assert.deepEqual(
        await headings(container),
        [],
        "The heading is gone while the line it stands for is on screen. Both at once would show " +
          "the same directive twice."
      );
    }));

  test("the cursor entering a fragment changes no text and changes what is shown", async () =>
    watched("cursor-into-tag", async () => {
      // The same rule as the directive line above, on a tag rather than a line.
      // This check used to say the opposite - that a fragment keeps its marking
      // whatever the cursor does - and that is what changed: at rest the tag is
      // an icon, because ten characters and a frame dominated the sentence the
      // tag stands in. What may never change is the document.
      const name = "constructed-cursor.md";
      await writeDocument(name, ["Alpha ##fragment beta", "", "Gamma."].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Gamma.");

      const atRest = await visibleText(container);
      assert.ok(
        !atRest.includes(FRAGMENT),
        `With the cursor on another line, the tag stands as its icon and not as its own ` +
          `characters. On screen: ${JSON.stringify(atRest)}`
      );
      assert.ok(
        atRest.includes(`Alpha ${FRAGMENT_ICON} beta`),
        `What stands in the tag's place is the icon alone, with the words around it untouched. ` +
          `On screen: ${JSON.stringify(atRest)}`
      );

      const moved = await moveCursorInto(FRAGMENT);
      assert.equal(
        moved.changed,
        false,
        "Moving the cursor changed the document text. The characters that appear are the ones the " +
          "document already held; a plugin that wrote them in would be editing a person's file to " +
          "show it to them."
      );

      assert.deepEqual(
        shapeOf(await markers(container), "fragment-highlight"),
        [`L1C6:${JSON.stringify(FRAGMENT)}`],
        "With the cursor inside it, the tag is marked on its own characters, covering itself and " +
          "nothing else."
      );
      assert.ok(
        (await visibleText(container)).includes(FRAGMENT),
        "The tag's characters are not on screen while the cursor is in them, so a person cannot " +
          "edit the tag they are standing in."
      );
      assert.deepEqual(
        iconsOf(await markers(container)),
        [],
        "The icon is gone while the tag it stands for is on screen. Both at once would show the " +
          "same tag twice."
      );
    }));
});

// ################### A tag the plugin cannot resolve costs only itself ###################

describe("a tag the plugin cannot resolve costs only itself", () => {
  test("a file-level directive on line 1 does not swallow the block below it", async () =>
    watched("file-directive", async () => {
      // No corpus file carries a line-1 directive *and* tags below it, so this
      // one is assembled here - see the modified fixture requirement in
      // `plugin-verification`. The first line gates the whole file and has no
      // closing marker; everything below it is ordinary and must be marked
      // ordinarily.
      const name = "constructed-file-directive.md";
      await writeDocument(
        name,
        [
          "@@@ teacher",
          "",
          "@@@ 4bhif",
          "Gated.",
          "@@@",
          "",
          "##fragment",
          "Text.",
          "",
          "##side-by-side-start",
          "left",
          "##separator",
          "right",
          "##side-by-side-end",
        ].join("\n")
      );
      const container = await open(name, views.livePreview);
      const found = await markers(container);

      assert.deepEqual(
        linesWith(found, "permission-block"),
        [3, 4, 5],
        "The permission block a person wrote is lines 3 to 5. A file-level directive on line 1 " +
          "has no closing marker and must open no block at all - read as one, it swallows the " +
          "lines above the real block and the marking starts two lines too early."
      );
      assert.deepEqual(
        iconsOf(found),
        ["L7C0"],
        "The fragment below the directive is marked."
      );
      assert.ok(
        found.some((m) => m.marker === "side-by-side-start") &&
          found.some((m) => m.marker === "side-by-side-separator") &&
          found.some((m) => m.marker === "side-by-side-end"),
        `The side-by-side block below the directive is marked. Found: ${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("an unterminated block leaves the tags after it marked", async () =>
    watched("unterminated-block", async () => {
      const name = "constructed-unterminated.md";
      await writeDocument(
        name,
        ["Intro.", "@@@ teacher", "Gated.", "", "##fragment", "Text."].join("\n")
      );
      const container = await open(name, views.livePreview);
      const found = await markers(container);

      assert.deepEqual(
        iconsOf(found),
        ["L5C0"],
        "A block that is never closed must cost itself and nothing else."
      );
      assert.ok(
        found.some((m) => m.marker === "permission-block" && m.line === 2),
        `A block that opens on line 2 and is never closed still opened. It ends at the end of the ` +
          `document and marks what it covered, rather than being dropped. Found: ` +
          `${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("an unreadable entry leaves the entries beside it marked as they would be without it", async () =>
    watched("unreadable-entry", async () => {
      // The comparison is against the same directive with the offending token
      // taken out, rather than against a list written down here: what has to
      // hold is that the neighbours are unaffected, and a hand-written
      // expectation could be wrong in the same way the code is.
      const withIt = "constructed-unreadable-entry.md";
      const withoutIt = "constructed-unreadable-entry-removed.md";
      await writeDocument(withIt, ["Intro.", MIXED_DIRECTIVE, "Gated.", "@@@"].join("\n"));
      await writeDocument(
        withoutIt,
        ["Intro.", MIXED_DIRECTIVE.replace("]kaputt, ", ""), "Gated.", "@@@"].join("\n")
      );

      // The cursor goes into the directive line in both documents. Per-entry
      // markings are markings on characters, and a directive line at rest has
      // none on screen - read without the cursor, both documents would report
      // an empty list and the check would pass against anything at all.
      const withItContainer = await open(withIt, views.livePreview);
      await moveCursorInto("@@@ 4bhif");
      const marked = entryKindsOf(await markers(withItContainer));

      const withoutItContainer = await open(withoutIt, views.livePreview);
      await moveCursorInto("@@@ 4bhif");
      const unaffected = entryKindsOf(await markers(withoutItContainer));

      assert.deepEqual(
        marked,
        unaffected,
        "One token of a directive that the server cannot read as an entry costs itself and nothing " +
          "else - the server drops it and goes on reading the rest, and a marking that gave up on " +
          "the whole line would report a document that grants less than it does."
      );
      assert.ok(
        marked.length === 4,
        `Four of the five tokens are entries the server acts on. Found: ${JSON.stringify(marked)}`
      );
    }));

  test("a closing marker with nothing open does not turn what follows into a block", async () =>
    watched("orphaned-closing-marker", async () => {
      const name = "constructed-orphan.md";
      await writeDocument(
        name,
        ["Intro.", "@@@", "##fragment", "Text.", "", "@@@ teacher", "Gated.", "@@@"].join("\n")
      );
      const container = await open(name, views.livePreview);
      const found = await markers(container);

      assert.deepEqual(
        linesWith(found, "permission-block"),
        [6, 7, 8],
        "The bare marker on line 2 opens nothing - it names no roles, so there is no block for it " +
          "to be the start of. The block on lines 6 to 8 is the only one in this document."
      );
      assert.deepEqual(
        iconsOf(found),
        ["L3C0"],
        "The tag after the orphaned marker is marked as it would be in a document without it."
      );
    }));
});

// ################### A directive is marked as the list of entries it is ###################

describe("a permission directive is marked as the list of entries it is", () => {
  // Every document in this section is constructed rather than taken from the
  // corpus: some of them are wrong on purpose - a window nobody can read, a
  // token that is not an entry - and `md/` is what the authenticated suite
  // asserts is right. They live in the vault this run assembled and nowhere else.

  test("a directive naming several things is marked as several things", async () =>
    watched("directive-entries", async () => {
      const name = "constructed-directive-entries.md";
      await writeDocument(name, ["Intro.", MIXED_DIRECTIVE, "Gated.", "@@@"].join("\n"));
      const container = await open(name, views.livePreview);
      // With the cursor in the line, the line stands as its own characters and
      // carries the per-entry markings. What it stands as while the cursor is
      // elsewhere is a question of its own, asked further down.
      await moveCursorInto("@@@ 4bhif");

      assert.deepEqual(
        entriesOf(await markers(container)),
        [
          'L2C4:"4bhif" entry',
          'L2C11:"teacher[2025-11-28T08:00:00]" entry,timed',
          'L2C41:"#exam" entry,switch',
          'L2C57:"5bhif[gestern]" broken,entry',
        ],
        "The renderer splits the text after @@@ on commas and reads each token on its own, so a " +
          "directive naming four things is four markings and not one. Each says what is true of that " +
          "token: the second carries a window the server keeps, the third is a switch rather than an " +
          "address, the fourth a window the server will throw away. `]kaputt` at column 48 is no " +
          "entry to the server at all and carries no marking - marking it would say the server acts " +
          "on it."
      );
    }));
});

// ################### A directive that governs the whole file ###################

describe("a directive that governs the whole file is marked as doing so", () => {
  test("the first line is marked as gating the file, and the same text later as opening a block", async () =>
    watched("file-level-directive", async () => {
      const name = "constructed-file-level-marking.md";
      await writeDocument(
        name,
        ["@@@ teacher", "", "Intro.", "@@@ teacher", "Gated.", "@@@"].join("\n")
      );
      const container = await open(name, views.livePreview);
      // Both directive lines here carry the same text, which is the point - and
      // means neither can be singled out by a cursor placed on its text. A
      // selection running from the first line to the last touches both, so both
      // stand as their own characters and the comparison is between two
      // markings rather than between two headings.
      const selected = await selectAcross("@@@ teacher", "Gated.");
      assert.equal(selected.changed, false, "Selecting changed the document text.");
      const found = await markers(container);

      assert.deepEqual(
        linesWith(found, "permission-file"),
        [1],
        "The first line gates the whole document and has no closing marker. That is a different " +
          "promise about a different amount of text than the identical line further down, and the " +
          "two are told apart."
      );
      assert.deepEqual(
        linesWith(found, "permission-block"),
        [4, 5, 6],
        "The block is lines 4 to 6. The line-1 directive opens no block - read as one it would " +
          "swallow everything below it."
      );
      assert.deepEqual(
        entriesOf(found),
        ['L1C4:"teacher" entry', 'L4C4:"teacher" entry'],
        "Both forms name entries, and both have them marked. What differs between the two lines is " +
          "how far what they gate reaches, which is said by the line and not by the entry."
      );
    }));
});

// ################### A window, and a window the server throws away ###################

describe("an entry carrying a time window is distinguishable from one that does not", () => {
  test("a window that has closed is marked exactly as one that has not opened", async () =>
    watched("window-time-independence", async () => {
      const name = "constructed-windows.md";
      await writeDocument(
        name,
        [
          "Intro.",
          "@@@ 4bhif[2000-01-01T00:00:00 to 2000-01-02T00:00:00]",
          "Long over.",
          "@@@",
          "",
          "@@@ 4bhif[2999-01-01T00:00:00 to 2999-01-02T00:00:00]",
          "Not yet.",
          "@@@",
        ].join("\n")
      );
      const container = await open(name, views.livePreview);
      // Both directive lines stand as their own characters, so both carry their
      // per-entry markings and the two can be compared with one another.
      await selectAcross("Intro.", "Not yet.");
      const marked = entryKindsOf(await markers(container));

      assert.deepEqual(
        marked,
        [
          '"4bhif[2000-01-01T00:00:00 to 2000-01-02T00:00:00]" entry,timed',
          '"4bhif[2999-01-01T00:00:00 to 2999-01-02T00:00:00]" entry,timed',
        ],
        "A window is marked as a window. Whether it happens to be open at the moment of examination " +
          "is not part of the marking: recognition that changed with the clock would need a timer, " +
          "would contradict the requirement that the same text examined twice gives the same answer, " +
          "and would report a state the document does not contain."
      );
    }));
});

describe("a window the server discards is marked as discarded", () => {
  test("a directive with nothing readable in it is marked as withheld from everyone", async () =>
    watched("directive-withheld", async () => {
      const name = "constructed-withheld.md";
      await writeDocument(name, ["Intro.", "@@@ ]kaputt, b[, [c]", "Gated.", "@@@"].join("\n"));
      const container = await open(name, views.livePreview);

      assert.deepEqual(
        linesWith(await markers(container), "permission-withheld"),
        [2],
        "No token here reads as an entry, so `removeForbiddenContent` replaces the whole block with " +
          "the empty string - it is withheld from every reader including an admin. That is the " +
          "harshest thing a directive can do and the least visible, so it is said at the line."
      );

      await moveCursorInto("]kaputt");
      assert.deepEqual(
        entriesOf(await markers(container)),
        [],
        "Nothing on this line is an entry the server acts on, so nothing on it is marked as one - " +
          "with the cursor in the line, where every entry that were one would be marked."
      );
    }));

  test("a file-level directive nothing can be read from is marked as both", async () =>
    watched("file-level-withheld", async () => {
      const name = "constructed-file-level-withheld.md";
      await writeDocument(name, ["@@@ ]kaputt", "", "Text below it."].join("\n"));
      const container = await open(name, views.livePreview);
      const found = await markers(container);

      assert.deepEqual(
        [linesWith(found, "permission-file"), linesWith(found, "permission-withheld")],
        [[1], [1]],
        "The line gates the file and names nothing the server can read, so `resolveFileVisibility` " +
          "reports the file invisible to everyone. Both things are true of it and both are marked."
      );
    }));
});

// ################### A switch is not an address ###################

describe("a view switch is distinguishable from an address", () => {
  test("a switch, a switch that resolves to nothing, and a class are three different markings", async () =>
    watched("view-switches", async () => {
      const name = "constructed-view-switches.md";
      await writeDocument(name, ["Intro.", "@@@ #exam, #nonsense, 4bhif", "Gated.", "@@@"].join("\n"));
      const container = await open(name, views.livePreview);
      await moveCursorInto("#nonsense");

      assert.deepEqual(
        entriesOf(await markers(container)),
        [
          'L2C4:"#exam" entry,switch',
          'L2C11:"#nonsense" entry,switch,unresolved',
          'L2C22:"4bhif" entry',
        ],
        "`#exam` selects between variants of the document and is resolved against the reader's own " +
          "preferences, not against who they are - marking it like the class beside it would say the " +
          "document restricts an audience where it selects a variant. `hasRoles` recognizes the " +
          "prefix more broadly than the three names it resolves, so `#nonsense` is taken out of the " +
          "role test and then decides nothing at all, which is a third thing to be."
      );
    }));
});

// ################### The set of decorations is always well-formed ###################

describe("the set of decorations is always well-formed", () => {
  test("a line marking and a tag marking at one position are both applied", async () =>
    watched("decoration-set-ordering", async () => {
      // The one shape the editor's decoration machinery rejects: a whole-line
      // marking and a character-level marking beginning at the same offset. No
      // corpus file puts a tag at the start of a line inside a block, which is
      // why this document is constructed - and why the defect has been invisible.
      //
      // The block starts on line 2 rather than line 1 on purpose: a `@@@` on the
      // first line is the file-level form and opens no block, so it would be a
      // document with nothing to collide.
      const name = "constructed-collision.md";
      await writeDocument(
        name,
        ["Intro.", "@@@ teacher", "##fragment", "Gated text.", "@@@", "", "After it."].join("\n")
      );
      forgetRaised();
      const container = await open(name, views.livePreview);
      const found = await markers(container);
      const errors = raised();

      assert.deepEqual(
        errors.map((e) => `${e.kind}: ${e.text.split("\n")[0]}`),
        [],
        "The editor refused the set of markings. A rejected set is not a degraded result: every " +
          "marking in the document is lost at once, which reads from the outside exactly like a " +
          "document with nothing to mark. The set has to be ordered by position and by the side " +
          "each range starts at, and only the library knows the second."
      );
      assert.ok(
        found.some((m) => m.marker === "permission-block" && m.line === 3) &&
          found.some((m) => m.marker === "fragment-icon" && m.line === 3),
        `Both markings belong on line 3 - the block covers it and the tag stands on it. Found: ` +
          `${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("entry markings and line markings in one document are all applied", async () =>
    watched("entry-and-line-markings", async () => {
      // Every kind of marking this plugin emits, in one document: line markings
      // for the file-level directive, for a block and for a directive withheld
      // from everyone, and character-level markings for the entries of each of
      // those directives and for a fragment at the start of a line inside a
      // block. The set is handed to the library to sort, because the order it
      // has to be in is by position *and* by the side each range begins at, and
      // only the library knows the second - getting it wrong is not a wrong
      // marking but no markings at all.
      const name = "constructed-marking-collision.md";
      await writeDocument(
        name,
        [
          "@@@ teacher, 4bhif[gestern]",
          "",
          "@@@ 4bhif, #answer",
          "##fragment",
          "Gated text.",
          "@@@",
          "",
          "@@@ ]kaputt",
          "Withheld from everyone.",
          "@@@",
        ].join("\n")
      );
      forgetRaised();
      const container = await open(name, views.livePreview);
      // A selection over the whole document touches all three directive lines,
      // so each stands as its own characters and carries its entry markings.
      // That is also the shape this check is about: line markings and character
      // markings meeting at one position, in the state where both exist.
      await selectAcross("@@@ teacher, 4bhif[gestern]", "Withheld from everyone.");
      const found = await markers(container);
      const errors = raised();

      assert.deepEqual(
        errors.map((e) => `${e.kind}: ${e.text.split("\n")[0]}`),
        [],
        "The editor refused the set of markings. A rejected set is not a degraded result: every " +
          "marking in the document is lost at once, which reads from the outside exactly like a " +
          "document with nothing to mark."
      );
      assert.deepEqual(
        entriesOf(found),
        [
          'L1C4:"teacher" entry',
          'L1C13:"4bhif[gestern]" broken,entry',
          'L3C4:"4bhif" entry',
          'L3C11:"#answer" entry,switch',
        ],
        "Both directives that name something readable have their entries marked, on the line that " +
          "gates the file and on the line that opens a block alike."
      );
      assert.ok(
        found.some((m) => m.marker === "permission-file" && m.line === 1) &&
          found.some((m) => m.marker === "permission-block" && m.line === 3) &&
          found.some((m) => m.marker === "fragment-highlight" && m.line === 4) &&
          found.some((m) => m.marker === "permission-withheld" && m.line === 8),
        `Every line marking belongs where it is: line 1 gates the file, line 3 opens a block, line ` +
          `4 carries a tag at its first character inside that block, line 8 is withheld from ` +
          `everyone. Found: ${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("no corpus document raises an error while being opened, edited and scrolled", async () =>
    watched("corpus-raises-nothing", async () => {
      const corpus = readdirSync(corpusPath()).filter((name) => name.endsWith(".md"));
      assert.ok(corpus.length > 0, `No documents in the corpus at ${corpusPath()}.`);

      for (const name of corpus) {
        forgetRaised();
        const container = await open(name, views.livePreview);
        const lines = ((await documentText()) ?? "").split("\n").filter((l) => l.trim() !== "");
        if (lines.length > 0) await scrollTo(lines[lines.length - 1]);
        await placeCursorAfter(lines[0] ?? "");
        await type("x");

        const errors = raised();
        assert.deepEqual(
          errors.map((e) => `${e.kind}: ${e.text.split("\n")[0]}`),
          [],
          `Opening, scrolling and editing ${name} raised something. No document the project ships ` +
            `may make the editor raise anything while it is being marked.`
        );
      }
    }));
});

// ################### Recognition does not depend on when or in what order ###################

describe("whether something is a tag does not depend on when it is examined", () => {
  test("the same document examined twice reports the same markings", async () =>
    watched("stable-recognition", async () => {
      // Short enough to be on screen whole, so that what is being compared is
      // two examinations of the same lines and not two viewports.
      const name = "constructed-stability.md";
      await writeDocument(
        name,
        ["Alpha ##fragment beta", "##fragment", "- ##fragment two", "Gamma."].join("\n")
      );
      const container = await open(name, views.livePreview);
      const first = iconsOf(await markers(container));
      assert.ok(first.length > 0, "Nothing was marked, so there is nothing to be stable about.");

      // Two more examinations, provoked without touching the text: a rebuild
      // that carries state from the previous one answers differently. Neither
      // position is inside a tag, so all three stand at rest throughout.
      await moveCursorInto("Gamma.");
      const second = iconsOf(await markers(container));
      await moveCursorInto("Alpha");
      const third = iconsOf(await markers(container));

      assert.deepEqual(
        [second, third],
        [first, first],
        "The same lines gave different answers on different examinations. Recognition that " +
          "carries state between them - a global regular expression asked whether it matches, " +
          "which remembers where it stopped - answers differently every second time."
      );
    }));

  test("a line carrying two fragments has both marked", async () =>
    watched("two-tags-one-line", async () => {
      const name = "constructed-two-tags.md";
      await writeDocument(name, "one ##fragment two ##fragment three\n");
      const container = await open(name, views.livePreview);

      assert.deepEqual(
        iconsOf(await markers(container)),
        ["L1C4", "L1C19"],
        "The renderer acts on every occurrence in a line. A scan that asks where the tag is, " +
          "rather than walking the line, finds only the first - so the second is text the server " +
          "acts on and the person writing it was never shown."
      );
    }));
});

// ################### What is marked is what the server will act on ###################

describe("what is marked is what the server will act on", () => {
  test("a fragment the server acts on is marked, one it ignores is not", async () =>
    watched("recognition-matches-the-server", async () => {
      // The renderer's rule is `/##fragment(?=\s|$)/g`: case-sensitive, anywhere
      // in the line, wherever whitespace or the end of the text follows. So the
      // list item on line 3 *is* a fragment marker to the server - the corpus
      // writes it that way - and the two above it are not.
      const name = "constructed-recognition.md";
      await writeDocument(
        name,
        ["##FRAGMENT", "##fragment.", "- ##fragment two", "##fragment"].join("\n")
      );
      const container = await open(name, views.livePreview);

      assert.deepEqual(
        iconsOf(await markers(container)),
        ["L3C2", "L4C0"],
        "Marked text has to be text the server acts on. `##FRAGMENT` and `##fragment.` are not " +
          "fragments to the server, and marking them tells a person the opposite. `- ##fragment " +
          "two` is one, and leaving it unmarked - or marking the space after it - misinforms in " +
          "the other direction."
      );
    }));
});

// ################### A directive line is shown as the heading of its block ###################

describe("a directive line is shown as the heading of the block it opens", () => {
  test("a touching selection shows the line, a neighbouring cursor does not", async () =>
    watched("heading-lifted-by-selection", async () => {
      const name = "constructed-heading-selection.md";
      await writeDocument(name, ["Above.", "@@@ teacher", "Gated.", "@@@", "Below."].join("\n"));
      const container = await open(name, views.livePreview);

      await placeCursorAfter("Above.");
      assert.equal(
        (await headings(container)).length,
        1,
        "The cursor is on the line directly above. That line is not the directive line, and a " +
          "document whose headings appeared and vanished as the cursor passed by would flicker " +
          "its way down the page."
      );

      await placeCursorAfter("Gated.");
      assert.equal(
        (await headings(container)).length,
        1,
        "The cursor is on the line directly below, which is no more the directive line than the " +
          "one above it."
      );

      const selected = await selectAcross("Above.", "Gated.");
      assert.equal(selected.changed, false, "Selecting changed the document text.");
      assert.deepEqual(
        await headings(container),
        [],
        "A selection running across the block touches the directive line, so the line stands as " +
          "its own characters - otherwise a person copies text they cannot see."
      );
      assert.ok(
        (await visibleText(container)).includes("@@@ teacher"),
        "The selected line's own characters are on screen."
      );
    }));

  test("the heading carries each entry as what that entry is", async () =>
    watched("heading-entries", async () => {
      const name = "constructed-heading-entries.md";
      await writeDocument(name, ["Intro.", MIXED_DIRECTIVE, "Gated.", "@@@"].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      assert.deepEqual(
        chipsOf(await headings(container)),
        [
          '"4bhif" entry',
          '"teacher[2025-11-28T08:00:00]" timed',
          '"#exam" switch',
          '"]kaputt" discarded',
          '"5bhif[gestern]" broken',
        ],
        "The heading rebuilds the directive as the list it is, and each entry carries what is " +
          "true of that entry. `]kaputt` is in it: where the characters are on the page a " +
          "discarded token is told apart by the marking its neighbours have and it does not, but " +
          "here they are gone - leaving it out would hide from the author that they wrote " +
          "something the server throws away."
      );
    }));

  test("a time window stands in the heading as it stands in the document", async () =>
    watched("heading-window-verbatim", async () => {
      const name = "constructed-heading-window.md";
      const written = "4bhif[2026-08-01T00:00:00 to 2026-08-20T00:00:00]";
      await writeDocument(name, ["Intro.", `@@@ ${written}`, "Gated.", "@@@"].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      assert.deepEqual(
        chipsOf(await headings(container)),
        [`${JSON.stringify(written)} timed`],
        "The window is reproduced, not restated. A heading saying `1.-20. August` would claim a " +
          "reading of it, and the server throws away windows that a readable restatement makes " +
          "look sound - which is the one thing the plugin exists to show."
      );
    }));

  test("a directive nothing can be read from names nobody and says so", async () =>
    watched("heading-withheld", async () => {
      const name = "constructed-heading-withheld.md";
      await writeDocument(name, ["Intro.", "@@@ ]kaputt, b[, [c]", "Gated.", "@@@"].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");
      const shown = await headings(container);

      assert.deepEqual(
        shown.map((heading) => heading.kinds),
        [["withheld"]],
        "`removeForbiddenContent` replaces this block with the empty string - no reader sees it, " +
          "an admin included."
      );
      assert.deepEqual(
        shown[0]?.chips ?? null,
        [],
        "A heading naming somebody would claim the opposite of what the server does with the line."
      );
      assert.ok(
        (shown[0]?.note ?? "").trim().length > 0,
        "And no heading at all would be the one line that disappears without a trace. It says " +
          "that the block is shown to no reader."
      );
    }));

  test("the file-level directive's frame has no lower edge", async () =>
    watched("file-level-frame", async () => {
      const name = "constructed-file-frame.md";
      await writeDocument(name, ["@@@ teacher", "", "Text below it."].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Text below it.");

      const frame = await styleOf(container, "permission-file", [
        "border-top-width",
        "border-left-width",
        "border-right-width",
        "border-bottom-width",
      ]);
      assert.ok(frame, "Nothing on screen carries the file-level marking.");
      assert.deepEqual(
        [frame["border-bottom-width"], frame["border-top-width"] === "0px"],
        ["0px", false],
        `The line gates the whole file and has no closing marker, so there is no closed region ` +
          `for a heading to sit on. It is the same box every block gets with its lower edge left ` +
          `off, and the open side is what says that what it governs does not end. Measured: ` +
          `${JSON.stringify(frame)}`
      );
    }));
});

describe("the marker that closes a block is shown as the blank line the frame closes on", () => {
  test("the closing marker is not on screen while the cursor is elsewhere", async () =>
    watched("closing-marker-at-rest", async () => {
      const name = "constructed-closing-marker.md";
      await writeDocument(name, ["Intro.", "@@@ teacher", "Gated.", "@@@", "After."].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      const atRest = await visibleText(container);
      assert.ok(
        !atRest.includes("@@@"),
        `Neither marker of the block is on screen with the cursor elsewhere: the directive stands ` +
          `as the heading of the block it opens, and the marker that closes it says nothing the ` +
          `frame around the block does not already say. On screen: ${JSON.stringify(atRest)}`
      );

      const floors = await blockBoxes(container, "permission-block-end");
      assert.equal(
        floors.length,
        1,
        `The block still ends where the document ends it. Taking the marker's characters off the ` +
          `screen may not take the line they stood on out of the block - a block whose floor went ` +
          `with them is a box that does not close. Found: ${JSON.stringify(floors.map((box) => box.text))}`
      );
      assert.equal(
        floors[0].text,
        "",
        `What stands on that line is nothing: the blank line the frame closes on. Text still there ` +
          `is a marker that was hidden by the stylesheet rather than replaced, which is the one ` +
          `outcome that would leave a person backspacing through characters nobody can see.`
      );
    }));

  test("the cursor entering the blank line brings the marker back, and changes no text", async () =>
    watched("cursor-into-closing-marker", async () => {
      // The other end of the rule the directive line follows, and the reason it
      // has to be reachable at all: deleting that marker is the only way there
      // is to open the block up again.
      const name = "constructed-closing-marker-cursor.md";
      await writeDocument(name, ["Intro.", "@@@ teacher", "Gated.", "@@@", "After."].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      const moved = await moveCursorInto("@@@", { last: true });
      assert.equal(
        moved.changed,
        false,
        "Moving the cursor changed the document text. The characters that appear are the ones the " +
          "document already held; a plugin that wrote them in would be editing a person's file to " +
          "show it to them."
      );
      assert.ok(
        (await visibleText(container)).includes("@@@"),
        "The marker's own characters are not on screen while the cursor is in the line, so the " +
          "block cannot be opened up again by the person who closed it."
      );
      assert.equal(
        (await headings(container)).length,
        1,
        "The directive line above is a different line and is still shown as its heading. A cursor " +
          "in one marker that lifted the other would show the same block's punctuation twice."
      );

      await placeCursorAfter("After.");
      assert.ok(
        !(await visibleText(container)).includes("@@@"),
        "The marker goes again once the cursor leaves the line, the way the directive line's own " +
          "characters do."
      );
    }));

  test("a block that is never closed keeps its last line", async () =>
    watched("closing-marker-unclosed", async () => {
      // `resolveBlocks` ends an unclosed block at the end of the document, so
      // that block's last line is somebody's text and not punctuation. Hiding it
      // would take a sentence off the screen because a marker is missing.
      const name = "constructed-closing-marker-unclosed.md";
      await writeDocument(name, ["Intro.", "@@@ teacher", "Gated, and never closed."].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      assert.ok(
        (await visibleText(container)).includes("Gated, and never closed."),
        "The last line of an unclosed block is text a person wrote, and it stays on screen."
      );
    }));
});

// ################### The frame around what the editor does not render as a line ###################

/**
 * A table, written out once. Its cells carry words rather than letters so that
 * the element the editor builds for it can be told apart from the lines around
 * it by what it says.
 */
const TABLE = ["| Header | Value |", "| --- | --- |", "| left | right |"];

/**
 * The same table, typed rather than written into the file.
 *
 * Obsidian completes a table while a person types it: the moment the delimiter
 * row reads as one it inserts the line break itself, lays the columns out and
 * puts the cursor in the body. Typing `TABLE` verbatim into it produces neither
 * what was typed nor a table - the two mechanisms write over one another and
 * what is left is three broken lines. So the check below types the shortest
 * thing Obsidian's own completion turns into a table: one column, and no
 * trailing pipe for it to complete twice.
 */
const TYPED_TABLE = ["| Header |", "|-|", "| left"].join("\n");

/** Whether an element carrying a block's classes is the one built for the table. */
const isTheTable = (element) => element.text.includes("Header") && !element.line;

/**
 * The run of framed elements, as `L<top>..<bottom>` with what each one says.
 *
 * Used in the failure messages below rather than in the assertions: a run that
 * breaks does so at one pair, and the message has to show which.
 */
function runOf(boxes) {
  return boxes.map((box) => `${Math.round(box.top)}..${Math.round(box.bottom)}:${JSON.stringify(box.text)}`);
}

/** Every pair of neighbours in the run that do not touch, with the gap between them. */
function gapsIn(boxes) {
  return boxes
    .map((box, index) => ({ gap: index === 0 ? 0 : box.top - boxes[index - 1].bottom, box, index }))
    .filter((pair) => Math.abs(pair.gap) > 1)
    .map((pair) => `${Math.round(pair.gap)}px above ${JSON.stringify(pair.box.text)}`);
}

describe("the frame of a block covers every line of the block", () => {
  test("a table in the middle of a block is inside one unbroken frame", async () =>
    watched("frame-across-table", async () => {
      const name = "constructed-frame-table.md";
      await writeDocument(
        name,
        ["Above.", "", "@@@ teacher", "Before it.", "", ...TABLE, "", "After it.", "@@@", "", "Below."].join("\n")
      );
      const container = await open(name, views.livePreview);
      await reveal(container, "Before it.");
      await placeCursorAfter("Above.");

      const framed = await blockBoxes(container, "permission-block");

      assert.ok(
        framed.some(isTheTable),
        `The editor renders the table as an element of its own rather than as lines, and nothing ` +
          `carrying the block's frame is that element - so the frame stops above the table and ` +
          `starts again below it. Framed: ${JSON.stringify(runOf(framed))}`
      );
      assert.deepEqual(
        gapsIn(framed),
        [],
        `A block is one region, and the elements carrying its frame have to stand against one ` +
          `another for it to read as one. Framed: ${JSON.stringify(runOf(framed))}`
      );

      // Idempotence, asked as a question with an answer: a cursor move runs the
      // pass again over a document nothing changed in. A pass that added on
      // every run, or one whose observer answered its own writes, would not
      // hand back the same run twice.
      await placeCursorAfter("Below.");
      const again = await blockBoxes(container, "permission-block");
      assert.deepEqual(
        again.map((box) => [box.text, Math.round(box.top), Math.round(box.frameLeft)]),
        framed.map((box) => [box.text, Math.round(box.top), Math.round(box.frameLeft)]),
        "Running the pass a second time over an unchanged document changed what is framed."
      );
    }));

  test("the side edges of that frame stand in one vertical line", async () =>
    watched("frame-edges-aligned", async () => {
      const name = "constructed-frame-edges.md";
      await writeDocument(
        name,
        ["Above.", "", "@@@ teacher", "Before it.", "", ...TABLE, "", "After it.", "@@@", "", "Below."].join("\n")
      );
      const container = await open(name, views.livePreview);
      await reveal(container, "Before it.");
      await placeCursorAfter("Above.");

      const framed = await blockBoxes(container, "permission-block");
      assert.ok(framed.some(isTheTable), "The table carries no frame, so there are no edges to compare.");

      const edges = framed.map((box) => [Math.round(box.frameLeft), Math.round(box.frameRight)]);
      assert.deepEqual(
        [...new Set(edges.map((pair) => pair.join("|")))],
        [edges[0].join("|")],
        `The editor lays an element it renders in place of lines out to a width of its own - the ` +
          `table widget's box is 16px wider on each side than the line above it. A frame whose ` +
          `edges followed each element's own width would step in and out at every table, and a ` +
          `boundary that steps is not one a person can read. Measured, against ` +
          `${JSON.stringify(framed.map((box) => [box.text, Math.round(box.left), Math.round(box.right)]))}`
      );
    }));

  test("a block whose whole content is a table is one closed frame", async () =>
    watched("frame-only-a-table", async () => {
      const name = "constructed-frame-only-table.md";
      await writeDocument(
        name,
        ["Above.", "", "@@@ teacher", "", ...TABLE, "", "@@@", "", "Below."].join("\n")
      );
      const container = await open(name, views.livePreview);
      await reveal(container, "Above.");
      await placeCursorAfter("Above.");

      const framed = await blockBoxes(container, "permission-block");
      assert.ok(
        framed.some(isTheTable),
        `Framed: ${JSON.stringify(runOf(framed))}. The block holds nothing but the table, so a ` +
          `frame that does not reach it is a frame around nothing at all.`
      );
      assert.deepEqual(gapsIn(framed), [], `Framed: ${JSON.stringify(runOf(framed))}`);

      assert.ok(
        framed[0]?.classes.includes("permission-block-start"),
        `The lid stands on the block's first line, which is where the document opens it. ` +
          `Framed: ${JSON.stringify(runOf(framed))}`
      );
      assert.ok(
        framed[framed.length - 1]?.classes.includes("permission-block-end"),
        `And the floor on its last. Framed: ${JSON.stringify(runOf(framed))}`
      );

      const lid = await styleOf(container, "permission-block-start", ["border-top-width"]);
      const floor = await styleOf(container, "permission-block-end", ["border-bottom-width"]);
      assert.notDeepEqual(
        [lid?.["border-top-width"], floor?.["border-bottom-width"]],
        ["0px", "0px"],
        `A class carrying no drawn edge closes nothing. Measured: ${JSON.stringify({ lid, floor })}`
      );
    }));

  test("a table inside a side-by-side block is inside the block's region", async () =>
    watched("frame-side-by-side-table", async () => {
      const name = "constructed-frame-columns.md";
      await writeDocument(
        name,
        [
          "Above.",
          "",
          "##side-by-side-start",
          "Left column.",
          "",
          ...TABLE,
          "",
          "##separator",
          "Right column.",
          "##side-by-side-end",
          "",
          "Below.",
        ].join("\n")
      );
      const container = await open(name, views.livePreview);
      await reveal(container, "Left column.");
      await placeCursorAfter("Above.");

      const inside = await blockBoxes(container, "side-by-side-block");
      const opens = (await blockBoxes(container, "side-by-side-start"))[0];
      const closes = (await blockBoxes(container, "side-by-side-end"))[0];
      const table = inside.find(isTheTable);

      assert.ok(
        table,
        `The side-by-side block is drawn the same way the permission block is and breaks the same ` +
          `way. Framed: ${JSON.stringify(runOf(inside))}`
      );
      assert.ok(opens && closes, "The block's own markers carry no region for the table to be inside of.");
      assert.ok(
        table.top >= opens.bottom - 1 && table.bottom <= closes.top + 1,
        `The table stands between the block's markers in the document, so it stands between them ` +
          `on screen. Measured: ${JSON.stringify({
            opens: Math.round(opens.bottom),
            table: [Math.round(table.top), Math.round(table.bottom)],
            closes: Math.round(closes.top),
          })}`
      );
      assert.deepEqual(gapsIn(inside), [], `Framed: ${JSON.stringify(runOf(inside))}`);
    }));

  test("a table outside every block carries no frame", async () =>
    watched("frame-not-added-outside", async () => {
      const name = "constructed-frame-loose-table.md";
      await writeDocument(
        name,
        ["Above.", "", "@@@ teacher", "Gated.", "@@@", "", ...TABLE, "", "Below."].join("\n")
      );
      const container = await open(name, views.livePreview);
      await reveal(container, "Above.");
      await placeCursorAfter("Above.");

      for (const kind of ["permission-block", "side-by-side-block"]) {
        assert.deepEqual(
          (await blockBoxes(container, kind)).filter(isTheTable).map((box) => box.text),
          [],
          `The pass puts on an element what the line it stands for carries, and this table's line ` +
            `is outside every block. A frame that appeared here would be one the document does ` +
            `not say, drawn as ${kind}.`
        );
      }
    }));

  test("a table typed into a block is framed, and one left outside by its closing marker is not", async () =>
    watched("frame-follows-the-document", async () => {
      const name = "constructed-frame-edited.md";
      await writeDocument(name, ["Above.", "", "@@@ teacher", "Inside.", "", "@@@", "", "Below."].join("\n"));
      const container = await open(name, views.livePreview);
      await reveal(container, "Inside.");

      await placeCursorAfter("Inside.");
      // The blank line first: a table written straight under a line of text is
      // that line's paragraph continued, and Markdown renders no table at all -
      // so without it the check would be about something the editor never built.
      await type(`\n\n${TYPED_TABLE}`);
      // And the table is shown as its own characters while the cursor is in it,
      // so the element the frame has to reach does not exist until the cursor
      // has left it.
      await placeCursorAfter("Above.");

      const written = await blockBoxes(container, "permission-block");
      assert.ok(
        written.some(isTheTable),
        `A table typed into a block is inside it from the moment it is written, and a frame that ` +
          `only reaches it after the document is closed and reopened is not a frame a person ` +
          `writing can rely on. Framed: ${JSON.stringify(runOf(written))}, in ` +
          `${JSON.stringify(await documentText())}`
      );

      // A second document for the second half, rather than typing on in this
      // one. Typing a table leaves the keyboard inside the element Obsidian
      // built for it - the cell, not the document - and the next Return goes to
      // the next row of the table however the cursor is placed beforehand. A
      // document whose table nobody has typed in does not have that in the way.
      const closing = "constructed-frame-closed-above.md";
      await writeDocument(
        closing,
        ["Above.", "", "@@@ teacher", "Inside.", "", ...TABLE, "", "@@@", "", "Below."].join("\n")
      );
      const second = await open(closing, views.livePreview);
      await reveal(second, "Inside.");

      // The block is closed above the table now, which puts the table outside
      // it. The marker further down opens nothing and closes nothing.
      await placeCursorAfter("Inside.");
      await type("\n@@@");
      await placeCursorAfter("Above.");

      const closed = await blockBoxes(second, "permission-block");
      assert.deepEqual(
        closed.filter(isTheTable).map((box) => box.text),
        [],
        `The block no longer covers the table's line, so the frame may not still be standing on ` +
          `it. What is removed is what keeps a frame off an element the document stopped gating. ` +
          `Framed: ${JSON.stringify(runOf(closed))}, in ${JSON.stringify(await documentText())}`
      );
    }));

  test("nothing of this reaches the reading view", async () =>
    watched("frame-not-in-reading-view", async () => {
      const name = "constructed-frame-reading.md";
      await writeDocument(
        name,
        ["Above.", "", "@@@ teacher", "Before it.", "", ...TABLE, "", "After it.", "@@@", "", "Below."].join("\n")
      );
      const container = await open(name, views.reading);
      await reveal(container, "Before it.");

      const found = await markers(container);
      assert.deepEqual(
        found.filter((m) => m.marker.startsWith("permission-") || m.marker.startsWith("side-by-side-")),
        [],
        `The reading view puts the frame on rendered sections, where a table is a section like ` +
          `any other and was never broken. The editor's own classes reaching it would be the ` +
          `editor modifying rendered output. Found: ${JSON.stringify(found.map((m) => m.marker))}`
      );
      assert.ok(
        found.some((m) => m.marker === "safelearn-read-block"),
        `And its own frame is still there: ${JSON.stringify([...new Set(found.map((m) => m.marker))])}`
      );
    }));
});

// ################### The rendered reading view ###################

describe("the reading view", () => {
  test("the rendered view does not show the tag text", async () =>
    watched("reading-view-tags", async () => {
      const container = await open(FRAGMENTS, views.reading);
      await reveal(container, "Fragmented Text.");
      const shown = await visibleText(container);

      assert.ok(!shown.includes(FRAGMENT), "The rendered reading view still shows the raw tag text.");
      assert.ok(
        !shown.includes("##side-by-side"),
        "The rendered reading view still shows the raw side-by-side markers."
      );
    }));

  test("no tag form is shown as its own characters", async () =>
    watched("reading-view-every-form", async () => {
      const name = "constructed-reading-every-form.md";
      await writeDocument(
        name,
        [
          "@@@ teacher",
          "",
          "Opening text.",
          "",
          "@@@ 4bhif, #answer",
          "Gated text. ##fragment",
          "@@@",
          "",
          "##side-by-side-start",
          "Left.",
          "##separator",
          "Right.",
          "##side-by-side-end",
          "",
          "Closing text.",
        ].join("\n")
      );
      const container = await open(name, views.reading);
      await reveal(container, "Closing text.");
      const shown = await visibleText(container);

      for (const tag of ["@@@", FRAGMENT, "##side-by-side-start", "##side-by-side-end", "##separator"]) {
        assert.ok(
          !shown.includes(tag),
          `The reading view shows ${JSON.stringify(tag)} as its own characters. A tag is an ` +
            `instruction to the rendering server, not text a reader is meant to read. On screen: ` +
            `${JSON.stringify(shown)}`
        );
      }
      for (const text of ["Opening text.", "Gated text.", "Left.", "Right.", "Closing text."]) {
        assert.ok(
          shown.includes(text),
          `What the tags govern is gone with them: ${JSON.stringify(text)} is not on screen.`
        );
      }
    }));

  test("a tag is taken out of a line without rebuilding what surrounds it", async () =>
    watched("reading-view-formatting", async () => {
      const name = "constructed-reading-formatting.md";
      await writeDocument(
        name,
        ["Alpha **bold** ##fragment and [a link](https://example.org) gamma.", "", "End."].join("\n")
      );
      const container = await open(name, views.reading);
      await reveal(container, "gamma.");

      const html = await renderedHtml(container);
      assert.ok(
        html.includes("<strong>bold</strong>"),
        `The emphasis in the line did not survive the tag being taken out of it. A text node ` +
          `replaced by a freshly built one loses its place in whatever wrapped it. Rendered: ` +
          `${JSON.stringify(html)}`
      );
      assert.ok(html.includes("</a>"), "The link in the line did not survive either.");
      assert.ok(
        !(await visibleText(container)).includes(FRAGMENT),
        "The tag is still on screen, so nothing was taken out at all."
      );
    }));

  test("a section that carries no words is not mistaken for an empty one", async () =>
    watched("reading-view-wordless-section", async () => {
      // A section whose lines held nothing but tags has nothing left to show,
      // and goes. Whether that is the case is a question about the source: a
      // rendered image, a horizontal rule and a diagram all hold no text at all,
      // and hiding a section because nothing in it is a word takes content out
      // of a document to remove a tag that was never in it.
      const name = "constructed-reading-wordless.md";
      await writeDocument(
        name,
        [
          "Before.",
          "",
          "![a picture](https://example.org/picture.png)",
          "",
          "---",
          "",
          "@@@ teacher",
          "Gated.",
          "@@@",
          "",
          "After.",
        ].join("\n")
      );
      const container = await open(name, views.reading);
      await reveal(container, "After.");

      const html = await renderedHtml(container);
      assert.ok(
        html.includes("<img") || html.includes("<video") || html.includes("example.org/picture.png"),
        `The paragraph holding only an image is gone from the rendered view. Rendered: ` +
          `${JSON.stringify(html)}`
      );
      assert.ok(html.includes("<hr"), "The horizontal rule is gone from the rendered view.");
      assert.ok(
        !(await visibleText(container)).includes("@@@"),
        "And the lines that really did hold nothing but a tag are still gone."
      );
    }));

  test("a side-by-side block is shown as columns", async () =>
    watched("reading-view-columns", async () => {
      const name = "constructed-reading-columns.md";
      await writeDocument(
        name,
        [
          "Before the blocks.",
          "##side-by-side-start",
          "Left.",
          "##separator",
          "Right.",
          "##side-by-side-end",
          "",
          "##side-by-side-start",
          "One.",
          "##separator",
          "Two.",
          "##separator",
          "Three.",
          "##side-by-side-end",
          "",
          "After the blocks.",
        ].join("\n")
      );
      const container = await open(name, views.reading);
      await reveal(container, "After the blocks.");

      assert.deepEqual(
        await columns(container),
        [
          ["Left.", "Right."],
          ["One.", "Two.", "Three."],
        ],
        "Letting the markers vanish and the content run on underneath would leave the reading " +
          "view saying nothing about the page the server produces, which is what it is for. The " +
          "block is split where the document splits it, one column per part."
      );
      assert.equal(
        await columnsAreSideBySide(container),
        true,
        "The columns carry the class and are stacked on the page anyway - which is the outcome " +
          "the requirement exists to rule out."
      );
      const shown = await visibleText(container);
      assert.ok(
        shown.includes("Before the blocks.") && shown.includes("After the blocks."),
        "The sentence in the same paragraph as an opening marker is not part of the block, and " +
          `must survive it. On screen: ${JSON.stringify(shown)}`
      );
    }));

  test("a block carries its frame and its heading", async () =>
    watched("reading-view-block", async () => {
      const name = "constructed-reading-block.md";
      await writeDocument(
        name,
        ["@@@ teacher", "", "Intro.", "", "@@@ 4bhif, #answer", "Gated text.", "@@@", "", "After."].join("\n")
      );
      const container = await open(name, views.reading);
      await reveal(container, "After.");

      assert.deepEqual(
        chipsOf(await headings(container)),
        ['"teacher" entry', '"4bhif" entry', '"#answer" switch'],
        "Both directives are shown as the heading of what they gate - the one that governs the " +
          "file and the one that opens a block alike."
      );

      const box = await styleOf(container, "safelearn-read-block-start", ["border-top-width"]);
      assert.ok(box && box["border-top-width"] !== "0px", `The block has no lid: ${JSON.stringify(box)}`);

      const gate = await styleOf(container, "safelearn-read-file", [
        "border-top-width",
        "border-bottom-width",
      ]);
      assert.deepEqual(
        [gate?.["border-bottom-width"], gate?.["border-top-width"] === "0px"],
        ["0px", false],
        `The line that gates the file is drawn in the same frame with its lower edge left off, ` +
          `the way the editor draws it. Measured: ${JSON.stringify(gate)}`
      );
    }));

  test("two blocks meeting inside one paragraph both get their heading and their frame", async () =>
    watched("reading-view-adjacent-blocks", async () => {
      // The corpus writes them this way: a closing marker and the next
      // directive on consecutive lines, which Markdown renders as one paragraph.
      // That one rendered section is the floor of the first block and the lid of
      // the second, and a rule that asked which block covers it and stopped at
      // the first answer would give it only one of the two.
      const name = "constructed-reading-adjacent-blocks.md";
      await writeDocument(
        name,
        [
          "Intro.",
          "",
          "@@@ teacher",
          "Teacher text.",
          "@@@",
          "@@@ 4bhif",
          "Class text.",
          "@@@",
          "",
          "After.",
        ].join("\n")
      );
      const container = await open(name, views.reading);
      await reveal(container, "After.");

      assert.deepEqual(
        chipsOf(await headings(container)),
        ['"teacher" entry', '"4bhif" entry'],
        "Both directives are shown as the heading of what they gate."
      );
      const shown = await visibleText(container);
      assert.ok(!shown.includes("@@@"), `A marker is still on screen: ${JSON.stringify(shown)}`);
      assert.ok(
        shown.includes("Teacher text.") && shown.includes("Class text."),
        "And what the two blocks gate is still there."
      );

      const box = await styleOf(container, "safelearn-read-block", [
        "border-top-width",
        "border-bottom-width",
      ]);
      assert.ok(
        box && box["border-top-width"] !== "0px" && box["border-bottom-width"] !== "0px",
        `The section carries both ends, because it is both. Measured: ${JSON.stringify(box)}`
      );
    }));

  test("both views show the same directive the same way", async () =>
    watched("same-heading-in-both-views", async () => {
      // The reason the reading view and the editor were settled in one change:
      // a person switching view may not have to learn twice what they are
      // looking at, and two builders would be free to drift apart at exactly
      // the point where they have to agree.
      const name = "constructed-same-heading.md";
      await writeDocument(name, ["Intro.", MIXED_DIRECTIVE, "Gated.", "@@@"].join("\n"));

      const editor = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");
      const inEditor = chipsOf(await headings(editor));

      const reading = await open(name, views.reading);
      await reveal(reading, "Gated.");
      const inReading = chipsOf(await headings(reading));

      assert.ok(inEditor.length > 0, "The editor showed no heading at all, so there is nothing to compare.");
      assert.deepEqual(
        inReading,
        inEditor,
        "The two views show the same directive with the same entries and the same distinctions."
      );
    }));
});

// ################### The tags the plugin writes ###################

describe("the plugin writes the tags it recognizes", () => {
  const MARKERS = ["##side-by-side-start", "##side-by-side-end", "##separator"];

  /** Fails on any line that carries a marker together with anything else. */
  function assertMarkersStandAlone(text) {
    for (const [index, line] of text.split("\n").entries()) {
      for (const marker of MARKERS) {
        if (!line.includes(marker)) continue;
        assert.equal(
          line.trim(),
          marker,
          `Line ${index + 1} is ${JSON.stringify(line)}. A marker sharing a line with other text ` +
            `is one the plugin does not mark - \`isMarkerLine\` requires the line to be nothing ` +
            `but the marker - and the block boundary the server reads then falls inside running ` +
            `text. A command may not write that.`
        );
      }
    }
  }

  test("the two-column command writes a block the plugin marks", async () =>
    watched("insert-two-columns", async () => {
      const name = "constructed-insert-two.md";
      await writeDocument(name, ["Intro.", "", "End."].join("\n"));
      const container = await open(name, views.livePreview);
      await placeCursorAfter("Intro.");
      await runCommand("insert-side-by-side");

      const written = await documentText();
      assert.deepEqual(
        written.split("\n"),
        [
          "Intro.",
          "##side-by-side-start",
          "",
          "##separator",
          "",
          "##side-by-side-end",
          "",
          "End.",
        ],
        "Two columns, each with a line to write in. A separator standing directly above the " +
          "closing marker is an empty column with no room in it, and a person would have to make " +
          "that room before they could type."
      );
      assertMarkersStandAlone(written);

      const found = await markers(container);
      assert.ok(
        found.some((m) => m.marker === "side-by-side-start") &&
          found.some((m) => m.marker === "side-by-side-separator") &&
          found.some((m) => m.marker === "side-by-side-end"),
        `What the command wrote is not marked by the plugin that wrote it. Found: ` +
          `${JSON.stringify(shapeOf(found))}`
      );
    }));

  test("the cursor is left in the column that is waiting to be written in", async () =>
    watched("insert-cursor", async () => {
      const name = "constructed-insert-cursor.md";
      await writeDocument(name, ["Intro.", "", "End."].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Intro.");
      await runCommand("insert-side-by-side");

      assert.deepEqual(
        await cursorPosition(),
        { from: { line: 2, ch: 0 }, to: { line: 2, ch: 0 } },
        "Line 3 of the document is the first column. A command that leaves the cursor where it " +
          "was makes a person find the place it just built for them."
      );
    }));

  test("a selection is enclosed whole and no separator is written into it", async () =>
    watched("insert-around-selection", async () => {
      const name = "constructed-insert-selection.md";
      await writeDocument(
        name,
        ["Alpha paragraph.", "", "Beta paragraph.", "", "End."].join("\n")
      );
      await open(name, views.livePreview);
      const selected = await selectAcross("Alpha paragraph.", "Beta paragraph.");
      assert.equal(selected.changed, false, "Selecting changed the document text.");
      await runCommand("insert-side-by-side");

      assert.deepEqual(
        (await documentText()).split("\n"),
        [
          "##side-by-side-start",
          "Alpha paragraph.",
          "",
          "Beta paragraph.",
          "##separator",
          "",
          "##side-by-side-end",
          "",
          "End.",
        ],
        "Somebody who selected two paragraphs does not want them divided at a place the command " +
          "guessed. They are enclosed as they were, and the separator stands after them - a line " +
          "to move rather than a division to undo."
      );
      assert.deepEqual(
        await cursorPosition(),
        { from: { line: 5, ch: 0 }, to: { line: 5, ch: 0 } },
        "The cursor is in the empty column, which is the part of the block that is waiting."
      );
    }));

  test("the command that asks writes the number of columns it was given", async () =>
    watched("insert-chosen-columns", async () => {
      const name = "constructed-insert-columns.md";
      await writeDocument(name, ["Intro.", "", "End."].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      // The command opens a dialog and writes nothing until it is answered, so
      // the document is expected to be unchanged when the command returns.
      await runCommand("insert-side-by-side-columns", { expectEdit: false });
      await answerColumnCount(4);

      const written = await documentText();
      assert.equal(
        written.split("\n").filter((line) => line.trim() === "##separator").length,
        3,
        `Four columns are three separators. Written: ${JSON.stringify(written)}`
      );
      assertMarkersStandAlone(written);
    }));

  test("the command that asks refuses a count that is not a side-by-side block", async () =>
    watched("insert-refused-count", async () => {
      const name = "constructed-insert-refused.md";
      await writeDocument(name, ["Intro.", "", "End."].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      const before = await documentText();
      await runCommand("insert-side-by-side-columns", { expectEdit: false });
      await answerColumnCount(1);

      assert.equal(
        await documentText(),
        before,
        "One column is not a side-by-side block. Writing the markers anyway would put a tag in a " +
          "person's document that says nothing, and the plugin would mark it as if it did."
      );
    }));

  // The two checks below ask one question of both dialogs, deliberately in the
  // same words: a change to one of them cannot leave the other behind quietly.
  // What they assert is a geometry rather than a class list, because a
  // `modal-button-container` a theme collapsed to nothing carries the class and
  // leaves the button against the field all the same.
  test("the dialog that asks for a count separates its confirmation from its field", async () =>
    watched("columns-dialog-spacing", async () => {
      const name = "constructed-columns-dialog.md";
      await writeDocument(name, ["Intro.", "", "End."].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Intro.");

      await runCommand("insert-side-by-side-columns", { expectEdit: false });
      const boxes = await dialogBoxes();

      assert.ok(boxes, "The command opened no dialog with a field and a confirmation to measure.");
      assert.ok(
        boxes.button.top > boxes.field.bottom,
        "The confirmation stands below the field and the two do not touch. A button against the " +
          "lower edge of the field reads as one control with it, and a click aimed at the one " +
          "lands in the other. No particular distance is asserted - that one is the theme's to " +
          `choose. Field ${JSON.stringify(boxes.field)}, button ${JSON.stringify(boxes.button)}.`
      );

      // The button gained an ancestor, not a competitor: `answerColumnCount`
      // still addresses it as the `button` in `.modal-container`, and what the
      // count writes is what it always wrote.
      await answerColumnCount(4);
      assert.equal(
        (await documentText()).split("\n").filter((line) => line.trim() === "##separator").length,
        3,
        "Laying the dialog out is a statement about the dialog. What the count writes is unchanged."
      );
    }));

  test("the dialog that asks for a list separates its confirmation from its field", async () =>
    watched("name-list-dialog-spacing", async () => {
      const name = "constructed-names-dialog.md";
      await writeDocument(name, ["# Chapter", "", "Text.", ""].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Text.");

      await runCommand("insert-sections-per-name", { expectEdit: false });
      const boxes = await dialogBoxes();

      assert.ok(boxes, "The command opened no dialog with a field and a confirmation to measure.");
      assert.ok(
        boxes.button.top > boxes.field.bottom,
        "The dialog that asks for a list is laid out like the one that asks for a count: the " +
          "field, and the confirmation below it with space between them. The two ask different " +
          "things, and the field is where that difference belongs. " +
          `Field ${JSON.stringify(boxes.field)}, button ${JSON.stringify(boxes.button)}.`
      );

      await answerNameList(["Ada Byron"]);
      assert.ok(
        (await documentText()).includes("@@@ Ada Byron"),
        "Laying the dialog out changed nothing about the sections the list writes."
      );
    }));

  test("a command invoked in the middle of a line does not leave a marker in it", async () =>
    watched("insert-mid-line", async () => {
      const name = "constructed-insert-midline.md";
      await writeDocument(name, ["Alpha beta gamma.", "", "End."].join("\n"));
      await open(name, views.livePreview);
      await moveCursorInto("beta");
      await runCommand("insert-side-by-side");

      const written = await documentText();
      assertMarkersStandAlone(written);
      assert.ok(
        written.includes("Alpha be\n##side-by-side-start"),
        `The insertion begins on a line of its own, and what stood before the cursor stays on ` +
          `the line it was on. Written: ${JSON.stringify(written)}`
      );
      assert.ok(
        written.includes("##side-by-side-end\nta gamma."),
        `And what stood after the cursor is on a line of its own too, rather than glued to the ` +
          `closing marker. Written: ${JSON.stringify(written)}`
      );
    }));

  test("the fragment marker goes above the whole block, not above the cursor's line", async () =>
    watched("insert-fragment", async () => {
      const name = "constructed-insert-fragment.md";
      await writeDocument(
        name,
        ["Intro.", "", "First line.", "Second line.", "Third line.", "", "End."].join("\n")
      );
      await open(name, views.livePreview);
      await moveCursorInto("Second");
      await runCommand("insert-fragment");

      assert.deepEqual(
        (await documentText()).split("\n"),
        ["Intro.", "", "##fragment", "First line.", "Second line.", "Third line.", "", "End."],
        "The marker written above the cursor's own line would divide the paragraph in two and " +
          "make a fragment of its second half - which nobody asked for and which is invisible " +
          "until the deck is opened."
      );
      assert.deepEqual(
        await cursorPosition(),
        { from: { line: 4, ch: 3 }, to: { line: 4, ch: 3 } },
        "Everything below the insertion moved down one line, and the person is put back where " +
          "they were writing rather than at the marker - the same column of the same text, one " +
          "line further down. The cursor stood in the middle of `Second`, at column 3."
      );
    }));

  test("a section is written for each name, in the order they were given", async () =>
    watched("sections-per-name", async () => {
      const name = "constructed-sections.md";
      await writeDocument(name, ["# Chapter", "", "Text.", ""].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Text.");

      await runCommand("insert-sections-per-name", { expectEdit: false });
      await answerNameList(["Ada Byron", "Stu Dent", "Grace Hopper"]);

      assert.deepEqual(
        (await documentText()).split("\n"),
        [
          "# Chapter",
          "",
          "Text.",
          "@@@ Ada Byron",
          "## Ada Byron",
          "",
          "@@@",
          "",
          "@@@ Stu Dent",
          "## Stu Dent",
          "",
          "@@@",
          "",
          "@@@ Grace Hopper",
          "## Grace Hopper",
          "",
          "@@@",
          "",
        ],
        "One section per name, in the order the list gave them, each with a line to write in. The " +
          "heading is one level below `# Chapter`, so the sections stand underneath the chapter " +
          "they were inserted into."
      );
      assert.deepEqual(
        await cursorPosition(),
        { from: { line: 5, ch: 0 }, to: { line: 5, ch: 0 } },
        "The cursor is in the first section, below its heading, where the next thing belongs."
      );
    }));

  test("the heading of a generated section stands inside the block", async () =>
    watched("sections-heading-inside", async () => {
      // Not a formatting question. `removeForbiddenContent` replaces what stands
      // *between* the markers and leaves everything outside them for every
      // reader - so a heading above the block would show every student the names
      // of all the others, on a page written so that each of them sees only
      // their own section.
      const name = "constructed-sections-inside.md";
      await writeDocument(name, ["# Chapter", "", "Text.", ""].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Text.");

      await runCommand("insert-sections-per-name", { expectEdit: false });
      await answerNameList(["Ada Byron", "Stu Dent"]);

      const lines = (await documentText()).split("\n");
      for (const person of ["Ada Byron", "Stu Dent"]) {
        const opens = lines.indexOf(`@@@ ${person}`);
        const heading = lines.findIndex((line, index) => index > opens && line.endsWith(` ${person}`));
        const closes = lines.findIndex((line, index) => index > opens && line.trim() === "@@@");

        assert.ok(opens !== -1, `No block was written for ${person}.`);
        assert.ok(
          heading > opens && heading < closes,
          `${person}'s heading is on line ${heading + 1}, and the block runs from line ` +
            `${opens + 1} to line ${closes + 1}. A heading outside the block is text the server ` +
            `shows to every reader, which turns a document of private sections into a class list.`
        );
      }
    }));

  test("the heading level follows the heading above the insertion point", async () =>
    watched("sections-heading-level", async () => {
      const deep = "constructed-sections-deep.md";
      await writeDocument(deep, ["# Chapter", "", "### Exercise", "", "Text.", ""].join("\n"));
      await open(deep, views.livePreview);
      await placeCursorAfter("Text.");
      await runCommand("insert-sections-per-name", { expectEdit: false });
      await answerNameList(["Ada Byron"]);

      assert.ok(
        (await documentText()).includes("#### Ada Byron"),
        `The last heading above the insertion point is \`### Exercise\`, so the section's heading ` +
          `is one level below it. Written: ${JSON.stringify(await documentText())}`
      );

      const flat = "constructed-sections-flat.md";
      await writeDocument(flat, ["Text with no heading above it.", ""].join("\n"));
      await open(flat, views.livePreview);
      await placeCursorAfter("Text with no heading above it.");
      await runCommand("insert-sections-per-name", { expectEdit: false });
      await answerNameList(["Ada Byron"]);

      assert.ok(
        (await documentText()).includes("# Ada Byron"),
        "With no heading above the insertion point there is no level to go one below, and the " +
          "sections are the document's top level."
      );
    }));

  test("names are trimmed, their spelling kept, and blank lines produce nothing", async () =>
    watched("sections-name-shape", async () => {
      const name = "constructed-sections-shape.md";
      await writeDocument(name, ["# Chapter", "", "Text.", ""].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Text.");

      await runCommand("insert-sections-per-name", { expectEdit: false });
      await answerNameList(["  Ada Byron  ", "", "   ", "Stu Dent"]);

      const written = await documentText();
      assert.equal(
        written.split("\n").filter((line) => line.startsWith("@@@ ")).length,
        2,
        `Blank lines in a pasted list are not people. Written: ${JSON.stringify(written)}`
      );
      assert.ok(
        written.includes("@@@ Ada Byron\n") && !written.includes("@@@   Ada Byron"),
        "A name is trimmed."
      );
      assert.ok(
        !written.includes("ada byron"),
        "And its spelling is kept. The server's comparison is lowercased anyway, so writing it " +
          "down in lower case changes nothing about who may read the block - and makes a document " +
          "full of people's names that nobody wants to read."
      );
    }));

  test("a name the server reads as a role is written as given, and named", async () =>
    watched("sections-reserved-name", async () => {
      const name = "constructed-sections-reserved.md";
      await writeDocument(name, ["# Chapter", "", "Text.", ""].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Text.");

      await forgetNotices();
      await runCommand("insert-sections-per-name", { expectEdit: false });
      await answerNameList(["Students", "Ada Byron"]);

      assert.ok(
        (await documentText()).includes("@@@ Students"),
        "The command writes what it was given and corrects nothing."
      );
      const reported = await noticesShown();
      assert.ok(
        reported.some((notice) => notice.includes("Students")),
        `\`hasRoles\` drops a display name equal to one of the five reserved ones rather than ` +
          `adding it, so this section is addressed to the *role* and read by every student in the ` +
          `school. Nothing in the document says so and no marking can - this command is the one ` +
          `place in the plugin that knows a person was meant. Reported: ${JSON.stringify(reported)}`
      );
    }));

  test("a list with no reserved name is reported about at all", async () =>
    watched("sections-no-report", async () => {
      const name = "constructed-sections-quiet.md";
      await writeDocument(name, ["# Chapter", "", "Text.", ""].join("\n"));
      await open(name, views.livePreview);
      await placeCursorAfter("Text.");

      await forgetNotices();
      await runCommand("insert-sections-per-name", { expectEdit: false });
      await answerNameList(["Ada Byron", "Grace Hopper"]);

      assert.deepEqual(
        await noticesShown(),
        [],
        "A report that appears for every list is a report nobody reads by the third one."
      );
    }));

  test("the restricting command encloses a selection and restricts nothing else", async () =>
    watched("restrict-selection", async () => {
      const around = "constructed-restrict-selection.md";
      await writeDocument(around, ["Before.", "", "Secret paragraph.", "", "After."].join("\n"));
      await open(around, views.livePreview);
      await selectAcross("Secret paragraph.", "Secret paragraph.");
      await runCommand("restrict-selection", { expectEdit: false });
      await answerNameList(["teacher", "Ada Byron"]);

      assert.deepEqual(
        (await documentText()).split("\n"),
        ["Before.", "", "@@@ teacher, Ada Byron", "Secret paragraph.", "@@@", "", "After."],
        "The entries are one directive, and what was selected stands inside it unchanged."
      );

      const empty = "constructed-restrict-empty.md";
      await writeDocument(empty, ["Before.", "", "Untouched paragraph.", ""].join("\n"));
      await open(empty, views.livePreview);
      await placeCursorAfter("Before.");
      await runCommand("restrict-selection", { expectEdit: false });
      await answerNameList(["teacher"]);

      assert.deepEqual(
        (await documentText()).split("\n"),
        ["Before.", "@@@ teacher", "", "@@@", "", "Untouched paragraph.", ""],
        "With nothing selected the command writes an empty block and reaches for no paragraph of " +
          "its own. A restriction over text nobody pointed at is invisible to the person who " +
          "wrote it, and shows up as somebody not seeing something they should."
      );
    }));

  test("no command pushes a directive off the first line of the document", async () =>
    watched("insert-never-ungates-a-file", async () => {
      // A directive gates the whole file by standing on line 1 and by nothing
      // else. An insertion at the very top pushes it to line 2, and the document
      // becomes readable by everyone - silently, through a command somebody ran
      // to add a column or a fragment. That is a permission change nobody asked
      // for, so it cannot happen.
      const name = "constructed-insert-gated-file.md";
      await writeDocument(name, ["@@@ teacher", "Only visible to teachers.", ""].join("\n"));
      await open(name, views.livePreview);

      await moveCursorInto("Only visible");
      await runCommand("insert-fragment");
      assert.equal(
        (await documentText()).split("\n")[0],
        "@@@ teacher",
        "The fragment command walks up to the top of the block the cursor is in, and this block " +
          "reaches the first line. It stops below the directive rather than above it."
      );

      await open(name, views.livePreview);
      await placeCursorAtStart();
      await runCommand("insert-side-by-side");
      assert.equal(
        (await documentText()).split("\n")[0],
        "@@@ teacher",
        "And an insertion made with the cursor at the very top of the document goes below the " +
          "directive, not above it."
      );
    }));

  test("every command Obsidian holds for this plugin is in the editor's context menu", async () =>
    watched("insert-context-menu", async () => {
      await open(FRAGMENTS, views.livePreview);
      const commands = await registeredCommands();
      const items = await editorMenuItems();

      assert.ok(
        commands.length > 0,
        "Obsidian holds no commands for this plugin at all, so there is nothing to compare."
      );
      assert.deepEqual(
        commands.filter((command) => !items.some((title) => command.name.endsWith(title))).map((c) => c.id),
        [],
        `Every command is offered in both places, because both are built from one list. A command ` +
          `in the palette and not in the menu reads as the menu being broken rather than as an ` +
          `entry having been forgotten. In the menu: ${JSON.stringify(items)}`
      );
    }));
});

// ################### The editor does not modify rendered output ###################

describe("the editor does not modify rendered output", () => {
  // Last in the file on purpose: it is the only check that puts a second
  // document on screen, and the window is narrower afterwards than the ones
  // before it assume.

  test("typing in the editor leaves a rendered view beside it alone", async () =>
    watched("editor-reaching-into-rendered-output", async () => {
      try {
        const reading = await open(FRAGMENTS, views.reading);
        await reveal(reading, "Fragmented Text.");

        // Beside it rather than in place of it, because that is the situation the
        // requirement is about: a rendered view of one document open while
        // another is being written.
        await open(PSEUDO_ROLES, views.livePreview, { beside: true });

        const planted = await plantInRenderedView("##fragment planted by a check");
        await placeCursorAfter("# Question 23");
        await type("x");

        assert.equal(
          await plantedText(),
          planted,
          "Typing in the editor changed text in a rendered view of another document. Marking in " +
            "the editor and hiding tags in the reading view are separate mechanisms with separate " +
            "triggers; an editor that rewrites rendered DOM on every keystroke is the wrong " +
            "mechanism in the wrong place, and the reading view's own repair is " +
            "plugin-render-hide-tags."
        );
      } finally {
        await closeExtraViews();
      }
    }));
});
