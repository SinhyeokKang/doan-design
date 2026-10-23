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

## Comments — initial comments-ui implementation (2026-10-23)

Reference: the approved `design/comments-ui.html`. The draft was not edited. Its frames omit `data-doan-implements`; the conductor explicitly resolved that prerequisite: list/editor/recovery/dialog presentation belongs to `CommentsPanel.tsx`, dialog wiring to `useComments.tsx` and `App.tsx`, panel split to `App.tsx`, Inspector to `RightPanel.tsx`, and pins to `CommentPins.ts`. This mapping does not change ownership of product behavior.

### Measured contracts

The draft iframe and mounted application are measured in the same built Electron process, with temporary repositories, userData and runtime paths. `getComputedStyle`, document-local rectangles, textContent, child typography, disabled/pressed/focus states and Chromium CDP accessibility trees are retained. Screenshots are structural evidence only. The measurement driver reuses `app/e2e/comments-ui.ts`; controlled main-handler outcomes exercise recovery without adding a product test API.

| Element | Measured contract | Reason |
|---|---|---|
| Right column | 280px outer width; 279px content after the shared divider | Retains the established shell column. |
| Inspector / Comments viewports | 278px / 462px outer heights in the 1238 × 780 window; Inspector clientHeight 277 | The Inspector bottom divider belongs to its 278px allocation. |
| Independent scrolling | Comments scrollTop 0 → 50 while Inspector stays 0; Inspector 0 → 347.5 while Comments stays 50 | Wheel input stays within the panel under the pointer. |
| Comments heading | 12px / 700; 10px bottom margin; header padding 12px | Preserves the draft heading hierarchy. |
| Scope/status segments | Padding 3px, gap 4px, radius 7px, 1px border; buttons 11.5px with 5px 7px padding | Keeps selection and status controls compact. |
| Actions | 11px / 500 / normal line-height; 4px 7px padding; 1px border; radius 7px; inline-flex, 6px gap, centered, nowrap | Prevents message line-height from inflating recovery actions. Primary actions use weight 600. |
| Author | Avatar 26 × 26, radius 50%, 10px / 600; author row gap 8px; name 11.5px / 600; email/time 10px / 15px | Keeps author metadata subordinate to body text. |
| Body / target / badge | Body 12px / 19.2px and pre-wrap; target 10.5px / 15.75px; badge 10px / 15px, 1px 5px padding, radius 4px | Preserves plain text and compact target/status labels. |
| Composer | Padding 12px; target starts 8px below label text; textarea minimum height 104px, padding 9px, radius 6px, 12px / 19.2px | Matches the visible label/target/input rhythm while retaining a native wrapping label. |
| Recovery messages | Full panel content width, excluding a reserved native scrollbar; padding 12px; body 11.5px / 18.4px; heading 12px / 700 | Avoids a second inset inside the composer. Empty action groups are omitted from editor messages. |
| Message severity | Errors use a 2px error rule; unknown/conflict/quarantined recovery use warning; checking, confirmed absence, reviewed and saved states are neutral | Does not visually label a successful status check as a warning. Only reached states are claimed below. |
| Unsaved modal | Width 410px; padding 20px; radius 12px; heading 15px / 700; body 12px / 19.2px | Keeps the three transition actions within the approved dialog width. |
| Pins | Two real groups of two comments each measure 24 × 24 at 64%, 80% and 100% canvas zoom | Pin dimensions are screen-space values, independent of board scale. |
| Focused pin | 2px text-color outline, 2px offset, z-index 3 | The keyboard target remains distinguishable over another pin. The base pin uses z-index 2. |

A final-gate reproduction observed the scrolling Comments panel at 279px outer width and 268px client/message width because its native scrollbar reserved 11px. The header and recovery message share the content edges. The runtime regression compares those edges and direct-child structure; restoring the nested composer fails with 12px insets. This clarifies the measured box domain without changing the earlier no-reserved-scrollbar values or product layout.

### Context differences and comparison limits

These descriptions retain both measured values rather than labeling unequal values as exact matches. The comparison includes reused primitive/property pairings across different message specimens and headings (for example, Git Checking). Matching those primitive properties does not establish that the complete state was reached or that its full layout/copy is equivalent. The incomplete-state and unpaired inventories below remain part of the result.

- Fixture names, target IDs, dates, comment bodies, counts and runtime error messages differ from the draft examples. The application uses relative dates, preserves invalid calendar strings, supplies actual root/canvas context, and displays extra eligibility/recovery reasons. The loading message keeps the status heading without repeating the canvas name already present in the shell. These copy differences and their intrinsic widths and wrapped heights are context differences, not equality claims. TextContent is retained on every comparison row.
- The shipped wrapping constraints (`min-width: 0`, `max-width: 100%`, inherited `overflow-wrap: anywhere`) keep long author/target/body values inside the fixed column. The feature design's long-value requirement and the existing U1 presentation establish their purpose. The draft sometimes leaves these constraints implicit. A long name, email and body were supplied through a real temporary comment event; their computed styles and overflow metrics are retained even when below the scroll viewport.
- The application label wraps its target and textarea for native association. The draft uses three siblings. The same visible 8px label-to-target gap is applied as target margin-top in the application and label margin-bottom in the draft. The wrapping label's total height therefore is not comparable to the draft's text-only label height.
- Native `<dialog>` centering, viewport maximum dimensions and overflow access differ from a static `.dialog` specimen inside the board. The 410px width and child presentation are compared. The delete preview preserves body line breaks with pre-wrap; its 8px paragraph top margin collapses with the preceding heading margin, leaving the same measured 10px gap on both sides.
- Enabled and disabled specimens can differ with fixture eligibility: canvas targets have no location action, missing targets cannot be located, and missing identity/width or pending work disables relevant controls. These opacity rows are explicitly marked as different states, not same-state style matches.
- Zero-width border style/color differences are equivalent only when the corresponding side measures 0px on both elements. No border is painted. Real borders retain their separate values.
- The shared panel divider and flex/scroll context are preserved. The standalone draft's Inspector allocation includes its divider; the measured application client viewport is 277px within the 278px allocation. The comparison does not redefine the already shipped Inspector typography.

### Coverage and unverified states

Reached and measured: Canvas and Selection lists, Open and Resolved controls, empty lists, create/edit inputs, disabled controls, missing/outdated together, invalid identity/width, missing Git name and retry, known save failure, unknown outcome, external edit conflict and recovery, externally deleted comment, quarantined unknown outcome, delete confirmation, unsaved transition dialogs, read loading/failure/recovery/partial warning, long values, real pin hover/focus, grouped pins at three zoom levels and independent panel wheel scrolling. CDP full trees and a partial Comments-region tree accompany every runtime snapshot. Draft focus specimens are measured separately in the same iframe.

Not covered by a complete settled-state comparison: transient Saving, Checking saved status, original-request retry, confirmed-saved notice, failed status check, Git lookup pending/failure/name-found notice, copy-sentence preview, large/overlapping pin counts, native tooltip painting, and OS-native IME. Some are exercised behaviorally by the broader suite, which does not certify their appearance. Empty card-level action containers and extra author/warning-list paragraphs have no exact draft element and remain listed as unpaired. Outer panel/Inspector nodes are paired once at the grouped-pin checkpoint; their repeated snapshots are retained as unpaired to avoid implying repeated full Inspector comparisons. The report lists all omitted pairings, rather than inferring success from a matching ancestor.

The successful candidate comparison at source `876ee54` contains 3,208 element pairs across 52 properties (166,816 rows): 154,554 exact, 8,010 equivalent zero-width-border/collapsed-margin rows, and 4,252 explicitly classified context/constraint/state/structure differences. There are zero unclassified rows within those pairs and 236 explicitly unpaired element occurrences across 75 snapshots. These counts describe measured coverage, not all descendants or all 17 draft frames. Raw evidence and comparison receipts live under `.scratch/design-sync/comments-ui/`; the conductor receives a byte-checked copy under `.scratch/comments-ui/evidence/S/`.

### Regression evidence and verification

Eleven presentation checks in `app/e2e/comments-ui.ts` were observed red before their fixes: heading weights (panel and modal), action layout, editor target gap, full-width editor recovery, focused pin ring, recovery-action line-height, empty editor-action gap, neutral confirmed-absence message, loading heading hierarchy, and the card-conflict warning rule. They pass in the mounted application after the changes. The new loading test holds an actual list request until its typography is read.

An instrumented measurement also exposed the test choosing Canvas before Reload's selection reanchor completed. The test now waits for the original iframe to disconnect and the selected mark to return before choosing the list scope. The failed run is preserved; no product timing fix is claimed. Other measurement-harness failures (missing focus evidence and an undefined candidate) are preserved and excluded from the final comparison. The comparator removes stale outputs before regeneration and writes source/raw-data hashes only after successful completion.

At source `876ee54`, 1,112 tests in 46 files, typecheck, build, measurement and comparison all passed. The full E2E exited 0 with its own `runtime-test: PASS`; the seven runtime checkpoint images were retained and directly inspected. Each final command has an observed exit/time/source-hash receipt. The conductor relayed independent R-S review with no product red/yellow findings and authorized finalization with the stated limits. R-S reconstructed all 166,816 rows from the raw values/text and checked the 75 snapshot/source hashes. Its evidence is reconstruction and receipt inspection; no additional Electron run is claimed.
