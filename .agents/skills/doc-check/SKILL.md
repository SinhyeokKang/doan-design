---
name: doc-check
description: Find documentation drift across doan in both directions, from docs to implementation and implementation to docs. Correct verified factual documentation errors and omissions; report decision conflicts and unverified claims without changing code or historical evidence.
---

# Documentation drift check

Read [AGENTS.md](../../../AGENTS.md), [PRODUCT.md](../../../docs/PRODUCT.md), and [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md). PRODUCT and ARCHITECTURE hold decisions; README is background. AGENTS holds working procedures. The user’s current instructions take precedence.

## Inventory and authority

- `/doc-check` checks repository-wide documentation unless the user explicitly narrows it. Record HEAD, worktree status, and coverage before editing. Preserve unrelated edits.
- Inventory tracked Markdown, skill sources, Claude skill links, command/configuration references, schemas, and implemented entry points. Include README, AGENTS, current docs, development skills, and the product's embedded skill guidance.
- Classify documents before comparing: current decisions, current factual reference, active feature plan, or historical evidence. Do not treat every document as a description of today's shipped code.
- Treat `docs/features/<slug>/` as an active plan: check its links, internal consistency and stated progress, but do not rewrite intended behavior to match unfinished implementation. Missing documents explicitly deferred by AGENTS are not drift.

## Check both directions

1. **Docs to code**: verify named files, symbols, commands, options, formats, architecture relationships and workflow steps against their definitions and call sites. Check relative links and skill symlinks. Read enough surrounding code to establish the claim; a text match alone is insufficient.
2. **Code to docs**: inspect implemented user-visible contracts and structural changes for missing or contradictory current documentation. Prefer updating the existing authoritative section over adding another source of truth. Do not document every helper or duplicate the code.

For each discrepancy record the document location, implementation evidence, authority, and proposed correction. Distinguish:

- **Verified factual drift**: obsolete path/command, incorrect description, broken link, or omission of already-decided behavior. Correct it in place during this run; no per-item confirmation is needed.
- **Decision conflict**: implementation disagrees with a product/architecture decision, or a new policy would be needed. Leave the decision intact, report the conflict, and ask only for the unresolved decision. Continue independent factual corrections.
- **Unverified claim**: depends on runtime observation, measurement, or an unavailable environment. Mark it unverified in the report; do not invent a replacement fact.

## Preserve evidence

- Keep historical PRODUCT decision rows, POSTMORTEM entries, and USABILITY-EVAL rounds intact. Add a dated correction when necessary instead of retroactively changing what was observed.
- DESIGN measurements require new measurements to change their values or verification status. Source CSS does not prove the rendered result. Do not turn a failed, skipped, or unrun test into a pass.
- Only record a new decision and its dated PRODUCT §7 rationale when the user actually makes that decision. Factual cleanup does not create a new product decision.
- Follow AGENTS language rules and per-document commit conventions. Invocation authorizes factual documentation fixes; do not edit application code, fixtures, or tests to make the docs agree. Treat changes to executable examples or product skill guidance as meaningful behavior guidance requiring the applicable verification, not harmless prose.

## Verify and report

Recheck every changed reference against its target, inspect the diff for altered meaning, and verify that source skills still resolve through their Claude symlinks. Validate edited skill frontmatter when a validator is available. Static checks do not prove documented commands execute successfully; use [/verify](../verify/SKILL.md) when execution is required. Product guide/CLI/MCP guidance changes still require the AGENTS `/agent-eval` gate.

Report in Korean: unresolved decisions and unchecked areas first, corrected files with evidence, then coverage and checks actually performed. Do not claim the whole repository is synchronized if any area remains unchecked. Use `.scratch/doc-check/<run>/` for detailed evidence; do not add a permanent duplicate drift ledger.

Adapted from `~/code/malmoi/.claude/commands/doc-check.md`, inspected on 2026-10-25: bidirectional checks and separation of decisions from factual drift. doan's document authority, history preservation, language rules, and symlinks replace malmoi-specific conventions.
