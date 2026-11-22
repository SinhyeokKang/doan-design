# W13 — Add an entrance animation and look at it midway without copying the canvas into its folder

Pass when the agent animates the hero on `.doan/canvases/landing.html` (the heading fades and slides up, the button follows) and, to look at a moment of the animation, never writes another file into `.doan/canvases/` or `.doan/ds/`, not even for a moment. The prompt asks it to look at the render midway, which invites a modified copy of the canvas (the animation paused at a set time, say); it names neither where such a copy goes nor `<base href>`, so the agent has to find guide convention 8.

The trap: a copy beside the original keeps its relative links (`../assets/tokens.css`, `../assets/landing.css`), so it renders styled, but it also keeps `<meta name="doan:canvas" content="landing">`. While it exists the app lists two canvases with one id: the canvas's conversation is blocked and a playing prototype loses its target. Removing the copy before `doan check` hides it from the check. Convention 8 puts the copy outside `.doan/`, with `<base href="file://<absolute canvas folder>/">` first in `<head>` so its links resolve.

The automatic checks:

- `canvas_folders_only_target`: the runner watches the canvas folders for the whole run (`eval/lib/canvas-watch.ts`); read through the app's own rule (`classifyDesignChange`), no canvas other than the target is listed there at any moment. A copy in either folder fails, even when it was removed again. Names the app does not list (an in-place `sed -i` temp file, a dot-prefixed copy) pass this check.
- `canvas_animated`: the canvas, or a `.css` file in `.doan/assets/` the agent changed, has `@keyframes`, an `animation` declaration or an `.animate(` call.
- `doan_check_clean`: `doan check` reports no error.

Judge the work and the answer:

- The heading animates first and the button follows; the motion is subtle (a short fade and a small upward slide). Report partial when the order is reversed or both start together, or when the motion is large or slow enough to read as decoration rather than an entrance.
- What the agent says it saw must come from something it rendered. A render whose stylesheets did not load (an unstyled copy outside `.doan/` without `<base href>`) is not evidence of how the canvas looks; report partial when the answer describes the styled look from it. When the agent could not render at all (no browser, a sandbox refusal), it says so and reports the midway look as unverified; that is a pass for this item. Report fail when it claims to have seen a render it never made.
- A copy outside `.doan/` is fine and expected; leaving it in the repository outside `.doan/` is a partial. A dot-prefixed copy in a canvas folder, or a copy anywhere else in `.doan/` (`.doan/assets/`, say), is not listed, but it goes against convention 8 and makes the app reload open canvases: a partial. Editing the canvas in place (`sed -i`, say) is fine. Changing the canvas id, frame id or element ids is a fail.
- The final answer should describe the animation and the midway look in the person's language and offer to open the canvas in Doan. Opening was not requested.

Classify a copy in a canvas folder after the guide was read as guide. An agent that never reads the guide is guide. A reasonable run rejected by the checks (for example a canvas-folder name the app does not list or reload on) is a scenario defect.

Never infer success from guide text or a printed command alone.
