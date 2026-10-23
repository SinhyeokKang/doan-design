# Design measurements

## App shell — initial app-ui implementation (2026-10-22)

The initial reference is `design/app-shell.html`, limited to `main`, `empty`, `canvas-states`, and `sidebar-states`. Menus, components, future screens, and the mock human canvas were not compared. After this implementation is merged into main, the code and this document are the reference; a later draft is a change request.

Measurements use the built Electron application with temporary repositories and userData. The draft is opened as a real served canvas in the app. Both its iframe and the app renderer are read with `getComputedStyle`; dimensions use `getBoundingClientRect` in the relevant document. Screenshots show structure only. Native window configuration is read through `BrowserWindow` APIs. Accessibility is checked through Chromium's accessibility tree and role/name queries.

### Dimensions and typography

All dimensions below are CSS pixels unless stated otherwise. Colors refer to `app/src/renderer/tokens.css`; there is one system-sans font and one dark theme.

| Element | Measured contract | Why it matters |
|---|---|---|
| Window / shell | 1238 × 780; columns 240 / remaining width / 280; top bar 40 | Keeps project navigation and canvas information at the reference widths. |
| Traffic lights (configuration) | `trafficLightPosition: { x: 12, y: 14 }`; getter returns the same | Makes the native-window configuration explicit and testable. This is not an on-screen measurement. |
| Project, canvas, and frame rows | Row height 26; glyph width 12; project glyph height 16, canvas glyph height 15.5 (fallback fonts differ by glyph); frame glyph height not measured; canvas-row left padding 26 | Keeps navigation dense and text aligned. |
| Row typography | 12.5px, normal line height | Avoids additional vertical spacing from inherited CSS resets. |
| Hints | Padding 2px 12px 6px 34px; 11.5px / 1.5; `--text-3` | Aligns project instructions under the name. Frame hints use 12px left padding. |
| Project instruction code | `--text-2` on `--panel-2`, horizontal padding 4, radius 4 | Distinguishes the `doan init` instruction only where the draft draws a chip. |
| Frame hints | Plain text, no element children | Prevents the project code-chip rule from leaking into `data-doan-frame`. |
| Recovery buttons | Padding 2px 8px; font size 11px; top/right margins 4px | Keeps Reopen and Close within the hint instead of adding another padded hint block. |
| Width chip | 11.5px; radius 6; padding 2px 8px; transparent background; `--text-2` | Matches the compact read-only width indicator. |
| Zoom group | Radius 8; button padding 4px 9px; output minimum width 48 with 1px left/right dividers | Separates the value from the actions without fixed button dimensions. |
| Zoom button click areas | Out: 25.0078125 × 22.5; in: 24.5234375 × 22.5 on this macOS system font | The click area follows the draft's content dimensions, smaller than the former fixed 26 × 27. |
| Disabled controls | Opacity 0.4 | Zoom/Fit are dimmed by their group, and child buttons stay at opacity 1 to avoid a second factor of 0.4. Disabled Reload uses 0.4 directly. |
| Canvas status | 12.5px / 1.6; `--text-2`; message maximum width 260; outer padding 18 | Keeps long error instructions readable and centered. |
| First launch | Title 15px / 600; body 12.5px / 1.6, maximum width 320; gap 12 | Preserves the empty-state hierarchy and spacing. |
| Loading spinner | 18 × 18; 2px border, accent top border; hidden from accessibility | Adds the missing loading mark without changing the status text `Loading…`. |
| Canvas notices | `--accent-soft` background; `--accent` text; 11px | Distinguishes retained-view and unlisted-document notices from the canvas. |
| Panel header / empty text | Header padding 11px 14px 10px; empty text 12.5px with padding 14 | Matches the Canvas panel's vertical rhythm. |
| Activity | 11px; row gap 8; time width 54; padding 3px 12px 3px 0 | Aligns event labels independently of their time text. |
| Id-less frame label | Resolved `--text-3`, different from named labels | Makes the absence of a frame id visible without a different font. |

`body { line-height: normal }` cuts off Tailwind preflight's inherited `1.5` line height. Explicit component line heights still apply, including status and hint text. The top bar and the navigation glyph's natural height are pinned in the runtime test.

### Decisions and documented differences

- Traffic-light configuration stays at (12, 14), as approved during review. The draft circle is at (12, 13.5) relative to its window: the top bar's 1px bottom border leaves 39px of content height and shifts the centered 12px circle upward by 0.5px. The 0.5px difference is documented. `getWindowButtonPosition()` returns the configured value, not the actual native buttons' rendered bounds; the on-screen position remains unverified.
- The no-frames hint is plain text, matching the sidebar draft. The project `doan init` instruction remains a styled code chip.
- Expanded and collapsed projects use `▾` and `▸` text in the same font, both `aria-hidden`. The collapsed choice was explicitly approved during review; there is no collapsed-row specimen in the scoped draft.
- Not found and CLI error rows have Reopen and Close buttons and no row ×. Error and Not initialized rows have ×, as do other rows without recovery buttons.
- The first-launch `.doan/` code text uses the system sans font. The draft's UA code font is monospace; the app-ui design decision says not to use monospace. Its measured bounds are 33.140625 × 15.5 in the app and 45.15625 × 14.5 in the draft; this is a documented difference, not an exact match.
- Tailwind's zero-width borders have style `solid` where the draft has `none`. A pair is classified as equivalent only when its measured border width is zero on both sides; neither paints a border.
- The draft's `.win` has a CSS radius of 12 while the renderer root has 0. The renderer fills an Electron `hiddenInset` native window; native corner clipping is outside renderer CSS. No measurement of the macOS corner radius is claimed.

### Coverage and limits

The loop reaches first launch, canvas closed/open/selected, selected and id-less frames, loading, five-second failure, missing width, deleted canvas/project, uninitialized project, CLI timeout with retained view, unlisted navigation, Reading during Reopen, empty project, invalid config, recovery, no frames, truncated frames, duplicate project names, and subfolder canvases. Real hover, keyboard focus, collapsed rows, and scrolling are exercised.

Not verified against a draft: collapsed project row (no draft specimen), hover/focus appearance (no specimen in the four scoped frames), the actual on-screen native traffic-light position, native corner shape, and native message-box appearance. Native message-box behavior is covered by the runtime suite's dialog replacement.

The table records `textContent` for both sides of every pair so first-match selectors can be checked against the intended state. The no-frames comparison explicitly pairs the absence of element children, rather than relying only on the parent's styles. Text is evidence of the pairing, not an equality requirement for fixture-dependent names, paths, counts, or timestamps. Only top border style is compared directly; all four border widths and colors are recorded. That limitation is retained explicitly rather than claiming full border-style coverage.

### Regression checks

`app/e2e/runtime.ts` pins the hidden 18px spinner and loading text, emphasized no-width heading and unchanged full message, single disabled opacity, preflight line-height boundary, natural project glyph height, id-less label color against the resolved token, hidden decorative glyphs in the real accessibility tree, and the plain-text frame hint. Each was observed failing with the relevant regression restored or fix removed. `app/src/main/index.test.ts` pins the window geometry and explicit traffic-light position, with a failing result observed before adding the option.

## Select and inspect — initial implementation (2026-10-23)

Reference: `design/select-inspect.html`, scoped to `hover`, `element-selected`, `frame-selected`, `inspector-states`, `long-values`, `interactive-element`, and `selection-lost`. The shipped no-selection screen is excluded. The draft and implementation were read with `getComputedStyle` in the same built Electron app; the draft was served through the app, and selection was driven by pointer and keyboard input in a temporary repository with temporary userData.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Hover / selection outline | 1px `--accent-line`; dashed / solid | Distinguishes hover from selection without relying on color. |
| Dimensions | 10px / 600 system sans; padding 2px 6px; radius 4; `--accent` background and `--accent-ink` text | Keeps the screen-space label legible independently of canvas scale. |
| Selected element sub-row | Height 26; left padding 40; `--accent` on `--accent-soft`; glyph width 12 | Places the selected element below its containing frame. |
| Inspector head | Padding 12; gap 6; 1px bottom `--line-2` divider; tag 12.5px / 600 | Separates selection identity from computed values. |
| Selector / head metadata | 11.5px; selector `--text-2`; metadata columns 52px / remaining width, gaps 5px 8px | Preserves the path and frame context within the panel width. |
| Ancestor buttons | 11px; padding 3px 5px; radius 4; wrap gap 4; current button `--accent` on `--accent-soft` | Keeps long paths reachable without horizontal scrolling. |
| Interactive hint | 11.5px / 17.25px; `--text-3` | Explains real Option-click behavior for buttons, inputs and links. |
| Inspector sections | Padding 10px 12px 12px; 1px bottom `--line-2` divider | Separates Box, Typography, Colors, Effects, and Doan attributes. |
| Property row | 11.5px; bottom margin 7 except final row; columns 78px / remaining width; gap 8; minimum height 16 | Aligns labels and values. |
| Source line | Left margin 86; top margin 3; wrapping gap 4 | Aligns provenance beneath the value. |
| Token | 10.5px; padding 2px 5px; radius 4; `--accent` on `--accent-soft` | Distinguishes tokens from resolved values. |
| Source state | 10px / 15px; `--text-3`, Hardcoded `--warn` | Describes provenance in text. |
| Default value | `--text-4`, native title `Default`, no source line | Makes the absence of an author declaration visible. |
| Color swatch | 12 × 12; 1px `--line` border; radius 3 | Separates a color sample from its textual value. |
| Selection-lost / unlisted notice | Padding 7px 12px; 11px; `--accent` on `--accent-soft` | Explains why inspection is no longer available. |

### Documented differences and measurement limits

The conductor accepted these differences after two rounds with the same independent reviewer (no remaining high- or medium-priority findings). The review reconstructed every comparison row from the raw evidence; it did not independently rerun Electron or the test gates.

- The live panel is 280px wide with one 1px left divider. The standalone states/long draft wraps a 279px panel in a 280px specimen with its own 1px right border, leaving 278px of content versus 279px in the app. Preserve the shipped shared panel: the resulting 1px child-width and resolved grid-track differences are documented, not exact matches. Standalone panel heights (841.5 / 908px) follow their contents; the app panel is 740px at the measured 1238 × 780 window. The specimen panel has `min-height: 0px`, while the live panel resolves to `auto`; this is a different layout context, not an inspector control change.
- Explicit fixture `margin: 0` is Hardcoded rather than the draft's Default. It adds a 15px source line plus 3px top margin (18px total) to four Margin rows and their Box sections; value text uses `--text` instead of `--text-4`. The 16 color/outline-color differences remain documented declaration-state differences, not style matches.
- Fixture labels, paths, numeric values and ancestry can change intrinsic widths. A real ancestor with `data-doan-id="div.account-settings-and-personal-preferences-and-notification-preferences"` measured clientWidth 255 and scrollWidth 367, with the entire identifier in `title`. Its button and both neighbors remain within the 255px ancestor navigation width, and the eight buttons occupy three rows. The draft's shorter long-ancestor name fits at 228.921875px (clientWidth = scrollWidth = 229); its own text does not clip. The paired successor is `form` in the draft and `div` in the fixture's parsed DOM. These content differences do not imply identical geometry.
- Long ancestor buttons and tokens use `max-width: 100%`, hidden overflow, nowrap and ellipsis. The input Border token omits truncation in the draft; the app consistently uses the common truncating token with full title. Its four overflow/ellipsis/nowrap differences are intentional. Zero-width border style differences are separately equivalent only when the corresponding border widths are zero on both sides.
- Frame Title and Implements terms and values were paired individually. Implements resolves to `src/screens/sign-in.tsx`, with the same full title; the metadata grid resolves to `52px 195px` in the live panel. Value grids resolve to `78px 169px`, source-line left margin to 86px, row minimum height to 16px, and ancestor/source lines to `flex-wrap: wrap`.
- Conductor decisions after the draft retain the Unknown title “doan can't tell where this value comes from”, combined token names in side order, no source line for Width/Height, and hex color values. Shadows display Chrome's actual computed serialization rather than the draft's hand-written string.

### Coverage and limits

The served draft iframe and live renderer were measured in the same Electron build at `74b15cb`, with real clicks for elements and frame selection, real hover and Alt input, a file reload that removes the selected element and its frame, and Option-click navigation to unlisted `about:blank`. Before reading element rows, the displayed selector was resolved back to the selected fixture node. Alt was tested from a visible hover on an unselected button to a hidden hover. After unlisted navigation, focusing the app's Reload button before releasing Alt avoided a Playwright input acknowledgement stall; the final release completed normally.

The supplemental run pairs 668 elements across 44 properties (29,392 rows): 26,557 exact, 2,624 equivalent zero-width border rows, and 211 documented differences (189 dimensions/resolved grid tracks, 16 declaration-state colors, four common-token truncation properties, and two panel min-height values). Raw evidence also retains text, title, full rects, clientWidth/scrollWidth, and panel-parent borders. These are comparison counts, not a claim that every descendant in every state was measured. The original 655-pair / 25,545-row evidence was preserved before supplementation.

Not verified: native title-tooltip painting; loading/error appearance (no scoped draft); focused appearance against a draft (real Tab focus reached, no focused specimen); accessibility for every state (CDP captured the element-selected inspector/ancestor controls only). The shipped no-selection screen is excluded. No new disabled control exists in scope. Four inherited children were absent in the final fixture and were not paired: `element-family`, `states-text`, `long-family`, and `input-family` (`.state:not(.hardcoded)`). Inherited provenance was measured on other reached rows. Full-title strings are verified separately from native tooltip painting.

This round changed no product code and found no new product regression requiring a pinning test. The subsequent hover and selection-order fixes were independently reviewed and remeasured in the integration checkout as recorded below.


### Verification

At baseline `74b15cb`, `npm --prefix app test` passed 902 tests in 30 files; `npm --prefix app run typecheck` and `npm --prefix app run build` passed. `npm --prefix app run e2e` exited 0 with `runtime-test: PASS`; its seven screenshots were inspected. Draft `doan ls` included the canvas and `doan check` reported zero errors (six existing hardcoded-color warnings in `design/mock.css`). No product files changed in this documentation round, so these gates apply to the recorded implementation, not to the later integrated F2/F3 changes.

### Integration recheck (2026-10-23)

After the hover and pending-selection fixes (product source `226443c`, documentation HEAD `b5c7e9e`), the conductor reran the same measurement script in the real Electron app. All 668 selector pairs, their text/title and client/scroll widths, and all 29,392 computed-style rows were identical to the accepted Y baseline; the classification counts and exclusions above are unchanged. The same real selection, Alt, reload and navigation assertions passed. Evidence is preserved under `.scratch/design-sync/select-inspect/`, including `accepted-y/`, and `.scratch/final-integration/design-comparison.json`.

The integrated source passed 914 unit tests in 30 files, typecheck, build and `runtime-test: PASS` with exit 0. All seven runtime screenshots were inspected. Go tests and vet also passed. The integration recheck confirms the recorded scope after the input fixes; it does not extend coverage to the excluded tooltip, absent specimens or unpaired inherited children.
