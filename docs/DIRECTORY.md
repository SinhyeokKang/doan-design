# Directory layout

- `go.mod` and `go.sum`: root Go module and pinned dependencies.
- `cli/cmd/doan/`: the `doan` binary; `main` only calls `cli.Run`.
- `cli/internal/cli/`: `Run`, argument splitting, envelopes and exit codes, command bodies, human output, the embedded `doan skill` body (`skill.md`), the assembly of `check` input (Reach), and the `doan mcp` stdio server (`mcp.go`).
- `cli/internal/repo/`: repo discovery, config parsing, in-repo path resolution, canvas and comment file listing, and the serving scope (`scope.go`, shared by `ls` and `check`).
- `cli/internal/canvas/`: pure HTML canvas model and CSS scanner.
- `cli/internal/check/`: pure `doan check` rules.
- `cli/internal/comments/`: resolve-event construction (pure) and the one-write append.
- `cli/internal/formats/`: Go validation and comment-event folding, with tests.
- `app/`: npm project and TypeScript test/type-check configuration.
- `app/src/formats/`: TypeScript validation and comment-event folding, with tests.
- `app/electron.vite.config.ts`: build of main, preload and renderer into `app/out/` (ignored).
- `app/src/main/`: Electron main process — window and IPC (`index.ts`), folder lifecycle (`shell.ts`), CLI runner, folder state, `folders.json` store, watcher, and IPC view shapes; pure helpers have unit tests.
- `app/src/main/serve/`: local server — path parsing and scope checks (pure) and the HTTP server.
- `app/src/preload/`: the narrow `window.doan` API (built as CJS).
- `app/src/renderer/`: plain-DOM folder and canvas lists.
- `app/e2e/`: Playwright `_electron` smoke used by `/runtime-test`.
- `.agents/skills/`: development skills (`.claude/skills/<name>` are symlinks to them).
- `schema/`: shared JSON Schema 2020-12 definitions; `embed.go` embeds them for Go.
- `schema/fixtures/`: shared valid/invalid JSON and JSONL folding fixtures used by both languages.
- `docs/`: product, architecture, and working documents.
- `.scratch/`: ignored experiments and local handoff evidence.

Schemas define the wire formats. Both implementations read the same fixtures;
there is no schema copy or type-generation step.
