# Doan

> The agent draws; the human views and points. Design drafts live in the code repo.

A doan (도안, 圖案) is a drawing made in advance of the shape of something to be built. Doan is a Mac app and CLI where a coding agent (Claude Code, Codex and others) writes an HTML canvas (a design spec) inside a code repo, and a human views that canvas, selects elements and leaves comments for the agent to apply.

Naming: product `Doan` · domain `doan.design` · CLI and identifiers `doan`

> **Status: in development, not released.** macOS on Apple silicon only; there is no signed build or installer yet. The source of truth for product decisions is [docs/PRODUCT.md](./docs/PRODUCT.md), and for structure and formats [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## How it works

1. The agent writes `.doan/canvases/<spec>.html` and checks it with `doan check`.
2. The human opens the repo in the Doan app, zooms and jumps between frames; the view reloads when the file changes.
3. The human selects an element or frame and leaves a comment. Comments are append-only JSONL in `.doan/comments/`, shared through git.
4. The agent reads them with `doan comments` and `doan active` (the current selection), edits the canvas, runs `doan check` and resolves the comments. The human checks and reopens if needed.

Canvases use the repo's real token CSS, and frames can point at the files that implement them (`data-doan-implements`). Doan does not draw, run a server, or run git commands on the agent's behalf.

## What works today

- **App**: first-run sign-in to the agent connections (Claude Code, Codex, Cursor, Antigravity, GitHub Copilot; one account each) and project setup; a Home composer that starts a conversation with the signed-in agent; the project/canvas workspace with zoom, pan, frame jumps and Quick Open; element selection with a computed-style and token inspector; comments with pins, review and hand-off to the agent.
- **CLI `doan`**: `init`, `config`, `ls`, `comments`, `comment resolve`, `check`, `active`, `onboarding`, `skill`, `design-skill`. Everything except `active` and `onboarding` works without the app.
- **MCP**: `doan mcp` exposes the same functionality as MCP tools.
- **Skills**: opening Doan from Applications links its skill stub and the `doan` command for Claude Code, Codex, Cursor, GitHub Copilot and Antigravity, with no setup; the guide comes from `doan skill`, plus bundled design presets (adapted from Impeccable).

## Build from source

Requirements: macOS on Apple silicon, Node.js with npm, Go (see `go.mod`).

```sh
npm --prefix app ci
(cd app && node -e "require('electron')")   # downloads the Electron binary once
go test ./... && npm --prefix app test      # Go and TypeScript tests
npm --prefix app run package                # unsigned app/dist/mac-arm64/Doan.app with the bundled CLI
```

To run the CLI directly: `go run ./cli/cmd/doan <command> --repo <path> [--json]`. Development and verification commands are listed in [AGENTS.md](./AGENTS.md) 'Commands'.

## Documents

| Document | Contents |
|---|---|
| [docs/PRODUCT.md](./docs/PRODUCT.md) | Problem, users, scope, core loop, MVP, open questions |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Conventions, formats, rendering, CLI ↔ app, MCP, skills, stack |
| [docs/DESIGN.md](./docs/DESIGN.md) | Measured values of the app UI |
| [docs/DIRECTORY.md](./docs/DIRECTORY.md) | Directory layout |
| [AGENTS.md](./AGENTS.md) | How agents work in this repo |

## Background — friction from working with Claude Design

Doan comes from problems hit while running a Claude Design handoff → `/design-sync` loop during malmoi development (2026-09 to 10).

- **Conversation and tools are split.** Design conversations piled up in Claude Design and implementation conversations in code sessions. Codex could not use Claude Design or DesignSync at all, so the workflow split by runtime.
- **Agents could not read drafts properly.** Large drafts were truncated at 256 KiB, review was possible only through DOM text, and canvas notes outside frames had to be tracked separately.
- **Drafts lived apart from the code.** They did not know the project's real tokens and primitives, so implementations diverged even when every value matched (a modal pinned to the pixel diverged in 29 places with all tests green), and drafts showed commands and images that did not exist.
- **The source of truth wavered.** An old canvas was lost, the rule for when the draft stops being the source of truth was revised three times, and which board had been approved was recorded nowhere on the draft side. Standalone Claude Design shuts down on 2026-12-14 without migrating chats or comments.
- **Multiple machines and agents.** Access to drafts differed per machine, session and runtime; in orchestrations only some workers could read them.

## References

Tools consulted while planning; what was adopted is described in PRODUCT.md and ARCHITECTURE.md.

| Reference | What we looked at |
|---|---|
| Orca · ego-browser | Skill stub + binary guide, `status --json`, response envelope · `nextSteps`, runtime file discovery |
| open-claude-design | Router skill, meaningful exit codes, content-hash-based writes, width × theme render bundles |
| Doop · Agentation | Click-an-element notes, note lifecycle, mandatory screenshot review checklist |
| Storybook | Source of truth inside the repo, stable iframe URLs, width and theme as globals, render-complete signal |
| baoyu-design | In-repo `designs/` HTML conventions, allowed-token list, undefined-variable checks |
| Pencil.dev (now pen.dev) | Design files living in the repo, partial reads, text layout snapshots |
| Chromatic · git-appraise | Approval-complete rule, append-only JSONL review log |

## License

Apache-2.0 ([LICENSE](./LICENSE)).
