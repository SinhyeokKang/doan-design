---
name: doc-check
description: Find and fix documentation drift across doan using document-owner subagents that check both docs-to-code and code-to-docs. Automatically update verified factual errors and omissions, verify the edits, and report the result; preserve decisions and historical evidence.
---

# Documentation drift check

Read [AGENTS.md](../../../AGENTS.md), [PRODUCT.md](../../../docs/PRODUCT.md), and [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md). PRODUCT and ARCHITECTURE hold decisions; README is an introduction that summarizes them. AGENTS holds working procedures. The user’s current instructions take precedence.

## Default outcome

Invoking `/doc-check` authorizes the complete check → documentation update → verification workflow. Unless the user explicitly requests report-only work, apply all verified factual corrections in the same run without asking whether to fix them. A findings report or proposed patch alone is not completion. Ask only when an unresolved product or architecture decision is needed, and continue corrections that do not depend on that answer.

## Inventory and authority

- `/doc-check` checks repository-wide documentation unless the user explicitly narrows it. Record HEAD, worktree status, and coverage before editing. Preserve unrelated edits.
- Inventory tracked Markdown, skill sources, Claude skill links, command/configuration references, schemas, and implemented entry points. Include README, AGENTS, current docs, development skills, and the product's embedded skill guidance.
- Classify documents before comparing: current decisions, current factual reference, active feature plan, or historical evidence. Do not treat every document as a description of today's shipped code.
- Treat `docs/features/<slug>/` as an active plan: check its links, internal consistency and stated progress, but do not rewrite intended behavior to match unfinished implementation. Missing documents explicitly deferred by AGENTS are not drift.

## Document-owner subagents

Assign every inventoried document to a read-only reviewer, using one subagent per substantial document and named groups for small related skills/references. All documents must have an owner; grouping must not hide unchecked files. Use the invoking agent's model family under AGENTS unless the user explicitly authorizes otherwise. Run independent reviewers in parallel within the available limit, then continue in waves. Do not require nested delegation.

Give each reviewer the full assigned documents, their authority/history classification, implementation inventory, both passes below, and a distinct evidence path under `.scratch/doc-check/<run>/`. Each reviewer reads every assigned section and verifies both directions against actual source, including defaults, conditions and exceptions. It returns discrepancies with proposed corrections, sections/topics covered in each pass, and remaining work. A filename/keyword scan alone does not count as a completed pass.

Reviewers write only their own evidence files. The lead owns all documentation edits and commits, so reviewers cannot race over shared facts or edit the decisions they are evaluating. Reviewer proposals are not automatically accepted.

## Check both directions

1. **Docs to code**: verify named files, symbols, commands, options, formats, architecture relationships and workflow steps against their definitions and call sites. Check relative links and skill symlinks. Read enough surrounding code to establish the claim; a text match alone is insufficient.
2. **Code to docs**: inspect implemented user-visible contracts and structural changes for missing or contradictory current documentation. Prefer updating the existing authoritative section over adding another source of truth. Do not document every helper or duplicate the code.

For each discrepancy record the document location, implementation evidence, authority, and proposed correction. Distinguish:

- **Verified factual drift**: obsolete path/command, incorrect description, broken link, or omission of already-decided behavior. Correct it in place during this run; no per-item confirmation is needed.
- **Decision conflict**: implementation disagrees with a product/architecture decision, or a new policy would be needed. Leave the decision intact, report the conflict, and ask only for the unresolved decision. Continue independent factual corrections.
- **Unverified claim**: depends on runtime observation, measurement, or an unavailable environment. Mark it unverified in the report; do not invent a replacement fact.

## Integrate and finish coverage

The lead checks each proposed correction against source and document authority, merges reports about the same fact, and cross-checks statements repeated across PRODUCT, ARCHITECTURE, AGENTS, README and skills. Resolve conflicting reviewer claims before editing. Apply verified factual corrections together so one document does not retain the opposite statement; leave actual decision conflicts for the user while continuing independent work.

Maintain a document/section coverage table with separate docs-to-code and code-to-docs status. Reassign partial or untouched sections until the requested scope has been checked in both directions. Listing unchecked documents is an interim checkpoint, not permission to stop. Context limits require preserving progress and resuming. If subagents are unavailable, disclose that and perform the same review sequentially; an access/tool blocker must be reported as incomplete with the remaining scope.

Report review coverage separately from correction status. A fully inspected decision conflict may remain unresolved, and a historical measurement may remain runtime-unverified; neither permits silently skipping static checks or claiming all drift is fixed. Exclude historical content from current-state reconciliation only under the authority rules above, with the reason recorded.

## Preserve evidence

- PRODUCT, ARCHITECTURE and DESIGN describe the current product only: correct them in place and delete stale text instead of adding dated corrections. Keep POSTMORTEM entries and USABILITY-EVAL rounds intact; add a dated correction when necessary instead of retroactively changing what was observed.
- DESIGN measurements require new measurements to change their values or verification status. Source CSS does not prove the rendered result. Do not turn a failed, skipped, or unrun test into a pass.
- Only change a decision when the user actually makes that decision. Factual cleanup does not create a new product decision.
- Follow AGENTS language rules and per-document commit conventions. Invocation authorizes factual documentation fixes; do not edit application code, fixtures, or tests to make the docs agree. Treat changes to executable examples or product skill guidance as meaningful behavior guidance requiring the applicable verification, not harmless prose.

## Verify and report

Recheck every changed reference against its target, inspect the diff for altered meaning, and verify that source skills still resolve through their Claude symlinks. Recheck each accepted discrepancy against the edited documents and related authoritative sections; correct any remaining inconsistency before finishing. Validate edited skill frontmatter when a validator is available. Static checks do not prove documented commands execute successfully; use [/verify](../verify/SKILL.md) when execution is required. Product guide/CLI guidance changes still require the AGENTS `/agent-eval` gate.

Finish when both review passes cover the requested scope and every verified factual correction has been applied and checked. Commit the documentation changes under AGENTS conventions unless the user requests otherwise. If a decision, unavailable evidence, or tool failure prevents completion, name the exact remaining items and reason; do not offer to perform already-authorized corrections in a later turn.

Report in Korean: unresolved decisions and unchecked areas first, corrected files with evidence, then coverage and checks actually performed. Do not claim the whole repository is synchronized if any area remains unchecked. Use `.scratch/doc-check/<run>/` for detailed evidence; do not add a permanent duplicate drift ledger.

Adapted from `~/code/malmoi/.claude/commands/doc-check.md`, inspected on 2026-10-25: parallel document owners, two passes per reviewer, and lead integration of repeated facts. doan adds explicit coverage completion and keeps factual fixes with the lead; its document authority, history preservation, language rules, and symlinks replace malmoi-specific conventions.
