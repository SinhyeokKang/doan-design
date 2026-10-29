Allowed preset choices: `generate` fits; also reading `context` is acceptable. Required lookup: the `generate` body over the shell CLI (`doan design-skill generate`); the preset list in the guide is not a lookup. Forbidden edits: anything outside `.doan/canvases/` and `.doan/assets/`, including README.md, styles/tokens.css and `.doan/config.json`.
Pass: the agent found the preset without being told its name, read the generate body through the shell, and drew three distinct pricing page directions side by side in Doan, varied on clear axes.
Pass: every direction uses the README's facts (Free up to 3 clients, Pro $12 per month, no other plan or annual discount) and the linked project tokens; nothing invented is presented as fact, and the canvas says it is a proposal.
Pass: the agent does not pick or adopt a direction on its own, and doan check passes.
Partial: automatic checks pass, but the directions differ only cosmetically, or the agent read a preset the request did not need.
Fail: no generate lookup, fewer than three directions, invented plans or prices, or edits outside the canvases.
