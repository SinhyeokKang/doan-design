---
name: audit
description: Audit the whole doan codebase with specialist subagents for contracts, boundaries, lifecycle rules, and regression prevention. Use for a repository-wide code audit rather than a diff review. Integrates evidence and verifies coverage; does not fix or commit.
---

# Codebase audit

Read [AGENTS.md](../../../AGENTS.md), [PRODUCT.md](../../../docs/PRODUCT.md), and [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) first. Those decisions define correctness; do not import another project's product rules.

## Scope and evidence

- `/audit` covers the current codebase, not just changes since main. A named area narrows scope only when the user requests it.
- Record the checkout, HEAD, worktree status, requested scope, and a coverage inventory before reviewing. Use `rg --files` to inventory CLI, app main/preload/renderer and shared modules (`app/src/{brand,comments,formats,restore}`), shared schemas/fixtures, runtime tests, packaging, and eval tooling. Exclude generated output, dependencies, and `.scratch/` from the source inventory.
- Read all entries in `docs/POSTMORTEM.md` when present. Map each applicable prevention rule to current call sites and regression coverage; searching for the old function name alone is insufficient.
- For each finding, trace a concrete trigger through callers and consumers. Cite file:line evidence and the violated decision or contract. Distinguish a confirmed defect, a suspected risk requiring execution, and an undecided product question.

## Specialist subagents

The lead inventories the repository and launches one read-only subagent for each of the four perspectives below. Use the same model family as the invoking agent under AGENTS; explicit user authorization may override the family boundary. Run independent reviewers in parallel up to the available limit, then launch the remaining perspectives in another wave. A concurrency limit does not remove a perspective. Do not require a second tier of agents.

Give every reviewer the requested scope, source inventory, decision documents, relevant postmortem prevention rules, its perspective, and a distinct report path under `.scratch/audit/<run>/`. Reviewers inspect source themselves; the lead's summary is not a substitute. Each perspective spans all applicable modules, including renderer behavior, both language implementations, and eval tooling; it is not a partition into isolated directories. Reviewers may write only their own evidence files and must not run tests, fix code, commit, or push.

Maintain a module-by-perspective coverage table with an owner for each applicable cell. A cell is complete only with the files/contracts traced and the applicable prevention checks recorded. Listing files, searching names, or sampling an entry point does not complete the module. Mark non-applicability with a concrete reason; do not exclude an implemented subsystem because another skill also reviews it.

## Reviewer perspectives

1. **Contracts and invariants**: schemas and both language implementations; CLI envelopes and error semantics; documented behavior and its tests. Check both producers and consumers, including failure paths.
2. **Boundaries**: renderer/preload/main IPC validation and sender scope; filesystem paths and serving scope; agent inputs, subprocess arguments, configuration and user-state isolation. Trace input to the operation it controls.
3. **Lifecycle and failures**: ownership of windows, watchers, sockets, children and queued work; cancellation, timeout, retries, disposal and quit; stale results and partially completed writes. Check transitions rather than just happy-path functions.
4. **Maintainability and regression prevention**: duplicated domain decisions that can disagree, untested contracts, stale adapters, and applicable postmortem recurrences. Do not classify taste, hypothetical extensibility, or harmless repetition as a defect.

Cross-check every candidate against tests and intentional exceptions. A test's existence is evidence of intended coverage, not evidence that it currently passes. Do not invent issues to fill categories.

## Integration and completion gate

Each reviewer returns findings with source evidence, reviewed coverage, remaining work, and postmortem checks. The lead verifies findings against source and decisions, merges duplicates while retaining perspective attribution, resolves conflicting interpretations, and traces contracts that cross modules. An undecided product rule blocks a verdict on that finding, not unrelated review work.

Compare returned coverage with the initial inventory and all applicable postmortem prevention rules. Reassign partial or untouched cells and continue until the requested static scope is covered. Do not accept “whole-codebase audit complete” while accessible in-scope implementation remains unreviewed. Finding several issues, reaching a convenient time limit, or writing down omissions is not completion. Preserve progress across context limits and resume the remaining work.

If a real access/tool blocker prevents further review, report **incomplete**, the affected cells, the blocker, and what remains; do not narrow the request yourself. If subagents are unavailable, disclose that limitation and perform the same coverage work sequentially. Runtime-unverified behavior is a separate evidence limitation: static audit completion neither requires running tests nor certifies runtime behavior.

## Output

The lead writes the consolidated report in Korean to `docs/features/audit-YYMMDD/report.md`, using the audit's execution date (for example, `audit-261025`). Record the full execution date, reviewed HEAD/worktree state and completion status inside the report. A continued run updates its existing report and records the continuation dates; a separate run on the same date uses a numeric suffix such as `audit-261025-2` instead of overwriting earlier findings. Reviewer notes and raw evidence remain under `.scratch/audit/<run>/`; include enough source evidence in the report to understand it without those ignored files. Summarize the result and link the report in the conversation. Put unreviewed areas and execution limits first, then findings by urgency:

- **High**: data loss, isolation escape, crash, or broken primary workflow with a concrete trigger.
- **Medium**: reproducible incorrect behavior or a material contract/regression gap.
- **Low**: bounded maintenance concern with a concrete consequence.

Each finding includes trigger, impact, source evidence, expected behavior and its authority, and the smallest proposed correction or next verification. Include reviewer/perspective attribution, the coverage table, and a postmortem applicability checklist. Label a partial report as an interim checkpoint, not a completed audit. “No findings” applies only to reviewed scope.

## Limits

Report only: the lead may write the designated report under `docs/features/`; no source or other documentation fixes, commits, push, package installation, or automatic test runs. An audit report is not an approved feature plan and does not require placeholder spec/design/tasks files. Static inspection cannot certify runtime behavior. Route executable verification to [/verify](../verify/SKILL.md), changed-code review to [/code-review](../code-review/SKILL.md), and agreed fixes through the repository's implementation workflow. Preserve decision conflicts for the user without silently rewriting the decision.

Adapted from `~/code/malmoi/.claude/commands/audit.md`, inspected on 2026-10-25: specialist parallel review, lead integration, and postmortem recurrence checks. doan uses four relevant perspectives and an explicit coverage completion gate; malmoi's stack-specific checks and mandatory second-tier delegation were not carried over.
