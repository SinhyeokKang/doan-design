# Adapt to other contexts

Adapt an existing design to another screen size, device, input method, or usage context. The trap is treating adaptation as scaling. The job is rethinking the experience for the new context: restructure, do not stretch.

Use this preset when the user asks for mobile, tablet, desktop, print, or email versions of a screen, or for a design that works with touch, keyboard, or one hand. The user's request and its scope come first: adapt only to the sizes and contexts the user named, and only the target they named.

## Before you start

- Find the target. For pointing words like "this screen", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, or code the user named.
- Confirm the target contexts: which widths, devices, orientations, input methods, and situations (on the go or at a desk, quick glance or focused reading). Ask when the request does not say and it would change the result; do not adapt to every size by default.
- Read the design system: token CSS (`doan config --json` shows `tokenCss`), existing components and their responsive variants, a design rules document if the project has one, and the `design-system` canvas (`.doan/canvases/design-system.html`) if it exists. Reuse existing breakpoints and navigation patterns before inventing new ones.
- Read the code the frame implements (`data-doan-implements`): existing breakpoints, container queries, and responsive components show what the product already does.
- When product or platform context is missing and it would change the result, suggest the `context` preset (`doan design-skill context --json`, or the MCP `design_skill` tool with `{"id": "context"}`).

This preset covers the web, mobile web included. Doan canvases are HTML drawings. It does not carry iOS or Android platform rules; if the product ships as a native app, adapt the structure with the principles below and report platform conformance as unchecked.

## Assess the challenge

1. **Source context**: what the design was made for and what it assumes (a large screen, a mouse, hover, a fast connection), and what works well there.
2. **Target context**: device, input (touch, mouse, keyboard), screen size and orientation, connection, usage situation, and what users expect on that device.
3. **What breaks**: what will not fit (content, navigation, features), what will not work (hover-only actions, tiny targets), and what feels wrong (desktop patterns on a phone, phone patterns on a desktop).

## Strategies by target

### Desktop to mobile

- **Layout**: one column, vertical stacking, full-width components instead of fixed widths.
- **Interaction**: touch targets at least 44x44px with spacing between them; nothing depends on hover; controls within thumb reach; bottom sheets where desktop used dropdowns.
- **Content**: progressive disclosure, primary content first, secondary content in tabs or accordions; body text at least 16px.
- **Navigation**: fewer levels; a drawer or bottom navigation; sticky context headers where they help; an explicit back path.

### Tablet

- Two columns rather than one or three; master-detail (list and detail side by side); side panels for secondary content.
- Support touch and pointer together; keep 44x44px targets but allow denser layouts than a phone.
- Restructure for portrait and landscape instead of letterboxing either one.

### Mobile to desktop

- Use the width: multiple columns, persistent side navigation, several panels at once, but cap content width rather than stretching to 4K.
- Add hover for extra information, keyboard shortcuts, context menus, drag and drop, and multi-select where they help; never make them the only path.
- Show more up front: wider tables, richer detail, less disclosure.

### Print

Break pages at logical points, drop navigation and interactive elements, work in black and white or limited color, expand shortened content (full URLs, hidden sections), and add page numbers, title, and date.

### Email

At most 600px wide, one column, large obvious buttons instead of text links, no hover, and deep links into the product for anything complex. Email clients need inline styles and table layouts; say so if the drawing does not use them.

## Principles that carry across

- **Restructure, do not stretch.** A scaled-up phone layout on a tablet, or a squeezed desktop layout on a phone, is the failure mode.
- **Translate idioms, do not transplant them.** Rebuild navigation and controls in the vocabulary of the target context and carry over the brand's expressive layer (color intent, type accent, motion personality) through the design system.
- **Keep one information architecture.** Different structures per device confuse people moving between them.
- **Never hide core functionality on a smaller screen.** If it matters, make it work there.
- **A size is not a device.** A phone-width window can appear on a tablet or desktop, and many laptops have touch. Design for the width and the input, not the device name.
- **Orientation restructures.** Do not lock orientation to avoid a layout problem.

## Responsive mechanics

- Write mobile-first: base styles for narrow screens, then `min-width` queries that add complexity.
- Let content decide breakpoints: widen until the design breaks and add one there. Common starting points are 640, 768, and 1024px; three usually suffice. Use `clamp()` for values that can flow between them.
- Detect input, not screen size: `(pointer: coarse)` for larger targets, `(hover: hover)` for hover-only enhancements. Hover never carries functionality.
- Respect safe areas with `env(safe-area-inset-*)` and `viewport-fit=cover`, for example `padding-bottom: max(1rem, env(safe-area-inset-bottom))`.
- Responsive images: `srcset` with width descriptors and `sizes` for resolution, and `picture` for a different crop. Hiding with `display: none` still downloads the content.
- Common transformations: navigation goes from drawer to compact bar to full labels; tables become cards on narrow screens; collapsible detail uses `details` and `summary`.

## Draw it in Doan

A canvas is one HTML document with one viewport, so viewport media queries respond to the canvas, not to each frame. To show several sizes side by side:

- Draw each target size as its own frame at that width, next to the original, with a stable id derived from the original (for example `checkout-375` and `checkout-768` for `checkout`) and a `data-doan-title` that names the size or context.
- Or, when the markup should respond to its own width, build the frame with container queries so the same component adapts inside each frame.
- If the new frames need more room, raise the canvas `doan:width`; do not move or resize frames outside the request to make space.
- Reuse the original's components. Element ids are unique within a canvas, so give the copies in a new frame their own `data-doan-id`, derived from the original (for example `checkout-375-pay` for `pay`).

## Apply the change in Doan

- Change only the requested target and contexts. Keep canvas, frame, and element ids unchanged, and leave the original frame and everything outside the request as they are unless the user asked to change them.
- Reference token CSS variables for color and spacing; do not copy raw hex or rgb values.
- When a layout, breakpoint, or component you draw is not in code yet, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report what breaks in each target context and the proposed changes without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list the contexts you adapted, what changed structurally in each, and what you left unchanged on purpose.

## Verify

Check each adapted frame:

- content, navigation, and core functions are all present at each width, with nothing clipped or horizontally scrolling by accident;
- touch targets are at least 44x44px with spacing, and nothing depends on hover;
- the edges hold: 320px wide, very wide screens, and both orientations where they apply;
- long labels and translations still fit.

A drawn frame verifies layout only. Real devices, other browsers and engines, operating systems, throttled networks, real touch, and custom gestures such as sliders and drag surfaces need tools the agent may not have. Say what produced your evidence (a resized frame, an emulated viewport, which engine), and report everything else, including platform conformance for native apps, as unverified.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/adapt.md` and `skill/reference/adapt.native.md` (principles only: restructure, do not stretch; translate idioms, do not transplant; size is not a device; orientation), under the Apache License 2.0. Doan modified them: replaced the additional-context note with a "Before you start" section, dropped the native platform routing, iOS and Android idiom table, size-class and simulator procedures, and the device-lab and throttled-network steps (now reported as unverified), condensed the responsive code samples, removed the closing hand-off to the upstream `polish` command and its template placeholder, and added target selection, frames per width, review-only, canvas, and verification rules for Doan.

[doan:design-skill] end of preset adapt
