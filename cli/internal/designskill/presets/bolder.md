# Make it bolder

Raise the visual emphasis of the requested target to the conviction the rest of the design already implies, without rebuilding anything the user did not name. "Bolder" is an amplification request, and almost always it is scoped to something that already exists: the surrounding page, its system, and its conventions are the given. The reflex answer, reaching for more effects, is the opposite of bold; reject it first.

Use this preset when the user asks to make a section, frame, component, or element bolder, stronger, more confident, or more prominent. The user's request and its scope come first: this guidance never widens what you change. If the user is choosing a new direction for a surface rather than amplifying an existing one, that is new work: read the `shape` or `generate` preset (`doan design-skill <id> --json`) as the request needs.

## Before you start

- Find the target. For pointing words like "this section" or "this button", use `doan active` and read the open comments attached to that target (`doan comments --canvas <id>`). Otherwise work on the canvas, frame, or element the user named. If the target or what must stay untouched is unclear, ask.
- Read the design system: the token CSS (`doan config --json` shows `tokenCss`), existing components, any design rules document, and a `design-system` canvas (`.doan/canvases/design-system.html`) if present.
- Read the code the canvas implements (`data-doan-implements`) so the bolder version keeps its behavior.
- When product context is missing and it would change the result, suggest the `context` preset (`doan design-skill context --json`).

## Scope is sovereign

"Everything else stays" is a literal instruction. Touch only the named target. Do not restyle its neighbors, do not migrate the page to a new idea, and do not add colors, fonts, radii, shadows, or system primitives the surface does not already own. If the existing system genuinely cannot express the direction, do not expand it on your own: ask the user, naming the exact addition and the job it would do.

## Find why it reads flat

A section usually reads flat for reasons its neighbors have already solved. Compare what the rest of the surface does that the target does not: the display type at full strength, the structural devices that carry meaning, the signature motif, the density and pacing. A flat section typically opts out of the system's own strongest moves. The most reliable bolder pass brings the target up to the expressive level its neighbors already reach, in the system's own vocabulary rather than a new one.

## Amplify

- **Amplify what the system already owns.** Reuse its motif and type scale at full strength, turned up for this target rather than invented for it. The bolder version should look more like the same brand, not less.
- **Keep content true.** Existing claims are part of the scope: preserve them unless the user supplies replacements. If real evidence is essential to the direction but absent, ask for it instead of inventing it.
- **Commit, then clarify.** Half-measures read as noise. Make one decisive move completely, then quiet what sits around it inside the target so the move is legible. If every element got louder, the section got flatter.
- **Give it its own rhythm.** The target should read as a peak, a shift in density or pace from what surrounds it, not simply more of the same.

Moves that usually work within an existing system: a larger step on the existing type scale or a heavier existing weight for the one element that should lead; the accent token carrying a larger area of the target instead of scattered spots; more contrast between the leading element and its supporting content; a structural change inside the target, such as one dominant element instead of several equal ones. Moves that usually fail: extra shadows, glows, gradients, or animation added to look energetic.

## The skeleton test

Strip the copy out of the planned target and study the bare structure. Does the skeleton still say what this section is and why it matters, through hierarchy and the system's devices alone? If it only works once the words return, the boldness is in the text size, not the design. A placeholder for an image or artifact names a job, an anchor, and a piece of evidence; it is not a cue to drop in a decorative photo. Fill that job with whatever the subject actually has.

## Apply the change in Doan

- Change only the named target. Keep canvas, frame, and element ids unchanged, and leave frames and elements outside the request as they are.
- Reference token CSS variables; do not copy raw hex or rgb values or introduce new ones.
- When something you draw on the canvas, such as a new structural device or a new asset, is not in code yet, say so on the canvas, as the Doan guide requires.
- If the user asked for a review only, report why the target reads flat and the proposed moves without editing files.
- After editing a canvas, make `doan check` pass. Resolve only the comments you actually applied.
- In your answer, list what changed and what you left unchanged on purpose, including any system addition you proposed instead of making.

## Verify

Before you finish, check that:

- everything outside the named target is unchanged;
- no new color, font, or system primitive appeared without being asked for;
- the conventions the target carried, including anything that drives an action, still work the same way;
- text and controls still meet contrast (at least 4.5:1 for body text, 3:1 for large text) and the leading element still fits at narrow widths;
- the target is unmistakably the same brand, only more sure of itself, and holds its own without pulling the page apart.

Report anything you could not check, such as contrast you could not measure or a width you could not render, as unverified rather than passed.

---

Source: adapted by Doan from pbakaus/impeccable at commit d34c87e1a00989ae8dbdd7f6b30b70f23319e860, file `skill/reference/bolder.md`, under the Apache License 2.0. Doan modified it: replaced the additional-context note and the direction-round paragraph with a "Before you start" section and pointers to the `shape` and `generate` presets, replaced the ask placeholder with a plain instruction to ask, added a short list of moves that usually work or fail and a contrast check, removed the closing hand-off to the upstream `polish` command and its template placeholder, and added target selection, review-only, canvas, and verification rules for Doan.

[doan:design-skill] end of preset bolder
