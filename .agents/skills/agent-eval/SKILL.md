---
name: agent-eval
description: Use to measure how well real coding agents (Claude Code and Codex) write and read doan designs, by running the fixed scenarios in eval/ against the packaged CLI, scoring them, and recording rounds in docs/usability-eval/ and usability issues in docs/USABILITY-EVAL.md. Reports and records only; fixes go through /deliver or /feature.
---

The discovery half of doan's usability loop: we find where agents struggle with doan, fix the cause, and re-measure with the same scenarios. The loop itself and the issue list live in `docs/USABILITY-EVAL.md`.

**Language**: the report to the user is in Korean. `docs/USABILITY-EVAL.md`, the rounds files, scenario files and commits are English.

## Usage

- `/agent-eval` — full round: every scenario × both agents, once each.
- `/agent-eval <scenario-id...>` — only those scenarios (re-measuring a fix).
- `/agent-eval --repeat <id...>` — run a failed scenario twice more to tell a real failure from chance.

Runner commands (ARCHITECTURE §14): full round `node eval/run.ts --round <name>`; some scenarios `--scenarios W1,R2`; one agent `--agents codex`; the repeat of a failure `node eval/run.ts --scenarios <id> --agents <agent> --repeat 2 --round <name>-repeat` (a new round directory; runs are numbered `-1`, `-2`). A round name that already exists is refused.

## When to run

- A PR changes the guide (`cli/internal/cli/skill.md`): a full round, not only the scenarios the change targets, because every scenario reads the guide.
- A PR changes CLI output and error messages, `doan check` rules, or the skill stub.
- Before a feature's last integration (`/orchestrate` §4 Integration).
- After Claude Code or Codex changes version.

## Model boundary

A full round runs Claude Code and Codex for real and has the other family's model judge each run (`--agents` narrows a round to one agent; `--no-judge` skips judging). That crossing is permanently allowed for this skill only (AGENTS.md 'Runtime differences'); record the agents and versions used in every round.

## Requirements

- The runner and scenarios: `eval/run.ts` and `eval/scenarios/<id>/` (ARCHITECTURE §14).
- `npm --prefix app run package` done at the HEAD being measured; the runner uses the bundled CLI so agents see what users get. In a fresh worktree run the app setup first (`npm --prefix app ci`, then `node -e "require('electron')"` from `app/`; AGENTS.md 'Commands').
- `claude` and `codex` on `PATH` and signed in, and `python3.12` on `PATH` (the real-state check and the scenarios' HTML checks use it).

## Steps

1. **Run** the runner for the requested scenarios. It isolates every run (ARCHITECTURE §14 'Agent evaluation') and keeps the transcript, the final repo and timings under `.scratch/agent-eval/<round>/`.
2. **Score** each run in two layers and keep both:
   - automatic checks from the scenario, plus the runner's `agent_cli_provenance` check (e.g. `doan check` errors, convention violations, files that must not change, typecheck/build for implementation scenarios) — these decide pass/fail;
   - a judge from the other model family scores the scenario rubric (pass / partial / fail with reasons). The judge never overrides a failed automatic check.
3. **Classify** every failure, partial and noticeable stall by its layer: guide text, CLI output or error message, `doan check` rule, or product feature. Quote the transcript line that shows it. Separate a scenario or runner defect (a check or the run setup scored a reasonable run wrong) from a doan usability problem: the former is not an issue row; list it in the round notes for a new scenario id or a runner fix.
   - Codex stderr is not a complete command log: when one tool call runs several commands, stderr prints an `exec` header for only one of them, so transcript checks and the judge can miss a command. Before blaming a Codex run, read `<run>/codex-rollout.jsonl`, which the runner copies from the run's own `CODEX_HOME` (`sessions/YYYY/MM/DD/rollout-*-<session id>.jsonl`; ARCHITECTURE §14 'Isolation'). That home is removed with the workspace, so if `codex-rollout-error.txt` is there instead, the run's sessions are in `<run>/codex-sessions/`: find the log there by the session id on stderr and copy it into the run directory as evidence.
4. **Record**: the round goes in `docs/usability-eval/rounds-<YYYY-MM>.md` for the round's month (a new month gets a file with the same header and a line in the 'Rounds' list of `docs/USABILITY-EVAL.md`); issues go in `docs/USABILITY-EVAL.md`. Do not record what you did not observe.
   - The round: one row in the month's results table (date, agents and versions, guide hash, CLI version, per-scenario results with every fail and partial, the runner's exit code, round id, command and packaged build). A write-up below the table only when the row cannot carry it: what changed against the previous measure, whether the agents actually read the changed guide or preset text (from their transcripts), what is not verified, any state-guard failure, and the evidence paths. A runner exit 1 is not a pass even when every run passed.
   - Issues: one issue row per new problem in `docs/USABILITY-EVAL.md`, or a note on an existing issue.
   - A correction to an earlier round goes under 'Documentation corrections' in `docs/USABILITY-EVAL.md`, in a `### YYYY-MM-DD` subsection for the day it is made; the round's own record stays unchanged.
5. **Report** to the user: results table, new and recurring issues, and a recommended next step per issue (`/deliver` for guide or output wording, `/feature` for product changes, a new scenario when a fixed issue needs a regression check).

## Prohibited

- Do not change product code or the guide in this skill. A change to a scenario's task, seed or intent needs a new scenario id to preserve comparison with earlier rounds; the in-place checker and rubric fixes allowed are in ARCHITECTURE §14 'Agent evaluation'.
- Do not install skills or register MCP in the real home for a run.
- Do not report a run as passed when an automatic check failed or a run was not executed.
