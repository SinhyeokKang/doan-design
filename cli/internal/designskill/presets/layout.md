# Fix the layout

Turn product priority into reading order, grouping, rhythm, and usable space. Diagnose the structural problem before moving boxes, and change structure inside the established visual world rather than replacing it.

Use this preset when the user asks to improve arrangement, spacing, alignment, grouping, density, or reading order on a canvas or in code. The user's request and its scope come first: this guidance never widens what you change.

## Before you start

- Find the target. For pointing words like "this screen" or "this section", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, or code the user named.
- Read the design system: token CSS (`doan config --json` shows `tokenCss`), especially spacing, size, and breakpoint variables; existing layout components; any design rules document; and the design-system canvases in `.doan/ds/` (or a legacy `.doan/canvases/design-system.html`) if present.
- Read the code the canvas implements (`data-doan-implements`) so the proposed structure fits the real component tree and its states.
- If the product's users and tasks are unknown and that would change the priority order, suggest gathering them first with the `context` preset (`doan design-skill context --json`). Ask only what would change the result.
- A layout change preserves the identity. If the request turns out to need a new visual identity, confirm that with the user before going further.

## Match the surface

- **Marketing, campaign, and showcase surfaces:** composition may be asymmetric, fluid, or intentionally disruptive when the established direction earns it.
- **App and document surfaces** (tools, dashboards, settings, editors, docs, guides): predictable structure, stable density, and navigable linearity are affordances.

On app and document surfaces:

- Familiarity is a feature. A user fluent in the category should trust the layout immediately instead of pausing at every subtly-off region. The failure mode is strangeness without purpose, not plainness.
- Responsive behavior is structural: collapse the sidebar, make the table responsive, change columns at breakpoints. Do not rely on fluid type to make things fit.
- Standard navigation patterns are permitted and usually right: top bar with side navigation, breadcrumbs, tabs, command palettes.
- Density is allowed when users need it: tables with many rows, panels with many labels. Consistency from screen to screen beats surprise.
- Reach for inline or progressive disclosure before a modal. A modal as the first idea is usually a missing layout decision.
- Overlays must escape their container. An absolutely positioned dropdown inside an `overflow: hidden` or `overflow: auto` ancestor gets clipped; use `<dialog>`, the popover API, `position: fixed`, or a portal.
- On document surfaces, prose measure and navigation matter more than component density.

## Assess the structure

Inspect representative states and widths. Answer each question with rendered or source evidence (a file, selector, or frame), not impression:

- **Reading order:** apply the squint test. With detail blurred, can you still find the primary element, the secondary element, and the major groups, in order?
- **Grouping:** are related items close and distinct groups separated, or are containers compensating for weak proximity?
- **Rhythm:** do tight and generous intervals create a deliberate cadence, or is one spacing value repeated until everything has equal weight?
- **Structure:** does the topology match the content and task? Are repeated cards, columns, or sections genuinely equivalent, or a framework default?
- **Density:** does the amount of information per region fit use frequency, decision complexity, and the surface type?
- **Adaptation:** at narrow, intermediate, wide, zoomed, and localized states, what reorders, collapses, wraps, scrolls, or stays fixed? Does DOM and focus order still match the visual order?
- **Extremes:** do long content, empty states, overlays, sticky elements, safe areas, and small touch targets expose structural failures?

Then scan the source separately: one-off spacing values outside the spacing scale, arbitrary widths and heights, overflow and stacking (`z-index`) problems, and container behavior. Keep this scan out of the first assessment so it does not anchor it, and combine both before editing. A clean scan cannot prove hierarchy or rhythm.

## Set the spatial thesis

Before editing, name:

- the primary reading or task path;
- what belongs together and what must separate;
- which element leads and which supports;
- the intended density and spacing rhythm;
- how the structure changes across containers, widths, input modes, and content extremes.

Choose the simplest structural model that expresses those relationships. Use layout primitives for the relationships they control, and name reusable spacing and container roles by purpose, not value.

## Apply

- Group by meaning. Use proximity before adding containers, borders, or decoration.
- Create rhythm through deliberate contrast between tight and generous intervals.
- Use the project's spacing scale through its token CSS variables rather than one-off values. A 4-unit base usually provides the middle steps an 8-only scale misses. If the project has no spacing step you need, propose a new token instead of hard-coding a value; adding it to the project's token CSS is the user's decision.
- Let hierarchy follow product priority, not framework defaults.
- Keep distinct content visually distinct without turning every group into an isolated card.
- Make responsive behavior structural: reorder, collapse, reflow, or reveal based on what remains important.
- Prefer container-aware components when the same component appears in different contexts.
- Use `gap` for sibling rhythm when it expresses the relationship more directly than child margins.
- Keep touch targets usable even when their visible marks are small.
- Use depth only when it clarifies state or hierarchy.
- Make optical corrections only after looking at the rendered result.

Variation is not a goal by itself. Repetition supports recognition; break it only when content or priority changes.

## Apply the change in Doan

- Change only the structure in the requested scope. Keep canvas, frame, and element ids unchanged; when you move or regroup an element, keep its `data-doan-id` so its comments follow it. Leave frames and elements outside the request as they are.
- Check the open comments attached to an element or frame before substantially restructuring it.
- A frame shows one width. Draw additional frames for other widths or states only when the request covers them; otherwise describe the intended adaptation in your answer.
- When a structure drawn on the canvas is not in code yet, such as a new region, component, or breakpoint behavior, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report the assessment, the spatial thesis, and proposed changes without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed and what you left unchanged on purpose, and any spacing token you proposed rather than added.

## Verify

- The squint test still reveals the primary, secondary, and major groups in order.
- The reading and task path stays clear at every width the request covers.
- Related content groups naturally; unrelated content does not blur together.
- Tight and generous spacing create intentional rhythm instead of monotonous repetition.
- Density matches use frequency and content complexity.
- Long text, empty states, localization, zoom, and dynamic content do not break the structure.
- DOM and focus order agree with the visual order.
- The source scan has no unexplained one-off values.

Answer each item with rendered or source evidence; a bare "yes" is not verification. Report anything you could not render or test, such as a width, zoom level, keyboard or screen reader path, or touch device, as unverified.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/layout.md` and `skill/reference/operate.md` (product slop test, layout, components overlay rule, and product permissions), under the Apache License 2.0. Doan modified them: replaced visitor modes with surface types and removed native platform references; replaced the subagent assessment and the bundled detector scan with a source scan the agent runs itself; removed the live-mode parameters, the identity-replacement routing, and the closing hand-off to the upstream `polish` command; and added target selection, design system tokens, review-only, canvas, and verification rules for Doan.

[doan:design-skill] end of preset layout
