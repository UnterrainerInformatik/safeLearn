import fileNameExtractor from "./middlewares/extract-filename-middleware.js";
import { initKeycloak, checkAuthenticated, refreshAccessToken, getUserAttributes, setUserAttribute } from "./middlewares/keycloak-middleware.js";

import express from "express";

import { Marked } from "marked";
import markedShiki from "marked-shiki";
import { bundledLanguages, getHighlighter } from "shiki";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
  transformerNotationFocus,
  transformerNotationErrorLevel,
  transformerMetaHighlight,
  transformerMetaWordHighlight,
} from "@shikijs/transformers";

const lightTheme = "material-theme-lighter";
const darkTheme = "one-dark-pro";
const highlighter = await getHighlighter({
  langs: Object.keys(bundledLanguages),
  themes: [darkTheme, lightTheme]
});
// Set options
const markedLight = new Marked();
markedLight.use({
  async: true,
  breaks: true,
  gfm: true,
  pedantic: false,
});
markedLight.use(
  markedShiki({
    highlight(code, lang, props) {
      return highlighter.codeToHtml(code, {
        lang,
        theme: lightTheme,
        meta: { __raw: props.join(" ") }, // required by `transformerMeta*`
        transformers: [
          transformerNotationDiff(),
          transformerNotationHighlight(),
          transformerNotationWordHighlight(),
          transformerNotationFocus(),
          transformerNotationErrorLevel(),
          transformerMetaHighlight(),
          transformerMetaWordHighlight(),
        ],
      });
    },
  })
);
const markedDark = new Marked();
markedDark.use({
  async: true,
  breaks: true,
  gfm: true,
  pedantic: false,
});
markedDark.use(
  markedShiki({
    highlight(code, lang, props) {
      return highlighter.codeToHtml(code, {
        lang,
        theme: darkTheme,
        meta: { __raw: props.join(" ") }, // required by `transformerMeta*`
        transformers: [
          transformerNotationDiff(),
          transformerNotationHighlight(),
          transformerNotationWordHighlight(),
          transformerNotationFocus(),
          transformerNotationErrorLevel(),
          transformerMetaHighlight(),
          transformerMetaWordHighlight(),
        ],
      });
    },
  })
);

import axios from "axios";

import { config } from "dotenv";
import path from "node:path";
import fs from "fs";
const __dirname = import.meta.dirname;

config();

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

const app = express();
app.set("trust proxy", true);

import { scanFiles, scanFonts, preParse, manipulateHtml, wrapInPage, wrapInReveal, splitForReveal, parseFirstLineForPermissions, wrapAsDocument, resolveFileVisibility, registerVisibilityChangeCallback } from "./obsidian.js";

import chokidar from "chokidar";

async function sanitizeAndParseMarkdown(data, req) {
  try {
    await refreshAccessToken(req);
    let d = data.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, "");
    // Look if the first line contains a permission directive
    // First, get the first line of d
    const firstLine = d.split("\n")[0];
    const permissions = parseFirstLineForPermissions(firstLine);
    if (permissions !== null) {
      // The same rule the navigation tree applies, reached through the one
      // implementation of it. Only the wording of the refusal belongs here.
      const { visible, reason } = await resolveFileVisibility(req, permissions);
      if (!visible) {
        throw new Error(
          reason === "outside-window"
            ? "This content is not visible right now."
            : "You do not have the required permissions to view this content."
        );
      }
      // Strip the first line since it held the permissions
      d = d.split("\n").slice(1).join("\n");
    }
    d = await preParse(d, req);
    
    let dm = 0;
    if (req.user.accessTokenDecoded.config) {
      const a = JSON.parse(req.user.accessTokenDecoded.config);
      dm = a.dm;
    }
    
    const marked = dm == 1 ? markedDark : markedLight;
    let html = await marked.parse(d);
    html = manipulateHtml(html, req);
    return DOMPurify.sanitize(html);
  } catch (error) {
    console.error(`Error parsing markdown: ${error}`);
    return `Error parsing markdown: ${error}`;
  }
}

async function mdGetToHtml(url, req) {
  let headers = {};
  if (req.headers.cookie) {
    headers = {
      cookie: req.headers.cookie,
    };
  }

  const response = await axios.get(url, {
    responseType: "document",
    headers: headers,
  });
  return sanitizeAndParseMarkdown(response.data, req);
}

function getStartPage() {
  let url = process.env.NEXT_PUBLIC_START_PAGE;
  if (url === undefined || url === null || url === "") {
    // The fallback a deployment lands on when it configures no start page, and
    // the one docs-building.md has always named. It has to be a path the server
    // actually serves: an unmatched path is answered with the start page, so a
    // fallback that is not served redirects to itself forever. `/index.html` has
    // its own mount below for that reason.
    url = "/index.html";
  }
  return url;
}

// --- SSE Hot Reload ---
// Node.js Beispiel
const clients = new Map();

app.get('/hot-reload', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.flushHeaders();
  res.write('\n');

  const id = Date.now() + Math.random();
  // This is the one endpoint that answers before any authentication has
  // happened, so everything a client sends it is treated as hostile. A context
  // that does not parse is the same thing as no context at all.
  let context = {};
  if (req.query.context) {
    try {
      context = JSON.parse(req.query.context);
    } catch {
      context = {};
    }
  }
  clients.set(id, { res, context });

  req.on('close', () => clients.delete(id));
});

function broadcastReloadSSE(filesChanged = null) {
  const isNavChange = filesChanged === null;
  const total = clients.size || clients.length;
  console.log(
    `Broadcasting ${isNavChange ? "full" : "selective"} reload to ${total} clients`
  );

  let count = 0;
  for (const [id, { res, context }] of clients) {
    const currentFile = context?.currentFile || "";
    let shouldReload = false;

    if (isNavChange) {
      // Full reload for everyone
      shouldReload = true;
    } else {
      // Reveal presentation: only reload if the open file was changed
      shouldReload = filesChanged.some(changed =>
        currentFile.endsWith(changed) || currentFile.includes(changed)
      );
    }

    // console.log(`Client ${id} (currentFile: ${currentFile}) - shouldReload: ${shouldReload}`);
    if (!shouldReload) continue;

    const payload = isNavChange
      ? { type: "nav" }
      : { type: "page", files: filesChanged };

    try {
      res.write(`event: reload\ndata: ${JSON.stringify(payload)}\n\n`);
      count++;
    } catch (err) {
      console.warn(`Client ${id} disconnected, removing from pool.`);
      try {
        res.end();
      } catch (_) {}
      clients.delete(id);
    }
  }
  console.log(`Reload sent to ${count} clients.`);
  console.log(`Active clients after broadcast: ${clients.size || clients.length}`);
}

registerVisibilityChangeCallback((filesChanged) => {
  if (Array.isArray(filesChanged) && filesChanged.length > 0) {
    console.log(
      `[TimedPermissions] Triggered by files: ${filesChanged.join(", ")}. Broadcasting full reload.`
    );
  } else {
    console.log(`[TimedPermissions] Visibility change detected. Broadcasting full reload.`);
  }
  broadcastReloadSSE();
});

const basePath = process.env.NEXT_PUBLIC_IS_APP_FOLDER ? '/app/' : '.';

// Watch md/ folder and trigger scanFiles on changes if NEXT_AUTOSCAN is true
const isAutoScan = process.env.NEXT_AUTOSCAN === "true";
console.log(`AutoScan is set to ${isAutoScan}`);
if (isAutoScan) {
  const mdPath = path.join(basePath, "md");
  const watcher = chokidar.watch(mdPath, { ignoreInitial: true, persistent: true, depth: 99 });
  watcher.on("all", async (event, pathChanged) => {
    console.log(`[Watcher] Detected ${event} in ${pathChanged}. Triggering scanFiles...`);
    const diff = await scanFiles("md/", path.join(basePath, "md"));
    console.log("File changes:", diff);
    if (diff.added.length || diff.removed.length) {
    broadcastReloadSSE();
  } else if (diff.modified.length) {
    broadcastReloadSSE(diff.modified);
  }
  });
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  next();
});

initKeycloak(app).then(() => {
  // Protect all routes and serve them statically after authentication.
  // Order matters when dealing with middleware!
  // For example the next() method will just pass the request on to the next middleware in line.
  app.use(checkAuthenticated);

  app.use(checkAuthenticated, (req, res, next) => {
    if (req.url === "/" || req.url === "") {
      let startPage = getStartPage();
      getUserAttributes(req).then((attributes) => {
        if (attributes && attributes.config) {
          const a = JSON.parse(attributes.config);
          if (a.sl == 1 && attributes.lastVisitedUrl) {
            startPage = attributes.lastVisitedUrl;
          }
        }
        res.redirect(startPage);
      });
    } else {
      next();
    }
  });
  app.use(fileNameExtractor);

  app.use(checkAuthenticated, (req, res, next) => {
    let filePath = path.join(__dirname, decodeURIComponent(req.path));
    if (path.extname(filePath) === ".md") {
      fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
          console.error(`Error reading file ${filePath}`, err);
          res.redirect(getStartPage());
          return;
        }
        const reveal = req.query.reveal;
        if (reveal) {
          sanitizeAndParseMarkdown(data, req).then((html) => {
            const h = splitForReveal(html);
            wrapInReveal(h, req).then((r) => {
              res.send(r);
            });
          });
        } else {
          const doc = req.query.document;
          if  (doc) {
            sanitizeAndParseMarkdown(data, req).then((html) => {
              setUserAttribute(req, "lastVisitedUrl", req.originalUrl);
              wrapAsDocument(html, req).then((r) => {
                res.send(r);
              });
            });
          } else {
            sanitizeAndParseMarkdown(data, req).then((html) => {
              setUserAttribute(req, "lastVisitedUrl", req.originalUrl);
              wrapInPage(html, getStartPage(), req).then((r) => {
                res.send(r);
              });
            });
          }
        }
      });
    } else {
      next();
    }
  });
  
  // ################### Static assets ###################
  // An allowlist, not a root. A path is reachable because a rendered page
  // references it, never because a file happens to sit in the application
  // directory: serving __dirname published app.js, utils.js, obsidian.js,
  // package.json and above all keycloak.json, which carries the OIDC client
  // secret. That file cannot be moved out of the way — initKeycloak reads it
  // from the working directory, so every deployment has it right here, next to
  // this file.
  //
  // Something newly referenced from a rendered page is not served until it gets
  // its own mount here — the catch-all below answers it with the start page, the
  // way it answers a path with no file behind it. Add the narrowest mount that
  // covers the reference rather than widening one that is already there.
  app.use("/assets", checkAuthenticated, express.static(path.join(__dirname, "assets")));
  app.use("/css", checkAuthenticated, express.static(path.join(__dirname, "css")));
  // Markdown never arrives here: the handler above answers everything with a
  // .md extension, so whole-file permissions cannot be bypassed through this
  // mount. What is left of the corpus are the images and other attachments a
  // page embeds.
  app.use("/md", checkAuthenticated, express.static(path.join(__dirname, "md")));
  // Single files need their own handler — `express.static` serves directories.
  // A file the deployment does not ship falls through to the catch-all instead
  // of raising, so an unserved path answers the same way wherever it comes from.
  const serveFile = (fileName) => (req, res, next) => {
    res.sendFile(path.join(__dirname, fileName), (error) => {
      if (!error) return;
      if (res.headersSent) res.end();
      else next();
    });
  };
  app.get("/obsidian-page.js", checkAuthenticated, serveFile("obsidian-page.js"));
  // The start page a deployment falls back to when it configures none, which is
  // why it is served although nothing links to it: `getStartPage` names it, and
  // a start page that is not served would be redirected to itself.
  app.get("/index.html", checkAuthenticated, serveFile("index.html"));
  // The logos, addressed from Markdown rather than from a wrapper: README.md
  // embeds logo-128.png relative to itself, and README.md is the start page of
  // more than one deployment. Enumerated rather than matched by a pattern, so
  // the set stays a list somebody chose.
  for (const logo of ["logo-64.png", "logo-128.png", "logo-256.png", "logo-512.png"]) {
    app.get(`/${logo}`, checkAuthenticated, serveFile(logo));
  }
  // The two browser-side modules obsidian.js imports for mermaid. Each mount is
  // the package's dist directory rather than the entry file, because mermaid
  // fetches further chunks from ./chunks/mermaid.esm.min/ at runtime. The rest
  // of the dependency tree stays unpublished, so a future dependency shipping a
  // fixture or a script in its package does not become a URL.
  app.use(
    "/node_modules/mermaid/dist",
    checkAuthenticated,
    express.static(path.join(__dirname, "node_modules", "mermaid", "dist"))
  );
  app.use(
    "/node_modules/@mermaid-js/layout-elk/dist",
    checkAuthenticated,
    express.static(path.join(__dirname, "node_modules", "@mermaid-js", "layout-elk", "dist"))
  );
  // The presentation view's rendering engine, served from the version
  // package.json declares instead of from a content delivery network. Directory
  // mounts rather than the four files wrapInReveal names, for the same reason
  // the mermaid mounts are directories: a bundle addresses further files of its
  // own once it runs. The derived theme in css/ imports
  // dist/theme/fonts/league-gothic/league-gothic.css, and that file in turn
  // addresses the three font files beside it — none of which is named anywhere
  // in the markup. `plugin/notes` is the plugin's own directory: 5.2.1 carries
  // the speaker view inside notes.js and fetches nothing beside it, but a
  // version that goes back to opening speaker-view.html would find it served
  // rather than redirected to the start page.
  //
  // Two mounts scoped to those subdirectories rather than one over
  // /node_modules, so installing a further dependency does not publish it.
  app.use(
    "/node_modules/reveal.js/dist",
    checkAuthenticated,
    express.static(path.join(__dirname, "node_modules", "reveal.js", "dist"))
  );
  app.use(
    "/node_modules/reveal.js/plugin/notes",
    checkAuthenticated,
    express.static(path.join(__dirname, "node_modules", "reveal.js", "plugin", "notes"))
  );

  // Convert markdown to HTML using marked.
  app.get("/convert", checkAuthenticated, (req, res) => {
    const fileUrl = req.query.url;
    if (!fileUrl) {
      res.send(
        "You have to provide a file-url to the markdown file by specifying `?url=<your-url-encoded-url>` in order to convert the markdown to HTML."
      );
      return;
    }

    mdGetToHtml(fileUrl, req).then((html) => {
      wrapInPage(html, getStartPage(), req).then((r) => {
        res.send(r);
      });
    })
    .catch((error) => {
      res.send(`Error: ${error}`);
    });
  });

  // Post the request as a JSON file following this format:
  // {
  //   "url": "https://raw.githubusercontent.com/..."
  // }
  // The URL should point to a markdown file.
  // Or you may also send the markdown content directly using this format:
  // {
  //   "content": "## Hello World"
  // }
  // The server will then convert the markdown to HTML and send it back as a JSON response using this format:
  // {
  //   "html": "<html>...</html>"
  // }
  // The HTML will be sanitized using DOMPurify and will not contain any html, head or body tags.
  app.post("/convert", checkAuthenticated, (req, res) => {
    if (typeof req.body == "undefined" || req.body == null) {
      res.json({
        error:
          "No data found in body. You have to specify 'url' or 'content' in your body in order to convert the markdown to HTML.",
      });
    } else {
      if (req.body.url !== undefined && req.body.url !== null) {
        mdGetToHtml(req.body.url, req)
          .then((html) => {
            res.json({ html: html });
          })
          .catch((error) => {
            res.json({ error: error });
          });
      } else {
        const c = req.body.content;
        if (c !== undefined && c !== null) {
          sanitizeAndParseMarkdown(c, req).then((html) => {
            res.json({ html: html });
          });
        }
      }
    }
  });

  app.get("/userattributes", checkAuthenticated, (req, res) => {
    // send the user profile as response
    refreshAccessToken(req).then(() => {
      res.json(req.user);
    });
  });

  app.post("/userattributes", checkAuthenticated, (req, res) => {
    if (typeof req.body == "undefined" || req.body == null) {
      res.json({
        error:
          "No data found in body. You have to specify 'attribute' and 'value' in your body in order to save an client-attribute in your keycloak instance.",
      });
    } else {
      setUserAttribute(req, 'config', JSON.stringify(req.body)).then((result) => {
        if (result) {
          res.json({ success: true });
        } else {
          res.json({ success: false });
        }
      });
    }
  });

  // Initial scan
  scanFiles("md/", path.join(basePath, "md"), true).then(() => {
    scanFonts(path.join(basePath, "assets")).then(() => {
      app.listen(process.env.NEXT_PUBLIC_PORT, "0.0.0.0");
    });
  });

  // If file is not found, redirect to the start page.
  app.use((_, res) => res.redirect(getStartPage()));
});
