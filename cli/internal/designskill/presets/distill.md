# Simplify the design

Strip a design to its essence: remove what does not earn its place, such as redundant elements, repeated information, decorative noise, and cosmetic complexity. Simplicity is not removing features; it is removing obstacles between users and their goals.

Use this preset when the user asks to simplify, declutter, reduce, or strip back a screen, frame, component, or flow. The user's request and its scope come first: this guidance never widens what you change. Never remove function or meaning the user did not agree to remove, and ask before dropping content that carries product facts, such as prices, limits, legal text, status, or data users decide with.

## Before you start

- Find the target. For pointing words like "this screen" or "this panel", use `doan active` and read the open comments attached to that target (`doan comments --canvas <id>`). Otherwise work on the canvas, frame, or code the user named.
- Read the design system: the token CSS (`doan config --json` shows `tokenCss`), existing components, any design rules document, and a `design-system` canvas (`.doan/canvases/design-system.html`) if present.
- Read the code the canvas implements (`data-doan-implements`) to learn which elements carry real function, data, or states.
- Find the primary user goal for this surface. If the goal, the audience, or what is essential is unclear from the repository, do not guess: ask. When product context is missing and it would change what to cut, suggest the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`).

## Assess the complexity

Name what makes the design feel complex or cluttered:

- **Too many elements:** competing buttons, redundant information, visual clutter.
- **Excessive variation:** too many colors, fonts, sizes, and styles without purpose.
- **Information overload:** everything visible at once, no progressive disclosure.
- **Visual noise:** borders, shadows, backgrounds, and decorations that serve no hierarchy or function.
- **Confusing hierarchy:** no clear answer to what matters most.
- **Feature creep:** too many options, actions, or paths forward.

Then find the essence:

- What is the one primary user goal?
- What is necessary, and what is nice to have?
- What can be removed, hidden until needed, or combined?
- What is the 20% that delivers 80% of the value?

## Plan the cuts

Write a short editing plan before changing anything:

- **Core purpose:** the one thing this surface must accomplish.
- **Essential elements:** what that purpose truly needs.
- **Progressive disclosure:** what can wait behind a clear entry point.
- **Consolidation:** what can be merged or integrated.
- **Needs approval:** every cut that removes a function, an option, or content carrying product facts. Ask about these before applying them.

Expect to say no to good ideas to make room for clear execution.

## Simplify by dimension

### Information architecture

- Remove secondary actions and redundant information; if it is said elsewhere on the surface, do not repeat it here.
- Hide complexity behind clear entry points: disclosure sections, step-through flows, or a details view.
- Combine related actions, merge similar buttons, consolidate forms, group related content.
- Keep one primary action, few secondary actions, and everything else tertiary or hidden.

### Visual

- Use one or two colors plus neutrals, not five to seven, drawn from the existing tokens.
- Limit typography to one family, three or four sizes, and two or three weights where the system allows it.
- Remove borders, shadows, and backgrounds that serve neither hierarchy nor function.
- Flatten structure: fewer nested containers, and avoid cards inside cards unless the established system uses them deliberately. Basic layout does not need cards; spacing and alignment usually do the work.
- Use one spacing scale and remove arbitrary gaps.

### Layout

- Replace complex grids with a simple vertical flow where the content allows.
- Move secondary sidebar content inline or behind disclosure.
- Pick one alignment and keep it.
- Let content breathe instead of packing everything tight.

### Interaction

- Offer fewer choices and a clearer path forward.
- Make common choices automatic with smart defaults; ask only when necessary.
- Prefer inline editing to modal flows where possible.
- Ask whether the flow can lose a step.
- Make one next action obvious instead of five competing ones.

### Content

- Cut filler, not meaning. Use active voice ("Save changes", not "Changes will be saved") and plain language.
- Make text scannable: short paragraphs, lists, clear headings.
- Remove marketing fluff, hedging, headings that restate intros, and repeated explanations. Say it once.

### Code

When the request covers the implementation, remove unused styles and components, flatten component trees, consolidate similar styles, and question variants: three may cover 90% of cases that twelve now cover.

## Avoid

- removing necessary functionality: simple is not feature-less;
- sacrificing accessibility: clear labels and accessible names are still required;
- making things so minimal they become unclear: mystery is not minimalism;
- removing information users need to make decisions;
- eliminating hierarchy entirely: some things should stand out;
- oversimplifying complex domains: match complexity to the actual task.

## Apply the change in Doan

- Change only the requested scope. Keep canvas, frame, and element ids unchanged for everything that stays, and leave frames and elements outside the request as they are.
- Check open comments attached to an element or frame before deleting it.
- Reference token CSS variables; do not copy raw hex or rgb values.
- When the simplified canvas no longer matches the code it implements, or shows something not in code yet, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report the findings and the proposed cuts without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what you removed, hid, or merged and why, whether removed options need another access point, and what you left unchanged on purpose because it needs the user's decision.

## Verify

Check that the simplification improves use:

- the primary task is faster and easier to understand;
- every necessary function is still reachable;
- what matters most is obvious;
- no product fact, state, or recovery path disappeared without the user's agreement;
- labels and accessible names survived the cuts.

Report anything you could not check, such as task timing with real users or load performance, as unverified rather than passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, file `skill/reference/distill.md`, under the Apache License 2.0. Doan modified it: replaced the ask placeholder with a "Before you start" section, required the user's agreement before removing function or content that carries product facts, limited code simplification to requests that cover the implementation, turned "Document Removed Complexity" into the final answer, removed the closing hand-off to the upstream `polish` command and its template placeholder, and added target selection, review-only, canvas, and verification rules for Doan. Doan also turned the upstream ban on cards inside cards into a default the established system can justify.

[doan:design-skill] end of preset distill
