# W12 — Make a desktop app prototype with a fixed header and inner scroll

Pass when the agent creates a reviewable Inbox canvas under `.doan/canvases/` whose desktop frame is marked for prototyping, keeps the header fixed while the message list scrolls inside the frame, and sizes the app to the window with `var(--doan-viewport-height, <H>px)` instead of a viewport height unit. The prompt names neither the attribute, the size, the variable nor any unit, so the agent has to find conventions 11 and 14 in the guide.

The trap: a fixed header with inner scroll is usually written as `height: 100vh`. In the app a viewport height unit resolves against the whole board (convention 11), and a fixed pixel height stops following the window while the prototype plays. Rule 14 gives the variable, set only while playing, with the frame's H as the fallback the board and thumbnails use.

The automatic checks carry the structural evidence. They read every canvas under `.doan/canvases/`, its `<style>` blocks and `style` attributes outside `<template>`, and the local stylesheets it reaches through `<link>` or `@import`.

- `desktop_prototype`: a `data-doan-prototype` frame outside `<template>` is a desktop viewport, 1024–2560 wide, 600–1600 high and wider than high. A size taken from the content height (1440x2400) fails.
- `viewport_height_fallback`: a `height` declaration (not `min-height`) uses `var(--doan-viewport-height, <N>px)`, directly or inside `calc()`, where N is the H of such a desktop frame.
- `no_viewport_height_unit`: `doan check` reports no `viewport_height_unit`, and no reached stylesheet has a vh, dvh, svh, lvh, vb, dvb, svb or lvb dimension (`doan check` does not scan linked stylesheets for them).
- `no_viewport_height_no_fallback`: `doan check` reports no `viewport_height_no_fallback`.
- `variable_not_defined`: no stylesheet declares `--doan-viewport-height` and no canvas script sets it; Doan defines it while playing.
- `doan_check_clean` and `canvas_created` as in W1.

Judge the layout and the answer:

- The header must stay in place while only the message list scrolls: the app root takes the height, the header does not shrink, and the list fills the rest with its own overflow scrolling. Report partial when the variable is on the root but the list does not scroll inside it (for example the whole page scrolls), and fail when the header scrolls away with the list.
- Interactions were not requested beyond the scrolling list. Building a few (search focus, a selected message) is fine; the answer should say which are not wired (rule F). Report partial when it presents unwired controls as working.
- The agent should not stop to ask about size, units or interactions: the request settles them (rule F). Report partial when it ends with a question instead of the canvas.
- The final answer should describe the canvas in the person's language, say it plays as a prototype, and offer to open it in Doan. Opening was not requested.
- Report fail when the answer claims `doan check` is clean while an error remains.

Classify a missing variable, a vh unit, a missing fallback or a content-height size after the guide was read as guide, unless the transcript shows `doan check` failed to report a vh unit or a missing fallback in the canvas's own CSS (check) or its message gave no way to act (output). An agent that never reads the guide or runs `doan check` is guide. A reasonable canvas rejected by the checks (for example a desktop size outside the bounds above that a real desktop screen uses) is a scenario defect.

Never infer success from guide text or a printed command alone.
