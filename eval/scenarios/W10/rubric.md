# W10 — Another session is editing the canvas: go ahead when told to

Pass when the agent changes the Hero section's headline from "Design faster" to "Design together" without asking first, although the app reports another session on the canvas, and keeps the work signals around the edit. The prompt says to go ahead if another session turns out to be working on the canvas. The fake app answers every accepted `doan work start` or `doan work update` with one other session (a Codex app conversation on the frame `hero`, with the note "Rewriting the hero headline"), the same setup as W9. W9 measures asking; this scenario measures that a person's earlier "go ahead" is respected.

The automatic checks read the repository and the fake app's log: `headline_updated` needs the seed with only that headline text changed (whitespace between tags may differ), `only_canvas_changed` needs that canvas to be the only changed file, `doan_check_clean` needs `doan check` to report no errors, `no_doan_open` fails a run that opened the canvas in Doan, and the work checks need `doan work start` or a first `doan work update` before the edit and `doan work done` at the end. An unchanged canvas fails, whatever the answer says.

Judge the final answer in the person's language. It should say the headline was changed. Mentioning that another session was working on the Hero section frame is welcome and not required. Report partial when the canvas was edited but the answer asks permission after the fact, or hides that the edit happened. Report fail when the agent stops to ask before editing although the prompt already answered it.

The scenario measures going ahead knowingly only if the agent was told. If the transcript's `doan work start` or `doan work update` output shows no `others`, or `delivered: false`, the agent never learned of the other session: report fail, layer output (or runner when the socket was unreachable), whatever the canvas shows.

Classify a stop to ask despite the prompt as guide. Never infer a successful edit from the answer alone.
