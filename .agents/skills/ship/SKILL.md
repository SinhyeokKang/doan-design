---
name: ship
description: Use to carry one small change through tdd→implement→code-review→refactor→(postmortem)→push in sequence. Proceeds automatically when gates pass, and stops and reports at failures and user-decision points.
---

Conducts one small, surgical change in the order **`/tdd` → commit → `/implement` → commit → `/code-review` → `/refactor` → (`/postmortem`) → docs freshness → push**. Sub-skills do the body of each step; `/ship` only handles order, gates, and stopping. There is no deploy step.

> A sub-skill's report ("Next: /refactor" etc.) is not the end of the turn. Inside `/ship`, run the next step in the same turn. The only things that stop it are the conditions under 'Stop' below.

## Usage

- `/ship <change description>` / `/ship` — targets the change just agreed on.
- `/ship bypass <change description>` — a large change whose design is already done in `docs/features/<slug>/`. Skips only the scope guard below; all other gates still run. Uses `tasks.md` as the plan source, and if the document splits the work into stages, runs only one stage at a time. Do not turn on `bypass` yourself if the user did not use it.

## 0. Intake

- **Scope guard**: spans multiple components (app, CLI, MCP, formats), out of scope (PRODUCT §3), changes ARCHITECTURE §1 'Conventions' or a structural decision, or a new feature that needs `docs/features/` — if any applies, stop and recommend starting with `/feature`. Out-of-scope items and decision changes do not pass even with `bypass` (they are user decisions).
- **Branch** (AGENTS.md 'Commit conventions', decided 2026-10-21): `/ship` always starts from main with `git switch -c feat-<slug>`. The same goes for docs-only changes. If already on `feat-<slug>`, keep using it. Write the name in the report. When running as an `/orchestrate` worker, use the branch the brief specifies.
- **Worktree ownership**: if `git status --porcelain` shows tracked changes (`M`, `D`, `A`, `R`) this session did not make, stop. It means another session is working in the same checkout. Untracked (`??`) is only reported. Base this on `git worktree list` output, not on someone saying "it's being done in another worktree".
- **Clean worktree**: if you have uncommitted changes of your own, commit them separately first. If that diff overlaps the current target, do not commit; stop (the tests-first order is already broken).
- **Command check**: see whether the AGENTS.md 'Commands' section has test and type-check commands for this area. If not, stop here and ask. Docs-only changes skip this check.

## Steps and gates

1. **`/tdd`** — gate: red confirmed (or a one-line reason it is a skip target). If unexpectedly green, stop.
2. **Commit #0 `test:`** — tests and fixtures only. Committing in a red state is normal. Skip only when `/tdd` created no files.
3. **`/implement`** — gate: all tests green + type check passes + 🔴/🟡 resolved. Collect the flags (format, docs, postmortem candidate).
4. **Commit #1 `feat:`/`fix:`** — implementation only.
5. **`/code-review`** — run the AGENTS-required `/runtime-test` first when `app/` changed; it must pass before review. Review itself has no gate. Pass findings to 6. If there is even one 🔴, 6 cannot be skipped. If 6 changes app code, repeat the affected runtime verification before accepting the revised review.
6. **`/refactor`** — skip if there are 0 findings or only ⚪. Stop if a stop condition hits (expected value, format, CLI contract, conventions change). Do not move on with 🔴 remaining.
7. **Commit #2 `refactor:`** — only if 6 changed code.
8. **`/postmortem`** [gated] — only if commit #1 is `fix:` or there is a postmortem candidate. If it changed something, commit with `docs(postmortem):`.
9. **Docs freshness** — skim the diff to be pushed once and see whether it disagrees with `docs/PRODUCT.md` or `docs/ARCHITECTURE.md`. If a decision was newly made or reversed, update the relevant section and the §7 decision log (date and rationale). If a feature started with `/feature` is finished, promote the conclusions to PRODUCT (product judgments) and ARCHITECTURE (structure, formats, conventions) and delete `docs/features/<slug>/`. If the way of working changed, update AGENTS.md. PRODUCT, ARCHITECTURE, and AGENTS.md are written in English. Split commits per document (`docs(PRODUCT): ...`).
10. **Final gate** — use [/verify](../verify/SKILL.md) at the HEAD to be pushed. Select `--runtime` and `--eval` from the change scope; unchanged implementation may reuse earlier runtime evidence under that skill's rule. Pure docs changes use targeted reference checks. The separate AGENTS `/agent-eval` requirement still applies.
11. **push** — `git push -u origin feat-<slug>`, then `gh pr create --base main`. PR title and body are in English. Claude sessions append the attribution line the session provides to the end of the body. Do not merge.

**Commit rules**: English Conventional Commits. Stage paths one at a time (no `git add -A` or whole directories). If `.env`, `*.pem`, or credential files are staged, stop. Claude session commits end with the `Co-Authored-By` line the session provides; Codex session commits end with `Co-Authored-By: Codex <noreply@openai.com>`.

## Stop (stop immediately and report)

The stop report is delivered to the user in Korean.

```
🛑 Stopped: <step> gate failed
Reason: <one line>
Worktree: mine only / ⚠️ someone else's tracked changes <paths> — gate results are not evidence
Push: not done / done (<hash>)
Current state: commits <hashes> / uncommitted <if any>
Remaining steps: <list>
Resume: <what the user needs to decide or fix for it to continue>
```

After stopping, do not work around or force through. Ask for user decisions one at a time with the runtime's question tool (AskUserQuestion in Claude Code), with one recommendation and an 'Other (type your own)' option.

## Final report

Delivered to the user in Korean. Put incomplete and unverified items at the top. Then: pass/skip (reason)/stop per step, commit hashes, whether bypass was used and the plan source, push target (`feat-<slug>` + PR URL), and the commands run with their results.

## Prohibited

- Do not bypass or force through gates. Do not report verification you could not run as passed.
- Do not bypass the worktree ownership gate.
- Do not override sub-skills' prohibitions.
- No `--force` push or `--no-verify` (if the user explicitly asks, show what will be lost and reconfirm).
- Do not merge PRs.
