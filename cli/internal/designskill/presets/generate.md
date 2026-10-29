# Generate design alternatives

Draw the design alternatives the user asked for on a canvas, so people can compare them in Doan: variants of an existing element, frame, or screen, or first options for a new one. Alternatives are proposals: this preset does not choose or adopt one, and does not change application code.

The user's request and its scope come first: draw the count, the direction, and the target they asked for, and leave everything else unchanged.

## Before you start

- Find the target. For pointing words like "this card" or "this screen", use `doan active` and read the open comments attached to that target. Otherwise use the canvas, frame, element, or code the user named. For a repeated component named in the plural ("the pricing cards"), the target is the container that holds the set.
- If the repository has no `.doan/config.json`, set Doan up as the Doan guide describes, asking the user for the token CSS path first. A project with no canvases yet is fine: you will create one.
- Read the design system (token CSS from `doan config --json`, components, a design rules document, a `design-system` canvas at `.doan/canvases/design-system.html`), the code the target's frame implements (`data-doan-implements`), and existing canvases (`doan ls --json`).
- When product context is missing and it would change the alternatives, read the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`). For a new feature whose purpose, flow, or states are undecided, read the `shape` preset first.

## Read the request

Take two things from the user's words, besides the target:

- **Count:** a number in the request is the count; no number means three. More than eight dilutes the differences; confirm with the user before drawing that many.
- **Direction:** read the meaning of the wording, not its keywords. The list below gives examples of meaning. A negated direction ("not bolder, just spacing options") is a constraint, not a direction. When a direction matches a preset, read that preset only if its guidance changes the alternatives (`doan design-skill <id> --json`, or the MCP `design_skill` tool with `{"id": "<id>"}`):
  - bold, bolder, stronger, punchier: `bolder`
  - quiet, calmer, softer, toned down: `quieter`
  - simpler, minimal, stripped: `distill`
  - refined, tightened, polished: `polish`
  - font and type words: `typeset`
  - color words: `colorize`
  - arrangement and spacing words: `layout`
  - device and breakpoint words: `adapt`
  - motion words: `animate`
  - playful words: `delight`
  - rule-breaking words: no single preset; each variant breaks a different convention (scale, structure, motion, input model, state transitions).
  - Intent with no word above ("feel like a bank", "warmer", "more premium"): freeform; the user's wording is the brief.
  - A direction plus extra intent ("bolder, but keep it monochrome"): that direction, with the rest as a constraint every variant honors.
  - No direction at all ("better", "different", "some options", "alternatives"): ask one question offering the directions above. If the answer is still open ("you pick"), work freeform from the original wording. If no answer comes and you continue, as in a non-interactive run, say on the canvas and in your answer which direction you assumed.

## Plan the alternatives

### Lock the identity first

On an existing surface the brand is already chosen; the job is variation within that identity. Write one sentence recording what is actually there: the dominant surface and accent token, the loaded faces, the layout topology (stacked, side by side, grid, asymmetric, overlay), the surface treatment (corners, borders, shadows, decoration density), and the voice of the copy. Read it from the design rules document, token CSS, the target's styles, and sibling components; for a new screen, from the rest of the product. Skip an axis rather than invent it, and do not name an aesthetic family. Every variant must read as the same brand side by side.

### Choose the mode

- **Default** keeps the identity and varies expression within it. It is right for most requests. Unsure means default.
- **Departure** replaces the identity. Use it only when the current request explicitly asks ("redesign this", "something completely different"), or when the project has no visual authority yet. An old note or comment is not authorization.

### Vary on distinct axes

**Default mode, free exploration** (no direction, or freeform intent): each variant commits to a different primary axis, using only the existing faces and tokens:

1. hierarchy (which element commands the eye);
2. layout topology;
3. typographic system (pairing logic, scale ratio, case and weight, within the available faces);
4. color strategy (which existing palette role carries the surface: restrained, committed, full palette, or drenched);
5. density (minimal, comfortable, dense);
6. structural decomposition (merge, split, progressive disclosure).

New fonts, new hues, or a new aesthetic family belong to departure mode only.

**Departure mode:** each variant anchors to a different direction derived from the product and its brand, never a fixed catalog. Name each in one concrete sentence with a real-world referent ("a museum exhibition label system", not "clean and minimal"), genuinely different from each other and from the current surface.

**Default mode, fixed direction** (a named direction, or a request that fixes the dimension, such as "only the colors" or "keep the brand hue"): every variant stays in that dimension and compares a distinct sub-strategy inside it, and the request's constraints bind every variant. `bolder` amplifies scale, saturation, or structure; `quieter` pulls back color, ornament, or spacing; `distill` removes noise, redundant content, or nesting; `polish` refines rhythm, hierarchy, or micro-details; `typeset` varies scale ratio, case, and weight; `colorize` varies the palette role and contrast strategy; `layout` changes the arrangement, not spacing; `adapt` targets mobile-first, tablet, desktop, or print and low data; `animate` and `delight` vary the motion vocabulary or the flavor of personality. For example, three color alternatives that keep the brand hue and theme can differ in which roles carry the accent, how much area it covers, and the contrast strategy.

Freeform wording is a ceiling on direction: in default mode it narrows the axes, not the identity ("more confident": one variant amplifies hierarchy, one commits the accent, one tightens density). When it conflicts with a binding brand commitment, keep the commitment unless the user revokes it.

### Respect the surface mode

- **Operate** (app UI, dashboards, settings): variants differ in organisation, not decoration: the navigation model, how work areas divide the screen, which data leads, density, and where any signature move sits. Controls stay standard; more ornament is the wrong direction.
- **Read** (docs, guides, articles): variants differ in reading structure (navigation model, column and margin system, density of reference material) and how the frame carries the identity, never in the reading column itself.
- **Persuade and Experience** (landing pages, showcases): each variant keeps the offer intelligible and the primary action working, and goes further than the first, not cleaner.

### Squint test

Before drawing, put the one-line descriptions side by side. In default mode, a variant that drifts in palette, type voice, or rhetoric crossed into departure by accident: rework it. In free exploration, three variants on one axis is a failure; with a fixed direction, the variants share that axis and two with the same sub-strategy mean rework. In departure mode, two descriptions that rhyme mean rework, and when the axis is color, approved departures must not share theme and dominant hue. Each alternative must be recognisably different at thumbnail size.

## Hold the quality floor

Contrast, states, overflow, and truth are checkable defects. The user's brief or the established design overrides the other defaults; your habit does not.

- Contrast: body and placeholder text at least 4.5:1, large text at least 3:1. On colored surfaces, tint secondary text from that hue instead of gray.
- Spacing: tight groups, generous separation, more space above a heading than below it.
- Type: body measure 65 to 75ch, display at most 6rem, tracking no tighter than -0.04em, obvious scale and weight steps; check real copy for overflow.
- Depth: shadows have an offset and a soft blur; declare elevation once, border or shadow.
- States, where the target has them: hover, focus, disabled, loading, error and validation, empty. Each variant draws them, or its note on the canvas names the ones it leaves out. Real content, controls that look operable, the product's own language.
- Refuse these defaults unless the brief earns them: identical icon-heading-text card grids, nested cards, an eyebrow or kicker label above a heading, the big-number hero-metric template, meaningless section numbers, gradient text, decorative glass and blur, colored side-stripe borders above 1px, hard offset shadows, decorative sparklines or rings, monospace as a "technical" costume, emoji or glyphs as icons, and light or dark chosen by category instead of the use scene.
- Claims come from supplied truth: prices, customers, benchmarks, and capabilities are never invented; illustrative values are labelled.

## Draw the alternatives in Doan

- **Where:** where the user asked; otherwise new frames next to the target on its canvas. If there is no such canvas, create one under `.doan/canvases/` with `<meta name="doan:canvas" content="id">` (a unique lowercase kebab id) and `<meta name="doan:width" content="...">` wide enough for the frames, and link the token CSS relative to the canvas.
- **Never change the original.** Each alternative is a new frame (`data-doan-frame`) with a new, stable, unique id such as `<target>-alt-1`, and a `data-doan-title` naming its axis or direction.
- **Complete replacements:** each alternative is the whole target redrawn, not a CSS-only patch. Give copied elements new `data-doan-id` values (element ids are unique within a canvas). Scope each alternative's styles to its own frame, and reference token CSS variables instead of raw hex or rgb values.
- **Proposals, not code:** state on each alternative that it is a proposal not in code (Doan guide rule G), with one line on what it changes. Do not mark an alternative with `data-doan-implements`.
- **No adoption:** do not pick an alternative for the user or apply one, and do not delete any. Draw no comparison or voting UI, create no branches, and run no live session. Applying a chosen one is a separate request.
- If the user asked only for ideas or a plan, describe the alternatives without editing files. A request to review existing alternatives ends in a report, without editing files.
- After editing, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list each alternative (canvas, frame id, axis or direction), the identity sentence you held fixed, and anything left for the user to decide.

## Verify

- Each alternative matches the requested count, direction, and target, and the original is unchanged.
- The identity holds across default-mode variants. In free exploration, each variant's primary axis is distinct; with a fixed direction, every variant stays in that dimension with a distinct sub-strategy and honors the request's constraints; departure variants differ in direction.
- The quality floor above holds in each variant, and each variant draws the target's states or names on the canvas the ones it leaves out.
- `doan check` passes and every new id is unique.

Report anything you could not check, such as rendered contrast or appearance at widths you could not view, as unverified.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/generate.md` (direction words and default count), `skill/reference/live.md` (variant planning: identity lock, mode, primary axes, squint test, complete replacements), `skill/reference/craft-floor.md` (quality floor and refusals), `skill/reference/new-work.md` (what is already true), `skill/reference/mode-operate.md`, `skill/reference/mode-persuade.md`, `skill/reference/mode-read.md` (how variants differ per surface mode), and `skill/SKILL.src.md` ("Modes"), under the Apache License 2.0. Doan modified them: replaced the live browser session, helper commands, overlay, tuning knobs, accept and cleanup steps with alternatives drawn as new canvas frames; removed the hook enforcement, detector, image generation, and harness-specific blocks; left choosing and applying an alternative to the user; made the direction words examples of meaning, with negated directions treated as constraints; kept the multi-axis rule for free exploration, compared sub-strategies inside a fixed direction, and limited the different-theme-and-hue rule to approved departures; made the quality floor's refusals defaults that the brief or the established design can override; and added review-only, Doan setup, canvas, id, and verification rules, a rule that a variant names on the canvas the states it leaves out, and a rule to state the assumed direction when a direction question gets no answer.

[doan:design-skill] end of preset generate
