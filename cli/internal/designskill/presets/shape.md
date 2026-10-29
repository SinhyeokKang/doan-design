# Shape a feature

Work out what one feature or screen should be and how it should work before anyone builds it: its purpose, the people who reach it, the flow, the states, and the scope. The result is a confirmed design brief, and a canvas sketch only when the user asks for one. This preset never starts implementation and never edits application code.

Use it for ordinary requests to design a new feature, screen, or flow, or to plan a change to one before building. The user's request and its scope come first: this guidance never widens what you plan or change.

## Before you start

- Find the target. For pointing words like "this screen" or "this flow", use `doan active` and read the open comments attached to that target. Otherwise work on the feature, canvas, frame, or code the user named.
- Read what already exists before asking: product and feature documents, the code a canvas implements (`data-doan-implements`), existing canvases (`doan ls --json`), and the design system: token CSS (`doan config --json` shows `tokenCss`), components, an existing design rules document, and a `design-system` canvas (`.doan/canvases/design-system.html`) if present.
- When product context (users, purpose, constraints) is missing and it would change the brief, read the `context` preset first (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`).
- When the brief depends on a design system that exists only in code and needs recording, read the `document` preset the same way. Do not record one the user did not ask for.

## Decide what is already true

Visual authority is evidence, not a filename. A missing design document does not make a project greenfield.

- **Extend an existing surface:** inherit its visual world and composition. Resolve only the new purpose, content, hierarchy, states, interaction, and how the addition joins the surrounding experience. No direction exercise, and no design system change unless the user approves one.
- **A whole new surface inside an established world:** keep the visual system fixed. Composition and flow may still be open; when they materially are, note the structurally different options derived from the content, task, and user behavior. If the user wants them drawn as alternatives, that is the `generate` preset.
- **A new or replacement world:** product truth, content, function, and explicit brand commitments carry over; the old look is evidence, not authority. Record the visual direction as an open decision for the user rather than inventing one inside the brief.

A section, component, feature, or state inside an established surface inherits that surface. Never turn a local addition into a new identity exercise.

## Name the surface mode

The mode names what the visitor's success looks like. Choose it from the requested surface, not the product: a tool's landing page is Persuade, a docs index is Read.

- **Operate** (app UI, dashboards, editors, settings): the visitor came to get a job done. Ask about the task, the information it needs, the important states, frequency of use, and constraints. The surface must read as a working product of its category: standard navigation and controls the visitor already knows, a distinct area for each job, data with clear states. Expression never obscures the task, state, or familiar affordance; identity lives in type, palette, density, and at most one signature move.
- **Read** (docs, guides, articles, changelogs): the visitor came to understand something. Ask about the reader's question, the source material, the structure, and wayfinding. Documentation reads as documentation. Plan the shell first: where the reader stands in the navigation, the title and the opening that answers or frames the question, a calm reading column (about 60 to 75 characters, body near 16px), and the way forward. Monospace is for code and data, not running text.
- **Persuade** (landing, pricing, campaigns): the visitor decides and acts. Ask who must act, what they should believe, and which real proof, content, or assets earn that belief. The opening makes the offer intelligible, exposes the action in its working form (a search, a booking slot, add to cart), and demonstrates something only this product can prove.
- **Experience** (portfolios, galleries, showcases): the work itself leads from the first view. Ask what leads, how exploration unfolds, and which interaction or transition matters.

## Ask what will change the result

Ask only about gaps that the request and the repository do not already answer. A precise request may need only a compact confirmation of your reading; a sparse one needs at least one round of answers. When the user asked for a brief without questions, or no one can answer, mark your assumptions plainly instead.

- Use a structured question tool when available; otherwise ask and wait.
- Ask two or three related questions per round. One round is the default; add a second only when the answers expose a material gap.
- Do not dump a questionnaire, repeat settled facts, or turn obvious facts into menus. State the likely reading and invite correction.

**Purpose, people, and outcome** (choose the two or three that most change the result):

- What is this feature or screen for, and what problem must it solve?
- Who reaches it, in what situation and state of mind?
- What is the primary thing they must understand or do? What does success look like?
- What is uniquely true here that a neighboring product or a generic template could not claim?

**Material, behavior, and boundaries** (only for material open decisions):

- What real content, data, evidence, and assets must it carry? What are realistic minimum, typical, and maximum ranges?
- Which states and transitions matter: first use, empty, loading, error, success, permissions, overflow, expert use?
- What fidelity, breadth, and interactivity are intended: an exploration, one production screen, a full flow?
- What must remain untouched? What would make the result feel wrong even if it looked polished?
- Which platform, accessibility, localization, performance, or delivery constraints are binding?

Never ask for CSS values or canned aesthetic styles.

Truth binds claims, not demonstrations: illustrative content may be authored and labelled as such, but prices, customers, benchmarks, and capabilities the product does not have stay uninventable.

## Write the brief

Write the smallest useful brief. Use three to five bullets when the task is settled; use the full structure only for ambiguous, multi-screen, or standalone planning. Do not restate the conversation.

1. **Job and audience:** who arrives, their context, their need, and the surface mode.
2. **Outcome and proof:** the primary task or action, what success means, the real evidence, and what is specific to this product.
3. **Direction:** inherited, extended, or open visual authority; the structural and interaction idea; the reading or task sequence; the focal moment.
4. **Scope and boundaries:** fidelity, breadth, interactivity, the named target, what remains untouched, and explicit anti-goals.
5. **States and ranges:** realistic content and data ranges, and every state that matters.
6. **Interaction and layout:** hierarchy, structure, responsiveness, affordances, feedback, and transitions; intent, not CSS.
7. **Constraints and open decisions:** platform, accessibility, localization, reusable components, and choices a builder must not invent.

## Confirm and stop

Present the brief for explicit confirmation or one correction round, then stop. Shaping does not continue into building: implementation, code changes, and drawing finished designs are separate requests.

## Work in Doan

- The brief lives in your answer. Write it to a file only when the user asks, in the project's existing feature or design documents or a location the user chooses, never under `.doan/`.
- Draw a canvas sketch only when the user asks for one. Keep it to structure, flow, and states, not a finished visual. Add new frames with new, stable, unique ids; leave existing frames and elements unchanged. A new canvas needs `<meta name="doan:canvas" content="id">` and `<meta name="doan:width" content="...">` in `<head>`, and links the token CSS relative to the canvas; reference token CSS variables instead of raw colors.
- If the repository has no `.doan/config.json` and the user asked for a sketch, set Doan up as the Doan guide describes, asking for the token CSS path first.
- State on the canvas that the sketched feature is not in code yet (Doan guide rule G).
- If the user asked for a review of an existing plan only, report findings and proposals without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what you confirmed, what you assumed, what remains open, and any file or frame you wrote.

## Verify

- Every requirement in the request appears in the brief and is findable at a glance.
- Every material state has an owner in the brief, including empty, error, and loading.
- Scope boundaries and untouched areas are explicit.
- No fact, claim, or visual direction was invented where the user had not decided it; assumptions are labelled.
- A sketch, if drawn, passes `doan check` and keeps existing ids unchanged.

Report anything you could not check, such as how a sketch renders at a width you could not view, as unverified.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/shape.md`, `skill/reference/new-work.md` (sections 1 to 3: what is already true, what to ask, how much to invent), `skill/reference/mode-operate.md`, `skill/reference/mode-persuade.md`, and `skill/reference/mode-read.md` (surface-mode questions and constraints), and `skill/SKILL.src.md` ("Modes"), under the Apache License 2.0. Doan modified them: removed the concept seed, decision page, direction contract, comp-led build, finish review, image generation, script commands, and fixed product and design file paths; replaced the hand-off to new visual work with open decisions in the brief; made recording the brief and drawing a sketch depend on the user's request; and added target selection, design system, canvas, and verification rules for Doan.

[doan:design-skill] end of preset shape
