---
name: runtime-test
description: Use to check the Electron app in a real window — builds the CLI and the app, drives them with the Playwright `_electron` script in app/e2e/, and reports pass/fail with screenshot paths. Does not fix code or commit.
---

Runs the app the way a human would use it and reports what happened. Unit tests (`npm --prefix app test`) cover pure logic and the local server; this skill covers what only a real window shows: the folder dialog, the folder and canvas lists, watching, the local server as the window uses it, a restart, and the canvas view.

**Language**: the report to the user is in Korean.

## When to invoke

- After a change to `app/src/main/`, `app/src/preload/`, `app/src/renderer/`, `app/electron.vite.config.ts` or `app/e2e/`, before `/code-review`.
- When a gate asks for `npm --prefix app run e2e`.

## Requirements

- macOS (the app is Mac-only), `go` and `node` (v23.6+ runs `.ts` directly; checked on v26) on `PATH`.
- `npm --prefix app ci` done. Electron has no postinstall, so download its binary once from `app/`: `node -e "require('electron')"`.
- A display session: Playwright opens a real, visible window for a few seconds. Do not click inside it while it runs.

## Steps

1. **Run** `npm --prefix app run e2e` from the repo root. It does, in order:
   - build the app: `electron-vite build` into `app/out/`;
   - build the CLI: `go build -o <temp>/doan ./cli/cmd/doan`, passed to the app as `DOAN_CLI` (an app started this way does not read `doan` from `PATH`);
   - drive the app with `app/e2e/runtime.ts`: temp repos (listed repo, broken config, not initialized, a subfolder and a symlink of the listed repo, a second checkout, canvas names whose byte order differs from locale order), the folder dialog replaced through `electronApp.evaluate`, DOM checks, refused picks (subfolders of the broken repo, one holding only `.doan/`), adding a canvas, deleting and re-opening a folder, fetching a canvas (200 with `Access-Control-Allow-Origin: null`) and `.env` (404) over the serving URL, closing a folder and restarting;
   - then the canvas view on a canvas repo: the screen before a pick and while loading, iframe width and content height, fit (also a narrow board), wheel pan over the iframe and the margin, ctrl-wheel zoom around the cursor, an inner scroller, menu zoom / actual size / fit (menu items clicked from main; `getZoomFactor()` stays 1), a window resize, frame list labels and jumps (tall frame, repeated ids, a canvas without frames), live reload on a canvas edit and an atomic token CSS save but not on a comment or another folder, the no-width / deleted canvas / broken config states, in-canvas links (sidebar mark, height after a link, refused links outside the token or to another folder key, `about:blank`, a CSP-blocked link then a reload, a forged layout), and permissions and CSP on the app's main frame.
2. **Isolation**: the app runs with `--user-data-dir=<temp>`, so `folders.json` lives in the temp directory. The script fails if `~/Library/Application Support/doan/folders.json` changed (sha256, or "absent") between start and end. Temp repos and userData are deleted at the end; screenshots are not.
3. **Screenshots**: saved under `.scratch/runtime-test/<timestamp>/` (`1-opened.png`, `2-restarted.png`, `3-canvas.png` (a canvas fitted to the view), `4-frame.png` (after a frame jump), and `failure.png` when a step fails). Open the PNGs and look at them before reporting.
4. **Report**:

```
runtime-test: PASS | FAIL
Failed step: <the step comment in runtime.ts and the assertion message>  (FAIL only)
Screenshots: <absolute paths>
Observed: <one line per screenshot — what the window shows>
Commands: npm --prefix app run e2e (exit <code>)
```

## When it fails

- `timed out waiting for: ...` prints the folders the window showed last; compare with the step's expectation.
- `ERR_MODULE_NOT_FOUND` or a blank window: run `npm --prefix app run build` alone and read its output.
- `electron` cannot launch: the binary was not downloaded (see Requirements).
- Report the failure with the screenshot. Do not edit the e2e expectations to make a run pass; a changed expectation is a decision for `/tdd` or the user.

## Prohibited

- Do not point the app at the real userData (`--user-data-dir` removed, or `app.setPath` in product code for tests).
- Do not add test-only paths to product code; replace Electron APIs from the script with `electronApp.evaluate`.
- Do not report PASS without the script's own `runtime-test: PASS` line and exit 0.
