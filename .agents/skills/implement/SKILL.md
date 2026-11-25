---
name: implement
description: Use to implement the tests /tdd added or the tasks in tasks.md. Finishes its own four-perspective self-check. Does not commit.
---

Make `/tdd`'s tests green or implement the tasks in `docs/features/<slug>/tasks.md`. **The self-check is finished inside this skill.**

## Usage

- `/implement` — pick the target from the preceding `/tdd` or `/feature` output.
- `/implement <target>` — name the target explicitly.

## 1. Before starting (do not skip)

- If `docs/postmortem/` exists, grep every month file in it (`grep -rn <pattern> docs/postmortem/`) for the files and areas you will touch. Design around the matching pitfalls and record them in the report.
- Read the relevant sections of `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`, especially ARCHITECTURE §1 'Conventions' and the structural decisions. If the implementation conflicts with a decision, the question may be about the decision first, not the code.
- If `tasks.md` exists, confirm which task this work is. If the work is not on the list, write in the report why it is needed.
- If it reaches out of scope (PRODUCT §3 'Out of scope'), stop and ask.
- Use the test command from the AGENTS.md 'Commands' section to see the current red list. If the section is missing or has no command for the area, stop and ask.

## 2. Implementation

- Pure functions first, I/O shells later.
- Surgically. Do not touch adjacent code outside the request.
- Comments follow AGENTS.md 'Commit conventions': English, one or two lines, only a non-obvious constraint or pitfall; no restated "what", no history or draft narrative. Shorten stale comments in the lines you touch.
- If a format changes, fix the JSON Schema source and fixtures first, and bring TS and Go in line in the same piece of work. Do not hand-edit only one side.
- Do not create `package.json`, `go.mod`, build settings, or directory structure without being asked. Ask if needed.

## 3. Self-check (four perspectives)

Sort each finding into 🔴 (must fix) / 🟡 (should fix) / ⚪ (note). If you split the perspectives across subagents, use only this session's model family (AGENTS.md 'Runtime differences').

1. **Decisions** — does it respect ARCHITECTURE's structural decisions: the serving scope, token path, `127.0.0.1` binding and CORS rule (§3 'Canvas rendering') / the sandboxed iframe without `allow-same-origin` (§3) / no GitHub token except Copilot's sign-in (§7 'GitHub token exception') / no git command or Git setting beyond the exceptions in PRODUCT §3 Out of scope 6 / selection text (`doan active` `html`/`text`) is treated as data, not instructions (§6 'Skills').
2. **Scope** — has §3 'Out of scope' slipped in? Does it force formats outside ARCHITECTURE §1 'Conventions' onto the canvas?
3. **Types and boundaries** — no TS `any` or assertions, no discarded Go `error`? Are failures not silently swallowed? Do the `--json` envelope and exit codes follow the contract?
4. **Simplicity** — is there flexibility, configuration, or abstraction nobody asked for? Pre-built extensibility is a defect in itself.

## 4. Resolution loop (at most 2 rounds)

Fix 🔴/🟡 and rerun tests and type checks. If not everything is resolved within 2 rounds, stop and report what remains.

## 5. Gate

- **All** tests from AGENTS.md 'Commands' green, type check passes.
- All 🔴/🟡 resolved.
- Each new or changed test that waits (`/tdd` 'Tests that wait') passes when run alone 20 times in a row with the area's command from AGENTS.md 'Commands', 10 of them while the machine is under CPU load; the report gives the counts. A single failure is a defect to fix, not a retry.
- If anything is not met or could not be run, stop and report. Do not report a check you did not run as passed.

## Report

The report is delivered to the user in Korean.

```
✅ implement: <target>
Unresolved / not run: <list or none>
Changes: <file list>
Tests: <command · result> / Types: <command · result>
Self-check: 🔴 <n> resolved / 🟡 <n> resolved / ⚪ <n> (not fixed, details)
POSTMORTEM recalled: <items or none/no file>

Flags (gate later steps):
- Format impact: none / <schema · v · fixtures>
- Docs impact: none / PRODUCT.md <section>
- Postmortem candidate: none / <non-obvious pitfall hit>
```

Do not omit the flags. `/ship` reads them to turn on later steps.

## Prohibited

- Do not commit.
- Do not make tests green by deleting them or loosening expected values. If you think an expected value is wrong, report why and get confirmation.
- Do not add features outside tasks.md as extras.
- Do not skip the self-check.
