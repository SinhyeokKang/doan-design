---
name: refactor
description: Use to fix selected /code-review findings. For bug-type findings, see the regression test go red first, then fix. Does not commit.
---

Actually fix `/code-review` findings. **For bug-type findings, add the regression test first.**

## Usage

- `/refactor` — all 🔴/🟡 from the preceding `/code-review`.
- `/refactor <item number|description>` — only the named items.

## Procedure

### 1. Pin down the target
Pick the items from the preceding report. If only ⚪ remain, skip and report. Do not widen the diff for note items.

### 2. Classify
- **Bug-type** (causes wrong behavior) → following `/tdd regression`'s discipline, write the regression test first, see red, then fix.
- **Quality-type** (same behavior, structure only) → fix without new tests, but existing tests must stay green.

### 3. Fix
- One item at a time. If you mix them, you cannot tell what broke what.
- If `docs/POSTMORTEM.md` exists, grep it for the area you will fix.
- If the code touches ARCHITECTURE's structural decisions, read the relevant section first.
- Comments in English, "why" only.

### 4. Stop conditions (ask instead of forcing through)
- An existing test's **expected value** has to change (that is a claim that the test is wrong, so it needs evidence).
- **A format changes**: JSON Schema, format version `v`, fixtures. Readers of `.doan/` files already accumulated in users' repos are affected.
- **The CLI contract changes**: `--json` envelope, error codes, exit codes.
- **ARCHITECTURE §1 'Conventions' changes**: `doan check` starts or stops reporting an error or warning.
- It reaches out of scope (§3 'Out of scope').

Ask questions one at a time with the runtime's question tool (AskUserQuestion in Claude Code), with one recommendation and an 'Other (type your own)' option.

### 5. Gate
- All tests from AGENTS.md 'Commands' green, type check passes. If the section is missing or has no relevant command, stop and ask. Do not report a check you could not run as passed.
- For every bug-type item, you actually saw the red → green transition.

### 6. Self-check
Apply `/implement`'s four perspectives (decisions, scope, types and boundaries, simplicity) to the fix. If new 🔴/🟡 appear, resolve them in a loop of at most 2 rounds.

## Report

The report is delivered to the user in Korean.

```
🔧 refactor
Needs confirmation (stopped): <item — why it was not forced through / none>
Skipped: <item — reason / none>
Fixed: <n> (bug-type <a> / quality-type <b>)
1. <item> — <what and how>  [regression test: <file> red→green]
Tests: <command · result> / Types: <command · result>
Self-check: 🔴 0 / 🟡 0 / ⚪ <n>
```

## Prohibited

- Do not commit or build.
- Do not fix bug-type items without a test.
- Do not force through a stop condition.
- Fix only the named items. Note problems you see nearby in the report and move on.
- Do not delete or weaken tests.
