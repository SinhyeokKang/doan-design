---
name: postmortem
description: Use to record a just-caught bug, regression, or non-obvious pitfall as a retrospective in the month files under docs/postmortem/. Does not touch code.
---

Record a just-caught bug, regression, or non-obvious pitfall in the month files under `docs/postmortem/` (`docs/postmortem/YYYY-MM.md`; `docs/POSTMORTEM.md` is their index). The goal is not to step on the same pitfall twice, so "Prevention" is the core. `/feature`, `/feature-review`, `/tdd`, `/implement`, `/code-review`, `/refactor` and `/design-sync` grep `docs/postmortem/` before starting.

**Language**: the postmortem files are written in English.

## When to invoke

- When you made a `fix:` commit.
- When you hit an undocumented constraint or a silently failing behavior.
- When the `/implement` report has a "postmortem candidate" flag.
- When a PoC failed differently than expected. The observations themselves go in the commit message or the feature documents; only the pitfall goes here.

## Trivial filter (apply first)

Do not record: type errors and typos (caught right away by the compiler or tests), things you would not have hit if you had read the docs, one-offs where the same pattern does not exist elsewhere.

Record if: (1) it failed silently, (2) it took time to diagnose, or (3) the same pattern may exist elsewhere.

If trivial, report "No entry — <reason>" and stop.

## If the month file does not exist

The entry goes in the file for the month of its heading date. When that file does not exist yet, create it with the header of the latest month file (title `# Postmortem — YYYY-MM`, its intro line for the new month, and the notes copied from `docs/POSTMORTEM.md`), then add the month at the top of the 'Month files' list in `docs/POSTMORTEM.md`. If `docs/POSTMORTEM.md` itself is absent, create it as that index first.

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
- Prevention ends with the search command, not a list of its hits: hit lists with line numbers go stale. Name a hit only when it carries something the command does not: a safe exception and why it is safe, a new cause, or a place the search missed or that is not verified.
- No feature-document, batch or review ids (decision numbers, `RM2`, batch letters): those documents are deleted after promotion, so the id points nowhere. Write the reason itself.
- A **Fix** line, if you add one, is the commit hash and one line.
- A recurrence is one line appended to the original entry: `- **Recurrence (YYYY-MM-DD, <where>)**: <what recurred>; <the new prevention in one line>; <search command>.` A recurrence that needs a prevention of its own beyond one line is a new entry that names the earlier one, so a grep finds it.
- Keep the shape: a blank line before the heading, and all five fields above, in that order.

## Procedure

1. Trivial filter.
2. Gather context: `git log -3 --stat`, the diff you just fixed.
3. Search every month file for the same pitfall (`grep -rn <pattern> docs/postmortem/`). If it already exists, do not create a new entry; append the recurrence line (Format) to the end of that entry in its own month file, even when that is an earlier month.
4. Insert the new entry in the current month's file in descending heading-date order, above existing entries with the same date. Keep the title and introduction at the top.
5. **Actually run** the grep from Prevention. If the same pattern exists elsewhere, note it in the report.

## Report

The report is delivered to the user in Korean.

```
📓 postmortem
Entry: <title> / no entry (<reason>)
File: docs/postmortem/<YYYY-MM>.md (existing / newly created)
Prevention grep: <pattern>
   → <n> elsewhere: <list>  ← follow-up candidates
   → none elsewhere
```

## Prohibited

- Do not edit code. Documents only.
- Do not rewrite or delete existing entry content. Keep entries in descending heading-date order. Append recurrences to the matching entry without changing its heading date or position.
- Do not record trivial items.
- Do not write Prevention without running the grep.
- Do not commit. Invoked on its own, the user commits; inside `/deliver`, `/deliver` commits with `docs(postmortem):`.
