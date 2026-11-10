# Directory layout

Where things live, one entry per directory. File-level detail is in the code; rules and boundaries are in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Root

- `go.mod`, `go.sum`: the root Go module. `.node-version`: the Node version for local runs and CI.
- `LICENSE`, `README.md`, `AGENTS.md`; `.gitattributes`: `.doan/**` as linguist documentation.
- `.agents/skills/<name>/`: development skills (source); `.claude/skills/<name>` are symlinks to them. `verify/scripts/` holds the shared gate (`verify.mjs`) and its tests.
- `.claude/settings.json`: Claude Code settings, including the response-style `UserPromptSubmit` hook.
- `.github/`: issue forms (`ISSUE_TEMPLATE/`), the pull request template and `workflows/` (the CI gate `ci.yml`, and the signing workflows `test-build.yml` and `release.yml`).
- `docs/`: product, architecture and working documents; `docs/features/<slug>/` holds active feature plans, audit reports and chain files.
- `docs/assets/readme/`: the README's feature images, exported from the frames of `.doan/canvases/readme-features.html`.
- `.scratch/`: ignored experiments, probe scripts and evidence.

## CLI (Go)

- `cli/cmd/doan/`: the `doan` binary; `main` only calls `cli.Run`.
- `cli/internal/cli/`: command dispatch, flags, envelopes and exit codes, command bodies, the embedded `doan skill` guide (`skill.md`), the app socket clients (`active`, `work`, `open`, `handoff`, `onboarding`) and shell check session records.
- `cli/internal/designskill/`: the embedded design presets — `catalog.json`, `presets/`, `notices/` — and their loader; `SOURCES.md` maps upstream sources to presets and is not embedded.
- `cli/internal/repo/`: repo discovery, config, storage mode, path resolution, canvas listing, the serving scope and read-only Git metadata.
- `cli/internal/canvas/`: the pure HTML canvas model and CSS scanner.
- `cli/internal/check/`: the pure `doan check` rules.
- `cli/internal/export/`: the `doan export` pipeline — local references resolved against the serving scope, HTML and CSS rewritten into data, the size cap and the viewer page assembly (`ARCHITECTURE.md` §3 'Exported canvas and viewer').
  - `viewer/`: the embedded viewer page files (`shell.html`, `shell.css`, `lib.js`, `shell.js`, `measure.js`); `app/src/main/exportViewer.test.ts` pins their copies of app code.
  - `exporttest/`: seed repository fixtures that only tests import.
- `cli/internal/formats/`: Go validation.

## Shared formats

- `schema/`: JSON Schema sources for every shared format; `embed.go` embeds them for Go.
- `schema/fixtures/<format>/`: valid/invalid fixtures read by both the Go and the TypeScript tests.

## App (Electron + TypeScript)

- `app/`: the npm project, build and test configuration (`package.json` also carries the electron-builder settings), `components.json` (shadcn), `.npmrc` (exact pins) and `.oxlintrc.json` (lint configuration).
- `app/scripts/`: packaging (`package.mjs`) and the release checks the signing workflows, `/tester-build` and `/release` run (`checkReleaseVersion.mjs`, `verifySignedPackage.mjs`, and the pure checks they share in `releaseChecks.mjs`). `app/resources/`: the packaged app icon source, the installer disk background and the signing entitlements.
- `app/src/main/`: the Electron main process (`index.ts` is the entry) — window, menus, IPC, local server wiring, folder lifecycle, CLI runner, persistence and notifications. Subdirectories:
  - `agentAuth/`: Doan-owned agent sign-in, vault, profiles and provider usage reads, with usage and metadata `fixtures/`.
  - `agentSetup/`: launch-time agent setup for sessions outside Doan.
  - `conversation/`: the agent conversation backend (runners, admission, store, IPC) and its protocol `fixtures/`.
  - `document/`: canvas document evidence and the shared object guard.
  - `mcpConnectors/`: MCP connectors for Claude Code and Codex — the server list and pending-logout files, the provider MCP commands (Claude's sign-in in a pty), status and logout rules, the Codex startup and approval rules, IPC, and provider-output `fixtures/`.
  - `onboarding/`: first run and the session shared with the Add Projects page, clone, the skill stub `SKILL.md`, and completion-record and earlier-stub `fixtures/`.
  - `serve/`: the local canvas server.
  - `update/`: in-app updates — pure eligibility, schedule, state, error and view rules the renderer shares, and the electron-updater service (only `app/src/main/update/service.ts` drives the updater).
- `app/src/preload/`: the `window.doan` API.
- `app/src/renderer/`: the React renderer (`main.ts` is the entry, `App.tsx` the root) — screens, the canvas controller, the conversation UI, pure view rules with their tests; `ds/` the design-system CSS and checks, `components/ui/` shadcn components, `public/` static assets (fonts, provider marks, MCP preset marks, Doany's motion files and working-notice GIFs in `doany/`, every other buddy file, the shared eye and the Welcome group photo in `buddies/`).
- `app/src/formats/`, `app/src/restore/`: pure modules shared by main and renderer (TypeScript format validation, UI-state restore planning).
- `app/src/brand/`: test-only product-name checks (Go counterpart in `cli/internal/cli/brand_test.go`).
- `app/runtime/`: reusable support for focused real-Electron probes (isolation, cleanup, real-state fingerprints, native helpers), with Node tests in the shared gate.

## Design canvases

- `.doan/canvases/`: draft canvases of Doan's own UI.
- `.doan/ds/`: design-system canvases, one per token group, shared component or shared surface.
- `.doan/assets/`: canvas-only assets (`mock.css`, `ds-canvas.css`, `onboarding-grain.svg`, provider and MCP server marks, Doany sources, fonts).
  - `buddies/`: the buddies' sources (cards, transparent stills and layers, contact shadows, painter GIFs, generation prompts), the shared eye, the group photo and `motion-preview.js`, the motion draft the app's golden comes from; rig numbers and provenance in its `README.md`.
- `.doan/config.json`: token CSS and extra serve paths for this repo.

## Agent evaluation

- `eval/run.ts`: real rounds and `--self-test`; `eval/lib/`: workspace isolation, agent and judge commands, the fake app socket, checks and records, with tests and recorded agent-output `fixtures/`.
- `eval/scenarios/<id>/`: one fixed scenario each (prompt, rubric, checks, fixtures); `_example` is self-test only; `regression.test.ts` and `audit.test.ts` cover scenario checks.
