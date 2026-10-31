# Add moments of delight

Make the experience memorable at the moments that earn it. Delight is not a layer of generic whimsy; it is product character revealed through a useful interaction, a humane response, or an unexpectedly considered detail. It never gets in the way of what the person came to do.

Use this preset when the user asks to add personality, charm, warmth, celebration, or a memorable touch to a screen, flow, or component. The user's request and its scope come first: this guidance never widens what you change, and one requested moment does not become a personality pass over the whole product.

## Before you start

- Find the target. For pointing words like "this screen" or "this state", use `doan active` and read the open comments attached to that target. Otherwise work on the canvas, frame, element, or code the user named.
- Read the design system: token CSS variables (`doan config --json` shows `tokenCss`), existing components, illustrations and icon sets, a design rules document, and the design-system canvases in `.doan/ds/` (or a legacy `.doan/canvases/design-system.html`) if present.
- Read the product voice in existing copy and documents, and the code the frame implements (`data-doan-implements`).
- Judge how often the moment repeats and what is at stake for the person there.
- The brand's emotional range decides how far delight may go. Infer it from the evidence; ask only when it cannot be inferred and would change the result. When the product's purpose, audience, or voice is unknown, suggest the `context` preset (`doan design-skill context --json`).

## Find the opportunity

Match the surface first. On marketing and expressive surfaces, personality may run through voice, composition, motion, and discovery, as long as the content stays the focus. On working surfaces (apps, tools, dashboards), concentrate delight at meaningful moments such as first use, completion, or mastery; reliability carries everything else.

Look for:

- effort worth acknowledging;
- waiting that can become informative;
- an empty or first-use state that can orient;
- an interaction whose physical or verbal response could express the brand;
- a useful capability people might enjoy discovering.

Do not manufacture a celebration for an ordinary click.

## Keep serious moments serious

Errors, payments, deletion, privacy and permissions, account or access loss, and blocked work are not places for delight. Do not add jokes, playful illustration, celebration, or decorative motion there. What these moments get instead is clarity and calm: the problem, its consequence, and the recovery first, in plain and respectful words. Warmth in wording is welcome when it reduces stress; anything that trivializes loss, money, privacy, or blocked work is not.

If the user asks for playful treatment in one of these moments, say why it is risky and propose the calm alternative before changing anything.

## Define one delight thesis

State in one sentence what the person should feel and why that feeling belongs to this product. Then choose the smallest system that can deliver it:

- a distinctive response to a meaningful action;
- product-specific language that clarifies while carrying voice;
- an interaction or transition with a recognizable material behavior;
- an illustration, sound, haptic, or environmental detail grounded in the product's world;
- a discovery reward that reveals real utility.

Derive the treatment from the product's mechanism and visual world, not from a stock catalog of confetti, mascots, and bouncing icons. One extraordinary moment beats several: competing flourishes create noise, not impact. Context decides what extraordinary means; on a working surface it is often how something feels, such as an instant, certain response, rather than spectacle.

### Propose directions for ambitious ideas

When the request leaves the direction open and the idea goes beyond a small touch (a signature celebration, an animated illustration, an easter egg, sound), describe two or three directions first. For each, say what it would look and feel like and its cost (effort, assets, performance, accessibility), and get the user's pick before building. When the user already specified the moment, build what they asked.

Delight enhances how existing features feel; it does not add capabilities or claims the product does not have. Never use it to mask weak layout, hierarchy, or copy; fix those first.

## Build for the emotional moment

- **Success:** match the response to the effort and consequence. Major milestones can expand; routine saves should simply feel certain.
- **Waiting:** show truthful progress, useful context, or product-specific activity. Never fake work or delay completion to stage a flourish.
- **Empty and first use:** make the next action clear before adding personality.
- **Repeated interaction:** keep the response satisfying after the hundredth use. Variation is useful only when it stays coherent and predictable enough to trust.
- **Discovery:** reward curiosity without hiding required functionality.

Copy uses the product's own language. Generic whimsy is worse than neutral clarity.

## Protect the experience

Delight must not:

- delay, block, or obscure the primary task;
- override platform conventions or accessibility;
- add unrequested factual claims, testimonials, or numbers;
- play sound without consent, or ignore mute settings;
- become mandatory, unskippable, or exhausting on repeat;
- add a dependency or asset cost out of proportion to the moment.

Every enhancement degrades gracefully: without the flourish, or on a device that cannot run it, the experience is still complete and good. Respect screen readers, keyboard use, touch, reduced-motion preferences, localization, and cultural context. Nonessential loops stop when hidden. Celebration intensity is proportional to frequency and consequence.

When the delight is mainly authored motion (timing, easing, reduced-motion behavior, performance), read the `animate` preset (`doan design-skill animate --json`).

## Apply the change in Doan

- Change only the moments in the requested scope. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- Use token CSS variables and existing components and assets; do not copy raw hex or rgb values. Put new canvas-only assets in `.doan/assets/`.
- A canvas is a still board. Draw the moment's states side by side or implement it in canvas CSS with a visible trigger, and annotate what a still drawing cannot show: trigger, duration, sound or haptic behavior, frequency limits, and the reduced-motion or muted alternative.
- When new copy, illustration, sound, or interaction drawn on a canvas is not in code yet, say so on the canvas, as the Doan guide requires for anything drawn that is not in code. Edit implementation code only when the user asked for it.
- If the user asked for a review only, report the opportunities and the proposed thesis without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed, the delight thesis, and what you left unchanged on purpose, especially serious moments you kept plain.

## Verify

Check that:

- the moment is specific enough that a neighboring product could not use it unchanged;
- it improves comprehension, confidence, motivation, or emotional recovery;
- the interface stays fast and obvious without the flourish, and removing it would be missed;
- repetition does not turn charm into friction;
- no error, payment, deletion, or privacy moment gained a joke or a celebration;
- muted, keyboard, touch, reduced-motion, and localized paths work;
- the result fits this product's voice and visual world, not a generic "delight" treatment.

Anything you could not observe, such as motion running, sound, haptics, a screen reader, or a target device, is unverified; say so instead of reporting it as passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, files `skill/reference/delight.md` and `skill/reference/overdrive.md` (propose before building, progressive enhancement, one extraordinary moment), under the Apache License 2.0. Doan modified them: replaced the additional-context note and visitor modes with a "Before you start" section and surface types; excluded errors, payments, deletion, and privacy from delight; removed the upstream design-document loader step, the link to the upstream motion reference, the closing hand-off to the upstream `polish` command, and the overdrive banner, toolkit catalog, and browser-verification loop; and added canvas presentation, target selection, review-only, token, and verification rules for Doan.

[doan:design-skill] end of preset delight
