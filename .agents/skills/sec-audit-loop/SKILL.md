---
name: sec-audit-loop
description: Use to run repeated /sec-audit rounds that fix what they find without asking the user — the lead runs the security audit, keeps findings local, starts /deliver and /orchestrate conductors for fixes that change no decision or usability, merges their PRs into develop, and audits again. Invoked by the user in the lead session; reports per round at the end.
---

# Security audit loop

`/sec-audit-loop [rounds]` (default 3) is [/audit-loop](../audit-loop/SKILL.md) with [/sec-audit](../sec-audit/SKILL.md) as each round's audit. Its standing rules, rounds, conductor briefs, review and merge steps apply unchanged, except for the points below, which come from /sec-audit 'Disclosure'.

- **Reports stay local.** Each round's report is `.scratch/sec-audit/<YYMMDD>[-n]/report.md`; nothing is committed for it. From round 2, reviewers also get the previous rounds' local reports, check that fixed findings are gone, and look for regressions in the areas the merged PRs changed first.
- **Triage.** The decision boundary is /audit-loop's. A finding that needs the user's decision is not added to BACKLOG, which is public: it stays in the local report under "Needs a user decision" and goes in the final report. Fix Critical and High findings first in the round.
- **Conductor briefs** point to the finding ids in the local report by absolute path in the lead's checkout (conductor worktrees do not have `.scratch/`), and add: public text (PR, commits, comments, test names, postmortem) names the defect class and the fix, never the exploit path or a payload; a point that needs the user's decision goes in the PR body as "Needs a user decision: <finding id> (local report)", without detail. Before the first push, the conductor reads every commit message, code comment, test name, fixture comment and postmortem line it adds against that rule: a pushed commit cannot be taken back without a force push, and a PR body's edits stay in its history.
- **Postmortem.** A regression fixed in a later round gets its `/postmortem` entry under the same rule: the class, the cause in code terms and the prevention, without an exploit path.
- **Release.** The loop never touches `main`, tags or releases. The final report lists the fixed findings that a release should carry and whether any may warrant a GitHub Security Advisory; publishing one is the user's decision.

## Final report

As in /audit-loop, in Korean, per round: fixed (PR numbers), needs a user decision (finding ids, local report path), left in the report, and unverified. Unfinished work and failures first.
