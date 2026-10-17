## Why

`/convert` lets every logged-in session make the server fetch a URL of its choosing (`mdGetToHtml`, `app.js:163`), and the server forwards that session's `Cookie` header to the named host. That is a server-side request forgery into whatever the server can reach, and it hands the session cookie to a foreign host. Nothing of ours uses the route: not `obsidian-page.js`, not the Obsidian plugin, not a corpus page. It is a leftover demo, so the fix is to remove it rather than harden it.

## What Changes

- **BREAKING** `GET /convert?url=…` and `POST /convert` (body `{url}` or `{content}`) are removed, together with the server-side fetch behind them. A request to `/convert` is answered like any path the application does not serve: the catch-all sends it to the start page. There is no replacement endpoint, no deprecation answer and no fallback.
- The application no longer fetches a URL that a request names, for any route.
- The application renders Markdown from corpus files only. The rule that a whole-file directive governs Markdown with no corpus file behind it loses its only case and is removed. The page keeps reading its directive from the file on disk rather than from the index, which is a separate requirement that stays.
- The harness's `POST /convert` probe for directive refusals is replaced by corpus fixtures, so the same directions stay covered: a role no account holds refuses every non-admin session, a closed window refuses with its own message, a met directive lets the body through with the directive line stripped.
- Docs, the demo links on the fallback start page, the httpYac collection for `/convert` and the `axios` dependency go too, once nothing else imports it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `corpus-index`: "Content with no index entry is governed by the directive it carries" is removed. Its second scenario, that a page follows the directive on disk and not the index, moves into a new requirement of its own.
- `deployment-surface`: a new requirement says that no route fetches a URL named by a request, and that `/convert` is answered as an unserved path.

## Impact

- **`app.js`:** both `/convert` handlers, `mdGetToHtml`, the `axios` import and the stale comment in the middleware order go.
- **`obsidian.js`:** the `/convert/` special case in `getTopBar` (title from `req.query.url`) and the mention in the `resolveFileVisibility` comment go. `resolveFileVisibility` keeps taking a parsed directive, because the page handler parses it from the file it has just read.
- **`index.html`:** the two sample links to `localhost:8080/convert/?url=…` go.
- **`package.json`:** `axios` is dropped if nothing else imports it (today only `app.js` does).
- **Tests:** `test/checks/permissions.js` loses the `convert` helper and its test. A new fixture `md/test-fileperms-nobody.md` joins `restrictedFiles`, and `test/coverage-map.json` is updated to match.
- **Docs:** `docs-technical-details.md` (the `/convert` sections), `docs-render-pipeline.md` (the two `/convert` cases), `AI/architecture.md` (dependency table, feature table, route table, `http/`, middleware order, the settled observation's justification).
- **`http/md.http`:** removed, since it holds `/convert` requests only.
- **Other open changes:** `attachment-access-control` and `publishing-without-keycloak` already reference this change and work in either landing order.
- **Downstream:** secureLectures picks this up through the usual sync. Anyone who bookmarked a `/convert?url=…` link lands on the start page.
