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
import path from "path";
import fs from "fs";
const __dirname = import.meta.dirname;

config();

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

const app = express();
app.set("trust proxy", true);

import { scanFiles, scanFonts, preParse, manipulateHtml, wrapInPage, wrapInReveal, splitForReveal, parseFirstLineForPermissions } from "./obsidian.js";
import { hasSomeRoles } from "./utils.js";

async function sanitizeAndParseMarkdown(data, req) {
  try {
    await refreshAccessToken(req);
    let d = data.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, "");
    // Look if the first line contains a permission directive
    // First, get the first line of d
    const firstLine = d.split("\n")[0];
    const permissions = parseFirstLineForPermissions(firstLine);
    if (permissions !== null) {
      if (!await hasSomeRoles(req, permissions, true)) {
        throw new Error("You do not have the required permissions to view this content.");
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
    url = "/test-md-file.md";
  }
  return url;
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
          sanitizeAndParseMarkdown(data, req).then((html) => {
            setUserAttribute(req, "lastVisitedUrl", req.originalUrl);
            wrapInPage(html, getStartPage(), req).then((r) => {
              res.send(r);
            });
          });
        }
      });
    } else {
      next();
    }
  });
  
  app.use(checkAuthenticated, express.static(path.join(__dirname, "/")));

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

  const basePath = process.env.NEXT_PUBLIC_IS_APP_FOLDER ? '/app/' : '.';
  scanFiles("md/", path.join(basePath, "md")).then(() => {
    scanFonts(path.join(basePath, "assets")).then(() => {
      app.listen(process.env.NEXT_PUBLIC_PORT, "0.0.0.0");
    });
  });

  // If file is not found, redirect to the start page.
  app.use((_, res) => res.redirect(getStartPage()));
});
