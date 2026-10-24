---
name: agent-eval
description: Use to measure how well real coding agents (Claude Code and Codex) write and read doan designs, by running the fixed scenarios in eval/ against the packaged CLI, scoring them, and recording results and usability issues in docs/USABILITY-EVAL.md. Reports and records only; fixes go through /ship or /feature.
---

The discovery half of doan's usability loop (2026-10-24 user): we find where agents struggle with doan, fix the cause, and re-measure with the same scenarios. The loop itself and the issue list live in `docs/USABILITY-EVAL.md`.

**Language**: the report to the user is in Korean. `docs/USABILITY-EVAL.md`, scenario files and commits are English.

## Usage

- `/agent-eval` — full round: every scenario × both agents, once each.
- `/agent-eval <scenario-id...>` — only those scenarios (re-measuring a fix).
- `/agent-eval --repeat <id...>` — run a failed scenario twice more to tell a real failure from chance.

## When to run (2026-10-24 user)

- A PR changes the guide (`cli/internal/cli/skill.md`), CLI or MCP output and error messages, `doan check` rules, MCP tool descriptions, or the skill stub.
- Before a feature's last integration (`/orchestrate` step 5).
- After Claude Code or Codex changes version.

## Model boundary

This skill runs Claude Code and Codex for real in every round and has the other family's model judge each run. That crossing is permanently allowed for this skill only (2026-10-24 user, AGENTS.md 'Runtime differences'); record the agents and versions used in every round.

## Requirements

- The runner and scenarios: `eval/run.ts` and `eval/scenarios/<id>/` (built on `feat-agent-eval`, 2026-10-24). Until they exist, stop and say so.
- `npm --prefix app run package` done at the HEAD being measured; the runner uses the bundled CLI so agents see what users get.
- `claude` and `codex` on `PATH` and signed in.

## Steps

1. **Run** the runner for the requested scenarios. It isolates every run (fresh temp repo outside any checkout from the scenario seed, repo-level skill stub only, temp `DOAN_RUNTIME`; nothing is installed into the real home), gives the agent only the scenario prompt, and keeps the transcript, the final repo and timings under `.scratch/agent-eval/<round>/`.
2. **Score** each run in two layers and keep both:
   - automatic checks from the scenario (e.g. `doan check` errors, convention violations, comment events, which comments were resolved, files that must not change, typecheck/build for implementation scenarios) — these decide pass/fail;
   - a judge from the other model family scores the scenario rubric (pass / partial / fail with reasons). The judge never overrides a failed automatic check.
3. **Classify** every failure, partial and noticeable stall by its layer: guide text, CLI/MCP output or error message, `doan check` rule, or product feature. Quote the transcript line that shows it.
4. **Record** in `docs/USABILITY-EVAL.md`: one round row (date, agents and versions, guide hash, CLI version, per-scenario results) and one issue row per new problem (or a note on an existing issue). Do not record what you did not observe.
5. **Report** to the user: results table, new and recurring issues, and a recommended next step per issue (`/ship` for guide or output wording, `/feature` for product changes, a new scenario when a fixed issue needs a regression check).

## Prohibited

- Do not change product code, the guide or scenarios in this skill. Changing a scenario would break comparison with earlier rounds; add a new scenario id instead.
- Do not install skills or register MCP in the real home for a run.
- Do not report a run as passed when an automatic check failed or a run was not executed.
