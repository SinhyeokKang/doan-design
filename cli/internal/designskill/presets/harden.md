# Harden for real conditions

Make a design hold up against the data, errors, languages, and conditions real users bring: long and missing text, extreme values, failures, slow loading, missing permissions, and offline use. A design that only works with perfect data is not ready.

Use this preset when the user asks to cover edge cases, error or loading states, permissions, or overflow for a screen, component, or flow. The user's request and its scope come first: this guidance never widens what you change. Harden the target the user named; do not add states to frames they did not ask about.

## Before you start

- Find the target. For pointing words like "this screen" or "this form", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, or code the user named.
- Read the design system before drawing a state: token CSS (`doan config --json` shows `tokenCss`), existing components and their states, a design rules document if the project has one, and the `design-system` canvas (`.doan/canvases/design-system.html`) if it exists. Reuse existing error, empty, loading, and disabled patterns before inventing new ones.
- Read the code the frame implements (`data-doan-implements`). It shows which states, limits, and errors already exist, and which data can really be missing or huge.
- When you do not know who uses the product or what failures matter, and it would change the result, suggest the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`). Ask only what would change the states you draw, such as real field limits or which roles exist.

## Find the weak points

List the conditions the target can meet, then pick those the request covers.

**Extreme content**

- very long text (names, titles, descriptions of 100+ characters) and very short or empty text;
- emoji, accents, CJK, and right-to-left scripts;
- large numbers (millions, billions), negative and zero values, many decimals;
- many items (1000+ rows, 50+ options) and no items at all.

**Failures**

- offline, slow, and timed-out network;
- request errors: validation (400), signed out (401), forbidden (403), not found (404), rate limited (429), server error (500);
- validation and permission errors, concurrent edits, and double submission.

**Language and format**

- translations are often 30-40% longer than English (German is a common worst case);
- right-to-left layout, date, time, number (1,000 vs 1.000), currency, and plural formats.

## Draw the states

Every interactive component needs default, hover, focus, active, disabled, loading, and error states. Do not ship half of them. Keep the same component vocabulary everywhere: if the save button looks different on two screens, one is wrong.

### Text overflow

- Containers grow with their text; avoid fixed widths on anything that holds text or a label.
- Decide per field whether it wraps, clamps to a few lines, or truncates with an ellipsis, and show the full value somewhere reachable when it is cut.
- Flex and grid children that hold text need `min-width: 0` so they can shrink instead of overflowing.
- Keep body text readable: 16px on mobile, 14px only for genuinely secondary text. Mobile Safari zooms into focused inputs under 16px. Layouts must survive 200% zoom.

### Internationalization

- Budget 30-40% extra space for translated labels and buttons; size buttons by padding, not fixed width.
- Use logical properties (`margin-inline-start`, `padding-inline`) so right-to-left layout mirrors without rewrites; mirror directional icons.
- Format dates, numbers, and currency per locale; Persian and Arabic locales use Eastern Arabic-Indic digits and may expect other calendars. Never build plurals by appending "s".
- In Arabic-script text, do not strip the zero-width non-joiner (U+200C), and treat Persian and Arabic Yeh and Kaf variants as equivalent in search and validation while storing the original form.

### Errors

- Say what failed, why when known, and how to recover. Offer retry for network failures and keep the user's input on every error.
- Do not add claims about outcomes or guarantees the product or repository does not confirm, such as that no charge was made or that work was saved. When a message needs such a fact and none is confirmed, ask or mark it as an open question.
- Put validation errors inline next to the field, specific and correctable; do not block submission unnecessarily.
- Map request errors to states: validation messages for 400, a sign-in path for 401, a permission explanation for 403, a not-found state for 404, a wait message for 429, and a generic error with a support path for 500.
- One failing component must not take down the whole screen; contain the error to its region.

For the wording of error, empty, and loading messages, read the `clarify` preset when the work needs it.

### Loading

- Name what is loading ("Loading your projects") and give an honest expectation when the wait is long. Never invent progress.
- Prefer skeletons shaped like the content over a spinner in the middle of it. Distinguish initial load, pagination, and refresh.
- Reserve space for content and media that arrive later, for example with fixed dimensions or `aspect-ratio`, so loading does not shift the layout.

### Empty, permission, and offline states

- Distinguish first use, no results, filters that hide everything, user-cleared, missing permission, and failure; each needs a different message and a next action the product actually offers. When the product offers none that fits, say so or ask; do not invent one. Empty states teach the interface instead of saying "nothing here". First-use design belongs to the `onboard` preset.
- For permission states (cannot view, cannot edit, read-only), explain why and how to get access. Do not show controls the user cannot use without saying so.
- Offline: say what still works, what is queued, and what will happen when the connection returns.

### Concurrency and interaction

- Disable or mark a submit action while it is in flight so it cannot fire twice; show optimistic updates with a visible rollback path.
- Show what happens when someone else changed the same record.
- Custom drag surfaces and sliders must end the drag cleanly when the pointer is released outside, the browser cancels the gesture to scroll, or the window loses focus; the next drag works without a reload.
- Overlays escape their container: a dropdown inside an `overflow: hidden` or scrolling ancestor gets clipped. Do not reach for a modal first; try inline or progressive alternatives.

### Accessibility resilience

- Everything works by keyboard in a logical order; focus moves into and back out of dialogs.
- Status changes (errors, loading finished, saved) are announced, not only shown.
- Never rely on color alone for state; pair it with text or an icon.

### Performance cautions

Only where the target has them:

- Huge lists: paginate or virtualize instead of rendering 10,000 rows; offer search and filters.
- Heavy media: size images for their displayed size, lazy load below the fold but never above it, and give media fixed dimensions.
- Expensive effects: keep blur, filters, and large shadows small and isolated; animate `transform` and `opacity` rather than layout properties; use `will-change` sparingly.

Do not claim performance numbers you did not measure.

## Apply the change in Doan

- Change only the requested target. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- When the user asks for states on the canvas, draw each state as its own frame next to the original, with a stable id derived from it (for example `checkout-error` and `checkout-empty` for `checkout`) and a `data-doan-title` that names the state. Reuse the original's components and give new meaningful elements `data-doan-id`s. Use realistic but clearly placeholder data; do not invent product facts.
- Reference token CSS variables for color and spacing; do not copy raw hex or rgb values.
- When a state, message, or component you draw is not in code yet, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report the missing states and proposed treatments without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list the states you added or changed and the conditions you left unhandled on purpose, such as error codes the product does not have.

## Verify

Check the target against:

- 100+ character names, emoji, right-to-left text, CJK, and a long translation;
- zero, one, and 1000+ items; huge and negative numbers;
- each error the request covers, with input preserved and a recovery path;
- loading without layout shift, and the empty, permission, and offline states;
- keyboard order, focus, and announced status changes;
- 200% zoom.

Anything you could not exercise, such as a real network failure, throttled connection, screen reader, high contrast mode, a touch device, or a performance measurement, is reported as unverified. For gestures, say what produced the evidence and what stayed untested.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/harden.md`, `skill/reference/operate.md` (component states, loading, empty states, overlays, product constraints), and `skill/reference/optimize.md` (performance cautions for huge lists, heavy media, and expensive effects), under the Apache License 2.0. Doan modified them: condensed the code samples into design rules, dropped server-side validation, memory-leak, framework, bundle, network, and API optimization guidance and the automated test lists, removed the closing hand-off to the upstream `polish` command and its template placeholder, and added target selection, state frames, review-only, canvas, and unverified-check rules for Doan, a rule against unconfirmed outcome or guarantee claims in error messages, and the rule that an empty state's next action is one the product offers.

[doan:design-skill] end of preset harden
