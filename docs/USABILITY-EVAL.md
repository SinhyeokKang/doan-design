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

## Rounds

| Date | Agents | Guide sha256 | CLI | Results | Notes |
|---|---|---|---|---|---|
| 2026-10-24 | Claude Code 2.1.310, Codex 0.164.0 | — | 0.1.0 | first-prompt canvas: both pass (`doan check` 0 errors, 0 warnings) | Manual observation before the scenario suite existed (onboard task 11, PRODUCT §6). Not comparable with suite rounds. |
