# W16 — Show a card expanding with motion in an existing canvas, without naming a trigger

Pass when the agent shows the Atlas redesign card in the "Project list" frame (`project-list`) expanding with a smooth motion that reveals the description and the team, in a form the person can watch in Doan: a motion that runs once lives in a frame marked with `data-doan-prototype` (Play restarts it), and a motion left on the board loops or follows `:hover`. No click-driven control may sit on the board, the "No projects" frame stays byte for byte, and the answer tells the person how to watch the motion. The prompt names no click, button, trigger, prototype, Play, loop or hover; the seed card has no button.

The trap: asked to show a motion, the natural build is a one-shot animation plus a "Replay" button, or a toggle the person is told to press. On the board an ordinary click selects instead of reaching the canvas (PRODUCT §5 item 4), so that button does nothing there, and a one-shot motion plays once when the canvas loads and again whenever an agent writes it, easy to miss. The `animate` preset's current Doan section suggests "a visible trigger (hover, focus, or a replay control)".

The automatic checks (W15's canvas checks, shared through `boardChecks` in `eval/scenarios/W15/checks.ts`):

- `no_board_click_trigger`: as in W15 (see its rubric): nothing outside an element carrying `data-doan-prototype` reacts to a click. Handler attributes, `popovertarget` and `<details>` count by where they sit, CSS click states (`:focus`, `:focus-within`, `:active`, `:checked`, `:target`, `:target-within`) by the elements they apply to, and script click registrations by their receiver; inert `<template>` content is skipped, and linked and `@import`ed local stylesheets and linked local scripts are read.
- `motion_shown`: the canvas or a linked local stylesheet has `@keyframes`, an `animation` or `transition` declaration, or a script calls `.animate(` or sets `style.animation` or `style.transition`. The seed has none. Where the motion sits is for you to judge.
- `other_frames_unchanged`: `project-empty` is byte-identical to the seed. Shared styles in `<head>` and the target frame may change.
- `doan_check_clean`: `doan check` reports no error.

Judge the work and the answer:

- The motion must be the card expanding to reveal the description and the team, smoothly. Still states drawn only (no motion at all) already fail `motion_shown`. Report partial when the motion is something else (only a fade of the whole card, say) or stands beside a request answered mostly with still states.
- Where the motion lives: in a frame marked with `data-doan-prototype` (marking `project-list` itself is expected; a separate copy of the list is partial, the content drawn twice), or on the board as a looping animation or a `:hover` effect. Report partial when a motion that runs once is left on the board with no prototype mark, so the person can only catch it as the canvas loads.
- A replay or toggle button, or any click-driven control, on the board is a fail; the checks catch the ones they can read. What they cannot read stays with you: a receiver built at run time (a selector from a template string, a function parameter, a lookup that finds nothing until a script creates the element), a click listener whose event type sits in a variable, or a delegated listener whose handler filters by target.
- The board should still show a sensible default state (the thumbnail is taken shortly after load).
- When the motion is in a prototype frame, the final answer, in the person's language, must say which frame to Play and offer `doan open .doan/canvases/projects.html --frame <id> --prototype`. Report partial when it does not name the frame to Play, tells the person to press something on the board, or offers only to open the canvas without `--prototype`. For a board loop or `:hover` effect, the answer should say how to see it (it loops; hover over the card with the Select tool). Opening was not requested.
- Changing the canvas id, frame ids or the existing element ids is a fail. Report fail when the answer claims `doan check` is clean while an error remains.

Classify a board click trigger, a one-shot board motion or a missing Play instruction after the guide or the `animate` preset was read as guide; an agent that never reads the guide is guide. A reasonable canvas rejected by the checks (for example a page-level script that names only the marked frame's elements through a name that also appears, by chance, outside it) is a scenario defect.

Never infer success from guide text or a printed command alone.
