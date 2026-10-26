---
name: ux-audit
description: Audit cross-screen UX consistency with specialist subagents for wording, actions and recovery, state transitions, and presentation. Integrates comparisons and verifies screen/state coverage. Reports only; first-implementation draft matching belongs to design-sync.
---

# Cross-screen UX audit

Read [AGENTS.md](../../../AGENTS.md), [PRODUCT.md](../../../docs/PRODUCT.md), [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md), and [DESIGN.md](../../../docs/DESIGN.md). Inspect relevant POSTMORTEM entries. Product decisions define expected behavior; DESIGN separates measured facts from unverified surfaces.

## Establish coverage

- `/ux-audit` covers all implemented surfaces unless the user narrows it. Record HEAD, worktree status, and a screen/state inventory before comparing.
- Include Home, project overview and Feedback, workspace/sidebar, comments and Review, inspector, Hand off, Quick Open, Settings, onboarding and First prompt, shared dialogs, alerts, menus, and toasts where implemented. Follow current entry points rather than assuming this list is exhaustive.
- Map shared concepts across surfaces: project identity and availability, agent connection/setup state, selection, loading/waiting, errors and recovery. Record which source determines each state and which component presents it.
- Separate source inspection from live observation. Existing screenshots and measured tables retain their original date and scope; they do not prove the current app matches.

## Specialist subagents

The lead launches four read-only reviewers for perspectives 1–4 below; each also checks shared decisions (5) within its perspective. Use the invoking agent's model family under AGENTS unless the user explicitly authorizes otherwise. Run independent reviewers in parallel within the available limit, then complete the remaining perspectives in another wave. Do not require nested delegation.

Give every reviewer the complete screen/state inventory, source-of-truth documents, relevant postmortems, its perspective, and a distinct report path under `.scratch/ux-audit/<run>/`. Each reviewer compares equivalent concepts across all applicable screens, rather than reviewing one screen in isolation. Its output pairs both sides' source evidence, traces component variants to actual styles/state rules, and records coverage and omissions. Reviewers write only their own evidence files; no fixes, commits, tests, or independent app launches.

Maintain a screen/state-by-perspective coverage table with owners. Existing tests inform coverage but do not replace source inspection or prove a current pass. Reading component names or a few screenshots does not complete a cell.

## Reviewer perspectives

1. **Meaning and wording**: the same state or action uses the same term; labels accurately describe effects and scope; missing, unavailable, disconnected and failed states remain distinguishable.
2. **Actions and recovery**: primary/secondary actions, disabled states, confirmations, cancellation, retries and navigation are consistent for equivalent operations. Check what the user can do after failure or partial completion.
3. **State transitions**: loading, empty, success, error, stale data and dismissal; focus and keyboard routes, selection and restoration; late results after navigation or closing a dialog.
4. **Presentation**: shared tokens, spacing, typography, controls, icons, focus/hover/disabled affordances and long-content behavior. Trace discrepancies to actual styles/components. Do not declare an intentional screen difference a defect merely because values differ.
5. **Shared decisions**: identify duplicated state interpretation or action selection that can disagree across screens. Recommend a shared source only when a concrete inconsistency justifies it.

For each candidate, cite both sides of the comparison and the expected rule. A single isolated screenshot rarely proves cross-screen inconsistency. Distinguish confirmed mismatch, intentional difference, and a product choice that remains undecided.

## Integration and completion gate

The lead verifies both sides of each finding, merges duplicates while retaining perspective attribution, resolves reviewer disagreements against decisions, and checks flows crossing screens. Reconcile returned coverage against the initial inventory and relevant postmortem rules; reassign partial or untouched cells and continue. A full audit cannot end with accessible in-scope screens left unreviewed merely because omissions were reported. Preserve progress and resume across context limits.

Record non-applicability with a reason. If subagents are unavailable, disclose that and do the same coverage work sequentially. A genuine access/tool blocker requires an **incomplete** report with affected cells and remaining work. Product decisions can remain open findings without stopping independent comparisons. Source coverage and live observation are separate: a completed static review must still label runtime/visual claims unverified, and a request for live verification remains incomplete until those requested observations are made or a blocker is reported.

## Runtime evidence

Default to source inspection. If the request requires live behavior or visual verification, the lead runs [/runtime-test](../runtime-test/SKILL.md) with its isolation rules and shares the evidence with reviewers; use `/verify --runtime` when also running the shared gates. Coordinate with existing tests so runtime workloads do not overlap. Do not use the real user's setup targets for convenience.

Inspect rendered output before claiming visual consistency. A passing existing runtime suite only covers its assertions, not every screen/state in this audit. For a first implementation against a draft, use [/design-sync](../design-sync/SKILL.md); this audit does not reestablish old drafts as the source of truth for shipped screens.

## Report and limits

The lead writes the consolidated report in Korean to `docs/features/ux-audit-YYMMDD/report.md`, using the audit's execution date (for example, `ux-audit-261025`). Record the full execution date, reviewed HEAD/worktree state and completion status inside the report. A continued run updates its existing report and records the continuation dates; a separate run on the same date uses a numeric suffix such as `ux-audit-261025-2` instead of overwriting earlier findings. Include enough source evidence to understand the report without ignored scratch files. Summarize the result and link the report in the conversation.

Put missing observations and unchecked states first. For each finding include affected screens/states, reproduction or static trace, file:line and screenshot evidence where available, user impact, expected rule, and the smallest suggested correction. Rank broken primary tasks/recovery above misleading state/wording, then cosmetic inconsistencies. Include a screen/state coverage table labelled source-reviewed / runtime-observed / not checked.

Report only: the lead may write the designated report under `docs/features/`; no UI/code/other docs fixes, token redesign, new feature decisions, commits, or push. Store reviewer notes and raw evidence under `.scratch/ux-audit/<run>/`. An audit report is not an approved feature plan and does not require placeholder spec/design/tasks files. Route approved fixes through the normal implementation workflow; do not run an unrequested redesign.

Adapted from `~/code/malmoi/.claude/commands/ux-audit.md`, inspected on 2026-10-25: parallel perspective reviewers, comparison inventories and lead deduplication. doan groups the perspectives into four reviewers with an explicit coverage completion gate; its Electron surfaces, measured design evidence and isolation rules replace malmoi-specific screens.
