import fs from "fs";
import readline from "readline";
import path from "path";
import pako from "pako";
import { v4 as uuidv4 } from "uuid";
import { JSDOM } from "jsdom";
import { hasSomeRoles } from "./utils.js";
import * as lucideIcons from "lucide-static";

const internalTags = {
  callout: {
    string: {
      start: "<calloutstart/>",
      end: "<calloutend/>",
    },
    regexp: {
      start: "<calloutstart/>",
      end: "<calloutend/>",
    },
  },
};
const internalSubstitutions = {
  code: {
    string: "@#@##@@--@code@--@@##@#@",
    regexp: /@#@##@@--@code@--@@##@#@/gms,
  },
};
let codeList = [];

export const callouts = {
  note: {
    icon: "Pencil",
    color: "#086ddd",
  },
  abstract: {
    icon: "ClipboardList",
    color: "#00bfbc",
  },
  summary: { link: "abstract" },
  tldr: { link: "abstract" },
  info: {
    icon: "Info",
    color: "#086ddd",
  },
  todo: {
    icon: "CheckCircle2",
    color: "#086ddd",
  },
  tip: {
    icon: "Flame",
    color: "#00bfbc",
  },
  hint: { link: "tip" },
  important: { link: "tip" },
  success: {
    icon: "Check",
    color: "#08b94e",
  },
  done: { link: "success" },
  check: { link: "success" },
  question: {
    icon: "HelpCircle",
    color: "#ec7500",
  },
  help: { link: "question" },
  faq: { link: "question" },
  warning: {
    icon: "AlertTriangle",
    color: "#ec7500",
  },
  caution: { link: "warning" },
  attention: { link: "warning" },
  failure: {
    icon: "X",
    color: "#e93147",
  },
  fail: { link: "failure" },
  missing: { link: "failure" },
  danger: {
    icon: "Zap",
    color: "#e93147",
  },
  error: { link: "danger" },
  bug: {
    icon: "Bug",
    color: "#e93147",
  },
  example: {
    icon: "List",
    color: "#7852ee",
  },
  quote: {
    icon: "Quote",
    color: "#9e9e9e",
  },
  cite: { link: "quote" },
};

// Datastructures to store the file paths.
// Key is the file-name without path (and no extension for the md-file-list).
// Value is an array of the relative paths to all the files with that name anywhere in the file-system.
// If there is only one file with that name, the array will contain only one element.
export let dirPrefix = "";
export const mdFilesMap = {};
export const filesMap = {};
export const mdFilesDir = {};
export const mdFilesDirOnHdd = {};
export let mdFilesDirStructure = {};
export const mainFonts = {};
export const mainFontsArray = [];
export const navFonts = {};
export const navFontsArray = [];
export let contentMap = {};

export function parseFirstLineForPermissions(line) {
  const match = line.match(/^\s*@@@(.*)/);
  let r = null;
  if (match) {
    r = [];
    const s = match[1];
    s.split(",").forEach((p) => {
      r.push(p.trim().toLowerCase());
    });
  }
  return r;
}

function getPermissionsFor(path) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(path);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let r;
    const lineReader = (line) => {
      r = parseFirstLineForPermissions(line);
      if (r === null) {
        r = [];
      }
      // Since we only want the first line, we remove the listener after the first iteration
      rl.removeListener("line", lineReader);
    };

    rl.on("line", lineReader);

    rl.on("close", () => {
      resolve(r);
    });

    rl.on("error", (err) => {
      reject(err);
    });
  });
}

function makeSafeForCSS(name) {
  return name.replace(/[^a-z0-9]/g, function (s) {
    var c = s.charCodeAt(0);
    if (c == 32) return "-";
    if (c >= 65 && c <= 90) return "_" + s.toLowerCase();
    return "__" + ("000" + c.toString(16)).slice(-4);
  });
}

export async function scanFonts(dir, root = dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    try {
      if (dir && file) {
        // Check if dir and file are not null
        const filePath = path.join(dir, file);
        const isDirectory = fs.statSync(filePath).isDirectory();
        if (isDirectory) {
          const nmods = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/node_modules"
            : "node_modules";
          const slides = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/slides"
            : "slides";
          if (
            filePath.startsWith(".") ||
            filePath.startsWith(nmods) ||
            filePath.startsWith(slides)
          )
            continue;
          scanFonts(filePath, root);
        } else {
          // All other files.
          const fileName = path.basename(file);
          const relativePath = path.relative(root, filePath);
          const p = relativePath.replace(/\\/g, "/");
          if (p.startsWith("main-fonts/")) {
            const fontName = path.basename(file, ".ttf");
            mainFonts[fontName] = "assets/" + p;
            mainFontsArray.push(fontName);
          }
          if (p.startsWith("nav-fonts/")) {
            const fontName = path.basename(file, ".ttf");
            navFonts[fontName] = "assets/" + p;
            navFontsArray.push(fontName);
          }
        }
      }
    } catch (err) {
      console.error(`Error reading file while scanning fonts ${file}`, err);
    }
  }
}

/**
 * If it's the root dir, dirPrefix should be an empty string.
 */
export async function scanFiles(prefix, dir, root = dir) {
  dirPrefix = prefix;
  scanFilesInternal(dir, root);
  let mdFiles = await Promise.all(
    Object.keys(mdFilesDir).map(async (file) => {
      const pwe = mdFilesDir[file];
      const folders = pwe.split("/").slice(0, -1).join("/");
      const folderArray = folders.split("/");
      if (folderArray.length === 1 && folderArray[0] === "") {
        folderArray.pop();
      }
      return {
        [file]: {
          path: file,
          pathWithoutExt: pwe,
          folders: folders,
          folderArray: folderArray,
          depth: folders === "" ? 0 : folders.split("/").length,
          fileName: file.split("/").pop(),
          fileNameWithoutExtension: pwe.split("/").pop().split(".")[0],
          lastFolder: pwe.split("/").slice(-2, -1)[0] || "",
          cssName: makeSafeForCSS(folders),
          permissions: await getPermissionsFor(dirPrefix + file),
        },
      };
    })
  );

  mdFiles = mdFiles.reduce((acc, file) => {
    const key = Object.keys(file)[0];
    acc[key] = file[key];
    return acc;
  }, {});

  // Convert to array, sort, and convert back to object
  mdFiles = Object.entries(mdFiles)
    .sort(([keyA, valueA], [keyB, valueB]) => {
      // Iterate over the folderArray
      for (
        let i = 0;
        i < Math.min(valueA.folderArray.length, valueB.folderArray.length);
        i++
      ) {
        const comp = valueA.folderArray[i].localeCompare(
          valueB.folderArray[i],
          undefined,
          { sensitivity: "base" }
        );
        if (comp !== 0) {
          // If a difference is found, return the comparison result
          return comp;
        }
      }
      // If all elements are equal, compare the lengths of the arrays
      if (valueA.folderArray.length !== valueB.folderArray.length) {
        return valueB.folderArray.length - valueA.folderArray.length;
      }
      // If the folderArrays are equal, compare the name
      return valueA.fileName.localeCompare(valueB.fileName, undefined, {
        sensitivity: "base",
      });
    })
    .reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});

  mdFilesDirStructure = mdFiles;
}

function scanFilesInternal(dir, root = dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    try {
      if (dir && file) {
        // Check if dir and file are not null
        const filePath = path.join(dir, file);
        const isDirectory = fs.statSync(filePath).isDirectory();

        if (isDirectory) {
          const nmods = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/node_modules"
            : "node_modules";
          const slides = process.env.NEXT_PUBLIC_IS_APP_FOLDER
            ? "/app/slides"
            : "slides";
          if (
            filePath.startsWith(".") ||
            filePath.startsWith(nmods) ||
            filePath.startsWith(slides)
          )
            continue;
          scanFilesInternal(filePath, root);
        } else if (path.extname(file) === ".md") {
          // MD files.
          const fileNameWithoutExt = path.basename(file, ".md");
          const relativePath = path.relative(root, filePath);
          const p = relativePath.replace(/\\/g, "/");
          // MD files.
          const dirPathWithoutFileName = path.dirname(relativePath);
          let p2 = dirPathWithoutFileName.replace(/\\/g, "/");
          p2 = p2 + "/" + fileNameWithoutExt;
          if (p2.startsWith("./")) {
            p2 = p2.slice(2);
          }
          mdFilesDir[p] = p2;
          if (mdFilesMap[fileNameWithoutExt]) {
            mdFilesMap[fileNameWithoutExt].push(p);
          } else {
            mdFilesMap[fileNameWithoutExt] = [p];
          }
        } else {
          // All other files.
          const fileName = path.basename(file);
          const relativePath = path.relative(root, filePath);
          const p = relativePath.replace(/\\/g, "/");
          if (filesMap[fileName]) {
            filesMap[fileName].push(p);
          } else {
            filesMap[fileName] = [p];
          }
          if (p.startsWith("assets/main-fonts/")) {
            const fontName = path.basename(file, ".ttf");
            mainFonts[fontName] = p;
            mainFontsArray.push(fontName);
          }
          if (p.startsWith("assets/nav-fonts/")) {
            const fontName = path.basename(file, ".ttf");
            navFonts[fontName] = p;
            navFontsArray.push(fontName);
          }
        }
      }
    } catch (err) {
      console.error(`Error reading file ${file}`, err);
    }
  }
}

export function lucideIcon(name, color, size = 18) {
  let svg = lucideIcons[name];
  svg = svg.replace('width="24"', `width="${size}"`);
  svg = svg.replace('height="24"', `height="${size}"`);
  return `<span style="color: ${color};">${svg}</span>`;
}

export async function preParse(md, req) {
  let r = md;
  r = await preReplacePlantUml(r, req);
  r = preMarkCode(r);
  r = preReplaceObsidianFileLinks(r, req);
  r = await removeForbiddenContent(r, req);
  r = preMarkCallouts(r);
  r = unmarkCode(r);
  return r;
}

async function removeForbiddenContent(md, req) {
  const regex = /^[ \t]*@@@(.*?)\n([\s\S]*?)@@@/gms;
  const matches = Array.from(md.matchAll(regex));
  const replacements = await Promise.all(
    matches.map(([match, perms, content]) => {
      const permissions = perms.split(",").map((p) => p.trim().toLowerCase());
      return hasSomeRoles(req, permissions, true).then((r) =>
        r ? content : ""
      );
    })
  );
  for (let i = 0; i < matches.length; i++) {
    md = md.replace(matches[i][0], replacements[i]);
  }
  return md;
}

function preMarkCode(md) {
  let regex = /^[ \t]*```(.*?)\n([\s\S]*?)```/gms;
  let match;
  let r = md;
  codeList = [];
  while ((match = regex.exec(r)) !== null) {
    const string = `\`\`\`${match[1].toLowerCase()}\n${match[2]}\`\`\``;
    codeList.push(string);
    r = r.replace(match[0], internalSubstitutions.code.string);
    regex = /^[ \t]*```(.*?)\n([\s\S]*?)```/gms;
  }
  return r;
}

function unmarkCode(md) {
  let c = 0;
  return md.replace(internalSubstitutions.code.regexp, () => {
    return codeList[c++];
  });
}

function preMarkCallouts(md) {
  const regex = />[\s]*\[!(.*?)\].*?\n/gs;
  let match;
  let markedMd = md;
  let offset = 0;
  while ((match = regex.exec(md)) !== null) {
    const { trimmedLines, originalLength } = getFollowingQuotedLines(
      md,
      match.index + match[0].length
    );
    const markedLines = `${internalTags.callout.string.start}\n\n${match[0]
      .trim()
      .substring(1)
      .trim()}\n${trimmedLines}\n\n${internalTags.callout.string.end}\n\n`;
    const originalSectionLength = match[0].length + originalLength; // originalLength already includes the newline
    markedMd =
      markedMd.slice(0, match.index + offset) +
      markedLines +
      markedMd.slice(match.index + originalSectionLength + offset);
    offset += markedLines.length - originalSectionLength;
  }
  return markedMd;
}

function getFollowingQuotedLines(md, index) {
  const lines = md.slice(index).split("\n");
  let i = 0;
  let originalLength = 0;
  while (i < lines.length && lines[i].trim().startsWith(">")) {
    originalLength += lines[i].length + 1; // +1 for the newline
    lines[i] = lines[i].substring(lines[i].indexOf(">") + 1); // remove leading ">"
    i++;
  }
  return { trimmedLines: lines.slice(0, i).join("\n"), originalLength };
}

function preReplaceObsidianFileLinks(html, req) {
  const regex = /(?<!\!)\[\[([^\]\n]+)\]\]/g;

  return html.replace(regex, (match) => {
    let fileName = match.slice(2, -2);
    let alt = null;
    if (fileName && fileName.includes("|")) {
      const parts = fileName.split("|");
      fileName = parts[0].trim();
      alt = parts[1].trim();
      if (alt === "") {
        alt = null;
      }
    }
    const lastPartOfFileName = fileName.split("/").pop();
    const filePath = mdFilesMap[lastPartOfFileName];
    if (filePath) {
      let f = filePath[0];
      if (filePath.length > 1) {
        f = filePath.find((path) => path === fileName + ".md");
        if (!f) {
          return match;
        }
        f = f.split(0, -3);
      }
      f = encodeURIComponent(f);
      const serverUrl = `${req.protocol}://${req.get("host")}`;
      return `[${alt ? alt : fileName}](${serverUrl}/${dirPrefix + f})`;
    } else {
      return match;
    }
  });
}

export async function preReplacePlantUml(md, req) {
  let regex = /^\s*```+\s*(plantuml)$/gim;
  let match;
  while ((match = regex.exec(md)) !== null) {
    // PlantUML
    const start = match.index + match[0].length;
    const end = md.indexOf("```", start);
    const plantuml = md.substring(start, end);
    let serverUrl = process.env.NEXT_PUBLIC_PLANTUML_URL;
    if (serverUrl === undefined || serverUrl === null || serverUrl === "") {
      serverUrl = `https://plantuml.unterrainer.info/plantuml`;
    }

    // Encode in UTF-8, compress using Deflate, and reencode in ASCII
    const compressed = pako.deflate(plantuml, { to: "string" });
    const encoded = toPlantUmlEncoding(compressed);

    const url = `${serverUrl}/svg/${encoded}`;
    const img = `![PlantUML](${url})`;
    md = md.substring(0, match.index) + img + md.substring(end + 3);
    regex = /^\s*```+\s*(plantuml)$/gim;
  }
  return md;
}

function toPlantUmlEncoding(buffer) {
  const dictionary =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";
  let result = "";
  let current = 0;
  let remaining = 0;
  for (const byte of buffer) {
    current = (current << 8) | byte;
    remaining += 8;
    while (remaining >= 6) {
      remaining -= 6;
      const index = (current >> remaining) & 0x3f;
      result += dictionary[index];
    }
  }
  if (remaining > 0) {
    result += dictionary[(current << (6 - remaining)) & 0x3f];
  }
  return result;
}

export function manipulateHtml(html, req) {
  let r = html;
  r = replacePreMarkCallouts(r);
  r = replaceObsidianImageLinks(r, req);
  r = replaceObsidianImageAltResizeValues(r);
  r = makeContentMap(r);
  return r;
}

export function splitForReveal(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const sections = [];
  let currentSection = [];

  for (const node of Array.from(document.body.childNodes)) {
    if (node.tagName === "H2") {
      if (currentSection.length > 0) {
        sections.push(splitSubSections(currentSection.join("")));
        currentSection = [];
      }
    }
    currentSection.push(node.outerHTML || node.textContent);
  }

  if (currentSection.length > 0) {
    sections.push(splitSubSections(currentSection.join("")));
  }

  return sections.join("");
}

function splitSubSections(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const subSections = [];
  let currentSubSection = [];

  for (const node of Array.from(document.body.childNodes)) {
    if (node.tagName === "H3") {
      if (currentSubSection.length > 0) {
        subSections.push(currentSubSection.join(""));
        currentSubSection = [];
      }
    }
    currentSubSection.push(node.outerHTML || node.textContent);
  }

  if (currentSubSection.length > 0) {
    subSections.push(currentSubSection.join(""));
  }

  return `<section>${subSections
    .map((subSection) => `<section>${subSection}</section>`)
    .join("")}</section>`;
}

function makeContentMap(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const headers = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
  contentMap = {};

  contentMap["ROOT"] = { text: "TOP", indent: 1 };
  headers.forEach((header) => {
    const guid = uuidv4();
    const indent = parseInt(header.tagName.slice(1));
    contentMap[guid] = { text: header.textContent, indent: indent };
    header.setAttribute("id", guid);
    header.setAttribute("class", "docanchor");
  });
  return `<span id="ROOT" class="docanchor"></span>` + dom.serialize();
}

function replaceObsidianImageAltResizeValues(html) {
  // One regex for alt first, then src, one for the other way around.
  const regex1 = /<img[^>]+alt="(.*?)"[^>]+src="(.*?)"[^>]*>/gi;
  const regex2 = /<img[^>]+src="(.*?)"[^>]+alt="(.*?)"[^>]*>/gi;
  let r = html.replace(regex1, (match, alt, src) => {
    return insertObsidianImageAltResizeValues(match, alt, src);
  });
  r = r.replace(regex2, (match, src, alt) => {
    return insertObsidianImageAltResizeValues(match, alt, src);
  });
  return r;
}

function insertObsidianImageAltResizeValues(match, alt, src) {
  if (alt && alt.includes("|")) {
    const r = parseWidthHeight(alt);
    return `<img alt="${r ? r.name : alt}" src="${src}" style="${
      r ? `width: ${r.width}; height: ${r.height}` : ""
    }" />`;
  }
  return match;
}

function parseWidthHeight(input) {
  const parts = input.split("|");
  const name = parts[0];
  let width = "100%";
  let height = "auto";
  if (parts.length > 1) {
    // something|100x200 or something|100
    const s = parts[1].split("x");
    if (s.length === 2) {
      // something|100x200
      width = isNaN(s[0]) ? s[0] : s[0] + "px";
      height = isNaN(s[1]) ? s[1] : s[1] + "px";
    } else {
      // something|100
      width = isNaN(s[0]) ? s[0] : s[0] + "px";
    }

    return { name, width, height };
  }
  return null;
}

function replaceObsidianImageLinks(html, req) {
  const regex = /!\[\[(.*?)\]\]/g;

  return html.replace(regex, (match) => {
    let fileName = match.slice(3, -2);
    const r = parseWidthHeight(fileName);
    if (r) {
      fileName = r.name;
    }
    const lastPartOfFileName = fileName.split("/").pop();
    const filePath = filesMap[lastPartOfFileName];
    if (filePath) {
      let f = filePath[0];
      if (filePath.length > 1) {
        f = filePath.find((path) => path === fileName);
        if (!f) {
          return match;
        }
      }
      const serverUrl = `${req.protocol}://${req.get("host")}`;
      return `<img alt="${fileName}" src="${serverUrl}/${
        dirPrefix + f
      }" style="${r ? `width: ${r.width}; height: ${r.height};` : ""}" />`;
    } else {
      return match;
    }
  });
}

function replacePreMarkCallouts(html) {
  const regex = new RegExp(
    `${internalTags.callout.regexp.start}([\\s\\S]*?)${internalTags.callout.regexp.end}`,
    "gi"
  );
  return html.replace(regex, (match, s) => {
    const lines = s.split(/\s*(\n|<br\s*\/?>)\s*/);
    const ls = lines.filter((l) => l.trim().length > 0);
    // First line hold the info about the callout type, collapsable, and caption.
    let n = ls[0];
    if (n.startsWith("<p>")) {
      n = n.slice(3);
    }
    if (n.endsWith("</p>")) {
      n = n.slice(0, -4);
    }
    if (ls[ls.length - 1].endsWith("</p>")) {
      ls[ls.length - 1] = ls[ls.length - 1].slice(0, -4);
    }
    const calloutRegex = /\[!(.*?)\](.*)/;
    const [, type, caption] = n.match(calloutRegex) || [];
    const content = ls.slice(1).join("\n");
    let callout = callouts[type.toLowerCase()];
    if (!callout) return match;
    let t = type;
    while (callout.link) {
      t = callout.link;
      callout = callouts[t];
    }
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (caption.length > 0) {
      t = caption;
    }
    let collapsable = false;
    if (t.startsWith("-")) {
      t = t.slice(1).trim();
      collapsable = true;
    }
    return `<div class="obsidian-callout${
      collapsable ? " obsidian-collapsable" : ""
    }" style="
      background-color: ${callout.color + "1a"};
      ">
        <div class="row obsidian-collapsable-trigger"
        style="cursor: ${collapsable ? "pointer" : "default"}"
        >
          <div class="col obsidian-callout-icon">${lucideIcon(
            callout.icon,
            callout.color
          )}</div>
          <div class="col obsidian-callout-title" style="color: ${
            callout.color
          };">${t}</div>
          ${
            collapsable
              ? `<div class="col obsidian-callout-chevron" style="color: ${
                  callout.color
                };">${lucideIcon("ChevronRight", callout.color)}</div>`
              : ""
          }
        </div>
        <div class="${
          collapsable ? "collapsable " : ""
        }obsidian-callout-content" style="${
      content ? "" : "display: none; overflow: hidden;"
    }">${content || ""}</div>
      </div>`;
  });
}

function indentStringFor(indent) {
  let r = "";
  for (let j = 0; j < indent; j++) {
    r += "&nbsp;&nbsp;";
  }
  return r;
}

function findFirstDifferentIndex(arr1, arr2) {
  for (let i = 0; i < Math.min(arr1.length, arr2.length); i++) {
    if (arr1[i] !== arr2[i]) {
      return i;
    }
  }
  // If no difference was found but the arrays are of different lengths
  if (arr1.length !== arr2.length) {
    return Math.min(arr1.length, arr2.length);
  }
  // If no difference was found and the arrays are of the same length
  return -1;
}

async function getDirectoryListing(req) {
  const allFiles = Object.values(mdFilesDirStructure);
  const files = await Promise.all(
    allFiles.map(async (f) => {
      const hasRole = await hasSomeRoles(req, f.permissions, true);
      return hasRole ? f : null;
    })
  );
  const filteredFiles = files.filter((f) => f !== null);
  let r = await getDirectoryListingInternal(req, filteredFiles, []);
  if (filteredFiles[filteredFiles.length - 1].folders.length > 0) {
    r += `</div></div>`;
  }
  return r;
}

async function getDirectoryListingInternal(req, files, folders) {
  let html = "";
  let lastProcessedFileIndex = -1;
  let lastFile = null;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    lastFile = file;
    const diffIndex = findFirstDifferentIndex(file.folderArray, folders);
    if (diffIndex > -1) {
      // New folder section
      if (folders.length > diffIndex) {
        // Close not needed folder sections
        for (let j = folders.length - 1; j >= diffIndex; j--) {
          html += `</div></div>`;
        }
      }
      // Open as many folders as needed to reach the new folder
      for (let j = diffIndex; j < file.folderArray.length; j++) {
        const folder = file.folderArray[j];
        html += insertDirFolder(folder, j);
      }
      folders = file.folderArray;

      // Add the current file to the new folder section
      html += insertDirLink(file, req, file.folderArray.length, i, files);

      // Recursive call for subfolder
      const subfolderFiles = files.filter(
        (f, index) => f.folders.startsWith(folders) && index > i
      );
      html += await getDirectoryListingInternal(req, subfolderFiles, folders);

      // Update the last processed file index
      lastProcessedFileIndex = i + subfolderFiles.length;
      i = lastProcessedFileIndex; // Skip the files that have been processed
    } else if (i > lastProcessedFileIndex) {
      // Add file to current folder section
      html += insertDirLink(file, req, file.folderArray.length, i, files);
    }
  }
  return html;
}

function insertDirFolder(folder, j) {
  let r = "";
  r += `<div class="folder" style="margin: 0px; padding: 0px;">`;
  r += `<div class="folder-name row" onclick="toggleDirList('ff-${folder}-${j}')" style="cursor: pointer;">${indentStringFor(
    j
  )}${folder}<div class="folder-files ff-${folder}-${j}-chevron" style="
          position: inline-block;
          top: 1px;
          padding: 0px;
          margin: 0px;
          transition: transform 0.3s ease;
        ">${lucideIcon("ChevronRight", null, "12px")}</div></div>`;
  r += `<div class="folder-files ff-${folder}-${j}" style="
          opacity: 1;
          padding-top: 0px;
          max-height: 0;
          overflow: hidden;
          transition: padding 0.3s ease, max-height 0.3s ease, opacity 0.3s ease, visibility 0.3s step-start;
        ">`;
  return r;
}

function insertDirLink(file, req, indent, i, files) {
  let r = "";
  r += `<a href="/${dirPrefix + file.path}" class="${
    "/" + file.path === decodeURIComponent(req.path) ? "highlight" : ""
  }">${indentStringFor(file.lastFolder === "" ? 0 : indent)}${
    file.fileNameWithoutExtension
  }</a>`;
  // Only add <br> if it isn't the last file in the folder
  if (i < files.length - 1 && files[i + 1].folders === file.folders) {
    r += "<br>";
  }
  return r;
}

function getContentListing() {
  const list = Object.keys(contentMap).map((guid) => {
    const o = contentMap[guid];
    let indentation = "&nbsp;".repeat((o.indent - 1) * 2);
    return `${indentation}<a href="#${guid}">${o.text}</a>`;
  });
  return list.join("<br>");
}

function getFontImports() {
  let result = "";
  for (const font in navFonts) {
    const f = navFonts[font];
    result += `
        @font-face {
          font-family: "nav ${font}";
          src: url(/${f.replaceAll(" ", "\\ ")}) format("truetype");
        }
      `;
  }
  for (const font in mainFonts) {
    const f = mainFonts[font];
    result += `
        @font-face {
          font-family: "main ${font}";
          src: url(/${f.replaceAll(" ", "\\ ")}) format("truetype");
        }
      `;
  }
  return result;
}

function getNavFontsSelection() {
  let result = "";
  let c = 0;
  for (const font of navFontsArray) {
    result += `<option value="${c}">${font}</option>
    `;
    c++;
  }
  return result;
}

function getMainFontsSelection() {
  let result = "";
  let c = 0;
  for (const font of mainFontsArray) {
    result += `<option value="${c}">${font}</option>
    `;
    c++;
  }
  return result;
}

async function getTopdownMenu(req) {
  return `
  <div style="padding: 0px; margin: 0px;">
    <button class="sl-button-accent" style="margin-left: 0px;" onclick="window.location.href='/logout'">${lucideIcon(
      "LogOut"
    )}<span style="margin-left: 6px; margin-right: 6px; position: relative; top: -2px;">logout</span></button>
    <button class="sl-button" onclick="toggleLightDark()">${lucideIcon(
      "SunMoon"
    )}<span style="margin-left: 6px; margin-right: 6px; position: relative; top: -2px;">light/dark</span></button>

    <div style="padding: 0px; margin: 0px; margin-top: 10px; width: 95%; text-align: left; display: flex;">
      <span style="top: 1px; position: relative; cursor: pointer;" onclick="navFontChange(4)">${lucideIcon(
        "PanelsTopLeft"
      )}</span>
      <select class="sl-select" style="width: auto; flex-grow: 1;" id="navFontSelect" onchange="navFontChange(this.value)">
        ${getNavFontsSelection()}
      </select>
    </div>
    <div style="padding: 0px; margin: 0px; margin-top: 2px; width: 95%; padding-right: 100px; text-align: left; display: flex;">
      <span style="top: 1px; position: relative; cursor: pointer;" onclick="mainFontChange(0)">${lucideIcon(
        "SquareMenu"
      )}</span>
      <select class="sl-select" style="width: auto; flex-grow: 1;" id="mainFontSelect" onchange="mainFontChange(this.value)">
        ${getMainFontsSelection()}
      </select>
    </div>
  </div>
  <div style="padding: 0px; margin: 0px; margin-left: 0px; margin-top: 10px; margin-bottom: 20px;">
    <div style="padding: 0px; margin: 0px; margin-bottom: 1px; margin-top: 10px; margin-left: 4px;">
      <button class="sl-button button-group-left" onclick="fontSmaller()">${lucideIcon(
        "AArrowDown"
      )}</button>  
      <button class="sl-button-accent button-group-middle" onclick="fontStandard()">${lucideIcon(
        "ALargeSmall"
      )}</button>
      <button class="sl-button button-group-right" onclick="fontBigger()">${lucideIcon(
        "AArrowUp"
      )}</button>
    </div>
    <div style="padding: 0px; margin: 0px; margin-top: 10px; margin-left: 4px;">
      <button class="sl-button button-group-left" onclick="spacingSmaller()">${lucideIcon(
        "Rows4"
      )}</button>
      <button class="sl-button-accent button-group-middle" onclick="spacingStandard()">${lucideIcon(
        "Rows3"
      )}</button>
      <button class="sl-button button-group-right" onclick="spacingBigger()">${lucideIcon(
        "Rows2"
      )}</button>
    </div>
    <div style="padding: 0px; margin: 0px; margin-top: 10px; cursor: pointer;" onclick="toggleStartWithLastPage()">
      <input type="checkbox" id="startWithLastPageCheckbox">remember last visited page</input>
    </div>
    <div class="flipswitch menu" style="display: inline-block; top: 16px; margin-left: 3px;">
      <input checked="" onchange="toggleViewAnswer()" id="answersFs" class="flipswitch-cb" name="flipswitch" type="checkbox">
      <label for="answersFs" class="flipswitch-label">
          <div class="flipswitch-inner answers menu"></div>
          <div class="flipswitch-switch answers menu"></div>
      </label>
    </div>
    ${
      (await hasSomeRoles(req, ["teacher"]))
        ? `<div class="flipswitch menu" style="display: inline-block; top: 16px; margin-top: 12px; margin-left: 3px;">
        <input checked="" onchange="toggleViewExam()" id="examFs" class="flipswitch-cb" name="flipswitch" type="checkbox">
        <label for="examFs" class="flipswitch-label">
            <div class="flipswitch-inner exam menu"></div>
            <div class="flipswitch-switch exam menu"></div>
        </label>
    </div>`
        : ""
    }
  </div>
  `;
}

async function getTopBar(startPage, req) {
  return `
    <button class="sl-button topbar-burger" style="height: 32px; margin: 6px; margin-left: 0px;" onclick="toggleSidebar()">${lucideIcon(
      "Menu"
    )}</button>
    <div class="topbar-title nav-font">${
      req.path !== "/convert/"
        ? decodeURIComponent(
            req.path.startsWith(`/${dirPrefix}`)
              ? req.path.slice(dirPrefix.length + 1)
              : req.path
          )
        : decodeURIComponent(req.query.url)
    }</div>
    <div class="topbar-menu">
      ${
        (await hasSomeRoles(req, ["teacher"]))
          ? `<div class="flipswitch" style="display: inline-block; top: 8px;">
        <input checked="" onchange="toggleViewTeacher()" id="studentTeacherFs" class="flipswitch-cb" name="flipswitch" type="checkbox">
        <label for="studentTeacherFs" class="flipswitch-label">
            <div class="flipswitch-inner"></div>
            <div class="flipswitch-switch"></div>
        </label>
      </div>`
          : ""
      }
      <button class="sl-button" style="height: 32px; margin: 6px;" onclick="openAsPresentation()">${lucideIcon(
        "Presentation"
      )}</button>
      <button class="sl-button-accent topdown-menu-chevron" style="height: 32px; margin: 6px;" onclick="toggleTopdownMenu()">${lucideIcon(
        "Settings"
      )}</button>
    </div>
  `;
}

async function getSideBar(startPage, req) {
  return `
    <div class="sidebar-menu">
      <a href="${startPage}">Home</a>
    </div>
    <div class="sidebar-title sidebar-title-dirlist row" onclick="toggleDirList('sidebar-dirlist')"><b>Site</b><div class="sidebar-dirlist-chevron">${lucideIcon(
      "ChevronRight",
      null,
      "12px"
    )}</div></div>
    <div class="sidebar-menu sidebar-dirlist">
      ${await getDirectoryListing(req)}
    </div>
    <div class="sidebar-title sidebar-title-content"><b>Content</b></div>
    <div class="sidebar-menu sidebar-anchors">
      ${await getContentListing()}
    </div>
  `;
}

export async function wrapInPage(html, startPage, req) {
  const pre = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          ${await getFontImports()}
        </style>
        <link rel="stylesheet" href="/css/main.css">
        <link rel="shortcut icon" href="/assets/favicon.ico" type="image/x-icon" />
      </head>
      <body style="display: none;">
        <div id="topbar">${await getTopBar(startPage, req)}</div>
        <div id="wrapper">
          <div id="sidebar" class="nav-font">${await getSideBar(
            startPage,
            req
          )}</div>
          <div id="markdown-content">
    `;
  const post = `
          </div>
          <div id="topdown-menu" class="nav-font">
            ${await getTopdownMenu(req)}
          </div>
        </div>
        <script src="/obsidian-page.js"></script>
        <script lang="javascript">
        initFonts('${JSON.stringify(mainFontsArray)}', '${JSON.stringify(
    navFontsArray
  )}');
        init();
        </script>
      </body>
      </html>
    `;
  return pre + html + post;
}

export async function wrapInReveal(reveal) {
  const pre = `
  <!DOCTYPE html>
  <html>
  
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  
    <title>Sample RevealJS with CDN</title>
  
    <link href='https://fonts.googleapis.com/css?family=Lato:300,700' rel='stylesheet' type='text/css'>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/css/reveal.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/css/theme/moon.css">

    <style>
      ${getFontImports()}
      #revealContent img {
        object-fit: contain;
        max-width: 50%;
        max-height: 50%;
        background-color: #c3c3c3;
      }
      pre.shiki {
        max-width: 90%;
      }
      pre.shiki code {
        max-width: 100%;
        max-height: 60vh !important;
      }

      .reveal {
        font-family: "Lato", serif;
        font-size: 32px;
        font-weight: 300;
      }
    </style>
    <link rel="stylesheet" href="/obsidian-page.css">
    <link rel="shortcut icon" href="/assets/favicon.ico" type="image/x-icon" />
  
    <!-- Theme used for syntax highlighting of code -->
    <!-- <link rel="stylesheet" href="lib/css/zenburn.css"> -->
    <!-- <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.13.1/styles/tomorrow.min.css"> -->
  
    <!-- Printing and PDF exports -->
    <script>
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = window.location.search.match(/print-pdf/gi) ? 'https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/css/print/pdf.css' : 'https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/css/print/paper.css';
      document.getElementsByTagName('head')[0].appendChild(link);
    </script>
  </head>
  
  <body>
    <div class="reveal" width="100%" height="100%">
      <div class="slides" width="100%" height="100%" id="revealContent">
  `;
  const post = `
      </div>
    </div>
    <!--<script src="lib/js/head.min.js"></script>-->
    <script src="https://cdn.jsdelivr.net/npm/headjs@1.0.3/dist/1.0.0/head.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/js/reveal.min.js"></script>
  
    <script>
      // More info about config & dependencies:
      // - https://github.com/hakimel/reveal.js#configuration
      // - https://github.com/hakimel/reveal.js#dependencies
      Reveal.initialize({
        // Display controls in the bottom right corner
        controls: true,
  
        // The "normal" size of the presentation, aspect ratio will
        // be preserved when the presentation is scaled to fit different
        // resolutions. Can be specified using percentage units.
        width: "90%",
        height: "90%",

        // Factor of the display size that should remain empty around
        // the content
        margin: 0.04,

        // Bounds for smallest/largest possible scale to apply to content
        minScale: 0.2,
        maxScale: 2.0,
  
        // Display a presentation progress bar
        progress: true,
  
        // Set default timing of 2 minutes per slide
        defaultTiming: 120,
  
        // Display the page number of the current slide
        slideNumber: true,
  
        // Push each slide change to the browser history
        history: false,
  
        // Enable keyboard shortcuts for navigation
        keyboard: true,
  
        // Enable the slide overview mode
        overview: true,
  
        // Vertical centering of slides
        center: true,
  
        // Enables touch navigation on devices with touch input
        touch: true,
  
        // Loop the presentation
        loop: false,
  
        // Change the presentation direction to be RTL
        rtl: false,
  
        // Randomizes the order of slides each time the presentation loads
        shuffle: false,
  
        // Turns fragments on and off globally
        fragments: true,
  
        // Flags if the presentation is running in an embedded mode,
        // i.e. contained within a limited portion of the screen
        embedded: false,
  
        // Flags if we should show a help overlay when the questionmark
        // key is pressed
        help: true,
  
        // Flags if speaker notes should be visible to all viewers
        showNotes: false,
  
        // Global override for autolaying embedded media (video/audio/iframe)
        // - null: Media will only autoplay if data-autoplay is present
        // - true: All media will autoplay, regardless of individual setting
        // - false: No media will autoplay, regardless of individual setting
        autoPlayMedia: null,
  
        // Number of milliseconds between automatically proceeding to the
        // next slide, disabled when set to 0, this value can be overwritten
        // by using a data-autoslide attribute on your slides
        autoSlide: 0,
  
        // Stop auto-sliding after user input
        autoSlideStoppable: true,
  
        // Use this method for navigation when auto-sliding
        autoSlideMethod: Reveal.navigateNext,
  
        // Enable slide navigation via mouse wheel
        mouseWheel: true,
  
        // Hides the address bar on mobile devices
        hideAddressBar: true,
  
        // Opens links in an iframe preview overlay
        previewLinks: true,
  
        // Transition style
        transition: 'convex', // none/fade/slide/convex/concave/zoom
  
        // Transition speed
        transitionSpeed: 'default', // default/fast/slow
  
        // Transition style for full page slide backgrounds
        backgroundTransition: 'fade', // none/fade/slide/convex/concave/zoom
  
        // Number of slides away from the current that are visible
        viewDistance: 3,
  
        // Parallax background image
        parallaxBackgroundImage: '', // e.g. "'https://s3.amazonaws.com/hakim-static/reveal-js/reveal-parallax-1.jpg'"
  
        // Parallax background size
        parallaxBackgroundSize: '', // CSS syntax, e.g. "2100px 900px"
  
        // Number of pixels to move the parallax background per slide
        // - Calculated automatically unless specified
        // - Set to 0 to disable movement along an axis
        parallaxBackgroundHorizontal: null,
        parallaxBackgroundVertical: null,
  
  
        // The display mode that will be used to show slides
        display: 'block',
  
        /*
        multiplex: {
          // Example values. To generate your own, see the socket.io server instructions.
          secret: '13652805320794272084', // Obtained from the socket.io server. Gives this (the master) control of the presentation
          id: '1ea875674b17ca76', // Obtained from socket.io server
          url: 'https://reveal-js-multiplex-ccjbegmaii.now.sh' // Location of socket.io server
        },
        */
  
        dependencies: [
          //{ src: 'https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/plugin/markdown/marked.js' },
          //{ src: 'https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/plugin/markdown/markdown.js' },
          { src: 'https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/plugin/notes/notes.js', async: true },
          //{ src: 'https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/plugin/highlight/highlight.js', async: true, callback: function () { hljs.initHighlightingOnLoad(); } },
          //{ src: '//cdn.socket.io/socket.io-1.3.5.js', async: true },
          //{ src: 'plugin/multiplex/master.js', async: true },
          // and if you want speaker notes
          //{ src: 'https://cdn.jsdelivr.net/npm/reveal.js@3.7.0/plugin/notes-server/client.js', async: true }
  
        ],
        markdown: {
          //            renderer: myrenderer,
          smartypants: true
        }
      });
      Reveal.configure({
        // PDF Configurations
        pdfMaxPagesPerSlide: 1
      });
    </script>
  </body>
  
  </html>
    `;
  return pre + reveal + post;
}
