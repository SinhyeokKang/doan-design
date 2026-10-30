---
name: design-draft
description: Use to draw a feature's UI draft canvas in this repo's .doan/canvases/ from its feature documents, following doan's canvas conventions, and to check it with the doan CLI. Writes only the draft canvas; does not touch app code or push.
---

Dogfooding loop (PRODUCT §5 'Dogfooding'): doan's own UI drafts are canvases in this repo's `.doan/canvases/`, viewed in the doan app, and `/design-sync` later compares the first implementation with them. This skill is the drawing half. Either runtime may draw (Claude Code drew app-ui, Codex draws select-inspect), and the other runtime implements from the files alone, so the draft must stand on its own: everything the implementer needs is in the canvas, the token CSS and the feature documents, not in a conversation.

**Language**: the canvas (UI copy, header, notes) is English — app UI copy is English (PRODUCT §7, app-ui). The report to the user is in Korean.

## Usage

- `/design-draft <slug>` — draw the draft that `docs/features/<slug>/design.md` asks for.
- `/design-draft <slug> --revise` — apply the user's feedback to the existing draft (same steps from 2).

## When to use

- After `/feature-review`, before `/tdd`: the review settles the list of visible states, and `/design-sync` compares only the states the draft draws. Drawn earlier, the draft is redrawn.
- For screens whose first implementation is not on main yet.
- For a redesign child of a parent feature (AGENTS.md 'Terms', e.g. buzz-restyle) whose `design.md` requests a new draft file for a screen already on main.

**Not for**: restyling a screen already on main outside a redesign child. Once a screen ships, the code and `docs/DESIGN.md` are the reference (PRODUCT §7, design-sync); a new look for it is a change request through `/feature`, which may make it a redesign child.

## Prerequisites (stop if any fails)

1. `docs/features/<slug>/design.md` has a draft request: canvas path and id, the frame ids to draw, and constraints. If the state list is missing, stop and ask; do not invent it.
2. `go run ./cli/cmd/doan check --json --repo .` runs (the repo's `.doan/config.json` is valid).

## Steps

### 1. Read the inputs

Read the files themselves; do not work from someone's summary of them.

- `docs/features/<slug>/spec.md` and `design.md` (the draft request, flows, copy, states).
- `docs/PRODUCT.md` §5 'Dogfooding' and the app-ui rows of §7 (theme, copy, layout decisions); `docs/ARCHITECTURE.md` §1 'Conventions'.
- `docs/DESIGN.md` — the measured contract of screens already shipped.
- Existing drafts in `.doan/canvases/` (shared classes, how "not in code" is marked), `app/src/renderer/tokens.css`, `.doan/assets/mock.css`.
- The renderer code for any shipped screen the draft shows (`app/src/renderer/`).
- `go run ./cli/cmd/doan ls --json --repo .` and `go run ./cli/cmd/doan check --json --repo .` before you start, so new findings are yours.

**Design presets** (2026-10-29 user): list doan's own presets with `go run ./cli/cmd/doan design-skill --json` and read the ones this draft needs with `go run ./cli/cmd/doan design-skill <id> --json` — typically `shape` before drawing flows and states, `harden` or `onboard` for error, empty and first-use states, `clarify` for copy, and `critique` on the finished draft before handing it over. Read only what fits; do not run every preset. This skill's rules win over a preset (shipped screens copied, tokens first, no app-code edits, the feature documents' decisions). Name the presets you read in the report. If the command is unavailable (`usage_error` on an older checkout), say so and continue.

If spec and design leave a visible choice open (a state, a label, a placement), ask the user one question at a time with the runtime's question tool, one recommendation each. Record each answer in the feature's `design.md`.

### 2. Draw

Write the canvas at the path the request names (one HTML file, ARCHITECTURE §1 convention 1).

- **Conventions** (ARCHITECTURE §1): `<meta name="doan:canvas">` with the requested id and `<meta name="doan:width">` in `<head>`; every requested frame as `data-doan-frame` with a `data-doan-title`; `data-doan-id` on elements the implementation will be paired with or commented on.
- **`data-doan-implements` points only to files that exist now.** A path to a file the feature will create is an `implements_not_found` error.
- **Tokens first** (docs/DESIGN.md 'Adopted rules', 2026-10-28 user): link `../../app/src/renderer/tokens.css` by a relative path and write every app value a token covers as that token — color, type roles (size, line height and tracking together), spacing, radius, control/icon size, shadow, motion. A literal is allowed only when no token has the value and the value is needed; list each one in the report as a component constant or a new token. A new token that follows the rules in docs/DESIGN.md 'Tokens first' may be added to `app/src/renderer/tokens.css` in the same change (the one exception to 'Do not edit app code' below: add tokens only, never change an existing token's value), and recorded in docs/DESIGN.md. Never pick an approximate token without asking the user. Before handing over, scan the draft's CSS for literals that have an exact token and replace them; a replacement must leave the computed value unchanged. Colors of example screens the human reviews inside the draft (the mock canvas on the board) come from `.doan/assets/mock.css`. No hex, `rgb(` or `oklch(` anywhere else. Follow the theme decision in PRODUCT §7 and the feature documents: dark only, one system sans, no monospace until buzz-ds lands (app-ui); a buzz-restyle redesign draft is light only and uses the role variables in `tokens.css`, never the legacy aliases kept for old drafts.
- **No coloured edge stripes** (2026-10-26 user): never mark a message, notice, card or row with a coloured or thick left/start border. Errors use an icon plus danger text or a status block; notices use an inset fill. A 1px neutral divider between panes is fine.
- **Shipped screens are copied, not redesigned** — except the screen a redesign child is redesigning, which is drawn as its feature documents ask. Any other screen already on main (top bar, sidebar, Canvas info panel) is drawn as the code and `docs/DESIGN.md` have it; put any change you would make into the report as a change request instead of drawing it.
- **Every requested state gets a frame or a labelled tile**, with the real English copy from the design document (no placeholder text). Long values, empty values and error states are drawn, not described.
- **Mark what is not in code** (agent rule G) the way existing drafts do, and say in the header which frames are new.
- **Header**: one intro block — scope, which frames `/design-sync` will compare, what is copied from shipped screens, and references with their source and whether they were checked or recalled from memory (AGENTS.md 'Leave evidence for references').
- **Canvas assets**: put new canvas-only images, icons and shared CSS/scripts in `.doan/assets/`. Reference existing repository fonts, tokens and primitives in place; do not copy them merely to fill the assets directory.
- **No external resources** (CDN fonts, scripts, images). Prefer static HTML and CSS; a script only when a state cannot be drawn otherwise, because `/design-sync` pairs elements by selector.

### 3. Check with the CLI

- `go run ./cli/cmd/doan check --json --repo .` — no error-level finding. The only new warnings allowed are `hardcoded_color` in `.doan/assets/mock.css`.
- `go run ./cli/cmd/doan ls --json --repo .` — the canvas is listed with the requested id and width, and its `frames` ids equal the requested list (no missing, no extra).

### 4. Hand over for review

The user reviews the draft in the doan app. Tell them how to open it when it is not already open, with the dev-run isolation in AGENTS 'Commands' (a temporary `HOME`, a fake `SHELL`, and `CLAUDE_CONFIG_DIR` / `CODEX_HOME` unset or overridden, besides the temporary userData):

```
go build -o <tmp>/doan ./cli/cmd/doan
DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<tmp>/userdata
```

then add this repo with Add Project… on Home and open the canvas. Stop here and report. Feedback comes back as comments on the canvas (read them with `go run ./cli/cmd/doan comments --json --repo .`) or through the conversation or the conductor, then `/design-draft <slug> --revise`. Loop until the user confirms; record the confirmation in the feature documents (`orch.md` decision log under `/orchestrate`, otherwise `design.md`).

### 5. Commit

- Only the canvas, plus any new shared file under `.doan/canvases/` it needs: `docs(design): <slug> draft`. A revision is `docs(design): <slug> draft revision`.
- Trailer: a Codex session ends the message with `Co-Authored-By: Codex <noreply@openai.com>` (AGENTS.md 'Commit conventions'); a Claude Code session uses its own attribution.
- Commit on whichever branch is checked out (2026-10-30 user); do not switch or create a branch for the draft.
- No push. The draft reaches main with that branch (`/ship` or `/orchestrate` pushes a feature branch).

## Report

```
🖌 design-draft: <canvas path> (new | revision)
Not drawn (first): <requested frames or states missing, and why>
Frames: <id — title> ...
Copied from shipped screens: <which, from which code / DESIGN.md section>
Change requests: <differences from shipped screens you would propose, or none>
Questions asked: <question → answer>
Literals without a token: <value — where — component constant | proposed token>
check: <errors 0, warnings>   ls: <frame ids match / differ>
Commit: <hash>
Next: user review in the app → --revise or confirmed
```

## Prohibited

- Do not edit app code, tests or other features' documents, except adding a rule-following token to `tokens.css` (see 'Tokens first').
- Do not edit the draft of a screen already on main (e.g. `.doan/canvases/app-shell.html`); that is a change request. A redesign child writes a new file instead.
- Do not add canvas conventions or test-only attributes.
- Do not draw a decision that is not in the feature documents, PRODUCT or ARCHITECTURE; ask instead.
- Do not push or merge.
