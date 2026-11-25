# Contributing to Doan

Thanks for your interest in Doan. This guide explains how decisions are made, how to set up, which branch to use, what to check before a pull request, and how the repository works with coding agents.

By taking part you agree to follow the [Code of Conduct](https://github.com/SinhyeokKang/doan-design/blob/main/docs/CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](https://github.com/SinhyeokKang/doan-design/blob/main/docs/SECURITY.md), not in a public issue.

## Before you start

- [docs/PRODUCT.md](https://github.com/SinhyeokKang/doan-design/blob/main/docs/PRODUCT.md) (product judgment) and [docs/ARCHITECTURE.md](https://github.com/SinhyeokKang/doan-design/blob/main/docs/ARCHITECTURE.md) (structure, formats, conventions) are the sources of truth. Anything not in those two is undecided. The README is an introduction, not a decision source.
- For anything beyond a small fix, open an issue first. A change outside the scope in PRODUCT §3 ('Out of scope' in particular) needs a product decision before code.
- Known open questions and defects are in [docs/BACKLOG.md](https://github.com/SinhyeokKang/doan-design/blob/main/docs/BACKLOG.md).

## Setup

Doan runs on macOS with Apple silicon. Build steps are in the README's 'Build from source' section. Every command the project uses, including how to run the app without touching your real settings, is in [AGENTS.md](https://github.com/SinhyeokKang/doan-design/blob/main/AGENTS.md) 'Commands'.

## Branches

- `develop` is the integration branch. Branch from `develop` as `<type>/<slug>`, where `<type>` is the Conventional Commit type of your main commit (`feat`, `fix`, `docs`, `chore`, `refactor`), and open your pull request against `develop`.
- `main` is the release record. It changes only when the maintainer cuts a release with the `/release` skill or publishes documentation with `/publish`; never open a pull request against `main`.
- GitHub's default branch is `main`, so new pull requests start out against it: switch the base to `develop` before you open one.

## Checks

Run the shared gate before you open a pull request:

```
node .agents/skills/verify/scripts/verify.mjs
```

It runs its own runner tests, the runtime-support tests, the Go tests and vet, and the app's typecheck, lint, tests and build, stopping on the first failure; logs go to `.scratch/verify/`. The Go tests run part of the export viewer's JavaScript with `node`, so `go test ./...` also needs Node on `PATH`. Add `--eval` when you change the agent evaluation runner in `eval/`.

CI runs the same gate (without `--eval`), split into three parallel shard jobs, as the `gate` check on every pull request to `develop` or `main`, and the maintainer merges a pull request only when it passes. If it fails, the job log shows the failing step's output. A pull request from a fork may need a maintainer to approve its first CI run before it starts.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/), in English (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, optionally with a scope).
- Code comments are in English, one or two lines, and explain only what the code cannot say: a non-obvious constraint or pitfall. No restated "what" and no history; a longer reason goes in ARCHITECTURE. Comments do not cite the planning documents under `docs/features/`, which are deleted when a feature is done; state the reason, or point to PRODUCT or ARCHITECTURE.

## Working with agents

- [AGENTS.md](https://github.com/SinhyeokKang/doan-design/blob/main/AGENTS.md) holds the working rules that Claude Code and Codex both read. It also carries maintainer preferences, such as the language agents reply in.
- `.claude/settings.json` has a `UserPromptSubmit` hook that re-injects that preference (Korean replies) on every Claude Code turn. To turn it off for yourself, add `.claude/settings.local.json` with `{ "disableAllHooks": true }`; that file is not committed.
- `docs/features/<slug>/` holds the maintainer's plans for features in progress. They are written in Korean, and when a feature is done its conclusions move into the English PRODUCT and ARCHITECTURE documents and the directory is deleted.
- Some development skills cannot run outside the maintainer's setup: `/release` (merges into `main`, pushes a release tag, and approves and publishes the release), `/publish` (merges documentation into `main` and back into `develop`), `/tester-build` (pushes a tag to this repository and needs the maintainer to approve the signing environment), `/agent-eval` (uses existing agent credentials and can change real agent state). The lead/conductor workflows for `/deliver`, `/orchestrate`, `/chain`, `/audit-loop` and `/sec-audit-loop` require Orca.

## License

By contributing you agree that your contributions are licensed under the [Apache License 2.0](https://github.com/SinhyeokKang/doan-design/blob/main/LICENSE).
