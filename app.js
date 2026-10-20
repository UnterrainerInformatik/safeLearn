import fileNameExtractor from "./middlewares/extract-filename-middleware.js";
import {
  initKeycloak,
  checkAuthenticated,
  answerUnauthenticated,
  refreshAccessToken,
  setUserAttribute,
  SessionEndedError,
} from "./middlewares/keycloak-middleware.js";
import { getPermissionContext } from "./permission-context.js";
import { establishAuthMode, withoutIdentity } from "./auth-mode.js";
import { readerPreferences } from "./reader-preferences.js";
import { languages } from "./i18n/t.js";
import {
  verifyCallerIdentity,
  searchDirectory,
  getDirectoryStatus,
  startDirectoryRefresh,
} from "./middlewares/directory-service.js";

import express from "express";

import { Marked } from "marked";
import markedShiki from "marked-shiki";
import { bundledLanguages, getHighlighter } from "shiki";
import { sanitizeHtml } from "./sanitize.js";
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
markedLight.use(highlightExtension);
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
markedDark.use(highlightExtension);
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


import { config } from "dotenv";
import path from "node:path";
import fs from "fs";
const __dirname = import.meta.dirname;

config();

// Before anything is mounted: a refused combination ends the start here, and the
// mode decides below whether Keycloak is contacted at all.
const { mode: authMode } = establishAuthMode();

const app = express();
app.set("trust proxy", true);

import { registerEmbedHandler, registerEmbedClientScript, registerOpenTestsCheck, highlightExtension, scanFiles, scanFonts, preParse, manipulateHtml, wrapInPage, wrapInReveal, splitForReveal, parseFirstLineForPermissions, wrapAsDocument, resolveFileVisibility, registerVisibilityChangeCallback, searchCorpus, minimumQueryLength, recordAttachmentGrants, hasAttachmentGrant, dropAttachmentGrants, mayServeAttachment, normalizeCorpusPath } from "./obsidian.js";

import chokidar from "chokidar";
import { openEventStream } from "./event-stream.js";

async function sanitizeAndParseMarkdown(data, req, options = {}) {
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
    d = await preParse(d, req, options);
    
    let dm = 0;
    if (withoutIdentity()) {
      dm = (await getPermissionContext(req)).preferences.dm;
    } else if (req.user.accessTokenDecoded.config) {
      const a = JSON.parse(req.user.accessTokenDecoded.config);
      dm = a.dm;
    }
    
    const marked = dm == 1 ? markedDark : markedLight;
    let html = await marked.parse(d);
    html = manipulateHtml(html, req);
    return sanitizeHtml(html);
  } catch (error) {
    // Not something to show on the page: the session it would be shown to has
    // just ended, and the request is answered as one without a session.
    if (error instanceof SessionEndedError) {
      throw error;
    }
    console.error(`Error parsing markdown: ${error}`);
    return `Error parsing markdown: ${error}`;
  }
}

/**
 * Stores the page this request served, so `/` can resolve to it when the
 * session asked for that.
 *
 * Called after the page has been wrapped rather than before, and that ordering
 * is the point: wrapping builds the navigation tree and the top bar, both of
 * which ask permission questions, so by now this request holds its permission
 * context and the write merges from it. Started before, the write would fetch
 * the account for itself and a page carrying no directive would cost two
 * lookups where the whole point is that it costs one.
 *
 * Not awaited - the answer does not wait on it, the way it never has.
 */
function rememberLastVisited(req) {
  setUserAttribute(req, "lastVisitedUrl", req.originalUrl).catch((error) => {
    console.error("Error remembering the last visited page:", error);
  });
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
const clients = new Map();

app.get('/hot-reload', (req, res) => {
  const id = Date.now() + Math.random();
  openEventStream(req, res, { onClose: () => clients.delete(id) });

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

/**
 * The exam module, when the deployment switches it on (`exam-foundation`).
 *
 * With `EXAM_MODULE` anything but "on", its code is never loaded: no database
 * is opened, no route exists, and the instance is the one it was before the
 * module. With it on, a module that cannot start - the import fails, the
 * database cannot be opened, a migration fails, `SCHOOL_PERIODS` is malformed -
 * is logged as disabled and the reader starts without it. Resolves to the started module or null.
 */
async function loadExamModule() {
  if (process.env.EXAM_MODULE !== "on") {
    console.log(`Exam module: disabled (EXAM_MODULE is not "on").`);
    return null;
  }
  try {
    const { init } = await import("./exam/index.js");
    const started = await init({ startPage: getStartPage });
    if (!started.active) {
      console.error(`Exam module: disabled - ${started.reason}`);
      return null;
    }
    for (const [kind, handler] of Object.entries(started.embedHandlers)) {
      registerEmbedHandler(kind, handler);
    }
    registerEmbedClientScript(started.clientScript);
    registerOpenTestsCheck(started.hasOpenTests);
    console.log(`Exam module: active, database ${started.dbPath}`);
    return started;
  } catch (error) {
    console.error(`Exam module: disabled - it failed to load: ${error?.stack ?? error}`);
    return null;
  }
}

/**
 * Every route of the application, registered against the identity layer the
 * instance runs with. `identity` carries what differs between the modes:
 * `checkAuthenticated`, which gates every content route and static mount;
 * `preferences`, the store a reader's preferences and last visited page are
 * read from and written to; and `mode`, which decides the routes that exist
 * only with an identity provider.
 */
async function registerRoutes(app, identity) {
  const { checkAuthenticated, preferences } = identity;

  // Awaited before any route is registered, so the order below - the module's
  // router after checkAuthenticated and before the catch-all - holds from the
  // first request on.
  const examModule = await loadExamModule();

  // The directory needs the identity provider twice over: its callers prove
  // themselves against Keycloak's introspection endpoint, and its data comes
  // from Keycloak's admin API. Without one, neither route exists, and a request
  // for either lands in the catch-all like any path nothing serves.
  if (identity.mode === "keycloak") {
    // Ahead of checkAuthenticated on purpose, and never added to its chain: the
    // caller here is identified by a bearer token proven fresh against Keycloak's
    // introspection endpoint (see middlewares/directory-service.js), not by the
    // browser session checkAuthenticated gates everything else on. Registered
    // first so no later `app.use(checkAuthenticated)` sits in front of it.
    app.get("/api/admin/directory/search", async (req, res) => {
      const identity = await verifyCallerIdentity(req);
      if (!identity.authorized) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";

      try {
        const answer = await searchDirectory(query);
        if (!answer.ready) {
          // 202, not 200-with-nothing and not an error: the directory has no data
          // to match against yet, which is neither a query that found nobody nor a
          // failure. The body is the same payload the status route answers with, so
          // a caller holding this can render the fetch's progress without a second
          // request. Answering instead of holding the request open is the whole
          // point — see `show-directory-fetch-progress`'s design.md.
          res.status(202).json(getDirectoryStatus());
          return;
        }
        res.json(answer.results);
      } catch (error) {
        console.error("Directory search failed:", error);
        res.status(502).json({ error: "Directory search failed" });
      }
    });

    // Registered right beside the search route, and gated identically: same
    // `verifyCallerIdentity`, same 403 shape, same placement ahead of
    // checkAuthenticated. It reads process memory only — no Keycloak call, no
    // disk, and above all no fetch started — which is what lets the plugin's
    // settings tab poll it without provoking the very work it is reporting on.
    app.get("/api/admin/directory/status", async (req, res) => {
      const identity = await verifyCallerIdentity(req);
      if (!identity.authorized) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      res.json(getDirectoryStatus());
    });

    // Warms the cache searchDirectory() above reads from, so the fetch that can
    // take minutes against a large realm happens here, at startup, rather than
    // leaving whichever teacher searches first with a 202 and a wait. Not awaited:
    // the rest of startup, and every other route, must not wait on it. Started
    // directly rather than through a throwaway search, now that a search no longer
    // waits for the fetch it starts — and so no longer surfaces its failure either;
    // `startDirectoryRefresh` logs that itself.
    startDirectoryRefresh();
  }

  // Protect all routes and serve them statically after authentication.
  // Order matters when dealing with middleware!
  // For example the next() method will just pass the request on to the next middleware in line.
  app.use(checkAuthenticated);

  app.use(checkAuthenticated, (req, res, next) => {
    if (req.url === "/" || req.url === "") {
      let startPage = getStartPage();
      // Read from the request's one context, and through the shape the account
      // endpoint actually answers with: every stored attribute lives under
      // `attributes`, so the `attributes.config` this route read before was
      // always undefined and "remember last visited page" never took effect.
      getPermissionContext(req)
        .then((context) => {
          const lastVisitedUrl = context.account?.attributes?.lastVisitedUrl;
          if (context.preferences.sl == 1 && lastVisitedUrl) {
            startPage = lastVisitedUrl;
          }
          res.redirect(startPage);
        })
        .catch(next);
    } else {
      next();
    }
  });
  app.use(fileNameExtractor);

  const corpusRoot = path.join(__dirname, "md") + path.sep;

  app.use(checkAuthenticated, (req, res, next) => {
    let filePath = path.join(__dirname, decodeURIComponent(req.path));
    if (path.extname(filePath) === ".md") {
      // The body of a corpus file is what this session was just allowed to see,
      // so the attachments it addresses are granted to it. Nothing else the
      // renderer is handed may grant anything (`attachment-access`).
      // `options` reaches preParse: the presentation and document views render
      // embedded module elements as they would with the module off.
      const render = filePath.startsWith(corpusRoot)
        ? (data, options) =>
            sanitizeAndParseMarkdown(data, req, options).then((html) => {
              recordAttachmentGrants(req, html);
              return html;
            })
        : (data, options) => sanitizeAndParseMarkdown(data, req, options);
      fs.readFile(filePath, "utf8", (err, data) => {
        if (err) {
          console.error(`Error reading file ${filePath}`, err);
          res.redirect(getStartPage());
          return;
        }
        const reveal = req.query.reveal;
        if (reveal) {
          render(data, { embedDefaults: true })
            .then((html) => wrapInReveal(splitForReveal(html), req))
            .then((r) => {
              res.send(r);
            })
            .catch(next);
        } else {
          const doc = req.query.document;
          if  (doc) {
            render(data, { embedDefaults: true })
              .then((html) => wrapAsDocument(html, req))
              .then((r) => {
                preferences.rememberLastVisited(req, res);
                res.send(r);
              })
              .catch(next);
          } else {
            render(data)
              .then((html) => wrapInPage(html, getStartPage(), req))
              .then((r) => {
                preferences.rememberLastVisited(req, res);
                res.send(r);
              })
              .catch(next);
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
  // page embeds, and those are not served to anyone who asks: an attachment
  // reaches a session only when the session may see at least one place in the
  // corpus that references it (`attachment-access`). The gate decides before
  // `express.static` looks at the disk. A refusal leaves the router, so it lands
  // in the catch-all exactly where a path with no file behind it lands, and
  // the two cannot be told apart.
  const attachments = express.Router();
  attachments.use((req, res, next) => {
    let attachment;
    try {
      attachment = normalizeCorpusPath(decodeURIComponent(req.path));
    } catch {
      attachment = null;
    }
    if (attachment === null) {
      next("router");
      return;
    }
    const serve = () => {
      // The browser may keep its copy and revalidate it; a shared cache must
      // not hand one session's attachment to another.
      res.setHeader("Cache-Control", "private, no-cache");
      next();
    };
    if (hasAttachmentGrant(req, attachment)) {
      serve();
      return;
    }
    mayServeAttachment(req, attachment)
      .then((yes) => (yes ? serve() : next("router")))
      .catch(next);
  });
  attachments.use(express.static(path.join(__dirname, "md"), { cacheControl: false }));
  app.use("/md", checkAuthenticated, attachments);
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
  // The interface catalogs and the two modules the browser shares with the
  // server (`ui-language`), by name: the BabelEdit project and the server's
  // own loader beside them stay unpublished. Revalidated on every use, as /css
  // is, so a changed text reaches the next page view.
  for (const file of ["t.js", "format.js", ...languages.map((lang) => `${lang}.json`)]) {
    app.get(`/i18n/${file}`, checkAuthenticated, serveFile(path.join("i18n", file)));
  }
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

  /**
   * What this session may be told about a query over the corpus.
   *
   * Beside the content routes and gated exactly as they are: `checkAuthenticated`
   * refuses a request without a session before anything here runs, so an
   * unauthenticated search is refused the way an unauthenticated page is. Every
   * query is authorized afresh - the answer is derived from this request's own
   * permission context, so a view preference changed between two keystrokes
   * takes effect on the second.
   *
   * The answer is the list of results and nothing else. There is no total, no
   * count taken before filtering and no sign that anything was left out: the
   * difference between such a number and what is displayed would measure the part
   * of the corpus this session may not see. `corpus-search` states that rule; it
   * is kept here by having nothing else to send.
   *
   * A query shorter than the minimum is refused rather than answered, because a
   * one- or two-character query returns most of the corpus whatever it says and
   * is the cheapest probe there is. `minimumQueryLength` in `obsidian.js` carries
   * the measurement that settled it, together with the debounce the field waits.
   */
  app.get("/search", checkAuthenticated, (req, res, next) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < minimumQueryLength) {
      res.status(400).json({
        error: `A search needs at least ${minimumQueryLength} characters.`,
      });
      return;
    }

    searchCorpus(req, query)
      .then((answer) => {
        res.json({ results: answer.results });
      })
      .catch((error) => {
        if (error instanceof SessionEndedError) {
          next(error);
          return;
        }
        console.error(`Search failed: ${error}`);
        res.status(500).json({ error: "The search could not be answered." });
      });
  });

  app.get("/userattributes", checkAuthenticated, (req, res, next) => {
    // send the user profile as response
    preferences
      .read(req)
      .then((user) => {
        res.json(user);
      })
      .catch(next);
  });

  app.post("/userattributes", checkAuthenticated, (req, res, next) => {
    if (typeof req.body == "undefined" || req.body == null) {
      res.json({
        error:
          "No data found in body. You have to specify 'attribute' and 'value' in your body in order to save an client-attribute in your keycloak instance.",
      });
    } else {
      preferences
        .write(req, res, req.body)
        .then((result) => {
          if (result) {
            // The preferences decide what this session sees - teacher or
            // student view, exam variant or practice - so what it was granted
            // under the old ones is no longer what it has been shown.
            dropAttachmentGrants(req);
            res.json({ success: true });
          } else {
            res.json({ success: false });
          }
        })
        .catch(next);
    }
  });

  // Initial scan
  scanFiles("md/", path.join(basePath, "md"), true).then(() => {
    scanFonts(path.join(basePath, "assets")).then(() => {
      app.listen(process.env.NEXT_PUBLIC_PORT, "0.0.0.0");
    });
  });

  // The exam module's routes, behind the same authentication as everything
  // above. Its client assets under /exam/assets/ are served by its own router,
  // so the allowlist above gains that mount only while the module is active.
  // With the module off, a path under /exam/ falls through to the catch-all
  // like any path with nothing behind it.
  if (examModule) {
    app.use("/exam", checkAuthenticated, examModule.router);
  }

  // If file is not found, redirect to the start page.
  app.use((_, res) => res.redirect(getStartPage()));

  // The end of every chain that fails. A session that ended while its request
  // was being handled is answered the way checkAuthenticated answers a request
  // without one. Anything else fails this request alone: it is recorded and
  // answered with a 500, and the process - with every other user's session in
  // its memory - keeps running.
  app.use((error, req, res, next) => {
    if (error instanceof SessionEndedError && !res.headersSent) {
      answerUnauthenticated(req, res);
      return;
    }
    console.error(`Request ${req.method} ${req.originalUrl} failed:`, error);
    if (res.headersSent) {
      // Express's own handler closes a response that has already started.
      next(error);
      return;
    }
    res.status(500).end();
  });
}

/**
 * The identity layer of an instance that runs with Keycloak: the session
 * middleware `initKeycloak` mounted, and the reader's preferences in the
 * account's user attributes.
 */
const keycloakIdentity = {
  mode: "keycloak",
  checkAuthenticated,
  preferences: {
    /** The body `GET /userattributes` answers with: the whole session user. */
    async read(req) {
      await refreshAccessToken(req);
      return req.user;
    },
    /** Stores the preference block; resolves to whether it was stored. */
    write(req, res, block) {
      return setUserAttribute(req, "config", JSON.stringify(block));
    },
    rememberLastVisited(req, res) {
      rememberLastVisited(req);
    },
  },
};

/**
 * The identity layer of an instance without an identity provider
 * (`anonymous-publishing`): nobody signs in, so nothing is refused for want of
 * a session, and the reader's preferences live in the reader's browser. The
 * roles every reader holds are `READER_ROLES`, read by `permission-context.js`.
 */
const readerIdentity = {
  mode: "none",
  checkAuthenticated: (req, res, next) => next(),
  preferences: readerPreferences,
};

if (authMode === "none") {
  // No issuer discovery, no session store, no passport and no SESSION_SECRET:
  // initKeycloak is never called, and keycloak.json is never read.
  registerRoutes(app, readerIdentity);
} else {
  initKeycloak(app).then(() => registerRoutes(app, keycloakIdentity));
}
