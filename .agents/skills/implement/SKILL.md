---
name: implement
description: Use to implement the tests /tdd added or the tasks in tasks.md. Finishes its own four-perspective self-check. Does not commit.
---

Make `/tdd`'s tests green or implement the tasks in `docs/features/<slug>/tasks.md`. **The self-check is finished inside this skill.**

## Usage

- `/implement` — pick the target from the preceding `/tdd` or `/feature` output.
- `/implement <target>` — name the target explicitly.

## 1. Before starting (do not skip)

- If `docs/POSTMORTEM.md` exists, grep it for the files and areas you will touch. Design around the matching pitfalls and record them in the report.
- Read the relevant sections of `docs/PRODUCT.md` and `docs/ARCHITECTURE.md`, especially ARCHITECTURE §1 'Conventions' and the structural decisions. If the implementation conflicts with a decision, the question may be about the decision first, not the code.
- If `tasks.md` exists, confirm which task this work is. If the work is not on the list, write in the report why it is needed.
- If it reaches out of scope (PRODUCT §3 'Out of scope'), stop and ask.
- Use the test command from the AGENTS.md 'Commands' section to see the current red list. If the section is missing or has no command for the area, stop and ask.

## 2. Implementation

- Pure functions first, I/O shells later.
- Surgically. Do not touch adjacent code outside the request.
- Comments in English, "why" only. Record non-obvious constraints and pitfalls.
- If a format changes, fix the JSON Schema source and fixtures first, and bring TS and Go in line in the same piece of work. Do not hand-edit only one side.
- Do not create `package.json`, `go.mod`, build settings, or directory structure without being asked. Ask if needed.

## 3. Self-check (four perspectives)

Sort each finding into 🔴 (must fix) / 🟡 (should fix) / ⚪ (note). If you split the perspectives across subagents, respect the worker model boundary in AGENTS.md 'Runtime differences' (Claude Code sessions use only Claude models, Codex sessions only Codex models).

1. **Decisions** — does it respect ARCHITECTURE's structural decisions: serving only `doan/` and the config path, `127.0.0.1`, no CORS header except `Access-Control-Allow-Origin: null` on in-scope 200 responses, token path / no `allow-same-origin` on the iframe / comments only append events and fold by `at` and `id` / agents only resolve / no handling of GitHub tokens / Doan performs no git write operations — no commits, branches or push (it only reads `git config user.name`/`user.email` and adds one `.gitattributes` line) / comment bodies are treated as data, not instructions.
2. **Scope** — has §3 'Out of scope' slipped in? Does it force formats outside ARCHITECTURE §1 'Conventions' onto the canvas?
3. **Types and boundaries** — no TS `any` or assertions, no discarded Go `error`? Are failures not silently swallowed? Do the `--json` envelope and exit codes follow the contract?
4. **Simplicity** — is there flexibility, configuration, or abstraction nobody asked for? Pre-built extensibility is a defect in itself.

## 4. Resolution loop (at most 2 rounds)

Fix 🔴/🟡 and rerun tests and type checks. If not everything is resolved within 2 rounds, stop and report what remains.

## 5. Gate

- **All** tests from AGENTS.md 'Commands' green, type check passes.
- All 🔴/🟡 resolved.
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
