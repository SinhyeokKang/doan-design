# Design measurements

Measured values the app UI relies on, deviations from the draft canvases that are in force, and surfaces that are not verified. Draft canvases live in `.doan/canvases/`. Colour and size roles come from `app/src/renderer/tokens.css` (palette → roles → legacy aliases) and `app/src/renderer/ds/` (`controls.css`, `surfaces.css`, loaded through CSS `@import` from `styles.css`).

## Evidence and verification policy

- Checks are the static/unit/build gate plus short affected-behaviour probes under `.scratch/`, backed by `app/runtime/`. There are no screen-specific e2e scripts and no full-suite gate; new end-to-end scenarios will be designed after the app stabilizes. No value in this document implies a passing full-suite run.
- Regression pointers below name only tests that exist. A value whose only check lived in the removed `app/e2e/` suites is listed as **unpinned**.
- Raw evidence under `.scratch/` is local and ignored; the conclusions and limits are recorded here.
- Recurring comparison rules that apply to every screen:
  - A border style or colour difference counts as equivalent only when the corresponding border width is 0 on both sides (Tailwind preflight resolves `solid` where drafts resolve `none`); no border is painted.
  - Static draft `.focus` specimens always draw a ring. The app follows `:focus-visible`, so a pointer-opened dialog focuses Cancel without a ring until keyboard modality applies.
  - Native windows supply the outer corner radius and shadow; renderer roots have radius 0 and fill their content view. Native traffic-light placement, corner shape, window shadow and native message boxes are not measured against drafts.
  - Fixture names, paths, counts, times and error strings differ from draft sample text; their intrinsic widths and wrapping are context differences, not equality claims.
  - The native modal `<dialog>` computes `user-select: text`, `position: fixed`, `margin: auto` and a viewport-bounded `max-height`, where drafts draw static `div` specimens.
- **"buzz-ds 이전" sections.** A section marked this way was measured on the earlier dark theme. Its colours come from the Design system section (the old colour values are not reproduced here, and opacity-dimmed disabled states no longer apply: disabled is a role). Its sizes, type and layout were not remeasured where buzz-ds restyled a shared component. Each mark names its owner child, which remeasures the section and then removes the mark.

## Design system

The reference for every screen.

### Reference

- `block/buzz-app` (Apache-2.0), local clone `~/code/buzz-app`, base commit `c40dfdf4c81aabe759f3a4329c3e77f854746a59`. It is a reference only: values and rules were read from it and Doan wrote its own CSS and TSX. No Buzz file, licence copy, source comment or `buzz` name is in the app code.
- Rules were read from `src/shared/design-system/DESIGN.md` (accent color, focus appearance, surface and depth), `docs/design-system.md` and `docs/shell-design.md`.
- Values were read from `src/shared/design-system/styles/`: `tokens.css` (palette, roles, radii, spacing, time and easing), `typography.css`, `materials.css` (`floating-surface`), `components.css` (buttons, icon buttons), `overlays.css` (dialogs, tooltip, toast, motion), `forms.css`, `scrollbars.css`, `chips.css`, `settings-group.css` and `empty-state.css` (the status block).

### Adopted rules

- **Tokens first.** Every app value that a token in `app/src/renderer/tokens.css` covers (color, type size/line height/tracking/weight, spacing, radius, control and icon size, shadow, motion) is written as that token in drafts, app CSS and TSX, never as a literal. Type roles are applied whole (size, line height and tracking together).
  - A literal is allowed only when no token has that value; it is then either a component constant (one component or screen uses it, e.g. a wordmark size or a layout width) or a new token.
  - A new token may be added at any time when it follows the existing rules: a purpose-named family that already exists (`--space-n` = n×4px, `--size-*`, `--radius-*`, `--type-weight-*`, a complete `--type-<role>-size/line-height/letter-spacing` set, role colors rather than palette steps), a value that does not duplicate an existing token, no change to existing tokens' values, and a line in the token list below.
  - Moving a literal to a token must not change the computed value; when only an approximate token exists, the change is a design decision for the user, not a silent substitution.
- **Added tokens** (each replaced matching literals without changing computed values):

  | Token | Value | Use |
  |---|---|---|
  | `--size-chrome` | 56px | Shell chrome height |
  | `--size-control-lg` | 48px | Large control height |
  | `--size-row` | 72px | Minimum provider/project/destination row height |
  | `--space-10`, `--space-12` | 40px, 48px | Extend the 4px spacing scale |
  | `--type-weight-semibold` | 600 | Semibold text |
  | `--surface-accent-subtle` | violet 3 | Chosen design preset chip in the Home composer |
  | `--text-accent-subtle` | violet 11 | Same chip's text |
  | `--size-icon-sm` | 14px | Icon inside chips, triggers and tabs |
  | `--size-icon-lg` | 20px | Project thumbnail in a picker, provider mark in the conversation strip, strip status icon |
  | `--size-control-xs` | 24px | `xs` icon button (a chip's remove button) |

- **Roles.** Code reads roles named by purpose (`surface-*`, `text-*`, `border-*`, `affordance-*`, `bg-*`), never palette steps. Text has three reading levels: `text-standard`, `text-subtle`, `text-metadata`; `text-disabled` is below the contrast targets on purpose. The primary button is the neutral prominent fill (black, white text). Status colours use the reference status roles (`text-danger`/`-warning`/`-success`, `affordance-danger`/`-warning`/`-success`, `border-danger`/`-warning`).
- **Type roles.** Size, line height, tracking and weight travel together: caption 12/16, body-sm and body 14/20, label-sm 14/20 500, label 16/24 500, body-lg 20/28, heading 24 and title 32 at line height 1.1. Regular 400 is for reading and form labels, medium 500 for actions and structure. One sans stack; no monospace role.
- **Radii.** `chip` 12, `row` 16, `control` 20, `container` 24, `panel` 28px; capsules (34px) and pills are separate shapes. A nested corner is `max(0, outer − inset − border)` and is not rounded to a step (`nestedRadius`: a menu row in a 24px menu with a 4px inset and a 1px border is 19px).
- **Focus.** An outer 2px `border-focus` ring at a 2px offset on buttons, icon buttons, checkboxes and chips; the ring does not change geometry, and every button variant uses the same ring. Rows inside a scrolling list (tree rows, `.wt`, Feedback items, menu rows, Settings project rows) use an inset ring at −2px so the list does not clip it. Text fields show focus with their own border (`border-prominent`), not a ring.
- **States.** Pressed changes the fill only, never the position. Selection stays visible apart from hover. Disabled is a role (`text-disabled` on `affordance-disabled`), never `opacity`.
- **Motion.** `time-fast` 120ms, `time-state` 150ms, `time-panel-enter` 180ms, `time-settle` 220ms; `ease-enter`, `ease-settle`, `ease-state`. A dialog rises 12px over 220ms as it opens and drops 4px over 120ms as it closes (`@starting-style`, `transition-behavior: allow-discrete` on `display` and `overlay`). A tooltip that waited for its delay settles in (fade, 2px rise, scale 0.97, 2px blur); one opened instantly from a neighbour does not animate. Under `prefers-reduced-motion: reduce` the fades stay and every movement, scale and blur goes.
- **Floating material** (menus, popovers): 24px corner (16px compact), 4px list inset (2px compact), a transparent 1px border that still counts in the nested-corner arithmetic, `shadow-panel` drawing the visible edge (`CanvasText` border under forced colours). Glass (`surface-elevated-glass`, 90% white with an 8px blur) applies only under `prefers-reduced-transparency: no-preference`, outside forced colours, where `backdrop-filter` is supported; otherwise the surface is opaque. Menu rows are 32px with the derived 19px corner (13px compact). Menus are capped at 320px.
- **Dialogs.** Four widths: compact 400px, standard 640px, wide 880px, expanded 1152px. Compact is centred; the others hang 128px from the top and may grow to 16px above the window edge. 32px padding (16px in a window 480px wide or less), 28px corner, opaque `surface-popover`, 16px between parts. The header is the title over an optional description; actions sit at the end of the row, Cancel first and the completing action last, at the default button size. One exception: Project Settings saves each value at once, so Done is its only action. There is no Close button; Cancel and Escape close every Doan dialog (Project Settings: Done and Escape, refused while a pick, confirmation or write runs). Unresolved: first run's Stop and Paste dialogs, which Settings > Agents reuses, use `sm` actions. The modal scrim is `bg-scrim` (black at `#00000060`).
- **Tooltip.** A near-black capsule (`affordance-prominent`, `text-on-prominent`): caption type, 4/8px padding, corner half its one-line height (12px; 24px tall), no arrow, at most 384px wide with long paths wrapping. PathTip shares the padding.
- **Toast.** Floating material, 384px wide, 12px inset; the message and its one action share a row, the action a `prominent` sm button on the right that stays vertically centred while only the message wraps. It sits at the window's bottom right, `--space-4` (16px) from both edges, on Home and over a workspace or canvas.
- **Shared variants.** Screens add variants instead of overriding shared sizes or fills.
  - `doan-button` `quiet` (sm suggestion chip): `--affordance-backdrop-hover` fill with a `--blur-md` backdrop blur (`--affordance-subtle` without blur under reduced transparency); hover adds one inset `--affordance-backdrop-hover` layer, pressed or open one `--affordance-backdrop-pressed` layer. A disabled `quiet` button is transparent like a ghost.
  - `doan-button` `trigger` (a value that opens a menu): 8px inline padding, no fill at rest, `--affordance-backdrop-hover` on hover and while open, `--affordance-backdrop-pressed` on press.
  - `doan-button` `lg`: min-height `--size-control-lg` 48, padding `--space-3` `--space-8`, label 16/24; only Welcome uses it.
  - `doan-icon-button` size `xs`: 24px (`--size-control-xs`), pill corner, 14px icon; its ink comes from the screen (a chip × is `--text-metadata`).
  - `doan-icon-button` `accent` (Home Send): pill on `--affordance-accent` with `--text-on-accent`, hover and pressed on the accent hover/pressed roles; disabled takes the shared disabled fill, and `accent` is excluded from the ghost disabled transparent rule.
  - `.doan-dialog` with `data-ui-presentation="search"`: Quick Open (see Design navigation).
  - `.doan-notice.doan-panel` (notice on a panel, `ds/surfaces.css`): see Onboarding.
- **Scrollbars.** Native and thin (`scrollbar-width: thin`, `scrollbar-thumb-quiet` on a transparent track) through `.doan-scroll`; Radix ScrollArea is forbidden.
- **Style loading.** The main window loads shared rows and code styles through HTML links, which preserve cascade order under the strict CSP, in production and DEV, with no entry CSP warning.

### Doan adjustments

- **Accent ramp.** Doan has its own violet ramp, not a reference family. Each step takes the per-step OKLCH lightness and chroma share (relative to step 9) of the reference's twelve-step light ramp whose step 9 carries white text, at hue 305, gamut-clamped by reducing chroma. Steps 1–12: `#fdfbfe`, `#fbf8fe`, `#f5f0fd`, `#efe7fa`, `#e9ddf9`, `#e2d2f7`, `#d6c1f0`, `#c7aee6`, `#973be1`, `#9033d9`, `#543871`, `#342743`; pair values: contrast and ink `#ffffff`, pressed `#8a2dd2`, link `#63019d`. White on `#973be1` is 5.21:1 (APCA Lc −80), and hover (`#9033d9`) and pressed (`#8a2dd2`) are darker than step 9, so white only gains contrast.
- **Accent places.** Violet is read only by: comment pins (`.comment-pin`); the comment submit buttons (`.comments-btn.primary.submit`: Save, Save and reopen, Save and continue); the comment card roles `surface-comment` (violet 4) and `text-comment` (violet 12), which are defined but not yet applied to any surface (`buzz-comment` applies them); the Welcome glow `.ob-atmosphere`; Home Send (`doan-icon-button` `accent`) and its spinner ink; the chosen preset chip (`.preset-chip`); the suggested prompts' group icons (`.suggestion svg`); the Home glow `.home-atmosphere`; the composer drop outline (`.drop-target`); and the sidebar status slot (`.row-slot.permission`, `.row-slot.unseen i`). Sidebar selection and hover use neutral backdrop roles. Every other use is neutral. `accentPlaces` pins the list.
- **Black pin rim.** `border-pin` is `neutral-12` (black), not violet 11: violet 11 is 1.85:1 against the violet 9 fill, under the 3:1 non-text target. Black is 4.03:1 against violet 9; the white `halo-pin` keeps pins visible on dark canvases. A focused pin adds the 2px `border-focus` ring and a 4px white halo.
- **No coloured edge stripes.** No message, notice, card or row uses a coloured or thick start-side border (`edgeStripes` checks it). Errors take one of three forms, each with the lucide `CircleAlert` icon so colour is not the only signal:
  - a panel-level failure is a status block (1px `border-standard`, `radius-container`, centred 20px icon, label-sm title, body-sm `text-subtle` description, centred actions, opened detail on `surface-inset`);
  - an inline error is a 16px icon with one body-sm `text-danger` line (`text-warning` for warnings), which adds the icon to the reference's text-only field error;
  - a neutral notice is a `surface-inset` fill with `radius-row` and body-sm `text-subtle` (icon and `text-warning` when it warns).
- **Status pill.** `.ob-chip` is a 20px pill in caption type on the status `affordance-*` fill with the matching `text-*`. The reference has no such pill; Doan keeps it for connection and wizard status. It is a separate primitive from `.doan-chip`.
- **Shared dialog sizes.** The confirmations (link replacement, Settings' Fix… and Add to serve?) and the three comment confirmations are compact and centred; Project Setup and Hand off are standard, 128px from the top. Replaced: the Add Projects dialog and its SetUpFolderConfirm are now the Add Projects page (see Add Projects page).
- **Toast without a type.** Success, error and undo toasts share the one neutral floating toast and differ only by their text; there is no type colour and no close button.
- **Focus ring colour.** The ring is `border-focus` (`neutral-12`, black, 21:1 on white); the reference ring uses `text-standard`. Inset rings are −2px, matching the draft and the menu rows.
- **Tooltip offset.** The shared tooltip defaults to `sideOffset` 4.
- **Type family.** `--type-family` (locally bundled Geist, followed by the system sans stack with `Apple SD Gothic Neo`) is the role the renderer reads; `--font-sans` is only a legacy alias.
- **Light only.** Main sets `nativeTheme.themeSource = "light"`; the main window is transparent with native sidebar material and an opaque reduced-transparency fallback. Main-window options are pinned by `app/src/main/index.test.ts`. The canvas iframe stays light under a dark macOS appearance by two routes: the renderer's `color-scheme: light` on the `<iframe>` element decides the canvas's `prefers-color-scheme` (dark on the element gives dark, light gives light, `normal` follows `nativeTheme`), and main pins `nativeTheme` light. With `nativeTheme.themeSource` forced dark, the app page matches dark while the sandbox iframe still matches light, also after the iframe is recreated. A probe must not use `page.emulateMedia` for this, because it overrides every frame, the canvas included. Not checked with an actual macOS appearance switch.

### Intended exceptions

- **Dimension label = tooltip capsule.** The canvas dimension label (`.dims`) is the same black prominent capsule as a tooltip.
- **Below 3:1 on purpose.** The non-text 3:1 target applies to `border-prominent`, focus rings and pins only. The decorative hairline (`border-standard` `#e8e8e8`, 1.23:1 on white) and fill-edged inputs (`surface-inset` `#f5f5f6`, 1.09:1 on white) follow the reference values.
- **Subtle buttons on inset bands (interim).** `--affordance-subtle` and `--surface-inset` are both `--neutral-2`, so a subtle button on an inset band loses its resting fill and reads as plain text until hover. Affected: the Review bar and banner (`.review-bar`, `.review-banner`), the status bands (`.ws-status`) and connection details (`.cn-details`: Copy, the default `.ob-chip` pill). The draft `shared-connection-rows` draws the same pairing. Changing a band's surface is a screen-layout decision: `buzz-comment` owns the Review bar and banner; `.ws-status` was assigned to `buzz-home`, which has shipped without changing it, so it has no owner now; `.cn-details` sits in the shared connection rows, which a screen child changes only after asking the user (buzz-restyle spec 10).
- **Hand off dialog scrolls itself.** In a short window the whole dialog scrolls instead of only its list.

### Shared components and surfaces

Reference: `.doan/canvases/buzz-ds.html` (component frames `buttons`, `icon-button`, `panel`, `tooltip`, `menu`, `popover`, `dialog-sizes`, `dialog-anatomy`, `toast`, `spinner`, `forms`, `focus-disabled`; shared-element frames `shared-project-setup`, `shared-add-projects`, `shared-first-prompt`, `shared-connection-rows`, `shared-error-details`).

**Measured values.**

| Part | Value |
|---|---|
| Buttons | 40px default and 32px `sm`, 34px capsule corner, label-sm 14/20 500. Dialog action rows use the default size, every other button `sm`, except FirstPrompt's Copy (default size, as drawn) and sidebar row actions (a compact local size). |
| Icon buttons | 32px (40px `md`), 18px corner, 10px in the window header (`chrome`). |
| Floating material | 24px corner (16px compact), 4px inset (2px), 90% white with an 8px blur; menu rows 32px (6px block insets around the 20px line, pinned in `ds/controls.test.ts`) with a 19px corner (13px compact). |
| Dialog | 28px corner, 32px padding, 16px between parts; compact 400px centred; standard 640px, wide 880px and expanded 1152px 128px from the top. |
| Spinner | 16px. |
| Text fields | 40px (32px `sm`), 20px corner, inset fill with a reserved 1px border that turns `border-prominent` on focus and `border-danger` when invalid. |
| Checkbox | 20px, 4px corner; the tick is a 5×10 content box inside 2px strokes (content-box sizing; Tailwind's preflight border-box would make it 3×8). |
| Status chip | 20px pill in the status roles. |
| `.doan-chip` | 12px caption size, 1.35 line height, 2px block and 6px inline padding; a branch chip measures 12px/16.2px Geist, 20.1953125px tall, with a 12×12px branch icon. Other `.doan-chip` uses have not been remeasured in the native app. |
| Settings group and row | `.doan-settings-group`: 1px `border-standard`, 24px corner, 16px side inset, rows split by its own hairlines, an inline-size container. `.doan-preference-row`: 12px block padding, 1fr / auto with a 16px column gap and no row gap, body-sm label over a caption description 2px apart. Measured in Settings (see Settings). |
| Switch | `.doan-switch` on `button[role="switch"]`: 36 × 20 track, 1px border, 2px padding; 14px thumb (`::before`) moved 16px when on; on is `affordance-prominent`; disabled is `affordance-disabled` with a transparent border, a `surface-panel` thumb and the default cursor. 36px and 14px are the switch's own constants. |

Notice icon: the 16px icon (or spinner) is centred on the notice's 20px first line by a 2px block margin; measured in Settings > Agents, the Notifications permission hint and first run's Agent step, its centre is on the first line's centre and within 0.03px of the cap-height centre, in development and production. A notice body has a top margin only under a title (`Onboarding.test.tsx`).

Further rules: an open disclosure (`aria-expanded` without `aria-haspopup`) is not drawn pressed; a focused button chip shows the ring only; the worktree menu keeps the 320px menu cap (320px wide at window widths 960 and 1238, inside the viewport); CLI and skill link paths in connection details stay on one line with the full path in `title`; form labels carry no label tracking; the FirstPrompt subject field is a block; a failure status block spaces its actions and opened detail with its own 8px gap. Unpinned: the checkbox tick, the open-disclosure rule, the worktree-menu cap and the one-line link paths.

**Documented differences.**

- Dialog action rows have 4px padding cancelled by a −4px margin and `justify-content: safe end`; the draft has neither. The padding keeps a 2px focus ring inside a scrolling dialog; `safe` keeps an action wider than the row reachable.
- `.doan-kbd` and the `sm` text field set the body-sm tracking (−0.035px at 14px); the draft inherits the body tracking (−0.07px), or the button's (0.035px) for a hint inside a button. `.doan-kbd` also caps itself at the container width.
- A chip hovers only when it is a button; the draft hovers a span chip.
- `.doan-popover` defines the material and width only; the draft's heading and paragraph type inside its sample is not implemented.
- The Add Projects checklist keeps `max-height: 50vh` instead of the draft's 248px, so a bounded list grows with the window and still scrolls natively.
- Only the Project Setup token path is one ellipsised line (`.value.token-path`); other field values wrap, because the wizard's Project value puts a name and a path in one value and must not hide either. The draft draws every value on one line.
- `.meta` stays `nowrap` in a dialog action row; a status block's action row keeps `align-items: center`; connection names keep `text-align: left`; `.cn-end` keeps `justify-content: flex-end`, which has no effect in its auto column.
- `.doan-chip` uses the 12px/1.35/2px/6px values above instead of the inherited 13px top-bar or 14px draft sizing.
- The subtle-button-on-inset-band pairing (Intended exceptions).

**Context, not component.** Panel sizes (the panel is definition-only), the expanded dialog's height (the draft draws a 440px mock window), `min-height` of a draft `div` versus a native `<dialog>`, the scroll sample box, inherited type on text-less icon buttons and on the menu surface, Project Setup at 544px in the anatomy column versus 640px in the app, the toast at 298px in a narrow draft tile versus 384px, and every shared-element row whose width, card padding or `err` class comes from a real parent.

**Not verified.** `canvas-marks` and `accent-places` are not design-sync frames by the draft's own description; their selector map is checked by `accentPlaces`, `contrastPairs` and `edgeStripes`. The pin focus ring and the comment card conflict block have no running check. Lucide icon stroke weight at 16px was not compared with the draft's inline icons. In `shared-error-details`, the Comments status block, its actions and the opened detail match.

**Known console warning.** Production logs a pre-existing Radix inline-style CSP warning with exact hash `nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo=` when the worktree menu invokes react-remove-scroll-bar; DEV logs none. No CSP permission was broadened for it. The menu stays operable; scroll-lock behaviour under it is not verified.

## App shell

Reference: `.doan/canvases/buzz-shell.html`, measured beside the implementation in Electron 45.0.0 / Chromium 156.0.8078.48 at content viewports 1238×780 and 960×600. This covers the header and sidebar (LNB), not Home, Overview, Inspector or comments content.

**Header.** Height 56px. History controls at x104/y12, 32px, with the documented header corner 10. The centred mode capsule is 371.2578125×40px at a 1238px window width; its actions are 32px high with 16px inline insets, Plus/Grid/Settings glyphs, subtle ink when inactive and standard ink with the panel shadow when selected; on the Settings page the Settings tab is the selected one, and while a page is locked every tab, the selected one included, is `aria-disabled` with `--text-disabled` ink. Finite capsule/button radii are geometrically equivalent to the draft's clamped pills. Settled Back is transparent; hover is the shared chrome 6%-black fill on Back and 10%-black on Search.

**Sidebar.** 260px wide, 8px top padding and 12px gap. Search at x16/y64, 244×36px, 10px inline inset, subtle ink. Projects heading at y112, 24px tall, 10/16 with 0.08em tracking. First project at y140. Project and canvas rows 32px with 10px inline insets and body-sm tracking. Project thumbnail 16×16px at x26, 600 weight, 16px line height (identity colours: Onboarding, 'Project thumbnails'). Project name 14/20/500, tracking −0.035px, standard ink; long names ellipsize. The 4px space below the project row and the badge/options geometry match the default specimen. The empty-project paragraph has 6/10/10/34px padding and a 16px line height.

**Project menu.** Actions use the shared 32px row; shared 12px inline insets, 14/20 text, 19px row corner and 24px/90%-white floating material. The chosen worktree has the neutral pressed fill independently of keyboard focus; leading icons use subtle ink. The path is 11/14 with 4px separation. A two-line worktree row is 50px (draft 51px) because the shared name typography stays 14/20. Menu heading and separator insets keep the shared values. At 960×600 a bottom long menu opens upward at (16,8), 512px high, with 767px of content in a 510px client area, and End reaches its final action; Escape restores trigger focus. Native overlay scrollbars can temporarily cover the trigger's outer edge.

**Retained differences.** Ordinary ellipsis icon buttons keep 18px corners; icon-button zero padding keeps 16px glyphs centred; Search keeps the shared outward focus ring (+2px) rather than the draft's −2px; project-name/canvas text wrappers keep live flex/intrinsic sizing; the tree and menu keep functional ARIA roles and ellipsis; menus keep the shared 24px/19px corners. The project identity palette follows the hashed-name rule, so differing fixture names are not colour regressions. The missing-project recovery strip (with Locate, Remove and Go Home) is preserved as ARCHITECTURE §7 requires; it differs from the draft's minimum-window notice (50px/12px height/radius versus 47px/0px, different actions), and that difference is not permission to remove the actions. A minimum no-strip capture is not equivalence evidence for the draft's missing-project state; fixture counts, whole-list positions and total menu height are not claimed to match.

**Native behaviour (measured).** Native input reaches the traffic-light minimize, fullscreen and close controls; main minimizes, enters fullscreen and hides without quitting, and fullscreen close/activate returns the same window. OS-level pointer drag moves the main window; dragging on the Projects control does not. Active and inactive native screenshots show sidebar material and inactive traffic lights. With Reduce transparency on, the native flag and the CSS media query are true and shell/body are rgb(241,241,242); off, both are transparent. At 960×600 the content stays bounded. The untouched unsigned arm64 package loaded the bundled Geist glyphs in main and Settings on a fresh offline launch, and in main on offline restart, with all HTTP(S) routed to an unavailable local proxy. Separately, a temporary package copy with an observation-only import before main startup recorded the first renderer and Geist file requests (200 completion) and zero HTTP(S) requests; that is not an untouched-package run.

**Regression pointers.** `app/src/main/index.test.ts` (main-window options). Natural canvas ordering and iframe-link Back/Forward completion have regression tests. Unpinned: rendered shell/menu values, the empty-project paragraph padding, and hover states.

## Onboarding

Reference: `.doan/canvases/buzz-onboarding.html`, 73 full-window frames at 1238 × 780 with the shipped chrome and stepper: Welcome, 40 Agent states and 32 Project states. Each frame's markup is the real components (`Welcome`, `SetupSteps`, `AgentStep`, `ProjectScreen`) rendered with controlled props, and the onboarding rules of `styles.css` are copied into the canvas verbatim next to the linked `tokens.css` and `ds/index.css`. Because the frames copy the code, they check the copy, not the design; the measured contracts below come from a `/design-sync` run against the approved tile draft. Welcome's Doany and vertical layout follow `.doan/canvases/doan-mascot.html` frame `mascot-welcome` instead; buzz-onboarding's Welcome frame has no Doany.

- Canvas-only parts: the wallpaper and glass behind Agent and Project (not a native measurement), schematic traffic lights, modals drawn in place over a scrim, and dialogs without `autofocus` so the canvas does not scroll on load. Announcements and focus moves are in the captions.
- Every frame is 1238 × 780 with no horizontal overflow; its `data-doan-id` values are unique. Every frame's markup placed in the running app's onboarding overlay (dialogs opened by `showModal()`) has no computed-style or box difference from the canvas, and Welcome's type and Get started match its frame. The scene scrolls at 780px in 33 frames, as in the app; their captions say so.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Overlay | Full window; Welcome on an opaque `--surface-panel`; Agent and Project transparent over the window's native sidebar vibrancy, with the rest of `#root` hidden while it is open; `--bg-app` under reduced transparency; 14/20 text with `font-variant-numeric: normal` | The shell's `tabular-nums` widened the stepper's "1" by 3px. |
| Welcome | Doany 142.5 × 142.5 at y 140.35; wordmark 104px / 1 / 500, letter-spacing −8px, at y 282.85; sentence heading token 24px / 1.1 / 400, letter-spacing −0.18px, two lines at y 410.85; Get started is the `lg` button: 173 × 48, 16/24, padding 12px 32px, 40 below the heading, at y 503.65 (window 1238 × 780) | Measured in the real app; every box equals `mascot-welcome`. |
| Welcome layout | The group (Doany to Get started, 411.3 high) is centred horizontally and 72 above the centre of the area under the chrome. `.ob-welcome-main` has 32 (`--space-8`) above and below and a `::after` spacer of at most 144 (twice the offset) after the group, so on a short window the offset shrinks first and the 32 insets go last. Measured at content heights 600 / 780 / 1240: area 544 / 724 / 1184, group top 32 / 84.35 / 314.35, centre −34.35 / −72 / −72, no scroll at any of them | The same rule as Home's `stageInsets`, in CSS because the group has a fixed height. 1240 was read in an emulated viewport (the display is shorter than the window). |
| Welcome Doany and focus | The shared Doany (see Home) at 142.5. On open the heading has focus: `showModal()` first focuses Doany, the dialog's first control, and `openOverlay` focuses the heading in the same task, so no frame shows Doany's ring (probe: Doany focusin 41.0 ms, heading 41.1 ms, no animation frame in between). From the heading Tab goes to Get started and Shift+Tab to Doany; Escape stays blocked; Enter on Doany hops once and does not start | Before `openOverlay`, Doany stayed focused and `:focus-visible` for ~42 ms until the scene effect's animation frame. |
| Atmosphere | Accent radial gradient `ellipse 50% 125% at 50% 112%`, opacity .85, `onboarding-grain.svg` alpha mask 180px repeated, no animation; fixed and behind the content (`z-index: −1`) | A grain mask, no motion. |
| Chrome and stepper | Chrome 56 (`--size-chrome`); capsule 190 × 40 centred, padding 4, gap 4, radius 24, `--affordance-backdrop-hover` with blur 24; steps are sm doan-buttons 32 high, regular weight; current is a subtle button with a white pill (`--surface-panel`, `--shadow-panel`); a done step is ghost `✓ Agent` | Drawn with the shared buttons, so it does not inherit `.shell-modes button`. |
| Scene | Max width 560, padding 40/24/48, centred; heading title token 32px / 1.1 / 500 with a 12px gap to its 14/20 subtle line and 32px to the content; footer Back (subtle) and Continue/next (prominent) 40 high with arrows, pushed to the bottom | |
| Scroll container | Every scene sits in `.ob-scroll.doan-scroll` under the chrome: the full window width (0–1238 at 1238), `overflow-y: auto`, `overscroll-behavior: contain`, `scrollbar-width: thin` with `--scrollbar-thumb-quiet`, so the scroll bar is at the window's right edge, not beside the column. `.ob-scene` grows as `flex: 1 0 auto` and does not scroll itself (no `native-scroll`). At 1238 × 600 (the minimum height) Agent scrolls 778/544 and Project 827/544 to the end with the footer in view. Welcome does not scroll (544/544 at 600, 724/724 at 780). Development and production builds read the same | Shared with the Add Projects page, whose white panel plays this role. |
| Card drop | The Project step's 'Open a local folder' card takes a folder drop like the Add Projects page (see there): the same `.drop-target` over the card and the same notices | A real folder dropped through Chromium's drag pipeline (CDP with a real path) is inspected; native Finder drag not checked. |
| Cloning line | Under the cloning progress and its Cancel: `.ob-fine` caption 12/16 `--text-metadata`, 20px above, "Stay on this page until the clone finishes, or cancel it." | Back and the step pill are already disabled while busy; the line says why. |
| Provider list and rows | Panel padding 0 16; rows min-height 72 (`--size-row`), padding 16 0, 1px `--border-standard` dividers; mark slot 32 with a 24px image; name 14/20 / 500; detail caption 12/16 `--text-metadata`; row button sm 32 | A notice, helper line or Antigravity paste line sits under the row inside the same item. The paste help line is subtle. |
| Notices | `doan-notice` on a panel: padding 12px 16px, `--surface-panel`, `--text-standard`, panel shadow, radius 16; error icon inherits the text colour; a spinner takes the icon slot; title 500 with a 4px gap to the body | Shared rule `.doan-notice.doan-panel` in `ds/surfaces.css`. |
| Project choose | Local option panel padding 24, gap 16, folder icon 40 on `--surface-inset` radius 12; divider caption with 1px rules and 24px margins; URL field 40 high; Find repository right-aligned | Invalid and edited URLs show their two-action state row. |
| Chosen and destination cards | Panel padding 16, min-height 72, gap 12; thumbnail 28 × 28, radius 7, 17px / 600; name 14/20 / 500; path caption `--text-metadata` | |
| Project thumbnails (shared with the sidebar) | `projectHue` over 8 identity colours; background is the colour 14% into `--surface-panel`; letter is the colour 65% into `--text-standard`; first code point of the trimmed name, upper-cased (`projectInitial`) | Also in `ShellSidebar` (16 × 16 there). |
| Repository access error | Heading, URL field, the error notice (title and body) and a full-width row: Choose local folder (subtle, left) and Retry (prominent, right), both 40 high; the local option and divider are hidden | Frame `repository-error`. |
| Choice cards | Selectable `doan-panel` cards with the chosen card's box: min-height 72, height 72, padding 16, gap 12, title 14/20 / 500, caption path, the chosen card's check when selected; cards 8px apart | Measured with injected markup: equal to the chosen card in both lists. |

### Behaviour and copy beyond the measured draft

Frame ids name the canvas frames that draw each state.

- **'Your projects'** (`project-your-projects`, `project-your-projects-selected`). When projects are registered, they are listed above 'Open a local folder' under the caption 'Your projects', as choice cards with the project thumbnail, followed by an sm Use this folder.
- **Choice cards instead of radio rows.** Used for 'Your projects' and for repositories found inside a picked folder (`project-repositories-in-folder`), both with the project thumbnail. A native radio still sits in each card, so the arrows and Space work, and Enter also picks. The card draws a 2px `--border-focus` outline, offset 2px, while its radio has keyboard focus.
- **No checkout choice on the URL path.** When a GitHub URL matches several local checkouts or worktrees, the app does not show 'Multiple local checkouts'. It picks one and shows it as the single 'Already on your Mac' card, with Choose another folder and Edit repository URL.
  - Pick order: a checkout that needs no setup; then the main checkout, whose `.git` is the common directory, read from the folder list's git facts without running git; then the most recently registered project.
  - If the picked checkout needs setup (`repository-found-setup`), the setup screen keeps the URL context: the 'Already on your Mac' heading, the read-only URL, Choose another folder (remote check) and Edit repository URL; Back returns to the editable URL.
  - Other worktrees are switched to later from the shell project card's Worktrees menu.
  - `onboarding project inspect` (CLI and MCP) still returns every candidate.
- **Clone destination default** (`repository-clone`): `<parent of the most recently registered project>/<repository>`, else `~/<repository>`. Change picks a parent.
- **Copy outside the measured draft** (`agent-install-page-failed`, `agent-paste-too-long`, `repository-cleanup-failed`):
  - Install failures read "Couldn’t open the <Provider> install page." Antigravity has no install page.
  - A paste over 16,384 characters shows "This address is too long to submit." in caption `--text-danger` under the field.
  - Main's fixed messages are shown for refusals without draft copy, for example a kept clone folder: "Couldn't remove <path>. Remove it, then try again."
- **Cancelled and failed clone** (`repository-cancelled`, `repository-clone-failed`). The cancelled clone adds an sm subtle Edit repository URL under its Choose local folder / Retry row. Back from a cancelled or failed clone returns to the editable URL and drops the old inspection; otherwise Back→Continue would bring the same clone screen back with no way to change the URL. "Cloning was cancelled" is a role=status notice panel (`doan-notice doan-panel ob-project-notice`, alert icon in the text ink), not plain help text.
- **Folder inspection progress** (`project-checking-folder`). Inspecting a picked or listed folder shows "Checking this folder" with the path (role=status). Nothing is written then; the 'Setting up your project' progress is kept for the select that writes.
- **Clone destination inside a Doan project** (`repository-inside-project`). Main refuses it as `path_unavailable`. When the destination sits under a registered project, the clone screen says "This location is inside the Doan project <name>. Choose a location outside it." with Change location (prominent). Otherwise the generic 'no longer available' notice stays, because the renderer cannot name an unregistered project.
- **Focus.** Edit repository URL and Back from a cancelled or failed clone move focus to the URL field.
- **Existing folder from the URL path** (`repository-mismatch`). Every folder action on the URL screens sends the folder together with the repository URL, so main checks its remote: Choose existing folder, Use existing folder, Choose another folder, and the notices' Choose folder / Choose another folder / Choose local folder recoveries. A mismatch stays on that screen with Edit repository URL (subtle) and Choose another folder. On both URL screens a mismatch reads "<folder name> belongs to a different repository.", so on the clone screen it is not read as the destination; without a known folder it keeps "This folder …".
- **A notice's actions are never repeated beside it.** When a Project notice offers an action, the screen hides its own copy of it, and Use existing folder counts as Choose existing folder:
  - 'No agent is ready' (`project-no-agent`) offers only Back to agents; the screen keeps its Choose another folder.
  - On the clone screen, the destination card's Change is hidden while a notice offers Change location (`repository-destination-exists`, `repository-inside-project`, `repository-clone-failed`). 'Already have this repository?' and its Choose existing folder are hidden when the notice offers Choose another folder or Use existing folder (`repository-mismatch`, `repository-destination-exists`). Edit repository URL stays unless the notice offers it too, as the mismatch does.
  - The same holds on the found and folder screens (a URL setup that failed keeps only Edit repository URL below its notice). Cleanup failed (`repository-cleanup-failed`) offers only Retry, so nothing is hidden there.
- **Subtle buttons on the Agent/Project glass.** A subtle button standing directly on the glass takes the step capsule's `--affordance-backdrop-hover` fill, because mid-window the glass is about the colour of `--affordance-subtle` (#f5f5f6) and the button looked unfilled. Buttons inside panels and dialogs, the Welcome surface, and the DS hover, pressed and disabled fills are unchanged. Checked only on the canvas glass in headless Chromium; the native vibrancy is not measured.

### Documented differences from `mascot-welcome`

- **Window, not a card.** The frame is a 1238 × 780 card (radius 12, panel shadow, `isolation: isolate`); the app's Welcome is the full-window modal `<dialog>` (`position: fixed`, radius 0, no shadow; the native window supplies its corners).
- **Chrome and scroll area are flex.** `.ob-chrome` centres the step capsule of the later scenes and `.ob-scroll` stretches the scene column; on Welcome the chrome is empty, 56 high in both, and every box inside the scroll area equals the frame's.
- **Atmosphere is fixed.** It fills the window behind the chrome rather than the frame; the same box at 1238 × 780. The gradient is the same; only the stop serialisation differs (the app writes 0% and 100%). The grain mask URL differs only in origin: `app/src/renderer/public/onboarding-grain.svg` is byte-identical to `.doan/assets/onboarding-grain.svg`, at 180 px repeated, `z-index` −1 in both.
- **Where the spacing lives.** The frame centres `.welcome-copy` (the group's own height) inside a full-width `.welcome-stage` with padding 32 / 32 / 176; the app's `.ob-scene` is the 640-wide Welcome column (padding 0 24) and `.ob-welcome-main` fills it with the 32 insets and the spacer. Every child box (Doany, wordmark, heading, action, button) is equal; the column never narrows the content (the minimum window is 960, the heading 281 wide).
- **Whitespace text.** The frame's markup has whitespace between the group's children, so its `textContent` reads "Doan A place…"; the app's has none. Whitespace-only text in a flex container is not rendered.
- **Wordmark `text-align`.** The frame's `.welcome-copy` sets `center`, which the wordmark inherits; the app's inherits `start`; the wordmark is a shrink-to-fit block centred by `align-items: center`, so its box (x, width) is the same.
- **Position from the available height.** The frame shifts the group with a fixed 176 bottom padding (32 + 144) and scrolls short windows by it; the app keeps the 72 offset at any height, shrinks it on short windows and never scrolls Welcome down to empty space (see 'Welcome layout').

### Limits and regression pointers

- Markup runs prove the CSS against chosen props only. They do not prove that `ProjectStepSession` reaches those states (its unit tests do), and they do not show live focus. Notice spacing inside Project screens was checked only on the repository-error frame.
- Not measured: the native vibrancy material itself, reduced transparency and forced colours (DOM screenshots show the transparent overlay as white); hover and focus rings of the onboarding controls; dark mode; real sign-in, the real paste and stop dialogs as modals (measured as open dialogs in a column); the choice cards in the real flow. The Project step was reached in the real app only with a forged ready-agent snapshot (scroll container, card drop, cloning line against a local git server).
- Welcome's centring and focus order were measured in the built app; `Onboarding.test.tsx` pins the Welcome CSS ('Welcome centres its group 72px high…'), the markup order (atmosphere, Doany, wordmark) and `openOverlay` focusing the heading right after `showModal()` (red before the fix), and `onboardingView.test.ts` the DOM-order Tab rule. The test pins the helper's order only; that the heading ref is set before the dialog's ref (children's refs attach first) is shown by the probe. The overlay always opens on Welcome (`initialScene(false)`).
- Regression tests (`app/src/renderer/Onboarding.test.tsx`, `ds/controls.test.ts`, `ShellSidebar.test.tsx`) pin the stepper markup and capsule rule, the overlay's `font-variant-numeric: normal` (fails when the declaration is removed) and the paste help ink; the `lg`, notice-on-panel and thumbnail rules; and the markup of every Project phase.

## Home

Reference: `.doan/canvases/buzz-home.html` (30 frames); Doany and the stage's vertical layout follow `.doan/canvases/doan-mascot.html` frame `mascot-home`. Home is the workspace's shell (header, sidebar, white body panel) with the conversation composer as its body; it has no project cards, setup checklist or connection banner.

### Measured contracts

Window 1238 × 780 (the draft's), 960 × 600 for `home-narrow`.

| Element | Measured contract | Reason |
|---|---|---|
| Body | White `--surface-panel` panel, `--radius-container`, panel shadow; the stage is a centred column: Doany, greeting (title token, medium), 40 px, composer, suggestions; padding 32 at the sides and bottom, top inset from `stageInsets` (below) | Every box of the group equals `mascot-home` at 1238 × 780. |
| Stage position | The group's centre is 64 above the panel's centre at any height; on a short panel the offset shrinks first, then 32 (`--space-8`) stays above and below and only real overflow scrolls. Placed by the reference group height: an empty two-line field with suggestions shown (473.2 with three suggestions on two rows). Measured at content heights 600 / 780 / 1240: panel 536 / 716 / 1176, group top 32 / 57.4 / 287.4, centre +0.6 (offset 0, 1.2 px overflow) / −64 / −64, scroll range 1 / 0 / 0; horizontal centre 0 on the panel's client width (scroll bar excluded) | `HomeStage` measures the panel and the reference height with a `ResizeObserver` and sets only the top inset; 1240 was read in an emulated viewport (the display is shorter than the window). |
| Composer stays put | Typing does not move the composer card or the textarea: after the first character, five lines and clearing, both tops stay (780: card 286.59, textarea 302.59; the same at 600 and 1240). A preset or attachment chip keeps the card's top and moves the textarea down inside the card by the chip row (302.59 → 350.59). Suggestions hidden by typing keep their place (`inert`, `visibility: hidden`) and leave the accessibility tree | The reference height leaves out what a draft adds (chips, counter, extra lines) and what sits below the suggestions (reason line, notices), which grow downward. |
| Doany | `button.doany` "Make Doany hop", 114 × 114 drawing slot (`flex: none`), the stage's first child, directly above the greeting; the still PNG with 20% padding until both textures load, then the WebGL canvas fills the slot (`min(1024, ceil(width × min(dpr, 2)))`, 228 at dpr 2); keyboard focus ring 2 px `--border-focus`, offset 2, radius `--radius-container` (24) | Equal to the draft, its ring included. At a hop's apex the topmost drawn row is 17 of 228 device px below the slot's top, so the beret is not clipped. |
| Atmosphere | `radial-gradient(ellipse 78% 64% at 50% 60%)` of `--affordance-accent` at 24% → 15% (32%) → 6% (62%) → transparent; no grain, no motion; `.6` opacity under reduced transparency, none under forced colors | Home-only exception to the Welcome-only gradient. |
| Contrast over the gradient | Greeting ink rgb(15,15,15) on rendered background rgb(246,238,252)–rgb(250,245,254): worst 16.94:1. Placeholder `--text-metadata` rgb(95,95,95) on the white card: 6.39:1 | Both above 4.5:1, read from rendered pixels with the ink hidden. |
| Composer | Width min(680, 100%); tray `--surface-inset` with panel shadow; card `--surface-panel`, padding 16 / 12 / 12 / 16, gap 8, ring `--border-standard`, `--border-prominent` while focused; text label 16/24, 2 lines minimum, 8 lines (192 px) then scrolls inside | |
| Tool row | Ghost icon buttons 32 px (Attach, Presets) in `--text-standard`; model and effort triggers sm `trigger` (8 px inline, no fill at rest); 16 px logo; model chevron 16 px; effort gauge and chevron 14 px; Send `accent` icon button | |
| Tray | `--size-control` min height, padding 4 / 16, caption type in `--text-subtle`; worktree trigger with 14 px branch and chevron icons; path in `--text-metadata`, ellipsized | One worktree shows the branch as read-only text instead of the trigger. |
| Chips | Attachment chip `--surface-inset`, `--radius-chip`, padding 4, 32 px preview (`--size-control-sm`), name 500 and caption meta; preset chip `--size-control` high, padding 0 4 0 12, `--surface-accent-subtle` / `--text-accent-subtle`; every × is the shared icon button `xs` in `--text-metadata` | The preset chip's × is metadata gray because that is how the confirmed draft renders. |
| Menus | Shared `doan-floating doan-menu`; rows 32 px with 16 px icons (the check keeps the shared 12 × 16); agent picker 300, effort 200, project 320, worktree 244 (`shell-project-menu`); preset popover 600 with a sm search field (16 px glyph), header-capsule group tabs and 276 px list; status lines (loading, no match) body-sm 14/20 | Icons are sized explicitly because Lucide draws 24 px unless sized; the portalled popover would otherwise inherit the page's 13 px body. |
| Suggestions | sm `quiet` buttons, shared sm padding 16 / 16, regular weight, 14 px accent group icon, wrap centred with 8 px gaps under the composer | The draft's own `.suggestion` padding never applied (the shared sm rule outweighs it). |
| Hover | quiet: backdrop fill plus one inset backdrop layer (rgba(0,0,0,.06) twice); trigger rgba(0,0,0,.06); ghost and xs icon buttons rgb(241,241,242); accent Send rgb(144,51,217) | In the workspace the strip's prominent (rgb(25,25,25)), subtle and ghost (rgb(241,241,242)) hovers keep the shared values. |
| Send | Accent fill rgb(151,59,225), hover rgb(144,51,217); disabled while empty, blocked or sending, with the shared disabled fill rgb(232,232,232) and a spinner while a start is pending | The draft's `home-sending` renders the disabled fill too, and the rendered draft is the confirmed one. |
| Reason and notices | Reason line caption, `--text-subtle`, centred, 12 px above; refusal and attachment notices `doan-notice error doan-panel` | An empty composer shows no reason line even while a Home conversation runs in its project; the line appears once something is typed. |
| Drop target | Whole composer covered by `--surface-panel` 55% with `--blur-sm`, 2 px dashed `--affordance-accent` outline inset 2 px | |
| Conversation strip | `doan-notice doan-panel` 64 px high at the top of the workspace body, 12 px from the panel's top and left; 20 px provider logo, spinner, alert or check; title 500, body `--text-subtle` ellipsized; sm actions (Allow prominent, other choices and Edit on Home subtle, Stop and Dismiss ghost) | Left and top positions match the draft. |
| Sidebar slot | 16 × 16 at the row's right before its menu: `hand` icon in `--affordance-accent`, 14 px spinner, or an 8 px accent dot | |
| Toast | Right and bottom 16 px from the window on Home and over a workspace, 384 px wide, message and prominent sm action on one row | The shared toast. |

### Documented differences

- **Status chips in menus.** The draft's project and worktree menus use `.ob-chip`, which the canvas does not style, so its chips render as plain gray text. The implementation uses the shipped status chip (Missing `warn`, Not set up neutral).
- **Pickers while sending.** The implementation disables every picker and chip × while a start is pending (the draft leaves the project and worktree triggers enabled-looking): a changed target cannot apply to a start already sent.
- **No projects.** Model lists are read per project root, so with no project the picker shows "Default" and no effort capsule (the draft shows "Opus 5.5 · High").
- **Strip width.** The Feedback panel takes 280 px, so the strip is 650 px wide (the draft omits the right panel: 930 px).
- **Menu placement.** Menus open from their own trigger (Radix, `align` start or end, 4 or 8 px offset). The draft places the agent and effort menus at one fixed spot 40 px inside the tool row's right edge, so the agent picker sits 85 px further left in the app (right edge at its trigger) while the effort menu is within 4 px; the project and worktree menus are within 8 px. The composer, card and tray positions match the draft at both window sizes.
- **Trigger pressed.** A Radix menu trigger opens on pointerdown, so a pressed trigger shows the open fill (`--affordance-backdrop-hover`); the pressed fill applies only without a menu.
- **Stage position (doan-mascot).** The draft centres the stage with `justify-content: center` and a fixed bottom padding of 160 (32 + 128), so at 780 its group top is 57.4 like the app's; elsewhere its offset is fixed and a short panel scrolls by 128 px of empty padding. The app sets a computed top inset and a 32 bottom padding instead (see 'Stage position').
- **Kept suggestion space.** The draft's demo removes the suggestions while typing; the app keeps their place so typing does not move the group.
- **Stage children shrink.** The draft gives the stage's children `flex-shrink: 0`; the app's stage has an automatic height (`min-height: 100%`), so they never shrink: the group is 473.2 high at 600, 780 and 1240.
- **Doany is `type="button"`.** Not in the draft; it keeps Doany from submitting a form.
- **Still image `max-width: 100%`.** The app's base styles cap images at their container; the still is `width: 100%` already, so its box (114 square with 20% padding, 142.5 on Welcome) equals the draft's, measured with it shown on both sides.
- **Context, not deviations.** Container type (the canvas body is 14/20, the app body 13 px), the draft's placeholder drawn as text, caret-mock line heights, the draft's fixed sample text, highlighted first menu rows, spinner boxes while rotating, and the sidebar row's inherited ink.

### Roles and names

Read on `home-empty`, equal to the draft's attributes: `region` "Home"; `button` "Make Doany hop" (its still image has `alt=""` and the canvas is `aria-hidden`); `button` "Project: doan-design"; `textbox` "Message"; `button` "Attach files", "Design presets", "Agent: Claude Code, model Opus 5.5", "Effort: High", "Send", "Worktree: main"; `group` "Suggested prompts" with one `button` per sentence. With text typed the suggestions are not in the tree. Other states were not read.

### Agent picker actions

Reference: `buzz-settings.html` `home-agent-picker`, measured with the Settings windows (see Settings). A group that cannot run keeps its short status in the head and offers one `menuitem` under it: "Sign in again…" (expired), "Update…" (old version) or "Open Agents settings…"; the menu ends with "Manage agents…" (Settings icon), or with "No agent is ready to run." over "Sign in to an agent…" when nothing can run. Choosing one closes the menu before Settings opens; focus lands on that provider's row group, which flashes 2.4 s (real-app probe). The menu itself is the shipped one: it inherits the app body type, and a pointer on an item shows the shared `.doan-menu-item:focus-visible` ring in the probe (the draft draws the highlight only).

### Approved copy beyond the draft

- The preset list's CLI reasons ("the doan CLI couldn’t start", "the doan CLI didn’t answer in time", "Doan couldn’t read the CLI’s answer", "the doan CLI stopped without a result") and its general failure "Doan couldn’t read the design presets. You can still send without one."
- A stop the person did not make: "This conversation stopped before it finished."
- Effort labels "Extra high", sentence-case levels and "Default" when none is chosen.
- Attachment refusals "<name> wasn’t found, so it wasn’t attached.", "<name> isn’t a file, so it wasn’t attached.", "<name> isn’t a readable image, so it wasn’t attached.", "<name> couldn’t be read, so it wasn’t attached." and main's limit refusal "Only 10 files can be attached."

### Terms shared with onboarding

- **Agent:** Home says "agent" for a provider ("Choose another agent", "No agent is ready to run.", trigger name "Agent: Claude Code, model …"), as the onboarding Agent step does ("Connect your agent", "Sign in to at least one agent to continue."). Provider names come from the same `PROVIDER_NAMES`.
- **Sign-in:** Home's "Sign-in expired" and "its sign-in has expired" use the onboarding noun. Home offers "Sign in again…" in the agent picker, which opens Settings > Agents at that provider, where the row's "Sign in again" acts.
- **Unverified:** onboarding shows "Connected · not checked" with Retry; Home, without an action, says "Checks your connection when you send." Same state, different wording because only onboarding can act there.
- **Settings:** Settings > Agents checks an unverified connection with Check (`subtle`), not first run's Retry, shows the account then "· not checked", and says the cost under Copilot's row ("Checking uses one Copilot request.") where first run puts "Uses one Copilot request" beside the button. Every connected row keeps Sign out. A sign-in owned elsewhere says "Finish this sign-in where it started."
- **Product name:** human-facing text says Doan; only commands, paths and identifiers such as "the doan CLI" stay lowercase.

### Limits

- Strip, sidebar slots and each project's last request live in renderer memory: a renderer reload loses them and lifts the one-Home-conversation-per-project rule. After an app restart the backend folds unfinished turns to crashed, so nothing is left to show.
- A start can wait for its runner (Antigravity's first download included) and has no cancel while pending.
- A pasted image stays under `<userData>/attachments/` until the next start when it was not sent.
- After a permission answer focus goes to Stop. When a turn ends while Stop holds focus (a Copilot Deny was seen to end it in about 300 ms; a stop or a send's arrival focus can do the same), Stop goes away and focus moves to Dismiss instead of falling to the page. Focus the person moved elsewhere stays there; the strip is keyed by its conversation, so another project's strip starts fresh.
- Not verified: preset list loading, CLI timeout and refused; the older-CLI tile (unit tests only); agent board rows for a provider below its minimum and for an unverified provider; attachment checking, pasted image, more than 10 files, over 50 MB and folder-drop notices (they share the measured notice); strip starting, done and not_logged_in tiles; a slot on a bound canvas row; reasons 'project unhealthy', 'agent can't run' and 'checking'; reduced transparency and forced colors (not drawn in the draft).

### Doany motion in the app

Checked in the built, packaged and development (`StrictMode`) apps with a probe that records each frame's uniforms (`.scratch/runtime-test/doan-mascot/probe.mjs`, local):

- Loading: the still PNG with no `data-state`, then the canvas and `idle` (packaged: textures from `app.asar` file URLs).
- A click, Enter or Space hops once: one beret impulse of about −0.81 (one `hatV -= .9`), and Enter or Space dispatches no button click. A held key restarts the hop on each repeat, as the draft does. Typing gives `attentive`.
- A Send, submit key or notice Retry that starts a send hops once; a disabled Send or an empty submit key neither hops nor starts.
- Reduced motion: `reduced-motion`, a click neither hops nor draws, the field still takes input, and switching it off returns to `idle`.
- Behind the first-run Welcome, Home's Doany draws no frame and its canvas pixels do not change.
- 24 Home visits leave no "Too many active WebGL contexts" warning, and the last Doany still draws; a control that leaks 20 contexts does print it.
- Not verified in the app: pointer gaze and the idle blink timing (the draft's values are pinned by `doanyMotion.test.ts`), a lost context or failed texture (unit tests only), reduced transparency and forced colours.

### Regression pointers

`stageInsets.test.ts` (offsets, shrinking, no empty scroll), `Home.test.tsx` 'Doany (114px) is the stage's first child…' and 'typing keeps the suggestions' place…', `HomeComposerView.interaction.test.tsx` (Doany hops only when a send starts; typing draws its gaze), `Doany.test.tsx`, `doanyMotion.test.ts` and `doanyRig.test.ts` (the draft's motion, WebGL calls and release order). `Home.test.tsx` 'Home CSS keeps the draft's measured icon sizes…' (chevrons, menu icons, popover status type, chip ×), `homeComposer.test.ts` 'an empty composer has no reason line…', `ConversationStripView.test.tsx` 'when the turn ends while Stop has focus, focus moves from the vanished Stop to Dismiss' and 'a person whose focus was elsewhere … keeps it', and `conversationStrip.test.ts` `focusAfterStop`.

## Add Projects page

Reference: `.doan/canvases/buzz-add-projects.html`, 11 full-window frames at 1238 × 780 (choose, drop, checking, candidates, setup, selecting, url-inspecting, repository-found, clone, cloning, clone-cancelled) and four tiles (errors, drop notices, first run's drop and cloning line, Home's folder-drop notice). Measured by `/design-sync` in the built app against the draft read in the app's canvas iframe; every body-panel element is paired by its structural path, and the header and sidebar parts by selector. All 11 frames and the tiles were reached for real (held CLI reads, a local git server for clones, CDP drags with real paths). The page renders first run's Project screen (Onboarding), so its parts' contracts are the Onboarding ones.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Panel | The Home white panel (`.home-panel`), 954 × 716 at 1238 × 780, is the scroll container: `overflow-x: hidden`, `overflow-y: auto`, `overscroll-behavior: contain`, `.doan-scroll` (`scrollbar-width: thin`, `--scrollbar-thumb-quiet`). The overlay scroll bar sits at the panel's right edge and drags the page. Body text 14/20 with `font-variant-numeric: normal` | The shared Project screen is sized for first run's overlay text; without it the panel passes on the app body's 13px/normal and tabular numerals. |
| Column | `.ob-scene.add-scene`, 560 wide, centred, padding 40/24/48, at least the panel's height; the footer (Cancel left, the step's action right) sits at the bottom and scrolls with the page. With 22 repositories the panel scrolls to the last card and Use this folder, 48px above the panel's bottom | POSTMORTEM 2026-10-25 'A static draft's overflow match hid an unusable checklist'. |
| Card drop | Over 'Open a local folder': `.drop-target` absolutely over the card (`inset: 0`, z-index 2, the card's 24px radius), `--surface-panel` at 55% with an 8px blur, a 2px dashed `--affordance-accent` outline at −2px; a visually hidden `role="status"` "Drop to add this folder" | Home's composer drop target, reused. |
| Drop notices | Under the card: the error notice on a panel ("Drop one folder at a time.", "Only folders can be added."), never focused | |
| Lock ink | While selecting or cloning: header Add Projects and Projects tabs, Back, Search, sidebar rows and the project menu's Overview and worktree items take `--text-disabled` with the default cursor and no hover fill; the current tab keeps its white pill. Show in Finder, Project Settings, Remove from Doan, Settings and the row disclosure stay usable. A locked menu item under keyboard focus has no fill and keeps the 2px `--border-focus` focus outline | Design '잠금'. |
| Cloning line | As in Onboarding | |
| Development build | Panel, column, body text, card and drop target read the same under `electron-vite dev` as in the production build | POSTMORTEM 2026-10-25 'Production CSS extraction concealed missing development styles'. |

### Documented deviations from the draft

- **Heading level.** The page title is the shared `h2` (first run's), focused on entry and naming the panel; the draft draws `h1`.
- **Locked Back** is `aria-disabled` with the default cursor, not `disabled`, so it keeps its place in the focus order like the other locked controls; the draft draws `disabled`.
- **Footer rule.** `.add-footer` has no rule of its own; `.ob-footer` already pushes it down with `margin-top: auto`.
- **Column growth.** The panel is a flex column and the shared `.ob-scene` grows in it (`flex: 1 0 auto`, `position: relative`) instead of the draft's block panel with `min-height: 100%`; the measured boxes are equal.
- **Sidebar.** The page reuses the shipped Home sidebar: canvas names take `--text-subtle` (the draft drew them standard) and icon-only header buttons inherit the app body's 13px/normal.
- **Choose another folder under a local setup** is on the page only (the page's footer can only leave); first run keeps its shipped setup panel. Where a setup error's recovery already offers it, it is not repeated.

### Behaviour beyond the measured draft

- The inline clone Cancel is disabled until main answers the clone, at most its 1 s quick-reply window (shared first-run code); the draft draws it enabled. Measured after it enabled.
- Text and links (`text/uri-list` with `text/plain`) dragged into the URL field, the Home composer and a comment field still drop. The app does not prevent a drag that carries only `text/uri-list`; in CDP drags it inserted nothing into the URL field or the composer, which is Chromium's editor default. A file dragged over the page heading, off the card, gets `dropEffect: none` and dropping it does nothing; other places were not measured.
- While locked, sidebar rows are `disabled` in the accessibility tree although their disclosure still expands and collapses.

### Not verified

- Native Finder drag onto the card and a native drag cancel (CDP drags with real paths were used; CDP's `dragCancel` sends no `dragleave`, so probes leave the window first).
- Hover and pressed states of the page's own buttons and cards; reduced transparency and forced colours; dark mode.

### Regression pointers

`app/src/renderer/AddProjectsPage.test.tsx` pins the panel's body text and sideways clip, the page-only Choose another folder (absent in first run, not repeated beside a recovery), the lock ink and the card's drop target rules; `Onboarding.test.tsx` pins the shared scroll container.

## Projects home

> buzz-ds 이전. Owner on the mark: `buzz-home`, which has shipped without remeasuring these surfaces, so no child owns the mark now. Home itself has no project cards, checklist or banner (see Home); this section covers the project surfaces that remain: the removal toast with Undo and the workspace status line. Replaced: the Add Projects checklist (`.add-dialog`), its set-up confirmation and the window drop overlay are now the Add Projects page (see Add Projects page).

Reference: `.doan/canvases/projects-home.html` (eight frames).

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Removal toast | The shared toast with Undo | |
| Status line (`.ws-status`) | Padding 7px 12px; gap 10; nested path code measured separately; action gap 10 | Keeps recovery actions aligned with Go Home. |
| Config error details | Expanded details sit below the action line in a separate `.ws-detail` surface: padding 8px 12px 10px, 1px bottom divider. Go Home stays vertically centred with the other actions. The nested action group centres its buttons so Show in Finder keeps its natural height (21px measured; 22px in a later isolated window with the then-current stylesheet) instead of stretching | Unpinned. |

### Behaviour and copy

- **`~/…` paths.** Recovery text and the worktree menu abbreviate paths under the HOME value supplied by main as `~/…`. Matching is boundary-aware; other roots remain absolute, and full-path tooltips keep the original path. Main prefers its process HOME, with Electron's home path as fallback, so isolated development runs do not use the machine user's home.
- **Recovery copy and Locate.** Locate on a loaded workspace keeps that workspace visible while main replaces its root; the renderer waits for the located root's list before opening its canvas. The canvas recovery copy is “The project <name> is missing. Use Locate… to find it.” or “The project <name> is not set up. Use Set Up… on Home.”
- **Problem rows.** Main's error strings stay plain text, including any paths, instead of the draft's embedded code chip. Details keeps the expanded/collapsed arrow (▸/▾). CLI error rows expose only Retry/Remove.
- **Problem-entry data.** Error/loading entries keep `lastCommon` for grouping but not the last branch, so they show path + ◌, and the workspace hides its branch chip while its entry is not a successful list. No branch cache is added.
- **Unsaved-comment context** is `<card name> (<branch>) › <canvas without .doan/canvases/>`; non-Git projects omit the parentheses.

### Not verified and unpinned

- Not verified: very long project/branch/canvas/selection values; minimum-window overflow; disabled problem entries in the worktree menu; all guard variants; long toast; absolute-time tooltip.
- Known note: Locate into a non-list root can keep the previous missing-project message in the canvas area while the status line shows the new root state.
- Unpinned: the toast's timer pause and Undo, native menu Undo, and the Show in Finder alignment.

## Design navigation

> buzz-ds 이전 (Overview; Quick Open is measured on the design system). Owner: `buzz-project`, which removes the mark.

Reference: `.doan/canvases/design-nav.html` (frames `workspace-tree`, `tree-rows`, `overview`, `overview-empty`, `quick-open`, `frame-highlight`, `toasts`) and, for Quick Open, `.doan/canvases/buzz-search.html`.

### Overview

Order: cards sort by display name (PRODUCT §5 item 3, Design navigation).

| Element | Measured contract | Reason |
|---|---|---|
| Overview | Covers the canvas cell (`grid-column: 2`, last row) over the still laid-out canvas area; padding 4px 24px 24px; scrolls (`overflow: auto`, the thin native scrollbar) | Opening a canvas fits it to the area's size immediately, so the area never leaves layout; the area beneath is `inert` while covered. |
| Sections | Heading = folder path, case kept, 11.5px, padding 16px 0 10px, with a count | Paths are identifiers; an uppercase section style would change them. |
| Cards | Three-column grid, gap 12; card radius 10, 1px border, hover fill; thumb 16:10 with a 1px bottom line; body padding 9px 12px 10px, gap 2; pointer cursor | 215px wide in a 1238px window. |
| Card text | Title 600 12.5px; file 11px; meta 11px with 4px top margin and an accented open count; title and file truncate, meta never | The title is the primary name. |
| Thumbnail states | Making: plain fill; no `doan:width`: 11.5px message "Preview needs a valid doan:width — run doan check" with a code chip; unreadable (`error` row): `thumb-msg warn` "Can't read this canvas — run doan check" and no frame count; image: `object-fit: cover` from the top | The first screen of the canvas is what the card previews. |
| Notice band | First child of `.ov`: the shared `.canvas-notice` (padding 7px 12px, 11px), margin −4px −24px 0 so it spans the Overview's padding, `role="status"` | The same band at a move and at relaunch (Revision continuity). |
| Empty Overview | Empty type (15px / 600 title, 12.5px hint) with the FirstPrompt composer | |
| FirstPrompt | Card 520px (max 100%) in the zero-canvas centre, radius 10; prompt padding 14, gap 10; input 12.5px, padding 7px 10px, radius 6; sentence 12.5px / 21.25px, padding 10px 12px, radius 6, slot `…`; count 10.5px; error 11.5px; waiting line 11.5px with a 12px spinner (2px border). An invalid focused field has a `border-danger` border and no outline, which stays after blur; valid focus is `border-prominent`; the disabled primary is `text-disabled` on `affordance-disabled` | The invalid/valid/disabled values are measured on the design system. |

- **FirstPrompt copy and roles:** the button reads "Copy again" for a subject edited while waiting; `textbox` "What do you want to design?"; `button` Copy (disabled while empty or invalid); waiting is a `status`. An arrival while the whole app is hidden with ⌘H (native `hide:`) shows no toast while hidden; the toast shows once the app is shown again, and the canvas does not open by itself (unpinned).
- **Card tooltips:** the path under `.doan/canvases/` is the file name's tooltip and the absolute time is the time's tooltip (`ChangedTime`), so no tooltip nests inside another tooltip's trigger. Relative times read "Yesterday", "Oct 12", not the draft's sample "1d ago". An Overview title truncates with the full value in `title`.
- **Card names:** each card is a `button` named by title then file name through `aria-labelledby` ("Design tokens tokens.html"; "Billing & plans billing.html"); `aria-describedby` supplies the thumbnail message and facts (read as "5 frames · Just now"; the no-width description was read before the current message and not reread). The image is ignored (empty `alt`).
- Roles: `region` "Overview"; each folder section a `region` named by its path ("design"); the canvas area under the Overview is ignored (`inert`); toasts are a polite `status` holding the message.
- **Toast for a canvas gone at relaunch:** the saved state has only the canvas path, so the message uses the file name without `.html` ("billing is no longer in .doan/canvases/").
- **Thumbnail visibility** travels in both directions, including when the Overview unmounts; main keeps visibility updates received during asynchronous cache reads.
- **Navigation recovery:** unreadable width is reported without guessing a parser error; an explicit Open distinguishes unavailable projects from absent canvases; the Missing/Not set up recovery text stays when no canvas is open.
- **Context sizes:** the draft's hover tile is a 418px two-column specimen against the 215px grid card; the frame-less hint specimen has a border on both sides (238px inner versus 239px).
- Not verified: the "Preview unavailable" state (it uses the measured `.thumb-msg`); long-name truncation and tooltips; the "1 frame" and "1,000+ frames" variants (unit-tested text); the other two toast messages; computed styles of the error card against its draft frame. Unpinned (no current test): restore across relaunch (canvas, view and tree expansion; a frame selected before quit, with the Inspector and `doan active` set, comes back with neither and is absent from `ui-state.json`; Home, a gone canvas, a gone project, a broken `ui-state.json`), visible cards captured first, focus moving to the next card, and Quick Open from the menu on Home and in a workspace. One normal restart once restored project, title and path but showed Couldn't load in the canvas; neither cause nor fix is established.

### Quick Open

One search palette over Home or a workspace that keeps its size whatever the results; the dialog itself never scrolls and the list gives way to the window. Reference frames of `buzz-search.html`: `results`, `results-frames`, `empty-query-home`, `empty-query-workspace`, `empty-query-frames`, `no-match`, `no-match-frames`, `reading`, `unavailable`, `no-canvases`; measured at 1238×780.

| Part | Measured contract |
|---|---|
| Dialog | The shared `.doan-dialog` with `data-ui-presentation="search"`: a modal `<dialog>` in the top layer, 640px wide, centred by margins (299px each side in a 1238px window), 128px from the top; padding 12, radius 32 (`--radius-panel` + 4) with `corner-shape: squircle` (computed `superellipse(2)` in Electron 45), `--surface-panel`, 1px `--border-standard`, `--shadow-sm`, gap 0; backdrop `--bg-scrim`. |
| Field | `.doan-input` 40px, `--surface-inset`, `--border-prominent` while focused, radius 20, a 16px magnifier 12px in, text from 36px. |
| Tabs | 8px below the field: Home's group-tab capsule (40px), 14px icons, gap 6. |
| Results box | 8px below the tabs: fixed height `min(55dvh, 576px, room)` with a minimum of `min(400px, room)` (429px in a 780px window, 334px at 600px), 8px top fade, `overflow-x: visible; overflow-y: clip`; list padding 4/4/12 with a −4px inline margin. |
| Groups | 24px apart plus the list's 1px gap (25px); no gap between rows inside a group; title min 28, body-sm 400 `--text-metadata`, 16px project thumbnail (`projectHue(name)`), gap 8. |
| Rows | Min 44 (64 with two lines), padding 12, radius 20 with `corner-shape: squircle`, gap 8, active `--affordance-selected`; a 24px icon slot holding a 21px icon; name body-sm 500, detail body-sm `--text-subtle`; matched letters a 1px underline 2px below, no fill. Long names, paths and group titles end in an ellipsis on one line; name and detail carry the full text in `title`. |
| Empty and waiting text | body-sm `--text-subtle`, centred in the list, 16px inline padding. |

- In a 600px window the list shrinks to 334px and the dialog does not scroll. With 50 results the wheel reaches the end and the last row shows above the 12px bottom padding. Dragging the list's scrollbar scrolls it while the dialog's `mousedown` handler keeps focus in the input.
- The development build (`electron-vite dev`) equals the production build on row `min-height`, the input's height and fill, the `mark` underline, the `corner-shape` values and the list height.
- Add Projects' surface (640×304 at 128px, padding 32, radius 28, `corner-shape` `superellipse(1)`, white, 1px border, `--shadow-sm`, backdrop) is unchanged by the search presentation.

Deliberate departures from Buzz: no key hint line, no `esc` chip, no exit motion, and no close on a titlebar click (outside clicks close, except on the header strip). Matched characters are underlined without changing the option's accessible name.

Documented differences from the draft:

- **Results box clips the block axis only.** The draft's `.qo-height { overflow: clip }` cuts the 4px of the list that its −4px inline margin places outside the box, including 4px of the scrollbar; `overflow-x: visible; overflow-y: clip` keeps the top fade and the fixed height without clipping the scrollbar. Pinned by a CSS check in `QuickOpenDialog.test.tsx`.
- **Rows use `corner-shape: squircle`** like the dialog (the draft's value).
- **No gap between rows inside a group** (the draft's value); the list's `gap: 1px` separates groups only.
- Context: containers without text inherit the app body's 13px/normal where the draft page is body-sm 14/20 (every text part matches); `max-height` resolves `100dvh` against the canvas iframe in the draft; the draft hand-picks the thumbnail hue.

Behaviour:

- A result in another project and the highlighted row of the second group open with Enter; Enter on a frame of the open canvas jumps to it.
- Tab clicks, the dialog padding, a group title and the empty message keep focus in the input; ←/→ move on the tabs, ↓ returns to the input, and there are two Tab stops.
- The highlighted row survives Tab and a recompute caused by a new canvas, and falls back to the first row when its result disappears; ↑ wraps to the end and ↓ returns to the first row with the list at its top.
- A primary backdrop click below the header closes Quick Open and returns focus to the opener; press-inside/release-outside, press-outside/release-inside and a secondary click do not. Escape returns focus to the opener. Synthetic composing keys are ignored.
- The header strip's no-drag controls sit under the modal's backdrop, so a click on them reaches the dialog; Quick Open measures the strip (`.top`) at click time and never closes for a press or release inside it. A click or drag on the strip leaves Quick Open open and the drag moves the window. Pinned in `quickOpen.test.ts` and `QuickOpenDialog.test.tsx`.

Copy:

- An empty list says "No canvases or frames match" on All, "No canvases match" on Canvases and "No frames match" on Frames. When a kind tab hides every match, the count and place of the others follow: "No frames match. 1 canvas matches in All.", "No canvases match. 2 frames match in All.", with "50+" above 50. With no query and no frames in scope, Frames says "No frames to show". The reading and unavailable messages come first on every tab.
- Unavailable project: "Project is unavailable. Fix it from its menu in the sidebar." in the list, "Project is unavailable. Fix it from its menu in the sidebar, then try again." when a picked canvas can't open, and "Canvas changed while opening. Choose it again from the sidebar or Quick Open." ("sidebar" lowercase).

Roles: `dialog` "Quick Open", `modal`; `combobox` "Search canvases and frames" (`aria-activedescendant` = the highlighted option, also after ↓ crosses a group); `tablist` "Result types" with `tab` "All", "Canvases" and "Frames"; `listbox` "Results" holding one `group` per project, named by its title ("acme-web · main", "brand-kit"), with no heading; results `option` "Card declined — Billing & plans › 4 · acme-web · main", the active one `selected`; the empty or waiting message a polite `status` (from the markup and render tests).

Not verified: the Cmd+K keystroke through AppKit (probes use the Go > Quick Open… menu item, whose accelerator it is); a native IME; classic (non-overlay) scrollbars after the results-box fix.

## Canvas area and right panel

> buzz-ds 이전. The App shell measurements cover only the header and sidebar; these canvas-area and right-panel values were not remeasured. No owner child is recorded for them.

Reference: `.doan/canvases/app-shell.html` (frames `main`, `empty`, `canvas-states`, `sidebar-states`). All values are unpinned.

| Element | Measured contract | Reason |
|---|---|---|
| Line-height boundary | `body { line-height: normal }` cuts off Tailwind preflight's inherited `1.5` line height; explicit component line heights still apply, including status and hint text | Removing it adds vertical space from the inherited reset. |
| Canvas status | 12.5px / 1.6; message maximum width 260 (wraps within 260px, measured on the design system); outer padding 18 | Keeps long error instructions readable and centred. |
| Loading | The spinner is hidden from accessibility; the status text stays `Loading…` | |
| Missing width | The no-width heading is emphasized (`.canvas-status b`) and the full message is unchanged | |
| Panel header / empty text | Header padding 11px 14px 10px (`.phead`); empty text 12.5px with padding 14 (`.pempty`) | The Canvas panel's vertical rhythm. |
| Activity | 11px; row gap 8; time width 54; padding 3px 12px 3px 0 | Event labels align independently of their time text. |
| Zoom output | Minimum width 48 with 1px left/right dividers | Separates the value from the actions. |

## Select and inspect

> buzz-ds 이전. Owner: `buzz-canvas` (canvas) and `buzz-inspector` (Inspector; it removes the mark).

Reference: `.doan/canvases/select-inspect.html`, frames `hover`, `element-selected`, `frame-selected`, `inspector-states`, `long-values`, `interactive-element`, `selection-lost`. The no-selection screen is excluded.

| Element | Measured contract | Reason |
|---|---|---|
| Hover / selection outline | 1px; dashed / solid | Distinguishes hover from selection without relying on colour. |
| Dimensions | The tooltip capsule (Intended exceptions) | Legible independently of canvas scale. |
| Inspector head | Padding 12; gap 6; 1px bottom divider; tag 12.5px / 600 | |
| Selector / head metadata | 11.5px; metadata columns 52px / remaining width (`52px 195px` in the live panel), gaps 5px 8px | Frame Title and Implements are paired; Implements shows e.g. `src/screens/sign-in.tsx` with the same full title. |
| Ancestor buttons | 11px; padding 3px 5px; radius 4; wrap gap 4 (`flex-wrap: wrap`); `max-width: 100%`, hidden overflow, nowrap, ellipsis, full identifier in `title` | Long paths stay reachable without horizontal scrolling. |
| Interactive hint | 11.5px / 17.25px | Explains Option-click behaviour for buttons, inputs and links. |
| Inspector sections | Padding 10px 12px 12px; 1px bottom divider | Box, Typography, Colors, Effects, Doan attributes. |
| Property row | 11.5px; bottom margin 7 except the final row; columns 78px / remaining width (`78px 169px`); gap 8; minimum height 16 | |
| Source line | Left margin 86; top margin 3; wrapping gap 4 | Provenance beneath the value. |
| Token | 10.5px; padding 2px 5px; radius 4; the common truncating token (ellipsis, full title) everywhere, including the input Border token the draft leaves untruncated | |
| Source state | 10px / 15px; Hardcoded in the warning role | Provenance in text. |
| Default value | Native title `Default`, no source line | The absence of an author declaration is visible. |
| Color swatch | 12 × 12; 1px border; radius 3 | |
| Selection-lost / unlisted notice | Padding 7px 12px; 11px | |
| Pending values | `Reading styles…` in the notice styling while the selected element's values are pending; old computed rows are absent | |

- The live panel is 280px wide with one 1px left divider (279px of content); the draft specimen leaves 278px. Panel height follows the window (740px at 1238 × 780).
- An explicit `margin: 0` is Hardcoded rather than Default and adds a 15px source line plus 3px top margin.
- Copy and value rules: the Unknown title is “doan can't tell where this value comes from”; combined token names are listed in side order; Width/Height have no source line; colours are shown as hex; shadows show Chrome's computed serialization.
- Not verified: native title-tooltip painting; loading/error appearance (no draft); focused appearance against a draft; accessibility beyond the element-selected inspector/ancestor controls. Four inherited children were not paired: `element-family`, `states-text`, `long-family` and `input-family` (`.state:not(.hardcoded)`).

## Comments

> buzz-ds 이전. Owner: `buzz-comment`.

Reference: `.doan/canvases/comments-ui.html` and `.doan/canvases/comments-readability.html` (frames `target-labels`, `composer-small`, `warnings`, `identity-blocks`, `empty-lists`, `dialogs`, `panel-details`). Presentation lives in `CommentsPanel.tsx`, dialog wiring in `useComments.tsx` and `App.tsx`, panel split in `App.tsx`, Inspector in `RightPanel.tsx`, pins in `CommentPins.ts`.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Right column | 280px outer width; 279px content after the shared divider | |
| Inspector / Comments viewports | 278px / 462px outer heights in the 1238 × 780 window; Inspector clientHeight 277 | The Inspector bottom divider belongs to its 278px allocation. |
| Independent scrolling | Wheel input scrolls only the panel under the pointer | |
| Comments title | `h3.comments-title`, a sticky (`top: 0`) direct child of the panel, padding 12px 12px 10px, 12px / 700 | |
| Scope/status segments | Padding 3px, gap 4px, radius 7px, 1px border; buttons 11.5px with 5px 7px padding | |
| Actions | 11px / 500 / normal line-height; 4px 7px padding; 1px border; radius 7px; inline-flex, 6px gap, centred, nowrap; primary actions weight 600 | Message line-height must not inflate recovery actions. |
| Author | Avatar 26 × 26, radius 50%, 10px / 600; author row gap 8px; name 11.5px / 600; email/time 10px / 15px | |
| Body / target / badge | Body 12px / 19.2px, `pre-wrap`; target 10.5px / 15.75px, one line with an ellipsis; badge 10px / 15px, 1px 5px padding, radius 4px | |
| Composer | Padding 12px; target starts 8px below the label text; textarea minimum height 104px (64px in a panel under 360px), padding 9px, radius 6px, 12px / 19.2px | The label wraps target and textarea for native association. |
| Recovery messages | Full panel content width, excluding a reserved native scrollbar (279px outer, 268px client when the scrollbar reserves 11px); padding 12px; body 11.5px / 18.4px; heading 12px / 700; empty action groups omitted | The header and message share the content edges. |
| Message severity | Errors use the error form (Doan adjustments); unknown/conflict/quarantined recovery use warning; checking, confirmed absence, reviewed and saved states are neutral | A successful status check is not labelled a warning. |
| Unsaved and delete dialogs | Shared compact dialogs; the delete preview keeps body line breaks (`pre-wrap`) | |
| Pins | 24 × 24 screen-space at 64%, 80% and 100% canvas zoom; fill violet 9 with a black 1px rim; z-index 2, focused 3; a focused pin paints below the canvas notice and the zoom controls | |
| Long values | `min-width: 0`, `max-width: 100%`, inherited `overflow-wrap: anywhere` keep long author/target/body values inside the column | |

### Targets, panel composition and focus

Measured at 960 × 600 and 1238 × 780 with three comments on one target, equal to the draft:

| Element | 960 × 600 | 1238 × 780 |
|---|---|---|
| Panel after the editor opens | clientHeight 282, scrollTop 114 | clientHeight 462, scrollTop 0 |
| Title, “To:”, input, Save tops in the panel client rect | 0, 70, 93.8, 165.8 px, all inside | 0, 184, 207.8, 319.8 px, all inside |
| Scope / status filters after scrolling up | Inside (tops 37, 76) | Same |
| Input minimum height | 64px | 104px |

- “To:” line: a `span`, `nowrap`, ellipsis, e.g. “To: Element · label “Address” · in Shipping”.
- Locatable target: `button.locatable`, title “Show on canvas\n<selector>”, underline on hover. Location unavailable or canvas target: a `span` with title = selector / “Canvas”. Frame and canvas targets carry a `title` (the frame selector, “Canvas”).
- Badge note: “Not found in the current canvas.”
- Updated label (the bottom label): padding 3px 8px, radius 6px.
- Card action rows: one row, 23px (not remeasured since Hand off… was added to open cards).
- Pin aria: “3 open comments” (“1 open comment”, unit tests only). Focus after Cancel returns to the “Comment on selection” button that opened the editor; pin Enter focuses the first `article.comments-card`.
- Canvas info has no COMMENTS section: Path, ID, Width, Frames, then the guidance sentence, then Activity.
- The editor sits below `.comments-head` (after the id-change notice when one shows), above warnings and the list. Warnings are one grouped block. An identity problem leaves only the title, the id-change notice when one applies, and its block; an editor that was already open stays, blocked. Copy and order are pinned by unit tests.
- When creation fails, rows and actions stay readable and the creation error shows below New comment. Delete's Escape keeps the selection and Inspector and returns focus to Comments.
- “Couldn’t read comments” keeps Retry and puts the raw message behind Details (`p.detail`).
- The panel uses relative dates and preserves invalid calendar strings. The loading message keeps the status heading without repeating the canvas name already in the shell.
- Canvas targets have no location action, missing targets cannot be located, and missing identity/width or pending work disables the relevant controls.

### Not verified

Transient Saving, Checking saved status, original-request retry, confirmed-saved notice, failed status check, Git lookup pending/failure/name-found notice, copy-sentence preview, large or overlapping pin counts, native tooltip painting, OS-native IME; pin Enter focus after an asynchronous filter change; reaching the filters by wheel input; a cut “To:” text in a real window; native window focus. Unpinned (no current test): heading weights (panel and modal), action layout, editor target gap, full-width editor recovery, focused pin ring, recovery-action line-height, empty editor-action gap, neutral confirmed-absence message, loading heading hierarchy, the card-conflict warning rule, and the 00e–00h identity, target-line, warnings and read-failure steps.

## Revision continuity

> buzz-ds 이전. Owner: `buzz-canvas`.

Reference: `.doan/canvases/revision-continuity.html` (frames `continue-draft`, `selection-gone`, `duplicate-id`; `moved` and `no-document` only for their Activity row and target line). Target lines use the Comments format; the target-text rows were not remeasured after that format.

| Element | Measured contract | Reason |
|---|---|---|
| Continue on current version | The editor's primary slot (sibling index 1 after Cancel): `.comments-btn.primary`, 11px / 600, padding 4px 7px, radius 7; "Starting…" and every blocked state disabled | It replaces Save comment in place, so the editor keeps one primary action. |
| Continue on canvas | Between Cancel and the primary (index 1, primary index 2): the secondary `.comments-btn`, 11px / 500, 1px border | A secondary choice that never competes with the primary. |
| Helper lines | Notice (`role="status"`), "Continues on …" or the disabled reason, and the failure (`role="alert"`) in that order below the tools: `.comments-helper`, 10.5px / 15.75px, margin 8px 0 | The tools stay in the same place in every blocked state. |
| Disabled reason | The disabled primary's `aria-describedby` resolves to the reason line for loading, no width, load failed, not a listed canvas and selection gone | |
| Failure text | "Couldn’t continue on the current version: doan CLI error. Your text is kept." for main's `error: "doan CLI error."` (trailing period folded) | Exactly the draft copy. |
| Overview notice | See Design navigation, 'Notice band' | |
| Duplicate-id toast | The shared toast, `role="status"`; at relaunch it takes the restore toast's place | No new toast variant. |
| Activity Moved row | `.tl-row` (11px, gap 8); "Moved" in the event style (400); "· from <file name>", `nowrap` with ellipsis, title = the file name; every Moved row is titled | A long previous name truncates without pushing the time or the event word. |
| No-document target line | With no rendered document (no width, load failed, not a listed canvas) the card's target line is a `.comments-target` `<span>`: block, 10.5px / 1.5, full card width, no Show on canvas action, `title` = the element target's selector (none for a frame or canvas target). A located document keeps the button | Pinned by `CommentsPanel.test.tsx`. |

- Roles: both continue buttons are `button`s named by their text; Starting… is a disabled `button`; the notice, the Overview band and both toasts are polite atomic `status`es; the failure is an assertive `alert`; after a continue the textarea "New comment body" is focused (offset 0, the composer ring); the no-document target is a `generic` whose description is the selector `title`.
- Continue stays disabled with the loading reason while a reload has not laid out; a comment begun before such a reload is blocked as reloaded when the reload starts, then shows the load-failed reason if the load fails. A comment begun during the wait is blocked when the load fails (unit tests only).
- During a reload pins disappear for 2–3 frames and redraw after the new layout (by design). In the five measured runs (per-frame trace), 0 frames had an empty Selection list and 0 showed “Location unavailable”; the iframe's minimum during a reload was 150px, always recovering.
- Unpinned (no current test): continue, selection gone, forced failure, reload that never lays out, move, duplicate id, restart, no-width location and target line, blank in-canvas click, root switch after a move, and the per-frame reload trace.
- Not verified: the "Finding your selection in the current version…" reason (same element as the measured reasons); the long-target and long duplicate-id toast tiles; hover and keyboard focus rings of the new buttons; the Sidebar's DOM focus following a moved row (unit tests only); the nested-iframe blur path; OS IME while clicking Continue (simulated in unit tests); screen-reader output beyond the accessibility tree.

## Comments Review

> buzz-ds 이전. Owner: `buzz-comment`.

Reference: `.doan/canvases/revision-recheck.html`, frames `review-notice`, `review-bar`, `review-done`.

| Element | Implementation (equal to the draft unless noted) |
|---|---|
| Notice and Done summary (`.review-banner`) | Panel child under the head and the error / canvas-ID blocks; flex, gap 8px, padding 6px 12px, 1px bottom divider, 11.5px; 36px with a 23px button, 35px with only the 22px ×. Banners and bar are 279px wide, content 255px. |
| Notice text | `flex: 1`, `min-width: 0`, `nowrap`, ellipsis, `title` = the full sentence, so the text is cut before the button shrinks; the count is a `<b>` at 600. “3 resolved since your last review”, or “3 resolved” on a canvas this device never reviewed. “1,284 resolved since your last review” measures 198.06px beside a 48.94px Review, as in the draft's long-count tile. |
| Notice Review | Secondary `.comments-btn` (11px / 500, padding 4px 7px, radius 7px, 23px). Disabled while a draft is open, with the reason “Finish or cancel your comment to start Review.” as `.review-help` (10.5px / 15.75px, padding 0 12px 6px, divider) linked by `aria-describedby`. |
| Review bar (`.review-bar`) | `position: sticky`, `top: 37px` (right under the 37px sticky Comments title), `z-index: 1`, padding 10px 12px 12px, 1px bottom divider. The scope and status rows are not rendered while it is open; the head keeps its tools. |
| Step row | Flex, gap 8px, margin-bottom 6px; the step is an `<output role="status">` at 11.5px / 600, `flex: 1`; × is 22 × 22, radius 6px, 13px, transparent, named “Close Review”. |
| Target, excerpt, resolution | The shared `.comments-target` line (10.5px / 15.75px, ellipsis, margin-bottom 2px here); the excerpt clamps to two lines (`-webkit-line-clamp: 2`, 12px / 19.2px, `pre-wrap`, margin 4px 0 6px); “Resolved by codex · 5 minutes ago” at 10.5px / 15.75px in a `<time>` whose `title` is the absolute time. |
| Flags | `.review-flag` 11px / 16.5px, margin-top 6px: “Reopened”, “Reopened by <name>”, “Deleted”; “Not found in the current canvas” as a warning. Fold ignores an agent's reopen, so “Reopened by <name>” names a person. |
| Actions and navigation | Actions row (Reopen, Edit and reopen…) flex-wrap, gap 6px, margin-top 10px; nav row gap 6px, margin-top 8px, Previous (disabled on the first step) left and the primary Next / Done pushed right by `margin-left: auto`. A step reopened elsewhere or deleted keeps only Next / Done. |
| × buttons | Both `flex: none`, 22 × 22; the summary's is named “Close summary”. |

- **× does not shrink** (draft: `flex-shrink: 1`): a summary with Hand off… and long counts (“Reviewed 1,284 · Reopened 312”) would otherwise squeeze × before the text ellipsizes, against the draft's own rule that the text gives way first.
- **Hand off…** shows in the Done summary when this Review reopened comments that are still open; focus goes to it after Done, otherwise to ×. That layout was not measured against the draft.
- **Banner place with a draft open:** the composer stays directly under the head, so the disabled notice and its reason follow it; while the draft is still starting (no composer yet) the notice is already disabled and sits under the head.
- Roles and focus: the bar is a `region` named “Review”; the step and the Done summary are polite `status`es; the notice's Review is a `button` named “Review” whose description, when disabled, is the reason. Focus goes to Next (or Done) after each step change and to the notice's Review button after Esc.
- Project comment counts (`comments:project` IPC) were measured on the former Home rows, from the row being visible to “resolved to review”, under load: 182–397 ms for 20 canvases and 1,000 comments, 371–385 ms for 200 canvases and 2,000 comments, within the 500 ms criterion. One external resolve causes two `comments:project` calls on the Overview (invalidation and the `ls` row change), each about 95–130 ms.
- Unpinned (no current test): off-screen locate for open and resolved cards with filters kept; CLI resolves, the notice and Review Next/Reopen/Done; Escape progress and the Go menu items; hide/show and quit/relaunch with the person's own resolve excluded; resolution lines and order; status lines and focus after a human Resolve/Reopen; Save and reopen with `doan comments`; Comment on selection instead; Opened/Changed/Reloaded bottom labels.
- Regression pointers: `CommentsSession.review.test.ts`, `ReviewBar.test.tsx` (including the 1 of 1 tile with no Previous), the “Review on the open canvas” block of `useComments.test.tsx`, the Escape handler tests in `CanvasController.test.ts`, main's `menuState` tests and the App routing test (Go menu items).
- Not verified: the “Not found” flag recomputed after a later anchor answer (it is decided once when Review moves to the step); hover and keyboard-focus appearance; the native ⌘] / ⌘[ accelerators; the real order of the card-press `pointerdown` that ends a remembered card, and body focus when a pressed button disables. The status line (“Resolved — moved to Resolved.” and the others) is inserted as a `role="status"` element with its text already inside and has no live-region ancestor, a pattern screen readers often do not announce; VoiceOver was not tried.

## Hand off dialog

> buzz-ds 이전. Owner: `buzz-comment`. The dialog uses the standard shared dialog size (Design system, 'Shared dialog sizes').

Reference: `.doan/canvases/agent-handoff.html`, frames `dialog`, `dialog-states`, `copy-states`.

| Element | Implementation (equal to the draft unless noted) |
|---|---|
| Dialog (`dialog.comments-dialog.handoff-dialog`) | A flex column only while `[open]` (a closed `<dialog>` keeps the UA's `display: none`), `overflow: hidden`, capped at the window height − 32px. |
| Title and context | “Hand off to your agent”, margin-bottom 10px; context line 11.5px, margin-bottom 12px, one line with ellipsis: `acme-web › ⎇ main › Checkout`, `acme-web › ⎇ feat-checkout › Checkout`, and for a detached worktree the folder name, `acme-web › acme-web-review › Checkout` (the top bar shows `⎇ detached <sha>` there). |
| Quick select | `.handoff-quick` flex, gap 6px, margin-bottom 8px; All / None / Selection are secondary `.comments-btn`s (23px). Selection is disabled with `title` “Select an element or frame on the canvas first.” or “No open comments on Element · button pay-button · in Payment.”; with a target selected it is enabled and checks the comments on it. |
| List | `.handoff-list` 1px border, radius 7px, min 44px, max 352px (eight rows); more rows scroll inside it while the title and buttons stay. A card's Hand off… scrolls its checked row into view with `scrollIntoView({ block: "nearest" })`. |
| Rows | Label rows 44px, padding 0 10px, gap 10px, divider except the last, cursor pointer; checkbox 14 × 14 with the accent `accent-color`; target line 10.5px / 15.75px and first body line 12px / 18px, both one line with ellipsis and the full text in `title`. While locked (copying, copied) the text is dimmed beside the disabled checkbox. |
| Instruction | `details.handoff-instruction` margin-top 10px, 11.5px, “Show instruction”; the open preview is 11.5px / 18.4px, 1px border, radius 6px, padding 10px, `pre-wrap`, `user-select: text`, capped at 160px with its own scroll. Not rendered while nothing is checked. The copied clipboard text equals the preview text. |
| Worktree notice | `p.handoff-notice` margin-top 10px, padding 8px 10px, 11.5px / 18.4px; static text, no tab stop. |
| Status line | `p.handoff-status` above the buttons, margin-top 12px, padding 8px 10px, 11.5px / 18.4px. Failure and refusal are assertive `alert`s, copied a polite `status`. |
| Button row | `.handoff-actions` flex, gap 6px, margin-top 16px; a spacer or the helper “Choose at least one comment.” (10.5px, `flex: 1`) first, then Cancel and the primary: “Copy N” (disabled at 0), “Copying…” (both disabled), “Retry copy”, or after success only “Done”. |

- Roles and focus: a modal `dialog` named “Hand off to your agent”; each checkbox's name is its target and first line; disabled Selection's description is its `title`. Opening focuses Copy N; Escape closes and returns focus to the Hand off… that opened it; after success Done has focus and closing it returns to Hand off…. While Copy is disabled during copying, and after a failure or a refusal, focus is on the dialog itself (Return then presses the primary button; Escape still closes). Escape while copying closes the dialog, and a copy that then succeeds still shows “Handed off 1 · <time>” beside the head's Hand off….
- Handed off stays after a new comment and a partial resolve and clears when all are resolved; resolved cards have no Hand off…. Unpinned (no current test), along with the dialog rows, Copy N, None/All and preview, real-key Tab order, clipboard failure and Retry copy, the refusal after a CLI resolve, Review Done's Hand off…, and the worktree notice with no tab stop.
- The singular refusal “1 comment is no longer open and was removed from the list. Review and copy again.” extends the draft's plural copy.
- Observed limit: opening the dialog within about 30 ms of a canvas selection, before the anchors answer, fixes Selection as disabled for that dialog (PRODUCT §5 item 6 known limits).
- Regression pointers: `CommentsSession.handoff.test.ts`, `HandOffDialog.test.tsx`, the Hand off cases in `CommentsPanel.test.tsx` and the “Hand off dialog” block of `useComments.test.tsx`.
- Not verified: hover states; a window short enough for the height cap to shrink the list below eight rows; Retry copy succeeding after a failure in a real window (unit tests); real OS IME composition (simulated in unit tests); screen-reader output beyond the accessibility tree; the dialog at the standard shared size against the draft.

## Feedback panel

> buzz-ds 이전. Owner: `buzz-comment`.

Reference: `.doan/canvases/project-feedback.html`, frames `feedback-panel`, `feedback-states`, `orphan-cards` and the `id-change-notice` line.

| Element | Implementation (equal to the draft unless noted) |
|---|---|
| Panel (`section.feedback`, `role="region"` “Feedback”) | Takes the right column on the Overview only (`.right-stack > .feedback { flex: 1 }`), 279px wide after the column's divider, flex column with its own scroll, `overflow-wrap: anywhere`. Canvas info's “No canvas open” remains on the screens without an Overview. |
| Title and filter | `h2.phead` “Feedback” (12px / 600, padding 11px 14px 10px, 1px divider, 37px, `tabindex=-1`); `.fb-filter` padding 10px 12px 2px with a divider around the Comments segment (255 × 31). The segment reads “Open N” / “Resolved N”, and only “Open” / “Resolved” while reading or after a whole failure. |
| Tree (`.fb-tree`, `role="tree"` “Feedback”) | Padding 4px 0 8px. Group heads are the 26px tree row (12.5px, padding 0 12px; level 2 at 26px), counts 10.5px, accented for Open above 0. “<id> (not in canvas)” is dimmed. |
| Canvas head (`.fb-canvas`) | Grid `12px 12px 1fr auto`, column gap 8px, row gap 2px, padding 5px 12px, 12.5px; the file name (11px, one line) only when another listed canvas has the same title; “N resolved to review” as an 11px bordered button (padding 1px 7px, radius 6px, margin-top 2px) under the title. 47px with the button, 62px with file name and button, 26px with neither. A failed canvas keeps an empty count cell. |
| Comment row (`.fb-item`) | Grid, padding 5px 12px 6px 60px, 45.75px; target 10.5px / 15.75px, first body line 12px / 18px, both one line with ellipsis and the full selector in `title`; `targetLabel` cuts an element's text at 40 characters. Keyboard focus is the inset list ring, also on canvas heads and the review button. |
| Messages in the tree | Reading “Reading comments…” is a polite `status`; whole failure “Couldn’t read comments” + Retry an assertive `alert` (panel width, padding 12px). Inside a group the block is inset (margin 2px 12px 6px 26px, padding 8px 10px, no divider) and has Details ▸ beside Retry with the raw message behind it (PRODUCT §5 'Row read errors'). The Git name block opens the orphan section at margin-left 12px. A card's own save message keeps the Comments card message (padding 12px, divider); inside the tree a tree-scoped selector gives it margin-left 26px and padding-top 8px (unpinned). A refused orphan save whose project read fails says “These comments are no longer without a canvas, or the project could not be read fully.” |
| Orphan notes and cards | `.fb-note` margin 2px 12px 8px, padding 8px 10px, 11.5px / 18.4px. Cards are the Comments card (279px, padding 12px, top divider in the tree) with a plain target line, Resolve / Reopen and Delete only, no buttons when read-only. The non-kebab line `.fb-count` is 11px / 16.5px, padding 0 12px 8px 46px, its counts at 400. |
| Id-change notice | First banner under the Comments head: `.comments-message.warning.notice` (padding 12px), the sentence then a Show `.comments-btn` with margin-left 6px and padding 1px 7px. |
| Delete dialog | The shared “Delete this comment?” compact dialog. |

- Roles and keys: heads and rows are `treeitem`s with `aria-level` and, for groups, `aria-expanded`; a canvas head is named by its title plus its file name when shown (“Checkout 2026-10-checkout-revamp.html”); a comment row by its target and first line. ↓/↑ move, Home/End go to the first and last row, → expands a collapsed group, ← collapses or goes to the parent; Tab from a canvas head reaches its review button.
- Actions: a comment row click opens its canvas with Canvas scope and the row's status, selects the target and focuses the card, leaving the review marker file unchanged. “N resolved to review” opens Review on its first step once the canvas's anchors answer. Delete › Cancel returns focus to Delete. After an orphan Resolve the file group leaves the Open view, its status line stays under the section head (or above the tree when no orphan group is left) and focus moves to the next row. Show on the id-change notice opens the Overview and focuses the old id's file group.
- **Git name:** Feedback has no Git name read of its own (the author read needs a canvas path), so the block appears when an orphan write is refused for a missing Git name, and its Retry resubmits that same request; Resolve, Reopen and Delete stay disabled until the retried write succeeds.
- **Zero-count head:** a canvas head shown in Open only for its review entry is collapsed and cannot be expanded.
- **Focus request lifetimes.** A Feedback row's or review entry's request, and Show's, end without moving focus once the person acts again: another selection, a filter they pick, focus moved to another element, any press after the request began (even on a blank area that leaves focus on `<body>`), a composer or dialog, another canvas. The press that starts a request (the row or Show click) lands before it exists and does not end it, nor does a double click's second press: the wait listens to `mousedown` and skips `detail > 1`, because Chromium's `pointerdown` reports `detail` 0 in Electron 45. A row's request waits for the anchors measured for the canvas's current comments read, not an answer to the list a previous visit left. After 5 s (`ARRIVAL_MS`, `REVEAL_MS`), or when a read after the one Show first saw fails (a failure kept from an earlier visit waits for the next read), the request ends with focus on the panel title only if focus is still on `<body>` or where Show left it.
- **Orphan card focus** is kept through `<body>` only while its own change runs: the write, then, if it was saved, until a read without the card. Electron 45 can deliver an invoke's reply before a `comments:invalidated` main sent earlier, so a read sent before the write can land after `busy` ends still showing the card. A pointer press outside the card forgets it, as for Comments cards.
- **Read cost and frequency** (50 canvases × 3 frames, 5,000 comments): cold main read and fold median 279.7 ms, max 406.8 ms; Feedback first render cold 391–397 ms with “Reading comments…” first, warm max 149.8 ms, Open↔Resolved switch max 107.9 ms (criterion: under 1 s). During repeated saves of one canvas file the renderer starts at most one read per second; that criterion is judged on the renderer's read start times, the clock the scheduler keeps.
- Regression pointers: `FeedbackPanel.test.tsx`, `FeedbackPanel.focus.test.tsx` (card focus, Show), `feedbackGroups.test.ts` (`feedbackTree`, `feedbackKey`, stable frame keys), `OrphanSession.test.ts`, the Feedback, id-change and orphan blocks of `useComments.test.tsx`, `CanvasController.test.ts` (“id change”, “feedback navigation callbacks”) and `RightPanel.test.tsx`.
- Not verified: the “Save status is unknown” and recovery-blocked card messages (shared `SaveMessage` and card classes); the Git name block on an orphan write; a group's read-failure Retry that then succeeds; the row hover tint on group heads; the count-only group for `doan:canvas` meta repeated in one file; the orphan card's focus lifetime across the IPC reorder (unit tests only; it cannot be provoked deterministically); screen-reader output beyond the accessibility tree.

## Settings

Reference: `.doan/canvases/buzz-settings.html`, the ten windows `agents`, `agents-signing-in`, `notifications`, `notifications-off`, `connections`, `connections-locked`, `about`, `project-settings`, `project-problem` and `home-agent-picker`, plus the `states-project` Add to serve? confirmation. Measured by computed style beside the built app in Electron 45.0.0 at 1238 × 780 (`.scratch/design-sync/buzz-settings/measure.mjs`); the draft side is read with `ds/` and tokens as of the draft's commit, because the canvas links `ds/index.css` and the app's later rules would otherwise style the draft. Development and production builds give the same values for the panel, column, title, group, row, switch and notice (131 of 131).

Settings is a page of the main window, like Add Projects: the shell's header and sidebar around Home's white panel.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Header tab | Settings is the capsule's third tab; on the page it is the current white pill with standard ink (the App shell values) | |
| Sidebar | 'Settings' heading in the Projects heading's place, then four 244 × 32 rows (Agents, Notifications, Connections, About) 2px apart with 10px insets, a 16px Lucide icon in `--text-subtle` and body-sm label; the current row takes the pressed fill rgba(0,0,0,.1) with standard ink and icon; Search stays | The shipped sidebar with its project tree replaced. |
| Panel | Home's panel, the scroll container (`.doan-scroll`, thin); 14/20 body-sm with its tracking and plain numerals | Like the Add Projects panel. |
| Column | max 768px (48rem), centred, padding 32 / 24 / 24 | Buzz's settings reading column. |
| Header | 17px inline inset (the group's 16px plus its border, so text lines up with row text); title heading 24 / 26.4 / 500; lead caption 12 / 16 `--text-subtle`, 8px below; 32px to the first section; an action slot on the right (Check Again, Copy details), hidden while empty | |
| Sections | 32px apart; title label-sm 14 / 20 / 500 with the same 17px inset, 12px above its group; a section description caption 2px under its title | |
| Group | 1px `--border-standard`, 24px corner, 16px side inset, rows split by its own hairlines | Shared `.doan-settings-group`. |
| Row | Padding 12px 0; columns 1fr / auto with a 16px column gap and no row gap; label body-sm 14 / 20 `--text-standard`; description caption 12 / 16 `--text-subtle` 2px below; a provider row leads with a 20px logo; a disabled row (`data-disabled`) dims its label, description and icon to `--text-disabled` | Shared `.doan-preference-row`. |
| Lines under a row | A notice, its actions or a helper start at the text column 12px below the row; a helper is caption `--text-subtle` 4px below; a line that belongs to the group (Project Settings recovery actions) is a row of its own, 12px block padding under a hairline; the notification permission hint hugs Desktop notifications (no hairline, 12px below it) | |
| Switch | 36 × 20 track, 1px border, 2px padding, pill; off `--border-standard` on `--affordance-subtle-hover`; on `--affordance-prominent` border and fill (rgb(0,0,0)) with the 14px white thumb (`--shadow-xs`) moved 16px; disabled: transparent border, `--affordance-disabled` fill (rgb(232,232,232)), `--surface-panel` thumb, no shadow, default cursor, thumb kept where it was | Shared `.doan-switch`; 14px and 36px are the switch's own constants, not `--size-icon-sm`. |
| Arrival | A provider row an arrival focuses carries a 2px inset `--border-focus` ring, −8px inline margin with 8px padding and a 16px corner for 2.4 s; the focused row group shows the 2px −2px focus outline | Like an added project's sidebar row. |
| Controls | Row buttons `sm`; Settings' Check is `subtle` (first run's Retry stays `prominent`); Agent, Model and Effort are `sm` `trigger` menus (`role="menu"`) with a 6px gap, regular weight and a `--text-subtle` chevron | |
| Connections | The three connection rows sit in the shared group; a row is 12px block padding, the group draws the dividers; Details open on the inset fill with white code chips | |
| Lock ink | While a confirmation or write owns the page: header tabs (the current Settings tab included), Back, Search and the other categories take `--text-disabled` with the default cursor, a locked category's icon included; the current category keeps its fill | The Add Projects page rule. |
| Project Settings | Standard dialog, 640px, 128px from the top, 14 / 20 text with plain numerals; title the project name with the branch in `--text-metadata` body-sm; one settings group; Done is the only action (prominent, default size); serve list 1px border, row corner, items padding 4 / 4 / 4 / 12 | Values save at once, so there is nothing to cancel. |
| Confirmations | Fix… and Add to serve? are compact and centred with Cancel focused and default-size actions; text without the page's body-sm tracking | |

### Documented deviations from the draft

- **Sideways clip.** The panel clips sideways (`overflow-x: hidden`) like the Add Projects panel; the draft leaves `auto`. Nothing in the column is wider than the panel (also at 960 × 600).
- **Group query container.** `.doan-settings-group` is an inline-size container so that at 24rem a button control moves under its title (Buzz's narrow rule); the draft draws no narrow state. Groups measured 574–720px wide in every placement (page column at 1238 and 960 windows, Project Settings dialog), never collapsed.
- **Notice actions.** `.ob-state-actions` keeps first run's 16px top margin; the draft copied 12px. A row whose notice has a title is 4px taller than drawn.
- **Body-only notice.** A notice body takes its 4px top margin only under a title, so a body alone ("Your Codex connection expired. Sign in again.") starts on the line its icon is centred on; the draft copied the old rule and draws the icon 4px above the text. The expired row therefore measures the draft's height.
- **Codex's waiting copy.** codex login opens the default browser itself, so Doan no longer opens its link and the waiting notice says "A browser tab may already be open. Complete sign-in there, then return here.", as for Cursor and Copilot; the draft drew Claude's "Complete sign-in in your browser, then return here." The notice's text column is wider by the longer sentence.
- **Waiting row keeps its vendor line.** A not-connected provider whose sign-in waits keeps its vendor line ("OpenAI"), as first run draws it; the Settings draft drops it (the shared provider view). The row is 22px taller than drawn.
- **Lock ink on the current tab and Back.** The current Settings tab is `aria-disabled` and dimmed while the page is locked, like every header tab on a locked page; the draft leaves it unmarked. Locked Back takes the disabled ink and default cursor; the draft marks it without the shipped ink.
- **Code chips in connection details** stay white on the inset fill. The canvas's own `.cn-details code` rule asks for the same and loses by order to its copied page code-chip rule.
- **Switch thumb** is the button's `::before`, not a child span; its values match the draft's span.

### States not in the draft

- The read-stage notice "Doan couldn’t read its saved settings, so defaults apply." and the newer-file notice above a category's groups (`.settings-notice`, 12px below); the save failure under New conversations (`.settings-save-error`, 12px above, 17px inset). Not measured against a draft.
- About's "Checking…" rows, the sign-in toast, and the Project Settings recovery rows other than Missing (Config error with Retry, Show in Finder and Details, whose detail opens inside the dialog; CLI error with Retry). Seen in the real-app probe, not compared.
- The `states-*` tiles are not windows and were not paired, except the Add to serve? confirmation.

### Not verified and unresolved

- **Stop and Paste dialogs.** Settings reuses first run's Stop and Paste dialogs, whose actions are `sm`; the draft's `states-agents` tile and 'Dialogs' draw the default size. Unresolved with the same first-run mismatch.
- The 24rem narrow layout in a real placement (no placement is that narrow at the 960 × 600 minimum).
- Roles and names were read from DOM attributes, not from the accessibility tree: rows `group` named by the provider; Agent, Model and Effort `button` with `aria-haspopup="menu"`; switches `switch` with `aria-checked`; confirmations `alertdialog`.
- Hover and keyboard focus on the sidebar rows, the switch focus ring and menu contents of Agent, Model and Effort were not measured.
- **Notifications in the packaged app.** A test notification showed, its banner click reached main and the person saw Doan come forward on Settings > Notifications, only from an ad-hoc build re-signed with the identifier `design.doan.app`; electron-builder's unsigned output keeps Electron's signature identifier and was refused without a prompt. The probe could not read the window's focus after the click itself, because macOS also launched another registered copy of the app.

### Regression pointers

`ds/controls.test.ts` (switch, group, row), `SettingsPage.test.tsx` (sidebar ink, dialog type, group-level line), `connectionRows.test.ts` (rows in the settings group), `agentAuthView.test.ts` (Settings' Check), `rendererImports.test.ts` (the renderer never loads the ajv validators: a blank window under the CSP otherwise). Probes: `.scratch/design-sync/buzz-settings/measure.mjs`, `.scratch/runtime-test/buzz-settings/r2.mjs`.
