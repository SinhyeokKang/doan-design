# AGENTS.md

> The source of the working rules for this repo. Claude Code and Codex both read this file — there is no mirror and no generator.

## Response style (takes precedence over every other rule in this document)

**Reply in Korean, concisely.** If a reply violates this, rewrite it. The items below are pass/fail criteria, not preferences.

- **Language policy** (2026-10-21 user): Korean is used only for (a) conversation between the agent and the user (replies, reports) and (b) feature documents under `docs/features/<slug>/` (spec·design·tasks). Everything else is English: AGENTS.md, skills (`.agents/skills`), `docs/` (PRODUCT.md, ARCHITECTURE.md, and future docs), README.md, code comments, commit messages, and PR title/body.
- **Plain register** (2026-10-21 user): Korean replies and reports use the plain non-honorific style (`~했다`, `~이다`, `~할까?`), not 존댓말 (`~습니다`, `~해요`). This also covers AskUserQuestion text and interim updates.
- **The first sentence is the conclusion**: no preamble or announcement — do not open with phrases like "~해보겠습니다" ("I'll go ahead and…"), "좋은 질문입니다" ("Good question"), or "확인해보니 다음과 같습니다" ("Having checked, here is what I found"). Start with the answer or result.
- **No embellishment**: drop evaluative or agreeing phrases such as "완벽합니다" ("Perfect"), "훌륭한" ("great"), "핵심적인" ("key"), "말씀하신 대로" ("as you said") whenever removing them loses no information.
- **No restating**: do not re-explain in prose a diff, command output, or file content you just showed.
- **Length cap**: simple question or confirmation → 3 lines or fewer. Task-completion reports have no line cap — do not cut needed information just to make them short.
- **Unfinished work and failures first**: put what you could not do, failed verification, and skipped scope before the success summary.
- **No listing of options**: pick one recommendation and give one line of reasoning. The only exception is a point where the user must decide ("State assumptions" under Working principles).
- **Exception**: code, commit messages, and PR title/body are in English (see the language policy above).
- For Korean phrasing, also follow [Korean writing rules](#korean-writing-rules) below.

Enforcement has two layers: this section (shared by both runtimes), and the `UserPromptSubmit` hook in `.claude/settings.json`, which re-injects **a summary of this section** into the context every turn (so the start of the document does not fade in long sessions). **The hook is Claude Code only, so Codex sessions have only this section.**

## Korean writing rules

These apply to conversation replies and reports to the user, and to feature documents (`docs/features/<slug>/`). They target text that is newly written or revised within the scope of a request; they do not mean rewriting all existing text. **Meaning and the reader's understanding are the criteria.**

- **Preserve content first.** Do not change numbers, dates, proper nouns, quotes, negations, conditions, exceptions, causal relations, or who performs an action. Also keep possibility, inference, and obligation distinct. Do not insert an arbitrary subject into a passive sentence whose subject is unknown.
- **Make sentences read as if written in Korean from the start.** Undo unnecessary nominalization, double passives, and strings of abstract nouns, and use verbs to say who does what. Reduce `~에 대해` and `~를 통해` only when a more direct particle or verb conveys the same meaning.
- **Write concrete content instead of empty words.** Remove unsupported praise or exaggeration, introductions and conclusions that add no content, and coinages or metaphors whose meaning is hard to grasp. Do not invent facts or examples to make content more concrete.
- **Keep the relations between sentences.** Split long sentences along condition, action, and result, but keep needed connectives and commas. Do not mix registers to vary the rhythm.
- **Fix terms.** Do not swap a term for a synonym just to avoid repetition (for canvas, frame, comment, inspector, and so on, use the words in docs/PRODUCT.md and docs/ARCHITECTURE.md).
- **Finally, compare against the original.** Check that shortened or rewritten parts did not change information, conditions, or certainty. Leave sentences that already read naturally as they are.

| 다듬기 전 | 다듬은 뒤 | 판단 |
|---|---|---|
| 변경 사항에 대한 검토를 수행합니다. | 변경 사항을 검토합니다. | 목적어와 동사를 바로 연결 |
| 설정 화면을 통해 언어의 변경이 가능합니다. | 설정 화면에서 언어를 바꿀 수 있습니다. | 명사화를 풀되 가능성은 보존 |
| 저장되어진 값 | 저장된 값 | 이중 피동만 제거 |

## This project

Doan Design (`doan`): a tool where a coding agent writes an HTML canvas (a design spec) inside a code repo, and a human views it and points at things in a local Mac app (approval comes after the MVP). The web (`doan.design`) serves only as the path for downloading the app. Naming: product `Doan Design` · domain `doan.design` · CLI and identifiers `doan`.

⚠️ **The source of truth for planning decisions is [docs/PRODUCT.md](./docs/PRODUCT.md) (product judgment, decision log) and [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) (structure, formats, conventions). Anything not in those two is undecided.**

- [README.md](./README.md) holds only background and references. **Do not cite README content as a decision** — say "the README draft wrote this", not "the README decided this".
- The stack is decided (ARCHITECTURE §7·§8: app Electron + TypeScript, CLI Go). Even so, **do not lay down** `package.json`, `go.mod`, directory structure, or build settings without a request.
- For out-of-scope requests (PRODUCT §3 'Out of scope': drawing · enforcing a canvas format · conversation · waking agents · servers · git operations · real-time co-editing), ask back first, citing that list, even when asked.
- When a decision is made, write it with its date in the relevant document (PRODUCT or ARCHITECTURE), and add one line with its rationale to the decision log (PRODUCT §7). Widen this file's harness to match the decision as well.

## Working principles

- **State assumptions**: if there are several interpretations, do not silently pick one — present the options. If unsure, ask. Much is still missing from PRODUCT.md, so this principle comes up especially often.
- **Propose a simpler way if there is one**: do not add flexibility, configurability, or abstraction that was not requested. **Building ahead for extensibility is itself a defect.**
- **Surgical changes**: no adjacent improvements or refactors not directly related to the request. Follow the existing style. Remove only orphans your own change created.
- **Turn tasks into verifiable goals**: "fix the bug" → "reproduce, then confirm it passes". For multi-step work, first present a plan that includes a verification check for each step.
- **Do not report unverified things as passing.** Leave verification you lacked the tools for or could not run as unfinished, and report what you could not do.
- **Leave evidence for references**: for ideas taken from other tools (Claude Design · Orca · ego-browser · Storybook, etc.), write where they came from. Do not assert from memory; check what can be checked.

## Commands

- `go test ./...` — Go tests, from the repo root.
- `go vet ./...` — Go static checks, from the repo root.
- `go run ./cli/cmd/doan <command> [--repo <path>] [--json]` — run the CLI by hand (2026-10-21 user, cli-core). Point `--repo` at a temporary directory, not this repo.
- `npm --prefix app test` — TypeScript tests (`vitest run`).
- `npm --prefix app run typecheck` — TypeScript checks (`tsc --noEmit`).
- App setup (2026-10-21 user, app-shell): `npm --prefix app ci`, then `node -e "require('electron')"` from `app/` once to download the Electron binary (Electron 45 has no postinstall).
- `npm --prefix app run build` — build the app into `app/out/` (`electron-vite build`).
- `npm --prefix app run e2e` — build, then run the Playwright `_electron` smoke (`app/e2e/runtime.ts`); it builds the CLI itself, uses a temporary userData, and prints screenshot paths under `.scratch/runtime-test/`.
- `DOAN_CLI=<abs path to doan> npm --prefix app run dev -- -- --user-data-dir=<tmp>` — run the app by hand without touching the real `~/Library/Application Support/doan/`.
- `go build -o <tmp>/doan ./cli/cmd/doan` — build the CLI for `DOAN_CLI`.
- Real-agent MCP check (2026-10-21 user, mcp) — one-off registration that leaves global config untouched; compare `claude mcp list` / `codex mcp list` before and after, and pass an absolute temp `repo` on every tool call:
  - `claude -p --mcp-config <tmp.json> --strict-mcp-config --allowedTools 'mcp__<name>__*' -- "<prompt>" < /dev/null` (`--allowedTools` is variadic, so `--` must precede the prompt).
  - `codex exec -c 'mcp_servers.<name>.command="<abs binary>"' -c 'mcp_servers.<name>.args=["mcp"]' "<prompt>" < /dev/null`, run inside a git checkout (Codex refuses untrusted directories). From a Claude session this crosses the model boundary and needs the user's permission each time.

## Workflow (skill lineup)

The source for the 10 skills is `.agents/skills/<name>/SKILL.md` (2026-10-21, ported the pipeline from malmoi `.claude/commands/` to fit doan — the deploy, DB, and translation stages were dropped).

**Recommended flow**: `/feature` → (`/feature-review`) → `/tdd` → `/implement` → (`/runtime-test`) → `/code-review` → `/refactor` → (`/postmortem`) → push. A small change goes all the way to push with `/ship` alone; a large batch to split across several workers runs through `/orchestrate`.

- **Terms** (2026-10-21 user): a **feature** is a logical division of the MVP feature list (PRODUCT §5). One feature = one `/feature` run = one `docs/features/<slug>/`. A **batch** is a bundle of work that `/orchestrate` hands to a worker when implementing one feature. One feature can be implemented by several workers and several batches.
- `/feature` is the starting point of a feature. Its output goes in `docs/features/<slug>/` (spec·design·tasks); when the feature is done, promote the conclusions to PRODUCT.md (product judgment) and ARCHITECTURE.md (structure, formats, conventions) and delete that directory.
- `/code-review` refers to this repo's skill. It is different from Claude Code's built-in `code-review`.
- `/runtime-test` (2026-10-21, app-shell) launches the real app and checks it; run it after `/implement` or `/refactor` whenever `app/` changed, before `/code-review`.
- If you fixed a regression or bug, run `/postmortem`. `/implement` · `/refactor` · `/code-review` grep `docs/POSTMORTEM.md` before starting (when the file exists).
- `/ship` · `/orchestrate` always start by creating a `feat-<slug>` branch from main and end with a push of that branch + a PR. They do not merge.

## Documents

| Document | What | When to update |
|---|---|---|
| [README.md](./README.md) | Background (the malmoi case) and references, in English. Decisions live in PRODUCT.md | When changing the background |
| [docs/PRODUCT.md](./docs/PRODUCT.md) | **Source of truth for product judgment**, in English — problem · users · scope · loop · MVP · feature split · PoC · decision log (all decisions) · open questions | When a product decision is made. Every decision gets one line in the §7 decision log |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | **Source of truth for structure**, in English — conventions (the baseline for skills and `doan check`) · formats · rendering · CLI↔app · MCP · skills · stack · distribution · moving between machines | When a structure, format, or conventions decision is made. When a feature is done, promote its conclusions here |
| `docs/features/<slug>/` | Feature documents (spec·design·tasks) from `/feature`, **in Korean**. Deleted once the conclusions are promoted | While the feature is in progress |
| docs/POSTMORTEM.md | Record of pitfalls from bugs and regressions (append only), in English. `/postmortem` creates it on first write | When a regression is fixed |
| Documents to create later | `docs/DIRECTORY.md` (first code) · `docs/DESIGN.md` (when dogfooding starts, after feature 5) · `docs/OPERATIONS.md` (feature 8 `onboard-dist`) · `docs/CONTRIBUTING.md` · `docs/CODE_OF_CONDUCT.md` · `docs/SECURITY.md` (right before going public) · root `LICENSE` (when the license is decided). All in English | Create them when that time comes. Do not create empty shells ahead of time (2026-10-21 user) |
| [AGENTS.md](./AGENTS.md) | How we work (this file), in English — the shared source for both runtimes | When the way we work changes |

## Commit conventions

- **Branches** (2026-10-21 user): there are two paths.
  - **Code changes** are requested by the user via `/ship` or `/orchestrate`. Both skills start by creating a `feat-<slug>` branch from main and end with a push of that branch + a PR. Even a docs-only change takes the same path if it goes through these skills.
  - **Harness and docs changes** (AGENTS.md · skills · hooks · PRODUCT.md, etc.) are fixed directly during the conversation. Commit them on whichever branch is checked out — do not switch branches just for a harness change (2026-10-21 user). On main, push straight to main; on a `feat-<slug>` branch, they reach main with its PR.
  - There is no deploy server, so there is no dev/main split.
- **Commit messages are in English**, Conventional Commits (`feat:` `fix:` `docs:` `docs(scope):` `chore:`).
- Split commits per document.
- **Write comments in English, and only the "why"** (2026-10-21 user — the project will be open-sourced, so outside contributors must be able to read them). Do not repeat the "what" the code already says. Record non-obvious constraints and pitfalls.
- Put one-off experiment files in `.scratch/` (gitignored).
- PoC (PRODUCT §6) experiment code also goes in `.scratch/`, but record whether it passed and what was observed, with the date, in PRODUCT §6. `.scratch/` is not committed, so results are not kept there.
- Commits made in a Codex session end with `Co-Authored-By: Codex <noreply@openai.com>` as the last line. This is to tell from the history which runtime made a commit (the same rule as malmoi `.agents/PREAMBLE.md`).

## Runtime differences

- **⚠️ Do not create `CLAUDE.md` at the root.** Claude Code (v2.1.277+) reads `AGENTS.md` only when there is no `CLAUDE.md` in the working directory or anywhere above it. If a `CLAUDE.md` appears, this file is ignored without warning. If Claude Code-only rules are truly needed, add a `CLAUDE.md` whose first line is `@AGENTS.md`.
- **Bedrock · Vertex · Foundry sessions do not read `AGENTS.md`.** If you need to work through those paths, use the `@AGENTS.md` import above.
- **The response-style re-injection hook is Claude Code only** (`.claude/settings.json`). Codex sessions keep only the response style at the top of this file, so maintain it even in long sessions.
- **Worker model boundary** — if the session calling workers or subagents is Codex, call only Codex models; if it is Claude Code, call only Claude models. Crossing model families is allowed only with the user's explicit permission.
- **Skill locations differ** — Claude Code looks in `.claude/`, Codex in `.agents/skills/`. The skills used to develop this repo have their source in `.agents/skills/<name>/SKILL.md`, and `.claude/skills/<name>` is a symlink pointing to that directory (2026-10-21 user). There is no generator or mirror sync. When you create a new skill, create the link too. These are different from the doan skill that the product installs into the user's agent (ARCHITECTURE §6 'Skills': `SKILL.md` stub + `doan skill`).

## References

- `~/code/malmoi` — the origin of this harness. The real-world case in the background (README §1) also came from there. **When referring to the harness, do not carry malmoi's stack or product rules over to this repo.**
- `~/.claude/projects/<checkout path slug>/memory/` — Claude Code-only personal memory (Codex does not read it). **The path differs per machine, so do not hard-code it in docs.**
