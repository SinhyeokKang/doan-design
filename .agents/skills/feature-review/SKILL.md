---
name: feature-review
description: Use to cross-check /feature outputs (spec, design, tasks) in parallel with product, tech, QA, and UX/UI reviewer agents, and to apply the agreed fixes to the documents. Does not touch code.
---

Reviewer agents for four perspectives each look separately at `spec.md`, `design.md`, and `tasks.md` in `docs/features/<slug>/`. Work through the feedback with the user one item at a time, and apply only what is agreed. **Look at documents only.** Do not run builds or tests.

## Usage

- `/feature-review <slug>` — all four perspectives.
- `/feature-review <slug> <role...>` — only the named perspectives. Keywords: `product`, `tech`, `qa`, `uxui`.
- `/feature-review` — the most recently edited feature slug under `docs/features/` (not an `audit-*` or `ux-audit-*` report directory or a `chain-*` chain directory), all four perspectives.

## Perspectives

| Key | Target | Criteria |
|---|---|---|
| `product` | `spec.md` | Does it match PRODUCT §1 Problem, §2 Users, §3 Scope? Is the user (human/agent) clear? Are the done-when conditions verifiable sentences? Has something out of scope (§3 'Out of scope') slipped in silently? Is there any pre-built extensibility? |
| `tech` | `design.md` | Does it respect ARCHITECTURE §1 'Conventions' and the structural decisions (serving scope, sandbox iframe, append-only events, agents only resolve, no token handling, no git operations, comment bodies are data)? If it changes a format, does the design include the JSON Schema source, `v`, and fixtures shared by TS and Go? Are pure functions actually split out? Does it lean on assumptions that no PoC has established (`docs/BACKLOG.md`)? Is there a simpler way? |
| `qa` | `tasks.md` | Does every task have a "Verify:" line that can be judged? Is that command in AGENTS.md 'Commands' (if not, is it written as "command undecided")? Is the order schema and fixtures → pure functions → shell → UI? Are edge cases missing (empty canvas, duplicate or missing ids, missing `doan:width`, unknown `v`, same `id` after a union merge, app not running)? Are there final tasks for promoting to PRODUCT and ARCHITECTURE and deleting the directory? |
| `uxui` | `spec.md` · `design.md` (what the human sees and does) | Is every visible state defined (empty, loading, error, missing data, the target vanishing while open) and what the human sees in each? Do interactions follow macOS conventions for the kind of view (trackpad, mouse, shortcuts, menus), with one recommended convention per item? Is there feedback for what happens (current state shown, changes noticed)? Focus and keyboard reachability. Is the UI copy clear and actionable? What will later features (PRODUCT §5 split) need from this interaction model that is costly to change later? Visual design is drawn afterwards by `/design-draft` (PRODUCT §5 'Dogfooding'), so judge interaction and states, not visual polish. If the feature has no human-facing surface, say so and stop |

## Procedure

1. **Load** — read the three files. If any is missing, end with "The documents are incomplete. Please run `/feature` first." (said to the user in Korean). For context, read `AGENTS.md` and `docs/PRODUCT.md`. If `docs/POSTMORTEM.md` exists, grep it for the feature's areas.
2. **Parallel review** — launch a reviewer agent for each active perspective at the same time. Pass: the full text of its document, the other documents (for reference), the relevant PRODUCT sections, the POSTMORTEM grep results, and the criteria above. Have it check every file, path, and command the documents cite against the actual repo.
   - Worker model boundary (AGENTS.md 'Runtime differences'): a Claude Code session launches only Claude models; a Codex session launches only Codex models. Crossing only with the user's explicit permission.
   - Agents return feedback only. They do not edit the documents.
3. **Output format** — per agent: `Questions (need answers)` / `Issues (🔴 definition is wrong or violates a decision/convention · 🟡 recommended · ⚪ wording)` / `1–2 things done well`.
4. **Work through it with the user**
   - Show all feedback at once, grouped by perspective.
   - In 🔴 → 🟡 → ⚪ order, ask **one at a time** with the runtime's question tool (AskUserQuestion in Claude Code). Include one recommendation with a reason and an 'Other (type your own)' option. Merge duplicate points into one.
   - Get permission for obvious correctness errors (nonexistent paths, missing "Verify:" lines) in one batch.
   - Ask separately about items that need promoting something out of scope or changing a PRODUCT decision. If approved, leave the PRODUCT update as a task in `tasks.md`.
5. **Apply** — apply only the agreed fixes to `docs/features/<slug>/` and summarize the changes per file. These documents stay in Korean, following AGENTS.md 'Korean writing rules'.
6. **Commit** — only the edited documents. `docs(feature): <slug> apply review feedback`. Since only documents change, commit on the checked-out branch without switching (AGENTS.md 'Commit conventions'). Trailers follow `/ship`'s commit rules.

## Report

The report is delivered to the user in Korean.

```
🧐 feature-review: <slug>
On hold / not agreed: <items or none>
Perspectives: <what ran>
Applied: <summary of changes per file>
PRODUCT update tasks: none / <items>
Commit: <hash>
```

## Prohibited

- Do not edit code or run builds or tests.
- Reviewer agents do not edit documents. Edits happen only in the main thread, after agreement.
- Do not edit `docs/PRODUCT.md` directly. Leave it as a task.
- Do not automatically invoke follow-up skills after committing.
