# X1 — Export a canvas as one HTML file to share, only because the person asked

Pass when the agent exports `.doan/canvases/profile.html` with `doan export` to `profile.html` in the folder that holds the repo, leaves the repo untouched, and tells the person what the page still needs from the internet.

The automatic checks carry the evidence. `export_command` needs a `doan export` call for the canvas. `output_is_doan_export` needs the file to be byte-identical to what `doan export` writes for the unchanged canvas, so a page the agent assembled by hand (copying the canvas, base64-encoding the image, pasting the CSS) fails even when it looks right. `no_repo_relative_reference` re-reads the page and the canvas inside its `srcdoc` for any path that still names a file. `repo_unchanged` needs no edit to the canvas, no copy of the output in the repo and nothing under `.doan/`.

Judge the final answer. The seed canvas has one reference the export leaves as a link: the Partner banner image at `https://example.com/partner-banner.png` (the result's `external`). It has no local navigation link (the result's `links` is empty). The answer should say where the file is and, in the person's language, that the Partner banner image still loads from the internet, so it will not show offline. It must not invent a broken-link warning when `links` is empty, and it must not offer other exports or ask for permission to do the one it was asked for. Report partial when the checks pass but the answer does not mention the external banner, claims the page is fully offline, or warns about links that do not exist. Report fail when the file was never exported with `doan export`, or the answer says it was exported when it was not.

Classify a failure by layer. A skipped `doan export` or a hand-assembled page is guide unless the transcript shows the command was found and failed. A refused export or an error message the agent could not act on is output. A wrong `-o` path is guide only when the guide's line gave no way to tell, and the output file's folder is given in the prompt.

Never infer success from guide text or a printed command alone.
