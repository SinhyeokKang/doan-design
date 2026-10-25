---
name: verify
description: Run doan's shared sequential verification command for a change or integration. Covers Go and TypeScript checks, build, optional real Electron runtime tests and eval runner self-tests, retaining logs and propagating failures. Does not fix, commit, push, or merge.
---

# Shared verification

Read [AGENTS.md](../../../AGENTS.md), especially Commands and worktree ownership rules. This is the common executable gate for `/verify`, `/ship`, and `/orchestrate`; individual focused tests during implementation remain useful.

## Select the checks

From the repository root:

```bash
node .agents/skills/verify/scripts/verify.mjs
node .agents/skills/verify/scripts/verify.mjs --runtime
node .agents/skills/verify/scripts/verify.mjs --runtime --eval
```

- Default: runner regression tests, `go test ./...`, `go vet ./...`, app typecheck, app tests, and app build, sequentially.
- Add `--runtime` whenever `app/` changed, when integration includes app changes, or when full/runtime verification is requested. It runs `npm --prefix app run e2e`, which builds the app itself, instead of a separate build step. Read [/runtime-test](../runtime-test/SKILL.md) for prerequisites, isolation, and screenshot reporting; use this run's evidence without launching a duplicate suite.
- Add `--eval` when `eval/` changed or runner validation is requested. It runs the runner unit tests and `node eval/run.ts --self-test` with fake agents; it never calls real models.
- Changes covered by AGENTS' `/agent-eval` rule still require that separate skill. `--eval` does not substitute for real-agent evaluation.
- Pure prose/link edits may skip the heavy command, with a stated reason and targeted reference/skill checks. Changes to this runner require its regression tests and an actual shared-gate run. Do not treat executable scripts as docs-only.

## Execute

1. Inspect `git status --short` and `git worktree list`. State scope and selected flags. Do not certify another session's tracked edits as your own; resolve ownership before running an integration gate. Keep the checked worktree unchanged during execution.
2. Check required tools/dependencies from AGENTS. Runtime and eval self-tests require the documented environment, including `python3.12` for real-state checks. Do not install packages, alter global configuration, or weaken isolation to get a pass.
3. Coordinate with other workers before starting: no simultaneous runtime/stress suites or competing full test runs. The runner's `.scratch/verify/running.lock` prevents duplicate invocations in this checkout only; it cannot lock other worktrees or manual test commands. A stale lock requires inspecting the recorded PID and confirming the prior process is gone before removing it.
4. Run the command directly and wait for completion. Do not pipe through output filters that hide the exit code. The runner stops at the first failed command and retains each step's combined output plus `results.json` and initial HEAD/worktree context under `.scratch/verify/<run>/`.
5. Require exit 0 and the final `verify: PASS`. Runtime also requires its own `runtime-test: PASS`; eval self-test requires its own `self-test PASS` marker. Partial output, timeouts, signal termination, and a later successful step are not a pass. No automatic retries.

Cancellation sends a termination signal to the active process group and returns failure. On interruption, report incomplete checks and inspect any leftover processes before starting another run. Do not remove a live lock or launch parallel reruns to escape a failure.

## Use in a workflow

- `/ship`: retain the required runtime check before code review. Use this runner for the final common gate. Runtime evidence from the same implementation may be reused if no runtime-relevant files, dependencies, fixtures or configuration changed afterward; explicitly cite the prior run and omission. Otherwise include `--runtime` again.
- `/orchestrate`: run at the combined integration HEAD, with flags selected from the union of integrated changes. Worker passes alone do not verify their combination.
- A change after verification invalidates evidence for affected checks. Context records the starting HEAD and dirty paths, not an immutable snapshot. Record the verified state and do not claim a different revision passed.

## Report

In Korean, list failures, skipped checks and unverified scope first. Then give the recorded HEAD/worktree state, command/flags, step results, log directory, and runtime screenshot paths when applicable. Report a failure without silently fixing or relaxing a test. In a parent workflow, return the failure to that workflow's gate handling.

Runner regression tests alone:

```bash
node --test .agents/skills/verify/scripts/verify.test.mjs
```

Adapted from `~/code/malmoi/scripts/gate.ts` and `gate-plan.ts`, inspected on 2026-10-25: a shared sequential command, preserved logs and failure propagation. doan uses its existing AGENTS commands; database, deployment and mirror checks were not carried over.
