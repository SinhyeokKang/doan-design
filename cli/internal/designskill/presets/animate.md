# Add purposeful motion

Use motion to explain state, relationship, and feedback, or to give a surface one authored moment it has earned. Decoration without purpose is animation debt.

Use this preset when the user asks for transitions, micro-interactions, entrances, feedback, or a motion language for a screen or component. The user's request and its scope come first: this guidance never widens what you animate, and it does not turn a request for one transition into a motion pass over the whole canvas.

## Before you start

- Find the target. For pointing words like "this screen" or "this button", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, element, or code the user named.
- Read the design system: token CSS variables (`doan config --json` shows `tokenCss`), especially any duration, easing, or motion tokens; existing components and their states; a design rules document; and the design-system canvases in `.doan/ds/` (or a legacy `.doan/canvases/design-system.html`) if present.
- Read the code the frame implements (`data-doan-implements`) for its existing motion language: transitions, keyframes, a motion library, reduced-motion handling. Extend that language instead of starting a second one.
- Infer the performance budget and target devices from the product and code. Ask only when a material constraint cannot be inferred and would change the result. When the product's purpose or audience is unknown and that would change the motion, suggest the `context` preset (`doan design-skill context --json`).

## Find the job

Match the surface first. On marketing and expressive surfaces, motion may carry the voice; prefer one rehearsed focal sequence to repeated section reveals. On working surfaces (apps, tools, dashboards, documents), motion serves feedback, state, and continuity; keep routine transitions fast and never make people wait through load choreography.

Find only the places where motion would:

- acknowledge an action;
- make a state change or spatial relationship legible;
- preserve continuity through navigation or layout change;
- direct attention at a meaningful moment;
- embody the product's visual world.

Do not animate a static area merely because it exists.

## Set the motion thesis

Write a short plan before drawing or implementing:

- **Focal moment:** the one sequence or interaction that deserves authorship, if any.
- **Continuity:** the state, layout, or navigation changes that need explanation.
- **Feedback:** the controls and outcomes that need acknowledgment.
- **Budget:** which effects may be expensive and how often they run.

The focal moment must come from this product and this surface. A generic fade-and-rise, hover lift, parallax layer, or scroll reveal is not a thesis. One extraordinary moment beats many: layering competing focal moments creates noise, not impact. Context decides what extraordinary means; a particle field on a portfolio can be right, the same field on a settings page is embarrassing, while instant optimistic saves with clear state transitions can be the extraordinary thing there.

### Propose directions for ambitious motion

When the request leaves the direction open and the motion goes beyond routine feedback (a signature transition, a cinematic entrance, a morphing dialog, scroll-linked storytelling), do not jump straight to building. Describe two or three directions that differ in technique or ambition, each with what it would look and feel like and its trade-offs (support, performance cost, complexity), and get the user's pick first. When the user already specified the motion, or it is routine feedback, build what they asked.

Motion enhances how existing features feel. It does not change what the product does; new capabilities are product decisions, not motion work. Never use motion to mask weak layout, hierarchy, or copy.

## Choose material by meaning

Transform and opacity are reliable foundations, not the entire palette. Choose properties for what the transition communicates:

- **Continuity and relationship:** shared-element motion, FLIP-style transforms, view transitions, deliberate spatial movement.
- **Focus and depth:** bounded blur, filter, backdrop, light, or shadow changes.
- **Reveal and composition:** masks, clip paths, cropping, controlled occlusion.
- **Material and energy:** color, gradient position, texture, or distortion when the visual world and runtime support it.
- **State and feedback:** the smallest change that makes cause and result unmistakable.

Do not stack techniques for spectacle. One strong material idea, carried through the focal sequence and quiet supporting states, is usually enough. Stagger siblings only when a list appears as a list; cap the total delay, and do not treat every scrolled section as a staggered list by default.

## Timing and easing

Timing expresses distance and consequence:

| Duration | Typical use |
|---|---|
| 100-150 ms | immediate feedback |
| 150-300 ms | routine state change |
| 300-500 ms | layout, overlay, or view transition |
| 500-800 ms | a deliberately authored focal entrance |

Exit faster than entrance. Use natural deceleration, such as an exponential ease-out like `cubic-bezier(0.16, 1, 0.3, 1)`, for confident arrivals; do not reach for bounce or elastic curves by reflex. Long feedback feels like latency. When the token CSS defines duration or easing tokens, use those variables; when it does not, state the values you chose instead of presenting them as tokens.

## Keep it smooth

- Prefer compositor-friendly properties (`transform`, `opacity`) for movement. Avoid casually animating layout-driving properties such as `width`, `height`, `top`, `left`, and margins; use FLIP, transforms, or grid techniques instead, and never animate in a way that shifts surrounding layout.
- Bound blur, filter, backdrop, and shadow animation to small, isolated regions.
- Apply `will-change` only during a known animation, not everywhere; each layer costs memory.
- In script-driven motion, use `requestAnimationFrame`, batch DOM reads before writes to avoid layout thrashing, keep long-running JavaScript out of animation frames, and use an intersection observer rather than raw scroll handlers.
- Pause off-screen loops and rendering; initialize heavy effects only near the viewport.
- Target 60 fps (about 16 ms per frame). If an effect drops well below that on the target device, simplify it.

## Implement to the runtime

- CSS transitions and keyframes for declarative state and bounded sequences.
- The Web Animations API or the project's existing motion library for interruption, sequencing, and dynamic values.
- View transitions or shared-element techniques when continuity across states is the point.
- Scroll-driven motion only when the scroll relationship itself carries meaning, with a static fallback.
- No new dependency for an effect the existing stack can express cleanly.

Progressive enhancement is not optional. Gate newer features with `@supports` or feature detection, and make the experience without the enhancement good on its own. Keep content visible in the default state, so a failed script or an unplayed animation never hides it.

## Accessibility and control

Every animation needs a `prefers-reduced-motion` path with an intentional alternative. Reduce or remove spatial movement while keeping the opacity, color, and state changes that carry meaning; reduced motion means fewer and gentler animations, not erasing feedback that confirms an action. Respect autoplay and sound preferences; never add sound without explicit opt-in. Keyboard, touch, and pointer paths must all reach the same states.

## Quality floor

States and contrast below are checkable defects. The other items are review defaults that the established system or the user's intent can justify.

- By default, no identical entrance on every section; motion starts from an already-visible default and eases out.
- Every interactive state the motion touches still exists and reads clearly: hover, focus, disabled, loading, error, empty.
- Colors that animate meet contrast at every resting state: body text at least 4.5:1, large text at least 3:1.
- Refuse the category defaults unless the request earns them: glass and blur as decoration, a modal for a task that needs neither interruption nor protected focus, sparklines or progress rings standing in for content, zero-offset glow halos as depth.

## Apply the change in Doan

- Change only the motion in the requested scope. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- A canvas is reviewed as a still board, so make the motion readable without playing it. Choose one or both:
  - draw the key states (start, end, and any meaningful intermediate state) as elements or frames side by side, annotated with trigger, properties, duration, easing, and the reduced-motion alternative;
  - implement the motion in canvas CSS with a visible trigger (hover, focus, or a replay control), and still annotate the values.
- Use token CSS variables for colors and motion values; do not copy raw hex or rgb values.
- When motion drawn on a canvas is not in code yet, say so on the canvas, as the Doan guide requires for anything drawn that is not in code. Edit implementation code only when the user asked for it.
- If the user asked for a review only, report the findings and the proposed motion plan without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed, the motion thesis you used, and what you left unchanged on purpose.

## Verify

Check that:

- the focal motion is specific to this product and surface;
- every supporting animation explains feedback, state, or relationship, and removing it would lose meaning rather than decoration;
- interruption and repeated use behave correctly;
- desktop, mobile, keyboard, and touch paths remain usable;
- the `prefers-reduced-motion` path reduces movement without erasing meaningful feedback;
- the experience without the enhancement still works and looks intentional;
- expensive effects stay smooth on the target device.

Timing, easing, and smoothness are verified only by watching the motion run. Anything you could not observe running, and anything that needs a device, profiler, or reduced-motion setting you could not use, is unverified; say so instead of reporting it as passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/animate.md`, `skill/reference/overdrive.md` (propose before building, progressive enhancement, one extraordinary moment), `skill/reference/optimize.md` (animation and rendering performance cautions), and `skill/reference/craft-floor.md` (motion floor, states, contrast, refusals), under the Apache License 2.0. Doan modified them: replaced the additional-context note and visitor modes with a "Before you start" section and surface types, removed native platform references, the closing hand-off to the upstream `polish` command, the overdrive banner and its browser-verification loop, the toolkit catalog, production bundle, network, and API optimization, and the design-hook enforcement and rule tags; and added canvas presentation of motion, target selection, review-only, token, and verification rules for Doan. Doan also turned the floor's aesthetic items into review defaults that the established system or the user's intent can justify.

[doan:design-skill] end of preset animate
