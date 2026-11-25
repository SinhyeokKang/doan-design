---
name: audit-loop
description: Use to run repeated /audit rounds that fix what they find without asking the user — the lead audits the whole codebase, splits findings by whether a fix changes what the user sees, starts /deliver and /orchestrate conductors for the rest, merges their PRs into develop, and audits again. Invoked by the user in the lead session; reports per round at the end.
---

# Audit loop

`/audit-loop [rounds]` (default 3) runs in the **lead** session on the develop checkout (AGENTS.md 'Workflow' Lead and conductors). Each round is one [/audit](../audit/SKILL.md) followed by fixes through conductors; the next round audits the merged result. The lead audits, triages, starts conductors, reviews and merges; it writes no fix code itself.

## Standing rules

- **Do not ask the user.** Neither the lead nor any conductor asks during the loop. What needs the user's decision is not fixed; the lead records it (below) and moves on.
- **The decision boundary is optimistic.** A finding needs the user only when fixing it changes a decided policy (a rule in PRODUCT or ARCHITECTURE) or changes usability from the user's side (a flow, a behavior they rely on, a screen's layout). Everything else is fixed without asking: internal contracts, boundaries, lifecycles, regression guards, test gaps, docs-to-code alignment, stale comments, small wording fixes, and bug fixes that restore documented behavior.
- **Model boundary** as in `/orchestrate` and `/chain` (AGENTS.md 'Runtime differences'): every agent stays in the lead's model family unless the user explicitly allows another for this run. When they allow it for fix workers, the conductor brief says so, and the conductor checks that family's remaining usage when it starts and when it splits batches.
- **Several conductors per round.** A round may run any number of `/deliver` and `/orchestrate` conductors in parallel. Findings that change the same files go to one conductor or merge in sequence (`/deliver` [lead.md](../deliver/lead.md) step 4).
- **develop only.** Fix PRs target develop. The loop never touches main, tags or releases.
- **Brief the terminal.** At the end of each stage (audit, triage, conductors started, each merge, round end) the lead prints a short briefing in its reply: what it did, the calls it made and why, and the next stage. The user reads them later; they are not questions.

## Round

1. **Audit.** Run [/audit](../audit/SKILL.md) on the whole codebase from the latest develop. Reports go to `docs/features/audit-YYMMDD/report.md`; a later round on the same date uses the audit skill's numeric suffix (`audit-YYMMDD-2`, `-3`). From round 2, the reviewer briefs list the areas the previous round's PRs changed and ask for regressions there first, and check that fixed findings are not reported again.
2. **Triage.** Mark each verified finding **user-visible** or not by the boundary above.
   - User-visible: add it to `docs/BACKLOG.md` when it is worth a feature — a High or Medium finding, or one on a primary workflow; leave the rest in the report only. Commit BACKLOG and the report on develop and push (AGENTS.md 'Commit conventions').
   - Not user-visible: group into fix batches by the files they change; one batch per conductor. A batch with several independent parts that is too large for one `/deliver` goes to `/orchestrate`.
3. **Start conductors** by [lead.md](../deliver/lead.md) step 1: a `<type>/<slug>` worktree from the latest `origin/develop`, and a brief that names `/deliver <change>` or `/orchestrate <plan>`, the report's finding ids with their evidence, and these lines in place of the default "asks the user directly for decisions":
   - Scope: no change the user sees beyond small wording fixes and documented-behavior bug fixes.
   - Do not ask the user. If a point needs the user's decision (the boundary above), do not fix that part; list it in the PR body under "Needs a user decision".
   - Only when the user allowed it for this run: workers may use the other model family; check its remaining usage at start and before splitting batches.
   Send a brief containing backticks from a file. Name any running conductor whose files overlap.
4. **Review and merge** by [lead.md](../deliver/lead.md) steps 2–5. After each merge, every other open fix PR merges `origin/develop` and reruns its gate before it merges, even without overlapping files when it touches the same behavior. Items under "Needs a user decision" go to BACKLOG by the triage rule. A regression found in a later round is fixed first in that round and recorded with [/postmortem](../postmortem/SKILL.md).
5. **Next round** once every PR of this round has merged and its worktrees are removed (branches stay).

## Final report

After the last round, report per round in Korean: fixed (PR numbers), added to BACKLOG, left in the report only, and unverified. Put unfinished work and failures first.
