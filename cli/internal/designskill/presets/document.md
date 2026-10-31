# Document the design system

Record the design system a project already ships, so agents generating new screens stay consistent with it and people can check it at a glance. The preset produces two artifacts: a rules document that agents read, and design-system canvases in `.doan/ds/` where people check colors, typography, and components.

Use it when the project has real tokens or components but no rules document or design-system canvases, when the existing ones have drifted from the code, or before a large redesign to capture the current state. The user's request and its scope come first: this guidance never widens what you change.

## Scope

- Reuse an existing design system when it is sufficient. Do not regenerate a rules document or canvases that already describe the shipped system; report that it matches and what you checked.
- A plain request to set up Doan (`doan init`, `doan config`) is not approval to write a design system. Write the documents only when the user asked for them or agreed to them.
- If the user asked for a review only, report drift, gaps, and proposed changes without editing files.
- When updating an existing rules document or canvases, change only what the request covers. Keep sections, canvases, frames, and ids outside the request unchanged.

## Before you start

- Find the target. For pointing words like "this canvas" or "this frame", use `doan active` and read the open comments attached to that target (`doan comments --canvas <id>`).
- Read the configured token CSS (`doan config --json` shows `tokenCss`), the component code, and the global stylesheet.
- Look for an existing design document (for example `DESIGN.md`, a style guide, or a design section in the docs) and for design-system canvases: `.doan/ds/`, then a legacy `.doan/canvases/design-system.html`. `doan ls --json` lists canvases with their open and resolved comment counts.
- Read the `context` preset (`doan design-skill context --json`) before writing either artifact, even when the request already names the deliverable, unless you already read it in this conversation or the project already has a product context document (who the product is for, brand commitments). Ask only what would change the documents.

## Document what shipped

The ground truth is the shipped code. Every token and rule you record must be evidenced by the code, never by what was planned or by what would be nicer.

- Where a plan, an older document, or a draft canvas disagrees with the code, the code wins. The document may note the divergence.
- A value earns its place by being used and legible. Never record a value only to legitimize a defect or to make a finding disappear.
- Check every prohibition against the system's own materials. A "don't" that bans a device the system itself uses natively is wrong.
- Never turn a confirmed defect into house style. A defect needs a confirmed problem: a contrast pair that fails, a missing focus or error state, text that overflows, a value that contradicts the system's own tokens, or a one-off that breaks a pattern the code otherwise keeps. List it as a defect the code carries, not as a rule for future screens to inherit; one documented defect becomes the house style.
- Aesthetic defaults are not defects. A system font as the display face, glyph icons, eyebrows above headings, or hard offset shadows are the system when the code uses them consistently or the user chose them; record them as rules. When you cannot tell a deliberate choice from an accident, ask instead of judging.
- Pre-existing drift is reported, not repaired, unless the user asks.
- Do not write merely to show that the pass ran. When the recorded system still matches the code, leave it untouched and report the evidence you checked.

## Step 1: Find the design evidence

Search in this order and note the file each value comes from:

1. CSS custom properties: color, font, spacing, radius, shadow, easing, and duration declarations, usually in the token CSS or the root stylesheet.
2. Tailwind configuration: the theme extensions for colors, font families, spacing, radius, and shadows.
3. CSS-in-JS theme files and design token files (JSON tokens, Style Dictionary output).
4. The component library: the main button, input, card, navigation, dialog, chip, and list item components, their variant APIs and default styles.
5. The global stylesheet: base typography and color assignments.
6. Existing canvases that implement the code (`data-doan-implements`), as secondary evidence.

Sampling computed styles from rendered output needs a real browser. If you have none, say which values you could only read from source.

If the scan finds no tokens, no components, and no rendered output, there is nothing to document yet. Say so and do not fabricate a token spec. If the user still wants a direction recorded before code exists, write only what they decide, mark every unresolved value as open, omit the components section, and state on the canvas that none of it is in code yet.

## Step 2: Extract what is real

Build a draft from the discovered evidence:

- **Colors:** group by role: primary, secondary, tertiary, neutral. If the project has one accent, express it as primary plus neutral; omit secondary and tertiary rather than inventing them. Keep the project's own token names; do not rename them to a framework's defaults.
- **Typography:** map the sizes and weights in use to roles (display, headline, title, body, label). Note font stacks and the scale ratio.
- **Elevation:** catalogue the shadow vocabulary. A flat system that conveys depth with tonal layers is a valid answer; state it explicitly.
- **Components:** for each common component, record shape (radius), color assignment, hover, focus, active, and disabled treatment, and internal padding.
- **Layout and spacing:** grid, containers, breakpoints, rhythm, and density.
- **Shapes:** radius strategy, borders, clipping, and recurring forms.

Stop at what is actually reused; one-off values pollute the system. Do not invent components the project does not have. If the project has only buttons and cards, document only those. Keep the token CSS as the single source of truth for values: preserve its color format (hex, `rgb()`, `oklch()`, and so on) and never restate a value differently elsewhere.

## Step 3: Settle what evidence cannot answer

Some parts of a design system are judgment, not extraction: a one-line character for the system, the mood and aesthetic philosophy, descriptive names for key colors ("deep muted teal-navy", not "blue-800"), the elevation philosophy, and the feel of components ("tactile and confident" or "refined and restrained").

Ask about these only when the document needs them. Ask in small rounds of at most three focused questions, offer two or three options grounded in the evidence, and wait between rounds. Do not invent rules and present them as facts. A rule nobody confirmed is either settled with the user or marked as open in both artifacts.

Policies for future screens are judgment too, even when they look like extraction: how many primary actions a view may have, whether radii or shapes may mix, whether depth stays flat or tonal, which colors are reserved for which uses, the spacing between components, and whether a choice was deliberate. The code shows what exists today, not what is allowed tomorrow:

- A rule is grounded when it cites the token, component, or file that makes it true, or a decision the user confirmed. Anything else is an open item, not a rule.
- A rule is only as wide as its evidence and names the tokens, components, or files it covers. "Inputs in `input.css` show a 2px `--color-accent` focus ring" is a rule; the same ring on "every interactive element", "all variants", or components not yet written is an open decision. A role read from a token's name that no code uses is open too.
- Instructions for new work are open decisions unless the user or a project document states them: what new tokens, components, variants, or screens must do ("keep that format when adding tokens", "use only these steps", "a new variant keeps the border").
- Absence is not a prohibition. One radius in the code is a fact to record ("buttons and inputs use `--radius-md`"); "do not add another radius" is an open decision.
- Do not call a choice deliberate unless the user or a product context document says so. Record what the code does.
- No rule may presuppose an answer to an open item, not even for the interim. If flat depth is open, do not also write "tone, not shadow" or "until it is decided, do not add shadows" as a rule.
- When the user asked you to mark decisions as open instead of waiting, mark them open and continue. Never upgrade an open item to a rule because no one answered.

Carry a product fact into the design document only when it is a durable brand commitment that constrains the visual system. The design document is strictly visual; do not duplicate product context.

## Step 4: Write the rules document

Location:

- If the project already has a design document, update that document.
- Otherwise ask the user where it should go. If there is no answer, propose a root `DESIGN.md` and wait for agreement before writing it.
- Never put it under `.doan/`, which holds Doan's configuration, canvases, assets, and comments.
- Never silently overwrite an existing file. Show what would change and let the user choose between refreshing it, merging into it, or replacing it.

Structure: follow the existing document's structure when there is one. For a new document, this order works well; omit sections that do not apply rather than filling them with invented rules:

```markdown
# Design System: <project>

## Overview
## Colors
## Typography
## Layout
## Elevation & Depth
## Shapes
## Components
## Do's and Don'ts
## Open Decisions
```

Writing style:

- **Descriptive before technical.** "Gently curved edges (`--radius-md`, 8px)" reads better than a class name. Do not paste raw CSS class names.
- **Functional over decorative.** For each token, say where and why it is used, not only what it is.
- **Name the token.** Refer to the token variable and the file that defines it. Quote a value only where it helps reading, and never one that disagrees with the token CSS.
- **Named rules.** A short, citable doctrine ("The One Voice Rule. `--color-accent` fills only the primary button (`tokens.css`, `button.css`).") sticks better than a bullet list. Use one to three per section, only when the code or a confirmed user decision grounds them, and cite that token, component, file, or decision with the rule.
- **Decisive where evidence is decisive.** Use hard language for real invariants and softer language for provisional guidance.
- **Concrete tests.** A one-sentence test that the cited files pass beats a paragraph of principle.
- **Do's and Don'ts** are concrete visual guardrails from the shipped system or the user's decisions, each citing its source. Do not turn a task-specific concept, or a device the code merely does not use, into a system-wide prohibition.
- **Open decisions** list every judgment call nobody confirmed, with the evidence that leaves it open, in the document and on the canvas it concerns.

## Step 5: Draw the design-system canvases

The canvases let people check the system visually. They live in `.doan/ds/` (create it when needed). By default, draw one canvas per logical unit:

- **Token groups:** one canvas per group the token CSS defines, such as `color`, `typography`, `shadow`, `radius`, and `size`.
- **Components:** one canvas per component the code shares across screens, such as `button`, `icon-button`, `input`, `dialog`, `menu`, and `toast`. Cover every shared component, not a sample. A component, dialog, or surface that two or more screens render is shared, even if its styles appear nowhere else. Skip only parts of a single screen (rendered by one screen only) and nonvisual infrastructure wrappers that draw nothing of their own (a provider, a portal); a wrapper that adds its own classes or styles, such as a tooltip content wrapper with a project class, is a shared component. List each skip in your answer with its reason.
- **Shared surfaces:** one canvas per frame several screens share, such as `app-shell`. Draw it from the files that render it now (read them and name them in `data-doan-implements`), with the sections and controls they render today, not those an older draft or document shows.

Never put two units in one canvas: no `overlays` canvas holding a tooltip and a menu, no `tokens` canvas holding color and type. A unit's variants and states stay together in its own canvas. The file name is the canvas id (`.doan/ds/button.html` is `button`); if `doan ls` already has that id, pick another and say so.

An existing design system keeps its organization. If `.doan/ds/` already has canvases, or the project has a legacy `.doan/canvases/design-system.html`, read that as the design system, follow the reuse rule in Scope, and do not split it into the default units. Move a legacy canvas into `.doan/ds/` only when the user asks or agrees, and keep its id.

Each canvas:

- In `<head>`: `<meta name="doan:canvas" content="<id>">` and `<meta name="doan:width" content="...">` with a board width that fits the content. The canvas is named by its id; do not add a separate display name. If you set a `<title>`, use the id.
- Link the project's token CSS relative to the canvas (for `styles/tokens.css`, that is `../../styles/tokens.css`), and the component CSS the same way. If either is outside the served scope, follow the Doan guide's canvas convention 7: do not change configuration, say in your answer that the file could not be linked as-is and that serving its path needs the user's approval, and disclose any workaround.
- Give each topic or state group its own frame with a stable id and a `data-doan-title`: subgroups such as surfaces, text, and accents on a token canvas; variants and states on a component canvas.
- Every frame has `data-doan-implements` with a repository path that exists: the token CSS for token frames, the component file for component frames, and for a shared surface, the file that renders that frame.
- Colors and typography reference the token CSS variables (`background: var(--color-accent)`, `font-size: var(--type-body-size)`) instead of copied values. Label each swatch and type sample with its variable name and role. Direct hex or rgb values make `doan check` warn when token CSS is configured.
- Components: use the component's own markup and class names so its real CSS draws it; do not restyle it with copied values. Show the states the code has (default, hover, focus, active, disabled, error, loading, open) side by side. For a state the CSS applies only under `:hover` or `:focus-visible`, restate those rules with the same tokens for a labeled sample.
- Anything drawn that is not in code (an approximation of a component that cannot render outside its framework, a proposed token, an open decision) is stated on the canvas next to it, as the Doan guide requires.
- A canvas states only what is specific to it: what it draws that is not in code as shown, and its own open items. A note that applies to every canvas goes once in the rules document, not on each canvas.
- Use the fonts the code loads. Put canvas-only assets in `.doan/assets/` and link them relatively. Do not copy token CSS or component CSS into assets unless you disclose it as a workaround.

When updating existing design-system canvases, change only the canvases and frames that drifted from the code or that the request names; keep other canvases, frames, and element ids unchanged; add a new shared component as a new canvas. Check the open comments attached to a frame before substantially changing it.

## Keep the two in agreement

The rules document and the canvases describe the same system. They use the same token names and component list, the document holds every open item a canvas shows, and both agree with the code. The document names the canvas that shows each token group and component. When one changes in a way the other shows, update the other within the same request, or report the mismatch.

## Finish in Doan

- After editing the canvases, make `doan check` pass. Resolve only the comments you actually applied.
- Report the paths you wrote, or "No changes" with the files you checked.
- Give a short system summary: palette, type ramp, and named rules.
- Name the defects and drift you did not record as rules or did not repair, and why.
- List open decisions, anything you inferred, and any workaround such as CSS that could not be linked.

## Verify

- Every token and rule in the document traces to a file in the code or a decision the user confirmed; every named rule, do, and don't cites it.
- Judgment calls nobody confirmed are open items in both artifacts, and no rule presupposes an answer to one.
- Reread each rule, do, and don't in both artifacts: it cites its source and covers no more than that source shows. Search both for "every", "all", "any", "always", "only", "new", "future", "adding", and "until"; narrow each hit that reaches past its source to the cited tokens, components, or files, or move it to open decisions.
- Each design-system canvas you created holds one unit, every visual shared component in the code is on a canvas, and each skip is a nonvisual wrapper or rendered by one screen only, listed with its reason.
- Each shared surface shows the sections and controls the files that render it show today.
- Every frame's `data-doan-implements` path exists in the repository.
- Every color and type sample uses a token CSS variable, and each canvas links the token CSS relative to its own location.
- Components and states shown on the canvases exist in code, or the canvas says they do not.
- Frames, element ids, and sections outside the request are unchanged.
- The document and the canvases list the same tokens and components, and the document holds every open item a canvas shows. No canvas repeats a note that applies to every canvas.
- `doan check` passes.

Report anything you could not check, such as whether each canvas renders in the Doan app without broken links, missing fonts, or overlapping content, computed styles of rendered output, or contrast ratios you could not measure, as unverified.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/document.md` and `skill/agents/impeccable-documenter.md` (the shipped-evidence principle and the rule against recording defects as house style), under the Apache License 2.0. Doan modified them: replaced the fixed root `DESIGN.md` with an existing design document or a user-chosen location; removed the YAML token frontmatter, the JSON sidecar, the live panel, the linter, seed mode's workshop hand-off, the subagent contract, and template placeholders; replaced the panel's component snippets with design-system canvases in `.doan/ds/`, one per token group, component, or shared surface, that reference token CSS variables and real component CSS; and added scope, review-only, reuse, agreement, and verification rules for Doan, and a rule to read the `context` preset before writing unless product context already exists (upstream requires product context first only in seed mode). Doan also replaced the documenter's fixed list of quality-floor violations with a rule that a defect needs a confirmed problem, and records aesthetic choices the code uses consistently or the user chose as rules. Doan added rules that every named rule, do, and don't cites its token, component, file, or user decision; that a device the code does not use is not a prohibition; that policies for future screens nobody confirmed stay open items, even when the user asks to mark decisions open instead of waiting; and an `Open Decisions` section in the rules document. Doan replaced the upstream named-rule example, a limit for any screen, with one that cites its scope, and added rules that a rule is only as wide as its evidence, that instructions for new work stay open unless the user or a project document states them, and a scope self-check in Verify.

[doan:design-skill] end of preset document
