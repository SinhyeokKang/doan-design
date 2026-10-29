# Improve the typography

Typography carries information, hierarchy, and voice. Improve fonts, typographic hierarchy, and readability inside the established visual world; do not replace the identity unless the user asked to.

Use this preset when the user asks to fix type sizes, weights, families, line height, measure, hierarchy, or readability on a canvas or in code. The user's request and its scope come first: this guidance never widens what you change.

## Before you start

- Find the target. For pointing words like "this screen" or "this heading", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, or code the user named.
- Read the design system: token CSS (`doan config --json` shows `tokenCss`), especially font family, size, weight, and line height variables; existing text components; any design rules document; and the `design-system` canvas (`.doan/canvases/design-system.html`) if one exists. Confirmed families and weights are authoritative; improve how they are used.
- Read the code the canvas implements (`data-doan-implements`) and the fonts it actually loads.
- If the product's users and reading situation are unknown and that would change the result, suggest the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`). Ask only what would change the result.
- If the change would replace the typography so far that it creates a new identity, confirm that with the user before going further.

## Match the surface

- **Marketing, campaign, and showcase surfaces:** display type may carry the voice. Use decisive contrast and responsive scale when the composition benefits.
- **App and document surfaces** (tools, dashboards, settings, editors, docs, guides): stability, scanability, and measure come first.

On app and document surfaces:

- One family is often right. A well-tuned sans can carry headings, buttons, labels, body, and data; product UI does not need a display and body pairing.
- Use a fixed rem scale, not fluid type. People view product UI at a consistent density, and a clamp-sized heading that shrinks in a sidebar looks worse, not better.
- Keep the scale ratio tight: 1.125 to 1.2 between steps is typical. Product UI has more type roles than a brand page, and exaggerated contrast becomes noise.
- Prose still needs a measure of 65 to 75 characters. Data and compact UI can run denser; tables at 120 characters or more are fine.
- Do not use display faces for UI labels, buttons, or data.
- System fonts and familiar sans defaults are legitimate choices here.
- On document surfaces, prose measure and paragraph rhythm matter more than component density.

## Assess the typography

Inspect representative pages and styles. Answer each question with a file, selector, token, or computed value:

- **Authority and fit:** which faces, weights, and roles are established? Do they fit the product, or are they unexamined defaults? Is every family necessary?
- **Hierarchy:** can heading, body, label, metadata, and data roles be told apart at a glance? Are adjacent sizes or weights too close to carry different jobs?
- **Scale and consistency:** is there a deliberate role scale, or a collection of arbitrary values? Do repeated roles stay identical across screens and states?
- **Reading:** does body copy stay within a comfortable 45 to 75 character measure? Are line height, paragraph rhythm, contrast, and tracking tuned to the actual face, width, language, and surface?
- **Stress:** what happens with long headings, localization expansion, zoom, narrow containers, missing weights, and font fallback?
- **Delivery:** are only used font files and weights loaded? Do fallback metrics, loading strategy, and variable-font settings avoid invisible text and disruptive reflow?

Then scan the source separately for font sizes, families, weights, and line heights written as raw values instead of token CSS variables, and for dynamic values that are hard to read statically. Keep this scan out of the first assessment so it does not anchor it, and combine both before editing. A clean scan is a floor, not proof of good typography.

## Set the system

Before editing, state:

- the roles the interface needs;
- the intended contrast between those roles;
- the reading measure and density;
- which existing faces and weights are authoritative;
- any performance, localization, or accessibility constraints.

Use the fewest roles and families that make the hierarchy unmistakable. Combine size, weight, space, and tone deliberately instead of asking size alone to do all the work. Role names and tokens describe purpose, not values.

## Apply

- Take sizes, families, weights, and line heights from the project's token CSS variables. If a role needs a value the tokens do not have, propose a new type token instead of hard-coding it; adding it to the project's token CSS is the user's decision.
- Keep body copy readable and zoomable. Use 1rem (16px) as the ordinary web body floor unless a dense role, platform convention, or user setting justifies otherwise.
- Keep prose in the 45 to 75 character range. Tune line height inversely with measure: wider lines generally need more leading.
- Compensate light text on dark surfaces on three axes: slightly more line height, a touch more tracking, and one step more weight when the face needs it.
- Tune line height to the face, width, language, and contrast, not a universal ratio.
- Keep repeated roles consistent across screens and states.
- Use tabular numbers, code, and label features when the content benefits.
- Load only used font files and weights. Provide metric-compatible fallbacks and avoid blocking text.
- Let marketing display type respond to available space when useful; keep dense product and reading surfaces spatially predictable.
- Preserve browser zoom, user font settings, and platform text scaling.
- Use paragraph spacing or first-line indentation as the paragraph rhythm, not both; combining them double-marks the boundary.

Do not make type decorative at the expense of comprehension, and do not introduce a second family without a clear role only it can perform.

## Line breaks

After Matthew Butterick's *Practical Typography*, paraphrased; where his numbers differ from these, these stand.

- Set `text-wrap: balance` on headings and short centered blocks, and `text-wrap: pretty` on body copy. Both are progressive: a browser that ignores them keeps its default wrap.
- `pretty` pulls a word down beside a lone last word. It does not fill the last line, and a two-word tail is fine.
- In a column too narrow for either to help, edit the copy or widen the column.
- Break a heading by hand only between phrases, and check the break at every width the heading renders at. A hard break that lands mid-line on a phone is worse than the default wrap.
- An uneven break can carry meaning: a headline that lands on one word for weight, a poster line, a pull quote. Make it deliberate with a hard break or a wrap setting on that element, keep it rare, and say which breaks are intended.

## Apply the change in Doan

- Change only the typography in the requested scope. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- When the canvas uses a type token, family, or text style that is not in code yet, including a proposed token, say so on the canvas, as the Doan guide requires for anything drawn that is not in code.
- If the user asked for a review only, report the assessment, the proposed role system, and the changes without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed, any type tokens you proposed rather than added, and what you left unchanged on purpose.

## Verify

- Primary, secondary, body, and metadata roles are recognizable without reading the copy.
- Long text stays comfortable across the widths and languages the request covers.
- The typography belongs to the product and its established world.
- Sizes and families come from token CSS variables, or are listed as proposed tokens.
- Loading does not create disruptive reflow or invisible text.
- Zoom, text scaling, focus, contrast, and narrow widths stay usable.

Answer each item with rendered or source evidence; a bare "yes" is not verification. Report anything you could not render or measure, such as font loading, fallback reflow, a width, a language, or 200% zoom, as unverified.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/typeset.md` and `skill/reference/operate.md` (typography, product constraints, and product permissions), under the Apache License 2.0. Doan modified them: replaced visitor modes with surface types and removed native platform references; replaced the subagent assessment and the bundled detector scan with a source scan the agent runs itself, and dropped the detector findings from the line-break rules; removed the live-mode parameters, the identity-replacement routing and design file update, and the closing hand-off to the upstream `polish` command; and added target selection, type tokens from token CSS, review-only, canvas, and verification rules for Doan.

[doan:design-skill] end of preset typeset
