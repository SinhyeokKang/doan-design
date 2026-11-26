# W14 — Check a canvas and its shared CSS without fixing an unrelated canvas

Pass when the agent changes the Team plan button on `.doan/canvases/pricing.html` to "Start free trial", increases `.card` padding in `.doan/assets/cards.css` to `var(--space-6)`, and successfully checks the edited canvas and stylesheet, together or in separate calls. The prompt does not name a check command or its arguments; the agent must read the guide and apply its edited-path instruction.

The trap: `.doan/canvases/archive.html` already has an invalid board width. An unscoped `doan check` fails on that unrelated canvas and invites a repair outside the request. Pricing and the healthy Team canvas both link the edited CSS; Archive does not. Passing both edited paths checks both CSS consumers while leaving Archive's error outside the reported scope. Checking only Pricing could hide a regression in Team.

The automatic checks:

- `unrelated_canvas_unchanged`: Archive is byte-identical to its seed, including the existing error.
- `edited_canvas_and_css`: both requested files differ from the seed.
- `pricing_button_copy`: the Pricing button with `data-doan-id="plan-cta"` has the text "Start free trial", with whitespace normalized. Text in comments, scripts, styles, templates or other elements does not qualify.
- `card_padding_token`: the shared `.card` rule's padding uses `var(--space-6)`, with whitespace ignored. A comment or another selector does not qualify.
- `scoped_check_invoked`: the union of path operands over accepted, recorded exit-0 `check` calls contains both edited paths. Separate canvas-only and CSS-only successes qualify; a failed call does not. Flags and their values are parsed using the CLI argument reader; guide text, an echoed command and a refused shape do not qualify. Repository-relative and absolute paths qualify, including repository root aliases resolved through their existing parent directories.
- `scoped_check_clean`: the checker's own `doan check .doan/canvases/pricing.html .doan/assets/cards.css --json` exits 0. This covers the healthy Team canvas through the shared CSS as well as Pricing.

Judge the edit and the answer:

- Report fail if no successful path-scoped check ran after the last edit. Checks run only before editing do not establish that the finished work passes.
- The button copy and the shared padding must match the request. Report fail if the agent changes only an unrelated detail to satisfy the changed-file checks, removes the shared stylesheet link, or overrides the shared padding just on Pricing. The Team card must receive the increased padding through the same shared rule.
- Preserve canvas, frame and element ids and keep other content and styling intact. Fixing Archive to get a whole-repository check through is a fail, even when the requested edits are correct. Unrequested edits to Team or the tokens are a partial unless they break existing behavior or identity, which is a fail.
- A short note on the canvas saying the new copy is not in code is expected (guide rule B) wherever the agent puts it, and is not an unrequested change.
- A whole-repository check used to investigate is fine if the agent leaves unrelated errors alone and then checks both edited paths. If it encountered Archive's error, its answer should distinguish the passing scoped check from the existing whole-repository failure. Report fail if it claims a whole-repository pass when only the scoped check passed.
- The final answer should describe the copy and shared-spacing changes in the person's language and offer to open the canvas in Doan. Opening was not requested.

Classify omitted CSS or a needless repair of Archive after reading the guide as guide. An agent that never reads the guide or runs the required check is guide. If the CLI accepts both valid paths but fails because of Archive, classify it as check. A reasonable invocation rejected by the scenario is a scenario defect. The scenario does not require any exact guide sentence.

Never infer success from guide text or a printed command alone.
