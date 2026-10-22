---
name: design-sync
description: Use when a doan app screen is implemented for the first time from a design draft canvas in this repo's design/. Measures the draft and the implementation as computed styles in the real app, fixes the implementation until they match, has it reviewed, pins regressions with tests, and records measured values in docs/DESIGN.md. Does not push.
---

Dogfooding loop (PRODUCT §5 'Dogfooding'): doan's own UI drafts are canvases in this repo's `design/`, and this skill compares a screen's implementation with its draft by computed style. Ported from malmoi `.claude/commands/design-sync.md` (2026-10-22); the DesignSync / Codex input split and the BugShot step were dropped because the drafts are local files in this repo.

> **The draft is the source of truth only for a screen's initial implementation** (2026-10-22 user). Once that implementation is on main, the code and `docs/DESIGN.md` are the source of truth. A new draft for an implemented screen is a change request (`/feature` or ordinary work), not a rerun of this loop.

Why the loop exists: in malmoi (2026-09-13) a modal fixed to the pixel in its draft was implemented with 29 deviations while 3,000 unit tests were green. Values that are right but rendered wrong are invisible to unit tests.

**Language**: the report to the user is in Korean. `docs/DESIGN.md`, code comments and commits are English.

## Usage

- `/design-sync <canvas path> [frame id...]` — one round for the screen that canvas (or those frames) draws.
- `/design-sync <canvas path> --audit` — measure and report only (steps 1–3); no fixes.

## When to use

- A screen is being implemented for the first time and its draft canvas is in `design/`: build the comparison table before or during the implementation and loop until the first implementation reaches main.
- The draft changed during that initial implementation.

**Not for**: screens without a draft, and screens already on main (even if a draft remains). For those, `docs/DESIGN.md` and the code are the reference; check the window with `/runtime-test`.

## Prerequisites (stop if any fails)

1. The working tree is clean and `npm --prefix app test` is green. Measuring on top of mixed changes hides the cause of a mismatch.
2. You are on a `feat-<slug>` branch (from `/ship` or `/orchestrate`), not main. This skill commits but never pushes.
3. This repo has `.doan/config.json`, the canvas is listed by `go run ./cli/cmd/doan ls --json --repo .`, and `go run ./cli/cmd/doan check --json --repo .` reports no error for it (a missing `doan:width` makes the app refuse to draw it).
4. Every frame the screen needs is in the canvas — default, loading, empty, error and other states. A state with no frame is not compared; say so in the report.
5. You can reach every state in the implementation with temp repos and fixtures (as `app/e2e/runtime.ts` does). **A state you could not reach is not "verified".**

## Steps

### 1. Read the draft

- Read the canvas HTML and list its frames (`data-doan-frame`, `data-doan-title`). Frames that point to the implementing file use `data-doan-implements` (ARCHITECTURE §1); use it to find the code, and treat a missing one as a question for the canvas author, not a guess.
- Do not edit the canvas. A draft problem is a comment in the doan app or a question to the user.

### 2. Comparison table — pair the elements

Pair each draft element with its implementation element per run, as selector pairs in a table (2026-10-22 user: no new convention and no test-only attributes in product code). One row per property:

| frame / state | draft selector | implementation selector + how to reach the state | property | draft | implementation |

Properties to cover: size, padding, gap, border and radius, colors (text, background, border, divider rules), font family / size / weight / line-height / letter-spacing, and hover, focus, selected and disabled states.

- **Pair children, not only containers** (2026-10-22, app-ui): a child that carries its own text style, background or spacing (`<code>`, `<b>`, chips, glyphs) gets its own row, and every row records `textContent` on both sides. In app-ui a styled `<code>` inside a paired `<p>` passed a 0-mismatch table (POSTMORTEM). Grep `docs/POSTMORTEM.md` for `design-sync` before step 2.

- **A documented deviation is not a deviation.** When a feature document or `docs/DESIGN.md` records why the implementation differs on purpose, mark the row "documented" with the source. Without such a record, it is a real deviation.
- **A shared primitive beats one screen.** If one screen's draft differs from a shared component, keep the component, unless the drafts draw every screen with the same new value; then change the component and list the other screens it moves in the report.

### 3. Measure — computed style on both sides, in the real app

Both sides are read with `getComputedStyle` in the same Electron/Chromium build (2026-10-22 user), so units, fonts and token variables resolve the same way.

- Write the script at `.scratch/design-sync/<screen>/measure.mjs`, modeled on `app/e2e/runtime.ts`: `npm --prefix app run build`, `go build -o <temp>/doan ./cli/cmd/doan`, Playwright `_electron.launch` with a temporary `--user-data-dir` and `DOAN_CLI`, the folder dialog replaced through `electronApp.evaluate`, then open this repo's folder and the canvas.
- **Draft side**: the canvas iframe is a Playwright `Frame`; read styles and `getBoundingClientRect()` inside it. Do not use `boundingBox()` for elements inside the iframe — it ignores the board scale (PRODUCT §6, PoC 3). Computed styles do not depend on the zoom.
- **Implementation side**: the app window's renderer page, brought to the state of each row.
- Create the states for real (hover, focus, scroll, selection) before reading. Read values that load asynchronously at the same moment as the rest, after they settle.
- **Do not judge from screenshots.** `#f5f5f5` and `#fff` look alike in a PNG; colors and sizes are read as values. Screenshots only show structure.
- Accessible names and roles are read from the real renderer through CDP (`Accessibility.getPartialAXTree`), not from jsdom.
- Fill the table with both values. `--audit` stops here and reports the table.

### 4. Fix

- Bulk replacements assert that they matched; a replacement that silently matched nothing must not be reported as fixed.
- Comments say why the value matters (what breaks without it), not which draft it came from.
- Do not change how screens you did not measure look. If a shared primitive must change, prefer the call site, and record it in `docs/DESIGN.md`.

### 5. Re-measure

Run the script again. Any mismatch → back to step 4. Loop until every row matches or is documented.

### 6. Review

Run this repo's `/code-review` as an independent reviewer (same runtime as this session, AGENTS.md 'Runtime differences') with the full table (draft value, measured value) in its prompt and the states you could not reach listed explicitly. Continue the same reviewer for follow-up rounds (Claude Code: `SendMessage`); a new reviewer loses its earlier judgments. Findings → back to step 4.

### 7. Pin it

A measurement runs once; tests run every time. Pin each regression the loop caught as a unit test or an `app/e2e/runtime.ts` step (`/tdd`), asserting structure or values the screen depends on rather than class strings. Break the code once to see each new test go red. Do not add test-only paths or attributes to product code (`/runtime-test` 'Prohibited').

### 8. Record and commit

- `docs/DESIGN.md` (English; create it on the first run, AGENTS.md 'Documents'): the measured values the screen relies on and why, and every documented deviation. Write only what is true in the code now.
- Gates: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, then `/runtime-test`.
- Commits: code first, then one commit per document. No push.

## Report

```
🎨 design-sync: <canvas path> [frames]  (audit | fix)
Not verified (first): <states not reachable, frames missing from the draft>
Table: <rows: frame/state · property · draft · implementation · match / fixed / documented>
Fixes: <commits>
Review: <rounds, findings resolved>
Pinned: <tests added, red confirmed>
DESIGN.md: <sections added>
Commands: <each with result>
```

## Prohibited

- Do not edit the draft canvas to match the implementation.
- Do not run this loop on a screen that is already on main.
- Do not report a row as matching from a screenshot.
- Do not push or merge.
