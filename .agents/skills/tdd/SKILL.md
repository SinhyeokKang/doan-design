---
name: tdd
description: Use to write only the tests, before implementation. Pins a new interface down with tests or adds a bug regression test and confirms red. Does not implement or commit.
---

This is the step where tests come **first**. Create only test files (and the fixtures they need), confirm red, and stop.

## Usage

- `/tdd` — pick the mode from the preceding context (A if it is `/feature` output, B if it is a `/code-review` finding).
- `/tdd interface <target>` — **A**: pin down the signature of a new function or format with tests. The first red is the import breaking because the target module does not exist. Case order: normal → edge (empty input, boundary values) → error.
- `/tdd regression <bug>` — **B**: start with a test that reproduces the bug. You can only say you caught the same bug if you see red before fixing it.

## If it touches a format, start with the schema and fixtures

ARCHITECTURE §11 'Shared formats': comment events, `.doan/config.json`, CLI response envelopes, `runtime.json` and the app socket messages have JSON Schema as their source, and the TS (app) and Go (CLI) tests read **the same fixtures**.

- First write the schema change and the fixtures (ones that must pass and ones that must fail). Then make both the TS and Go tests read those fixtures. Writing only one side cannot catch the two implementations drifting apart.
- Schemas and fixtures live in root `schema/` and `schema/fixtures/` (ARCHITECTURE §11 'Shared formats', Location). If a change needs a location §11 does not cover, stop and ask. Do not invent locations.

## TDD required / skippable

**Required** (pure logic that comes from PRODUCT decisions):
- Folding comment events: sort by `at` (not line order), collapse the same `id` into one, no resurrection after a delete event, flag unknown `v`.
- `doan check` rules: error and warning cases for each check in ARCHITECTURE §1 'Conventions' and PRODUCT §5.
- CLI `--json` envelope (`ok`, `result`, `error{code,message,nextSteps}`) and distinct exit codes.
- Serving path allow decisions (reject paths outside the allowed paths and `..` escapes), upward search for `.doan/config.json`.
- Reproducible bugs.

**Skippable** (report a one-line reason and stop):
- Electron UI rendering and interaction, actual behavior of the script injected into the iframe.
- I/O shells such as sockets and file watching. The pure functions they call are still required.

## Procedure

1. Decide the mode and scope.
2. If `docs/features/<slug>/tasks.md` exists, first cover the tasks' "Verify:" lines as the case list. Do not miss anything on that list.
3. If `docs/POSTMORTEM.md` exists, grep it for the target area and bring past pitfalls back as cases.
4. Write the tests. Name cases in English by what they guarantee (this is code).
5. Use the test command from the AGENTS.md 'Commands' section to see that they **actually fail**. If that section is missing or has no command for the language, stop and ask. Do not invent commands, and do not write that you confirmed a red you could not run.
   - If it is unexpectedly green, stop and report. Do not leave a fake safety net.

## Report

The report is delivered to the user in Korean.

```
🔴 tdd: <mode> — <target>
Unverified: <checks you could not run or none>
Files: <paths>
Cases: <n> — <summary>
Task done-when coverage: <n>/<m> ("n/a" if there is no tasks.md)
Red confirmed: <summary of failure message>
POSTMORTEM recalled: <items or none/no file>
Next: /implement
```

If invoked inside `/ship`, do not end the turn at the "Next:" line. `/ship` continues in the same turn.

## Prohibited

- Do not create or edit production code.
- Do not commit (`/ship` handles commit #0).
- Do not try to make the tests green.
- Do not proceed if you could not confirm red.
