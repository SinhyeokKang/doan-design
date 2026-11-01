---
name: feature
description: Use to turn a feature idea into spec, design, and task documents. Prepares everything up to the point of coding and writes no code.
---

Prepares one feature **up to the point of coding**. Writes documents only; does not implement.

## Usage

- `/feature <idea>` — flesh out a new feature.
- `/feature` — infer the target from the preceding conversation.

## 0. Scope gate (before starting; do not skip)

- Check against `docs/PRODUCT.md` §3 'Out of scope'. If the request is one of those items or requires one, show in one line which item it hits and why it was originally excluded, and **ask back**. Do not decide on your own that "this much is probably in scope".
- If the user reconfirms, proceed, but add a task to update `docs/PRODUCT.md` (edit §3; rationale in the commit message).
- If the design leans on something PRODUCT does not cover yet (undecided), raise that point as a decision question. Do not decide it silently.

## 1. Outputs

Three files under `docs/features/<slug>/`. The slug is kebab-case.

**Language**: these three documents are written in Korean, following AGENTS.md 'Korean writing rules'.

### `spec.md` — what, and for whom
- **Users**: the human (who views and comments in the app) or the agent (who uses the CLI and skills)? If both, what each one gets.
- **Problem**: what does not work now (as observed fact).
- **Done when**: in verifiable sentences.
- **Non-goals**: what this round does not do (including what is deferred).

### `design.md` — how
- **Affected components**: app (Electron + TS) / CLI (Go) / skills / formats (comment events, `.doan/config.json`, CLI responses, `runtime.json`, app socket messages).
- **Parts to split out as pure functions**: these become `/tdd` targets. If this is empty, revisit the design.
- **Format changes**: does it change the JSON Schema source (ARCHITECTURE §11 'Shared formats')? If so, whether the format version `v` goes up, and which fixtures TS and Go will both read.
- **Conventions impact**: does it change ARCHITECTURE §1 'Conventions' (canvas conventions, agent rules) or add a `doan check` rule?
- **Decision impact**: does it touch ARCHITECTURE's structural decisions (serving scope, sandbox iframe, append-only events, no token handling, no git operations, etc.)? If so, why, and how they are preserved.
- **PoC dependency**: does it lean on an assumption no PoC has established yet (`docs/BACKLOG.md` or the feature's own unknowns)? If so, put the PoC first as a task.

### `tasks.md` — order
- Each task has **one line on how to verify it** ("schema fixture tests green", "`doan check` reports X as an error"). Use only commands from the AGENTS.md 'Commands' section. If none exists, write "command undecided — needs user confirmation".
- Order: schema and fixtures → pure functions → shell (I/O) → UI.
- Mark commit boundaries (`/ship` follows them).
- Last task: promote the conclusions to `docs/PRODUCT.md` (product judgments) and `docs/ARCHITECTURE.md` (structure, formats, conventions) — those documents are written in English — as current rules (rationale in the commit message), and delete `docs/features/<slug>/`.

## 2. Procedure

1. Scope gate. If it hits, ask back and wait.
2. Read `docs/PRODUCT.md` so nothing conflicts with what is already decided. Do not redesign what is decided. README is an introduction; do not cite it as a decision.
3. If `docs/POSTMORTEM.md` exists, grep it for the areas this feature touches and quote the matching pitfalls in design.md.
4. Write the three files.
5. Ask about points open to interpretation **one at a time** with the runtime's question tool (AskUserQuestion in Claude Code). Give each set of options one recommendation with a reason, and include a visible 'Other (type your own)' option. Apply each answer to the documents.
6. **Commit** once the documents are written and the questions are settled — only `docs/features/<slug>/`. `docs(feature): <slug> spec, design, tasks`. Since only documents change, commit on the checked-out branch without switching, and on main push straight to main (AGENTS.md 'Commit conventions'). Stage paths one by one; trailers follow `/ship`'s commit rules.

## 3. Report

The report is delivered to the user in Korean.

```
📋 feature: <slug>
Needs confirmation: <list or none>
Documents: docs/features/<slug>/{spec,design,tasks}.md
Scope gate: passed / PRODUCT.md update needed (<item>)
Pure-function targets: <list>  ← /tdd entry point
Format changes: none / <schema · whether v changes>
Conventions/decision impact: none / <what and how>
PoC dependency: none / <unproven assumption>
Commit: <hash>
Next: /feature-review, then /design-draft if the feature has UI, then /tdd interface
```

## Prohibited

- Do not create or edit code files. Write only documents under `docs/features/`.
- Do not commit anything outside `docs/features/<slug>/`.
- Do not pull out-of-scope items into scope on your own.
- Do not edit `docs/PRODUCT.md` directly. Leave the need as a task.
