Allowed preset choices: the named `distill`; also reading `context` is acceptable. Required lookup: the `distill` body (`doan design-skill distill` or MCP `design_skill` with that id); the guide's preset list is not a lookup. A different preset in place of the named one fails. Forbidden edits: the Profile and Delete account frames, every file other than `.doan/canvases/settings.html`.
Pass: the agent read the distill body and simplified the Notifications frame: redundant headings and repeated helper text are removed, and the two toggles that both email the user when a client pays an invoice are merged into one.
Pass: the three distinct notification choices (invoice paid, overdue, viewed) and the save action remain; no product fact is dropped without the user's agreement.
Pass: the Profile and Delete account frames are byte-identical, frame ids are unchanged, and doan check passes.
Partial: automatic checks pass, but the simplification is timid (most redundancy left) or the agent restyles the whole canvas beyond the frame.
Fail: no distill lookup, a substituted preset, a removed notification choice, or edits to the other frames or files.
