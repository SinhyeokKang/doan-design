# Directory layout

Where things live, one entry per directory. File-level detail is in the code; rules and boundaries are in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Root

- `go.mod`, `go.sum`: the root Go module. `.node-version`: the Node version for local runs and CI.
- `LICENSE`, `README.md`, `AGENTS.md`; `.gitattributes`: `.doan/**` as linguist documentation.
- `.agents/skills/<name>/`: development skills (source); `.claude/skills/<name>` are symlinks to them. `verify/scripts/` holds the shared gate (`verify.mjs`) and its tests.
- `.claude/settings.json`: Claude Code settings, including the response-style `UserPromptSubmit` hook.
- `.github/`: issue forms (`ISSUE_TEMPLATE/`), the pull request template and `workflows/` (the CI gate and the signing workflows).
- `docs/`: product, architecture and working documents; `docs/features/<slug>/` holds active feature plans, audit reports and chain files.
  - `design/`: the measured screen sections, one file per screen group; `docs/DESIGN.md` is their index.
  - `postmortem/`: postmortem entries, one file per month; `docs/POSTMORTEM.md` is their index.
  - `usability-eval/`: `/agent-eval` rounds, one file per month; `docs/USABILITY-EVAL.md` holds the loop and the issue list.
- `docs/assets/readme/`: the README's feature images, exported from the frames of `.doan/canvases/readme-features.html`.
- `.scratch/`: ignored experiments, probe scripts and evidence.

## CLI (Go)

- `cli/cmd/doan/`: the `doan` binary; `main` only calls `cli.Run`.
- `cli/internal/cli/`: command dispatch, flags, envelopes and exit codes, command bodies, the embedded `doan skill` guide (`skill.md`), the app socket clients (`active`, `work`, `open`, `handoff`, `send`, `remove`, `onboarding`) and shell check session records.
- `cli/internal/designskill/`: the embedded design presets — `catalog.json`, `presets/`, `notices/` — and their loader; `SOURCES.md` maps upstream sources to presets and is not embedded.
- `cli/internal/repo/`: repo discovery, config, storage mode, path resolution, canvas listing, the serving scope, read-only Git metadata, and the `git init` (with rollback) that `--git-init` runs.
- `cli/internal/canvas/`: the pure HTML canvas model and CSS scanner. Its `testdata/` directory holds the CSS scanner golden fixture.
- `cli/internal/check/`: the pure `doan check` rules.
- `cli/internal/export/`: the `doan export` pipeline — local references resolved against the serving scope, HTML and CSS rewritten into data, the size cap and the viewer page assembly (`ARCHITECTURE.md` §3 'Exported canvas and viewer').
  - `viewer/`: the embedded page files of the exported canvas viewer and the exported prototype player; `app/src/main/exportViewer.test.ts` pins their copies of app code.
  - `exporttest/`: seed repository fixtures that only tests import.
- `cli/internal/formats/`: Go validation.

## Shared formats

- `schema/`: JSON Schema sources for every shared format; `embed.go` embeds them for Go.
- `schema/fixtures/<format>/`: shared inputs and expected results for Go and TypeScript tests, including valid and invalid format examples.

## App (Electron + TypeScript)

- `app/`: the npm project, build and test configuration (`package.json` also carries the electron-builder settings), `components.json` (shadcn), `.npmrc` (exact pins) and `.oxlintrc.json` (lint configuration).
- `app/scripts/`: packaging, the release checks the signing workflows, `/tester-build` and `/release` run, and the buddy motion golden generators. `app/resources/`: the packaged app icon source, the installer disk background and the signing entitlements.
- `app/src/main/`: the Electron main process (`index.ts` is the entry) — window, menus, IPC, local server wiring, folder lifecycle, CLI runner, persistence and notifications. Subdirectories:
  - `agentAuth/`: Doan-owned agent sign-in, vault, profiles and provider usage reads, with usage and metadata `fixtures/`.
  - `agentSetup/`: launch-time agent setup for sessions outside Doan.
  - `conversation/`: the agent conversation backend (runners, admission, store, IPC) and its protocol `fixtures/`.
  - `document/`: canvas document evidence and the shared object guard.
  - `mcpConnectors/`: MCP connectors for Claude Code and Codex — the server list and pending-logout files, the provider MCP commands (Claude's sign-in in a pty), status and logout rules, the Codex startup and approval rules, IPC, and provider-output `fixtures/`.
  - `onboarding/`: first run and the session shared with the Add Projects page, clone, the skill stub `SKILL.md`, and completion-record and earlier-stub `fixtures/`.
  - `prototype/`: the prototype window's Electron-free contract — the mark, playability, window fit, targets, request validation, the lifecycle transitions and their controller, history and the IPC types, and the prototype window's conversation scope and the relays and reports it shares with main — which the renderer also imports.
  - `serve/`: the local canvas server.
  - `update/`: in-app updates — pure eligibility, schedule, state, error and view rules the renderer shares, and the electron-updater service (only `app/src/main/update/service.ts` drives the updater).
- `app/src/preload/`: the main window's `window.doan` API and the prototype window's `window.doanPrototype`.
- `app/src/renderer/`: the React renderer (`main.ts` is the entry, `App.tsx` the root) — screens, the canvas controller, the conversation UI, pure view rules with their tests; `prototype/` the prototype window's UI (its page is `prototype.html`, beside `index.html`), `ds/` the design-system CSS and checks, `components/ui/` shadcn components, `public/` static assets (fonts, provider and MCP preset marks, `doany/` and `buddies/` buddy files).
- `app/src/formats/`, `app/src/restore/`: pure modules shared by main and renderer (TypeScript format validation, UI-state restore planning).
- `app/src/brand/`: test-only product-name checks (Go counterpart in `cli/internal/cli/brand_test.go`).
- `app/runtime/`: reusable support for focused real-Electron probes (isolation, cleanup, real-state fingerprints, native helpers) and the real-DOM Electron harness app Vitest's injected-script drift tests run in, with Node tests in the shared gate.

## Design canvases

- `.doan/canvases/`: draft canvases of Doan's own UI.
- `.doan/ds/`: design-system canvases, one per token group, shared component or shared surface.
- `.doan/assets/`: canvas-only assets (shared canvas styles, provider and MCP server marks, installer icons, Doany sources, fonts).
  - `buddies/`: the buddies' sources (cards, transparent stills and layers, contact shadows, painter GIFs, generation prompts), the shared eye, the group photo, and the motion drafts the app's goldens come from; rig numbers and provenance in its `README.md`.
- `.doan/seen/`: legacy canvas read-state records used to migrate existing projects to app-local storage.
- `.doan/config.json`: token CSS and extra serve paths for this repo.

## Agent evaluation

- `eval/run.ts`: real rounds and `--self-test`; `eval/lib/`: workspace isolation, agent and judge commands, the fake app socket, checks and records, with tests and recorded agent-output `fixtures/`.
- `eval/scenarios/<id>/`: one fixed scenario each (prompt, rubric, checks, fixtures); `_example` is self-test only; tests beside them cover scenario checks.
