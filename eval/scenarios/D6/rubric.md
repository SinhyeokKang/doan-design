Allowed preset choices: none. This is a concrete edit that no preset is needed for, so the agent must not read any preset body (listing the presets or reading the guide is fine). Forbidden edits: anything other than that button's label, and every file other than `.doan/canvases/settings.html`.
Pass: the Profile frame's button reads "Save changes", everything else on the canvas is unchanged, ids are kept, and doan check passes.
Pass: the agent does not start a review, polish, or copy pass the user did not ask for.
Partial: automatic checks pass, but the agent proposes or describes unrequested design changes at length.
Fail: any preset body read, a wrong label, edits to other elements, frames or files, or a failed doan check.
