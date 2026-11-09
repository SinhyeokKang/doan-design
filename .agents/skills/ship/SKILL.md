---
name: ship
description: Use to carry one small change through tdd→implement→code-review→refactor→(postmortem)→push in sequence. Proceeds automatically when gates pass, and stops and reports at failures and user-decision points.
---

Conducts one small, surgical change in the order **`/tdd` → commit → `/implement` → commit → `/code-review` → `/refactor` → (`/postmortem`) → docs freshness → push**. Sub-skills do the body of each step; `/ship` only handles order, gates, and stopping. There is no deploy step.

> A sub-skill's report ("Next: /refactor" etc.) is not the end of the turn. Inside `/ship`, run the next step in the same turn. The only things that stop it are the conditions under 'Stop' below.

## Usage

- `/ship <change description>` / `/ship` — targets the change just agreed on.
- `/ship bypass <change description>` — a large change whose design is already done in `docs/features/<slug>/`. Skips only the scope guard below; all other gates still run. Uses `tasks.md` as the plan source, and if the document splits the work into stages, runs only one stage at a time. Do not turn on `bypass` yourself if the user did not use it.

## Lead (develop checkout)

When `/ship`, `/orchestrate` or `/chain` is invoked in the develop checkout, this session is the **lead** (AGENTS.md 'Workflow' Lead and conductors): it starts a conductor for the work and merges the result, and runs none of the steps below. Harness and docs changes it still makes itself on develop (AGENTS.md 'Commit conventions'). A lead holds several conductors at once; that is the point of the split.

**Messages between lead and conductor** go through the receiver's Orca terminal, never SendMessage: the two sessions usually run in different permission modes, so a cross-session message is held for approval in the receiver's terminal and expires unseen, and while that approval dialog is open the terminal refuses input.
- Lead → conductor: find the handle with `orca terminal list --worktree path:<conductor worktree> --json`, then `orca terminal send --terminal <handle> --text "<message>" --enter --wait-submit 15 --json`. A receipt with `turn_started` means the conductor took it; `input_accepted` alone means it is queued behind the current turn, so do not send it again.
- Conductor → lead: the same command against the lead's terminal (`--worktree path:<develop checkout>`).
- Start each message with `[lead]` or `[conductor <slug>]` and make it self-contained (the decision, its reason, what to change), because the receiver may read it turns later. A message that replaces an earlier decision says so.
- On `agent_prompt_blocked`, read the terminal (`orca terminal read`). If a dialog is open (a held message, a permission prompt), tell the user which terminal and what it asks; never answer it for them. Once it clears, reissue the exact command with the `--retry-request <id>` the error gave, never a fresh send, so the message is not delivered twice.

1. **Start the conductor.** Apply the scope guard (§0) first. Load the version-matched `orca-cli` guide, `git fetch origin`, then create the worktree, name its branch and start the conductor (`orca worktree create` has no `--branch` flag and names the branch `<git user>/<name>`):
   `orca worktree create --name <slug> --no-parent --base-branch origin/develop --repo path:<develop checkout> --json`, then `git -C <worktree> branch -m <type>/<slug>`, then `orca agent launch --agent <runtime> --worktree path:<worktree> --surface terminal --prompt "<brief>" --json`
   (`feat/<slug>` for `/orchestrate`; `<runtime>` is this session's model family unless the user allowed another.) The brief names the skill to run (`/ship <change>` or `/orchestrate <plan>`), says the branch is already checked out (do not create or switch branches), that it ends with a PR against develop and does not merge, that it asks the user directly for decisions, that a small extra change the user gives it goes on the same branch and PR, and that it messages the lead as 'Messages between lead and conductor' above says. Name any running conductor whose files overlap. Confirm the session started on the brief (the receipt's outcome, then its first output) before reporting.
2. **Watch.** A background loop wakes the lead when the conductor's PR opens or its terminal goes idle with no busy indicator; read the terminal then. Conductors' questions go to the user in their own sessions; the lead answers only what concerns its own decisions or other conductors.
3. **Review the PR.** It comes from the branch the lead created and targets develop. Wait for `gh pr checks <n> --watch --required`. Read the body and diff: scope matches the brief, no decision in PRODUCT or ARCHITECTURE changed without the user, unverified items are listed, the `/agent-eval` requirement (AGENTS.md 'Workflow') is met or its absence explained, and a finished feature is promoted with its directory deleted. Send findings to the conductor (`orca terminal send`) and re-review its push; the lead does not edit a conductor's branch.
4. **Resolve contention.** Merge PRs as they pass review, in the order the user or a chain file gives, otherwise in arrival order. After each merge, check the other open conductor PRs: one that now conflicts, or that changes the same files as what just merged, goes back to its conductor to merge `origin/develop` into its branch (no rebase or force push), resolve, rerun its gate and push; a shared-document conflict keeps develop's text and adds the branch's own. A PR whose files do not overlap merges as it is; the push gate on develop checks the result.
5. **Merge and clean up.** `gh pr merge <n> --merge`, then `git pull --ff-only` on develop. In the conductor's worktree, `git status --porcelain` must be empty and `git cherry origin/develop` must have no `+`; ask before discarding anything. Note the branch tip, remove the worktree with `orca worktree rm --worktree id:<repo-id>::<path> --json` (never `--delete-branch`; recreate the branch at its tip if the receipt shows it deleted), and confirm no child worktree of that conductor remains in `orca worktree list`. Report the merge commit and anything left.

The steps below are for the conductor and for `/orchestrate` workers.

## 0. Intake

- **Scope guard**: spans multiple components (app, CLI, formats), out of scope (PRODUCT §3), changes ARCHITECTURE §1 'Conventions' or a structural decision, or a new feature that needs `docs/features/` — if any applies, stop and recommend starting with `/feature`. Out-of-scope items and decision changes do not pass even with `bypass` (they are user decisions).
- **Branch** (AGENTS.md 'Commit conventions'): the conductor works on the `<type>/<slug>` branch the lead created and checked out for it, `<type>` being the Conventional Commit type of the change's main commit (`feat`, `fix`, `docs`, `chore`, `refactor`); a docs-only change is `docs/<slug>`. Do not create or switch branches. A small extra change the user gives the conductor later goes on the same branch, through the same steps, and into the same PR. Write the branch name in the report. Exception: on a `hotfix/<slug>` branch that `/release hotfix` created, keep it, change only the fix, and open the PR against main in step 11; `/release` merges it. When running as an `/orchestrate` worker, use the branch the brief specifies.
- **Worktree ownership**: if `git status --porcelain` shows tracked changes (`M`, `D`, `A`, `R`) this session did not make, stop. It means another session is working in the same checkout. Untracked (`??`) is only reported. Base this on `git worktree list` output, not on someone saying "it's being done in another worktree".
- **Clean worktree**: if you have uncommitted changes of your own, commit them separately first. If that diff overlaps the current target, do not commit; stop (the tests-first order is already broken).
- **Command check**: see whether the AGENTS.md 'Commands' section has test and type-check commands for this area. If not, stop here and ask. Docs-only changes skip this check.

## Steps and gates

1. **`/tdd`** — gate: red confirmed (or a one-line reason it is a skip target). If unexpectedly green, stop.
2. **Commit #0 `test:`** — tests and fixtures only. Committing in a red state is normal. Skip only when `/tdd` created no files.
3. **`/implement`** — gate: all tests green + type check passes + 🔴/🟡 resolved. Collect the flags (format, docs, postmortem candidate).
4. **Commit #1** — implementation only, typed by the change (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`); the branch's `<type>` is this commit's type.
5. **`/code-review`** — run the AGENTS-required `/runtime-test` first when app behavior changed; it must pass before review. Review itself has no gate. Pass findings to 6. If there is even one 🔴, 6 cannot be skipped. If 6 changes app code, repeat the affected runtime verification before accepting the revised review.
6. **`/refactor`** — skip if there are 0 findings or only ⚪. Stop if a stop condition hits (expected value, format, CLI contract, conventions change). Do not move on with 🔴 remaining.
7. **Commit #2 `refactor:`** — only if 6 changed code.
8. **`/postmortem`** [gated] — only if commit #1 is `fix:` or there is a postmortem candidate. If it changed something, commit with `docs(postmortem):`.
9. **Docs freshness** — skim the diff to be pushed once and see whether it disagrees with `docs/PRODUCT.md` or `docs/ARCHITECTURE.md`. If a decision was newly made or reversed, rewrite the relevant section to the current rule (rationale in the commit message). If a feature started with `/feature` is finished, promote the conclusions to PRODUCT (product judgments) and ARCHITECTURE (structure, formats, conventions) and delete `docs/features/<slug>/`. If the way of working changed, update AGENTS.md. PRODUCT, ARCHITECTURE, and AGENTS.md are written in English. Split commits per document (`docs(PRODUCT): ...`).
10. **Final gate** — use [/verify](../verify/SKILL.md) at the HEAD to be pushed. Select `--eval` when applicable; verify changed app behavior with a short `/runtime-test` probe and reuse unaffected evidence. Pure docs changes use targeted reference checks. The separate AGENTS `/agent-eval` requirement still applies.
11. **push** — `git push -u origin <branch>` (`<type>/<slug>`, or `hotfix/<slug>`), then `gh pr create --base develop` (the GitHub default branch is main, so name develop explicitly); on a `hotfix/<slug>` branch, `gh pr create --base main`. PR title and body are in English. Claude sessions append the attribution line the session provides to the end of the body. Do not merge; the lead reviews and merges. Stay available for its findings and for its request to merge `origin/develop` in (Lead step 4), and push fixes to the same PR.

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

Delivered to the user in Korean. Put incomplete and unverified items at the top. Then: pass/skip (reason)/stop per step, commit hashes, whether bypass was used and the plan source, push target (`<type>/<slug>` + PR URL), and the commands run with their results.

## Prohibited

- Do not bypass or force through gates. Do not report verification you could not run as passed.
- Do not bypass the worktree ownership gate.
- Do not override sub-skills' prohibitions.
- No `--force` push or `--no-verify` (if the user explicitly asks, show what will be lost and reconfirm).
- A conductor does not merge PRs; only the lead does (Lead step 5).
