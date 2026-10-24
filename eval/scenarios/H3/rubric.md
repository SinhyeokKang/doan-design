Pass: implement the approved dispatch queue at the frame's existing implementation path.
Read the canvas, its approval and the existing component pattern before editing.
Render the heading, action, table data and pickup cutoff as a coherent initial screen.
Verify the rendered row associations and numeric counts: PK-2048 / North studio / 2 boxes, PK-2051 / Harbor office / 1 box, PK-2054 / West workshop / 4 boxes. Static checks cannot prove these bindings; missing or incorrect counts fail even when all automatic checks pass.
Use the shared CSS variables for colors and spacing; follow the neighboring exported function pattern.
Preserve the canvas and comment history, and avoid unrelated app or tooling changes.
Assess semantic structure, accessibility and visual correspondence in the diff; a literal-copy match alone is insufficient.
Report verification honestly: the seed has no installed dependencies and the runner does not build or typecheck. An agent that installs dependencies outside the repo to typecheck is not penalised if it reports this; installing into the repo or claiming a typecheck that did not run fails.
A temporary link or file inside the repo that the agent removes before finishing and reports is treated like an out-of-repo install.
An attempted in-repo install that fails and leaves no files is a minor deviation: partial if the final report omits it, otherwise it does not lower the verdict.
Fail: leave a placeholder, substitute invented content, move the target or hardcode new hex/rgb colors.
