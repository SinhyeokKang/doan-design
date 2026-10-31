---
name: agent-eval
description: Use to measure how well real coding agents (Claude Code and Codex) write and read doan designs, by running the fixed scenarios in eval/ against the packaged CLI, scoring them, and recording results and usability issues in docs/USABILITY-EVAL.md. Reports and records only; fixes go through /ship or /feature.
---

The discovery half of doan's usability loop: we find where agents struggle with doan, fix the cause, and re-measure with the same scenarios. The loop itself and the issue list live in `docs/USABILITY-EVAL.md`.

**Language**: the report to the user is in Korean. `docs/USABILITY-EVAL.md`, scenario files and commits are English.

## Usage

- `/agent-eval` — full round: every scenario × both agents, once each.
- `/agent-eval <scenario-id...>` — only those scenarios (re-measuring a fix).
- `/agent-eval --repeat <id...>` — run a failed scenario twice more to tell a real failure from chance.

Runner commands (ARCHITECTURE §14): full round `node eval/run.ts --round <name>`; some scenarios `--scenarios W1,R2`; one agent `--agents codex`; the repeat of a failure `node eval/run.ts --scenarios <id> --agents <agent> --repeat 2 --round <name>-repeat` (a new round directory; runs are numbered `-1`, `-2`). A round name that already exists is refused.

## When to run

- A PR changes the guide (`cli/internal/cli/skill.md`), CLI output and error messages, `doan check` rules, or the skill stub.
- Before a feature's last integration (`/orchestrate` §4 Integration).
- After Claude Code or Codex changes version.

## Model boundary

This skill runs Claude Code and Codex for real in every round and has the other family's model judge each run. That crossing is permanently allowed for this skill only (AGENTS.md 'Runtime differences'); record the agents and versions used in every round.

## Requirements

- The runner and scenarios: `eval/run.ts` and `eval/scenarios/<id>/` (ARCHITECTURE §14).
- `npm --prefix app run package` done at the HEAD being measured; the runner uses the bundled CLI so agents see what users get. In a fresh worktree run the app setup first (`npm --prefix app ci`, then `node -e "require('electron')"` from `app/`; AGENTS.md 'Commands').
- `claude` and `codex` on `PATH` and signed in, and `python3.12` on `PATH` (the real-state check and the scenarios' HTML checks use it).

## Steps

1. **Run** the runner for the requested scenarios. It isolates every run (fresh temp repo outside any checkout from the scenario seed, repo-level skill stub only, temp `DOAN_RUNTIME`; nothing is installed into the real home), gives the agent only the scenario prompt, and keeps the transcript, the final repo and timings under `.scratch/agent-eval/<round>/`.
2. **Score** each run in two layers and keep both:
   - automatic checks from the scenario (e.g. `doan check` errors, convention violations, comment events, which comments were resolved, files that must not change, typecheck/build for implementation scenarios) — these decide pass/fail;
   - a judge from the other model family scores the scenario rubric (pass / partial / fail with reasons). The judge never overrides a failed automatic check.
3. **Classify** every failure, partial and noticeable stall by its layer: guide text, CLI output or error message, `doan check` rule, or product feature. Quote the transcript line that shows it. Separate a scenario or runner defect (a check or the run setup scored a reasonable run wrong) from a doan usability problem: the former is not an issue row; list it in the round notes for a new scenario id or a runner fix.
   - Codex stderr is not a complete command log (Codex 0.164): when one tool call runs several commands, stderr prints an `exec` header for only one of them, so transcript checks and the judge can miss a command. Before blaming a Codex run, read `<run>/codex-rollout.jsonl`, which the runner copies from `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*-<session id>.jsonl` (`~/.codex` when `CODEX_HOME` is unset). If `codex-rollout-error.txt` is there instead, find the log by hand (the session id is on stderr) and copy it into the run directory as evidence.
4. **Record** in `docs/USABILITY-EVAL.md`: one round row (date, agents and versions, guide hash, CLI version, per-scenario results) and one issue row per new problem (or a note on an existing issue). Do not record what you did not observe.
5. **Report** to the user: results table, new and recurring issues, and a recommended next step per issue (`/ship` for guide or output wording, `/feature` for product changes, a new scenario when a fixed issue needs a regression check).

## Prohibited

- Do not change product code or the guide in this skill. A change to a scenario's task, seed or intent needs a new scenario id to preserve comparison with earlier rounds. A checker fix that only corrects false results or a rubric clarification that only makes existing intent explicit (no change to task, seed or checks) may be applied in place with a note on the affected round.
- Do not install skills or register MCP in the real home for a run.
- Do not report a run as passed when an automatic check failed or a run was not executed.
