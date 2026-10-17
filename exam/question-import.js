/**
 * Importing questions from a Markdown file (`question-import`): reading a
 * file in the format `safelearn-questions/1`, checking it against the
 * editor's rules and the import's own, the preview of a clean file, the
 * all-or-nothing import, and taking an import back.
 *
 * The file is written by a Claude from the format description
 * (`question-import-format.md`), so every problem names the line it is on and
 * reads as an instruction that can be handed back unchanged.
 *
 * An import only adds: questions at the end of their categories, categories
 * where the file names one that is not there. Nothing already in the pool or
 * in a test changes (exam-question-import design D5).
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Marked } from "marked";

import { ConflictError, inTransaction, NotFoundError, now } from "./classes.js";
import { categoryTree, plainText } from "./pool.js";
import { questionTypes } from "./pool-import.js";
import { insertCategory, insertQuestion, QuestionProblemsError, questionProblems } from "./pool-edit.js";
import { trueFalseText } from "./stored-html.js";

/** The format this import reads; the description has to name it. */
export const formatVersion = "safelearn-questions/1";

/** The largest file, and the most questions, one import takes. */
export const fileLimitBytes = 1024 * 1024;
export const questionLimit = 200;

const nameLimit = 200;

/** The format description a teacher hands to a Claude, without the category tree. */
export const formatDescriptionPath = path.join(import.meta.dirname, "question-import-format.md");

// A parser of its own: no extension of the renderer's (no highlighting), GFM
// for the task lists. Code blocks keep only `<pre><code>`; `cleanStoredHtml`
// removes the language class like every class.
const markdown = new Marked({ gfm: true, breaks: false });

const languageNames = { de: "German", en: "English" };

/** The hint at the end of a question text, by language: the number of correct answers. */
const hintPattern = {
  de: /\((\d+) richtige Antwort(?:en)?\)$/,
  en: /\((\d+) correct answers?\)$/,
};

function hintText(language, count) {
  return language === "de"
    ? `(${count} richtige ${count === 1 ? "Antwort" : "Antworten"})`
    : `(${count} correct ${count === 1 ? "answer" : "answers"})`;
}

/** A category path as written in a heading: segments separated by " / ". */
function pathSegments(text) {
  return text.split(" / ").map((segment) => segment.trim());
}

/** The fence a line opens, or null: three or more backticks or tildes, indented at most three spaces. */
function fenceOpening(line) {
  const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
  if (!match) return null;
  // A backtick fence's info string may not hold a backtick.
  if (match[1][0] === "`" && line.slice(match[0].length).includes("`")) return null;
  return match[1];
}

function closesFence(line, fence) {
  const match = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return match !== null && match[1][0] === fence[0] && match[1].length >= fence.length;
}

/**
 * The Markdown of one language section, as stored HTML and answers, with the
 * problems of its content. `lines` are `{ number, text }`; `withAnswers` is
 * false for a true/false question, which has none.
 */
function readSection(lines, { withAnswers, problem }) {
  const firstLine = lines.find((line) => line.text.trim() !== "")?.number ?? lines[0]?.number ?? null;
  const source = lines.map((line) => line.text).join("\n");
  const tokens = markdown.lexer(source);

  // The line each top-level token starts on, from the raw text before it.
  const startLine = lines[0]?.number ?? 0;
  let offset = 0;
  const located = tokens.map((token) => {
    const line = startLine + (source.slice(0, offset).match(/\n/g)?.length ?? 0);
    offset += token.raw.length;
    return { token, line: line + (token.raw.match(/^\n*/)[0].length) };
  });
  const content = located.filter(({ token }) => token.type !== "space");

  const refused = {
    image: "embeds an image. Images cannot be imported; leave them out, the teacher adds them in the editor.",
    html: "contains HTML. Write the text in Markdown only.",
    heading: "contains a heading. A question text has no headings; a line starting with # ends the question.",
  };
  let refusedContent = false;
  for (const { token, line } of content) {
    // A list's items are named by their own lines, everything else by its start.
    const parts = token.type === "list" ? token.items : [token];
    let itemLine = line;
    for (const part of parts) {
      const found = new Set();
      markdown.walkTokens([part], (inner) => {
        if (refused[inner.type]) found.add(inner.type);
      });
      for (const kind of found) problem(itemLine, refused[kind]);
      if (found.size > 0) refusedContent = true;
      if (token.type === "list") itemLine += part.raw.replace(/\n+$/, "\n").match(/\n/g)?.length ?? 0;
    }
  }

  const last = content.at(-1);
  const isTaskList = last?.token.type === "list" && last.token.items.some((item) => item.task);
  let answers = [];
  let textTokens = content;
  if (withAnswers) {
    if (!isTaskList) {
      problem(firstLine, "has no answers. End the section with the answers as a task list: `- [x] ` for a correct one, `- [ ] ` for a wrong one.");
    } else {
      textTokens = content.slice(0, -1);
      let itemLine = last.line;
      answers = last.token.items.map((item, index) => {
        const line = itemLine;
        itemLine += item.raw.replace(/\n+$/, "\n").match(/\n/g)?.length ?? 0;
        if (!item.task) problem(line, `answer ${index + 1} is not marked. Start every answer with \`- [x] \` or \`- [ ] \`.`);
        if (item.tokens.some((token) => token.type === "list")) problem(line, `answer ${index + 1} holds a list. An answer is a single list item.`);
        return { line, html: markdown.parser(item.tokens).trim(), correct: item.checked === true };
      });
    }
  } else if (isTaskList) {
    problem(last.line, "has answers, but a true/false question has none: its answers are always true and false. Remove the task list.");
    textTokens = content.slice(0, -1);
  }

  const html = markdown.parser(textTokens.map(({ token }) => token)).trim();
  return { line: firstLine, html, answers, refusedContent };
}

/**
 * Reads an import file into categories and questions (design D3). Every
 * element keeps the line it starts on; whatever does not fit the format is a
 * problem `{ line, question, message }`, `question` the German title or null.
 * Questions with a broken structure carry `broken`, and the check skips the
 * editor's rules for them.
 */
export function parseQuestionFile(text) {
  const problems = [];
  const add = (line, question, message) => problems.push({ line, question, message });
  const lines = String(text ?? "")
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const result = { categories: [], questions: [], problems };

  // The front matter: `---`, `format: safelearn-questions/1`, `---`.
  const notThisFormat = `This is not a question file in the format ${formatVersion}. It has to start with the three lines \`---\`, \`format: ${formatVersion}\`, \`---\`.`;
  if (lines[0]?.trim() !== "---") {
    add(1, null, notThisFormat);
    return result;
  }
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (close === -1) {
    add(1, null, notThisFormat);
    return result;
  }
  const format = lines.slice(1, close).map((line) => /^format:\s*(.*?)\s*$/.exec(line)?.[1]).find((value) => value !== undefined);
  if (format === undefined) {
    add(1, null, notThisFormat);
    return result;
  }
  if (format !== formatVersion) {
    add(1 + lines.slice(1, close).findIndex((line) => /^format:/.test(line)) + 1, null, `The file names the format "${format}"; this import reads ${formatVersion} only.`);
    return result;
  }

  let category = null; // index into result.categories
  let question = null;
  let section = null; // { language, lines }
  let fence = null;
  // Where the header lines below a heading are read: the lines still expected.
  let header = null; // { kind, expect: [...], line }

  const finishSection = () => {
    if (!section || !question) return;
    const where = `The ${languageNames[section.language]} section`;
    const read = readSection(section.lines, {
      withAnswers: question.type !== "truefalse",
      problem: (line, message) => add(line ?? section.line, question.nameDe, `${where} ${message}`),
    });
    question[section.language] = { ...read, line: section.line };
    // An image is the parser's problem already; the editor would name it again.
    if (read.refusedContent) question.broken = true;
    section = null;
  };

  const finishQuestion = () => {
    finishSection();
    if (!question) return;
    if (header) {
      // The heading ended before all its header lines came.
      add(header.line, question.nameDe, `The line \`${header.expect[0]}: \` is missing below the heading.`);
      question.broken = true;
      header = null;
    }
    for (const language of ["de", "en"]) {
      if (!question[language] && !question.broken) {
        add(question.line, question.nameDe, `The section \`### ${language}\` is missing.`);
        question.broken = true;
      }
    }
    result.questions.push(question);
    question = null;
  };

  const finishCategoryHeader = () => {
    if (header?.kind === "category") {
      add(header.line, null, "The line `en: ` with the English path is missing below the category heading.");
      result.categories[category].broken = true;
      header = null;
    }
  };

  lines.forEach((raw, index) => {
    if (index <= close) return;
    const number = index + 1;
    const line = raw;

    if (fence !== null) {
      if (closesFence(line, fence)) fence = null;
      if (section) section.lines.push({ number, text: line });
      else if (line.trim() !== "") add(number, question?.nameDe ?? null, "This line is outside a `### de` or `### en` section.");
      return;
    }

    // The header lines directly below a heading, in their fixed order. A
    // line naming a later one means the ones before it are missing.
    if (header) {
      const ahead = header.expect.findIndex((expected) => new RegExp(`^${expected}:`).test(line));
      if (ahead > 0 && header.kind === "question") {
        for (const missing of header.expect.splice(0, ahead)) {
          add(number, question.nameDe, `The line \`${missing}: \` is missing or misplaced: it belongs directly below the heading${missing === "en" ? "" : ", after the lines above it"}.`);
        }
        question.broken = true;
      }
      const [key] = header.expect;
      const match = new RegExp(`^${key}:\\s?(.*)$`).exec(line);
      if (match) {
        const value = match[1].trim();
        if (header.kind === "category") {
          const node = result.categories[category];
          node.en = pathSegments(value);
          node.enLine = number;
          header = null;
        } else {
          if (key === "en") {
            question.nameEn = value;
            question.enLine = number;
          } else if (key === "type") {
            question.type = value;
            question.typeLine = number;
            if (!questionTypes.includes(value)) {
              add(number, question.nameDe, `The type "${value}" is unknown. Use multichoiceset, multichoice or truefalse.`);
              question.broken = true;
            } else if (value === "truefalse") {
              header.expect.push("solution");
            }
          } else if (key === "solution") {
            if (value !== "true" && value !== "false") {
              add(number, question.nameDe, "A true/false question's line reads `solution: true` or `solution: false`.");
              question.broken = true;
            }
            question.solution = value === "true";
          }
          header.expect.shift();
          if (header.expect.length === 0) header = null;
        }
        return;
      }
      // Anything else where a header line belongs: the line is missing, and
      // this one is read as if the header had ended.
      if (header.kind === "category") {
        finishCategoryHeader();
      } else {
        add(number, question.nameDe, `The line \`${key}: \` is missing or misplaced: it belongs directly below the heading${key === "en" ? "" : ", after the lines above it"}.`);
        question.broken = true;
        header = null;
      }
    }

    const heading = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/.exec(line);
    if (heading && heading[1].length === 1) {
      finishQuestion();
      const de = pathSegments(heading[2]);
      result.categories.push({ line: number, de, en: null });
      category = result.categories.length - 1;
      header = { kind: "category", expect: ["en"], line: number };
      return;
    }
    if (heading && heading[1].length === 2) {
      finishQuestion();
      question = { line: number, categoryIndex: category, nameDe: heading[2].trim(), nameEn: "", type: null, solution: null, de: null, en: null };
      if (category === null) {
        add(number, question.nameDe, "This question has no category above it. Put a category heading `# <German path>` before the first question.");
        question.broken = true;
      }
      header = { kind: "question", expect: ["en", "type"], line: number };
      return;
    }
    if (heading && heading[1].length === 3 && /^(de|en)$/.test(heading[2].trim()) && question) {
      const language = heading[2].trim();
      finishSection();
      if (question[language]) {
        add(number, question.nameDe, `The section \`### ${language}\` appears twice.`);
        question.broken = true;
      } else if (language === "en" && !question.de) {
        add(number, question.nameDe, "The section `### en` comes before `### de`. Write the German section first.");
        question.broken = true;
      }
      section = { language, line: number, lines: [] };
      return;
    }

    if (section) {
      if (fenceOpening(line)) fence = fenceOpening(line);
      section.lines.push({ number, text: line });
      return;
    }
    if (line.trim() === "") return;
    if (heading) {
      add(number, question?.nameDe ?? null, `The heading "${line.trim()}" is not part of the format. Only \`#\` (category), \`##\` (question) and \`### de\` / \`### en\` are.`);
    } else if (question) {
      add(number, question.nameDe, "This line is outside a `### de` or `### en` section.");
    } else {
      add(number, null, category === null ? "This line is outside any category. The file starts with a category heading `# <German path>`." : "This line is outside any question. A question starts with `## <German short title>`.");
    }
  });
  finishCategoryHeader();
  finishQuestion();
  return result;
}

/** A category path as one string, segments joined by " / ". */
export function pathText(segments) {
  return segments.join(" / ");
}

/** A text compared for near duplicates: its words, lowercased, whitespace collapsed. */
function comparable(html) {
  return plainText(html).toLowerCase().replace(/\s+/g, " ");
}

/** Every existing category by its German path. */
function categoriesByPath(db) {
  const byPath = new Map();
  const walk = (nodes, de, en) => {
    for (const node of nodes) {
      const pathDe = [...de, node.nameDe];
      const pathEn = [...en, node.nameEn];
      byPath.set(pathText(pathDe), { id: node.id, de: pathDe, en: pathEn });
      walk(node.children, pathDe, pathEn);
    }
  };
  walk(categoryTree(db), [], []);
  return byPath;
}

/** The import a file's hash names, or null. */
function importWithHash(db, sha256) {
  return db.prepare("SELECT id, imported_at AS importedAt, imported_by AS importedBy, file_name AS fileName FROM question_import WHERE sha256 = ?").get(sha256) ?? null;
}

/** A date as the module's pages write it, 17.10.2026. */
function dayOf(iso) {
  return new Date(iso).toLocaleDateString("de-AT", { timeZone: "Europe/Vienna", day: "2-digit", month: "2-digit", year: "numeric" });
}

/** The SHA-256 of a file's text. */
export function fileHash(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

/** What the editor's `questionProblems` names, mapped to the line of the field. */
function editorLine(question, { field, answer }) {
  const language = field.endsWith("En") ? "en" : "de";
  if (answer !== null) return question[language]?.answers[answer - 1]?.line ?? question[language]?.line ?? question.line;
  if (field === "nameDe") return question.line;
  if (field === "nameEn") return question.enLine ?? question.line;
  if (field === "textDe" || field === "textEn") return question[language]?.line ?? question.line;
  if (field === "type") return question.typeLine ?? question.line;
  return question.line;
}

/** A parsed question as the editor's input. */
function editorInput(question, categoryId) {
  const answers =
    question.type === "truefalse"
      ? [
          { textDe: trueFalseText.de.true, textEn: trueFalseText.en.true, correct: question.solution === true },
          { textDe: trueFalseText.de.false, textEn: trueFalseText.en.false, correct: question.solution === false },
        ]
      : question.de.answers.map((answer, index) => ({
          textDe: answer.html,
          textEn: question.en.answers[index]?.html ?? "",
          correct: answer.correct,
        }));
  return {
    type: question.type,
    categoryId,
    nameDe: question.nameDe,
    nameEn: question.nameEn,
    textDe: question.de.html,
    textEn: question.en.html,
    answers,
  };
}

/** `x - x -`: which answers are marked correct. */
function pattern(answers) {
  return answers.map((answer) => (answer.correct ? "x" : "-")).join(" ");
}

/**
 * Checks an import file (design D4): the parser's problems, the editor's rules
 * for every question, the pairing of the languages, the hint with the number
 * of correct answers, the category paths, the limits, and whether exactly this
 * file was imported before. Answers `{ problems, plan }`, problems sorted by
 * line; `plan` is null unless the file is clean.
 */
export function checkQuestionFile(db, text, fileName = "") {
  const raw = String(text ?? "");
  if (Buffer.byteLength(raw, "utf8") > fileLimitBytes) {
    return { problems: [{ line: 1, question: null, message: "The file is larger than 1 MB. Split it into several files." }], plan: null };
  }
  if (raw.replace(/^﻿/, "").trim() === "") {
    return { problems: [{ line: 1, question: null, message: "The file is empty." }], plan: null };
  }
  const parsed = parseQuestionFile(raw);
  const problems = [...parsed.problems];
  const add = (line, question, message) => problems.push({ line, question, message });

  if (parsed.problems.length === 0 && parsed.questions.length === 0) add(1, null, "The file holds no question.");
  if (parsed.questions.length > questionLimit) {
    add(parsed.questions[questionLimit].line, null, `The file holds ${parsed.questions.length} questions; one import takes at most ${questionLimit}. Split it into several files.`);
  }

  // Category paths: the same depth in both languages, names that fit, and
  // one English path per German one.
  const englishOf = new Map();
  for (const node of parsed.categories) {
    if (node.broken || node.en === null) continue;
    const de = pathText(node.de);
    if (node.de.some((segment) => segment === "") || node.en.some((segment) => segment === "")) {
      add(node.line, null, `The category path "${de}" has an empty segment. Separate the names with " / ".`);
    } else if (node.de.length !== node.en.length) {
      add(node.enLine, null, `The German path has ${node.de.length} segment${node.de.length === 1 ? "" : "s"}, the English one ${node.en.length}. Both name the same categories, separated by " / ".`);
    } else if ([...node.de, ...node.en].some((segment) => segment.length > nameLimit)) {
      add(node.line, null, `A category's name is at most ${nameLimit} characters.`);
    } else if (englishOf.has(de) && englishOf.get(de).text !== pathText(node.en)) {
      add(node.enLine, null, `The category "${de}" is named "${englishOf.get(de).text}" in English on line ${englishOf.get(de).line}, and "${pathText(node.en)}" here. Use one English path for it.`);
    } else if (!englishOf.has(de)) {
      englishOf.set(de, { text: pathText(node.en), line: node.enLine });
    }
  }

  // The editor's rules, with a category of the pool standing in: where a
  // question goes is the plan's business, not the editor's.
  const anyCategory = db.prepare("SELECT id FROM question_category LIMIT 1").get()?.id ?? -1;
  for (const question of parsed.questions) {
    if (question.broken || !question.de || !question.en || question.type === null) continue;
    const input = editorInput(question, anyCategory);
    for (const found of questionProblems(db, input, null)) {
      if (found.field === "categoryId") continue;
      add(editorLine(question, found), question.nameDe, found.message);
    }
    if (question.type === "truefalse") continue;

    // Pairing: the same number of answers with the same marks.
    const de = question.de.answers;
    const en = question.en.answers;
    if (de.length !== en.length) {
      add(question.en.line, question.nameDe, `The German section has ${de.length} answers (${pattern(de)}), the English one ${en.length} (${pattern(en)}). Both need the same answers in the same order.`);
    } else if (pattern(de) !== pattern(en)) {
      add(question.en.line, question.nameDe, `The German answers are marked \`${pattern(de)}\`, the English ones \`${pattern(en)}\`. Both need the same answers in the same order with the same marks.`);
    }

    // The hint with the number of correct answers.
    for (const language of ["de", "en"]) {
      const section = question[language];
      const correct = section.answers.filter((answer) => answer.correct).length;
      const hint = hintPattern[language].exec(plainText(section.html).trim());
      const name = languageNames[language];
      if (question.type === "multichoiceset") {
        if (!hint) {
          add(section.line, question.nameDe, `The ${name} question text does not end with the number of correct answers. End it with "${hintText(language, correct)}".`);
        } else if (Number(hint[1]) !== correct) {
          add(section.line, question.nameDe, `The ${name} hint says ${hint[1]}, but ${correct} answer${correct === 1 ? " is" : "s are"} marked correct.`);
        }
      } else if (hint && Number(hint[1]) !== 1) {
        add(section.line, question.nameDe, `The ${name} hint says ${hint[1]}, but a multichoice question has exactly 1 correct answer. End it with "${hintText(language, 1)}".`);
      }
    }
  }

  const earlier = importWithHash(db, fileHash(raw));
  if (earlier) {
    add(1, null, `Exactly this file was imported on ${dayOf(earlier.importedAt)} by ${earlier.importedBy} (as "${earlier.fileName}"). Take that import back first to import it again.`);
  }

  problems.sort((a, b) => a.line - b.line);
  return { problems, plan: problems.length === 0 ? planOf(db, parsed) : null, parsed };
}

/**
 * The preview of a clean file (design D4): per category of the file its path,
 * whether it exists, and its questions per type; the categories that will be
 * created, parents first; and the questions whose German text equals one in
 * the pool.
 */
function planOf(db, parsed) {
  const existing = categoriesByPath(db);
  const categories = new Map();
  const created = new Map();
  for (const question of parsed.questions) {
    const node = parsed.categories[question.categoryIndex];
    const key = pathText(node.de);
    if (!categories.has(key)) {
      categories.set(key, {
        pathDe: key,
        pathEn: pathText(node.en),
        existingId: existing.get(key)?.id ?? null,
        counts: Object.fromEntries(questionTypes.map((type) => [type, 0])),
        questions: 0,
      });
      node.de.forEach((_, depth) => {
        const prefix = pathText(node.de.slice(0, depth + 1));
        if (!existing.has(prefix) && !created.has(prefix)) {
          created.set(prefix, { pathDe: prefix, pathEn: pathText(node.en.slice(0, depth + 1)), parentDe: depth === 0 ? null : pathText(node.de.slice(0, depth)) });
        }
      });
    }
    const entry = categories.get(key);
    entry.counts[question.type] += 1;
    entry.questions += 1;
  }

  const byText = new Map();
  for (const row of db.prepare("SELECT id, name_de AS nameDe, text_de AS textDe, retired FROM question ORDER BY id").all()) {
    const key = comparable(row.textDe);
    if (!byText.has(key)) byText.set(key, { id: row.id, nameDe: row.nameDe, retired: row.retired === 1 });
  }
  const nearDuplicates = parsed.questions
    .filter((question) => byText.has(comparable(question.de.html)))
    .map((question) => ({ line: question.line, question: question.nameDe, existing: byText.get(comparable(question.de.html)) }));

  return {
    questions: parsed.questions.length,
    counts: Object.fromEntries(questionTypes.map((type) => [type, parsed.questions.filter((question) => question.type === type).length])),
    categories: [...categories.values()],
    newCategories: [...created.values()],
    nearDuplicates,
  };
}

/**
 * Imports a clean file (design D5): checks it again and, in one transaction,
 * records the import, creates the missing categories along each German path,
 * adds every question at the end of its category marked as not reviewed, and
 * stores the report. A file with any problem is refused with all of them, and
 * nothing is written.
 */
export function importQuestionFile(db, text, { fileName = "", username }) {
  const raw = String(text ?? "");
  const name = String(fileName ?? "").trim().slice(0, nameLimit) || "questions.md";
  return inTransaction(db, () => {
    const { problems, plan, parsed } = checkQuestionFile(db, raw, name);
    if (problems.length > 0) throw new QuestionProblemsError(problems);

    const { id: importId } = db
      .prepare("INSERT INTO question_import (imported_at, imported_by, file_name, sha256, report) VALUES (?, ?, ?, ?, '{}') RETURNING id")
      .get(now(), username, name, fileHash(raw));

    const ids = new Map([...categoriesByPath(db)].map(([key, node]) => [key, node.id]));
    const createdIds = [];
    const categoryOf = (node) => {
      let parentId = null;
      node.de.forEach((segment, depth) => {
        const key = pathText(node.de.slice(0, depth + 1));
        if (!ids.has(key)) {
          ids.set(key, insertCategory(db, { parentId, nameDe: segment, nameEn: node.en[depth] }));
          createdIds.push(ids.get(key));
        }
        parentId = ids.get(key);
      });
      return parentId;
    };

    for (const question of parsed.questions) {
      const categoryId = categoryOf(parsed.categories[question.categoryIndex]);
      insertQuestion(db, editorInput(question, categoryId), { importId, unreviewed: true });
    }

    const report = { ...plan, createdCategoryIds: createdIds };
    db.prepare("UPDATE question_import SET report = ? WHERE id = ?").run(JSON.stringify(report), importId);
    return { id: importId, questions: plan.questions, newCategories: plan.newCategories.length };
  });
}

/**
 * The past imports, newest first: who, when, which file, how many of their
 * questions are still in the pool and not reviewed yet, and whether one of
 * them is in a test, which keeps the import from being taken back.
 */
export function listImports(db) {
  return db
    .prepare(
      `SELECT i.id, i.imported_at AS importedAt, i.imported_by AS importedBy, i.file_name AS fileName,
         (SELECT COUNT(*) FROM question q WHERE q.import_id = i.id) AS questions,
         (SELECT COUNT(*) FROM question q WHERE q.import_id = i.id AND q.unreviewed = 1) AS unreviewed,
         (SELECT COUNT(*) FROM question q WHERE q.import_id = i.id AND (
            EXISTS (SELECT 1 FROM question_usage u WHERE u.question_id = q.id) OR
            EXISTS (SELECT 1 FROM test_question t WHERE t.question_id = q.id))) AS used
       FROM question_import i ORDER BY i.imported_at DESC, i.id DESC`
    )
    .all()
    .map(({ used, ...row }) => ({ ...row, inUse: used > 0 }));
}

/**
 * Takes an import back (design D10): refused, naming them, while any of its
 * questions is in a test; otherwise deletes its questions - retired ones too -
 * then the categories it created that are empty again, deepest first, and last
 * its record, so the same file is accepted again.
 */
export function takeBackImport(db, id) {
  const row = db.prepare("SELECT id, report FROM question_import WHERE id = ?").get(id);
  if (!row) throw new NotFoundError("There is no such import.");
  return inTransaction(db, () => {
    const used = db
      .prepare(
        `SELECT q.name_de AS nameDe FROM question q WHERE q.import_id = ? AND (
           EXISTS (SELECT 1 FROM question_usage u WHERE u.question_id = q.id) OR
           EXISTS (SELECT 1 FROM test_question t WHERE t.question_id = q.id))
         ORDER BY q.id`
      )
      .all(id)
      .map((question) => `"${question.nameDe}"`);
    if (used.length > 0) {
      throw new ConflictError(
        `This import cannot be taken back: ${used.length === 1 ? "its question" : `${used.length} of its questions`} ${used.join(", ")} ${used.length === 1 ? "is" : "are"} in a test.`
      );
    }
    const questions = Number(db.prepare("DELETE FROM question WHERE import_id = ?").run(id).changes);

    const created = JSON.parse(row.report).createdCategoryIds ?? [];
    const depth = db.prepare(
      `WITH RECURSIVE up (id, parent_id, depth) AS (
         SELECT id, parent_id, 0 FROM question_category WHERE id = ?
         UNION ALL SELECT c.id, c.parent_id, up.depth + 1 FROM question_category c JOIN up ON c.id = up.parent_id
       ) SELECT MAX(depth) AS depth FROM up`
    );
    const removable = db.prepare(
      `DELETE FROM question_category WHERE id = ?
         AND NOT EXISTS (SELECT 1 FROM question WHERE category_id = ?)
         AND NOT EXISTS (SELECT 1 FROM question_category WHERE parent_id = ?)`
    );
    let categories = 0;
    for (const categoryId of created
      .map((categoryId) => ({ categoryId, depth: depth.get(categoryId)?.depth }))
      .filter((entry) => entry.depth !== null && entry.depth !== undefined)
      .sort((a, b) => b.depth - a.depth)
      .map((entry) => entry.categoryId)) {
      categories += Number(removable.run(categoryId, categoryId, categoryId).changes);
    }

    db.prepare("DELETE FROM question_import WHERE id = ?").run(id);
    return { deleted: id, questions, categories };
  });
}

/**
 * The format description as a teacher downloads it (design D2): the file in
 * the repository with the section "Existing categories" listing the pool's
 * tree at this moment, German path, an em dash, English path.
 */
export function formatDescription(db) {
  const description = fs.readFileSync(formatDescriptionPath, "utf8");
  const lines = [...categoriesByPath(db).values()].map((node) => `- ${pathText(node.de)} — ${pathText(node.en)}`);
  const tree = lines.length > 0 ? lines.join("\n") : "The pool has no categories yet. Create the ones the questions need.";
  return description.replace(/<!-- categories -->[\s\S]*?<!-- \/categories -->/, tree);
}
