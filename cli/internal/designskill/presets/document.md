# Document the design system

Record the design system a project already ships, so agents generating new screens stay consistent with it and people can check it at a glance. The preset produces two artifacts: a rules document that agents read, and a `design-system` canvas where people check colors, typography, and components.

Use it when the project has real tokens or components but no rules document or `design-system` canvas, when the existing ones have drifted from the code, or before a large redesign to capture the current state. The user's request and its scope come first: this guidance never widens what you change.

## Scope

- Reuse an existing design system when it is sufficient. Do not regenerate a rules document or canvas that already describes the shipped system; report that it matches and what you checked.
- A plain request to set up Doan (`doan init`, `doan config`) is not approval to write a design system. Write the documents only when the user asked for them or agreed to them.
- If the user asked for a review only, report drift, gaps, and proposed changes without editing files.
- When updating an existing rules document or canvas, change only what the request covers. Keep sections, frames, and ids outside the request unchanged.

## Before you start

- Find the target. For pointing words like "this canvas" or "this frame", use `doan active` and read the open comments attached to that target (`doan comments --canvas <id>`).
- Read the configured token CSS (`doan config --json` shows `tokenCss`), the component code, and the global stylesheet.
- Look for an existing design document (for example `DESIGN.md`, a style guide, or a design section in the docs) and for `.doan/canvases/design-system.html`. `doan ls --json` lists canvases and their open comments.
- When product context is missing and it would change the result (who the product is for, brand commitments), read the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`). Ask only what would change the documents.

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
```

Writing style:

- **Descriptive before technical.** "Gently curved edges (`--radius-md`, 8px)" reads better than a class name. Do not paste raw CSS class names.
- **Functional over decorative.** For each token, say where and why it is used, not only what it is.
- **Name the token.** Refer to the token variable and the file that defines it. Quote a value only where it helps reading, and never one that disagrees with the token CSS.
- **Named rules.** A short, citable doctrine ("The One Voice Rule. The accent covers at most 10% of any screen.") sticks better than a bullet list. Use one to three per section, only when the code or a confirmed user decision grounds them.
- **Decisive where evidence is decisive.** Use hard language for real invariants and softer language for provisional guidance.
- **Concrete tests.** A one-sentence test grounded in the observed system beats a paragraph of principle.
- **Do's and Don'ts** are concrete visual guardrails from the shipped system or the user's decisions. Do not turn a task-specific concept into a system-wide prohibition.

## Step 5: Draw the design-system canvas

The canvas lets people check the system visually. It lives at `.doan/canvases/design-system.html`:

- In `<head>`: `<meta name="doan:canvas" content="design-system">` and `<meta name="doan:width" content="...">` with a board width that fits the content. The canvas is named by its id; do not add a separate display name such as "Design System". If you set a `<title>`, use `design-system`.
- Link the project's token CSS relative to the canvas (for `styles/tokens.css`, that is `../../styles/tokens.css`). If the token CSS or component CSS cannot be linked because it is outside the served scope, follow the Doan guide's canvas convention 7: do not change configuration, say in your answer that the file could not be linked as-is and that serving its path needs the user's approval, and disclose any workaround.
- Give each topic its own frame with a stable id, such as `colors`, `typography`, `spacing`, `shapes`, `elevation`, and one frame per component (`button`, `input`, `card`). Add `data-doan-title` for readable names.
- Point frames at the real files with `data-doan-implements`: the token CSS for token frames, the component file for component frames.
- Colors and typography reference the token CSS variables (`background: var(--color-accent)`, `font-size: var(--type-body-size)`) instead of copied values. Label each swatch and type sample with its variable name and role. Direct hex or rgb values make `doan check` warn when token CSS is configured.
- Components: reuse the project's real component CSS at its served path where possible, and show the states the code has (default, hover, focus, disabled, error) side by side. Aim for a tight set of five to ten components that best represent the system: canonical primitives (each button variant, input, navigation, chip, card) and distinctive signature components. Skip utility and wrapper components.
- Anything drawn that is not in code (an approximation of a component that cannot render outside its framework, a proposed token, an open decision) is stated on the canvas next to it, as the Doan guide requires.
- Put canvas-only assets in `.doan/assets/` and link them relatively. Do not copy token CSS or component CSS into assets unless you disclose it as a workaround.

When updating an existing `design-system` canvas, keep frames and element ids outside the request unchanged, and check the open comments attached to a frame before substantially changing it.

## Keep the two in agreement

The rules document and the canvas describe the same system. They use the same token names, the same component list, and the same open items, and both agree with the code. When one changes in a way the other shows, update the other within the same request, or report the mismatch.

## Finish in Doan

- After editing the canvas, make `doan check` pass. Resolve only the comments you actually applied.
- Report the paths you wrote, or "No changes" with the files you checked.
- Give a short system summary: palette, type ramp, and named rules.
- Name the defects and drift you did not record as rules or did not repair, and why.
- List open decisions, anything you inferred, and any workaround such as CSS that could not be linked.

## Verify

- Every token and rule in the document traces to a file in the code or a decision the user confirmed.
- Every color and type sample on the canvas uses a token CSS variable, and the canvas links the token CSS relative to its own location.
- Components and states shown on the canvas exist in code, or the canvas says they do not.
- Frames, element ids, and sections outside the request are unchanged.
- The document and the canvas list the same tokens, components, and open items.
- `doan check` passes.

Report anything you could not check, such as how the canvas renders in the Doan app, computed styles of rendered output, or contrast ratios you could not measure, as unverified.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/document.md` and `skill/agents/impeccable-documenter.md` (the shipped-evidence principle and the rule against recording defects as house style), under the Apache License 2.0. Doan modified them: replaced the fixed root `DESIGN.md` with an existing design document or a user-chosen location; removed the YAML token frontmatter, the JSON sidecar, the live panel, the linter, seed mode's workshop hand-off, the subagent contract, and template placeholders; replaced the panel's component snippets with a `design-system` canvas that references token CSS variables and real component CSS; and added scope, review-only, reuse, agreement, and verification rules for Doan. Doan also replaced the documenter's fixed list of quality-floor violations with a rule that a defect needs a confirmed problem, and records aesthetic choices the code uses consistently or the user chose as rules.

[doan:design-skill] end of preset document
