# Agent usability evaluation

How we find and fix places where coding agents struggle to write and read doan designs (2026-10-24 user). Bugs and regressions go to [POSTMORTEM.md](./POSTMORTEM.md); this document tracks usability for agents — guide text, CLI and MCP output, `doan check` rules and product behavior as agents experience them.

## Loop

1. **Discover** — `/agent-eval` rounds (fixed scenarios in `eval/`, real Claude Code and Codex), and moments where an agent stalls while we use doan ourselves (dogfooding).
2. **Record** — one issue row below: how it was found, the layer, evidence.
3. **Improve** — guide or output wording through `/ship`; product changes through `/feature`.
4. **Re-measure** — run the same scenario again with `/agent-eval <id>`.
5. **Pin** — a fixed issue gets a scenario so a later round catches a regression. Existing scenarios are not edited; a changed scenario gets a new id.

Layers: `guide` (the `doan skill` body or the stub), `output` (CLI/MCP results, error messages, `nextSteps`, tool descriptions), `check` (`doan check` rules), `product` (app or CLI behavior).

## Issues

| ID | Found | Source | Layer | Problem | Evidence | Status | Fix | Scenario |
|---|---|---|---|---|---|---|---|---|
| U-001 | 2026-10-24 | agent-eval baseline | product (with output) | Under Codex's `--sandbox workspace-write`, the shell path `doan active` cannot reach the app socket: `connect: operation not permitted` is reported as `app_not_running` with the nextStep "If Doan is open, a sandbox may block this shell from its socket; call the MCP `active` tool instead". Codex follows it and looks for the MCP `active` tool, which works only when the doan MCP server is registered (onboarding registers it). The round pins doan MCP off, so it could not verify the MCP fallback; without it Codex asked the user "Which element should get the primary-color background?" (3 of 3 runs). | `.scratch/agent-eval/baseline-20261024/R2-codex/codex-rollout.jsonl` (`doan active --json` → `{"error":{"code":"app_not_running","message":"Cannot connect to Doan: dial unix …/rt/app.sock: connect: operation not permitted",…}}`), `.scratch/agent-eval/baseline-20261024-repeat/R2-codex-{1,2}/codex-rollout.jsonl` | open | — | R2 |

## Rounds

| Date | Agents | Guide sha256 | CLI | Results | Notes |
|---|---|---|---|---|---|
| 2026-10-24 | Claude Code 2.1.310, Codex 0.164.0 | — | 0.1.0 | first-prompt canvas: both pass (`doan check` 0 errors, 0 warnings) | Manual observation before the scenario suite existed (onboard task 11, PRODUCT §6). Not comparable with suite rounds. |
| 2026-10-24 | Claude Code 2.1.310, Codex 0.164.0 | 7e57236dfda7 | 0.1.0 | R1: claude pass, codex pass; R2: claude pass, codex fail/fail/fail; R3: claude pass, codex pass; R4: claude pass, codex pass; R5: claude pass, codex pass; W1: claude pass, codex pass; W2: claude pass, codex pass | First suite round (`baseline-20261024`, repeat `baseline-20261024-repeat`; judges on; real-state unchanged). R2-codex is not a Codex mistake: its session logs show `doan active --json` ran in all three runs and was denied by the sandbox (U-001), then Codex asked the user as the guide allows. Two scenario/runner defects, not usability issues, to fix with a new scenario id or a runner change: (1) R2 cannot pass for Codex under the pinned config (`workspace-write` blocks the socket and doan MCP is disabled); (2) Codex stderr omits commands when one tool call runs several `exec_command`s, so `asked_doan_active` and the judge ("never ran `doan active`") were wrong — commands should come from the Codex session log. The only other judge stall (R2-claude, a shell glob error) is not doan's. |
