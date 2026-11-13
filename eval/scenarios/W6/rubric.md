# W6 — Draw a screen with icons from a sprite file and a shared logo stylesheet

Pass when the agent creates a reviewable Notifications canvas under `.doan/canvases/` that uses the project tokens and `.doan/assets/components/app-shell.css`, draws the Home, Search, Notifications and Settings icons from `.doan/assets/icons.svg` inline, and ends with a `doan check` that has no error and no `ambiguous_custom_url`.

The seed sets two traps the prompt does not name. The icons exist only as `<symbol>`s in a sprite file, and the app cannot draw a `<use>` that points into another file (`svg_use_not_inline`); the guide says to copy the needed symbols into the canvas, draw them with `<use href="#id">` and leave a `<!-- source: … -->` note. The sprite also has a `<style>` (the `.icon-line` stroke rule) without which the icons draw as filled shapes. And `--brand-logo` in `tokens.css` holds `url(brand/logo.svg)`, which `tokens.css` (`.doan/assets/`) and `app-shell.css` (`.doan/assets/components/`) both use, so they resolve it to different paths and `doan check` warns `ambiguous_custom_url` as soon as the canvas links both. The guide says to use such a property from stylesheets in one folder only, or register it with `@property` and `syntax: "<url>"`.

The automatic checks carry the evidence. `icons_inline` needs, in one canvas, a symbol outside `<template>` with the same drawing as each of the four seed symbols (tags and geometry; ids, classes and styling may change) and a `<use>` naming it as a fragment. `no_svg_use_not_inline` and `no_ambiguous_custom_url` read the final `doan check`; `doan_check_clean` needs no error. `shell_styles_linked` needs the canvas to reach both `tokens.css` and `app-shell.css` through `<link>` or `@import`, so the agent cannot avoid the custom property warning by leaving the app shell out.

Judge the canvas and the answer:

- The icons should draw as line icons: the canvas carries the sprite's stroke styling (the copied `<style>`, an equivalent rule, or attributes on the shapes). Report partial when the symbols are copied without it, so the icons render as filled shapes.
- Copying the whole sprite instead of the four needed symbols is not a failure; mention it.
- The fix for `--brand-logo` should keep the logo showing in the header: editing `app-shell.css` to a path that resolves to `.doan/assets/brand/logo.svg`, moving the use into one folder, or `@property` registration all pass. Report partial when the warning is gone but the header logo no longer resolves to an existing file, or when the agent removed the logo.
- The answer should say, in the person's language, what it changed outside the canvas (for example `app-shell.css`) and why. Report partial when an edit to a shared stylesheet goes unmentioned.
- Report fail when the answer claims `doan check` is clean while an error or `ambiguous_custom_url` remains, or claims the icons come from the sprite file while the canvas still points into it.

Classify a failure by layer. An external `<use>` left in place, symbols copied without their style, or an `ambiguous_custom_url` left after the agent saw it is guide, unless the transcript shows `doan check` never reported it (then `doan check` rule) or its message gave no way to act (then output). An agent that never ran `doan check` or never read the guide is guide. A check or fixture that scored a reasonable canvas wrong (for example a symbol whose drawing was reformatted beyond whitespace) is a scenario defect, not a doan issue.

Never infer success from guide text or a printed command alone.
