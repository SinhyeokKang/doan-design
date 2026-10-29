# Calm the design

Reduce visual intensity in a design that is too loud, aggressive, or overstimulating, without losing personality or making the result generic. Quiet design is harder than bold design: subtlety needs precision, and quiet without intent collapses to generic.

Use this preset when the user asks to tone down, soften, calm, or make quieter a screen, frame, component, or flow. The user's request and its scope come first: this guidance never widens what you change.

## Before you start

- Find the target. For pointing words like "this screen" or "this banner", use `doan active` and read the open comments attached to that target (`doan comments --canvas <id>`). Otherwise work on the canvas, frame, or code the user named.
- Read the design system: the token CSS (`doan config --json` shows `tokenCss`), existing components, any design rules document, and a `design-system` canvas (`.doan/canvases/design-system.html`) if present.
- Read the code the canvas implements (`data-doan-implements`) so the calmer version keeps its states and behavior.
- Understand the context: the surface's purpose (marketing, tool, or reading), its audience (some contexts need energy), what already works, and the core message to preserve. If these are unclear from the repository, do not guess: ask. When product context is missing and it would change the result, suggest the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`).

## Match the surface

- **Brand and experience surfaces** (landing pages, campaigns, showcases): quieter means a more restrained palette, more whitespace, more typographic air. Drama is reduced, not eliminated; the point of view stays intact.
- **Product and reading surfaces** (app UIs, dashboards, settings, tables, tools, docs, long-form): quieter means less visual noise. Fewer background accents, flatter cards, less color, less motion. The tool should disappear into the task.

## Assess the intensity

Name what makes the design feel too intense:

- **Color saturation:** overly bright or saturated colors.
- **Contrast extremes:** too much high-contrast juxtaposition.
- **Visual weight:** too many bold, heavy elements competing.
- **Animation excess:** too much motion or overly dramatic effects.
- **Complexity:** too many visual elements, patterns, or decorations.
- **Scale:** everything large and loud with no hierarchy.

Quieter means refined and easier on the eyes, not generic. Generic quiet looks like gray text on white, one sans at a uniform weight, and a grid of identical cards; restraint still needs a point of view.

## Plan the refinement

Decide before editing:

- **Color:** desaturate, or shift to more restrained tones?
- **Hierarchy:** which very few elements stay bold, and which recede?
- **Removal:** what can go entirely?
- **Restraint:** how will quality show through precision instead of volume?

## Refine

### Color

- Shift fully saturated colors toward 70-85% saturation, and replace bright colors with muted tones.
- Use fewer colors more deliberately. Let neutrals do most of the work and keep color as an accent, roughly 10% of the surface.
- Keep high contrast only where it matters most; text still meets its contrast floor.
- Prefer warm or cool tinted grays to pure gray.
- Gray text on a colored background usually looks dull; prefer a darker shade of that color or transparency, unless the system's neutrals are deliberate. Either way, it must meet its contrast floor.
- Work through the token CSS. If the calmer tone does not exist as a token, propose the token change instead of writing a raw value.

### Visual weight

- Reduce font weights (900 to 600, 700 to 500) and sizes where appropriate.
- Build hierarchy with weight, size, and space rather than color and boldness.
- Increase breathing room and reduce density where the surface allows.
- Thin borders and lines, lower their opacity, or remove them.

### Decoration

- Remove gradients, shadows, patterns, and textures that serve no purpose.
- Soften border radius extremes and simplify custom shapes.
- Reduce layering, blur effects, glows, and stacked shadows.

### Motion

- Shorten travel (10-20px instead of 40px) and use gentler easing.
- Keep functional motion and remove flourishes; replace dramatic effects with gentle feedback.
- Use a quart ease-out for understated motion. Bounce and elastic easing read as loud; drop them unless the established system uses them deliberately.
- Remove animation entirely when it serves no clear purpose.

### Composition

- Reduce scale jumps; smaller contrast between sizes feels calmer.
- Bring rogue elements back to the grid.
- Replace extreme spacing variation with a consistent rhythm.

## Product surfaces in depth

For app and document surfaces, calm comes from earned familiarity. A user fluent in the category should trust the interface immediately instead of pausing at subtly-off components. The failure mode is strangeness without purpose: over-decorated buttons, mismatched form controls, gratuitous motion, display fonts where labels belong, invented affordances for standard tasks.

- **Type:** one well-tuned family can carry headings, buttons, labels, body, and data. Use a fixed rem scale, not fluid headings, with a tighter ratio of 1.125-1.2 between steps. Prose keeps a 65-75ch measure; tables and compact UI may run denser.
- **Color:** restrained is the default. The accent marks primary actions, current selection, and state only, not decoration. A second, slightly cooler or warmer neutral layer can separate sidebars, toolbars, and panels from content. Inactive states usually do not carry heavy or fully saturated color.
- **Motion:** 150-250 ms for most transitions; motion conveys state change, feedback, loading, or reveal. Orchestrated page-load sequences rarely belong here.
- **Consistency:** the same button shape, form-control vocabulary, and icon style across screens. If "save" looks different in two places, one is wrong. Do not reinvent standard affordances for flavor.

Reading surfaces follow the type and consistency rules above; their prose measure and navigation matter more than component density.

## Avoid

- making everything the same size and weight: hierarchy still matters;
- removing all color: quiet is not grayscale;
- eliminating all personality: keep character through refinement;
- sacrificing usability: functional elements still need clear affordances and states;
- making everything small and light: some anchors are needed.

## Apply the change in Doan

- Change only the requested scope. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- Reference token CSS variables; do not copy raw hex or rgb values.
- When something on the canvas, such as a new muted token or a changed motion, is not in code yet, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report the intensity sources and proposed changes without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed and what you left unchanged on purpose, including token changes you proposed instead of making.

## Verify

Check that:

- users can still accomplish their tasks, and controls still read as controls;
- the result still has character and is not generic;
- text is easier to read for extended periods and still meets contrast (at least 4.5:1 for body text, 3:1 for large text);
- the point of view survives the cuts: restrained, not absent.

Report anything you could not check, such as contrast you could not measure, motion you could not play, or reduced-motion behavior, as unverified rather than passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/quieter.md` and `skill/reference/operate.md` (Operate and Read depth: slop test, typography, color, motion, product constraints), under the Apache License 2.0. Doan modified them: renamed the visitor modes as surface types, replaced the ask placeholder with a "Before you start" section, routed color changes through token CSS, condensed the Operate depth into calming guidance for product and reading surfaces and dropped its layout, component-state, and permission notes and rule tags, removed the closing hand-off to the upstream `polish` command and its template placeholder, and added target selection, review-only, canvas, and verification rules for Doan. Doan also turned the upstream bans on gray text over color, bounce and elastic easing, and page-load sequences into defaults the established system can justify.

[doan:design-skill] end of preset quieter
