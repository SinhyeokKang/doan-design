---
name: ux-audit
description: Audit consistency across doan screens, including wording, state presentation, actions, recovery, and design tokens. Use for cross-screen UX drift rather than first-implementation design matching. Reports evidence and proposed corrections only.
---

# Cross-screen UX audit

Read [AGENTS.md](../../../AGENTS.md), [PRODUCT.md](../../../docs/PRODUCT.md), [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md), and [DESIGN.md](../../../docs/DESIGN.md). Inspect relevant POSTMORTEM entries. Product decisions define expected behavior; DESIGN separates measured facts from unverified surfaces.

## Establish coverage

- `/ux-audit` covers all implemented surfaces unless the user narrows it. Record HEAD, worktree status, and a screen/state inventory before comparing.
- Include Home, project overview, workspace/sidebar, comments, inspector, Quick Open, Settings, onboarding, shared dialogs, alerts, menus, and toasts where implemented. Follow current entry points rather than assuming this list is exhaustive.
- Map shared concepts across surfaces: project identity and availability, agent connection/setup state, selection, loading/waiting, errors and recovery. Record which source determines each state and which component presents it.
- Separate source inspection from live observation. Existing screenshots and measured tables retain their original date and scope; they do not prove the current app matches.

## Compare

1. **Meaning and wording**: the same state or action uses the same term; labels accurately describe effects and scope; missing, unavailable, disconnected and failed states remain distinguishable.
2. **Actions and recovery**: primary/secondary actions, disabled states, confirmations, cancellation, retries and navigation are consistent for equivalent operations. Check what the user can do after failure or partial completion.
3. **State transitions**: loading, empty, success, error, stale data and dismissal; focus and keyboard routes, selection and restoration; late results after navigation or closing a dialog.
4. **Presentation**: shared tokens, spacing, typography, controls, icons, focus/hover/disabled affordances and long-content behavior. Trace discrepancies to actual styles/components. Do not declare an intentional screen difference a defect merely because values differ.
5. **Shared decisions**: identify duplicated state interpretation or action selection that can disagree across screens. Recommend a shared source only when a concrete inconsistency justifies it.

For each candidate, cite both sides of the comparison and the expected rule. A single isolated screenshot rarely proves cross-screen inconsistency. Distinguish confirmed mismatch, intentional difference, and a product choice that remains undecided.

## Runtime evidence

Default to source inspection. If the request requires live behavior or visual verification, use [/runtime-test](../runtime-test/SKILL.md) and its isolation rules; use `/verify --runtime` when also running the shared gates. Coordinate with existing tests so runtime workloads do not overlap. Do not use the real user's setup targets for convenience.

Inspect rendered output before claiming visual consistency. A passing existing runtime suite only covers its assertions, not every screen/state in this audit. For a first implementation against a draft, use [/design-sync](../design-sync/SKILL.md); this audit does not reestablish old drafts as the source of truth for shipped screens.

## Report and limits

Report in Korean, with missing observations and unchecked states first. For each finding include affected screens/states, reproduction or static trace, file:line and screenshot evidence where available, user impact, expected rule, and the smallest suggested correction. Rank broken primary tasks/recovery above misleading state/wording, then cosmetic inconsistencies. Include a screen/state coverage table labelled source-reviewed / runtime-observed / not checked.

Report only: no UI/code/docs fixes, token redesign, new feature decisions, commits, or push. Store optional detailed evidence under `.scratch/ux-audit/<run>/`. Route approved fixes through the normal implementation workflow; do not run an unrequested redesign.

Adapted from `~/code/malmoi/.claude/commands/ux-audit.md`, inspected on 2026-10-25: comparisons of shared concepts, actions, states and presentation. doan's Electron surfaces, measured design evidence and isolation rules replace malmoi-specific screens.
