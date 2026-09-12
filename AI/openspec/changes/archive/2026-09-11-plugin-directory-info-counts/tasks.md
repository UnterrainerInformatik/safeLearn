## 1. Plugin implementation

- [x] 1.1 In `AI/plugin/main.ts`, `DirectoryInfoModal.onOpen()`: add a `safelearn-directory-info-summary` div, hidden by default, placed after the existing status line.
- [x] 1.2 Compute `classLikeValues(entries)` once (reuse for both the summary and the existing Classes list) and set the summary text to the user count (`entries.length`) and class count on a successful (`ok`) fetch outcome; leave it hidden otherwise.
- [x] 1.3 In `AI/plugin/styles.css`, add a rule for `.safelearn-directory-info-summary` consistent with the surrounding directory-info styles.

## 2. Build and verify

- [x] 2.1 Run `npm run build` in `AI/plugin` to regenerate `main.js` from `main.ts`.
- [x] 2.2 Manually confirm in Obsidian (or by reading the rendered DOM) that the summary shows on a successful fetch and stays hidden when the status line reports a failure.
