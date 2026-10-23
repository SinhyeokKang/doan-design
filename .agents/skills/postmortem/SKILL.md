---
name: postmortem
description: Use to record a just-caught bug, regression, or non-obvious pitfall as a retrospective in docs/POSTMORTEM.md. Does not touch code.
---

Record a just-caught bug, regression, or non-obvious pitfall in `docs/POSTMORTEM.md`. The goal is not to step on the same pitfall twice, so "Prevention" is the core. `/feature`, `/tdd`, `/implement`, `/code-review`, and `/refactor` grep this file before starting.

**Language**: `docs/POSTMORTEM.md` is written in English.

## When to invoke

- When you made a `fix:` commit.
- When you hit an undocumented constraint or a silently failing behavior.
- When the `/implement` report has a "postmortem candidate" flag.
- When a PoC (PRODUCT §6) failed differently than expected. The observations themselves go in PRODUCT §6; only the pitfall goes here.

## Trivial filter (apply first)

Do not record: type errors and typos (caught right away by the compiler or tests), things you would not have hit if you had read the docs, one-offs where the same pattern does not exist elsewhere.

Record if: (1) it failed silently, (2) it took time to diagnose, or (3) the same pattern may exist elsewhere.

If trivial, report "No entry — <reason>" and stop.

## If the file does not exist

If `docs/POSTMORTEM.md` is absent, create it when writing the first entry with this header:

```
# Postmortem

> Pitfalls we hit, newest date first. Preserve existing entry content; insert new entries above older ones.
```

## Format

```
### YYYY-MM-DD — <one-line symptom>

- **Area**: <files, modules>
- **Symptom**: the wrong behavior observed
- **Root cause**: why it happened (not the surface cause)
- **Net**: what caught it / what missed it
- **Prevention**: grep pattern to find the same pitfall elsewhere, test to add, check that could block it
```

- Check today's date for real before writing it.
- Do not write "made a mistake" as the root cause. Write why that mistake was possible (a misleading API, a missing check).
- Write both sides of the net. The side that missed it decides the next test.
- Prevention must be actionable. "Be careful" is not prevention.

## Procedure

1. Trivial filter.
2. Gather context: `git log -3 --stat`, the diff you just fixed.
3. If the same pitfall already exists, do not create a new entry; append the recurrence (date, location) to the end of that entry.
4. Insert the new entry in descending heading-date order, above existing entries with the same date. Keep the title and introduction at the top.
5. **Actually run** the grep from Prevention. If the same pattern exists elsewhere, note it in the report.

## Report

The report is delivered to the user in Korean.

```
📓 postmortem
Entry: <title> / no entry (<reason>)
File: existing / newly created
Prevention grep: <pattern>
   → <n> elsewhere: <list>  ← follow-up candidates
   → none elsewhere
```

## Prohibited

- Do not edit code. Documents only.
- Do not rewrite or delete existing entry content. Keep entries in descending heading-date order. Append recurrences to the matching entry without changing its heading date or position.
- Do not record trivial items.
- Do not write Prevention without running the grep.
- Do not commit. Invoked on its own, the user commits; inside `/ship`, `/ship` commits with `docs(postmortem):`.
