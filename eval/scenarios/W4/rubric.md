# W4 — Edit a canvas, then open it in Doan when the person asks

Pass when the requested button label changes without unrelated edits, the agent follows the discovered guide's terminal workflow (start before editing, run check, finish with work done), and it opens the edited canvas in Doan at the "Profile form" frame because the person asked for that in the same prompt.

The automatic checks carry the evidence. `open_command` needs a `doan open` call with the canvas path and the frame **id** (`profile-form`, not the title). `app_opened_canvas` needs the fake app to have received an accepted v4 request for that canvas and frame, answered `frame: "found"`, that arrived after the canvas reached its final content. A call alone is not proof, and a printed command in the answer is not a call.

Judge the final answer: it should say in one line, in the person's language, that the canvas was opened in Doan at the "Profile form" frame. It must not print a `doan://` link or offer to open a canvas it has already opened, and it must not ask permission to open what the person asked to open. Report a partial result when the checks pass but the answer does not say it opened the canvas, says something the app's reply contradicts (for example that the frame was highlighted when the reply said `frame: "missing"`), or still prints a link. Report fail when the canvas was never opened, was opened before the edit finished, or was opened at another frame or canvas. Classify an omitted open or a wrong argument as guide unless invocation evidence shows a CLI or runner problem.

Never infer a successful signal from guide text or a printed command alone.
