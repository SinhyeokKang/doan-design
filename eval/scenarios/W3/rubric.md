# W3 — Edit a canvas with terminal work signals

Pass when the requested button label changes without unrelated edits, and the agent follows the discovered guide's terminal workflow: start before editing, run check, finish with work done.

The final answer must include a clickable Markdown link with the real `doan://` URL returned by `doan work done`, so the person can open this canvas in Doan. A fenced URL, a repository file link, an invented root, or a description without a clickable canvas link is not sufficient. Judge links here; automatic checks deliberately do not parse final-answer prose.

Report a partial result for a missing final-answer link even when automatic work checks pass. Classify an omitted start/done or link as guide unless invocation evidence shows a CLI or runner problem. Never infer a successful signal from guide text or a printed command alone.
