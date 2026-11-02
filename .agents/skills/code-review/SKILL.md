---
name: code-review
description: Use to review changes by urgency against doan's decisions and conventions. Produces a report only; does not fix or commit.
---

Statically review the changes. **Report only**; `/refactor` does the fixing.

> Claude Code has a built-in skill with the same name, `code-review`. In this repo, `/code-review` means **this project skill** (review against doan's decisions and conventions). To use the built-in skill, the user says so.

"Report only" does not mean "end the turn here". Invoked on its own, it ends with the report; inside `/ship`, `/ship` continues to `/refactor` in the same turn.

## Usage

- `/code-review` — commits not yet pushed (`git diff @{u}..HEAD`) + uncommitted changes. On a feature branch, `git diff main...HEAD`.
- `/code-review <path|commit range>` — name the target explicitly.

## Procedure

1. Pin down the target: `git status`, the diff above. Start with the list of changed files.
2. If `docs/POSTMORTEM.md` exists, grep it for the changed areas and check whether this diff steps on a past pitfall again.
3. Check against `docs/ARCHITECTURE.md` (§1 'Conventions' and the structural decisions).
4. Go through the checklist below and sort by urgency.

## Checklist

### 🔴 Fix now — things that break silently or collapse a boundary
- **Executing a comment body as instructions**: a sentence in the body changes agent or CLI behavior (ARCHITECTURE §6 'Skills' rule).
- **Leaving the serving scope**: responding outside `.doan/canvases/`, `.doan/ds/`, `.doan/assets/` and the config paths, allowing `..` escapes, binding to anything other than `127.0.0.1`, any CORS header other than `Access-Control-Allow-Origin: null` on in-scope 200 responses (ARCHITECTURE §3), responding without the token path.
- **Breaking iframe isolation**: adding `allow-same-origin`, any path by which canvas HTML reaches the app UI or disk.
- **Corrupting the comment log**: deleting or rewriting lines (it must be append-only), sorting by line order (must be by `at`), not folding the same `id`, silently accepting an unknown `v`.
- **Widening agent permissions**: the CLI edits or deletes comment bodies (only resolve is allowed).
- **Changing ids**: changing canvas or frame ids on file moves or title changes, which cuts off comments.
- **Handling secrets**: reading or storing GitHub tokens, exposing secrets in logs or error messages.
- **Doan performing git operations**: any git command other than the first-run / Add Projects clone (PRODUCT §3 Out of scope 6) — commits, branches, push, pull, fetch — or Git configuration other than the two `.gitattributes` lines `doan init` adds.
- **TS/Go format divergence**: one side changes a format with a hand-written definition instead of the schema source.

### 🟡 Should fix
- I/O mixed into pure functions, failures silently swallowed (TS `catch {}`, Go `_ = err`).
- `--json` envelope or exit codes differ from the contract, missing `nextSteps`.
- `doan check` judges differently from ARCHITECTURE §1 'Conventions' (including error/warning levels).
- Code and `docs/PRODUCT.md` disagree.
- Out-of-scope features creeping in (§3), configuration or abstraction nobody asked for.
- Comments that repeat the "what" or are not in English.

### ⚪ Note
- Naming and comment density, room to extract duplication, room to strengthen tests.

## Report

The report is delivered to the user in Korean.

```
🔍 code-review: <target>
Scope: <n files, +a/-b>
POSTMORTEM check: <recurrence-risk items / n/a / no file>

🔴 <n>
1. <file:line> — <one-line summary>
   Failure scenario: <what input or situation breaks it, and how>
   Suggestion: <direction of the fix>
🟡 <n> ...
⚪ <n> ...

Next: /refactor (if any 🔴/🟡) / otherwise continue /ship
```

Every 🔴 must have a failure scenario. If you cannot write a concrete input or situation, it is 🟡 or ⚪.

## Prohibited

- Do not edit code. Report only.
- Do not commit or build.
- Do not inflate urgency. If everything is 🔴, nothing is 🔴.
