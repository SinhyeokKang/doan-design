# Directory layout

Where things live, one entry per directory. File-level detail is in the code; rules and boundaries are in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Root

- `go.mod`, `go.sum`: the root Go module.
- `LICENSE`, `README.md`, `AGENTS.md`; `.gitattributes`: union merge for `.doan/comments/*.jsonl` and `.doan/**` as linguist documentation.
- `.agents/skills/<name>/`: development skills (source); `.claude/skills/<name>` are symlinks to them. `verify/scripts/` holds the shared gate (`verify.mjs`) and its tests.
- `.claude/settings.json`: Claude Code settings, including the response-style `UserPromptSubmit` hook.
- `docs/`: product, architecture and working documents; `docs/features/<slug>/` holds active feature plans, audit reports and chain files.
- `.scratch/`: ignored experiments, probe scripts and evidence.

## CLI (Go)

- `cli/cmd/doan/`: the `doan` binary; `main` only calls `cli.Run`.
- `cli/internal/cli/`: command dispatch, flags, envelopes and exit codes, command bodies, the embedded `doan skill` guide (`skill.md`), the app socket clients (`active`, `onboarding`) and shell check session records.
- `cli/internal/designskill/`: the embedded design presets — `catalog.json`, `presets/`, `notices/` — and their loader; `SOURCES.md` maps upstream sources to presets and is not embedded.
- `cli/internal/repo/`: repo discovery, config, path resolution, canvas and comment listing, the serving scope and read-only Git metadata.
- `cli/internal/canvas/`: the pure HTML canvas model and CSS scanner.
- `cli/internal/check/`: the pure `doan check` rules.
- `cli/internal/export/`: the `doan export` pipeline — local references resolved against the serving scope, HTML and CSS rewritten into data, the size cap and the viewer page assembly (`ARCHITECTURE.md` §3 'Exported canvas and viewer').
  - `viewer/`: the embedded viewer page files (`shell.html`, `shell.css`, `lib.js`, `shell.js`, `measure.js`); `app/src/main/exportViewer.test.ts` pins their copies of app code.
  - `exporttest/`: seed repository fixtures that only tests import.
- `cli/internal/comments/`: resolve-event construction and the append.
- `cli/internal/formats/`: Go validation and comment-event folding.

## Shared formats

- `schema/`: JSON Schema sources for every shared format; `embed.go` embeds them for Go.
- `schema/fixtures/<format>/`: valid/invalid and folding fixtures read by both the Go and the TypeScript tests.

## App (Electron + TypeScript)

- `app/`: the npm project, build and test configuration (`package.json` also carries the electron-builder settings), `components.json` (shadcn) and `.npmrc` (exact pins).
- `app/scripts/`: packaging (`package.mjs`). `app/resources/`: the packaged app icon source.
- `app/src/main/`: the Electron main process (`index.ts` is the entry) — window, menus, IPC, local server wiring, folder lifecycle, CLI runner, persistence and notifications. Subdirectories:
  - `agentAuth/`: Doan-owned agent sign-in, vault and profiles.
  - `agentSetup/`: launch-time agent setup for sessions outside Doan.
  - `comments/`: canvas document evidence and the shared object guard.
  - `conversation/`: the agent conversation backend (runners, admission, store, IPC) and its protocol `fixtures/`.
  - `onboarding/`: first run and the session shared with the Add Projects page, clone, the skill stub `SKILL.md`.
  - `serve/`: the local canvas server.
- `app/src/preload/`: the `window.doan` API.
- `app/src/renderer/`: the React renderer (`main.ts` is the entry, `App.tsx` the root) — screens, the canvas controller, the conversation UI, pure view rules with their tests; `ds/` the design-system CSS and checks, `components/ui/` shadcn components, `public/` static assets (fonts, provider marks, Doany).
- `app/src/formats/`, `app/src/restore/`, `app/src/comments/`: pure modules shared by main and renderer (TypeScript format validation and folding, UI-state restore planning, comment projection used by eval H6/H7).
- `app/src/brand/`: test-only product-name checks (Go counterpart in `cli/internal/cli/brand_test.go`).
- `app/runtime/`: reusable support for focused real-Electron probes (isolation, cleanup, real-state fingerprints, native helpers), with Node tests in the shared gate.

## Design canvases

- `.doan/canvases/`: draft canvases of Doan's own UI.
- `.doan/ds/`: design-system canvases, one per token group, shared component or shared surface.
- `.doan/assets/`: canvas-only assets (`mock.css`, `ds-canvas.css`, provider marks, Doany sources, fonts).
- `.doan/config.json`: token CSS and extra serve paths for this repo.

## Agent evaluation

- `eval/run.ts`: real rounds and `--self-test`; `eval/lib/`: workspace isolation, agent and judge commands, the fake app socket, checks and records, with tests.
- `eval/scenarios/<id>/`: one fixed scenario each (prompt, rubric, checks, fixtures); `_example` is self-test only; `regression.test.ts` and `audit.test.ts` cover scenario checks.
