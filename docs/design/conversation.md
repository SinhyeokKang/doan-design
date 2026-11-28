# Design measurements — Conversations

> Part of [DESIGN.md](../DESIGN.md), which holds the evidence and verification policy, the design system and the index of every screen section.

## Answer popover

Reference: `.doan/canvases/answer-popover.html` (frames `question-one`, `question-steps`, `permission`, `queue`, `collapsed`, `stack`, `states`, `widths`, `motion`, `copy`). Measured on 2026-11-26 in an isolated built app at 1238 × 780 against the draft read in a second, hidden window of the same Electron build. Each app popover was paired with the draft specimen of the same state and column (canvas panel 347, 280 and 619, the Overview, the prototype window) and compared by computed style and geometry relative to the popover, element by element (head, title, order, Collapse, body, step, question, options, input, the button groups and each button, the permission's command, reason and saving line, the error line, the bar). Requests came from a fake stream: main sent live `conversation:event`s to every window, its conversation list reported the conversation waiting, and its answer handlers resolved or refused the request as main does. No provider turn ran. Every compared property matched except the rows under 'Documented differences'.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Place | Absolute on the thread area (`.conversation-thread`), bottom edge on its bottom (gap 0 in the canvas panel at 280, 347 and 619, the Overview, the prototype window at 280 × 360 and 347 × 480, scrolled to the top and at the bottom), 16 px from the panel's sides (column 248 / 314 / 586 at 280 / 347 / 619); in the Overview as wide as the thread column (666 at 1238, 720 at 1700). `z-index` 1, under the composer's `/` list (z 2) | Spec: it stays on the thread area's bottom whatever the scroll. |
| Surface | White (`--surface-panel`), 24 px corners (`--radius-container`), `--shadow-floating`; body-sm 14/20 with −0.035 px tracking. Forced colours: a 1 px `CanvasText` border (shadows drop). Light only: a dark appearance leaves it light (DESIGN 'Light only') | The person chose the floating white surface. |
| Height | `max-height: min(70%, calc(100% − 40px))` of the thread area: 361.2 at the 516 px area of a 1238 × 780 panel, 224 at 960 × 600 and panel 280. It never gets shorter than its head, button row and error line plus the body's 8 px padding (`popoverFloor`, set as an inline `min-height`; left off while the height runs): past the cap the body shrinks to nothing and the popover rises over the thread area's top, at most to the conversation panel's top. Where even that room cannot hold them (`popoverCramped`, marked `data-cramped`), the head stays (sticky, white) and the body and buttons scroll together under it, so the popover ends on the thread area's bottom and never lies over the composer; a focused choice or button is scrolled into view under the head (`scroll-padding-top` 40) | The head and the buttons show wherever they fit; at the smallest sizes they scroll instead (the person's decisions). |
| Head | 40 high: grid `16px 1fr auto 32px`, padding 8 / 8 / 0 / 16, 6 px column gap. The 16 px provider mark; the title "<Provider> needs your answer" 14/20/500, one line, ellipsized; the order "1 of 2 requests" in caption 12/16 `--text-metadata` rgb(95,95,95) with tabular numbers, 4 px before Collapse; Collapse a 32 px icon button in `--text-subtle` rgb(82,82,82) with a 16 px chevron | |
| Body | Padding 8 / 16 / 0, 12 px gap, only it scrolls (the shipped `.doan-scroll`). The step "Question 2 of 3" in caption 12/16 `--text-metadata`, 4 px over the question 14/20/500 wrapping in full. Past the cap the body fades at its lower edge (`mask-image: linear-gradient(black calc(100% − 24px), transparent)`) until it is scrolled to the end; a body that fits has none (a scroll timeline, inactive without overflow) | |
| Options and Other | The question card's rows, carried over: the Settings group (white, 16 px corners, 16 px inline padding, no ring on the popover), rows with a 1 px rgb(232,232,232) hairline, label 14/20/500, description 12/16 rgb(82,82,82), the 16 px `ob-radio` or the 20 px `doan-checkbox`. Other and the answer input are the shipped `doan-input` on `--surface-inset` | Unchanged from the shipped card. |
| Buttons | 12 / 16 padding, 8 px gaps, in two groups: Skip ("Skip all" with several questions; `subtle`) and Stop (plain, `CircleStop`) at the start; Back (`subtle`) and the one Next / Send element (prominent black) at the end. When both groups do not fit, the end group wraps under the first and keeps to the row's end (every step at 248, and Back + Next at 315). All 32 high, 34 px corners, 14/20/500 | Next and Send hold one place. |
| Next / Send off | `aria-disabled`, fill rgb(232,232,232), ink rgb(149,149,149), default cursor, tooltip "Choose or type an answer first." (only while off) | `aria-disabled` keeps it focusable with its reason. |
| Sending | Send keeps its black fill with the 14 px in-button spinner (`aria-busy`); the option rows, Skip and Back read `--text-disabled` rgb(149,149,149) with the default cursor; Stop stays live. The surface carries `is-locked` | |
| Failed | The shared inline error (`settings-msg error`) in `.ap-error` (padding 0 / 16 / 12) under the buttons: "Couldn’t send your answer. Try again.", or "Couldn’t skip the question. Try again." for a refused Skip; the step and the answers stay, and a collapsed popover opens | |
| Bar | One button: padding 8 / 8 / 8 / 16, 6 px gap, 48 high on the same surface (the surface holds it, corners inherited): the mark, the title, the order, and a chevron up in a 32 px box (`--text-subtle`, 16 px glyph). Its name is "<Provider> needs your answer · 1 of 2 requests" with `aria-expanded="false"` | |
| End inset | The popover's height is written as `--ap-inset` on `.conversation-thread` and kept clear by `.thread-end`, a spacer after the thread inside the scroller; the scroller keeps its fixed 32 px bottom padding and ends on the thread area's bottom (measured in the prototype window at 347 × 480: scroller 188 = area 188). Jump to latest sits at `calc(var(--ap-inset) + var(--space-3))`, and shows only while the popover leaves it 56 px (its 32 px and 12 px on either side) in the thread area | As the scroller's padding the inset set the scroller's least height: in a short thread area the scroller ran 36 px past the area's bottom, and its text showed between the popover and the composer. Above a risen popover Jump to latest sat on the panel's head. |
| Motion | Appearing: `ap-enter` 400 ms (`--time-thread-enter`) `--ease-enter`, from 8 px lower and transparent. Collapse: the body and buttons fade out over 120 ms (`--time-fast`), then the height runs 400 ms `--ease-settle` to the bar (measured 1 → 159 → 592 ms). Expand: the height runs 400 ms, then the body and buttons fade in over 120 ms (7 → 436 → 553 ms). A new collapse or expand cancels the running one; a request that arrives during the fade keeps the popover open and brings the body back, while one that ends leaves the rest to collapse. Reduced motion: none of them run | The person's motion choice. |
| Folded lines | Carried over from the question card: `activity-head ask-answered` in `--text-subtle`: `Answered · <header>: <answer>`, `Skipped · <header>, <header>`, `Expired without an answer · <header>`, and for a permission `Allowed once · …`, `Always allowed · …`, `Denied · …`; one line, ellipsized, the full line in the shared tooltip while it is cut, at the request's place in event order. The folded item sits 24 px from the item above it in the Overview and 20 px in the canvas panel (`.q-folded` gap 24 / 20) | The thread's own item gap per host. |
| Accessibility | A `region` named by its title; the question's group is a `radiogroup` or `group` named "Question 2 of 3, <header>: <question>" (the step left out for one question); each request is its own subtree, so focus never stays on the next request's control in the same place. A new request shown, or one opening a collapsed popover, is read once by a keyed `sr-only` `role="alert"` with the title | |

### Documented differences from the draft

- **Column width.** In the canvas panel every width is 1 px under the draft's (314 against 315 at 347): the panel's 1 px start border ('Turn indicator').
- **Cap height.** The same cap rule against a different thread area: the app's at 1238 × 780 is 516 px, the draft slice's 540, so a capped popover is 361 against 378; at that height a body the draft draws fitting overflows by about 4 px and fades.
- **Head and buttons over the cap.** Not in the draft: where the cap is smaller than the head and button row, the popover keeps their height and rises over the thread area's top, at most to the panel's top; where that room still cannot hold them (the prototype window at 280 × 360: 108 px against 144–184), the head stays and the body and buttons scroll under it. Measured at 280 × 360: the popover runs from the panel's top (8) to the thread area's bottom (116), the composer card starts at 128; opening from the bar focuses the first choice in view (a permission's Allow) or, where a choice's row is taller than the 68 px under the head (a question's described row, 94 px), puts the row's top under the head; Tab reaches Skip, Stop and Send (or the permission's choices and Stop), each scrolled into view. While open it covers the panel head (title menu, New conversation, Hide conversation); the bar uncovers them. Jump to latest does not show there (no room above the popover).
- **Overview centring.** At 1700 × 900 the popover sits 5.5 px right of the thread column: the probe window drew an 11 px classic scroll bar beside the thread, which the column centres within; overlay scroll bars take no width.
- **Title text.** The app's provider names ("Claude Code"); the draft writes "Claude".
- **Static states.** The draft draws a focus ring on a first option row (16 px corners), a hovered scroll bar, and a tooltip; the app was measured without those states. Collapse's letter spacing is inherited (no visible effect on an icon). A spinner's box differs while it turns.

### Not verified

- Every signed-in state: the composer foot carried the "isn’t connected" row (48 px), so the prototype window's thread areas were 52 px at 280 × 360 and 188 px at 347 × 480 against about 70 and 210 signed in.
- A native notification click (main sent `notifications:click` itself; no window was brought forward), real trackpad scrolling over the popover, OS screen-reader speech of the alert, a native IME (Esc was a synthetic composing keydown).
- The `/` list and the schedule line stacked with the popover (`stack` frame), and the queue's 280 tile's wrapped command beyond the 1 px column. The queue rows' stack was checked in the built app (Overview at 1238 × 780 and the 347 px canvas panel), but positions only, not against the draft's values: the popover's bottom on the thread area's bottom, the queue 12 below it and the composer card 8 below the queue.

### Regression pointers

`AnswerPopover.test.tsx` (markup, names, steps, buttons, keys, the per-request subtree, styles, `popoverFloor`), `ConversationThread.question.test.tsx` (the thread without waiting cards), `ConversationThread.focus.test.tsx` (focus, fold, step focus, announcements), `ConversationThread.follow.test.tsx` (the end inset through the resize callback, DOM order), `ConversationThread.motion.test.tsx` (CSS), `threadMotion.test.ts` (`followResize`, `timeMs`), `questionDraft.test.ts`, `conversationStore.test.ts` (fold), `CanvasConversationPanel.hooks.test.tsx`, `ProjectOverview.entryFocus.test.tsx` and `prototype/PrototypeWindow.test.tsx` (entries). Geometry, motion timing and the runtime items are `.scratch/design-sync/answer-popover/` and `.scratch/runtime-test/answer-popover/` probes only.

## Permission request

Reference: `.doan/canvases/answer-popover.html` (frames `permission`, `queue`, `states`), measured with 'Answer popover'. The request's surface, head, bar, place, height, motion and inset are the popover's.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Order | What will run, then the agent's reason, then each saving choice's detail, in a `selectable` column with 4 px gaps | Summary before reason (ARCHITECTURE §7). |
| Command | `ask-command`: mono 12/16 (`--type-family-mono`) with 0.16 px tracking, padding 8 / 12, 12 px corners (`--radius-chip`), `--surface-inset` rgb(245,245,246), `pre-wrap` so every line that will run shows | The person chose the mono inset block. |
| Reason and saving line | Reason 14/20 `--text-standard`; "<choice>: <detail>" in caption 12/16 `--text-subtle` rgb(82,82,82) | |
| Buttons | The agent's options in its order, the allow option prominent and the others `subtle`, then Stop; 12 / 16 padding, 8 px gaps, wrapping as they need. The first option takes entry focus | |
| Sending | The pressed option spins (`aria-busy`), every other option is `aria-disabled`, and all of them read `--text-disabled`; Stop stays live; a second press does nothing | |
| Failed | "Couldn’t send your answer. Choose again." in `.ap-error` under the buttons; the options unlock and a collapsed popover opens | |

### Not verified

- A real provider's request (Claude Code's saving choice and its detail came from the fake stream's text).

### Regression pointers

`AnswerPopover.test.tsx` ('a permission request'), `ConversationThread.focus.test.tsx` (the lock, refusal and focus after an answer), `ConversationThread.test.tsx` (order, selectable text, the live title).

## Canvas handoff

Reference: `.doan/canvases/canvas-handoff.html` (frames `source-requested`, `source-handed-off`, `source-refused`, `source-cancelled`, `toasts`). Measured at 1238 × 780 with the panel at 347: the draft is copied into a fixture repo `acme-web` as `drafts.html` and `checkout-flow.html` and read in the app's canvas iframe. Conversations were seeded as real `index.json` and JSONL history in an isolated userData; the requested line came from main sending a live turn's events (`conversation:event`), the move and both toasts from main sending `conversation:handoff`. No provider signed in. The receiving conversation's first message follows `.doan/canvases/thread-polish.html` (frame `agent-bubble`), measured as 'Received handoff bubble' below says; the source's cards as 'Canvas cards' says.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Source thread | The asking turn's handoffs show as its canvas cards ('Canvas cards' below), each settled in place by its result: "Hands off when this turn ends", "Handed off" with Open on the new conversation, "Didn’t hand off." + the refusal's reason, "Didn’t hand off. It’s this conversation’s own canvas." without Open, "Didn’t hand off. The turn didn’t finish." | The card's head names the file, so the status never repeats it. |
| Gone target | When the handed-off target is no longer listed (by ID), the card's Open is hidden, not disabled, and its status ends with " · No longer in <project>". The received handoff bubble shows its reason in place of its time and Open ('Received handoff bubble') | Unlike the “Moved to” line an earlier Doan's promotion left, which disables Open. |
| Refused start | A start main refused with its own code reads as "Didn’t hand off." plus Home's start refusal for that code (`startErrorView`), for example "Didn’t hand off. Couldn’t start with Claude Code: its sign-in has expired. Choose another agent."; `canvas_not_found` reads as `not_listed` | No second wording for the start codes (clarify preset). Not drawn in the draft; pinned by `canvasCardText.test.ts`. |
| Received handoff | The receiving conversation's first message is the person's bubble with a source meta line ('Received handoff bubble' below) | |
| End of the handoff's turn | When the turn the received handoff began fails or stops, its end notice keeps its shipped text and Sign in again but offers no Edit and resend; a later turn of the person's offers it as before | The message is the earlier agent's, not the person's. Not drawn in the draft; pinned by `ConversationThread.test.tsx`. |
| Move | From the source canvas, a started handoff opens the target canvas through Quick Open's path (one canvas visit: Back enabled after it), the panel on the receiving conversation scrolled so the bubble's meta line is at the top, and keyboard focus on the bubble's group: the ring (2 px black at offset 2) is drawn on the bubble, then Tab reaches its Open. The focus waits for the render that shows the receiving conversation and is dropped once the person leaves that canvas | The arrival first lands on the render still drawing the canvas left behind. |
| Toasts | The shipped toast ('Design system' Toast), message 14/20: "drafts.html handed off to checkout-flow.html" with the prominent Open; Open on a target no longer listed answers "Couldn’t open checkout-flow.html. The canvas isn’t in acme-web." without an action | |

### Documented differences from the draft

- **Panel width.** Every thread element is 1 px narrower (thread 314 where the draft's tiles draw 315): the panel's 1 px start border, which the draft's tiles leave out ('Context window ring', 'Panel composer width').

### Not verified

- The draft's shipped parts left unmeasured: the permission notice in `source-requested` and the end notices in `source-cancelled`.
- The move's scroll (meta line at the top) and the ring on the bubble right after a real move: pinned by `ConversationThread.focus.test.tsx`; the ring was measured with the group focused by script ('Received handoff bubble').
- A real handoff from a provider turn (the R1 runtime check). Not reached in the real app: the move held by a typing composer, a dialog or a choice made while the read is awaited, the 10 s wait, and a toast's Open waiting for the list read (`App.handoff.test.tsx`); first run is checked only in the pure `handoffMove` test (`handoffView.test.ts`).
- Hover and pressed states of Open (the draft draws none).

### Regression pointers

`threadItems.test.ts` (canvas card and received handoff items, the handoff's time), `canvasCardText.test.ts` (card copy, Open targets, `canvasCardMeta`), `handoffView.test.ts` (`handoffMetaView`, toasts, `handoffMove`), `ConversationThread.test.tsx` (markup, group and Open names, Open targets, no Edit and resend), `ConversationThread.focus.test.tsx` (`focusItem` and `scrollToItem` on the bubble), `App.handoff.test.tsx` (move, wait, toasts, focus, the window's thumbnail hub), `CanvasConversationPanel.hooks.test.tsx` (the move's focus wait). Sizes and colours above are `.scratch/` probes only.

### Several handoffs in one turn

Reference: `.doan/canvases/multi-handoff.html` (frames `source-multi-pending`, `source-multi-resolved`, `source-missed-only`, `toast-multi`). Measured at 1238 × 780 with the panel at 347, the draft read in the app's canvas iframe of a fixture repo `acme-web`; conversations seeded as real `index.json` and JSONL history (main's store read `handoff.resolved.canvas` and `handoff.missed`), the pending turn sent as live `conversation:event`s, each panel opened through `notifications:click`, the summary toast from main sending `conversation:handoff` with `targets`. No provider signed in.

| Element | Measured contract | Reason |
|---|---|---|
| Cards of one turn | One canvas card per requested path, in the order each path first appeared, stacked at the turn's end ('Canvas cards'). Icons: `forward` for a handoff waiting for its judgement and handed off, `ban` for refused, cancelled and missed | A refusal or cancel of one request leaves the others' cards as they are. |
| Missed | A new canvas the turn edited and asked no handoff for: its card reads “Didn’t hand off. The agent didn’t ask to.” with the `ban` icon and Open, which opens that canvas alone through the path Quick Open uses; the card joins its own turn's stack even when main writes it after the next message | |
| Open's name | Each card's Open is named “Open <file>”, or “Open the new conversation on <file>” once handed off; its visible label stays “Open” | Several cards of one turn would otherwise offer identical “Open” buttons. |
| Summary toast | Two or more started handoffs never move the screen. Away from the source canvas page: the shipped toast with “<source file> handed off to <n> canvases” and the prominent Open, which opens the source canvas with its panel on the source conversation; Open after the source is no longer listed answers “Couldn’t open <file>. The canvas isn’t in <project>.” On the source canvas page nothing shows (measured: no toast) | The source's cards already show each handoff and its Open. |

Documented differences, beyond the Canvas handoff ones above (panel width):
- **The reply.** The draft restates `.conversation-thread .msg-agent p` after the panel's body-sm rule with equal specificity, so its reply resolves to 16/24; the app's panel reply is body-sm 14/20 as shipped.
- **The toast's shadow.** The app's `styles.css` gives the floating toast `--shadow-floating`; the draft restates only the toast's position.

Not verified: other providers, a summary toast while a single move still waits for its read (`App.handoff.test.tsx`), hover, pressed and keyboard-focus states of Open.

Regression pointers: `threadItems.test.ts` (per-path and missed cards), `canvasCardText.test.ts` (missed copy), `handoffView.test.ts` (summary copy, `handoffMultiStep`), `ConversationThread.test.tsx` (card markup, Open names), `App.handoff.test.tsx` (summary toast and its cases).

### Canvas cards

Reference: `.doan/canvases/thread-polish.html` (frame `card-open`: Open) over `.doan/canvases/handoff-card-emphasis.html` (frames `canvas-cards`, `stacks`, `widths`; `copy` for the words), which redraws the cards of `.doan/canvases/canvas-drawing-cards.html` (frames `running`, `asking`, `ended`, `many`: statuses, icons and Open unchanged). Measured at 1238 × 780 with the panel at 347 and narrowed to 280, the Overview at a 1500 × 900 window (its 720 column), the panel dragged to 568, and the prototype window's panel (280 in a 640 window): the draft copied into a fixture repo `acme-web` (with the token CSS and fonts it links served by its config) and read in the app's canvas iframe, the cards from conversations seeded as real `index.json` and JSONL history (`canvas.drawn`, `handoff.requested`, `handoff.resolved`, `handoff.missed`, handoff `user.message`s), Drawing from main sending a live turn's events. Every part of both cards was read down to `.cc-name` and `.cc-kind`: computed styles, boxes and offsets, and the CDP accessibility tree. No provider signed in.

| Element | Measured contract | Reason |
|---|---|---|
| Surface | `.card-surface`: the thread column's full width, `--surface-panel` (white), 1 px `--border-standard` (rgb(232,232,232)), radius 16 (`--radius-row`), no padding, no shadow or edge stripe; the card is its own inline-size container. One per canvas path a turn drew (`canvas.drawn`), asked a handoff for, or missed | A grey fill read as a notice. |
| Layout | Below 480 px of card width (panel 347 and 280, the prototype window): the banner on top, 16:6 of the card's inner width (312 × 117 at 347, 245 × 91.9 at 280), a 1 px `--border-standard` line under it, then the head. At 480 or wider (the Overview's 720, a panel dragged to 568): a 160 px column for the thumbnail, at least 100 high and as tall as the head, a 1 px line on its end side, the head centred beside it (720 × 102). Width alone decides, so a card never reshapes while a turn runs | 160, 100 and 480 are component constants; no token fits. |
| Banner | The canvas's capture (the Overview row's thumbnail, 480 px wide), `object-fit: cover` from the top. Without an image (not captured yet, a failed capture, a canvas without a width, Drawing, a canvas gone since, its cached image included): `--surface-inset` (rgb(245,245,246)) with the sidebar's canvas icon `panels-top-left` 20 × 20 (`--size-icon-lg`) in `--text-disabled` (rgb(149,149,149)), centred; no spinner. The same height in every state, and a new capture replaces the image in place (seen: a banner changed to the recaptured `drafts.html` at the same 117). Hidden from screen readers (no node in the CDP tree) | The status line already spins while a card draws. |
| Head | `.card-head`: grid `auto minmax(0, 1fr) auto`, column gap 8, centred; padding 12 / 12 / 12 / 16. 76 high with one status line and a meta line | |
| State icon | 14 × 14 (`--size-icon-sm`) in `--text-metadata` (rgb(95,95,95)): the shipped spinner while the turn runs on a card the turn drew, Lucide `check` for Drawn, `forward` for a handoff waiting (on a card the turn did not draw, also while the turn runs) or started, `ban` for refused, cancelled and missed | `check` says the file was written, not that the turn succeeded. |
| Name | The kind icon 14 × 14 in `--text-standard`, gap 4, then the name at body-sm 14/20 medium, −0.035 px tracking, `--text-standard` (rgb(15,15,15)), one line. A name wider than its column is cut in the middle by the component, keeping its extension (measured at 280, beside the 67 px Open: a 121.8 column, “checkou….html”, “account-….html”), with the full name in the shipped tooltip on hover | The name never wraps and Open never shrinks. |
| Status | Caption 12/16, 0.16 px tracking, `--text-metadata`, wraps (`overflow-wrap: anywhere`): “Drawing”, “Hands off when this turn ends”, “Drawn”, “Handed off”, “Didn’t hand off.” + reason, “Didn’t hand off. The turn didn’t finish.”, “Didn’t hand off. The agent didn’t ask to.”; a canvas no longer listed adds “ · No longer in <project>” and hides Open, except after a refusal that already says it is no single canvas, while a handoff waits (its path may not be listed yet) and while the card still draws (the renderer's list can lag main's by a read) | The status never repeats the file name. |
| Meta | Under the status: the folder (only outside `.doan/canvases/`), the frame count (“3 frames”, “1 frame”, “No frames”, “1,000+ frames”), then “Edited <time>”, joined by “·” in `--text-disabled`; caption 12/16, 0.16 px tracking, `--text-metadata`, column gap 6, one line (16 high) at every width, ending 8 before Open. When it does not fit, the folder cuts first, down to its first character and an ellipsis, and is shown whole in the shared tooltip while cut; the time cuts last (measured at 347, a 202.8 line: “.doan/ds” in 46.3 of its 50 beside “1 frame · Edited just now”, “.doan/ds/checkout/experiments/v2” in 37.3 of its 202; at 280, a 135.8 line: the folder at 12 and the time cut on every card, “3 frames · Edited just now” in 71.3 of its 86, “12 frames · Edited Nov 5” in 66.6 of its 72). Every card of a width is as tall whatever its meta (195 at 347, 169.88 at 280 with one status line). The time is `<time>` in the Overview's `shortAgo` words (“just now”, “2m ago”, “1d ago”, a date), moving once a minute, with the local absolute time (“2026-11-25 18:00”) in the shared tooltip on hover. A card's row is found as `canvasListed` finds it (by ID), so a renamed canvas keeps its meta. Drawing: no frame count and no image, the time stays, and the line stays when empty (measured: Drawing 193.88 high, as Drawn, at 344). A canvas gone since shows no meta and no image | What the canvas is now; nothing is stored from when it was drawn or handed off. |
| Open | The sm `subtle` button: 67.23 × 32, padding 6 / 16, capsule radius, `--affordance-subtle` fill rgb(245,245,246) (hover `--affordance-subtle-hover` rgb(241,241,242)), label 14/20 medium, 0.035 px tracking, `--text-standard`, no border or shadow, never shrinks; measured identical in every status (Drawing, Hands off when this turn ends, Drawn, Handed off, refused, missed, no frames, a folder) in the panel at 347 and 280, the Overview and the prototype window's panel at 280, and never clipped. It opens the new conversation for a started handoff and the canvas alone (Quick Open's path) otherwise; none for the conversation's own canvas or a canvas gone. In the prototype window it goes through the main window, as every Open there does | A fill reads as a button inside the white card; a fill-less trigger did not. |
| Stack | A turn's cards sit together at its end, 8 apart (`.canvas-cards`, gap `--space-2`), 20 below the item before them (the thread gap); each card is its own thread item keyed by turn and path. Five cards: 1,023 high at 347. While a request of the running turn waits, the stack sits above it and above Send now's messages, and moves below it once it folds; focus on a card's Open stays there through that move | What needs an answer stays last; a card keeps its element through every status. |
| Names | The card is `role="group"` named “<file>, <status>” (CDP: “checkout-flow.html, Drawn”); the meta stays out of the name. Open is named “Open <file>” or “Open the new conversation on <file>”; the spinner, both icons and the banner are hidden. No live region: once the turn has ended (its end event, not Stop hiding the indicator), the thread's status line adds “<n> new canvases” after the end's title | A changing time in the name would be read again. |
| Thumbnails | Each thread is one viewer of its root's shared images (the window's hub, as the Overview's list is): it asks only for the canvases its cards show (not one still drawing, which shows no image) and reports the canvases with a banner on screen, watching each card's banner, so a later card of a canvas already shown counts too, and a renamed canvas's banner under its new path (measured: the banner kept its image after a rename). A root no viewer holds keeps its images for 2 s (`LEAVE_MS`), and a viewer's first render draws from them: switching conversations on a canvas keeps the banners of canvases both threads show (measured: no frame with an empty banner for them; a canvas only the new thread shows starts empty until its image arrives). The prototype window has its own hub; main answers it for the playing root only (measured: another root and a subfolder of the root answer `unavailable`, the playing root `ready`) | A second viewer of the same root shares images and never overwrites the other's visibility. |

Documented differences from the draft:
- **Panel width.** Cards are 1 px narrower (314 where the draft's tiles draw 315; 247 at 280), and the banner's 16:6 height follows (117 where the draft draws 117.38): the panel's 1 px start border ('Canvas handoff').
- **Inherited text on containers.** The board's body is 14/20, the panel's 13/normal; only the card's containers (surface, layout, banner, head, the icon cell, the title row) inherit it, and every text part sets its own size, so no height or position differs.
- **Selection.** The app's containers have `user-select: none`, as the app's chrome does. The draft leaves them `auto`.
- **The meta line's floor.** The app sets `min-height: 16` on `.cc-meta` so a Drawing card keeps its height before it has a modified time (an unlisted canvas while the list lags); the draft's line is `auto`. With a line of meta both are 16.
- **The draft's tiles.** The draft's single-card tiles sit in a grid cell (`min-height: 0`) and its icons on a `<use>` symbol (`flex-shrink: 0`, not a flex item); neither changes a box. The spinner's box differs with its rotation phase.
- **The long name at 280.** The draft's hand-cut names (“onboarding-per…dmins.html”, and “account-settings.html” uncut and clipped in the 280 stack) are wider than their own column; the app cuts to the width it has.
- **The prototype window.** The draft draws its panel at 347; the window measured had its panel at 280 (a 640 window), so only widths and the banner's height differ.
- **Fixture text.** The source `drafts.html` is the draft itself (5 frames), relative times differ by the minutes between reads, the gone source is `gone.html`, and the stopped card's message has inline code (the draft's has none; the code fill was measured beside the “Stopped” notice: card white, code and notice rgb(245,245,246)).

Not verified in the real app: the one-line meta in the Overview and the prototype window (the same rule, measured in the canvas panel only), and the folder's tooltip on a folder cut to its ellipsis; a failed capture's banner (the same `.cc-banner.empty` rule as a pending or gone one, both measured), “No frames” without a modified time (pinned by `canvasCardText.test.ts` and `ConversationThread.test.tsx`), “Hands off when this turn ends” with its spinner, the `asking` order, and the prototype window at 347. Pressed and keyboard-focus states of Open (the shared `subtle` button); reduced motion.

A handoff from a project conversation reuses the measured toasts and move with other text: the toasts “<project> Overview handed off to <target file>” and “<project> Overview handed off to <n> canvases”, and the move from the Overview; its received message is the Overview-source bubble ('Received handoff bubble'). The toasts and the move from the Overview were not measured in the real app; pinned by `handoffView.test.ts` and `App.handoff.test.tsx`.

Regression pointers: `threadItems.test.ts` (card items, order, placement, late events, keys), `turnStatus.test.ts` (indicator past cards, a stage before `canvas.drawn`, `drawingCards`), `canvasCardText.test.ts` (copy, icons, Open targets, `canvasCardMeta`, `middleCut`, new canvases), `ConversationThread.test.tsx` (card markup, Open's `subtle` sm, banner states, meta, names, stack, status line, path-only and renamed cards), `ConversationThread.memo.test.tsx` (cards draw again for their row or the minute, not each second), `ConversationThread.focus.test.tsx` (Open's focus when the stack moves), `ConversationThread.banners.test.ts` (which banners the thread watches and reports), `thumbnails.test.ts` and `thumbnailVisibility.test.ts` (shared viewers), `overviewRun.test.ts` (unseen ignores `canvas.drawn`). Sizes and colours above are `.scratch/hce-b3/` probes only.

### Received handoff bubble

Reference: `.doan/canvases/thread-polish.html` (frame `agent-bubble`). Measured at 1238 × 780 in the canvas panel at 347 and 280 and the prototype window's panel at 280: the draft read in the app's canvas iframe of a fixture repo (with this repo's config, so its token CSS and design system are served), the receiving conversations seeded as real `index.json` and JSONL history with a handoff `origin` (a canvas source, an Overview source, a source canvas no longer listed, a deleted source conversation, a long source name, a body with a code block and one with a canvas chip), a live handoff message from main's `conversation:event` for the minute check. Computed styles, boxes and the CDP accessibility tree. No provider signed in. The Overview never shows one: a handoff only targets a canvas conversation, and choosing one in the Overview's list opens its canvas.

| Element | Measured contract | Reason |
|---|---|---|
| Bubble | The person's bubble (`.msg-user > .bubble.md.from-agent`): padding 8 / 16, radius 16, `--surface-accent-subtle` (rgb(245,240,253) with Doany), the person's bubble width rule (at most 92 % in a panel: 288.9 of the 314 thread at 347, 227.2 of 248 at 280), gap 8 between the meta line and the body, `white-space: normal`. The body is the earlier agent's Markdown at body-sm 14/20, −0.035 px, `--text-standard`, selectable; its inline code on `--surface-panel` (white, radius 4, padding 2 / 4, mono 14/20). A canvas chip in the body stays inside the bubble's padding at 347 and 280 (the group is the chip's inline-size container) | An agent's input in the person's place; only the meta line tells it apart. |
| Meta line | Inside the bubble at the top, over a 1 px `--border-standard` divider (rgb(232,232,232)) with 8 below the line: Lucide `forward`, the source's kind icon (`panels-top-left` for a canvas, `layout-grid` for the Overview), the name, a `--text-disabled` dot (rgb(149,149,149)), the time, then Open at the end. Caption 12/16, 0.16 px tracking, `--text-metadata` (rgb(95,95,95)), icons 14 × 14, gap 6; 33 high, one line in every state (`nowrap`) | The bubble's height holds as the time's words change: 77 at “just now” and at “1m ago” for a one-line message at 347. |
| Name | Medium weight, `--text-standard`. Whole when it fits (“drafts.html”, “Overview”); a longer one is cut in the middle keeping its extension (“checkout-f…s.html” at 347), first and down to 3em (36), then a gone source's reason ellipsizes (at 280: name 36, reason 104.7 of its width). A hidden copy of the whole name keeps the line's widest size, so the bubble grows back with the thread | Open never cuts. |
| Time | `shortAgo` words (“just now”, “5m ago”), moving with the host's minute clock, absolute time in its tooltip. When the thread is 275 px or narrower (the 280 panel: 248) the time and its dot are hidden, and the name's tooltip opens on every hover with “<name> · <YYYY-MM-DD HH:MM>” (measured on the whole “drafts.html”); with the time shown a whole name has no tooltip | |
| Gone source | No time and no Open; the reason in their place: “No longer in <project>” for a canvas no longer listed, “Conversation deleted” for a deleted source conversation (the prototype window reads an unanswered list as there; pinned by `handoffView.test.ts`) | |
| Open | The xs `panel` button: 24 high, padding 4 / 8, capsule radius, white fill on the tinted bubble, label 12/16 medium, no border or shadow, `flex: none`, pushed to the line's end | The white fill still reads as a button on the accent fill. |
| Names | The group is `role="group"` named “Handoff from <name>” (“Handoff from <name> · <reason>” when gone); its description is the time in words (“5 minutes ago”), read also at 280 where the time is hidden; the on-screen `<time>` is hidden from screen readers. Open is named “Open <file>” or “Open the source conversation in the Overview” | The time changes, so it is a description, not the name. |
| Focus | The group takes focus after a move (`tabindex="-1"`); the ring is on the bubble: 2 px `--border-focus` (black) at offset 2 | |
| Copy failed | Under the bubble inside the group, its end aligned with the bubble's, 6 under it (the group's gap); no toast | The bubble's own reply place. |

Documented differences from the draft:
- **Width.** The draft's panel tiles draw the bubble at 80 % (252 at 347): its restated panel rule (92 %) is overridden by its own later thread rule. The app uses the person's bubble rule, 92 % in a panel, as the person's bubble after it does in the same tile.
- **The cut.** The draft ends a long name with an ellipsis; the app cuts it in the middle, as the canvas cards' names are, with the 3em floor.
- **Group text.** The group element inherits the panel's 13/normal where the draft's inherits 14/20; it has no text of its own.

Not verified: focus and scroll right after a real move, and forced colours (left to `/runtime-test`; the ring was measured with the group focused by script).

Regression pointers: `handoffView.test.ts` (`handoffMetaView`, `handoffNameTip`), `ConversationThread.test.tsx` (bubble markup, group and Open names, the meta name's cut (`metaNameKeep`), CSS rules for the one-line meta, the 275 px container rule and the chip's cap), `ConversationThread.focus.test.tsx`, `ConversationThread.memo.test.tsx`, `forcedColors.test.ts`. Sizes and colours above are `.scratch/design-sync/thread-polish/` probes only.

## Canvas message

Reference: `.doan/canvases/canvas-message.html` (frames `source-cards`, `received`, `queue`, `toasts`). Measured at 1238 × 780 in an isolated built app: the canvas panel at 347 (and narrowed to 280) and the project Overview (its 666 column). The draft was copied into a fixture repo `acme-web` and read in the app's canvas iframe; the conversations were seeded as real `index.json`, JSONL history and `drafts.json` in the shapes main writes (a send's `handoff.requested` and `handoff.resolved` with `via`, a `sent` target with its kept `title`, chain refusals written while the turn runs, a received message's `origin` with `via: "send"` and `provider`, an agent row with `origin` in the queue). The waiting send came from main sending a live turn's events (`conversation:event`), the toasts from main sending `conversation:handoff` with `kind: "message"`. Computed styles, boxes and the CDP accessibility tree; panel 1,757 rows, Overview 658. No provider signed in. Every compared property matched except the rows under 'Documented differences'.

| Element | Measured contract | Reason |
|---|---|---|
| Send card | The canvas card ('Canvas cards') with Lucide `send` as its state icon (14 × 14, `--text-metadata`) while the send waits, once it went and when it was refused or cancelled; a handoff keeps `forward` and `ban`. Status (caption 12/16, `--text-metadata`): “Sends when this turn ends”, `Sent to “<title>”`, `Queued in “<title>”`, `… · Conversation deleted` (no Open), “Didn’t send.” or “Didn’t hand off.” before the refusal's reason. Open is the same 67.23 × 32 `subtle` button, named `Open “<title>” on <file>` and opening that conversation; a waiting or refused send opens the canvas | The title is the live list's, else the one kept at delivery, else “a conversation”. |
| Chain refusals | “That conversation is earlier in this chain.”, “A turn started by a message can send only once.”, “This chain reached 5 steps.”; a refusal written while the turn runs is refused from the start (never pending) | |
| Just-made target | A send that started a conversation names a target the list may not have yet: an id first asked about while a list read of the root is under way counts as there until that read answers, so the card does not flash “Conversation deleted”; an id a settled list already lacked stays gone through later reads (`ListedGrace`). Measured with main's order sent by hand (`listChanged`, then the `sent` line): the first label has no tail | main lists the new conversation, then writes the `sent` line. |
| Received send | The received handoff bubble ('Received handoff bubble') with the sender's provider logo (14 × 14, opacity 1) in place of `forward`, group name “Message from <name>”, description `Sent from “<title>” · <time words>`, Open named `Open “<title>” on <file>`; a deleted sending conversation shows “Conversation deleted” in place of the time and Open. Meta 33 high, gap 6. The turn it started offers no Edit and resend (measured: none on the failed turn) | |
| Agent queue row | The queue row (`.queue-item`: 40 high, padding 8 / 8 / 8 / 16, gap 8, pill, white with a 1 px `--border-standard` inset) with the sender's logo at 14 × 14, the line in `--text-standard`, and × (24 × 24) only. Held (nothing sends it until a turn the person starts here ends): the line in `--text-disabled` (rgb(149,149,149)), the logo at opacity 0.5, × unchanged, and the shared tooltip “Sends after your next message here ends” on the line (black, white caption 12/16). Named to assistive technology only: × is described by “Message from <file>: <line>” (held: “… . Sends after your next message here ends.”); the source file is never on screen | The person's rows keep Send now; an agent's row is never sent from here. |
| Order | Agent rows sit in send order among the person's rows (`queueOrder`: right after the person's row main's `after` names, before every person's row without one or when that row already left) | |
| Toasts | The shared toast, 16 from the window's right and bottom, prominent sm Open (67.23 × 32): “<file> sent a message to <file>”, “<project> Overview sent a message to <file>”, “<file> handed off to <file>” (a step 1 or later handoff), “<file> handed off or sent to <n> canvases”, “<file> sent messages to <n> canvases”. None moves the screen; one target's toast shows on any screen, several only away from the source page | |
| Overview | A project conversation's send cards in the Overview take the wide card layout (666) with the same icons, statuses and Open | |

Documented differences from the draft:
- **Panel width and inherited text.** As 'Canvas cards' records: 1 px narrower in the panel (cards 314, queue rows 322 and 255 at 280), and containers inherit the panel's 13/normal where the board's body is 14/20; every text part sets its own size.
- **The received bubble.** Its width (92 %, 288.9 at 347), one-line meta and middle cut are the shipped received handoff bubble's ('Received handoff bubble'), which the draft restates at 80 % with an ellipsis.
- **The held tooltip.** The draft draws it open in place with `white-space: nowrap`; the app uses the shared tooltip, which wraps (`normal`); the text fits on one line at 347 and 280.
- **Fixture text.** Some cards name `payment.html` where the draft names `drafts.html` (the sending canvas in the fixture is `drafts.html`, so a refusal there would be “its own canvas”).

Not verified in the real app: the person's rows mixed with an agent row (a restart returns the person's rows as a draft, so they cannot be seeded; pinned by `DockedComposer.queue.test.tsx`); a not-held agent row in a running turn (read by taking the held class off the measured row); the received bubble's stopped end and the long-title card (the same rules as the failed end and the sent card); the prototype window.

Regression pointers: `canvasCardText.test.ts` (send copy, titles, `ListedGrace`, new canvas counts), `threadItems.test.ts` (send cards' `via`, chain refusal records), `handoffView.test.ts` (received send meta, toasts), `ConversationThread.test.tsx` (send card and received send markup), `DockedComposer.queue.test.tsx` (agent rows, held state, `queueOrder`, focus), `App.handoff.test.tsx` (message toasts), `overviewRun.test.ts` (`listReads`). Sizes and colours above are `.scratch/design-sync/canvas-message-panel/` and `canvas-message-overview/` probes only.

## Fast switch

Reference: `.doan/canvases/fast-mode.html` (frames `effort-menu`, `trigger`, `thread-notice`). Measured at 1238 × 780 against the draft read in the app's canvas iframe, on the shared signed-in provider profile with real HOME. That profile's Codex account lists no service tiers and its Claude account has Fast unavailable (`extra_usage`), so the enabled row, the trigger icon and the toggle were measured with main's `conversation:models` reply replaced for the probe (Codex 0.166.0's own tier texts; one Claude model left `unavailable`). The thread line came from a stored Claude project conversation with `fast.unused` events, read in the Overview. No turn ran.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Effort menu | 200 wide without a Fast row; 280 (`.effort-popover.has-fast`, Permission's width) with one. The levels are unchanged; the shared separator (250 × 1, `--border-standard`, 4 above) then the row | A description ends within two lines; Doan never shortens a provider's text. |
| Fast row | A `menuitemcheckbox` on the compact menu row: 274 wide, padding 4 / 8, gap 8, radius 13, `align-items: flex-start`; 44 tall with a one-line description, 60 with two. The 14 px Zap in a 14 × 20 slot in `--affordance-accent` (rgb(151,59,225)) leads; "Fast" body-sm 14/20 over the description in caption 12/16 `--text-metadata`, wrapped, never ellipsized; the drawn switch last (36 × 20, 1 px `--border-standard`, `--affordance-subtle-hover`; 14 px white thumb with `--shadow-xs`; on: `--affordance-prominent` with the thumb moved 16, sliding as the shared switch's does, `--time-settle` `--ease-settle`, at once under reduced motion; unit-pinned). No check mark. Its accessible name is "Fast" and the description its description (CDP) | The icon and the switch stay on the name's line; the icon is always there, so the switch alone shows on or off. |
| Disabled row | `unavailable` from Claude's list read (measured on the replaced list's `claude-opus-5`; the real list's disabled row was only looked at): the row in `--text-disabled` with `aria-disabled`, the icon in `--text-disabled`, the reason ("Extra usage is turned off for this account.") kept in `--text-metadata`, the switch on `--affordance-disabled` with a `--surface-panel` thumb and no shadow; the trigger's name has no Fast part and no icon | The reason stays readable (PRODUCT §5 item 1 'Fast switch'). |
| Toggle | Click, Enter and Space each toggle the row with the menu still open and focus on the row; picking a level closes the menu and returns focus to the trigger (measured as `document.activeElement` and the menu's `data-state`) | PRODUCT §5 item 1 'Fast switch'. |
| Trigger | Fast on adds the 14 px Zap in the accent after the level label, `flex-shrink: 0` (Home sm 85.36 → 105.36 wide with "High"). Its name and tooltip as in PRODUCT §5 item 1 'Fast switch'. The docked xs trigger always has its tooltip; Home's sm trigger has one whenever the model offers Fast, an unavailable row included | The icon is the only mark when the docked label hides. |
| Docked steps | With Fast on and "Extra high", the tray keeps its steps: Permission's label hides below a 432 px content width, Effort's below 384 ('Picker default labels', measured 432/431 and 384/383); the tray never overflows (content 264–456). The Fast icon's 14 at every width and the range 231–471 were measured under the earlier steps | The accent icon is the state's only mark once the label hides; the container steps are the docked composer's. |
| Thread line | A folded activity line (`.activity-head.fast-note`): padding 6 / 8 / 6 / 12 with −12 start margin, gap 8, radius 20, body-sm 14/20 `--text-subtle`; the 14 px Zap in the accent, 3 px down so it sits on the first line; the text wraps (two lines 52 tall). It sits in its turn after the reply, before a failed turn's end notice, and stays on reread | Draft frame `thread-notice`. |

### Documented deviations from the draft

- **Line spacing.** The draft draws the thread line inside the reply's `.msg-agent`, 8 below the reply; the app draws it as its own thread item, so it sits the thread's item gap below (24 in the Overview), as every folded line does (see Answer popover 'Folded lines').
- **Measured labels.** The measured menus' model names and levels come from the replaced list ("GPT-6.1-Sol" with five levels up to Max, where the draft draws "GPT-6.1 Sol" with four); in use both are the provider's, so a menu's height follows them.

### Not verified

- The enabled row and trigger icon with a real model list (this profile offers none; measured with a replaced list), and a real `fast.unused` from a turn (BACKLOG 'Not verified in the real app').
- The terminal session's fixed trigger in the real app (no terminal-session record was reached); pinned by `DockedComposer.test.tsx`.
- The thread line in the canvas panel (project conversations show in the Overview only), VoiceOver speech, hover and focus-visible states of the row.

### Regression pointers

`ComposerParts.test.tsx` (row, trigger icon and tooltip), `DockedComposer.test.tsx` (fixed trigger), `homeComposer.test.ts` (Fast view and names), `ConversationThread.test.tsx` and `threadItems.test.ts` (the line), `ds/checks.test.ts` (accent places). Sizes and colours above are `.scratch/` probes only.

## Turn indicator

Reference: `.doan/canvases/turn-activity.html` (frames `states` (1)–(12), `widths`, `reduced-motion`; `copy-format` is the wording reference). The draft is copied into a fixture repo `acme-web` as its own canvas and read in the app's canvas iframe, at 1238 × 780 (panel 347 and the 280 minimum) and at 1400 × 860 for the Overview's 720 column. No provider signed in: main's conversation handlers were replaced, the read reply carried the injected stage, a later stage was pushed on `conversation:stage`, and each turn's start was set at the read so the time shows the draft's value. The only differences are the documented panel width and the context kinds below. The `copy-format` words and elapsed format were checked against `turnText`, `turnAnnouncement` and `elapsedText`.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Place | The thread's last item, in the reply's place: after the last item at the thread's item gap (20 in the panel, 24 in the Overview), after a Send now sending message, and under the hand-off line. Absent while a permission request or a question waits in the answer popover (measured with the shipped permission card, before the popover) | PRODUCT §5 item 3 'Turn indicator'. |
| Line | `.ti-reply`: flex, centred, gap 8, `--text-subtle`; one line in the reply's type, body-sm 14/20 (−0.035 px) in the panel and 16/24 in the Overview, so it is 20 / 24 high in every state: a stage change pushed after the read kept the item 20 high and the scroll height unchanged | The follow watches the thread's height (a ResizeObserver, 'Thread motion'), so a stage change that changed the line's height would move a followed thread. |
| Logo | The provider logo, 16 × 16 (`.logo`) | |
| Words | `.ti-text ti-shimmer`: `--text-metadata` (rgb(95,95,95)) words drawn by a text-clipped gradient (transparent colour and fill): stops at 42.5 / 47.5 / 52.5 / 57.5 % with the white band `color-mix(in oklch, --text-metadata, --surface-panel 55%)`, size 200 % × 100 %, `ti-shimmer` 2 s linear infinite (background position 100 % → −100 %, read moving in the app). A long path ends in an ellipsis (clipped at 347 and 280; whole at 720) | Dark words under a strong white sweep, no accent. |
| Time | `.ti-time`: `flex: none`, `--text-metadata`, tabular figures, `aria-hidden`; never sweeps. `0s`, `59s`, `1m 0s`, `59m 59s`, `1h 0m 0s` (`1h 4m 12s` measured), 0s for an unreadable or future start | The stage gives way first; the time keeps its width as it counts. |
| Reduced motion | No animation and no background; the words `--text-metadata` (rgb(95,95,95)) still change with the stage | |
| Accessibility | Not a live region and nothing focusable; the time is not in the AX tree; the thread's `sr-only` status says the stage kind only ("Codex is reading files" for a path) and "needs your answer" while a card waits (CDP AX) | PRODUCT §5 item 3 'Turn indicator'. |

The activity rows' styles were unchanged: head, label, spinner and chevron equal the draft's restated rules in every state apart from the context kinds below (`styles.css` adds only the indicator's rules). Their running state no longer matches the draft: the last row spins only while the indicator names a tool, with the indicator's words (`activityRun` in `turnStatus.ts`, PRODUCT §5 item 3 'Turn indicator'), so the draft's state (5) and its widths tiles, a spinning row beside a working indicator, do not occur in the app. Not re-measured since.

### Documented differences from the draft

- **Panel width.** Every thread element is 1 px narrower in the panel (thread 314 where the tiles draw 315): the panel's 1 px start border ('Canvas handoff').

Context, not deviations: the Overview column is 720 centred in a wider window (54 px auto margins); the draft page's reset (`.activity` border style, 0 wide) and its board-only `:where(svg){flex:none}` on the activity chevron; the shipped spinner's rotation phase; the permission notice's `role="alert"` only for a request newer than the read; and in (6) the streaming caret's height (one line, 20 in the panel: 'Project Overview', 'Streaming caret height'); the indicator keeps the 20 px gap under the reply (measured with the caret in a paragraph, a list item and a code line).

### Not verified

- Any real provider turn (every state is injected); Copilot's thinking stage (Claude's was measured; same markup).
- The timer stopping in a hidden window and recounting from the start (unit-tested only).
- The shipped spinner under reduced motion (the reduced-motion tile has no activity row); how the text-clipped gradient renders in dark mode and forced colours.

### Regression pointers

`ConversationThread.turn.test.tsx` (markup, place, accessibility, reduced motion), `turnStatus.test.ts` (states, words, elapsed format), `App.turnStage.test.tsx` (stage wiring). Sizes, colours and the sweep are `.scratch/` probes only.

## Thread motion

Reference: `.doan/canvases/thread-motion.html` (frames `entry`, `stream`, `scroll`, `reduced`). Measured on 2026-11-25 in an isolated app at 1238 × 780 (canvas panel 347, the Overview, the prototype window at 1100 × 780). Replies were a fake stream: main sent live `conversation:event`s to every window, and main's send, queue, Send now and interrupt handlers were replaced by ones the probe answered as main does. One real Codex turn (a new canvas conversation, a 2,624-character reply) checked the reveal at a real provider's pace. The entry is compared by computed style; the reveal and the follow by their constants against the draft's style comment and script, by per-frame samples and by recordings.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Entry | `.msg-user.thread-enter`: `animation: thread-enter` 0.4 s (`--time-thread-enter`) `cubic-bezier(0.23, 1, 0.32, 1)` (`--ease-enter`) `both`; keyframes offset 0 `opacity: 0`, `transform: translateY(16px)` (`--space-4`), offset 1 `opacity: 1`, `transform: none`, the draft's `enter-a`. Transform and opacity only, so the thread's height and its follow never move with it | The person chose rise A. |
| Entry under reduced motion | `thread-enter-fade` 0.15 s (`--time-state`) `ease` (`--ease-state`) `both`, opacity only, the draft's `enter-fade` | DESIGN.md 'Motion'. |
| Which messages enter | A message this window sent: a direct send (panel, Overview, prototype window), Send now, a queue going out after the turn (one combined message), a new conversation's first message (real Codex turn). The history, a terminal's message and a received handoff do not. A Sending message that the history's message replaces keeps one entry: the new element goes on with a negative `animation-delay` (−22 ms measured in the Overview) | Local send marks in the store, spent once the thread drew the history's message. |
| Reveal | Word by word (`Intl.Segmenter`, whole lines in code blocks, a table row by row once its header and delimiter arrived, an unfinished trailing link held). The oldest hidden character shows within `MAX_LAG_MS` 400; `message.done` finishes the rest within `FINISH_MS` 150; both are the draft's constants. A reply that arrives while the thread is open reveals from its start; a remount (panel folded and unfolded, a conversation switched away and back) starts at the text it has | The person chose reveal B at a 400 ms cap. |
| Fade | Each run of words shown in one frame fades from transparent over 400 ms (`--time-thread-enter`) with the draft's cubic ease-out, 1 − (1 − t)³, drawn as inline opacity from the run's age, so a render for any other reason never restarts it. 108–147 fading spans at most in the 10,000-character reply | |
| Shown whole at once | Any item after the reply (a waiting permission request or question counts, though it shows in the answer popover rather than the thread), a notice under the thread, a failure, an interrupt, a Stop (`stopping`), a selection inside the reply (which keeps the selection), a window shown again after being hidden | Text still arriving above a new item would push it away, and a render each frame would undo a selection. |
| Follow | One rAF loop and a ResizeObserver on the content and the scroller. While a reply reveals the view is at the bottom every frame (0.5 px at most at the next frame's start, in the panel, the Overview, the prototype window and the real Codex turn); a one-time growth (a new item, a sent message) eases with `followStep`, τ 40 ms, the draft's `TAU_MS` (recorded 711 → 728 → 748 → 756 → 759 → 761 → 762 → 763 in the prototype window) | |
| The person's scroll | A wheel, a press on the scroller itself (its scrollbar) or a scroll key pressed outside a field that scrolls the thread stops the follow at once. Once the input that stopped it ends (100 ms after the last wheel event, a key at its scroll's `scrollend`, a press at its release), a move of 48 px (`NUDGE`) or less from where it began follows again with an ease; 24 px (`BOTTOM`) or less from the bottom it follows again at any time. Later growth shows Jump to latest only past `followBand` (a third of the scroller's height less the end inset, 120 at least) and only once that input is judged (only growth: a row folding or a viewport resize does not); Jump to latest eases to the bottom through the same follow. These rules come from `.doan/canvases/thread-polish.html` frame `follow`, a diagram that is not measured. Entries no longer scroll to a waiting request (the answer popover shows it); `scrollToItem` remains for the received handoff (its top at the top) and is a plain scroll | The person's reading place wins over new output. |
| End inset | The answer popover's height comes back as the thread's end inset (`--ap-inset`, 'Answer popover'). At the bottom an inset change lands at once (no ease) and keeps the bottom; scrolled away it is not new content, so Jump to latest shows only for the content's own growth (`followResize` reads the thread's own height apart from the inset). Measured through collapse and expand at 347: 46 frames each, distance 0, the last item never under the popover, no Jump to latest | The popover appears whole, so an eased follow would leave the last item under it. |
| Scroll anchoring | `overflow-anchor: none` on `.thread-scroll` | Chromium's anchoring moved the followed view by itself when a reply showed whole above a new card, which read as the person's scroll and stopped the follow. |
| Forced colours | The sent bubble, a sent file chip, code blocks, quotes and a table's outer edge take a 1 px `CanvasText` border, Jump to latest a 1 px `ButtonText` border; checked with CDP-emulated forced colours, light and dark, in the canvas panel at 347 and the Overview | Forced colours paint fills as Canvas and drop shadows, so these shapes otherwise read as plain text and Jump to latest sits on the reply with no edge. |
| Reduced motion | The reply shows each chunk as it arrives (no fading spans), the view jumps to the bottom | DESIGN.md 'Motion'. |
| Frame cost | The 10,000-character reply (three code blocks, a 14-row table) re-rendered whole each frame at 347, timed per frame as every rAF callback plus a forced style and layout (paint excluded): at load average 3.4–3.5, p95 6.3–6.4 ms and max 6.9–8.2 ms in all four runs (40-character chunks every 30 ms and 400-character chunks every 250 ms, two each), rAF interval p95 17.5–17.6 ms, no long animation frame | The budget is p95 ≤ 16 ms and max ≤ 50 ms, so the reply is not split into memoized blocks. Runs at load average 9–28 exceeded it only while the rAF interval itself was 33–83 ms. |
| Real provider pace | Codex sent 565 deltas of 4 characters (p50; p95 9) about 1 ms apart in bursts with gaps up to 329 ms. The last fading run ended 250 ms after the last character showed, and the last character showed 78 ms after `message.done` | A line's end is faint for less than the 400 ms fade. |

### Documented differences from the draft

- **Entry element.** The rise is on `.msg-user` (the bubble with its files, Sending line and chip note), where the draft animates `.bubble` alone: a message's files belong to it and rise with it.
- **Keyframes.** The stylesheet writes only `from`; the computed keyframes are the draft's two.
- **Reveal pace.** A linear catch-up to the oldest hidden character's deadline, where the draft's board loop takes an exponential share of the hidden text each frame plus an overdue flush per chunk. The 400 ms bound is the same; at a real provider's pace the two cannot be told apart in the recording.
- **Fade.** Inline opacity per frame, not a keyframe with a negative delay: React reuses a span for another run as runs end, and a running animation would carry the earlier run's start.
- **Turn end without `message.done`.** A reply ended by `turn.done` alone finishes over `FINISH_MS` (150 ms) instead of at once: the thread sees only that the reply stopped streaming, as after `message.done`. A failure, an interrupt and a Stop show it at once (an end item follows, or `stopping`).
- **Holds.** Trailing unfinished links, tables before their delimiter row and unfinished code lines are held while streaming without the 400 ms cap; the draft's reply has none of them.

### Not verified

- A real scrollbar drag and real trackpad momentum: the probe pressed on the scroller and scrolled it (overlay scroll bars cannot be grabbed), and sent wheel events.
- A reply still revealing when a request arrives, with the request in the answer popover: the flush was measured with the shipped permission card in the thread.
- Home's new conversation first message (the canvas panel's was a real turn; Home's mark is the same call after `run.start`), dark mode and forced colours.

### Regression pointers

`ConversationThread.motion.test.tsx` (entry targets and carry-over, CSS, reveal frames, fade, Copy, follow decisions), `threadMotion.test.ts` (pure steps), `conversationStore.sends.test.ts` (local send marks). Timing, recordings and the real turn are `.scratch/thread-motion/` probes only (`measure.mjs`, `probe.mjs`, `codex-turn.mjs`).

## Edit line counts

Reference: `.doan/canvases/thread-edit-lines.html` (frames `steps`, `heads`, `widths`; `copy` is the wording reference). The draft is copied into a fixture repo `acme-web` as its own canvas and read in the app's canvas iframe, at 1238 × 900 (panel 347, then the 280 minimum) and at 1440 × 900 for the Overview's 720 column. No provider signed in: the histories were seeded as files (v2 index plus `activity` + `activity.result` events). Every difference is listed below.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Step counts | `.activity-steps .lines` after the path: one inline run `+N −M` with a real space, `flex: none`, `nowrap`, tabular figures, sans (`--type-family`, Geist) in the path's caption size 12/16 (0.16 px); `.add` `--text-diff-added` rgb(33,131,88), `.del` `--text-diff-removed` rgb(206,44,49). The minus is U+2212, thousands are grouped (`+12,345 −2,048`), zero shows (`+0 −0`) | The path ellipsizes first, so a count arriving after its step leaves the step one line. |
| Folded head | The step count, `.head-sep` "·" (`flex: none`, −4 px inline margins, `--text-metadata` rgb(95,95,95), `aria-hidden`), then `.lines` in the head's body-sm 14/20 (−0.035 px), tabular figures; the head's hover fill covers the total too. A head with no known counts and a running head are as before (no separator, no total) | The step count gives way before the total. |
| One line | Every step 20 high and every head 32 high at 347, 280 and 720; at 280 a long path falls to 46 px (`src/c…`) while `+12,345 −2,048` keeps 87.8 px | Arriving counts must not change the thread's height. |
| Accessibility (CDP) | The head button's name is the whole line: "5 steps, 20 lines added, 6 removed", "1 step, 1 line added, 1 removed", "4 steps" without counts. Each run is `image` named "8 lines added, 3 removed" | Signs read as symbols otherwise. |
| Copy | Selecting a step gives `Edited⏎<path>⏎+8 −3` (the verb, path and run are flex items, each its own line), never the spoken name; a step without counts copies as before | `role="img"` with `aria-label` keeps the name out of the selection, where an `sr-only` span would enter it. |

### Documented differences from the draft

- **Panel width.** Steps are 12 px narrower than the tiles in the panel (303 against 315 at 347, 236 against 248 at 280): the probe window drew an 11 px classic scroll bar beside the seeded, overflowing thread (the draft slices do not scroll; with overlay scroll bars it takes no width), and the panel's 1 px start border ('Turn indicator'). Every step row, also those without counts, shows it, so paths ellipsize 12 px earlier there.
- **Head widths in heads (1) and (6).** The seeded rows say "5 steps · +20 −6" and "1 step · +1 −1" where the tiles say "6 steps · +42 −10"; every style of those elements equals the draft.

Context, not deviations: the draft page's board-only `:where(svg){flex:none}` on the activity chevron (the app's chevron computes `flex-shrink: 1`, as shipped); a 0.16 px text width difference of one path between the board and the app.

### Not verified

- A running head and a step whose result has not arrived (`steps` (5), `heads` (4)): they need a live turn; markup and the head rule are unit-tested only. Counts arriving while the thread is open and the scroll height then: the deferred `/runtime-test` with a real provider.
- The prototype window's conversation panel (same component and rules as the canvas panel).

### Regression pointers

`threadItems.test.ts` (matching by call and exact stored path, adding up, other turns, totals), `turnStatus.test.ts` (results never age a stage; the last row keeps its total), `ConversationThread.test.tsx` (head and step markup, names), `ConversationThread.copy.test.tsx` (Electron selection of a step). Probe: `.scratch/design-sync/thread-edit-lines/measure.mjs`, `result.json`, `panel-347.png`, `panel-280.png`, `overview-720.png`.

## Older model disclosure

Reference: `.doan/canvases/model-drawer-older.html`, frames `inline` and `settings`, read in the built app and its canvas iframe. The model lists use the repository's `models-older.json` fixture through its parsers, returned by a replaced `conversation:models` handler; no provider turn is sent.

| Element | Measured contract |
|---|---|
| Older models line | 32px high, 6px / 12px padding, 8px gap, 19px radius; transparent at rest, rgb(245,245,246) on hover. Label: Geist stack, 14px / 20px, weight 400, -0.035px tracking, rgb(82,82,82). |
| Count | 12px / 16px, weight 400, 0.1596px tracking, rgb(95,95,95); the provider's count follows the flexible name. |
| Chevron | 14 × 14px in the 16px-wide check slot, rgb(95,95,95); expanded transform `matrix(-1, 0, 0, -1, 0, 0)`. |
| Keyboard focus | A 2px solid black outline on the disclosure; ArrowRight expands and ArrowLeft folds while the line remains focused. |
| Accessibility | Real Chromium accessibility tree reports a `menuitem`, expanded state, and label-first names such as `Older models (Claude Code), 8` and `Older models (Codex), 4`. |
| Selected older model | Choosing GPT-6-Sol in Home or Settings and reopening exposes the older group and its checked row. Cursor's 22 older rows also expand in the shared menu. |

The **Picker default labels** Settings menu density deviation applies: the draft's compact 280px Settings menu does not replace the shared shipped menu (184px with this fixture, 174px row width). Its line keeps the same 32px height as the draft, with shipped padding 6px / 12px and 19px corners instead of 4px / 8px and 13px. The agent menu remains 300px wide and capped at 384px; its scrollbar gutter makes the line 282px wide, versus 290px in the unrolled draft. The draft intentionally unfolds full menu contents for comparison. Accessible names follow the label-first contract above, rather than the draft's alternate wording.

Draft hover/focus states were not independently compared: its static rows are not keyboard-focusable, and the tested hover target was clipped by the board viewport. Actual app hover and keyboard focus were measured. Loading, error and disabled disclosure states have no draft frame and are not claimed as compared. The disclosure is not itself a selectable model.

Placement and folding follow ARCHITECTURE §7 'Agent conversation runtime and IPC' (Models, older models). Keys: the nearest older row is reached with Up in an upward menu and Down in Settings or a downward composer; Left from an older row folds and returns focus to the line; Enter, Space, Right and Left on the line keep the menu open and focus on the line. Runtime probes, separate from the style measurements, checked Home, Overview, the canvas's new-conversation panel, an existing docked conversation and Settings, including reopening with a selected older model (the composer sends carried it in the intercepted start/send IPC, and Settings saved it); no provider turn was sent, and the Overview's unfolded menu was checked in a screenshot only. At 1440 × 1000 the line stayed at the same viewport top across toggles in upward menus (with and without a scroll range, and capped), in Settings' bottom placement, in a composer Radix placed below, and in every probed host; the nearest older row stayed fully visible (holding the line wins when both cannot fit), and a second click at the same spot folded the group with the menu open. Also checked: a delayed model list unfolding the selected older group with its checked row in view, a flipped composer reopening with the disclosure before the older rows, and a delayed list without a toggle, where the height cap can keep the menu above its anchor while moving the anchor into less space still flips it below.

## Project skill drawer

Measured against `.doan/canvases/project-skill-drawer.html`, frames `home-words`, `docked-capsule`, `docked-box`, `ime`, `bubble`, `popover-tabs`, `popover-search`, `slash-list`, and `preset-failed`, in the built Electron app. Both sides use the same Chromium and Geist font. The draft is read from the app's canvas iframe; Home, Overview, and the canvas conversation panel are reached through the real app. Provider skills, account readiness, conversation events, and preset failure states are fixtures in the isolated main process; no provider signs in or runs a real turn. The `clarify` design preset supplied the copy reference.

| Surface | Measured values |
|---|---|
| Skill word in Home and both docked shapes | Inline text, Geist 16/24, weight 500, `--surface-accent-subtle` rgb(245, 240, 253), `--text-accent-subtle` rgb(84, 56, 113), radius 6, padding 0 / 6. The field still uses ordinary character units; punctuation and Korean suffixes remain outside the span after composition commits. |
| Sent skill word | Same type, ink, radius and padding; the bubble overrides the fill with `--surface-panel` rgb(255, 255, 255). Names come from the sent fixed lines, independently of the current skill list. |
| Popover | 691 wide while skills exist, otherwise 600 (809 with the Commands tab, 'Provider commands'); the slash list remains 600. Radius 24, padding 4, transparent 1 px border, 90% white floating glass. The seven-tab row fits without changing existing tab sizes. |
| Project skill row | 50 high with description, 36 without; padding 6 / 12, gap 12, radius 19. Title 14/20, weight 500; description caption 12/16 with its tracking in metadata ink. Long names ellipsize in the drawer and wrap as ordinary text in the field. |
| Row icon tiles | 24 × 24, radius 10, 14 × 14 SVG. Presets keep the suggested-prompt tile's accent step 3 fill and accent group icon. Skills use `--affordance-backdrop-hover` rgba(0, 0, 0, .06) and `--text-standard` rgb(15, 15, 15), with SquareSlash. |
| Tabs | Preset popover Suggested/group icons use `--text-accent`, rgb(151, 59, 225); Project uses SquareSlash in `--text-metadata`, rgb(95, 95, 95). Quick Open icons remain rgb(15, 15, 15) when selected and rgb(82, 82, 82) otherwise. Existing tab padding, labels and selected fill remain; a vanished tab restores focus only from its tab/list, preserving search focus. |
| Empty and failed lists | Without skills the search is “Search presets” and there is no Project tab. With skills it is “Search presets and skills”; no-match copy names both. Preset loading, failure and older-CLI notices remain above usable skill rows. |

### Documented differences

- The portalled popover and tab-list containers inherit the app body's type (Evidence and verification policy). Keep the shared primitive; changing these unused inherited values would affect unrelated menus.
- The long Home sentence in `h-j-field` is 48 px high in the contenteditable and 48.5 px in the draft. Temporarily hiding only the draft's decorative `.caret` makes the draft exactly 48 px; the native caret adds no layout height. No product adjustment is needed.
- Draft Project rows omit `tabindex`. Consequently the shared option hover/focus selectors do not apply there: the draft row remains transparent on actual pointer hover and cannot receive focus. Live rows retain the existing keyboard-focusable option behavior and rgb(245, 245, 246) hover/focus fill. The draft's focused state is unavailable, not an equality claim; live focus and hover values were read separately.

### Verification and limits

The probe also checked slash whitespace closing/reopening, insertion at a middle caret, undo after a slash-row choice, exact matching, sent bubble highlights, and capsule-to-box transitions in Overview and the canvas panel. Synthetic composition events cover the visual in-progress and committed specimens; they do not verify a native input method. The accessibility tree was read through CDP. Screenshots were inspected alongside computed values, never used to infer a matching color or size.

Quick Open uses its live markup under main’s tokens and styles in a separate document for the baseline comparison.

Not verified: native macOS Korean IME, real Claude Code/Codex skill invocation, OS screen-reader speech. The static draft has no reachable keyboard-focus state for its option rows. Logic coverage is in `skillWords.test.ts`, `Home.test.tsx`, `HomeComposerView.interaction.test.tsx`, `DockedComposer.interaction.test.tsx`, and `ComposerSkills.test.tsx`; geometry and native behavior stay in the temporary probe.

## Folder attachments

Measured against `.doan/canvases/folder-attachments.html`, frames `folder-home`, `folder-overview`, `folder-canvas` and `folder-states`, at 1400 × 1000: the draft opened in a second window of the same Electron build against the app's Home, Overview and canvas conversation panel. Main's conversation list, history and queue answers and the renderer's sign-in snapshot were stubbed in main for the Overview and the panel, so the queue and the sent message could be drawn with no agent signed in; attachments, their checks and the start's recheck (Moved or deleted, Replaced) ran for real.

### Measured contracts

| Surface | Measured values |
|---|---|
| Folder chip (draft, all three composers) | The shared attachment chip: 40 high, padding 4, gap 8, radius 12, max 256, `--surface-inset` rgb(245, 245, 246). Icon box 32 × 32, radius 8, white, lucide Folder 16 in rgb(82, 82, 82); name 12/16 weight 500; meta “Folder” 12/16, 0.1596 px tracking, rgb(95, 95, 95); no size. × 24 × 24 in rgb(95, 95, 95). A long name ellipsizes inside the 256 cap; the path tooltip is the shared one ('Canvas conversation panel' Tools row; max 384, wraps) |
| Sent folder chip | The thread's sent chip with the same icon, name and “Folder”, no × |
| Checking | Spinner in the icon box, meta “Checking”, Send disabled (rgb(232, 232, 232) fill, rgb(149, 149, 149) icon), reason “Checking attachments” 12/16 rgb(82, 82, 82), 16 left padding |
| Moved or deleted, Replaced | `problem` chip: TriangleAlert and meta in rgb(100, 23, 35), meta “Moved or deleted” or “Replaced”; Send disabled; the docked composer's notice (padding 12 / 16, gap 6, radius 16, the inset fill, 14/20 in rgb(100, 23, 35)) reads “<name> was moved or deleted. Remove it, or attach it again.” or “<name> now points to a different folder. Remove it, or attach it again.” |
| Queue row with attachments | The row stays 40 high (padding 8 / 8 / 8 / 16, gap 8, pill, white, 1 px inset rgb(232, 232, 232)); Send now 24 high and × 24 × 24 stay. Before the text, the first folder's name and `+N` for the rest: 12/16, 0.1596 px tracking, rgb(82, 82, 82), gap 4, Folder icon 14 × 14 that never shrinks, name ellipsized. Its tooltip lists every attachment, name in weight 500 over its path, 8 between items; the same list is the summary's `aria-label`, which Send now and × name in `aria-describedby` |
| Queue summary cap | 180 px; 100 px while the queue is 431 px or narrower (checked: 431 → 100, 432 → 180; the canvas panel's queue was 367 → 100) |
| Keyboard focus on × | 2 px solid black outline, offset 2. × moves focus to the next chip's × (checked in the real app) |

### Documented deviations from the draft

- **Narrow cap boundary.** The draft draws the queue at 720 (180 cap) and 360 (100 cap) only. The app switches at the queue's own width of 431 px, the breakpoint the docked tray already uses for the permission label, so one container width decides both.
- **Add-time refusals in the Overview and the canvas panel.** An item that cannot be read, items over ten, and a special file show as the app toast there (those composers hand them to `onNotice`, as they did for files), while the draft's `folder-states` tiles draw them as a notice under the docked composer. Home shows them under its composer. The words match the draft.
- **Accent.** Send and Queue use the chosen buddy's accent (Design system 'Overview'); the draft draws Doany's violet and the probe chose another buddy.
- **Queue tooltip height.** The probe's paths were long temporary paths outside its HOME, so a path wrapped to three lines where the draft's `~/Projects/…` path takes two. Styles match.

### Not verified

- Real Finder drag and ⌘V into these composers in this measurement (a CDP drop of real paths reached the Checking state; the Finder input is covered by `/runtime-test`).
- The sent chip's path tooltip, and the Overview's `~` shortening of queue paths under a real HOME.

### Regression pointers

`homeComposer.test.ts` (the ten-item cap), `attachments.test.ts` (special files), `HomeComposerView.interaction.test.tsx` (a pasted folder main no longer finds). The icon's `flex: none` has no unit test; the probe measured 3.5 × 14 without it.

## Pasted text attachments

Reference: `.doan/canvases/composer-long-paste-chip.html`, frames `paste-home`, `paste-overview` and `paste-states`. Measured in the real app at 1238 × 780, DPR 2, against a second hidden window's iframe in the same Electron 45.3.4 / Chromium 156.0.8078.100 build. Home and Overview use the real pasted-text save IPC and real attachment chips. Main's auth/model snapshot, conversation list/history, returned draft and queue reply are fixtures; Checking delays the save handler, count-less presentation removes `lines` from its reply, and Missing / save failure inject main refusals. No provider turn ran. The final isolated probe preserved every real-state fingerprint, closed its owned app and removed its temporary fixtures. The canvas panel and prototype window share DockedComposer and have no separate draft frames.

### Measured contracts

| Surface | Measured values |
|---|---|
| Composer / restored chip | Shared attachment chip: 40 high, 4 padding, 8 gap, radius 12, max width 256, inset rgb(245,245,246). Icon tile 32 × 32, white, radius 8; FileText 16 × 16 in rgb(82,82,82). Name “Pasted text”: Geist 12/16, weight 500; metadata “1 line” / “N lines”: 12/16, weight 400, rgb(95,95,95). Both use the existing caption tracking 0.1596 px. × is the shared 24 × 24 button named “Remove pasted text”. |
| Tooltip and description | First line excerpt, up to 80 code points. Home's actual Radix tooltip was measured against `home-pasted-tooltip`; source chips carry the same excerpt as `aria-description`. |
| Sent chip | Same file icon, name and line count, without ×. Both the recorded message conversion and the restored composer preserve metadata. |
| Queue summary | Visible “Pasted text” only, FileText 14 × 14, gap 4, caption 12/16 and 0.1596 px tracking, rgb(82,82,82), max width 180 at the measured Overview width. The accessible group name is “Attachments: Pasted text, N lines — <first line>”. The tooltip shows each attachment on two lines: a medium-weight “Pasted text, N lines” name above its first-line excerpt, without the “Attachments:” prefix or the em dash. A record without a line count omits the comma and count in both places. The queue's existing narrow cap remains as documented under Folder attachments. |
| Checking | Same chip, “Checking” and 16 × 16 spinner; Send disabled. |
| Missing / refused | Problem icon and metadata rgb(100,23,35). Docked notice: inset rgb(245,245,246), 12 / 16 padding, 6 gap, radius 16, Geist 14/20, −0.035 px tracking, rgb(100,23,35). Missing, save-failed, 50 MB and ten-item limit copy match the state tiles. |
| × interaction | Hover uses the existing icon-button hover fill; keyboard focus uses the shared 2 px black outline with 2 px offset. Both states were reached before measurement. |

### Documented differences and context

- **Shared caption tracking.** The draft omits the name's tracking (`normal`); the existing attachment primitive uses the caption role's 0.1596 px. Keep the primitive across existing attachments. The “Pasted text” name measures 66.4766 instead of 64.7188 px, and its flex-column metadata stretches to that width. A removable chip is 146.477 px wide instead of the draft's 144.719; its height, padding, gap, radius and icon sizes match. Tracking on text-less icons and buttons is inherited context; FileText's `flex-shrink` is also irrelevant inside its grid tile (both rendered glyphs are 16 × 16).
- **Home notice surface.** State tiles draw DockedComposer. Home keeps the existing `doan-panel` notice surface (Home, Reason and notices): white with the panel shadow, rather than Docked's inset fill and no shadow. The words, padding, typography, danger ink and icon match; Docked notices were measured separately and match the tiles.
- **Disabled Send text.** The real disabled Send contains the existing screen-reader-only “Checking attachments” reason. The draft button has no text; neither paints a visible label.
- **Fixture excerpts and layout.** The one-line fixture's first line differs from the draft's sample. Notice widths follow the containing composer, and a narrow sample can wrap where the measured Overview does not. No equality claim is made for those intrinsic widths, wrapping, portal placement or inherited type on text-less containers.
- **Count-less records.** The count-less specimen retains pasted ownership or an excerpt signal. Pasted-text saving and metadata were introduced together, so a stored record with only an ordinary file name is not treated as pasted text. This also preserves ordinary user files named “Pasted text” or `pasted-text-notes.txt`.

### Not verified

- Real Finder / AppKit paste, actual selection and caret, real provider reads, restart lifetime, and the prototype window's preload-to-main send path belong to the separate runtime / provider checks.
- No new canvas-panel or prototype-window geometry comparison was made; their shared composer uses the Overview measurement.

### Regression pointers

`homeComposer.test.ts` pins file identity, queue visible / accessible copy, count-less metadata and same-named ordinary files. Home/Docked interaction tests and Overview/Canvas/prototype effect mounts pin their paste branches and asynchronous chip lifetime; CanvasConversationPanel.headless also mounts the recorded sent bubble. Geometry and native state remain isolated probes under `.scratch/design-sync/pasted-text/`.

## Conversation finished bubble

Reference: `.doan/canvases/canvas-activity-notices.html` (`activity-sidebar`, `activity-collapsed`). Measured at 1238 × 780, draft read in the app's canvas iframe. The unread finished state came from a stored conversation record (v2 index plus a four-event history) in an isolated app, with no provider login.

| Part | Measured (draft = app) |
|---|---|
| Sidebar canvas row slot `.row-slot.ended` | 16 × 16, 10 from the row end, 8 from the top of the 32 px row; lucide `MessageCircle` (16, stroke 2, no fill) in `--text-accent` (rgb 151 59 225 for Doany); named "Conversation finished — unread" |
| Show sidebar badge `.badge-bubble` | 14 × 14, 2 from the top and end, `--surface-panel` background and 2 px ring, radius 4, svg 14 × 14 stroke 2 `--text-accent` filled `--surface-panel`; button named "Show sidebar, conversation finished unread" |

The canvas change dot (`.row-slot.unseen i`, 8 px) is unchanged; conversation rows (`StatusMark` in the Overview dropdown, the canvas conversation list and the panel head) draw the same bubble in the same 16 px slot.

**Also measured.** The collapsed project row's aggregate slot (`.row-slot.ended`, svg, 16 wide, named "Conversation finished — unread") and a conversation row in the right panel (`StatusMark`, same markup and size) were read in the isolated app from the same fixture.

**Not verified.** The folded panel's Show conversation bubble (same `.badge-bubble` rule; covered by the `CanvasHeader` unit test): the fixture conversation reads as seen once its canvas is shown with the panel open, and the panel reopens on each canvas opened.

## Read-state failure dot and Retry toast

Reference: `.doan/canvases/canvas-activity-notices.html` (`activity-save-failure`, `activity-recovery`). Measured at 1238 × 780, draft read in the app's canvas iframe. The failure came from a real read-only `.doan/seen/` in an isolated app; the running Retry was held by delaying main's `read-state:retry` answer in the probe.

| Part | Measured (draft = app) |
|---|---|
| Failure dot `.row-slot.unseen` | The canvas change dot unchanged: 16 × 16 slot, 8 × 8 round `i` in `--text-accent` (rgb 151 59 225 for Doany). Named "Read state could not be saved for <canvas>" (read from the renderer's accessibility tree) instead of the change label; an ID problem keeps the change label. Shown on the canvas the page shows only while its save failed; hidden like any slot while the row is hovered, focused or its menu is open |
| Toast | The shared toast ('Design system' Toast), 66 high for the read-only message (two lines); message 14 / 20 |
| Retry | Prominent sm: 32 high, 16 inline padding, radius 34, black fill and white text |
| Running Retry | Same box with the disabled fill rgb(232 232 232) and ink rgb(149 149 149), the default cursor, the 14 px in-button spinner (the disabled ink, its ring at 30 %) before "Retrying" with an 8 px gap. It is `aria-disabled` and `data-disabled` rather than `:disabled`, so focus stays on the button while it runs; a toast rule keeps the hover fill off it |

Copy: "Couldn’t save <canvas>’s read state.", "Saving <canvas>’s read state.", "Read state couldn’t be read, so it started fresh. Canvases already in the list count as seen.", "Read state is from a newer Doan version and won’t be saved this session. Update Doan to keep it." and "Couldn’t save the read state because the canvas ID is missing or duplicated. Fix the ID, then retry." The running text for the read-state file is "Reading the read state."; the draft draws neither. The draft’s read-only reason sentence and initial-records toast have no app counterpart, since the read state is written to the app’s own data, not the project (ARCHITECTURE §7 'Seen canvases').

**Not verified.** Focus return after a successful Retry was checked only as "focus stays in the workspace, not on the body" (a real-app probe); which control receives it was not measured. The recovery tiles' toasts share the measured toast and differ only in text, which the probe read in the real app.

## Background work line and unread prompt

Reference: `.doan/canvases/claude-turn-end.html` (frames `background-line`, `background-widths`, `prompt-unread`; `copy` is the wording reference). The draft read in the app's canvas iframe, the implementation in an isolated app at 1238 × 780 (panel 347, and 280 from a saved panel width) and at 1600 × 900 for the Overview's 720 column. No agent ran: main's `conversation:list` answer was wrapped to add the list's `background`, and `conversation:interrupt` was replaced by a handler the probe answered (held for Stopping, `{ error: "busy" }` for the failure). Every row matches apart from the documented differences below.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Place | The thread's last item, in the turn indicator's place under the done turn's reply, at the thread's item gap (20 in the panel, 24 in the Overview) | A done turn has no indicator; the line takes its place and goes in the render the person's next message enters. |
| Line | `.bg-line`: grid `14px 1fr`, column and row gap 8, `--text-metadata` (rgb(95,95,95)), the reply's type: body-sm 14/20 (−0.035 px) in the panel, 16/24 in the Overview. 92 high at 347 and 280 (three lines + Stop), 56 at 720 (one line + Stop). No fill, no edge, no animation | A status line, not a notice; the turn is done and nothing needs an answer. |
| Icon | lucide `terminal`, 14 × 14, `--text-metadata`, centred on the first line (3 px down in the panel, 5 in the Overview) | Not the provider logo, which reads as a running turn. |
| Stop | The shared xs `subtle` capsule in grid column 2 under the sentence: 24 high, 4 / 8 padding, radius 34, gap 4, ink rgb(15,15,15) on rgb(245,245,246), hover rgb(241,241,242); 61.17 wide with the 14 px circle-stop icon. Keyboard focus draws the shared ring (2 px solid black, offset 2) | On its own row, so Stopping never rewraps the sentence or changes the item's height. |
| Stopping | The same box, 86.25 wide, a 14 px `.doan-spinner` before "Stopping", the disabled fill rgb(232,232,232) and ink rgb(149,149,149), the default cursor; `aria-disabled` and `data-disabled` rather than `:disabled`, so a keyboard press keeps focus on it | The running Retry's pattern ('Read-state failure dot and Retry toast'). |
| Failure | Stop comes back with focus and the shared toast ('Design system' Toast; 46 high, message 14/20) says "Couldn’t stop the background work. Try again." | |
| Accessibility | Names "Stop background work" and "Stopping background work" (disabled) from the renderer's accessibility tree. The line is no live region; the thread's `sr-only` status says "Background work is still running" as it appears and keeps the same words while Stopping. Shift+Tab from the empty composer field reaches Stop; when the line goes while Stop holds focus, focus goes to the composer field | Tab in an empty composer takes the suggestion, so Stop is reached backwards. |
| Unread prompt | The shared failed-turn notice (`doan-notice error thread-notice`): rgb(100,23,35) on rgb(245,245,246), 12 / 16 padding, radius 16, grid `16px 1fr` with a 6 px column and 12 px row gap; title "Claude Code didn’t pick up your message", body "Send it again.", sm `panel` Edit and resend (133.95 × 32). 132 high at 347 and 280 (the title wraps), 112 at 720 | The draft's chosen option. |

### Documented differences from the draft

- **Panel width.** Every thread element is 1 px narrower in the panel (thread 314 where the tiles draw 315; 247 at the 280 minimum): the panel's 1 px start border ('Canvas handoff').

Context, not deviations: the spinner's bounding box grows with its rotation (its computed 14 × 14 matches; the draft's board holds it still); a Stopping reached by a keyboard press keeps the focus ring, which the draft's Stopping tile does not draw.

### Not verified

- The Home conversation strip with `prompt_unread` (title "Claude Code didn’t pick up your message", body "Edit your request on Home and send it again."): it draws only over a project's problem overlay, which the probe did not reach; the copy is pinned by `conversationStrip.test.ts` and the strip component is unchanged.
- Any real Claude turn with background work, the real interrupt, and a real `prompt_unread` end (every state is injected).

### Regression pointers

`ConversationThread.background.test.tsx` (line, Stop states, focus, status), `turnStatus.test.ts` (background line and stop), `ProjectOverview.context.test.tsx` and `CanvasConversationPanel.test.tsx` (host wiring), `ConversationThread.test.tsx` and `conversationStrip.test.ts` (unread copy). Sizes and colours are `.scratch/` probes only.

## Usage-limit queue

Reference: `.doan/canvases/usage-limit-resume.html` (frames `queue-button`, `scheduled-rows`, `sending`, `failed-line`, `sidebar-slot`, `delete-dialog`). Measured at 1238 × 780: the draft read in the app's canvas iframe, the implementation in the canvas conversation panel (347 wide at this window, as in 'Background work line and unread prompt'), the sidebar, the title menu and the delete alert of an isolated app. No limit was real: main's agent-auth, model and conversation handlers were replaced, so the limit, the schedule and the scheduled rows came from injected list rows (`limitResetsAt`, `scheduledAt`, `queued`), an injected `turn.failed` (`rate_limited`) and injected `conversation:scheduled` items. Every row, roles, labels and disabled states included, matches apart from the context listed after the table.

| Part | Measured value | Why |
|---|---|---|
| Queue in the Send slot | While the limit holds, or rows wait for the reset, the idle Send slot is the shipped 32 × 32 Queue (`--accent`, 16 px arrow); empty field: disabled (rgb 232/149). Accessible name "Queue"; its description is an sr-only span inside the button ("Sends when the limit resets <phrase>."), read through CDP as the button's description, once, also while the tooltip is open; no `title`. Tooltip: the shipped `doan-tooltip` ('Canvas conversation panel' Tools row) "Queue — sends when the limit resets <phrase>"; the plain "Queue" once the reset passed | The tooltip is the only cue before the press. The trigger keeps its own description under an open tooltip (`data-own-description`, `components/ui/tooltip.tsx`), or the reset would be read twice. |
| Schedule line | `.queue-schedule`, a sibling after the list, always drawn as an empty polite status: with text 16 high, 4 below the last row, 8 to the card, inset 16, gap 8; caption 12/16 in `--text-subtle` (rgb 82,82,82); 16 px lucide `Clock` in `--text-metadata` (rgb 95,95,95). After the reset: the shipped 16 px `doan-spinner` and "Sending" | The live region exists before its text, so the change is announced. |
| Scheduled rows | The shipped capsules (40 high, 4 apart, white, 16 px icon at x16), Remove only: no Send now while scheduled, so the row's own status line stays empty | Nothing runs to take a message now. |
| Failed turn, second line | The shipped notice; the last turn's limit end, while the connection's limit holds, reads "Resets <phrase>. Messages you send now go out then." (14/20, rgb 100,23,35), Edit and resend unchanged (133.95 × 32) | Messages sent now wait for that reset. |
| Scheduled slot | Sidebar canvas row slot and `StatusMark` in the conversation menus (the project row and the Overview list draw the same mark; not measured): 16 × 16 slot, lucide `Clock` in `--text-subtle` (rgb 82,82,82), no accent; named "Queued — sends when the limit resets <phrase>" (role image) | It asks nothing of the person, so it is quieter than the answer and unread marks and stays out of the Show sidebar badge. |
| Delete alert | The shipped compact alert ('Design system' Dialogs); the body adds "Its queued messages are discarded too." (or the one-message and with-draft forms) | Deleting discards the waiting messages with the conversation. |

The time phrase follows macOS's 12/24-hour setting through main (`clockHour12`): on this Mac (24-hour) the app read "at 22:48" where the draft's today tile reads "at 3:00 PM", which matches the draft's own 24-hour tile ("at 15:00"). Context, not deviations: that phrase and the fixture's reset time; the 347 px panel (the draft draws 360); the queue list's shipped `position: relative`; the hovered Queue's pressed fill (rgb 144,51,217) against the draft's rest; the draft's tooltip placement helper (`position: absolute`, `nowrap`); the app's sr-only utility (no −1 px margin); the sidebar row's current-canvas fill, pointer cursor, `nowrap` and `position: relative`; the draft frame's height; the modal alert's centring; the spinner's rotated bounding box (its computed 16 px size matches).

Not verified: the 12-hour form with U+202F in the real app (unit-pinned in `limitReset.test.ts`); the tomorrow, weekday and date phrases in the real app (unit-pinned); the Conversations list `StatusMark` in the Overview's right panel and the project-row slot (same component as the measured menu and canvas row); Home's start refusal with the reset time (`home-refusal`, not a compared frame); a real usage limit and a real provider's reset (the states were injected); the reset timer firing in the real app (unit-pinned on a fake clock).

## Provider commands

Reference: `.doan/canvases/provider-commands.html` frames `slash-list` tiles c and d and `commands-tab` a, `preset-chip-notice` b (all against Home), `preset-chip-notice` d (its notice row only, against the Overview's docked composer), `queue-row` b, `command-turn` a, `boundaries` a and `unsupported-card` a (against the Overview's thread and docked composer). Injected: the provider was a fake `claude` 2.1.326 on the isolated login shell's PATH, reporting the allowlist and two project skills (`context`, `deploy`) and answering `/compact` and `/clear` with the frames the feature's provider check recorded; every state was then reached through the app. Every compared value matches apart from the deviations below.

| Part | Measured value | Why |
|---|---|---|
| `/` list place | 8 above the whole composer (Home: the card and its worktree tray), 32 in from its left, 600 wide but never past the composer’s right edge (a narrow canvas or prototype conversation panel: 263 in a 320 panel, 224 in a 280 panel); the tool row is no longer its containing block (`.composer-tools:has(> .slash-popover)`). On Home it may cover the project button | The list used to cover the field it filters. |
| Order | Presets, then project skills, then commands, each kind by name; a project skill hides the command of its name (`/context` here) | A skill the project wrote wins its name. |
| Command row | The project skill row: 50 high with description, padding 6 / 12, gap 12, radius 19; the 24 × 24 radius-10 tile in `--affordance-backdrop-hover` rgba(0, 0, 0, .06) with lucide `Terminal` 14 × 14 in `--text-standard` rgb(15, 15, 15) | Neutral like a skill, told apart only by its icon. |
| Commands tab | After Project; the shipped tab (32 high, padding 0 / 12, gap 6, 14/20); `Terminal` 14 × 14 in `--text-metadata` rgb(95, 95, 95); section head "Commands" caption 12/16 in rgb(95, 95, 95) | The Project tab's neutral icon ink. |
| Popover with commands | 809 wide: the eight-tab row's own width is 794 (no room left after the last tab, nothing scrolls) plus the row's margins and the popover's padding | The width the tabs need, measured, not copied. |
| Preset notice | In the chips row's place while the field starts with a command: caption 12/16 with its tracking in `--text-subtle` rgb(82, 82, 82), gap 8, lucide `Info` 16 × 16 in `--text-metadata`; 8 above the field. Said once through the composer's status region, not by the row | The queue status line's values; the chip stays in the draft and comes back with the word gone. |
| Queue row | The shipped capsule (40 high), Remove only; the turn's other rows keep Send now, and none shows while the running turn is a command | Main refuses Send now for a command. |
| Running label | "Compacting…" (Claude `/clear` "Clearing context…", Codex `/review` "Reviewing…") in the shipped turn indicator, 16/24 | Only the words are per command. |
| Boundary | Caption 12/16 with its tracking in `--text-metadata` rgb(95, 95, 95), centred, gap 12; rules 1 px `--border-standard` rgb(232, 232, 232), at least 24 wide each; 24 below the bubble before it (the thread's gap) | The onboarding divider's values; neutral. |
| Card | The shipped neutral thread notice: `--surface-inset` rgb(245, 245, 246), radius 16, padding 12 / 16, grid gaps 6 / 12; `Info` 16 × 16 in rgb(95, 95, 95); title 14/20 weight 500, body 14/20; action `panel` and Dismiss `ghost` buttons, 32 high, padding 6 / 16, radius 34 | No stripe and no colour: it explains, it does not warn. |
| Command words | Field and bubble use the skill word (16/24, weight 500, radius 6, padding 0 / 6; the bubble's fill is `--surface-panel`) | The skill highlight rule. |

### Documented deviations from the draft

- Row descriptions: the draft's copy of `.preset-desc` leaves out the caption tracking (letter-spacing −0.035 against 0.1596). The shipped project skill row beside it differs the same way, so the shared rule stays.
- Running label: the draft draws the indicator's text statically in rgb(95, 95, 95); the shipped indicator paints it with its shimmer (`background-clip: text`, transparent colour, `ti-shimmer`). The draft's caption names the shipped indicator.
- The Home card of a built-in Doan does not run (no draft frame) sits under the composer in the notice's place; in a new conversation's column (Overview, canvas panel) it sits where that column's notices do; in an existing conversation it is the thread's last item.

### Not verified

Real providers: the commands ran against a fake Claude Code only, so a real CLI's frames, Codex's `review/start` and `thread/compact/start`, the ACP agents' lists, the Codex stale-mode card and Copilot's compaction boundary were not seen in the app (unit-pinned in `commandUi.test.ts`, `DockedComposer.commands.test.tsx`, `conversationStore.commands.test.ts`). At the canvas panel's 296 width only the notice row of `preset-chip-notice` d was paired; the card's wrapped actions (`unsupported-card` c), the boundary's wrapped label (`boundaries` c) and the docked capsule-to-box change at 296 were not measured. The `/context` text result and the failed command turn are the shipped reply and failure displays and were not re-measured. In the prototype window and the narrow panels the 600 wide `/` list runs past the window's right edge, as it did before this change.

## Sent bubble lists

Reference: `.doan/canvases/composer-markdown.html` frames `bubble-lists`, `bubble-plain`, the bubble of `field-wrap` (tile b) and the bubble of `title-queue` (tile b), all on the canvas conversation panel's 320 px slice (body-sm 14/20, bubble at most 92 % of the 288 px thread, 264.95). Measured outside the running app: the draft canvas was loaded in a bare window of the same Electron build, and on the implementation side the draft tile's shipped panel markup took the built app CSS (`npm --prefix app run build`, every chunk, the app body's rules included), with the thread replaced by the real `ConversationThread` markup of the same message (`renderToStaticMarkup`). The tile drops the panel's 1 px left border, so the implementation slice did too. Elements were paired by class and order inside each bubble; line starts were paired by their text. The sidebar title and the queue row of `title-queue` are text rules (`messageLine`, unit-pinned in `messageText.test.ts`) drawn by shipped rows, and were not measured here.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Text blocks | Lines that are not list items are `.bubble-text` blocks (`display: block`), so a list starts on its own line and text after it on the next | A preset line followed by text would otherwise share one line. |
| List and item | `.bubble-list` (`role="list"`) and `.bubble-item` (`role="listitem"`) are blocks; inside an item the depth span, the marker and the body are inline-blocks with `vertical-align: top`, so marker and body share the first line's top | Copy (below). |
| Indent, depth step and marker column | Every marker stands one 20 px step (`--space-5`, the marker's `margin-inline-start`) in from its list's left, and each depth adds a step: a depth-n marker starts at (n + 1) × 20. A bullet's column is 12 px (`--space-3`), so its body starts 12 after the marker. Measured: depth 0 / 1 / 2 markers at 20 / 40 / 60 and bullet bodies at 32 / 52 / 72 (`bubble-lists` a and b, `field-wrap` b), equal to the draft | The person found a depth-0 list too shallow and the gap after the marker too wide; the person chose a 20 px step (`--space-5`), and 12 px leaves a short gap after the 4 px "•". A user bubble's bullet bodies start at 32, where the agent's Markdown list bodies start at 24. |
| Bullet and number | A `- ` or `* ` marker keeps its characters (copied as typed) in `color: transparent`; `::before` draws "•" at the marker's left 0 / top 0 in `--text-standard` rgb(15,15,15). Numbered markers are painted as typed in the bubble's ink, in plain figures (`font-variant-numeric: normal` on `.list-mark`), so "1. " is followed by its own typed space | The body's tabular "1" is padded to a "0"'s width, about 3 px more gap after "1."; the draft draws plain figures. |
| Hanging indent | A wrapped body stays in its own column: "Shorten it so it fits on one line at the narrowest width" (depth 1) wraps to two lines at x 52, equal to the draft | |
| Numbered column | Bodies of one list line up past its widest marker: `.list-mark` `min-width: max(12px, data-mark × 1ch)`, where `data-mark` (`ConversationThread.tsx` `markColumn`) sums each digit's width in Geist in ch, rounded up ("0" 1, "1" 0.58, the others 0.79–0.95), plus 0.7 for ". ". Measured: "1." / "2." lists 15.22 against the draft's 14.88 (`bubble-lists` b), "9." / "10." / "100." 30.44 against 30.09 (c) | The draft's subgrid column is replaced (deviations). |
| Number alignment | Numbered markers are right-aligned in the column (`text-align: right` on `.list-mark[data-kind="ol"]`), as the draft and a native ol draw them, so every "N." ends at the same x and its text follows after its typed space: 3.46–3.47 px for "1." / "2.", "9." / "10." / "11." and "8." / "88." / "100.". Selecting the bubble still gives the sent text. Bullets stay at the column's start | The person saw "1." beside "2." with a wider gap when markers were left-aligned. |
| Other Markdown | `**`, backticks, `#` and `---` stay text in `.bubble-text` (`bubble-plain`); positions equal the draft | |
| Copy | Copying the whole bubble and pasting into a textarea gives the text as sent, with anchor names inline, markers, depth spaces and blank lines preserved. Sent anchor chips use inline-block with inline label text; Chromium adds block boundaries around flex-item labels | Checked in the real app with plain text and a three-level list; `.scratch/runtime-test/chip-copy/probe.mjs`, `runtime.log`, `copy-bubbles.png`. The component/CSS selection regression covers both button and span chips. |
| Roles (CDP) | Each `.bubble-list` is a `list` and each item a `listitem`: 3 lists / 5 items (`bubble-lists` a), 3 / 6 (b), 1 / 3 (c), 1 / 2 (`bubble-plain`), 2 / 2 (`field-wrap` b), 1 / 2 (`title-queue` b), equal to the draft | |

### Documented deviations from the draft

- **Inline-blocks, not a grid.** The draft lays each list out as a grid with subgrid items. Chromium selects and copies a grid item's edge as a line break, so the marker and its body were copied on separate lines (`- \nHeadline`), breaking "copy gives the text sent". Measured differences that follow, none painted: lists and items compute `display: block` (draft `grid`); depth, marker and body compute `inline-block` and `vertical-align: top` (draft blockified `block`, `baseline`); a body that fits on one line is as wide as its text (draft: the whole third column, e.g. 56.24 against 200.95 for "Headline"); a marker or depth span is one line high where the draft's grid row stretches it to the item's height (20 against 40 or 60).
- **Numbered marker column.** The column is an estimate from the markers' digits (Numbered column above), not the widest marker itself as in the draft's grid, and each digit's width is rounded up so it never cuts into the text: bodies start 0.34 px (`bubble-lists` b) and 0.35 px (c) further right than the draft. Right alignment puts the extra width before the number, so the gap after every "N." stays one typed space. The digit widths are Geist's; another font would need its own.
- **Indentation stops at four steps.** An item deeper than four steps draws its marker at 100 px (the first step and four depth steps) and its bullet body at 112, its depth spaces still in the text: in a 320 px panel a depth-13 list would leave the body no width. The draft draws depths 0 to 2 only, so no draft value moves.
- **Leading spaces at depth 0.** Leading spaces before an item with no parent item (a first line " - one space") take no width: the depth span is 0 px wide, marker at 20 and body at 32, like an item typed without them. Depth follows the parent rule, so the same spaces under an item are a depth step. The draft draws no such item.

Context, not deviations: the bubble's width when its widest line holds figures (`bubble-lists` b: "2026. 11. 19. review with the team" makes it 251.09 against 242.68, from the app body's tabular figures; with plain figures both are 242.68); `font-variant-numeric: tabular-nums` inherited by every list part but the marker; containers' inherited 13 px / `normal` type.

### Not verified

- The running app: no message was sent through a provider and the panel was not opened in Doan; the markup came from `ConversationThread` and the CSS from the build. Hover and focus are not drawn on list parts.
- The real clipboard: copy was checked through `Selection.toString()`, which follows the same line-break rules (it reproduces the grid break above). The clipboard copy of this CSS was last checked by the implementation batch's probe (90 cases at 320 and 600 px).
- Bubbles in other thread hosts (Home and Overview conversations) and the prototype window's thread: the list rules are scoped to `.conversation-thread`, but only the canvas panel's 320 px slice was measured. Screen reader output of the "•" drawn over a transparent "-" was not checked.

### Regression pointers

`ConversationThread.lists.dom.test.tsx` (Electron with Geist: whole-bubble selection equals the sent text and items are not grid; depth steps to the four-step cap and the hanging body; one list's bodies aligned past its widest marker and within 1 px of it; numbers right-aligned with one typed space before their text, selection unchanged; leading spaces before an item with no parent). `ConversationThread.test.tsx` (bubble markup and the copy model). Probe: `.scratch/design-sync/composer-markdown/measure.mjs`, `compare.mjs`.

## Canvas chips

Reference: `.doan/canvases/canvas-chip.html` (frames `chip`, `drag`, `menu`, `sent`, `home`; `copy` is the wording). Measured in an isolated built app at 1280 × 800 against the draft read in a second, hidden window of the same Electron build, by computed style (`getComputedStyle`) on both sides: the composer canvas chip (another canvas and a `.doan/ds/` canvas in the canvas panel, a long subfolder name in the Overview), the chip's two-line tooltip, the drop place bar and the drag image during a Playwright drag, the refusing composer (a pick started mid-drag in the panel, an IME composition started mid-drag on Home) and its reason line, sent chips in the canvas panel and the Overview, the gone notes in a bubble and in the composer, the row menu's Add to message enabled and unavailable, and Home's root-switch notice. 1125 property rows; every compared property matched except the rows under 'Documented differences' and the context rows listed there.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Composer canvas chip | The shipped anchor chip with the sidebar row's icon: 24 high, padding 0 6, margin 0 2, gap 4, radius 6 (`--radius-word`), `--surface-accent-subtle` rgb(245,240,253), `--text-accent-subtle` rgb(84,56,113), label 16 / 24 medium, `vertical-align: bottom`, max-width 180 with the name cut by an ellipsis (a 43-character subfolder name measures 180 wide); icon 14 × 14, `PanelsTopLeft` for `.doan/canvases/`, `SwatchBook` for `.doan/ds/` (the same shapes as the row's icon). The hidden "Canvas " prefix is `user-select: none` | One chip family for everything a message points at; the icon alone tells a whole canvas from a place inside one, as the sidebar does |
| Chip tooltip | The shared tooltip (padding 4 8, radius 12, black fill, 12 / 16 white, max-width 384) with two block lines, "Open <name>" then the repository-relative path; the open canvas's own chip in the main window shows the path alone | Pressing another canvas's chip leaves the conversation; the path tells same-named canvases apart |
| Drop place bar | `.drop-caret` widget at the drop position: 2 × 24, radius pill, `--text-accent` (an Accent place), `vertical-align: bottom`, margin 0 -1 (no net width). The character after the bar stays at the same x during the drag | Text pushed aside would move the drop position under the pointer on the next dragover |
| Drag image | `.chip-drag-image` drawn off screen for `setDragImage`: the composer chip (label 16 / 24, padding 0 6, radius 6, accent-subtle fill and text) with `--shadow-floating`, margin 0, inside 12 px padding; offset 20, 23 | The padding keeps the floating shadow inside the snapshot |
| Refusing composer | The card gets `outline: 1px dashed --border-prominent` rgb(128,128,128), offset -1 (docked and Home); no drop bar; the reason takes the composer's reason place: docked `composer-reason docked-reason` (margin-top 8, padding 0 16, left-aligned, caption 12 / 16, `--text-subtle` rgb(82,82,82)), Home `composer-reason` (centred, margin-top 12). The line goes when the drag leaves or ends | macOS draws no forbidden cursor, so the line is the only signal; no accent, since nothing will land |
| Sent canvas chip | The shipped sent chip: inline-block, padding 0 6, `--surface-panel` fill inside the accent bubble, accent-subtle text, icon `vertical-align: -2px` with margin-right 4; canvas panel 14 / 20 (20 high), Overview 16 / 24. A `<button>` named "Open <name>" (read through CDP) | Same chip as in the composer; the button says where the press goes |
| Gone notes | Bubble: `.chip-missing` caption 12 / 16 `--text-metadata` rgb(95,95,95), "No longer in <project>", linked by `aria-describedby`. Composer: the floating `.chip-note` (padding 2 6, radius 12, panel fill, `--shadow-sm`) | The shipped frame-chip notes, reused |
| Row menu item | First item of the 204 px compact menu (padding 2, radius 16, opaque popover fill). Enabled: 32 high, padding 4 8, gap 8, radius 13, `MessageSquarePlus` 16 in `--text-subtle`, hover fill `--affordance-floating-hover` rgb(245,245,246). Unavailable: `aria-disabled`, `--text-disabled` rgb(149,149,149) label and icon, items aligned to the top (icon margin 2 0), the reason under the label in caption 12 / 16 `--text-metadata` and as the item's accessible description (CDP: menuitem, disabled, description = the reason); 62 high for a two-line reason | The shipped Export… and Move to Trash reason pattern; no tooltip |
| Home root-switch notice | The composer reason line (centred, caption 12 / 16 `--text-subtle`, margin-top 12) with "N canvas chip(s) became plain text. Its/Their canvas(es) is/are in another project / on another worktree." until the next edit | Says once what the switch did to the draft |

### Documented differences from the draft

- **Sent chip letter-spacing in the canvas panel.** The app's chip inherits the bubble's body-sm tracking (-0.035px at 14 px), as every sent anchor chip does; the draft's canvas `button` reset leaves the user-agent `normal` on buttons, so its chips measure 0.46 px wider. The bubble text around the chip has the same tracking in both.
- **Hidden prefix in the drag image.** The drag image is built from the composer chip (`chipNode`), so it keeps the clipped, `user-select: none` "Canvas " prefix; the wrapper is `aria-hidden` and the prefix draws nothing. The draft's drag image has no prefix.
- **Home's notice under the kept suggestions.** Home draws the chip notice and a drag's refusal in its shared reason line's place, after the suggestions. Once typing hides the suggestions (`inert`, `visibility: hidden`) they keep their area, so the line sits under it: composer bottom 495, suggestions 527–611, reason top 623 (128 below the composer) at 1280 × 800. The draft draws Home without suggestions, where the line is 12 under the composer, as measured in that state. The shared reason line keeps its place (Home 'Composer stays put').

Context, not differences: names, project names and reason sentences differ between the draft's examples and the probe's fixtures (text widths follow); the draft draws icons with `<use>`, so its SVGs have no child shapes (the shapes were compared through the symbols); containers inherit the board's 14 / 20 and the window's `100vw` where the app's inherit 13 / normal and 1280; the menu item measured with a `:focus-visible` ring after the probe's hover, from the shared `.doan-menu-item` rule.

### Not verified

- The drag image as the operating system draws it, and the disabled menu item's hover.

### Regression pointers

`canvasChip.test.ts` (reasons and copy), `canvasChipDrag.test.ts` (drag image, drag end), `chipField.dom.test.ts` (drop place), `DockedComposer.interaction.test.tsx` (refusal line), `ShellSidebar.interaction.test.tsx` (row drag and menu item), `ConversationThread.test.tsx` (sent chip, tooltip), `HomeComposerView.interaction.test.tsx` (root change notice). Probes: `.scratch/design-sync/canvas-chip/measure.mjs`, `.scratch/runtime-test/canvas-chip/probe.mjs`.
