# Contributing to Doan

Thanks for your interest in Doan. This guide explains how decisions are made, how to set up, which branch to use, what to check before a pull request, and how the repository works with coding agents.

By taking part you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](./SECURITY.md), not in a public issue.

## Before you start

- [docs/PRODUCT.md](./PRODUCT.md) (product judgment) and [docs/ARCHITECTURE.md](./ARCHITECTURE.md) (structure, formats, conventions) are the sources of truth. Anything not in those two is undecided. The README is an introduction, not a decision source.
- For anything beyond a small fix, open an issue first. A change outside the scope in PRODUCT §3 ('Out of scope' in particular) needs a product decision before code.
- Known open questions and defects are in [docs/BACKLOG.md](./BACKLOG.md).

## Setup

Doan runs on macOS with Apple silicon. Build steps are in the README's 'Build from source' section. Every command the project uses, including how to run the app without touching your real settings, is in [AGENTS.md](../AGENTS.md) 'Commands'.

## Branches

- `develop` is the integration branch. Branch from `develop` as `<type>/<slug>`, where `<type>` is the Conventional Commit type of your main commit (`feat`, `fix`, `docs`, `chore`, `refactor`), and open your pull request against `develop`.
- `main` is the release record. It changes only when the maintainer cuts a release; never open a pull request against `main`.
- GitHub's default branch is `main`, so new pull requests start out against it: switch the base to `develop` before you open one.

## Checks

Run the shared gate before you open a pull request:

```
node .agents/skills/verify/scripts/verify.mjs
```

It runs the Go tests and vet, the app's typecheck, lint, tests and build, and the runtime-support tests, stopping on the first failure; logs go to `.scratch/verify/`. Add `--eval` when you change the agent evaluation runner in `eval/`.

CI runs the same gate (without `--eval`) as the `gate` check on every pull request to `develop` or `main`, and the maintainer merges a pull request only when it passes. If it fails, the job log shows the failing step's output. A pull request from a fork may need a maintainer to approve its first CI run before it starts.

## Commits

- [Conventional Commits](https://www.conventionalcommits.org/), in English (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, optionally with a scope).
- Code comments are in English and explain only the "why": constraints and pitfalls the code cannot say. Comments do not cite the planning documents under `docs/features/`, which are deleted when a feature is done; state the reason, or point to PRODUCT or ARCHITECTURE.

## Working with agents

- [AGENTS.md](../AGENTS.md) holds the working rules that Claude Code and Codex both read. It also carries maintainer preferences, such as the language agents reply in.
- `.claude/settings.json` has a `UserPromptSubmit` hook that re-injects that preference (Korean replies) on every Claude Code turn. To turn it off for yourself, add `.claude/settings.local.json` with `{ "disableAllHooks": true }`; that file is not committed.
- `docs/features/<slug>/` holds the maintainer's plans for features in progress. They are written in Korean, and when a feature is done its conclusions move into the English PRODUCT and ARCHITECTURE documents and the directory is deleted.
- Some development skills cannot run outside the maintainer's setup: `/tester-build` (needs the Developer ID certificate), `/agent-eval` (signs in to and changes real agent state), and `/orchestrate` and `/chain` (need Orca). The other skills under `.agents/skills/` work in any clone.

## License

By contributing you agree that your contributions are licensed under the [Apache License 2.0](../LICENSE).
