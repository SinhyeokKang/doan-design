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

## Onboarding — initial implementation (2026-10-24)

Reference: `design/onboard.html`, all eight frames. This is the initial `feat-onboard` implementation, before main. The selector map comes from batch H's handoff; its independent review accepted deviations 3 and 5–13 and required fixes for 1, 2 and 4. Those fixes were already present before this measurement. The draft is unchanged.

### Measurement and contracts

The draft was opened as a served canvas in the built Electron app. Its iframe and the application renderer were read with `getComputedStyle` and document-local `getBoundingClientRect`. The fixtures reuse `app/e2e/onboarding.ts`: temporary repositories, HOME and userData outside checkouts, a short `/tmp/ob-*` root, a fake login shell and fake agents. Real onboarding paths and MCP keys were fingerprinted before and after and were unchanged. Every snapshot includes a CDP partial accessibility tree for its active dialog or body; this is not a full accessibility audit.

| Element | Measured contract | Reason |
|---|---|---|
| Wizard | 1238 × 780; top bar 40; indicator 46; footer 56; centered form/card width 640 | Preserves the four-step layout. The full-window modal has no renderer radius or shadow; the native window supplies the outer surface. |
| Indicator | 12px; 8px internal gap; 20 × 20 number/check circle, 11px / 600; 32 × 1 separators | Keeps selected and completed steps distinguishable. |
| Form | 28px vertical padding; heading 18px / 600 with 6px bottom margin; lead 12.5px / 20px with 18px bottom margin | Preserves heading, explanation and card spacing. |
| Card and item | Card radius 10, 1px border; item padding 12px 14px; grid 112px / remaining / action; gaps 4px 12px | Keeps labels aligned across CLI and agent items. |
| Item children | Label 12px / 600; sub-label 12px / 500 with 12px left padding; detail and messages 11.5px / 17.25px | Text children, including code chips, are paired separately. Code chips use 4px horizontal padding and radius 4. |
| Status chips | 10.5px / 15.75px; 1px 6px padding; 1px border; radius 4 | Preserves compact state labels and severity colors. |
| PATH output | 12px; padding 6px 9px; radius 6; 1px border | Keeps the copyable shell line distinct from explanatory text. Bash and other-shell fixtures were also reached. |
| Project fields | Padding 12px 14px; gaps 6px 12px; value 12px, block text flow with normal gap; nested project path uses inline-block, max-width 100%, hidden overflow and one-line ellipsis | Prevents the shipped Inspector `.value` flex layout from changing project-value flow. The later long-path correction is documented below. |
| First prompt | 12.5px / 21.25px; padding 10px 12px; radius 6; mark padding 0 2px, radius 3; prompt container padding 14 and gap 10 | Preserves the sentence and replaceable placeholder hierarchy, including long repository paths. |
| Replacement dialogs | Width 440; padding 20; radius 12; heading 15px / 700; body 12px / 19.2px | Matches all four replacement targets. Comparison grid is 64px / remaining, gaps 6px 10px, padding 10px 12px and radius 8. |
| Project setup dialog | Width 520; same dialog heading/body; action top margin 16 | Reuses the project fields in the smaller modal. Error content retains the selected fields. |
| Sidebar setup / first prompt | Hint 11.5px / 17.25px, padding 2px 12px 6px 34px; recovery button 11px with 2px 8px padding | Retains shipped row density while adding setup and copy actions. Not initialized is 10.5px. |
| Open-canvas uninitialized message | 12.5px / 20px; text color `--text-2`, maximum width 260 | Directs the user to the sidebar setup action. |
| First-prompt tooltip | Maximum width 420; padding 6px 12px; 12px / 16px; radius 6 | Uses the shared shadcn tooltip typography and the new call-site padding override. The 16px line height intentionally matches the shipped tooltip typography rather than the draft’s 18px. |
| Keyboard focus | Step button and confirmation Cancel: 1px solid accent outline, offset −1px | Measured after real keyboard input. Pointer-opened dialogs can focus Cancel without matching `:focus-visible`. |
| Minimum window | At 960 × 600, body y=86 / height=458; footer y=544 / height=56; last Agents card ends at y=516 after scrolling to the bottom | The scrolling body keeps the last card and footer reachable. This does not certify every error combination at minimum size. |

### Documented differences

- Fix round 1 (2026-10-24, coordinator decision after R-J): the wizard project path uses inline-block with max-width 100%, hidden overflow and ellipsis. Short paths stay beside the name; long paths move to the next line and remain a single truncated line. The setup dialog’s project path also uses one-line ellipsis. Both expose the full path through their native title tooltip, consistent with PRODUCT §7 display names (2026-10-22). This intentionally differs from the draft, whose nowrap inline path can overlap the action.
- The native full-window wizard replaces the draft's drawn window: its renderer radius is 0 rather than 12 and its shadow is none. The modal dialogs center with auto margins and use viewport-minus-32px maximum dimensions plus automatic overflow. The draft places static specimens on the board. Native corner clipping, traffic lights and shadow painting were not measured.
- The body uses `overflow: auto` instead of the draft's `hidden` (accepted H deviation 7). Dialog overflow and maximum size preserve access at smaller window sizes.
- Actual paths, project names, errors and copy labels determine intrinsic widths and wrapping. A missing PATH adds a second CLI item and a divider; the main draft specimen has PATH already configured. These unequal heights and divider values are context differences, not exact matches. The table preserves both texts and values. Empty zero-height spacers are omitted from runtime snapshots and remain in the unpaired inventory.
- A completed current step shows a check in the accent circle (H deviation 3). Already-set-up and newly initialized projects advance directly to step 4 after the project is listed, without a dwell (5). Error forms retain Token CSS and Will add before the error (6).
- MCP displays Registering… throughout Connect because main does not expose per-item progress (8). The sidebar re-root hint lasts until the next completed read (9); its behavior is covered by onboarding E2E, but its transient appearance was not paired in this run.
- Extra copy explains another skill-link target, a busy setup action and a first prompt with no project (10). Sidebar copy starts with Copy first prompt and then follows the comments copy labels (11). The wizard is a native modal dialog and uses capture handling to preserve modal keyboard behavior (13).
- Main supplies MCP unknown/spawn/timeout reasons as strings. Their paths remain plain text instead of the draft's inline code chips, and actual reasons and the app-wide Choose Check Again suffix are retained. The coordinator explicitly accepted this difference for J on 2026-10-24, together with preserving the shared tooltip's 16px line height. H's fix-round handoff is the earlier evidence for the plain-text difference.
- The new first-prompt tooltip explicitly restores 6px 12px padding (H deviation 12). H observed the shipped shadcn tooltips painting with zero padding under the unlayered reset. That existing defect remains an observed limit from H, outside this batch; J measured only the new tooltip and did not remeasure or modify shipped tooltips.
- Draft focus specimens always draw a ring. The implementation follows the shipped `:focus-visible` primitive: pointer-opened dialog buttons have no ring until keyboard modality applies. A separate keyboard measurement matches the 1px/−1px reference. Hover was exercised on Check Again; there is no separate draft hover specimen.
- Border styles/colors differ under Tailwind when the corresponding border width is zero on both sides. These rows are recorded as equivalent non-painted borders, never as exact CSS equality.

### Coverage, limits and regression evidence

Reached and paired: all four wizard screens, CLI missing/installed/other/blocked/blocked-parent (including link-other — broken link), bash/zsh/other-shell PATH instructions and copy states, shell timeout, development-without-CLI and translocation-path warnings, agent detection missing/unknown, Config location from the login shell (CLAUDE_CONFIG_DIR), shared skill installed/different/blocked, unknown MCP before and after Connect, spawn failure, registration pending/success/failure, all four replacement dialogs, changed-target refusal, failed MCP replacement, project before-open/form/error/pending, first prompt without a project and copy pending/failure/success, long prompt and tooltip, sidebar Not initialized/No canvases, project setup default/error and the open-canvas uninitialized message. Translocation was reached using a temporary executable path containing `AppTranslocation`; this does not certify Gatekeeper's actual translocation behavior.

The skipped project-step indicator shares the upcoming primitive and was measured in snapshot 001; this is primitive coverage, not a separate skipped-state fixture.

Not compared as complete states: permission-denied CLI read, the transient initial Checking read, project init timeout, project Already set up/re-root dwell, selected long Token CSS, sidebar setup pending/timeout/re-root, sidebar copy pending/failure/success, and the focused sidebar Set Up button. Some appear in the behavior suite or share measured primitives; neither establishes their complete appearance. Unpaired children include native traffic-light placeholders, zero-height spacers, indicators in different completion states, and draft code children absent from main's error strings. The table does not claim every draft tile or descendant is covered.

The fixed comparison subset contains 330 element pairs × 45 properties (14,850 rows). Raw unequal values fell from 1,006 to 986: the project-value flow fix removes 20 mismatches across four value elements and their nested path. The expanded final table contains 369 pairs / 16,605 rows: 15,488 exact, 999 equivalent zero-width-border rows and 118 documented differences, with zero unclassified rows within those pairs. There are 31 explicitly unpaired occurrences and 108 runtime snapshots. These counts describe the measured set, not full-state equivalence. Raw evidence and the selector/property table live under `.scratch/design-sync/onboard/`; the unchanged before-fix evidence is under `.scratch/design-sync/onboard-before/` in the J worktree.

`app/e2e/onboarding.ts` originally pinned project-value block flow, normal gap and inline nested path through computed styles. Before the CSS fix it failed with `flex`, `6px`, and `block`; after the fix those values are `block`, `normal`, and `inline`. That initial fix changed only `.ob-field .value`, preserving the Inspector primitive. Fix round 1 updates the nested path expectation to inline-block with coordinator approval. An extended measurement attempt failed because its setup-dialog locator still belonged to an earlier, closed Electron window; it was rebuilt from the current page, and the complete rerun passed with real-state fingerprints unchanged. No product fix is attributed to that harness failure.

Validation before fix round 1: 1,286 unit tests in 53 files, typecheck, build and the complete E2E all passed. The E2E exited 0 with its own `onboarding-test: PASS` and final `runtime-test: PASS`; no rerun for the known unrelated intermittent failures was needed. The seven shell/runtime checkpoint screenshots and four onboarding checkpoints were opened and inspected for structure.

Independent review R-J completed with 0 red and 2 yellow findings. Fix round 1 addresses the long-path overflow and this stale review-status statement; a separate post-fix independent review has not run. The existing full-state coverage limits above remain.

Fix round 1 targeted Electron measurements (`.scratch/fix-J-red.log`, `.scratch/fix-J-green.log`): before the fix, the long wizard path ended at x=1012.5625 while Open Project started at x=826.328125, failing the geometry assertion. After the fix it ended at x=814.328125 (12px clearance), with client/scroll widths 376/569 and height 13px. The setup-dialog path ended at x=858 within the right content boundary x=859, with client/scroll widths 478/498 and height 19.1875px. Both read nowrap / hidden / ellipsis and the exact full-path title. The targeted measurement also records white-space, overflow-wrap and word-break; the historical 45-property comparison table above has not been regenerated and is not claimed to describe this later deviation.

Fix round 1 validation: 53 files / 1,286 unit tests passed, typecheck exited 0, and the complete E2E exited 0 with its own comments-ui-test, onboarding-test and runtime-test PASS lines (`.scratch/fix-J-tests.log`, `fix-J-types.log`, `fix-J-e2e.log`). Isolated real-state fingerprints remained unchanged. The seven runtime checkpoint screenshots under `.scratch/runtime-test/2026-10-24T08-49-20-918Z/` were opened: project lists and restoration, canvas fit, frame selection, restored canvas, selected element and Inspector values. These establish visible structure, not complete appearance equivalence.

## Projects home — initial implementation (2026-10-25)

Reference: the unchanged, conductor-confirmed `design/projects-home.html` (eight frames). Batch C implements tasks 9–11. The first comparison and fixes were made before integration into main.

### Measurement and contracts

The measurement script reuses the real `app/e2e/projects-home.ts` fixtures, then opens this checkout's draft as a served canvas in the same Electron process. Both sides use computed style and document-local rectangles. Each paired renderer element has a CDP partial accessibility tree; this establishes the queried roles/names, not a complete accessibility audit. Temporary repositories, HOME, userData and DOAN_RUNTIME isolate the run, and the real-state fingerprints were unchanged. No clipboard operation is used.

| Element | Measured contract | Reason |
|---|---|---|
| Home | 1238 × 780 window; 40px top bar; grid body with 32px horizontal padding | Preserves the draft's full-window layout and card alignment. |
| Cards and rows | Card radius 10; 1px border; row padding 8px 10px; column gap 8; row gap 3 | Keeps worktrees grouped while preserving dense metadata. |
| Row children | Branch/path label 12px; summary/path/selection 11px; Open tag 10px / 600 with 1px 6px padding | Distinguishes the open workspace, branch, path and selected target. The selected value is a separately measured 500-weight child. |
| Context menus | Padding 4; radius 8; item padding 6px 10px; 12px text; 1px separator with 4px 2px margins | Separates reveal and removal without assigning destructive red to a non-destructive list removal. Hover uses accent text and accent-soft background. |
| Empty primary shortcut | Accent ink, opacity 0.6; inherited button typography | Keeps the shortcut legible on the orange primary button. |
| Checklist | Width 560; checkbox 14 × 14; separately measured title, lead/code, row name/path/chip and footer | Preserves independent item selection and the distinction between saved, not-set-up and suggested worktrees. |
| Confirmation | Width 440; padding 20; heading 15px / 700; body 12px / 19.2px; action top margin 16 | The body explains both adding the uninitialized project and opening setup. |
| Toast | Separately measured message and Undo; hover and keyboard-focus snapshots | Matches the compact message/action surface while the behavior test verifies timer pause and Undo. |
| Workspace top bar | 40px; branch minimum width 72, maximum 240; expanded branch accent background/border | Preserves the breadcrumb and worktree-switch affordance. |
| Missing status | Padding 7px 12px; gap 10; nested path code measured separately; action gap 10 | Keeps recovery actions aligned with Go Home. |
| New project tooltips | Padding 6px 12px, max-width 420, radius 6, shared 12px / 16px typography | Explicit call-site padding avoids the existing unlayered reset suppressing the shared utility padding. Shipped tooltips are unchanged. |
| Keyboard focus | Row and confirmation Cancel: 1px solid accent outline, offset −1px | Dedicated snapshots follow real keyboard input; pointer focus is not treated as keyboard focus. |

### Documented differences

- **Native surfaces:** Home has renderer radius 0 and no outer shadow because the native window supplies clipping and shadow; the board draft draws its own window. Native dialogs use auto centering, viewport-minus-32px maximum dimensions and automatic overflow. Home's body scrolls rather than clipping content. Native traffic-light and OS shadow painting were not measured.
- **Context:** Names, absolute temporary paths, branch names, elapsed times, selected counts and error strings differ from draft sample text. Their intrinsic widths/wrapping and row counts change element heights. The actual Home uses three fluid columns (row width about 378.66px), while isolated draft tiles use 380px cards (378px rows); the workspace status specimen is 638px wide versus the real 1238px window. The checklist's first Already added row has no top divider; the same specimen is a middle row in the draft. Both values and both texts remain in the table; these are not exact size matches.
- **Data contract, conductor-approved:** Error/loading entries retain `lastCommon` for grouping but do not retain the last branch. Home therefore shows path + ◌, and the workspace hides its branch chip while its entry is not a successful list. No new branch cache is added to B2's contract. E2E confirms that the three-row worktree card remains grouped after a loaded worktree becomes Missing.
- **Error copy, conductor-approved:** Main's error strings stay plain text, including any paths, instead of the draft's embedded code chip. Details retains the expanded/collapsed arrow. CLI error rows expose only Retry/Remove. Source: [PRODUCT decision log](./PRODUCT.md#7-decision-log), 2026-10-25 error/loading branch and raw-error decisions.
- **Suggested worktrees, conductor-approved:** Checklist suggestions display the supplied worktree folder name and full path, not an inferred branch. B2's scan contract supplies those values without additional per-worktree CLI calls.
- **Shared tooltip:** New project tooltips keep the shipped 16px line height rather than the draft's 18px. Radix positions the live tooltip; the static specimen's 10px top margin is not copied. A dedicated real tooltip snapshot includes its padding, typography and full text.
- **Focus:** Static draft focus classes always draw a ring. The implementation follows the shipped `:focus-visible` primitive, so a pointer-opened confirmation can have focused Cancel without a ring. Dedicated keyboard snapshots match the row and confirmation reference; unringed specimens paired with keyboard-focused controls are explicitly classified as different input modalities.
- **Non-painted properties:** A border style/color is equivalent only when both corresponding widths are zero. Native checkbox inherited font/color differences do not paint text because the control contains no text; its unchecked outline style is none. These rows are not reported as exact computed-style equality.

### Coverage and limits

Reached and paired: empty Home; populated Home with grouped worktrees, detached and non-Git rows; row hover/focus; selected/open row and nested selected value; row/card menus; suggested-worktree checklist with disabled confirmation; repository checklist with Already added and Not set up; held real CLI scan progress and disabled Add; nothing selected; folder confirmation and keyboard focus; removal toast default/hover/focus, card removal and file-only rejection; unsaved-comment guard; workspace breadcrumb and closed/expanded branch; worktree menu; Home Missing, Config error with details and CLI error; loaded-workspace Missing; path tooltip; drop overlay. The UI tests also cover preserved workspace iframe/selection/transform, hidden-draft guards, same-canvas worktree switching, Locate, duplicate highlight, native menu Undo and grouped-card retention.

Not compared as complete settled states: ready/unreadable/checking checklist rows, nested worktree rows inside a repository checklist, very long project/branch/canvas/selection values, minimum-window overflow, Home Reading/zero-canvas variants, workspace Config error/CLI error/Not set up/Reading, disabled problem entries in the worktree menu, all guard variants, Added/Open toast, long toast, and absolute-time tooltip. Some use measured primitives or are behaviorally exercised elsewhere; neither proves complete appearance equivalence. Native Finder drag/drop remains the conductor's manual check. The new runtime suite tests the add-paths contract and synthetic overlay visibility/modal exclusion.

The final measured subset at `28dadc8` contains 27 snapshots, 172 element pairs and 46 properties: 7,912 rows, comprising 7,321 exact, 483 equivalent non-painted values and 108 documented differences, with zero unclassified rows **within this subset**. The inventory separately lists 134 draft identifiers not directly used as selector-pair roots; some descendants are measured through an ancestor selector, so this is an identifier inventory rather than a count of unmeasured elements. It does not certify every draft tile or descendant. Raw values/text/rectangles, per-pair AX trees, the selector/property CSV and JSON, state-reproduction script and raw-data SHA-256 receipt live in `.scratch/design-sync/projects-home/`; a copy is delivered under the conductor's projects-home evidence directory.

### Regression evidence and verification

Six presentation checks were observed red in the real Electron app before their fixes: primary shortcut color/opacity, row-menu separator, confirmation explanation, tooltip padding, Details indicator and workspace action gap. The passing measurement rerun executes all six checks, as well as the behavioral suite and real-state fingerprint comparison. The fixes are scoped to new Home/workspace call sites and keep shared primitives unchanged.

At `28dadc8`, the measurement run and comparator passed, as did 1,441 tests in 63 files, typecheck and Go tests. The complete E2E exited 0 with its own final runtime-test: PASS (including comments-ui-test, onboarding-test and projects-home PASS), with unchanged real-state fingerprints. Its seven runtime checkpoint PNGs were opened and inspected, as were the populated Home/workspace/problem measurement screenshots; CSS equality comes from the computed-style table, not those screenshots. Independent Claude review R-C completed with one red, six yellow and eight note findings. The fix round below supersedes the affected behavior and measurement claims; it does not claim a second independent clean-review result.


### Cfix review round — interactions, recovery and expanded comparison (2026-10-25)

Source: R-C's `review-C.md` and the [PRODUCT decision log](./PRODUCT.md#7-decision-log), 2026-10-25 C-fix decisions. The confirmed draft remains unchanged.

- The live checklist now uses vertical automatic scrolling within its 50vh limit. Its rounded bordered surface remains intact. This intentionally differs from the static draft's `overflow-y: hidden`: a 14-candidate fixture must expose its final checkbox through a real wheel scroll and allow a mouse-coordinate click inside the list rectangle. The old overflow values matched while the behavior was broken.
- Home rows, checklist paths, recovery text and the worktree menu abbreviate paths under the HOME value supplied by main as `~/…`. Matching is boundary-aware; other roots remain absolute, and full-path tooltips retain the original path. The setup confirmation stays absolute. Main prefers its process HOME, with Electron's home path as fallback, so isolated development runs do not use the machine user's home.
- Locate on a loaded workspace keeps that workspace visible while main replaces its root. The renderer waits for the located root's list before opening its canvas. The canvas recovery copy is now “The project <name> is missing. Use Locate… to find it.” or the specified “The project <name> is not set up. Use Set Up… on Home.”
- Unsaved-comment context is `<card name> (<branch>) › <canvas without design/>`; non-Git projects omit parentheses. The Home selection label uses `tag · id`, matching the confirmed element-selection specimen. Both are pinned by tests.
- Row menus leave the Tab order and open with Shift+F10 or ContextMenu. Closing a row menu restores row focus; ArrowUp/ArrowDown then move within the card and Enter opens its workspace. Tab advances to the next card's controls. Problem-row actions remain reachable. Row accessible names include branch/path and summary. The worktree menu uses radio items with the current path checked. The sidebar × is named “Remove <name> from doan.”
- Duplicate additions preserve the remembered workspace focus, including while Home is already visible. Multi-add highlights every added card; mixed new/duplicate picks retain both highlights. Non-file drops no longer cancel the browser's default handling.
- Expanded Config error places its details below the action line in a separate `.ws-detail` surface: padding 8px 12px 10px, panel-2 background and 1px bottom divider. Go Home stays vertically centered with the other actions. The nested action group centers its buttons so the Show in Finder button retains its measured 21px height instead of stretching to 22px alongside the arrow glyph.

The expanded comparison adds ready checklist items and their nested worktree rows, workspace Config error closed/open, workspace Not set up including the canvas message, and Added/Open toast. It also pairs non-open hover/focus rows and the element-selection specimen with matching runtime states. The source at measurement is `93b4163`; the later `7c58d91` change affects mixed-add highlight handling and test readers, with no style or copy changes to these measured states.

The new subset contains **31 snapshots, 198 pairs and 46 properties (9,108 rows)**: 8,427 exact, 552 equivalent non-painted values and 129 documented differences, with zero unclassified rows in the subset. The draft-identifier inventory has 125 identifiers not directly used as pair roots; it still is not an exact unmeasured-element count. Reading/loading variants, unreadable/checking candidate rows, long values, minimum-window cases, disabled problem worktree-menu items and remaining guard/toast variants remain unverified as complete appearance states. Real Finder drag/drop, including entering directly over the canvas iframe, remains the conductor's manual check.

Size exceptions are no longer accepted by property name. `reviewed-context.json` records each reviewed state/selector/property with its exact draft and measured values and rationale; a new value requires review. The copy table compares every paired textContent: 99 exact, 3 formatting-only, 73 explicit fixture-data exclusions and 23 documented differences. Sample exclusions include names, paths, counts, target identity and menu population; they are frozen value pairs, not a blanket text exemption. Mutation checks alter a previously accepted size and sample text and confirm both become unclassified.

Non-sample copy differences are explicitly listed in `copy-comparison.json`: scan progress uses the orchestration-approved “n of N checked” instead of the static “Checked n of N”; suggested worktrees use supplied folder names rather than inferred branches; problem rows omit cached branch labels; and CLI error details remain the original plain strings. Their containing composite nodes repeat the same differences. The missing guard branch/design-prefix and selection separator differences were fixed rather than classified as sample data.

Evidence lives in `.scratch/design-sync/projects-home/` and the conductor's `evidence-C/` directory, with the initial round preserved in `round1/`. The current CSV/JSON tables, raw values and AX trees, exact review ledger, measurement-source record and comparator mutation-check log are included. The current script rejects unknown size and copy differences; reproducing the randomized fixtures requires explicitly reviewing new sample values.

Regression runs observed red before fixes for checklist scrolling, Locate retention, both recovery sentences, guard context, selection separator, missing radio semantics, singular canvas text, card Tab flow, keyboard menu access, non-file drops, multi-card highlighting, repeated duplicate focus and mixed additions. Expanded-state tests also caught Go Home dropping below the actions and action-button stretching. An early full E2E failed because the updated accessible-name reader included “Project menu …” buttons; it now reads only rows containing a Row menu button. Measurement attempts that clicked a still-loading row or advanced before a context menu restored focus are retained as harness failures, not product passes.

At this checkpoint, 64 files / 1,444 unit tests, typecheck, Go tests, build, the expanded measurement and comparator mutation checks have passed. The final full E2E at `55d7fc7` exited 0 with its own `runtime-test: PASS`, including comments-ui, onboarding and projects-home, and unchanged real-state fingerprints. Its seven runtime checkpoint PNGs and the four newly added workspace-status/toast PNGs were opened and inspected. A second earlier full run failed on the old paragraph-only recovery-details reader; the final reader uses the actual Project status region. Self-review found no remaining red/yellow findings in the Cfix diff after checking product decisions, narrow scope, IPC origin validation and simplicity; independent follow-up review is not yet claimed.


Independent R-Cfix follow-up confirmed the original findings and four decisions were addressed, then identified the stale full-runtime reader, lost late-read-after-detach coverage, and a card whose remembered keyboard row had been removed. The reader fix is in `55d7fc7`; `a8bdf0c` restores the race test against `remove()` and adds an actual keyboard removal regression, observed failing before `1b07839` derives the active row from the surviving paths. This follow-up changes no measured style or copy values. The final full E2E at `1b07839` exits 0 with `runtime-test: PASS`, including the removal regression, comments-ui, onboarding, projects-home and unchanged real-state fingerprints. Its seven runtime checkpoint PNGs were opened and inspected. Final unit tests pass in 64 files / 1,445 tests, and typecheck passes; the prior Go gate remains valid with no Go changes. Old round-one receipts and logs now live under `evidence-C/round1/`.

One independent-review note remains: Locate into a non-list root can retain the previous missing-project message in the canvas area while the status line correctly shows the new root state. This minor note was left outside the requested red/yellow follow-up fixes and is recorded for integration; no independent clean-review result is claimed.

## Design navigation — initial implementation (2026-10-25)

Reference: the conductor-confirmed `design/design-nav.html` (frames `workspace-tree`, `tree-rows`, `overview`, `overview-empty`, `quick-open`, `frame-highlight`, `toasts`). Batch C1 implemented the tree and the jump highlight, batch C2 the Overview, Quick Open, restore and this comparison.

### Measurement and contracts

`.scratch/design-sync/design-nav/measure.mjs` builds the CLI, launches the built app with a temporary HOME, userData and DOAN_RUNTIME, adds this checkout (for the draft) and temporary fixture repositories, opens the draft as a served canvas and reads computed style and document-local rectangles on both sides in the same Electron process. The fixture mirrors the draft's example: root, `checkout/`, `settings/` and `settings/team/` canvases, open comments, a canvas without `doan:width`, a canvas `doan ls` cannot read, a canvas whose image never loads (held "making" thumbnail), a frame-less canvas, and a second project for Quick Open. Real-state fingerprints were unchanged.

| Element | Measured contract | Reason |
|---|---|---|
| Overview | Covers the canvas cell (`grid-column: 2`, last row) over the still laid-out canvas area; padding 4px 24px 24px; `--bg`; scrolls | Opening a canvas fits it to the area's size immediately, so the area never leaves layout; the area beneath is `inert` while covered. |
| Sections | Heading = folder path, case kept, 11.5px `--text-2`, padding 16px 0 10px; count in `--text-4` | Paths are identifiers; the shipped uppercase section style would change them. |
| Cards | Three-column grid, gap 12; card radius 10, 1px `--line`, `--panel`, hover `--panel-2`; thumb 16:10 with 1px bottom line; body padding 9px 12px 10px, gap 2 | Matches the Home card surface at 215px wide in the shipped window. |
| Card text | Title 600 12.5px `--text`; file 11px `--text-4`; meta 11px `--text-3`, 4px top margin, open count `--accent`; title and file truncate, meta never | The title is the primary name; the file name stays readable as secondary. |
| Thumbnail states | Making: plain `--panel-2`; no `doan:width`: 11.5px `--text-3` message with a `--raised` code chip; unreadable: same message in `--warn`; image: `object-fit: cover` from the top | The first screen of the canvas is what the card previews. |
| Empty Overview | Shipped empty type (15px / 600 title, 12.5px `--text-3` hint) with Copy first prompt | Same copy and behavior as the earlier sidebar first prompt. |
| Quick Open | Modal `<dialog>` 560px wide, 64px from the top, radius 12, `--raised`, `--shadow-2`; backdrop `--board-bg` at 0.6; input line 12px 14px, 14px text, accent glyph and caret; list max 360px, padding 6; rows 30px, radius 6, active `--accent-soft`; name `--text`, context `--text-3`, project `--text-4` 11.5px; footer 10.5px `--text-3` | One modal surface over Home or a workspace; the project part never truncates. |
| Tree | Rows 26px, canvas rows 44px two-line; level indent 14px; current row `--raised` with a 2px accent `::before` bar; selected mark a 7px hollow accent diamond; Select slot 11px button | C1's implementation; measured here as task 11 covers every screen of the feature. |
| Selected element row | Padding-left 74px under a level-3 frame (`32 + level × 14`) | Measured 54px against the draft's 74px; fixed and pinned by a Sidebar unit test. |
| Row action slot | Shown on hover and on keyboard focus (`:focus-visible`) only | A clicked row keeps focus; with `:focus-within` its Select stayed up beside the hovered row's. Found by the independent review, pinned in e2e. |
| Frame without id or title | "(no id)" in `--text-3` | The shipped dimmer fallback label; it had been lost in the tree rewrite. Pinned in `app/e2e/design-nav.ts` by computed color against the resolved `--text-3` and a named label. |
| Jump highlight | 2px `--accent-line` border with a 3px `--accent-soft` halo | Reads as a transient mark, never as the selection. |

### Documented differences

- **Live versus static:** the Overview and the result list scroll (`overflow: auto`, the thin themed `native-scroll` scrollbar) where the static draft clips; clickable cards and results show the pointer cursor where the draft's specimens are static; the jump highlight animates its hold and fade where the draft draws still steps.
- **Top layer:** Quick Open is a modal `<dialog>` in the top layer, centered by margins (339px each side in the shipped window) and 64px from the top; the draft positions an absolute box with `translateX(-50%)`. The placement is the same.
- **Native input:** the draft draws the query and placeholder as spans with an accent `::after` caret. The implementation is an `<input>`: the caret is `caret-color: var(--accent)` and shows whenever the input has focus, including the empty state where the draft draws none; the placeholder is `::placeholder` in `--text-4`; native whitespace, overflow and cursor values differ without painting differently. The typed value is not `textContent`.
- **Card tooltips:** the path under `design/` is the file name's tooltip and the absolute time is the time's tooltip (the shipped Home `ChangedTime`), so no tooltip nests inside another tooltip's trigger. Relative times follow the shipped Home rule ("Yesterday", "Oct 12"), not the draft's sample "1d ago".
- **Order:** cards and tree rows sort by display name (feature design 'Sidebar tree'), so Roles & permissions precedes Team members where the draft lists them the other way.
- **Context sizes:** the hover tile is a 418px two-column specimen against the 215px grid card; the result box grows with the number of results; the jump highlight follows the fixture frame; the frame-less hint specimen has a border on both sides (238px inner versus 239px).
- **Toast for a canvas gone at relaunch:** the saved state has only the canvas path, so the message uses the file name without `.html` ("billing is no longer in design/"), the fallback the draft shows for an untitled canvas.

### Roles and names

The same script reads the renderer's accessibility tree through CDP (`Accessibility.getPartialAXTree` on each element, in the state above) for 37 implementation elements; the draft's specimens are static and carry no roles. Evidence: `.scratch/design-sync/design-nav/ax.md` and `ax.json`.

| Surface | Role and name |
|---|---|
| Overview | `region` "Overview"; each folder section a `region` named by its path ("design") |
| Card | `button`, named by its content in order: thumbnail message if any, title, file name, facts ("Checkout checkout.html 6 frames · 3 open · Just now"; "Add doan:width to preview Design tokens tokens.html 3 frames · Just now"); the image is ignored (empty `alt`) |
| Canvas area under the Overview | ignored (`inert`) |
| Top bar project | `button` "acme-web overview" |
| Empty Overview | `region` "Overview" with `button` "Copy first prompt" |
| Tree | `tree` "Canvases"; rows `treeitem` with `aria-level` (Overview 1, folders and canvases by depth, frames one deeper), `expanded` on folders and canvases; frame rows "1 Plans", the selected one "2 Upgrade, selected in canvas", an id-less one "3 (no id)"; Chromium reports the focused row as `selected=true` (selection follows focus) since rows set no `aria-selected` |
| Tree extras | Select slot `button` "Select Card form" (`disabled` on a closed canvas's frame); the selected mark is hidden; the selected element row is a `generic` with static text, not a tree item; the frame-less hint a `paragraph` |
| Jump highlight | `generic` with no name |
| Quick Open | `dialog` "Quick Open", `modal`; `combobox` "Search canvases and frames" (`autocomplete=list`, `hasPopup=listbox`, `activedescendant` set, `controls` the list); `listbox` "Results"; results `option` "Card declined — Billing & plans › 4 · acme-web · main", the active one `selected`; "No canvases or frames match" a polite `status` |
| Toast | polite `status` holding the message |

### Coverage and limits

The subset contains 127 pairs, 76 computed properties, text and the offset within the nearest row, card, dialog or bar (10,080 rows): 9,531 exact, 425 equivalent (border style and color where both widths are 0) and 124 documented in `reviewed.json` with their exact draft and implementation values and the reason, zero unclassified. The first round had 90 pairs; the independent review extended them to children, keyboard focus, closed-canvas rows and the top bar, which surfaced the two tree deviations above. Not measured: the "Preview unavailable" state (no fixture here makes a capture fail; it uses the measured `.thumb-msg`), long-name truncation and tooltips, Quick Open long values, the "1 frame" and "1,000+ frames" variants (unit-tested text), the typeahead, long-row, duplicate-id and truncated-hint tiles of `tree-rows`, the reduced-motion highlight (its 1.2s timing is pinned in `CanvasController.test.ts`) and the other two toast messages (their text is asserted in `app/e2e/design-nav.ts`). Roles and names were read for the states above only; the unmeasured states have none recorded.

### Regression evidence and verification

The selected-element indent was observed red in `Sidebar.test.tsx` and the action slot red in `app/e2e/design-nav.ts` before their fixes. The id-less frame color is pinned by computed color in `app/e2e/design-nav.ts`, observed red with its `.no-id` rule removed; the Sidebar unit test checks only the class. `app/e2e/design-nav.ts` covers the behavior of tasks 8–10 in the real app: visible cards captured first, focus moving to the next card, the empty state, folder sections and the width hint, an open canvas deleted, Quick Open from the menu on Home and in a workspace (disabled while open, Escape returning focus, another worktree through the draft guard, a duplicate id, a frame missing from the rendered canvas) and restore across real relaunches (canvas, view and tree expansion; a frame selected before quit, with the Inspector and `doan active` set, comes back with neither and is absent from `ui-state.json`; a last pan made just before a quit while the renderer is kept busy; Home, a gone canvas, a gone project, a broken `ui-state.json`). Relaunches quit at once, thumbnail captures included.
