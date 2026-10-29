# Improve the color

Use color as hierarchy, meaning, and atmosphere. Improve color roles and contrast while keeping confirmed brand colors and semantic conventions; do not replace a visual world under the guise of colorizing it.

Use this preset when the user asks to add or rebalance color, fix contrast, clarify states with color, or make a grayscale or washed-out surface easier to read. The user's request and its scope come first: this guidance never widens what you change.

## Before you start

- Find the target. For pointing words like "this screen" or "this card", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, or code the user named.
- Find the existing brand colors first. Read token CSS (`doan config --json` shows `tokenCss`), current themes, assets such as logos, any design rules document, and the `design-system` canvas (`.doan/canvases/design-system.html`) if one exists.
- Read the code the canvas implements (`data-doan-implements`) and its representative states.
- If the product's purpose and brand commitments are unknown and that would change the palette, suggest the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`). Ask only when a binding brand decision cannot be inferred.

## Match the surface

- **Marketing, campaign, and showcase surfaces:** color may carry the voice and own large regions when the established direction calls for it.
- **App and document surfaces** (tools, dashboards, settings, editors, docs, guides): color mainly encodes action, selection, status, wayfinding, and reading hierarchy. Rarity gives an accent its force.

## Audit before choosing

Identify, with the token, selector, or file as evidence:

- which colors are confirmed brand commitments;
- the current surface, text, action, and semantic roles;
- places where grayscale hides hierarchy or state;
- contrast failures and color-only communication;
- light and dark theme, or data visualization, requirements;
- whether the task asks for more color or for a new identity. A new identity is outside this preset; confirm it with the user before going further.

## Choose a strategy

Name the intended emotional temperature, dominant relationship, contrast range, and color dosage before editing. The strategy may be restrained or immersive; it follows the request and the established direction, not a fixed percentage rule.

Build roles, not a bag of swatches:

- canvas and elevated surfaces;
- primary and secondary text;
- action, focus, and selection;
- borders and separators;
- success, warning, error, and information;
- data categories or scales when needed.

Use the project's existing color space. For a new web palette, prefer OKLCH because lightness and chroma can be adjusted predictably. Choose hue from product meaning and the visual direction, never from a default category association.

## Apply at system scale

- Let the strongest color own a deliberate region or role instead of scattering tiny accents.
- Keep the primary action easy to find; do not spend its color on decoration.
- Tint neutrals only when the brand hue genuinely creates cohesion. Neutral gray is valid when it serves the world.
- On colored surfaces, derive secondary text from the foreground or surface hue rather than a washed-out generic gray.
- Keep semantic meanings consistent, but respect platform and domain conventions instead of assuming fixed hues.
- For data, use distinct lightness, chroma, shape, label, or pattern so color is not the only code.
- In dark mode, design surface elevation and contrast explicitly; do not invert the light theme mechanically.
- When the project has a token system, keep primitive values and semantic tokens separate. A theme change normally remaps semantic roles.

Decoration without a relationship to hierarchy, state, content, or the visual world is not a color strategy.

## Use tokens, propose new ones

- Reference the project's token CSS variables on canvases and in code. Do not write raw color values (hex, `rgb()`, `oklch()`, `hsl()`) on a canvas, including in `var()` fallbacks; `doan check` warns on hex and rgb colors when token CSS is configured, and other raw values bypass the tokens the same way.
- When a role needs a color the tokens do not have, propose a new token: name it by role, give its value and the pairs it must contrast with, and say which theme it belongs to. A proposal is not an edit. Do not change the project's token CSS unless the user asked for that.
- If the user wants to see a proposed color on a canvas before it exists in code, define it once as a clearly named proposed custom property, say on the canvas that it is a proposal not in code, and report the `doan check` warning it causes.

## Contrast and perception

Check foreground and background pairs against these minimums:

| Content | WCAG AA minimum |
|---|---|
| body text | 4.5:1 |
| large text | 3:1 |
| controls, icons, focus indicators | 3:1 |

Do not rely on eyesight. Check interactive states, overlays, text on images, disabled content, and both themes. Information conveyed by color also needs text, shape, iconography, or position.

Report a ratio as passing only when you computed it from the resolved color values of that pair, and say how. A ratio you estimated, could not resolve (translucent layers, images, gradients), or did not compute is unverified. Simulating color vision deficiencies needs a tool; without one, report it as unverified.

When deriving OKLCH ramps, vary lightness and reduce chroma near white and black. Do not keep high chroma at extreme lightness only to make the math uniform. Prefer explicit colors over chains of translucent overlays when alpha would make contrast depend on context.

## Apply the change in Doan

- Change only the color in the requested scope. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- When a color role or token drawn on the canvas is not in code yet, say so on the canvas, as the Doan guide requires for anything drawn that is not in code.
- If the user asked for a review only, report the audit, the proposed strategy and roles, and any proposed tokens without editing files.
- After editing a canvas, make `doan check` pass and review its warnings. Resolve only the comments you actually applied.
- In your answer, list what changed, the tokens you proposed rather than added, the contrast pairs you computed and those left unverified, and what you left unchanged on purpose.

## Verify

- Every color has a stable role or a deliberate atmospheric purpose.
- Attention lands on the intended action, content, or state.
- The palette works across quiet, dense, interactive, error, and empty states.
- Light and dark themes are each composed, not mechanically inverted.
- Contrast and non-color cues hold in every state the request covers, with each ratio either computed or marked unverified.
- Canvases reference token CSS variables, and `doan check` reports no unexplained direct colors.
- The result is recognizably this product, not a generic colorful treatment.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, file `skill/reference/colorize.md`, under the Apache License 2.0. Doan modified it: replaced the additional-context note with a "Before you start" section, replaced visitor modes with surface types, removed the identity-replacement routing, the design file loader step, the closing hand-off to the upstream `polish` command, and the live-mode parameter section; and added token CSS use, token proposals, rules for unverified contrast, and target selection, review-only, canvas, and verification rules for Doan.

[doan:design-skill] end of preset colorize
