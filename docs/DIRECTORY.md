# Directory layout

- `go.mod` and `go.sum`: root Go module and pinned dependencies.
- `cli/cmd/doan/`: the `doan` binary; `main` only calls `cli.Run`.
- `cli/internal/cli/`: `Run`, argument splitting, envelopes and exit codes, command bodies, human output, the embedded `doan skill` body (`skill.md`), the assembly of `check` input (Reach), and the `doan mcp` stdio server (`mcp.go`), plus `active.go` (runtime read, bounded unix-socket client and app-error mapping).
- `cli/internal/repo/`: repo discovery, config parsing, in-repo path resolution, canvas and comment file listing, and the serving scope (`scope.go`, shared by `ls` and `check`).
- `cli/internal/canvas/`: pure HTML canvas model and CSS scanner.
- `cli/internal/check/`: pure `doan check` rules.
- `cli/internal/comments/`: resolve-event construction (pure) and the one-write append.
- `cli/internal/formats/`: Go validation and comment-event folding, with tests.
- `app/`: npm project and TypeScript test/type-check configuration.
- `app/src/formats/`: TypeScript validation and comment-event folding, with tests.
- `app/electron.vite.config.ts`: build of main, preload and renderer into `app/out/` (ignored).
- `app/src/main/`: Electron main process — window, app menu, IPC, session permissions, canvas frame navigation and injection (`index.ts`), folder lifecycle (`shell.ts`), CLI runner, folder state, `folders.json` store, watcher, IPC view shapes, canvas frame and navigation rules (`canvasFrame.ts`), and the script injected into canvas iframes (`canvasScript.ts`, shipped as function source); `runtime.ts` (runtime file, socket protocol and selection filtering), `inspector.ts` (CDP session and request lifecycle), and `inspect.ts` (pure inspector provenance/value rows, recorded `inspect.fixture.json`); pure helpers have unit tests.
- `app/src/main/serve/`: local server — path parsing and scope checks (pure) and the HTTP server.
- `app/src/preload/`: the narrow `window.doan` API (built as CJS), including `setSelection` and `inspect` alongside folder operations and subscriptions.
- `app/src/renderer/`: React renderer (app-ui) — entry `main.ts` (no JSX), `App.tsx`, `Sidebar.tsx` (projects tree and frame list), `RightPanel.tsx` (Canvas info, Activity and the read-only Inspector), `components/ui/` (shadcn components), `CanvasController.ts` (imperative board and iframe), `styles.css` (Tailwind and the shadcn theme mapped to tokens) and `tokens.css` (design tokens shared with the draft canvas); pure helpers with tests: view math (`viewport.ts`), canvas message validation (`canvasMessage.ts`), what a list update or layout does to the open canvas (`canvasView.ts`), project row display (`projectRow.ts`), Activity (`activity.ts`) and Canvas info values (`canvasInfo.ts`), selection lifecycle/anchors (`selection.ts`) and inspector display notes/tokens (`inspector.ts`). The controller draws screen-space hover/selection marks outside the transformed board; `Sidebar.tsx` includes the selected-element child row.
- `app/e2e/`: Playwright `_electron` runtime suite used by `/runtime-test`: app shell, canvas view, app UI, selection/inspector and the real CLI/socket lifecycle. It fingerprints real folders/runtime files and uses temporary repos/userData.
- `app/components.json`, `app/.npmrc`: shadcn configuration and exact version pinning (`save-exact=true`).
- `design/`: draft canvases of doan's own UI (`app-shell.html`, `select-inspect.html`) and `mock.css` (colors of the example canvases drawn inside the draft); `.doan/config.json` points `tokenCss` at `app/src/renderer/tokens.css`.
- `.agents/skills/`: development skills (`.claude/skills/<name>` are symlinks to them).
- `schema/`: shared JSON Schema 2020-12 definitions (comment-event, config, CLI envelope, runtime and app-socket); `embed.go` embeds them for Go.
- `schema/fixtures/`: shared valid/invalid JSON (including runtime and app-socket request/response/selection) and JSONL folding fixtures used by both languages.
- `docs/`: product, architecture, and working documents.
- `.scratch/`: ignored experiments and local handoff evidence.

Schemas define the wire formats. Both implementations read the same fixtures;
there is no schema copy or type-generation step.
