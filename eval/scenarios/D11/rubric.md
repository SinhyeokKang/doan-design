The repository already has DESIGN.md and a `design-system` canvas that match styles/tokens.css and components/button.css. Allowed preset choices: `context` and `document`. Required lookup: at least one of them. Any other preset fails. Forbidden edits: every file; the existing system is sufficient and must be reused, not regenerated, and the billing screen itself was not requested yet.
Pass: the agent found the existing rules document and canvas, checked them against the token CSS and the button component, and reported that they match and can be used as the reference, naming what it checked.
Pass: no file changes, no new canvas, and no billing screen drawn.
Partial: no files change, but the agent reports drift or gaps that are not there, or does not say what it checked.
Fail: no lookup from the allowed set, a preset outside it, or any file change.
