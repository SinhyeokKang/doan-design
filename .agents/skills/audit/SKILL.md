---
name: audit
description: Audit the whole doan codebase against its decisions, contracts, boundaries, lifecycle rules, and regression history. Use for a repository-wide code audit rather than a diff review. Reports findings and coverage only; does not fix or commit.
---

# Codebase audit

Read [AGENTS.md](../../../AGENTS.md), [PRODUCT.md](../../../docs/PRODUCT.md), and [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) first. Those decisions define correctness; do not import another project's product rules.

## Scope and evidence

- `/audit` covers the current codebase, not just changes since main. A named area narrows scope only when the user requests it.
- Record the checkout, HEAD, worktree status, requested scope, and a coverage inventory before reviewing. Use `rg --files` to inventory CLI, app main/preload/renderer, shared schemas/fixtures, runtime tests, packaging, and eval tooling. Exclude generated output, dependencies, and `.scratch/` from the source inventory.
- Read all entries in `docs/POSTMORTEM.md` when present. Map each applicable prevention rule to current call sites and regression coverage; searching for the old function name alone is insufficient.
- For each finding, trace a concrete trigger through callers and consumers. Cite file:line evidence and the violated decision or contract. Distinguish a confirmed defect, a suspected risk requiring execution, and an undecided product question.

## Review passes

1. **Contracts and invariants**: schemas and both language implementations; CLI/MCP envelopes and error semantics; documented behavior and its tests. Check both producers and consumers, including failure paths.
2. **Boundaries**: renderer/preload/main IPC validation and sender scope; filesystem paths and serving scope; agent inputs, subprocess arguments, configuration and user-state isolation. Trace input to the operation it controls.
3. **Lifecycle and failures**: ownership of windows, watchers, sockets, children and queued work; cancellation, timeout, retries, disposal and quit; stale results and partially completed writes. Check transitions rather than just happy-path functions.
4. **Maintainability and regression prevention**: duplicated domain decisions that can disagree, untested contracts, stale adapters, and applicable postmortem recurrences. Do not classify taste, hypothetical extensibility, or harmless repetition as a defect.

Cross-check every candidate against tests and intentional exceptions. A test's existence is evidence of intended coverage, not evidence that it currently passes. Do not invent issues to fill categories.

## Output

Write a Korean report in the conversation; a detailed report may go in `.scratch/audit/<run>/report.md`. Put unreviewed areas and execution limits first, then findings by urgency:

- **High**: data loss, isolation escape, crash, or broken primary workflow with a concrete trigger.
- **Medium**: reproducible incorrect behavior or a material contract/regression gap.
- **Low**: bounded maintenance concern with a concrete consequence.

Each finding includes trigger, impact, source evidence, expected behavior and its authority, and the smallest proposed correction or next verification. Include a coverage table with reviewed / partial / not reviewed status and a postmortem applicability checklist. “No findings” applies only to reviewed scope.

## Limits

Report only: no source or documentation fixes, commits, push, package installation, or automatic test runs. Static inspection cannot certify runtime behavior. Route executable verification to [/verify](../verify/SKILL.md), changed-code review to [/code-review](../code-review/SKILL.md), and agreed fixes through the repository's implementation workflow. Stop at actual decision conflicts without silently rewriting the decision.

Adapted from `~/code/malmoi/.claude/commands/audit.md`, inspected on 2026-10-25: whole-codebase passes, postmortem recurrence checks, and explicit coverage. Stack-specific checks and mandatory nested delegation were not carried over.
