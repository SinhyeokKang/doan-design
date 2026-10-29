# Extract reusable patterns

Find the tokens, components, and patterns that the existing design repeats, in canvases and in code, and organize them for systematic reuse. The result is a proposal: what to extract, under which names, and which uses would move to it.

Use this preset when the user asks to consolidate hard-coded values, repeated components, or inconsistent variations. The user's request and its scope come first: this guidance never widens what you change. Refactoring real app code happens only when the user separately asks for it, and only within that request.

## Before you start

- Find the target. For pointing words like "this canvas" or "these cards", use `doan active` and read the open comments attached to that target (`doan comments --canvas <id>`). Otherwise work on the canvases, frames, or code area the user named.
- Read the design system already in use: the configured token CSS (`doan config --json` shows `tokenCss`), the component library or shared UI directory, the design rules document, and `.doan/canvases/design-system.html` if it exists. Learn its organization, naming conventions, token structure (primitive and semantic layers), and import and export conventions.
- Read the code the canvases implement (`data-doan-implements`), so canvas patterns are compared with what already exists in code.
- If no design system exists, do not create one as a side effect. Ask the user where it should live and how it should be structured; recording a new system is the `document` preset's job.

## Find the patterns

Look in the target area for:

- **Repeated components:** similar UI used three or more times (buttons, cards, inputs).
- **Hard-coded values:** colors, spacing, typography, radius, and shadows that should be tokens. On canvases, `doan check` warnings about direct hex and rgb colors point at some of them.
- **Inconsistent variations:** several implementations of the same concept with drifting values.
- **Composition patterns:** layout or interaction structures that repeat, such as form rows, toolbar groups, and empty states.
- **Type styles:** repeated combinations of font size, weight, and line height.
- **Motion patterns:** repeated easing, duration, or keyframe combinations.

Extract only what is used three or more times with the same intent. Premature abstraction is worse than duplication. Two elements that look alike but serve different purposes stay separate.

## Plan the extraction

For each candidate, decide:

- **Components to extract:** which elements become reusable components, and which variants they genuinely need.
- **Tokens to create:** which values become tokens, at which layer (primitive or semantic), and which existing token they map to when one already fits.
- **Names:** component, token, and prop names that follow the project's existing conventions.
- **Migration path:** every current use that would switch to the shared version, by file and line, or by canvas, frame, and element id.

Design systems grow incrementally. Extract what is clearly reusable now, not everything that might someday be.

## Shape what you propose

- **Components:** a clear props API with sensible defaults, variants for real use cases, and accessibility built in: semantics and ARIA, keyboard navigation, and focus management.
- **Tokens:** clear names, a primitive and semantic hierarchy, and a note on when to use each token.
- **Patterns:** when to use the pattern, its variations, and a short example.

## Work in Doan

Choose the outcome from the request:

1. **Proposal (default).** Report the candidates with their evidence (files, or canvas, frame, and element ids, and the number of uses), the proposed names, the migration list, and what you chose not to extract and why. Do not edit files.
2. **Record in the design system.** When the user asked to add the extracted tokens or components to the design rules document or the `design-system` canvas, read the `document` preset (`doan design-skill document --json`, or the MCP `design_skill` tool with `{"id": "document"}`) for how those artifacts are written. Mark a proposed token or component that is not in code yet as proposed in the document, and state on the canvas that it is not in code, as the Doan guide requires.
3. **Apply to canvases.** When the user asked to make canvases use the shared tokens, replace values with token CSS variables only in the canvases and frames in scope. Keep canvas, frame, and element ids unchanged.
4. **Refactor app code.** Only when the user separately asked for it, and only within that request: add the shared component or token, replace each use in the agreed migration list, check visual and functional parity, and delete only the implementations this change made dead.

In every case:

- Leave frames, elements, and ids outside the request unchanged, and check attached open comments before substantially changing a frame or element.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what you extracted or changed, what you left duplicated on purpose, and the uses you did not migrate.

## Avoid

- Extracting one-off, context-specific implementations without generalizing them.
- Components so generic they are useless.
- Ignoring the existing design system's conventions.
- Skipping types or prop documentation for an extracted component.
- A token for every single value; tokens need semantic meaning.
- Merging things that differ in intent.

## Verify

- Each extracted token or component has at least three same-intent uses, with evidence.
- Names match the project's conventions, and no new token duplicates an existing one.
- Edited canvases reference token CSS variables and pass `doan check`.
- After a code refactor, the affected tests pass and no use outside the migration list changed.

Visual parity after a code refactor needs the screens rendered. If you could not render them, or could not run the tests, report that as unverified rather than passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, file `skill/reference/extract.md`, under the Apache License 2.0. Doan modified it: made a proposal the default outcome and app code refactoring depend on a separate request; included canvases as a source of patterns and a place to apply tokens; replaced the documentation step with the `document` preset and Doan's canvas rules; removed the template placeholder; and added target selection, scope, comment, and verification rules for Doan.

[doan:design-skill] end of preset extract
