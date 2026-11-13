# W7 — Make one frame of a canvas playable at a phone size

Pass when the agent marks the "Sign up (phone)" frame of `.doan/canvases/onboarding.html` as a prototype at a phone size, changes nothing else, and follows the discovered guide's terminal workflow (start before editing, run check, finish with work done). The prompt describes the goal in plain words; it does not name the attribute or the CLI, so the agent has to find guide item 14 (`data-doan-prototype="<width>x<height>"` on the `data-doan-frame` element) on its own.

The seed sets two traps. The prompt names the frame by its title, so the agent has to map it to its id `signup-phone`, and a desktop frame titled "Sign up (desktop)" sits next to it. The phone frame's content is wrapped in one `<div>`, an obvious but wrong place for the mark (`doan check` reports `prototype_not_frame`).

The automatic checks carry the evidence. `prototype_on_frame` needs exactly one `data-doan-prototype` outside `<template>`, on the element whose `data-doan-frame` is `signup-phone`, with a value in the shared grammar `^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$`. `canvas_otherwise_unchanged` compares the seed and final canvas as tags, attributes and whitespace-collapsed text with the mark removed, so reformatting passes and any other edit (copy, a script, a note) fails. `only_canvas_changed`, `doan_check_clean`, the work signals and `no_doan_open` (the person did not ask to open the canvas or the prototype) complete it.

Judge the size and the answer:

- The size should be a phone size. The frame is drawn 390 by 844 px, and `390x844` is the guide's own example; another portrait phone size (for example `375x812` or `393x852`) also passes. Report partial when the size is valid but not a phone (landscape, tablet or desktop, or a size the agent invented without a reason).
- A `doan work update` naming the frame `signup-phone`, with a short note in the person's language, should come before the edit (guide rule D). Report partial when it is missing; W5 measures this rule across frames, so do not fail the run for it alone.
- The answer should say, in the person's language, that the frame can now be played in its own window at the chosen size; it must not claim it opened the prototype. It should end with the guide's offer to open the canvas. Report partial when the answer misstates what changed or which frame was marked.
- Report fail when the answer claims `doan check` is clean while an error remains, or claims the frame is playable while the mark is on another element.

Classify a failure by layer. A missing mark, a mark on a child or another frame, or an invalid size after the agent read the guide is guide, unless the transcript shows `doan check` never reported the problem (then `doan check` rule) or its message gave no way to act (then output). An agent that never ran `doan check` or never read the guide is guide. A request the guide cannot serve (the agent looked for a play command and found none) is product only when the transcript shows it. A check that scored a reasonable canvas wrong is a scenario defect, not a doan issue.

Never infer success from guide text or a printed command alone.
