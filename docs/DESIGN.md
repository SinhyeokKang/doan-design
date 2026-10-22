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
