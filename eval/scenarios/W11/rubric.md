# W11 — Link three onboarding prototype screens

Pass when the agent links the existing welcome, signup and done frames in `.doan/canvases/onboarding.html` so the prototype can move welcome → signup → done and back, preserving the design and following the discovered guide's terminal workflow. All three frames already have valid prototype marks. The prompt names neither the attribute nor the command, so the agent has to discover `data-doan-goto` in convention 15.

The automatic checks carry the structural evidence. `one_link_group` imports the app's `linkGroups` rule and requires the three marked frames to form one group. It reads raw ids, first attributes and enclosing frames outside templates, without truncating ids. `canvas_otherwise_unchanged` follows W7's parse-and-compare approach: tags, attributes and whitespace-collapsed text must equal the seed after every `data-doan-goto` attribute is removed. Comments and declarations must also remain unchanged. `only_canvas_changed`, `doan_check_clean`, the usual work signals and `no_doan_open` complete the automatic checks. As in W7, a canvas-only selection fixture starts the fake app so work signals can be verified; the task does not depend on a selected frame or element.

Judge direction and placement, which an undirected link group alone cannot establish:

- The Create an account button must lead from welcome to signup, and Sign up from signup to done. Back to welcome must return signup to welcome, and Back to sign up must return done to signup. Report fail if a path is missing, reversed, attached to an unrelated element, or uses a self-link instead of the requested transition, even if all frames form one group.
- A `doan work update` naming each edited frame with a short note should precede its edit (guide rule D). Report partial when one is missing; W5 measures this rule across frames, so do not fail this run for that alone.
- The final answer should describe the connected flow in the person's language and offer to open the onboarding canvas in Doan. Report partial when the answer misstates what changed or claims it opened a prototype. Opening was not requested.
- Report fail when the agent claims `doan check` is clean while an error remains.

Classify a missing or incorrect link after the guide was read as guide unless the transcript shows the check failed to report an invalid link (check) or its message gave no way to act (output). An agent that never reads the guide or runs `doan check` is guide. A reasonable canvas rejected by the checker is a scenario defect. Never infer success from guide text or a printed command alone.
