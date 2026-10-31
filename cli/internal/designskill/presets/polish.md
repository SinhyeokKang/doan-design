# Polish the details

Finish a design so it is consistent and complete across its path, while keeping its existing identity, content, and function. Polish is refinement, never a concealed redesign: preserve the incumbent visual world, behavior, and everything outside the requested scope. If the concept itself is wrong, say so and recommend a redesign or the `bolder` preset instead of smuggling in a replacement.

Use this preset when the user asks to polish, finish, tidy, or bring a screen, frame, or flow up to a consistent quality bar. The user's request and its scope come first: this guidance never widens what you change. A concrete small edit, such as "move this button 4px left", does not need the whole pass; make that edit within the identity and stop.

## Before you start

- Find the target. For pointing words like "this screen" or "this card", use `doan active` and read the open comments attached to that target (`doan comments --canvas <id>`). Otherwise work on the canvas, frame, or code the user named.
- Read the design system: the token CSS (`doan config --json` shows `tokenCss`), existing components, any design rules document, the design-system canvases in `.doan/ds/` (or a legacy `.doan/canvases/design-system.html`) if present, and neighboring frames and flows. If no formal system exists, use the project's coherent conventions.
- Read the code the canvas implements (`data-doan-implements`), so the polish matches what ships and you know what is not in code yet.
- Establish the bar: whether the path is functionally complete, the intended quality bar, known constraints or deliberately unfinished work, and the states, content lengths, roles, and input methods users will actually meet. Ask only what would change the result. When product context is missing and it matters, suggest the `context` preset (`doan design-skill context --json`).
- Ask before changing factual claims.

## Lock the identity

Before changing anything, write one sentence recording what is actually on the target: the dominant surface and accent (by the tokens that carry them), the loaded font pairing, the layout topology (stacked, side-by-side, grid, asymmetric, overlay), the surface treatment (corners, borders, shadows, decoration density), and the voice of the copy. Read it from the design rules document, the token CSS custom properties, the target's and its parent's styles, and sibling components, in that order. Be specific; skip an axis rather than invent one; do not name an aesthetic family. A missing design document is not a missing identity.

Every change must still fit that sentence. New fonts, new hues, a different layout topology, or a new aesthetic signal are a redesign: do them only when the user explicitly asks for one in the current request. An old note or a stale comment is not that request. When unsure, preserve. If the user's direction conflicts with a binding brand commitment or design rule, keep the commitment unless the user explicitly revokes it.

Change within the selection. Refine the selected target; its neighbors are evidence, not material.

## Classify the drift

Before fixing an inconsistency, decide what it is:

- **missing token:** the system needs a reusable value;
- **one-off implementation:** an existing shared component or pattern should replace it;
- **conceptual mismatch:** the flow, information architecture, or hierarchy differs from comparable product areas;
- **local defect:** the work is simply incomplete or inconsistent.

Fix the cause at the narrowest correct level. A new token or a component change reaches beyond the target, so propose it unless the request covers it. Ask when a binding system principle cannot be inferred.

## Triage

Separate functional defects from cosmetic ones and fix in this order:

1. broken or blocked tasks, data loss, misleading state, and inaccessible paths;
2. missing loading, empty, error, success, disabled, and permission states;
3. flow, hierarchy, responsive, and design system drift;
4. visual and motion inconsistencies;
5. code and asset cleanup.

Do not perfect one corner while leaving the rest of the scope below the same bar.

## Polish the path

### Flow and hierarchy

- Match neighboring mental models, terminology, disclosure, save behavior, and optimistic or pessimistic patterns.
- Make the primary task and current state obvious without flattening every element to equal weight.
- Connect arrival, transition, empty, and recovery paths instead of leaving isolated screens.

### Layout and type

- Align to the project's grid and spacing scale; fix optical as well as mathematical alignment.
- Group related content tightly and separate distinct groups generously, with more space above a heading than below it.
- Keep same-role typography consistent; check measure, wrapping, localization expansion, and zoom.

### Color, imagery, and icons

- Use semantic tokens with stable meanings across themes.
- Keep icon families, stroke and weight, sizing, and optical alignment coherent.
- Give images correct aspect ratios so they do not shift layout, and useful alt text.

### Interaction and state

- Every control needs default, hover, focus, active, disabled, loading, error, and success behavior where it applies.
- Preserve visible keyboard focus, logical tab order, labels, and adequate touch targets.
- Keep motion coherent and interruptible. Do not add animation to make the polish visible.
- Cover long, missing, localized, offline, slow, and permission-limited content where the product can meet it.

### Content and code

- Keep terminology, capitalization, punctuation, and factual copy consistent.
- Remove debug output, dead code, unused imports, obsolete styles, and duplication the polish created.
- Use shared components where the system owns the pattern. Promote genuinely reusable values to tokens; do not build an abstraction for one local exception.

## Quality floor

The floor holds the mechanics; it never picks the direction. Contrast, states, overflow, copy, and honesty are checkable defects. The other items are review defaults: the established system or the user's intent can justify a different choice, and a departure from them is a finding only with a confirmed problem. Check the result, not your intentions:

- **Contrast:** body and placeholder text at least 4.5:1, large text at least 3:1. On colored surfaces, secondary text tinted from that hue or the foreground usually reads better than a generic gray, unless the system's neutrals are deliberate.
- **Depth:** shadows carry an offset and a soft blur; a zero-offset colored halo is decoration. Declare elevation once, with a border or a shadow, not a 1px border under a wide soft shadow.
- **Type:** body measure 65-75ch, display at most 6rem, letter-spacing no tighter than -0.04em (-0.02 to -0.03em usually reads better), balanced headings, obvious scale and weight steps. Run the real copy at every width and fix what overflows.
- **Motion:** one authored moment, not scattered effects or the same entrance on every section; ease out from an already-visible default.
- **States:** hover, disabled, loading, error, empty, plus real content, working controls, responsive composition, and keyboard focus.
- **Browser surfaces:** text selection, caret, focus rings, underline offset, and numerals in tabular data ship with browser defaults; style them from the system where the project does.
- **Copy:** the product's own language. Controls name their action; errors name the problem and the recovery.
- **Honesty:** claims and values come from supplied truth; label illustrative values as illustrative.

By default, polish does not introduce these category patterns: same-size icon-heading-text card grids as page structure, or cards nested in cards; the hero-metric template; a kicker or eyebrow above a heading; section numbers that carry no information; a modal for a task that needs no interruption; gradient text; decorative glass and blur; a colored side stripe border above 1px on cards, list items, callouts, or alerts; hard offset shadows outside a world that chose them; sparklines, rings, or rounded rectangles standing in for content; monospace as a costume for "technical"; emoji or Unicode glyphs standing in for icons; geometric masks faking organic contours; light or dark chosen by category instead of by the use scene. When one of these already sits inside the scope as part of the established design, it is the system, not a defect: mention it only when it causes a confirmed problem, and change it only when the request covers that change, because removing an established pattern can be a redesign.

## Apply the change in Doan

- Change only the requested scope. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- Reference token CSS variables; do not copy raw hex or rgb values.
- When something you draw on the canvas, such as a new state or component, is not in code yet, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report the findings and proposed fixes without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed and what you left unchanged on purpose, such as suspected redesign work or token changes that need the user's decision.

## Verify

Walk the whole path in scope again and check:

- narrow, intermediate, and wide layouts;
- loading, empty, error, success, disabled, long-content, and missing-content states;
- zoom, contrast, focus, semantics, and accessible names;
- layout shift and image loading;
- agreement with the identity sentence, the design system, neighboring features, and the user's scope.

Finish by reading your diff: remove accidental churn, orphaned code, redundant values, and temporary artifacts. Report anything you could not check, such as keyboard and screen reader behavior, a width you could not render, or contrast you could not measure, as unverified rather than passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/polish.md`, `skill/reference/live.md` (identity extraction and default versus departure mode only), and `skill/reference/craft-floor.md` (verify checks and refusals), under the Apache License 2.0. Doan modified them: removed the additional-context note, critique storage commands, detector and hook directives, native platform verification, the live server, browser overlay, poll loop, variant generation and parameters, and harness-specific blocks; turned live mode's identity lock into in-place refinement of a selected target; merged the quality floor without hook enforcement and limited its refusals to what polish introduces; and added target selection, design system, review-only, canvas, and verification rules for Doan. Doan also turned the floor's aesthetic absolutes into review defaults that the established system or the user's intent can justify; contrast, states, overflow, copy, and honesty stay checkable defects.

[doan:design-skill] end of preset polish
