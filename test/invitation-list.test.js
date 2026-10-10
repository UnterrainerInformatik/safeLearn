/**
 * The text the "Invitation list…" command writes, decided by the code that
 * decides it.
 *
 * Formatting is pure: the chosen people and a format in, the list and what to
 * report about it out. The preview, the insert and the copy all call the same
 * function, so it is checked here once, without an editor. What the dialog does
 * with it - preview, insert, copy, remembering the format - is in
 * `test/obsidian/plugin.test.js`.
 *
 * The functions are taken out of `main.ts` itself, through `pluginModule`, the
 * same way `section-names.test.js` takes its functions.
 *
 * No browser, no login, no server process, and no Obsidian.
 */

import assert from "node:assert/strict";
import { before, describe, test } from "node:test";

import { pluginFunction, pluginModule } from "./obsidian/harness.js";

let unescapeFormatText;
let formatInvitationList;
let invitationEmptyFieldsNotice;
let readInvitationFormat;

before(async () => {
  const plugin = await pluginModule();
  unescapeFormatText = pluginFunction(plugin, "unescapeFormatText");
  formatInvitationList = pluginFunction(plugin, "formatInvitationList");
  invitationEmptyFieldsNotice = pluginFunction(plugin, "invitationEmptyFieldsNotice");
  readInvitationFormat = pluginFunction(plugin, "readInvitationFormat");
});

/** A person as the picker holds them, from an instance that sends every field. */
function person(firstName, lastName, email, roles = { student: true }) {
  return { name: `${firstName} ${lastName}`, firstName, lastName, email, roles };
}

const ANNA = person("Anna", "Bauer", "anna.bauer@example.org", { student: true, "2B": true });
const BEN = person("Ben", "Huber", "ben.huber@example.org", { student: true, "2B": true });
const CARL = person("Carl", "Aigner", "carl.aigner@example.org", { student: true, "2B": true });

function format(overrides = {}) {
  return { fields: ["email"], fieldSeparator: ", ", prefix: "", postfix: "", entrySeparator: "\\n", ...overrides };
}

describe("unescapeFormatText", () => {
  test("turns \\n into a line break and \\t into a tab", () => {
    assert.equal(unescapeFormatText(",,\\n"), ",,\n");
    assert.equal(unescapeFormatText("\\t"), "\t");
  });

  test("reads \\\\n as a backslash and an n, in one left-to-right pass", () => {
    assert.equal(unescapeFormatText("\\\\n"), "\\n");
    assert.equal(unescapeFormatText("a\\\\\\n"), "a\\\n");
  });

  test("leaves every other character, a lone backslash included, as given", () => {
    assert.equal(unescapeFormatText("; \\x \\"), "; \\x \\");
  });
});

describe("formatInvitationList", () => {
  test("writes the author's example format", () => {
    const list = formatInvitationList(
      [BEN, ANNA],
      format({ fields: ["firstName", "lastName", "email"], fieldSeparator: ",", prefix: ",,,", postfix: ",,\\n", entrySeparator: "" })
    );
    assert.equal(
      list.text,
      ",,,Anna,Bauer,anna.bauer@example.org,,\n,,,Ben,Huber,ben.huber@example.org,,\n"
    );
    assert.equal(list.entries, 2);
  });

  test("writes addresses one per line, in surname order, with no line break after the last", () => {
    assert.equal(
      formatInvitationList([ANNA, BEN, CARL], format()).text,
      "carl.aigner@example.org\nanna.bauer@example.org\nben.huber@example.org"
    );
  });

  test("joins addresses with commas, with no comma after the last", () => {
    assert.equal(
      formatInvitationList([ANNA, BEN], format({ entrySeparator: "," })).text,
      "anna.bauer@example.org,ben.huber@example.org"
    );
  });

  test("puts a tab between the fields for \\t", () => {
    assert.equal(
      formatInvitationList([ANNA], format({ fields: ["lastName", "firstName"], fieldSeparator: "\\t" })).text,
      "Bauer\tAnna"
    );
  });

  test("writes the fields in the order they are given", () => {
    assert.equal(
      formatInvitationList([ANNA], format({ fields: ["email", "firstName"], fieldSeparator: " " })).text,
      "anna.bauer@example.org Anna"
    );
  });

  test("writes a person chosen twice once", () => {
    assert.equal(formatInvitationList([ANNA, ANNA], format()).entries, 1);
  });

  test("writes the class as every class-like value, alphabetically, separated by /", () => {
    const twoGroups = person("Dora", "Egger", "", { student: true, "4AHIF": true, "2B": true, examParticipant: true });
    assert.equal(formatInvitationList([twoGroups], format({ fields: ["class"] })).text, "2B/4AHIF/examParticipant");
  });

  test("writes values verbatim, even where they hold a separator", () => {
    const comma = person("Eva", "Berg, Jr.", "eva@example.org");
    assert.equal(
      formatInvitationList([comma], format({ fields: ["lastName", "email"], fieldSeparator: "," })).text,
      "Berg, Jr.,eva@example.org"
    );
  });

  test("writes a missing address empty, keeps its separators, and counts it", () => {
    const noAddress = person("Fritz", "Gruber", "");
    const list = formatInvitationList(
      [ANNA, noAddress],
      format({ fields: ["firstName", "email"], fieldSeparator: ";", postfix: ";" })
    );
    assert.equal(list.text, "Anna;anna.bauer@example.org;\nFritz;;");
    assert.equal(list.emptyFields.get("email"), 1);
    assert.equal(list.addressesSent, true);
    assert.match(invitationEmptyFieldsNotice(list), /^1 entry has an empty e-mail address\.$/);
  });

  test("says the instance does not send addresses rather than counting every entry", () => {
    const old = [{ name: "Anna Bauer", firstName: "Anna", lastName: "Bauer", roles: {} }, { name: "Ben Huber", roles: {} }];
    const list = formatInvitationList(old, format({ fields: ["email"] }));
    assert.equal(list.text, "\n");
    assert.equal(list.addressesSent, false);
    const notice = invitationEmptyFieldsNotice(list);
    assert.match(notice, /does not send e-mail addresses/);
    assert.doesNotMatch(notice, /\b2\b/);
  });

  test("reports nothing where no field was empty", () => {
    assert.equal(invitationEmptyFieldsNotice(formatInvitationList([ANNA], format())), null);
  });
});

describe("readInvitationFormat", () => {
  test("starts with the address alone, one per line, where nothing was stored", () => {
    const fresh = readInvitationFormat(undefined);
    assert.deepEqual([...fresh.fields], ["email"]);
    assert.equal(fresh.entrySeparator, "\\n");
    assert.equal(fresh.prefix, "");
    assert.equal(fresh.postfix, "");
    assert.equal(fresh.fieldSeparator, ", ");
  });

  test("keeps what is shaped like a format and replaces what is not", () => {
    const read = readInvitationFormat({ fields: ["lastName", "phone", "lastName", "email"], prefix: 3, postfix: ",,\\n" });
    assert.deepEqual([...read.fields], ["lastName", "email"]);
    assert.equal(read.prefix, "");
    assert.equal(read.postfix, ",,\\n");
  });
});
