---
name: runtime-test
description: Use to check the Electron app in a real window — builds the CLI and the app, drives them with the Playwright `_electron` script in app/e2e/, and reports pass/fail with screenshot paths. Does not fix code or commit.
---

Runs the app the way a human would use it and reports what happened. Unit tests (`npm --prefix app test`) cover pure logic and the local server; this skill covers what only a real window shows: the folder dialog, the folder and canvas lists, watching, the local server as the window uses it, a restart, the canvas view, selection and inspector, the real CLI/socket lifecycle, and through the adapter modules onboarding, Home, Settings, thumbnails, Overview/Quick Open, comments, review and handoff flows.

**Language**: the report to the user is in Korean.

## When to invoke

- After a change to `app/src/main/`, `app/src/preload/`, `app/src/renderer/`, `app/electron.vite.config.ts` or `app/e2e/`, before `/code-review`.
- When a gate asks for `npm --prefix app run e2e`.

## Requirements

- macOS (the app is Mac-only), `go` and `node` (v23.6+ runs `.ts` directly; checked on v26) on `PATH`.
- `npm --prefix app ci` done. Electron has no postinstall, so download its binary once from `app/`: `node -e "require('electron')"`.
- `python3.12` on `PATH` (the real-state check parses `~/.codex/config.toml` with `tomllib`; AGENTS 'Commands').
- A display session: Playwright opens a real, visible window for a few seconds. Do not click inside it while it runs.

## Steps

1. **Run** `npm --prefix app run e2e` from the repo root. It does, in order:
   - build the app: `electron-vite build` into `app/out/`;
   - build the CLI: `go build -o <temp>/bin/doan ./cli/cmd/doan`; the app gets `DOAN_CLI` set to a gated wrapper (`doan-gated.mjs`) that runs it, so a step can hold CLI reads (an app started this way does not read `doan` from `PATH`);
   - drive the app with `app/e2e/runtime.ts`: a comment-filesystem check of the built main modules; temp repos (listed repo, broken config, not initialized, a subfolder and a symlink of the listed repo, a second checkout, canvas names whose byte order differs from locale order), the folder dialog replaced through `electronApp.evaluate`, DOM checks, refused picks (subfolders of the broken repo, one holding only `.doan/`), adding a canvas, deleting a folder and finding it again with Locate…, fetching a canvas (200 with `Access-Control-Allow-Origin: null`) and `.env` (404) over the serving URL, removing a project (Remove from doan) and restarting; a Set Up… form that closes with focus on its row when the folder is initialized, deleted, renamed or re-rooted outside the app;
   - then the canvas view on a canvas repo: the screen before a pick and while loading, iframe width and content height, fit (also a narrow board), wheel pan over the iframe and the margin, ctrl-wheel zoom around the cursor, an inner scroller, menu zoom / actual size / fit (menu items clicked from main; `getZoomFactor()` stays 1), a window resize, frame list labels and jumps (tall frame, repeated ids, a canvas without frames), live reload on a canvas edit and an atomic token CSS save but not on a comment or another folder, a `min-height: 100vh` canvas shrinking on live reload, the no-width / deleted canvas / broken config states, the 5 s failure state and Reload, in-canvas links (sidebar mark, height after a link, a listed canvas with another width becoming the open one, refused links outside the token or to another folder key, the unlisted line after `about:blank` and after a CSP-blocked link, reloads, a forged layout, a listed canvas without a width keeping the drawn width with toolbar / menu zoom and fit still working), and permissions and CSP on the app's main frame;
   - then the app-ui steps (2026-10-22; updated through project-feedback, 2026-10-26): Canvas info values (Path, ID, Width, Frames) and Activity (Opened, then Reloaded on top for each reload, nothing for a failed load, Reloaded after a retry succeeds); the Overview with Feedback as the right panel (no Canvas info region) and Reload canvas, Zoom out, Zoom in and Fit disabled with Zoom "—"; Home row recovery — Locate… on a Missing project (a still-missing folder stays Missing), Retry on a Config error row with Reading… held by a gated CLI wrapper, and Remove from doan from the row menu; a project folder moved while its canvas is open ("The project canvas is missing. Use Locate… to find it.", then "No canvas open" in Canvas info with the same disabled controls); the tree keyboard (↑↓ move focus without opening, Enter and Space open without reloading the open canvas, ←→ collapse and expand, Home, title typeahead with a 500 ms reset, static frame rows including a repeated id, the jump highlight with reduced motion) with focus kept across list updates and row removal, tree auto-scroll suppressed while the tree has focus or the pointer, nested folders expanded by an in-canvas link and remembered per root; and the window lifetime (Close Window from the menu and `close()` hide the window with the process alive, a canvas edited while hidden, `app.emit("activate")` shows the same window with project, canvas, view and Activity kept, and the same after closing from fullscreen).
   - then select-inspect (2026-10-23): runtime file `{v,socket,token}` and 0600/0700 modes read from disk; wrong-token rejection and a not-open project; no selection; real pointer selection and screenshot-pixel mark alignment at scales 0.05/0.25/1/4 and after inner scrolling (1px tolerance); a held genuine click reply delivered after real Alt down/up (hover traffic must not cancel selection); hover/Option visibility, direct same-element re-entry and Option release after focus moves into the canvas; Esc, canvas body and direct board-margin clearing; forged stale/over-cap/nested-window messages and script-generated clicks; frame-list/empty-frame selection, current state, selected-element child and ancestor buttons; Option-click input focus followed by plain-click blur and Esc; Ctrl/right-click suppression; Option-link navigation and download cancellation; reload reanchor and lost-selection notice; active for the selected project and another open project, also while hidden; invalid selection IPC clearing; other/deleted/unlisted canvases and project close clearing; accepted nested-iframe limitation (app focus does not select it, prior canvas focus can).
   - S14–S16 inspector steps use actual CDP rows for combined padding tokens, hex colors, Hardcoded, Default's native title, inherited values, hover winner and Unknown source (`color: inherit`, not an unreadable CDN). A temporary main-handler wrapper exposes an actual failed inspection and holds an older response until a newer selection renders, then confirms the reason and stale-response rejection. The wrapper is restored in finally; there are no test-only product APIs.
   - at the end, a second process with the same temporary userData exits promptly, shows the first window and leaves runtime bytes unchanged; normal quit removes runtime.json/socket/directory, and the CLI returns `app_not_running`. These are runtime gates, not real-agent checks; do not launch Claude/Codex as part of this skill.
   - after the runtime suite has closed with no collected failure, `runtime.ts` imports the adapter modules in order — `anchors.ts`, `comments-ui.ts`, `onboarding.ts`, `projects-home.ts`, `thumbnails.ts`, `design-nav.ts`, `revision-continuity.ts`, `revision-recheck.ts`, `agent-handoff.ts`, `project-feedback.ts`, `quit-capture.ts`, `settings.ts`. Each launches its own app with its own temp repos, userData and HOME, runs its own real-state check and prints its own PASS line; each file's header comment lists its scenarios. Any module failure fails the run, and `runtime-test: PASS` is printed only after all of them.
   - **How it reads the window** (2026-10-22, app-ui): panel and control reads use role, accessible name, ARIA state (`aria-current`, `aria-expanded`, `disabled`), status/chip text and native title strings. Geometry checks read the board transform and decorative `.overlay > .mark.hover|selected` nodes (no role), plus fixture element geometry/focus and screenshot pixels. Existing C7 checks iframe replacement structurally. These exceptions do not read hidden React state. Product code has no test-only attributes (select-inspect update, 2026-10-23).
2. **Isolation**: every launch gets `--user-data-dir=<temp>` and a temp `HOME`, `TMPDIR`, fake `SHELL`, `CLAUDE_CONFIG_DIR`/`CODEX_HOME` under that HOME and a pre-written `onboarding.json` (`isolatedEnv` in `runtime.ts`). Every CLI active call passes `DOAN_RUNTIME=<temp userData>/runtime.json`; the MCP equivalent is server environment, not a tool argument. `app/e2e/real-state.ts` fingerprints the real setup targets around every suite and fails on any change: `~/Library/Application Support/doan/` (`folders.json`, `runtime.json`, `onboarding.json`, `ui-state.json`, `thumbnails`), `~/.local/bin/doan`, the `doan` skill directories, and the `doan` MCP entries in `~/.claude.json` and `~/.codex/config.toml` (plus their `CLAUDE_CONFIG_DIR`/`CODEX_HOME` locations). Temp repos and userData are deleted at the end unless the app's exit is unconfirmed; screenshots are not.
3. **Screenshots**: saved under `.scratch/runtime-test/<timestamp>/` (`1-opened.png`, `2-restarted.png`, `3-canvas.png` (a canvas fitted to the view), `4-frame.png` (after a frame jump), `5-restored.png` (the window shown again after hiding), `6-selection.png` (selected element and sidebar child), `7-inspector-values.png` (collected CDP rows and source states), and `failure.png` when a step fails). The adapter modules save theirs under `.scratch/runtime-test/<module>-<stamp>/`, except `anchors.ts` (`.scratch/comments-ui-A/`) and `comments-ui.ts` (`.scratch/U2/runtime/`); `comment-filesystem.json` sits beside the runtime screenshots. Open the PNGs and look at them before reporting.
4. **Report**:

```
runtime-test: PASS | FAIL
Failed step: <the step comment in runtime.ts and the assertion message>  (FAIL only)
Screenshots: <absolute paths>
Observed: <one line per screenshot — what the window shows>
Commands: npm --prefix app run e2e (exit <code>)
```

- Some product regressions (Set Up… focus and selection steps) are collected so the suite can reach the remaining steps, and a collected failure stops the run before the adapter modules; completion of a later step or its screenshot does not mean the run passed. Require the final PASS line and exit 0. Read all collected failures.
- A baseline PASS is not a mutation or completeness claim. E's origin, IPC sender and Go response-schema mutation evidence is unit/Go-only; async quit cleanup also survived e2e. E2's optional `DOAN_E2E_INSPECT_MUTATION=failure|stale node app/e2e/runtime.ts` uses the existing built app with test-harness protocol interception and is expected to fail S15/S16; it is a deliberate mutation check, never an ordinary runtime PASS. Record combined mutations as combined evidence.

## When it fails

- `timed out waiting for: ...` prints the folders the window showed last; compare with the step's expectation.
- `<suite>: FAIL — suite timed out`: the suite passed its limit (300 s for `runtime.ts`; adapter modules set their own, up to 480 s). The guard closes the app, still attempts the real-state verification, and deletes the temp dir only when the app's exit is confirmed (`app exit unconfirmed; retaining temp artifacts` otherwise).
- `ERR_MODULE_NOT_FOUND` or a blank window: run `npm --prefix app run build` alone and read its output.
- `electron` cannot launch: the binary was not downloaded (see Requirements).
- Report the failure with the screenshot. Do not edit the e2e expectations to make a run pass; a changed expectation is a decision for `/tdd` or the user.

## Prohibited

- Do not point the app at the real userData (`--user-data-dir` removed, or `app.setPath` in product code for tests).
- Do not add test-only paths to product code; replace Electron APIs from the script with `electronApp.evaluate`.
- Do not report PASS without the script's own `runtime-test: PASS` line and exit 0.
