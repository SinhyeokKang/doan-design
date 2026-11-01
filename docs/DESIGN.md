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

### Overview

A light, neutral system (Light only, below): black `prominent` actions and white panels on a translucent shell, Geist type, and one violet accent read only in the places listed under Accent places. Values live in `app/src/renderer/tokens.css`; shared components live in `app/src/renderer/ds/` (`controls.css`, `surfaces.css`) and in `styles.css`. People check the system on the design-system canvases in `.doan/ds/` (see Design-system canvases); the rules a screen follows are Adopted rules and Doan adjustments below. The system's character, mood and descriptive colour names are not settled (Open decisions).

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
  | `--size-icon-lg` | 20px | Project thumbnail in a picker, Settings row icon |
  | `--size-control-xs` | 24px | `xs` icon button (a chip's remove button) |
  | `--affordance-panel-hover` | `var(--neutral-3)` (#e8e8e8) | Hover fill of the `panel` button variant, one step darker than the inset fill |
  | `--border-field-focus` | `--neutral-5` (#cccccc) | Composer card border while focused, with `--shadow-sm` (Home's composer; the docked composer shares the card) |
  | `--type-family-mono` | `ui-monospace, "SF Mono", Menlo, monospace` | Inline code, code blocks and activity paths in the conversation thread (`ConversationThread`, not on a screen yet); everything else stays sans |

- **Roles.** Code reads roles named by purpose (`surface-*`, `text-*`, `border-*`, `affordance-*`, `bg-*`), never palette steps. Text has three reading levels: `text-standard`, `text-subtle`, `text-metadata`; `text-disabled` is below the contrast targets on purpose. The primary button is the neutral prominent fill (black, white text). Status colours use the reference status roles (`text-danger`/`-warning`/`-success`, `affordance-danger`/`-warning`/`-success`, `border-danger`/`-warning`).
- **Type roles.** Size, line height, tracking and weight travel together: caption 12/16, body-sm and body 14/20, label-sm 14/20 500, label 16/24 500, body-lg 20/28, heading 24 and title 32 at line height 1.1. Regular 400 is for reading and form labels, medium 500 for actions and structure. One sans stack; the only monospace use is `--type-family-mono` (system stack, no bundled font) for code and paths in the conversation thread, and other inline code stays a sans chip.
- **Radii.** `chip` 12, `row` 16, `control` 20, `container` 24, `panel` 28px; capsules (34px) and pills are separate shapes. A nested corner is `max(0, outer − inset − border)` and is not rounded to a step (`nestedRadius`: a menu row in a 24px menu with a 4px inset and a 1px border is 19px).
- **Focus.** An outer 2px `border-focus` ring at a 2px offset on buttons, icon buttons, checkboxes and chips; the ring does not change geometry, and every button variant uses the same ring. Rows inside a scrolling list (tree rows, `.wt`, menu rows, Settings project rows) use an inset ring at −2px so the list does not clip it. Text fields show focus with their own border (`border-prominent`), not a ring. The conversation composer card (Home's and the docked one) is the exception: a 1px `border-field-focus` ring with `--shadow-sm`, under 3:1 on its own, so the caret and the shadow carry focus with it.
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
  - `doan-button` `xs`: min-height `--size-control-xs` 24, padding `--space-1` `--space-2`, caption type, 14px icons; the docked composer's agent and effort pickers (not on a screen yet, so not measured).
  - `doan-icon-button` size `xs`: 24px (`--size-control-xs`), pill corner, 14px icon; its ink comes from the screen (a chip × is `--text-metadata`).
  - `doan-icon-button` `accent` (Home Send): pill on `--affordance-accent` with `--text-on-accent`, hover and pressed on the accent hover/pressed roles; disabled takes the shared disabled fill, and `accent` is excluded from the ghost disabled transparent rule.
  - `.doan-dialog` with `data-ui-presentation="search"`: Quick Open (see Design navigation).
  - `doan-button` `panel` (`data-ui-variant="panel"`): the secondary button inside an inset notice, where `subtle` would lose its fill (both are `--neutral-2`). Rest `--surface-panel`, hover `--affordance-panel-hover`, pressed `--affordance-subtle-pressed`, disabled the shared filled disabled rule. On the inset fill the fill measures 1.09 (rest), 1.12 (hover) and 1.28 (pressed) to 1, the label 19.17, 15.64 and 13.71 to 1. Used by the conversation strip's Deny, Always allow, Edit on Home and Open.
  - `.doan-notice.doan-panel` (notice on a non-white backdrop, `ds/surfaces.css`): see Notices.
- **Scrollbars.** Native and thin (`scrollbar-width: thin`, `scrollbar-thumb-quiet` on a transparent track) through `.doan-scroll`; Radix ScrollArea is forbidden.
- **Style loading.** The main window loads shared rows and code styles through HTML links, which preserve cascade order under the strict CSP, in production and DEV, with no entry CSP warning.

### Doan adjustments

- **Accent ramp.** Doan has its own violet ramp, not a reference family. Each step takes the per-step OKLCH lightness and chroma share (relative to step 9) of the reference's twelve-step light ramp whose step 9 carries white text, at hue 305, gamut-clamped by reducing chroma. Steps 1–12: `#fdfbfe`, `#fbf8fe`, `#f5f0fd`, `#efe7fa`, `#e9ddf9`, `#e2d2f7`, `#d6c1f0`, `#c7aee6`, `#973be1`, `#9033d9`, `#543871`, `#342743`; pair values: contrast and ink `#ffffff`, pressed `#8a2dd2`, link `#63019d`. White on `#973be1` is 5.21:1 (APCA Lc −80), and hover (`#9033d9`) and pressed (`#8a2dd2`) are darker than step 9, so white only gains contrast.
- **Accent places.** Violet is read only by: the Welcome glow `.ob-atmosphere`; Home Send (`doan-icon-button` `accent`) and its spinner ink; the chosen preset chip (`.preset-chip`); the suggested prompts' group icons (`.suggestion svg`); the Home glow `.home-atmosphere`; the composer drop outline (`.drop-target`); the sidebar status slot (`.row-slot.permission`, `.row-slot.unseen i`); the person's thread bubble and its preset line (`.conversation-thread .bubble`, `.bubble-preset`); the conversation panel's resize bar (`.doan-panel-handle::after`); the canvas agent indicator (`.doan-agent-glow`, `.doan-agent-dot`); inline anchor chips (`.anchor-chip`); and the folded panel's Show conversation dot (`.doan-icon-button[data-badge="true"]::after`). The roles `surface-comment` (violet 4) and `text-comment` (violet 12) are defined but applied to no surface. Sidebar selection and hover use neutral backdrop roles. Every other use is neutral. `accentPlaces` pins the list (`violetAllowed` in `ds/checks.test.ts`).
- **No coloured edge stripes.** No message, notice, card or row uses a coloured or thick start-side border (`edgeStripes` checks it). Errors take one of three forms, each with the lucide `CircleAlert` icon so colour is not the only signal:
  - a panel-level failure is a status block (1px `border-standard`, `radius-container`, centred 20px icon, label-sm title, body-sm `text-subtle` description, centred actions, opened detail on `surface-inset`);
  - an inline error is a 16px icon with one body-sm `text-danger` line (`text-warning` for warnings), which adds the icon to the reference's text-only field error;
  - a notice (see Notices).
- **Status pill.** `.ob-chip` is a 20px pill in caption type on the status `affordance-*` fill with the matching `text-*`. The reference has no such pill; Doan keeps it for project and tool status (Home, Project Settings, About). It is a separate primitive from `.doan-chip`.
- **Shared dialog sizes.** The Add to serve? confirmation is compact and centred; Project Setup is standard, 128px from the top. Replaced: the Add Projects dialog and its SetUpFolderConfirm are now the Add Projects page (see Add Projects page).
- **Toast without a type.** Success, error and undo toasts share the one neutral floating toast and differ only by their text; there is no type colour and no close button.
- **Focus ring colour.** The ring is `border-focus` (`neutral-12`, black, 21:1 on white); the reference ring uses `text-standard`. Inset rings are −2px, matching the draft and the menu rows.
- **Tooltip offset.** The shared tooltip defaults to `sideOffset` 4.
- **Type family.** `--type-family` (locally bundled Geist, followed by the system sans stack with `Apple SD Gothic Neo`) is the role the renderer reads; `--font-sans` is only a legacy alias.
- **Light only.** Main sets `nativeTheme.themeSource = "light"`; the main window is transparent with native sidebar material and an opaque reduced-transparency fallback. Main-window options are pinned by `app/src/main/index.test.ts`. The canvas iframe stays light under a dark macOS appearance by two routes: the renderer's `color-scheme: light` on the `<iframe>` element decides the canvas's `prefers-color-scheme` (dark on the element gives dark, light gives light, `normal` follows `nativeTheme`), and main pins `nativeTheme` light. With `nativeTheme.themeSource` forced dark, the app page matches dark while the sandbox iframe still matches light, also after the iframe is recreated. A probe must not use `page.emulateMedia` for this, because it overrides every frame, the canvas included. Not checked with an actual macOS appearance switch.

### Intended exceptions

- **Dimension label = tooltip capsule.** The canvas dimension label (`.dims`) is the same black prominent capsule as a tooltip.
- **Below 3:1 on purpose.** The non-text 3:1 target applies to `border-prominent` and focus rings only. The decorative hairline (`border-standard` `#e8e8e8`, 1.23:1 on white) and fill-edged inputs (`surface-inset` `#f5f5f6`, 1.09:1 on white) follow the reference values.
- **Subtle buttons on inset bands (interim).** `--affordance-subtle` and `--surface-inset` are both `--neutral-2`, so a subtle button on an inset band loses its resting fill and reads as plain text until hover. Affected: the status bands (`.ws-status`). Changing a band's surface is a screen-layout decision; `.ws-status` was assigned to `buzz-home`, which has shipped without changing it, so it has no owner now. A notice is not affected: its secondary button uses the `panel` variant.

### Shared components and surfaces

Reference: the design-system canvases in `.doan/ds/`, one per component (see Design-system canvases).

**Measured values.**

| Part | Value |
|---|---|
| Buttons | 40px default and 32px `sm`, 34px capsule corner, label-sm 14/20 500. Dialog action rows use the default size, every other button `sm`, except sidebar row actions (a compact local size). |
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

Further rules: an open disclosure (`aria-expanded` without `aria-haspopup`) is not drawn pressed; a focused button chip shows the ring only; the worktree menu keeps the 320px menu cap (320px wide at window widths 960 and 1238, inside the viewport); form labels carry no label tracking; a failure status block spaces its actions and opened detail with its own 8px gap. Unpinned: the checkbox tick, the open-disclosure rule, and the worktree-menu cap.

**Documented differences.**

- Dialog action rows have 4px padding cancelled by a −4px margin and `justify-content: safe end`; the draft has neither. The padding keeps a 2px focus ring inside a scrolling dialog; `safe` keeps an action wider than the row reachable.
- `.doan-kbd` and the `sm` text field set the body-sm tracking (−0.035px at 14px); the draft inherits the body tracking (−0.07px), or the button's (0.035px) for a hint inside a button. `.doan-kbd` also caps itself at the container width.
- A chip hovers only when it is a button; the draft hovers a span chip.
- `.doan-popover` defines the material and width only; the draft's heading and paragraph type inside its sample is not implemented.
- The Add Projects checklist keeps `max-height: 50vh` instead of the draft's 248px, so a bounded list grows with the window and still scrolls natively.
- Only the Project Setup token path is one ellipsised line (`.value.token-path`); other field values wrap, because the wizard's Project value puts a name and a path in one value and must not hide either. The draft draws every value on one line.
- `.meta` stays `nowrap` in a dialog action row; a status block's action row keeps `align-items: center`.
- `.doan-chip` uses the 12px/1.35/2px/6px values above instead of the inherited 13px top-bar or 14px draft sizing.
- The subtle-button-on-inset-band pairing (Intended exceptions).

**Context, not component.** Panel sizes (the panel is definition-only), the expanded dialog's height (the draft draws a 440px mock window), `min-height` of a draft `div` versus a native `<dialog>`, the scroll sample box, inherited type on text-less icon buttons and on the menu surface, Project Setup at 544px in the anatomy column versus 640px in the app, the toast at 298px in a narrow draft tile versus 384px, and every shared-element row whose width, card padding or `err` class comes from a real parent.

**Not verified.** `canvas-marks` and `accent-places` are not design-sync frames by the draft's own description; their selector map is checked by `accentPlaces`, `contrastPairs` and `edgeStripes`. Lucide icon stroke weight at 16px was not compared with the draft's inline icons.

**Known console warning.** Production logs a pre-existing Radix inline-style CSP warning with exact hash `nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo=` when the worktree menu invokes react-remove-scroll-bar; DEV logs none. No CSP permission was broadened for it. The menu stays operable; scroll-lock behaviour under it is not verified.

### Notices

Reference: `.doan/ds/notice.html` (frames `tones`, `surfaces`, `content`), implemented in `app/src/renderer/ds/surfaces.css`.

- **One style.** Every notice is `.doan-notice`: inset `--surface-inset` fill, 12px 16px padding (`--space-3` `--space-4`), 6px gap (`--space-1h`), `--radius-row`, 14/20 body-sm text in `--text-standard`, and a 16px icon on the first text line: the `doan-alert-icon` (CircleAlert, `aria-hidden`), or a spinner or the conversation strip's status mark in that slot. Every notice has the icon, whatever its tone. Notices differ only by tone and surface.
- **Tone.** `warning`, `error` and `ok` colour the whole text (`--text-warning`, `--text-danger`, `--text-success`) and the icon follows it (`currentColor`); the parts of a notice's text take no ink of their own, except code chips, links and buttons, which keep theirs. At 14/20 the text measures, on the inset fill and on the panel fill: neutral 17.59 / 19.17, warning 10.44 / 11.37, error 11.41 / 12.44, ok 11.31 / 12.32 to 1.
- **Surface.** On a plain opaque white backdrop (Settings and the other home-panel pages, the conversation strip's band, dialogs, side panels and white cards) the notice keeps the inset fill. On any other backdrop (first run's transparent overlay, Home's gradient, the preset popover's glass over Home) it adds `doan-panel`, which changes only the fill (`--surface-panel`) and adds the panel shadow.
- **Alignment.** Every item in the row (icon, text, an inline action or an action group) centres on the first text line. An sm action reaches into the padding with −6px block margins, so a one-line notice is 44px with or without an action.
- **Actions and margins.** A secondary button inside an inset notice uses the `panel` variant. Screens set only outer margins on a notice.
- **Regression pointers.** `ds/controls.test.ts` (shared metrics, tones, `doan-panel` as fill only, no ink on text parts, margins only from screens, action alignment, the `panel` variant).

### Colors, layout and depth

What Adopted rules does not already say, read from `tokens.css` and `styles.css`.

- **Three colour layers** (`tokens.css`): the palette holds the only literal colours (neutral ramp, violet ramp, red/amber/green status hues, and the eight Tailwind 600 project identity colours, kept apart from the status hues); roles name a purpose; legacy names (`--bg`, `--accent`, `--text-2` and the like) alias roles so drafts drawn before this system resolve. No renderer code reads the legacy layer.
- **Project identity.** A project thumbnail (`.shell-thumbnail`, `styles.css`) is the project's initial on one of the eight `--identity-project-*` roles chosen by `projectHue`: the fill is the colour 14% into `--surface-panel`, the letter the colour 65% into `--text-standard`. 16px in the sidebar and Quick Open, 20px in Home's project picker, 28px on first-run cards.
- **Spacing.** `--space-n` is n × 4px, with `--space-half` (2px) and `--space-1h` (6px); named spacings (`--space-row-gap`, `--space-control-inset`, `--space-section-gap`, `--space-chip-inset`) alias steps.
- **Shell layout** (`styles.css`): a 56px header (`--size-chrome`), a 220px sidebar, 8px gutters, and the screen's body on white: Home's `.home-panel` with `--radius-container` and `--shadow-panel`; the workspace's canvas area and 280px right panel joined into one body with 24px outer corners. The shell is transparent over the native sidebar material, `--bg-app` under reduced transparency.
- **Depth.** Three shadows: `--shadow-panel` (panels and floating material; its hairline ring draws their edge), `--shadow-sm` (dialogs, tooltips), `--shadow-xs` (the switch thumb). Glass is `--surface-elevated-glass` with `--blur-sm` on floating material and `--blur-md` on the `quiet` button. Surfaces without a shadow are told apart by fill: shell `--bg-app`, panel `--surface-panel`, inset `--surface-inset`.

### Design-system canvases

One canvas per token group, shared component and shared surface in `.doan/ds/`, each linking `tokens.css` and `ds/index.css` relative to itself. Canvas-only layout and the base the components rely on (the Geist `@font-face`, the border-box reset and button and SVG defaults from `fonts.css`, `styles.css` and Tailwind preflight, and stand-ins for the two custom properties Radix sets at run time) are restated once in `.doan/assets/ds-canvas.css`, because those files are outside the served scope. A canvas whose component is styled in `styles.css`, `doany.css` or a screen's rule restates only the rules it needs, with the same tokens, and says so; states the CSS reaches only under `:hover`, `:active` or `:focus-visible` are restated as `.is-hover`, `.is-active` and `.is-focus`. Dialogs are drawn in place rather than opened with `showModal()`. Values were read from source and the canvases were checked rendered in a browser, not measured against the app or for contrast ratios.

| Canvas | Shows | Source |
|---|---|---|
| `color` | Palette and every role group | `tokens.css` |
| `typography` | Type roles, weights, family | `tokens.css` |
| `spacing`, `size`, `radius`, `shadow`, `blur`, `motion` | One token group each | `tokens.css` |
| `button` | Variants × states, sizes, icon and shortcut hint | `ds/controls.css` |
| `icon-button` | Used variants × states, sizes and shapes | `ds/controls.css` |
| `input` | States and sizes | `ds/controls.css` |
| `chip` | The translucent chip (sidebar branch and count) | `ds/controls.css` |
| `spinner` | Spinner alone and beside its sentence | `ds/controls.css` |
| `panel`, `floating`, `menu`, `scroll` | Panel, floating material, menu rows and states, thin scrollbar | `ds/surfaces.css` |
| `toast` | Message, action, long message | `Toast.tsx` |
| `tooltip` | Short and long | `components/ui/tooltip.tsx` |
| `dialog` | Widths, header and actions, search presentation | `ds/surfaces.css` |
| `notice` | Tones, surfaces, spinner and action | `ds/surfaces.css` |
| `alert-icon` | 16 and 20px, ink | `AlertIcon.tsx` |
| `settings-group`, `preference-row` | Group; row content, trailing, disabled, narrow | `ds/surfaces.css` |
| `mode-tabs` | Page tabs in the header, filter tabs | `styles.css` (`.shell-modes`) |
| `status-pill` | Tones | `styles.css` (`.ob-chip`) |
| `inline-error` | Error and warning lines | `styles.css` (`.ob-msg`, `.settings-msg`) |
| `inline-code` | Code chip in a sentence | `styles.css` |
| `project-thumbnail` | Identity colours, sizes | `styles.css` (`.shell-thumbnail`) |
| `error-details` | The Details disclosure, closed and open | `ErrorDetails.tsx` |
| `doany` | Slots and focus (still image only) | `Doany.tsx`, `doany.css` |
| `project-settings` | Loaded, saved, saving, reading, read error, folder problem | `ProjectSettingsDialog.tsx` |
| `add-to-serve` | The confirmation before adding a serve path | `SettingsDialog.tsx` |
| `remove-confirmation` | Stop and remove a project with a running conversation | `App.tsx` |
| `project-setup` | No token, chosen, running, failed | `ProjectSetupDialog.tsx` |
| `quick-open` | Browse, results, no match | `QuickOpenDialog.tsx` |
| `shell-layout` | Header, sidebar (projects, Settings), project menu, body panels | `App.tsx`, `ShellSidebar.tsx`, `Home.tsx` |

The surface canvas is `shell-layout`. Not drawn, each seen on one screen only: the switch (Settings › Notifications), `.doan-kbd` outside a button (it appears only in the canvas toolbar's Fit button, drawn on `button`), the conversation strip and the first-run wizard. Not drawn because nothing renders them: `.doan-popover`, `.doan-textarea` and `.doan-checkbox` (no markup uses them since the app's comment screens left) and the tooltip provider, root and trigger (wrappers that draw nothing).

### Open decisions

Judgment calls nobody has confirmed, each shown on the canvas named.

- **Character.** The system's one-line character, mood, descriptive colour names and elevation philosophy are not settled; the Overview records only what the code does.
- **Sidebar violet roles** (`color`, `shell-layout`). `tokens.css` says violet marks the current sidebar row and its hover, and defines `--surface-sidebar-selected`, `--text-sidebar-selected` and `--affordance-sidebar-hover` for them; `styles.css` draws both with neutral backdrop roles (`.shell-side .row` overrides `.side .row`), as Accent places records. Whether those roles and the comment stay is undecided.
- **Defined but unused** (`color`, `typography`, `spacing`, `blur`, `motion`, `icon-button`, `chip`, `dialog`). No app CSS or TSX reads `--border-warning`, `--surface-comment`, `--text-comment`, `--text-on-project`, `--texture-dots-size`, `--window-*` (drafts only), `--type-body-lg-*`, `--space-16`, `--space-panel-gap`, `--space-panel-inset`, `--blur-lg` or `--time-panel-enter`; no markup uses the icon button's `md` size or its `prominent` and `panel` fills, the chip's default fill or button chip, the dialog's `wide` and `expanded` sizes, or `.doan-popover`. Whether each is kept for later or removed is undecided.
- **Literals equal to tokens** (`mode-tabs`, `shell-layout`). `.shell-modes` writes 24px, 20px, 16px, 40px and 32px, which equal `--radius-container`, `--radius-control`, `--size-icon`, `--size-control` and `--size-control-sm`, against Tokens first; the shell also uses values no token names (an 8px row corner, 220px sidebar, 36px Search, 10px heading type). Whether they move onto tokens or become named component constants is undecided.
- **Remove confirmation actions** (`remove-confirmation`). Its Cancel and Stop and Remove are `sm`, where Dialogs puts actions at the default size, like first run's Stop and Paste dialogs. Whether it is an exception is undecided.

## App shell

Reference: `.doan/canvases/buzz-shell.html`, measured beside the implementation in Electron 45.0.0 / Chromium 156.0.8078.48 at content viewports 1238×780 and 960×600. This covers the header and sidebar (LNB), not Home, Overview, Inspector or comments content.

**Header.** Height 56px. History controls at x104/y12, 32px, with the documented header corner 10. The centred mode capsule is 371.2578125×40px at a 1238px window width; its actions are 32px high with 16px inline insets, Plus/Grid/Settings glyphs, subtle ink when inactive and standard ink with the panel shadow when selected; on the Settings page the Settings tab is the selected one, and while a page is locked every tab, the selected one included, is `aria-disabled` with `--text-disabled` ink. Finite capsule/button radii are geometrically equivalent to the draft's clamped pills. Settled Back is transparent; hover is the shared chrome 6%-black fill on Back and 10%-black on Search.

**Sidebar.** 220px wide on Home, the workspace, Add Projects and Settings, a user decision that narrows the drawn 260px (`buzz-shell.html` and later drafts still draw 260). Measured in the built app at 1238×780 (`.scratch/runtime-test/bw-sidebar/probe.mjs`): the shell's first column is 220px, the sidebar sits at x8, and the body panel starts at x236; rows, group heads, Search and the worktree menu are 204px wide; long project and canvas names ellipsize. 8px top padding and 12px gap. Search at x16/y64, 204×36px, 10px inline inset, subtle ink. Projects heading at y112, 24px tall, 10/16 with 0.08em tracking. First project at y140. Project and canvas rows 32px with 10px inline insets and body-sm tracking. Project thumbnail 16×16px at x26, 600 weight, 16px line height (identity colours: Onboarding, 'Project thumbnails'). Project name 14/20/500, tracking −0.035px, standard ink; long names ellipsize. The 4px space below the project row and the badge/options geometry match the default specimen. The empty-project paragraph has 6/10/10/34px padding and a 16px line height.

**Sidebar groups.** Reference: `.doan/canvases/design-system-canvases.html` (frames `groups`, `empty`, `row-states`), measured by `/design-sync` in the built app at 1238×780 against the draft read in the app's canvas iframe; 28 element pairs (head, chevron, label, count; row, icon, name, status slot and its mark; empty and error lines). Reached for real: both groups open, each group closed, the empty groups, a project not set up, a read error, a long name, the real pointer hover, keyboard focus, a locked Add Projects page (held `init`) with its heads and its design-system and canvas rows, and the permission, working and unseen slots on design-system rows (Home conversations driven through main's conversation handlers, reached one at a time because a root runs one Home conversation at a time, so not side by side as drawn). Closing Design system moved each of the three slots to the project row and left the head without one; reopening returned it to the row. The heads' Chromium accessibility nodes (CDP `Accessibility.getPartialAXTree`) are treeitem, level 2, named by the label, described by the count ("5 canvases", "1 canvas", "0 canvases"), expanded true/false with the group, and disabled while locked. Under an expanded, listed project: Design system, then Canvases. A group head is a 204×32px tree row at x8 with 10px inline insets, subtle ink, 14/20 medium with body-sm tracking, no fill at rest; a 16px `ChevronDown` in metadata ink, turned −90° when closed; the label fills and ellipsizes; the count is the translucent `doan-chip` with tabular figures. Rows inside a group are 32px with a 34px left inset (10 + 16 + 8), so their 16px icon sits under the group label: `SwatchBook` for `.doan/ds/`, `PanelsTopLeft` for `.doan/canvases/` (Quick Open's canvas results and Canvases tab use the same two). The empty line is 12px/16px metadata ink at a 58px left inset ("No design system yet", "No canvases yet"); a read error line keeps its 56px inset. Hover is the 6% backdrop fill, keyboard focus the inset 2px `--border-focus` ring, as other tree rows; locked heads take `--text-disabled` on label, chevron and count, and still open and close. Context, not deviations: the app body's 13px/normal/tabular-nums inherited by group containers and lines (the canvas body is body-sm with no numeric variant); the working spinner's transform and rotated bounding box, which depend on the moment read (its computed 14px size matches). Not verified: the three slots shown at once, a real provider's conversation (the events were sent by the probe), the chevron transition, and native AppKit keyboard input (keys were renderer input). Unit-pinned: the permission slot on a design-system row and its project-row fallback (`ShellSidebar.test.tsx`); working and unseen rely on the shared canvas-row slot tests. Unpinned: the rendered group values and the chevron transition.

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
| Welcome Doany and focus | The shared Doany (see Home) at 142.5. On open the heading has focus: `showModal()` first focuses Doany, the dialog's first control, and `openOverlay` focuses the heading in the same task, so no animation frame sees Doany focused (probe: the heading's focusin follows Doany's within the same task). From the heading Tab goes to Get started and Shift+Tab to Doany; Escape stays blocked; Enter on Doany hops once and does not start | The scene effect focuses a heading only on the next animation frame; until then Doany, focused by `showModal()`, would match `:focus-visible` and could paint its ring. |
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
| Choice cards | Selectable `doan-panel` cards: min-height 72, padding 16, gap 12, title 14/20 / 500, caption path; cards 8px apart. A visible 16px radio leads the card, centred on the title's first line (it stays there when the title wraps), then the thumbnail, then the text: off is a 1px `--border-prominent` ring on `--surface-panel`, on is `--affordance-prominent` with a 6px `--text-on-prominent` dot; no trailing check | Measured in the real flow on Your projects and on repositories in a folder (radio and first-line centres equal, a two-line title included). |

### Behaviour and copy beyond the measured draft

Frame ids name the canvas frames that draw each state.

- **'Your projects'** (`project-your-projects`, `project-your-projects-selected`). When projects are registered, they are listed above 'Open a local folder' under the caption 'Your projects', as choice cards with the project thumbnail, followed by an sm Use this folder.
- **Choice cards instead of radio rows.** Used for 'Your projects' and for repositories found inside a picked folder (`project-repositories-in-folder`), both with the project thumbnail. A native radio still sits in each card, so the arrows and Space work, and Enter also picks. The card draws a 2px `--border-focus` outline, offset 2px, while its radio has keyboard focus.
- **No checkout choice on the URL path.** When a GitHub URL matches several local checkouts or worktrees, the app does not show 'Multiple local checkouts'. It picks one and shows it as the single 'Already on your Mac' card, with Choose another folder and Edit repository URL.
  - Pick order: a checkout that needs no setup; then the main checkout, whose `.git` is the common directory, read from the folder list's git facts without running git; then the most recently registered project.
  - If the picked checkout needs setup (`repository-found-setup`), the setup screen keeps the URL context: the 'Already on your Mac' heading, the read-only URL, Choose another folder (remote check) and Edit repository URL; Back returns to the editable URL.
  - Other worktrees are switched to later from the shell project card's Worktrees menu.
  - `onboarding project inspect` (CLI) still returns every candidate.
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
- Not measured: the native vibrancy material itself, reduced transparency and forced colours (DOM screenshots show the transparent overlay as white); hover and focus rings of the onboarding controls; dark mode; real sign-in, the real paste and stop dialogs as modals (measured as open dialogs in a column). The Project step was reached in the real app only with a forged ready-agent snapshot (scroll container, card drop, cloning line against a local git server).
- Welcome's centring and focus order were measured in the built app; `Onboarding.test.tsx` pins the Welcome CSS ('Welcome centres its group 72px high…'), the markup order (atmosphere, Doany, wordmark) and `openOverlay` focusing the heading right after `showModal()` (red before the fix), and `onboardingView.test.ts` the DOM-order Tab rule. The test pins the helper's order only; that the heading ref is set before the dialog's ref (children's refs attach first) is shown by the probe. The overlay always opens on Welcome (`initialScene(false)`).
- Regression tests (`app/src/renderer/Onboarding.test.tsx`, `ds/controls.test.ts`, `ShellSidebar.test.tsx`) pin the stepper markup and capsule rule, the overlay's `font-variant-numeric: normal` (fails when the declaration is removed) and the paste help ink; the `lg`, notice-on-panel and thumbnail rules; and the markup of every Project phase.

## Home

Reference: `.doan/canvases/buzz-home.html` (30 frames); Doany and the stage's vertical layout follow `.doan/canvases/doan-mascot.html` frame `mascot-home`. Home is the workspace's shell (header, sidebar, white body panel) with the conversation composer as its body; it has no project cards, setup checklist or connection banner.

### Measured contracts

Window 1238 × 780 (the draft's), 960 × 600 for `home-narrow`.

| Element | Measured contract | Reason |
|---|---|---|
| Body | White `--surface-panel` panel, `--radius-container`, panel shadow; the stage is a centred column: Doany, greeting (title token, medium), 40 px, composer, suggestions; padding 32 at the sides and bottom, top inset from `stageInsets` (below) | Every box of the group except the greeting's equals `mascot-home` at 1238 × 780 (see 'Greeting' under Documented differences). |
| Stage position | The group's centre is 64 above the panel's centre at any height; on a short panel the offset shrinks first, then 32 (`--space-8`) stays above and below and only real overflow scrolls. Placed by the reference group height: an empty two-line field with suggestions shown (473.2 with three suggestions on two rows). Measured at content heights 600 / 780 / 1240: panel 536 / 716 / 1176, group top 32 / 57.4 / 287.4, centre +0.6 (offset 0, 1.2 px overflow) / −64 / −64, scroll range 1 / 0 / 0; horizontal centre 0 on the panel's client width (scroll bar excluded) | `HomeStage` measures the panel and the reference height with a `ResizeObserver` and sets only the top inset; 1240 was read in an emulated viewport (the display is shorter than the window). |
| Composer stays put | Typing does not move the composer card or the textarea: after the first character, five lines and clearing, both tops stay (780: card 286.59, textarea 302.59; the same at 600 and 1240). A preset or attachment chip keeps the card's top and moves the textarea down inside the card by the chip row (302.59 → 350.59). Suggestions hidden by typing keep their place (`inert`, `visibility: hidden`) and leave the accessibility tree | The reference height leaves out what a draft adds (chips, counter, extra lines) and what sits below the suggestions (reason line, notices), which grow downward. |
| Doany | `button.doany` "Make Doany hop", 114 × 114 drawing slot (`flex: none`), the stage's first child, directly above the greeting; the still PNG with 20% padding until both textures load, then the WebGL canvas fills the slot (`min(1024, ceil(width × min(dpr, 2)))`, 228 at dpr 2); keyboard focus ring 2 px `--border-focus`, offset 2, radius `--radius-container` (24) | Equal to the draft, its ring included. At a hop's apex the beret stays inside the slot with headroom above it (measured, e.g., 16 of 228 device px on Home and 14 of 286 on Welcome), so it is not clipped. |
| Atmosphere | `radial-gradient(ellipse 78% 64% at 50% 60%)` of `--affordance-accent` at 24% → 15% (32%) → 6% (62%) → transparent; no grain, no motion; `.6` opacity under reduced transparency, none under forced colors | Home-only exception to the Welcome-only gradient. |
| Contrast over the gradient | Greeting ink rgb(15,15,15) on rendered background rgb(246,238,252)–rgb(250,245,254): worst 16.94:1. Placeholder `--text-metadata` rgb(95,95,95) on the white card: 6.39:1 | Both above 4.5:1, read from rendered pixels with the ink hidden. |
| Composer | Width min(680, 100%); tray `--surface-inset` with panel shadow; card `--surface-panel`, padding 16 / 12 / 12 / 16, gap 8, `--shadow-xs` and a 1 px `--border-standard` ring; while focused `--shadow-sm` and a 1 px `--border-field-focus` ring; text label 16/24, 2 lines minimum, 8 lines (192 px) then scrolls inside; Attach and Presets take `--text-disabled` while a send is pending | The focused border alone is under 3:1 on white; the caret and the shadow show focus with it. Built from the shared composer primitives (`ComposerParts.tsx`) as `HeroComposer`. |
| Tool row | Ghost icon buttons 32 px (Attach, Presets) in `--text-standard`; model and effort triggers sm `trigger` (8 px inline, no fill at rest); 16 px logo; model chevron 16 px; effort gauge and chevron 14 px; Send `accent` icon button | |
| Tray | `--size-control` min height, padding 4 / 16, caption type in `--text-subtle`; worktree trigger with 14 px branch and chevron icons; path in `--text-metadata`, ellipsized | One worktree shows the branch as read-only text instead of the trigger. |
| Chips | Attachment chip `--surface-inset`, `--radius-chip`, padding 4, 32 px preview (`--size-control-sm`), name 500 and caption meta; preset chip `--size-control` high, padding 0 4 0 12, `--surface-accent-subtle` / `--text-accent-subtle`; every × is the shared icon button `xs` in `--text-metadata` | The preset chip's × is metadata gray because that is how the confirmed draft renders. |
| Menus | Shared `doan-floating doan-menu`; rows 32 px with 16 px icons (the check keeps the shared 12 × 16); agent picker 300, effort 200, project 320, worktree 204 (`shell-project-menu`, the sidebar row width); preset popover 600 with a sm search field (16 px glyph), header-capsule group tabs and 276 px list; status lines (loading, no match) body-sm 14/20 | Icons are sized explicitly because Lucide draws 24 px unless sized; the portalled popover would otherwise inherit the page's 13 px body. |
| Suggestions | sm `quiet` buttons, shared sm padding 16 / 16, regular weight, 14 px accent group icon, wrap centred with 8 px gaps under the composer | The draft's own `.suggestion` padding never applied (the shared sm rule outweighs it). |
| Hover | quiet: backdrop fill plus one inset backdrop layer (rgba(0,0,0,.06) twice); trigger rgba(0,0,0,.06); ghost and xs icon buttons rgb(241,241,242); accent Send rgb(144,51,217) | In the workspace the strip's prominent (rgb(25,25,25)), subtle and ghost (rgb(241,241,242)) hovers keep the shared values. |
| Send | Accent fill rgb(151,59,225), hover rgb(144,51,217); disabled while empty, blocked or sending, with the shared disabled fill rgb(232,232,232) and a spinner while a start is pending | The draft's `home-sending` renders the disabled fill too, and the rendered draft is the confirmed one. |
| Reason and notices | Reason line caption, `--text-subtle`, centred, 12 px above; refusal and attachment notices `doan-notice error doan-panel` | An empty composer shows no reason line even while another project conversation works in its project; the line appears once something is typed. |
| Drop target | Whole composer covered by `--surface-panel` 55% with `--blur-sm`, 2 px dashed `--affordance-accent` outline inset 2 px | |
| Conversation strip | The default `doan-notice` on the white strip-slot band at the top of the workspace body, 12 px from the panel's top and left; a 16 px provider logo, spinner, alert or check in the icon slot; title 500 and an ellipsized body in the tone's ink (failed `error`, done `ok`, otherwise neutral); sm actions on the first line (Allow prominent; Deny, Always allow, Edit on Home and Open `panel`; Stop and Dismiss ghost); 44 px with one line, 68 px with two lines, a permission request or a failure | Left and top positions match the draft; fill, size and tone follow Notices. |
| Sidebar slot | 16 × 16 at the row's right before its menu: `hand` icon in `--affordance-accent`, 14 px spinner, or an 8 px accent dot | |
| Toast | Right and bottom 16 px from the window on Home and over a workspace, 384 px wide, message and prominent sm action on one row | The shared toast. |

### Documented differences

- **Status chips in menus.** The draft's project and worktree menus use `.ob-chip`, which the canvas does not style, so its chips render as plain gray text. The implementation uses the shipped status chip (Missing `warn`, Not set up neutral).
- **Pickers while sending.** The implementation disables every picker and chip × while a start is pending (the draft leaves the project and worktree triggers enabled-looking): a changed target cannot apply to a start already sent.
- **No projects.** Model lists are read per project root, so with no project the picker shows "Default" and no effort capsule (the draft shows "Opus 5.5 · High").
- **Strip width.** The workspace's right panel takes 280 px, so the strip is 650 px wide (the draft omits the right panel: 930 px). The Overview shows no strip.
- **Menu placement.** Menus open from their own trigger (Radix, `align` start or end, 4 or 8 px offset). The draft places the agent and effort menus at one fixed spot 40 px inside the tool row's right edge, so the agent picker sits 85 px further left in the app (right edge at its trigger) while the effort menu is within 4 px; the project and worktree menus are within 8 px. The composer, card and tray positions match the draft at both window sizes.
- **Trigger pressed.** A Radix menu trigger opens on pointerdown, so a pressed trigger shows the open fill (`--affordance-backdrop-hover`); the pressed fill applies only without a menu.
- **Stage position (doan-mascot).** The draft centres the stage with `justify-content: center` and a fixed bottom padding of 160 (32 + 128), so at 780 its group top is 57.4 like the app's; elsewhere its offset is fixed and a short panel scrolls by 128 px of empty padding. The app sets a computed top inset and a 32 bottom padding instead (see 'Stage position').
- **Greeting.** Home shows one of its fixed questions, picked per visit, where the draft has "What should we design today?"; the greeting's width and x follow the text, and its y and every other box of the group equal the draft's.
- **Kept suggestion space.** The draft's demo removes the suggestions while typing; the app keeps their place so typing does not move the group.
- **Stage children shrink.** The draft gives the stage's children `flex-shrink: 0`; the app's stage has an automatic height (`min-height: 100%`), so they never shrink: the group is 473.2 high at 600, 780 and 1240.
- **Doany is `type="button"`.** Not in the draft; it keeps Doany from submitting a form.
- **Still image `max-width: 100%`.** The app's base styles cap images at their container; the still is `width: 100%` already, so its box (114 square with 20% padding, 142.5 on Welcome) equals the draft's, measured with it shown on both sides.
- **Context, not deviations.** Container type (the canvas body is 14/20, the app body 13 px), the draft's placeholder drawn as text, caret-mock line heights, the draft's fixed sample text, highlighted first menu rows, spinner boxes while rotating, and the sidebar row's inherited ink.
- **Conversation primitives board.** `.doan/canvases/buzz-conversation.html` frame `hero-composer` redraws this composer as the regression reference for its rebuild from the shared primitives. Measured against it at 1238 × 780 (the focused empty composer and the running reason line, 21 paired elements, 29 computed properties and each box's size): beyond the context listed above, the implementation equals the board except these.
  - **Reason-line Open stays `subtle`.** The board draws Open as `panel` (white fill); Home keeps `subtle` (rgb(245,245,246)): on Home the reason line changes only its wording and Open's name, not how it looks. Both name it "Open the running conversation".
  - **Model label 0.73 px narrower.** The app body's tabular figures reach the agent trigger's label, so "Opus 5.5" is 57.13 px wide instead of the board's 57.85 and the trigger 117.13 instead of 117.85. Font family, size, weight, tracking, kerning and smoothing are equal; the same text in a bare span is 57.85 in both documents, and 57.13 in both with `tabular-nums`. The shipped Home had the same width before the rebuild.
  - **Board context.** The board's tile makes the composer 720 px wide (Home: `min(680, 100%)`), draws the input as a `div` with `role="textbox"` and its placeholder as text, and leaves out the reason line's `role="status"`, the buttons' `type`, popup and tooltip attributes, the textarea's `rows` and `placeholder`, and the icons' SVG attributes.

### Roles and names

Read on `home-empty`, equal to the draft's attributes: `region` "Home"; `button` "Make Doany hop" (its still image has `alt=""` and the canvas is `aria-hidden`); `button` "Project: doan-design"; `textbox` "Message"; `button` "Attach files", "Design presets", "Agent: Claude Code, model Opus 5.5", "Effort: High", "Send", "Worktree: main"; `group` "Suggested prompts" with one `button` per sentence. With text typed the suggestions are not in the tree. While another conversation runs in the project and something is typed, the reason line's Open is `button` "Open the running conversation" (read through CDP). Other states were not read.

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

- Strip, sidebar slots and Edit on Home come from main's conversation list. After a reload or restart the strip shows only conversations with work left (running, waiting, an unseen end, a crash-folded turn as stopped); a failed or stopped conversation already seen through a visit is not shown again, so Edit on Home is not reachable for it (PRODUCT §5 item 1). Reload, restart, crash folding and Edit on Home with a missing attachment were reached with real Claude Code runs.
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
| Panel | The Home white panel (`.home-panel`), 994 × 716 at 1238 × 780, is the scroll container: `overflow-x: hidden`, `overflow-y: auto`, `overscroll-behavior: contain`, `.doan-scroll` (`scrollbar-width: thin`, `--scrollbar-thumb-quiet`). The overlay scroll bar sits at the panel's right edge and drags the page. Body text 14/20 with `font-variant-numeric: normal` | The shared Project screen is sized for first run's overlay text; without it the panel passes on the app body's 13px/normal and tabular numerals. |
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
- Text and links (`text/uri-list` with `text/plain`) dragged into the URL field and the Home composer still drop. The app does not prevent a drag that carries only `text/uri-list`; in CDP drags it inserted nothing into the URL field or the composer, which is Chromium's editor default. A file dragged over the page heading, off the card, gets `dropEffect: none` and dropping it does nothing; other places were not measured.
- While locked, sidebar rows are `disabled` in the accessibility tree although their disclosure still expands and collapses.

### Not verified

- Native Finder drag onto the card and a native drag cancel (CDP drags with real paths were used; CDP's `dragCancel` sends no `dragleave`, so probes leave the window first).
- Hover and pressed states of the page's own buttons and cards; reduced transparency and forced colours; dark mode.

### Regression pointers

`app/src/renderer/AddProjectsPage.test.tsx` pins the panel's body text and sideways clip, the page-only Choose another folder (absent in first run, not repeated beside a recovery), the lock ink and the card's drop target rules; `Onboarding.test.tsx` pins the shared scroll container.

## Projects home

> buzz-ds 이전. Owner on the mark: `buzz-home`, which has shipped without remeasuring these surfaces, so no child owns the mark now. Home itself has no project cards, checklist or banner (see Home); this section covers the project surfaces that remain: the removal toast with Undo and the workspace status line. Replaced: the Add Projects checklist (`.add-dialog`), its set-up confirmation and the window drop overlay are now the Add Projects page (see Add Projects page).

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

### Not verified and unpinned

- Not verified: very long project/branch/canvas/selection values; minimum-window overflow; disabled problem entries in the worktree menu; long toast; absolute-time tooltip.
- Known note: Locate into a non-list root can keep the previous missing-project message in the canvas area while the status line shows the new root state.
- Unpinned: the toast's timer pause and Undo, native menu Undo, and the Show in Finder alignment.

## Project Overview

Reference: `.doan/canvases/buzz-project.html` (nine frames: `overview-thread`, `overview-new`, `overview-empty`, `overview-dropdown`, `overview-worktrees`, `overview-list-states`, `overview-promoted`, `overview-notice`, `overview-narrow`) and, for the thread and docked composer placed here for the first time, `.doan/canvases/buzz-conversation.html` (`docked-composer`, `thread-messages`, `thread-activity`, `thread-states`, `thread-moves`). Measured by `/design-sync` in the built app at 1238 × 780 and 960 × 600, draft read in the app's canvas iframe; states without a provider from stored conversation records in an isolated app, running turns, permission requests, the queue, suggestions and a promotion from real Claude Code turns on the signed-in test profile.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Panels | Main `.ov-main` 714 × 716 at 1238 × 780 (white, `--radius-container` start corners); right panel 280 with its 1 px `--border-standard` start edge and end corners on the shipped `.right-stack` (the `aside.ov-right` inside it is 279) | Equal to the draft's boxes. |
| Header | `min-height` `--size-chrome`, padding 8 / 16, gap 8: project (16 px thumbnail, name label-sm 500, branch chip), "/" in `--text-metadata`, conversation title as an sm `trigger` button (label-sm 500, 16 px chevron) | Every offset equal. |
| Narrow window | At 960 × 600 the title gives way first: project and branch keep their widths, the title ellipsizes (197 px with a three-worktree chip) | `overview-narrow`. |
| Worktree chip | With two or more worktrees a `button` chip with a 14 px chevron opening `.wt-menu` (280, `.shell-worktree` rows); open fill `--affordance-backdrop-pressed` | `button.doan-chip`'s open fill (`data-state="open"`) is more specific than the chip's own rule, so the pressed fill is set as `.ov-project button.wt-chip[aria-expanded="true"]`. |
| Thread column | 720 px maximum (666 at 1238 × 780) with a 24 px inset; bubbles, Markdown (paragraphs, lists with disc / circle / decimal markers 24 px in, inline and block code, table, blockquote), activity rows, permission and end notices equal the boards in type, colour, radius and spacing | The inset sits on `.thread-scroll` and `.ov-col` rather than the draft's `.ov-scroll`; every child offset matches. |
| Notice glyphs | Thread end notices and the moved line draw 16 px glyphs | Bare lucide icons render 24 px unless sized; `AlertIcon` and the agent mark size themselves. |
| Notice text | A thread notice's body wraps and is not clipped (`overflow: visible`) | The strip's one-line rule (`overflow: hidden`, ellipsis) would clip glyphs on a wrapped line. |
| Docked composer | Capsule (padding 8, `--radius-pill`) while one line; box (padding 16 / 12 / 12 / 16, radius 24) once wrapped or with chips; 32 px Attach, Presets and accent Send / Stop / Queue; tray of xs `trigger` model and effort, 14 px logo; focus ring as Home's; placeholder `--text-metadata` | Measured empty, one line, wrapped, running (Stop), queueing (Queue with a queued item) and waiting for a permission answer. |
| Suggestions and moved line | Suggestions: sm `quiet` buttons, 14 px accent icon, wrap start-aligned, gap 8, 12 above the composer. Moved line: the default `doan-notice` (top-aligned), 16 px icon, one line (44 px) where only the title ellipsizes before "moved to <canvas>.", sm `panel` Open, 12 above the suggestions; at 960 × 600 the line is 388 wide with Open inside it | Measured after real promotions. A title is the whole first message (up to 512 characters); the full sentence stays in the text (read by assistive tech) and the tooltip. |
| Right rows | Row padding 12 / 8, gap 8, `--radius-row`; thumbnail 72 × 48, `--radius-toolbar-icon`, inset 1 px border, empty style `--surface-inset`; first line 14 px logo, name body-sm 500 ellipsized, status mark 16, time caption `--text-metadata` flush right (now, Nm, Nh, 1d for the first day, then the date, "Oct 28"; another year adds it; the spelled-out label is for screen readers); preview caption `--text-subtle`, two lines; hairline separators inset 8, hidden beside a hovered openable row; hover fill `--affordance-backdrop-hover`; special rows' reason caption (`--text-danger`, or metadata for an unreadable canvas) | Equal, including the hover and the row states of `overview-list-states`. |
| Status marks | Needs your answer: hand icon 16 in `--affordance-accent`; Working: 14 px spinner; Finished, not seen: 8 px accent dot | The shipped sidebar slot; working and permission were measured in dropdown items (see Not verified). |
| Conversation menu | 360 wide; New with 16 px icon, separator, "Conversations in <project>" head, items drawn like right rows with a one-line preview, hairlines inset 12 hidden around the current and highlighted items, current item `--affordance-backdrop-pressed` | |
| Empty panel | "No canvas conversations yet." body-sm `--text-subtle`, then the caption line in `--text-metadata`, padding 16 | |
| Duplicate-ID notice | The shared `doan-notice` under the header, margin 0 16 8 | Measured after the open canvas moved onto a duplicate ID. |
| Numerals | `.ov-main`, the right panel, the conversation menu and the worktree menu set `font-variant-numeric: normal`; the docked composer's portalled menus (model, effort, presets) and the sidebar project menu keep the body's tabular figures | The app body's tabular figures widened every "1" (short times "12m", "1d" by 2.5–2.8 px). The composer menus were not measured here. |

### Documented deviations from the draft

- **Conversation menu width.** 360 px is the component constant (buzz-project design §0); the draft's own rule asks for 360 but the shared `.doan-menu` `max-width` caps its render at 320.
- **Current worktree check.** The chip's worktree menu marks the current worktree with a check like the shipped sidebar project menu's rows (the draft fills it but draws no check).
- **Moved line alignment.** The draft centres the moved line's icon and text on the Open button's row; the app keeps the shared notice's top alignment (screens set only outer margins on a notice, `ds/controls.test.ts`). The line never wraps, so both render the same 44 px row (measured).
- **Notice actions.** The app's `.grow-text` (`flex: 1`) puts a notice's actions (moved line Open) at the row's end; the draft's text hugs its content.
- **Running canvas row.** `overview-thread` draws a canvas row as Working while the project conversation runs. Before the canvas page's conversation panel (buzz-canvas-conversation), no canvas conversation runs from the Overview, and a promotion binds its canvas when the turn ends, so the row appears after that turn; the draft's state cannot occur.
- **Cursor.** Plain buttons (activity head, rows) take the app-wide `button { cursor: pointer }`; the draft's plain buttons keep the default cursor.
- **Provider text.** Model and effort labels, activity summaries ("Using a tool") and permission option labels ("Allow", "Allow with suggested permissions") come from the provider; the draft's samples are "Opus 5.5", "High", "Editing …", "Allow once".
- **Thumbnails.** The app shows the captured canvas (`object-fit: cover`, top); the draft draws a mock fill.
- **Narrow placeholder.** The capsule's placeholder stays on one line, so the empty capsule is as tall as one with a typed character; at narrow widths it ends in an ellipsis. The full text stays the field's `aria-placeholder`.

### Not verified

- Right-panel rows in Working or Needs your answer (see 'Running canvas row'). The same status marks were measured in conversation-menu items.
- Docked composer with preset chips and no text, Sending, blocked by another project conversation (running or waiting), and the archived modes; the bubble's preset line; the streaming caret; an expired permission; the promoted, archived and restored markers (canvas conversations, shown on the canvas page); Jump to latest; the 300 ms loading line; the action rows of a failed or sign-in notice that is not the latest end (only the latest end offers actions).
- Keyboard focus rings, reduced transparency, forced colours and dark mode.

### Regression pointers

`app/src/renderer/ProjectOverview.test.tsx` pins the numerals, the open chip's pressed fill, the 16 px notice glyphs, the wrapped notice body and the one-line moved line. `canvasConversationRows.test.ts` pins an unreadable canvas (listed without its id) matching its conversation by path; `overviewConversation.test.ts` pins the short times. Geometry above is a `.scratch/` probe only.

## Design navigation

Reference for Quick Open: `.doan/canvases/buzz-search.html`. The project Overview is in 'Project Overview'.

### Overview placement

- The Overview covers the canvas cell (`grid-column: 2`, last row) over the still laid-out canvas area, which is `inert` while covered: opening a canvas fits it to the area's size immediately, so the area never leaves layout.
- Roles: `region` "Overview"; the canvas area under the Overview is ignored (`inert`); toasts are a polite `status` holding the message.
- **Toast for a canvas gone at relaunch:** the saved state has only the canvas path, so the message uses the file name without `.html` ("billing is no longer in .doan/canvases/" (or `.doan/ds/`)).
- **Thumbnail visibility** travels in both directions, including when the Overview's right panel unmounts; main keeps visibility updates received during asynchronous cache reads.
- **Navigation recovery:** unreadable width is reported without guessing a parser error; an explicit Open distinguishes unavailable projects from absent canvases; the Missing/Not set up recovery text stays when no canvas is open.
- Unpinned (no current test): restore across relaunch (canvas, view and tree expansion; a frame selected before quit, with the Inspector and `doan active` set, comes back with neither and is absent from `ui-state.json`; Home, a gone canvas, a gone project, a broken `ui-state.json`) and Quick Open from the menu on Home and in a workspace. One normal restart once restored project, title and path but showed Couldn't load in the canvas; neither cause nor fix is established.

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

Reference: `.doan/canvases/buzz-canvas.html` (16 frames; `conversation-menu` is a reference frame for the canvas conversation panel's menu and was not compared). Measured by `/design-sync` in the built app at 1238 × 780 and 960 × 600 against the draft read in the app's canvas iframe: 73 part pairs over 21 states (frames, and each tile of `states` and `agent-waiting`). States without a provider come from fixture projects in an isolated app (a real selection-lost notice, a real toast, a canvas busy for 20 s for Loading and the failed first layout, a missing project folder); the agent indicator comes from real Claude Code turns on the signed-in test profile, its canvas conversations started through the preload API (the app could not start one when this was measured). In the default state the development server and the production build matched every compared computed style within 0.5 px (one 0.28 px text-measurement margin), the production reading also holding a jump highlight left by the fixture.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Canvas panel | `.doan-canvas-panel`: white, start corners `--radius-container`, 8 px after the sidebar column; 647 × 716 at 1238 × 780 with the conversation panel at 347. Folded, it reaches the workspace's end (994 wide) and rounds all four corners | The header and board form one panel (buzz-restyle table row 8). |
| Canvas header | The Overview header box (`.ov-head`): 56 high, padding 8 / 16, gap 8, white, no divider; the board starts under it. Canvas name: `PanelsTopLeft` 16, label-sm 14/20 regular `--text-subtle`, gap 6, at most 40 %, `title` = path. `/` in `--text-metadata`. Frame drawer trigger: sm `trigger` button, label-sm 500 `--text-standard`, gap 6, the shared 16 px `.chev` in metadata ink. An unlisted page or a project problem shows the disabled "Frames" trigger alone | Matches the Overview header so the two pages line up. |
| Narrow header | At 960 × 600 the frame name ellipsizes before the canvas name, and the drawer ends before the zoom controller | `narrow`. |
| Zoom controller | Zoom out and Zoom in are 32 px icon buttons in `--text-standard`; the value is an sm `trigger` button (minimum width 72, gap 4, tabular figures, 16 px chevron); gap 2. With no rendered board all three are disabled in `--text-disabled` and the value reads "—" | A changing percentage does not move the buttons. |
| Frame drawer list | `doan-floating doan-menu`, 320 wide, 4 below the trigger at its start edge, height from Radix's available height (384 at 1238 × 780). Rows: the shared 32 px menu row (12 inline, `--radius-row`), gap 8; number column minimum 24 in metadata ink with tabular figures; name ellipsized with the full name in `title`; the viewed row shows "Viewing" (caption 12/16, metadata ink) and no fill; the fill (`--affordance-floating-hover`) follows focus, which the pointer moves. Truncated note: caption, metadata ink, a 1 px `--border-standard` top rule, 8 above the text, 4 above the rule | |
| Reload | A 32 px `RotateCw` icon button in `--text-standard`, 4 after Zoom in (the header tools' gap) and before the folded panel's divider; tooltip "Reload canvas ⌘R". Disabled only when no canvas is open (a project problem) | Not compared by `/design-sync`; the header placement was checked in the built app by a short runtime probe. |
| Zoom menu | Compact `doan-menu` 184 wide, 4 below the value at its end edge: Fit ⌘1, 100% ⌘0, separator, 50%, 200%; shortcuts at the row end in metadata ink | |
| Board | `--surface-inset` (#f5f5f6) with no dot texture | A white canvas stays distinguishable when zoomed out, and the agent's white dot field shows. |
| Tools row | Centred 12 above the board's bottom. The shared `.doan-floating` surface (90 % white, `--blur-sm` 8 px, `--shadow-panel`, radius 24, inset 4): around the 32 px Select and Add to conversation tools. The pressed tool keeps `--affordance-backdrop-pressed` (rgba(0,0,0,.1)) under the pointer and while held; tooltip "Select" | The shared hover and active fills would otherwise replace the pressed fill while the tooltip shows. |
| Top column | `.doan-canvas-top`: 20 under the board's top, centred, `min(420px, 100% − 24px)` wide, gap 8; the agent notice first at its own width, centred, then the canvas notices stretched to the column | One place for everything floating at the top; it never covers the header. |
| Canvas notices | `doan-notice doan-panel` (white, `--shadow-panel`) with the 16 px alert icon, 12 / 16 padding; one line is 44 high, 420 wide at 1238 × 780 | The shared Notices rule. |
| Canvas status | `.canvas-status`: 14/20 `--text-subtle`, padding 16, message at most 260 wide, the bold heading `--text-standard` 500; the loading spinner 16 px and hidden from accessibility; Reload is an sm `panel` button (white, 32 high) | |
| Toast | The shared toast, 16 from the window's right and bottom | Nothing sits in the board's bottom-right corner any more. |
| Overlay marks | Selection: 1 px solid `--border-focus` with a 1 px white outer ring. Hover: the same, dashed. Dimensions: the prominent capsule (Intended exceptions), caption 12/16, padding 4 / 8, 24 high, 5 below the mark. Jump highlight: 2 px `--border-focus`, radius 1, a 3 px `--affordance-backdrop-pressed` ring, fading over 1.2 s (no fade under reduced motion) | Visible on light, dark (#050507) and violet (#5b21b6) canvases: the selection edge measured 21, 20.4 and 9.0 : 1 against them (BR6 probe; the overlay CSS has not changed since). |
| Conversation panel shell | `aside.right.ov-right`: white, 1 px `--border-standard` start edge, end corners 24. Its head, thread and composer: 'Canvas conversation panel' | The Overview right panel. |
| Panel width | Default and minimum `max(320px, 28dvw)`: 347 at 1238, 320 at 960. Maximum `min(50dvw, the width that leaves the canvas 360)`: 619 at 1238, 356 at 960; a saved width above it shows at the maximum and stays saved | |
| Folded panel | The column is 0 wide and leaves the Tab order; the header ends with a 1 × 20 `--border-standard` divider (4 inline margin) and the 32 px Show conversation icon button | |
| Resize handle | An 8 px transparent strip centred on the panel's start edge (z-index 4, `touch-action: none`, `col-resize`). Its only visible part is a 4 px bar, `linear-gradient(transparent, --affordance-accent, transparent)`, shown on hover, while dragging and on keyboard focus; keyboard focus adds a 2 px `--border-focus` ring | |
| Agent notice | A pill 40 high, padding 4 4 4 16, gap 8: `--affordance-prominent` at 60 %, `--blur-md` (16 px), `--shadow-sm`; opaque black with no blur under reduced transparency. Dot: 8 px accent, scale .75 ↔ 1.25 over 2.4 s with a 70 % accent ring spreading 8 px; still while waiting and under reduced motion. Wording 14/20 white, the first to ellipsize. Action: sm button, 32 high, white text on 16 % white (26 % hover, 34 % pressed). Stop leads with the composer's filled square (14 px); "Stopping…" leads with the 16 px spinner, is `aria-disabled` with 60 % white text and the default cursor; Open has no glyph | The shared hover and pressed fills are light grey; the notice's own rule outweighs them so white text stays readable. |
| Agent glow and dots | Inset shadows 8 px accent 70 % and 24 px accent 35 %, opacity .55 ↔ 1 over 8 s (still under reduced motion), corners following the canvas panel, no pointer input. The dot field is a 2D canvas over the board, its colour read from `--text-on-prominent` | |
| No overlap | At 1238 × 780 (panel 347) and at 960 × 600 with the panel at its widest (356, board 360) the header, the live agent notice, a selection-lost notice, a real toast and the tools row do not overlap; a long wording ellipsizes while Stop keeps 85 px | POSTMORTEM 'Shell restyle lost navigation landmarks' (unlocked integration). |
| Fit and jumps | Safe area: 56 from the board's top, 32 at the sides, 64 at the bottom (12 + tools 40 + 12). Fit puts the canvas top at 56 at both window sizes; drawer and Quick Open jumps keep a frame that fits the safe area inside it and above the tools row, and put a taller frame's top at 56 | Measured at both window sizes. |

### Documented deviations from the draft

- **Notice icon.** The draft draws the canvas notices without an icon; the app keeps the shared Notices rule, so each leads with the alert icon. The row stays 44 px.
- **Drawer scroll.** Opening the list centres the viewed row (the draft shows it at the top), and focus starts on it, so it takes the focus fill until the pointer or a key moves focus.
- **Top column.** The column is always in the page (empty when nothing shows) and passes the pointer through; it sets the notices' width, so a screen sets only margins on a notice (`ds/controls.test.ts`).
- **Handle cursor.** The hand-written handle sets `col-resize` itself; the draft leaves the cursor to a library.
- **Stopping… cursor.** The aria-disabled "Stopping…" shows the default cursor (the draft's button keeps the pointer).
- Context, not deviations: the app body's 13 px/normal line and tabular figures inherited by containers (every text part sets its own type); fixture names, provider wording (Claude Code for the draft's Codex) and percentages; menus and the tooltip portalled by Radix where the draft draws them in place; animation phases; state tiles the draft draws at 420 × 320.

### References

- Resize handle: malmoi `components/ui/resizable.tsx` and its DESIGN.md 'Resizer' table (malmoi `6dcdd575`), drawn by hand rather than with `react-resizable-panels`.
- Dot field: malmoi's sign-in `DotField` (`components/signin/dot-field.tsx`, `lib/signin/dot-field.ts`, malmoi `6dcdd575`), rewritten with doan's values: 12 px grid, radius 1.5 → 2, alpha 0.08 → 0.3, a virtual cursor of radius 320 sweeping 5 rows at 320 px/s; far dots painted in one path.
- Agent notice and glow: ego lite's agent tab as the user described and showed it. Its values are compiled into a native view (`AgentTaskOverlayView`); the one web token read is the task bar's `--bg-agent-task-bar: #0009`, which the notice's 60 % prominent fill matches. doan uses its accent where ego uses blue.

### Not verified

- The settled colour of "Stopping…" in a real run: a real stop ended within 350 ms, so the reading is the transition's start (white). The rule is in `styles.css`; the state is unit-tested.
- Physical trackpad pinch and two-finger scroll over the notices and the tools row (synthesized wheel and ctrl+wheel reach the board); an OS-level drag of the handle (Playwright pointer only).
- Hover tooltips of Zoom out, Zoom in, Show and Hide conversation (markup and the Select tooltip only).
- Dark mode and forced colours.

### Regression pointers

`viewport.test.ts` and `CanvasController.test.ts` (insets, Fit, jumps, first Fit), `frameDrawer.test.ts`, `frameDrawerList.test.ts`, `zoomControl.test.ts`, `canvasFocus.test.ts`, `CanvasHeader.test.tsx`, `CanvasTools.test.tsx`, `rightPanelSize.test.ts`, `ConversationPanel.test.tsx`, `agentPresence.test.ts`, `agentIndicator.test.ts`, `dotField.test.ts`, `CanvasAgent.test.tsx` and `CanvasAgent.hooks.test.tsx` (Stop glyph, "Stopping…" spinner, notice icon). Sizes, colours and geometry above are `.scratch/` probes only.

## Canvas conversation panel

Reference: `.doan/canvases/buzz-canvas-conversation.html` (15 frames; `panel-states` has 13 tiles), plus the shared choice card on first run's Your projects and Add Projects' repositories in a folder. Measured by `/design-sync` (`.scratch/design-sync/buzz-canvas-conversation/measure.mjs`) in the built app at 1238 × 780 and 960 × 600: the draft is copied into a fixture repo as the canvas `checkout` and read in the app's canvas iframe, next to the panel it draws; 787 pairs over 25 states, 37 computed properties each plus text, box and disabled / pressed / checked state, accessible names from the CDP AX tree. No provider is signed in: the signed-in states come from main's agent-auth, model, conversation list / read / start / send and resume-target handlers replaced in the isolated app.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Panel head | The Overview right panel title row: the conversation title is an sm `trigger` button (label-sm 14/20 500, padding 6 / 8, gap 6, 16 px `.chev`), then the 32 px Hide conversation icon button; 48 high with an 8 px end inset. No bar, divider or shadow; the thread scrolls under it and is clipped at its lower edge. While the list loads the trigger is disabled (`--text-disabled`) | Nothing to choose until the list reads. |
| Conversation menu | The Overview `conv-menu`: 360 wide, `doan-floating`, 4 inset; New conversation, separator, "Conversations on <canvas>", then rows (logo 14, title, time, one-line preview) with the shared 1 px dividers; the shown conversation has the pressed fill | Same rows as the Overview. |
| Thread | Thread insets 8 / 16 / 0 on `.thread-scroll`; gap 12; the person's bubble at most 92 %, padding 8 / 16, radius 16, light accent fill (rgb(245,240,253)); text body-sm 14/20 | The Overview thread at panel width. |
| Anchor chip | Inline, 20 high in a bubble and 24 in the field (the line height), padding 0 / 6, gap 4, margin 0 / 2, radius 6, 500 weight, `--text-accent-subtle` (rgb(84,56,113)) on `--surface-accent-subtle`, on `--surface-panel` inside a bubble; 14 px Lucide icon (Frame, SquareMousePointer, MapPin); label ellipsized at a 180 px chip. Field chips carry a hidden kind prefix ("Frame", "Element", "Point"); thread chips are buttons named "Show <label> on canvas" | Component constants (180, 6): no token has them. |
| Not found note | "No longer in the canvas": caption 12/16 `--text-metadata`, `role="status"`, and the chip's `aria-describedby` while it shows; under the bubble for a sent chip, and for a composer chip an overlay 4 px under that chip, start-aligned with it, outside the field | The field's DOM is never touched. |
| Docked composer | The shipped docked composer (Project Overview) in a 12 px foot: capsule while empty or one line of plain text; any chip — attachment, preset or anchor — makes the box (padding 16 / 12 / 12 / 16, radius 24). The capsule's placeholder is one line ending in an ellipsis | A chip in the capsule would clip in the 320–347 px panel. |
| Pick from canvas | 24 px xs icon button at the start of the model row (`margin-right: auto`), `--text-subtle`; pressed: `--affordance-backdrop-pressed` and `--text-standard`; unavailable: `aria-disabled`, `--text-disabled`, pointer cursor (its tooltip names the reason) | |
| Picking hint | The agent notice's capsule: 36 high, padding 4 / 8 / 4 / 16, gap 8, 60 % prominent with blur; wording 14/20 white; an outlined Esc key (28 high, padding 4 / 8, inset 1 px ring of 45 % white); hidden "Press Escape to cancel"; `role="status"`; under the agent notice when both show. The board shows a crosshair; the panel keeps its own cursors | |
| Tools row | Select, then Add to conversation (32 px): disabled is `aria-disabled` with a not-allowed cursor and no hover or pressed fill, so its reason tooltip still shows (tooltip: 24 high, padding 4 / 8, radius 12, black, caption white) | |
| Terminal session | Choice cards above the composer (`ob-choice-list cp-resume`, margin-bottom 4); the model and effort triggers keep their size without chevrons; Attach is `aria-disabled` in `--text-disabled` with a not-allowed cursor | The same triggers, not interactive. |
| Loading and unreadable conversation | "Loading conversation…" and "Doan couldn’t read this conversation" sit in the middle of the panel body with the thread's 16 px side insets | |
| Open button dot | Folded panel's Show conversation: 8 px `--affordance-accent` dot, 4 from the top and end, 2 px `--surface-panel` ring; named "Show conversation, needs your answer" / "Show conversation, new activity" | The sidebar slot's unseen dot. |
| Locate | Frame chips jump like the drawer; the jump highlight is the canvas area's (2 px `--border-focus`, 3 px pressed ring, 1.2 s); a point shows a 12 px ring | |
| Narrow | At 960 × 600 the panel is 320 and a chip makes the box | `max(320px, 28dvw)`. |

### Documented deviations from the draft

- **Send while empty.** Send is disabled while the field is empty (the shipped docked rule); several frames draw it enabled.
- **Waiting reason line.** While a permission request waits, the composer shows "Answer or stop the request above." under the model row (shared docked rule); `panel-permission` leaves it out.
- **Start refusal.** A refused start shows the shared composer notice (`doan-notice error doan-panel`) under the model row; the "Start refused" tile draws a reason line.
- **Unavailable composer.** On a page outside the list or with a duplicate canvas ID the composer keeps its draft and chips but takes no input: Attach, Presets and Send are disabled (`--text-disabled`), the chips cannot be removed, a dropped or pasted file is not attached, and the field is read-only (`aria-readonly`) so the kept draft can still be selected; the tile draws Attach and Presets enabled and the field `aria-disabled`.
- Context, not deviations: the draft page's 14 px body against the app's 13 px, inherited by text-less containers; the draft's placeholder drawn as field text and its caret stand-in (2 px taller lines); the field's `pre-wrap`; the focused composer's shared ring; the draft's frame-wide crosshair in `picker-mode`; state tiles drawn as 347 × 420 cards; fixture text, conversation titles and provider names.

### Not verified

- `panel-states` "Project conversation drawing" and "Promoted while open": HomeRun's drawing and promotion state was not injected.
- "Duplicate canvas ID": not reachable on the canvas page (the controller closes such a canvas).
- Every signed-in state with a real provider (injected handlers only); element and point chips in the field were drawn from a returned draft, not picked (picking: `.scratch/runtime-test/bcc-BR4b`).
- Hover of the chip, picker and tools (the draft draws none); dark mode and forced colours.
- Known gap: Chromium exposes no `aria-autocomplete` on the contenteditable field's `/` combobox; role, expanded state, controls and active descendant match the earlier textarea (ARCHITECTURE §7 'Renderer primitives').

### Regression pointers

`DockedComposer.test.tsx` (an anchor chip makes the box), `DockedComposer.interaction.test.tsx` (a locked composer takes no preset, file or chip removal), `canvasPicker.test.ts`, `CanvasController.test.ts`, `ConversationThread.locate.test.tsx`, `CanvasConversationPanel.test.tsx`, `Onboarding.test.tsx` (choice card markup). Sizes, colours and geometry above are `.scratch/` probes only.

## Select and inspect

> buzz-ds 이전 for the Inspector rows. Owner: `buzz-inspector` (it removes the mark). The canvas overlay rows (hover and selection outline, dimensions) were remeasured with the canvas page; see 'Canvas area and right panel'.

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
| Selection-lost / unlisted notice | See 'Canvas area and right panel', Canvas notices | Remeasured with the canvas page. |
| Pending values | `Reading styles…` in the notice styling while the selected element's values are pending; old computed rows are absent | |

- The live panel is 280px wide with one 1px left divider (279px of content); the draft specimen leaves 278px. Panel height follows the window (740px at 1238 × 780).
- An explicit `margin: 0` is Hardcoded rather than Default and adds a 15px source line plus 3px top margin.
- Copy and value rules: the Unknown title is “doan can't tell where this value comes from”; combined token names are listed in side order; Width/Height have no source line; colours are shown as hex; shadows show Chrome's computed serialization.
- Not verified: native title-tooltip painting; loading/error appearance (no draft); focused appearance against a draft; accessibility beyond the element-selected inspector/ancestor controls. Four inherited children were not paired: `element-family`, `states-text`, `long-family` and `input-family` (`.state:not(.hardcoded)`).

## Settings

Reference: `.doan/canvases/buzz-settings.html`, the windows `agents`, `agents-signing-in`, `notifications`, `notifications-off`, `about`, `project-settings`, `project-problem` and `home-agent-picker`, plus the `states-project` Add to serve? confirmation. Measured by computed style beside the built app in Electron 45.0.0 at 1238 × 780 (`.scratch/design-sync/buzz-settings/measure.mjs`); the draft side is read with `ds/` and tokens as of the draft's commit, because the canvas links `ds/index.css` and the app's later rules would otherwise style the draft. Development and production builds give the same values for the panel, column, title, group, row, switch and notice (131 of 131).

Settings is a page of the main window, like Add Projects: the shell's header and sidebar around Home's white panel.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Header tab | Settings is the capsule's third tab; on the page it is the current white pill with standard ink (the App shell values) | |
| Sidebar | 'Settings' heading in the Projects heading's place, then three 204 × 32 rows (Agents, Notifications, About) 2px apart with 10px insets, a 16px Lucide icon in `--text-subtle` and body-sm label; the current row takes the pressed fill rgba(0,0,0,.1) with standard ink and icon; Search stays | The shipped sidebar with its project tree replaced. |
| Panel | Home's panel, the scroll container (`.doan-scroll`, thin); 14/20 body-sm with its tracking and plain numerals | Like the Add Projects panel. |
| Column | max 768px (48rem), centred, padding 32 / 24 / 24 | Buzz's settings reading column. |
| Header | 17px inline inset (the group's 16px plus its border, so text lines up with row text); title heading 24 / 26.4 / 500; lead caption 12 / 16 `--text-subtle`, 8px below; 32px to the first section; an action slot on the right (About's Copy details), hidden while empty | |
| Sections | 32px apart; title label-sm 14 / 20 / 500 with the same 17px inset, 12px above its group; a section description caption 2px under its title | |
| Group | 1px `--border-standard`, 24px corner, 16px side inset, rows split by its own hairlines | Shared `.doan-settings-group`. |
| Row | Padding 12px 0; columns 1fr / auto with a 16px column gap and no row gap; label body-sm 14 / 20 `--text-standard`; description caption 12 / 16 `--text-subtle` 2px below; a provider row leads with a 20px logo; a disabled row (`data-disabled`) dims its label, description and icon to `--text-disabled` | Shared `.doan-preference-row`. |
| Lines under a row | A notice, its actions or a helper start at the text column 12px below the row; a helper is caption `--text-subtle` 4px below; a line that belongs to the group (Project Settings recovery actions) is a row of its own, 12px block padding under a hairline; the notification permission hint hugs Desktop notifications (no hairline, 12px below it) | |
| Switch | 36 × 20 track, 1px border, 2px padding, pill; off `--border-standard` on `--affordance-subtle-hover`; on `--affordance-prominent` border and fill (rgb(0,0,0)) with the 14px white thumb (`--shadow-xs`) moved 16px; disabled: transparent border, `--affordance-disabled` fill (rgb(232,232,232)), `--surface-panel` thumb, no shadow, default cursor, thumb kept where it was | Shared `.doan-switch`; 14px and 36px are the switch's own constants, not `--size-icon-sm`. |
| Arrival | A provider row an arrival focuses carries a 2px inset `--border-focus` ring, −8px inline margin with 8px padding and a 16px corner for 2.4 s; the focused row group shows the 2px −2px focus outline | Like an added project's sidebar row. |
| Controls | Row buttons `sm`; Settings' Check is `subtle` (first run's Retry stays `prominent`); Agent, Model and Effort are `sm` `trigger` menus (`role="menu"`) with a 6px gap, regular weight and a `--text-subtle` chevron | |
| Lock ink | While Agents' `stop_required` confirmation owns the page: header tabs (the current Settings tab included), Back, Search and the other categories take `--text-disabled` with the default cursor, a locked category's icon included; the current category keeps its fill | The Add Projects page rule. |
| Project Settings | Standard dialog, 640px, 128px from the top, 14 / 20 text with plain numerals; title the project name with the branch in `--text-metadata` body-sm; one settings group; Done is the only action (prominent, default size); serve list 1px border, row corner, items padding 4 / 4 / 4 / 12 | Values save at once, so there is nothing to cancel. |
| Confirmations | Add to serve? is compact and centred with Cancel focused and default-size actions; text without the page's body-sm tracking | |

### Documented deviations from the draft

- **Sideways clip.** The panel clips sideways (`overflow-x: hidden`) like the Add Projects panel; the draft leaves `auto`. Nothing in the column is wider than the panel (also at 960 × 600).
- **Group query container.** `.doan-settings-group` is an inline-size container so that at 24rem a button control moves under its title (Buzz's narrow rule); the draft draws no narrow state. Groups measured 574–720px wide in every placement (page column at 1238 and 960 windows, Project Settings dialog), never collapsed.
- **Notice actions.** `.ob-state-actions` keeps first run's 16px top margin; the draft copied 12px. A row whose notice has a title is 4px taller than drawn.
- **Body-only notice.** A notice body takes its 4px top margin only under a title, so a body alone ("Your Codex connection expired. Sign in again.") starts on the line its icon is centred on; the draft copied the old rule and draws the icon 4px above the text. The expired row therefore measures the draft's height.
- **Codex's waiting copy.** codex login opens the default browser itself, so Doan no longer opens its link and the waiting notice says "A browser tab may already be open. Complete sign-in there, then return here.", as for Cursor and Copilot; the draft drew Claude's "Complete sign-in in your browser, then return here." The notice's text column is wider by the longer sentence.
- **Waiting row keeps its vendor line.** A not-connected provider whose sign-in waits keeps its vendor line ("OpenAI"), as first run draws it; the Settings draft drops it (the shared provider view). The row is 22px taller than drawn.
- **Lock ink on the current tab and Back.** The current Settings tab is `aria-disabled` and dimmed while the page is locked, like every header tab on a locked page; the draft leaves it unmarked. Locked Back takes the disabled ink and default cursor; the draft marks it without the shipped ink.
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

### About setup notice

Reference: `.doan/canvases/zero-setup-agents.html`, the windows `about-skipped`, `about-several` and `about-not-eligible` (the notice) and `agents` (the lead). Measured by computed style beside the packaged app in Electron 45.0.0 at 1238 × 780 (`.scratch/design-sync/zero-setup-agents/measure.mjs`): every element of the doan command row and its notice (17, 27 and 14 elements), and the Agents lead, match the draft (geometry, colour, type, attributes and text), also after the shared notice style (Notices) changed both. The only differences are the probe CLI's own value and path in the doan command row (`dev` at a temporary path against the draft's 0.1.0 at `/Applications`). The states come from real causes in a temporary HOME (a file at `~/.local/bin/doan`; a folder at `~/.claude/skills/doan` and a read-only `~/.codex/rules`; the build launched outside Applications), except the cancelled administrator dialog, injected into main's `about:read` by the probe because the probe never takes the administrator path.

| Element | Measured contract | Reason |
|---|---|---|
| Place | A line under the doan command row (`doan-preference-row-extra`): full row width, 12px below the row | 'Lines under a row'. |
| Surface | The default `doan-notice` (Notices): `--surface-inset` fill (rgb(245,245,246)), 12 / 16 padding, 16px corner, 6px gap, body-sm 14 / 20; no border or shadow; 88px high with one skipped item, 200px with the three of `about-several` | It sits on the opaque Settings panel. |
| Icon | A 16px CircleAlert, `aria-hidden`, centred on the first line, in the text's ink | Every notice has its icon (Notices). |
| Skipped items | `warning`: title and lines in `--text-warning` (rgb(79,52,34)); title 500; one list item per skipped item, 4px apart and 4px under the title, in About's fixed order | Static text, no live region and no buttons: it reports what happened when Doan opened. |
| Line | The agents a line affects lead it at 500, then " — " and the sentence, in the notice's ink | The affected agents read first. |
| Code | Paths are `code` chips on `--surface-panel` (white) with standard ink, 4px corner and 0 / 4 padding; the PATH line is a block chip of its own, 4px below its sentence and as wide as its text | The page's inset chip would vanish on the inset fill; a block line selects and copies whole. |
| Copy that doesn't set up agents | A neutral `doan-notice` in `--text-standard`: title 500, its sentence as a body 8px below (the column's 4px gap plus the body's 4px top margin) | |
| Agents lead | "Doan signs in to each agent with its own connection, separate from your terminal. One account per agent. Agents you run in a terminal use Doan without any setup." | |

- **Not verified.** About's Checking… rows while the administrator dialog is open (the dialog is never shown by a probe; `index.test.ts` pins that `about:read` and Copy details wait), the cancelled-dialog line from a real cancellation, the development build's and translocation's sentences in the real app (`notice.test.ts`), the line for a setup run that threw ("Doan stopped partway through setting up agents…", under the warning title before the CLI links; not drawn, `notice.test.ts` and `index.test.ts`), and a doan command row with both a read error and a notice (the notice comes after the error line). Roles were read from DOM attributes, not from the accessibility tree.
- **Regression pointers.** `SettingsAbout.test.tsx` (notice present, absent, not eligible, icon and code), `about.test.ts` (Copy details lines), `index.test.ts` ('agent setup on launch'), `agentSetup/notice.test.ts` (copy and order).

### Regression pointers

`ds/controls.test.ts` (switch, group, row), `SettingsPage.test.tsx` (sidebar ink, dialog type, group-level line), `agentAuthView.test.ts` (Settings' Check), `rendererImports.test.ts` (the renderer never loads the ajv validators: a blank window under the CSP otherwise). Probes: `.scratch/design-sync/buzz-settings/measure.mjs`, `.scratch/runtime-test/buzz-settings/r2.mjs`.
