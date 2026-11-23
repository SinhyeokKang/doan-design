# Design measurements — Conversations

> Part of [DESIGN.md](../DESIGN.md), which holds the evidence and verification policy, the design system and the index of every screen section.

## Agent question card

Reference: `.doan/canvases/agent-questions.html` (frames `question-card`, `keyboard`, `send-states`, `folded`, `with-permission`, `panel-280`, `overview`, `problem-strip`; `in-context` is a composition of shipped parts and was not compared). The draft was read in a second window of the same Electron build; each app card was paired with a draft card at the same column width (720 or 248), set by dragging the canvas panel's resize handle. Every card was a live `AskUserQuestion` from a real Claude Code turn on a Doan connection; the sending and failed states held or refused main's `conversation:answerQuestion` answer from the main process, then let the real answer through. Cards, folded lines, the strip and the disabled Send with its tooltip matched in every property except the rows below.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Card | The thread notice (`doan-notice thread-notice q-card`): `--surface-inset` fill rgb(245,245,246), 16 px corners, padding 12 / 16, grid columns 16 + 1fr with a 6 px column gap and a 12 px row gap. The 16 px provider logo sits at y14 beside the title; the question list, the action row and the error line span both columns under it | The mark stays on the title line only. |
| Title and further questions | The first question's sentence is the title: 14/20, weight 500, wrapping in full. Each further question puts its sentence (14/20/500) 12 px above its options; questions are 20 px apart | No "needs your answer" title and no header chip on the card (PRODUCT §5 item 3 'Questions'). |
| Option group | The Settings group: white fill, 1 px rgb(232,232,232) ring, 16 px corners (`--radius-row`, a local override), 16 px inline padding. Rows: 12 / 0 padding, 16 px gap, a 1 px rgb(232,232,232) hairline between rows, aligned to their first line. Label 14/20/500 with −0.035 px tracking; description 12/16 rgb(82,82,82) with 0.16 px tracking, 2 px below the label. A row without a description is the label line alone; long labels and descriptions wrap | Choices are never cut (PRODUCT §5 item 3 'Questions'). |
| Radio and checkbox | In the row's 20 px icon slot: the 16 px `ob-radio` (1 px rgb(128,128,128) ring on white; chosen: black fill and ring with a 6 px white dot), or the shipped 20 px `doan-checkbox` with 4 px corners. The chosen row has no fill | The chosen option shows by its control only. |
| Other input | The shipped `doan-input` (40 high, 20 px corners, padding 9 / 16) in the row's extra line, 12 px under the label, on the `--surface-inset` fill; it sits above the row's invisible native control so it takes clicks | The default input size. |
| Actions | Send (prominent black, white 14/20/500), Skip (panel, white), Stop (plain, `CircleStop`), 32 high with 34 px corners and 8 px gaps, in that order. Send that cannot send: `aria-disabled`, fill rgb(232,232,232), ink rgb(149,149,149), default cursor, tooltip "Choose or type an answer first." (one question) or "Answer each question first." | `aria-disabled` keeps Send focusable with its tooltip, as New conversation. |
| Sending | Send keeps its black fill and shows the 14 px in-button spinner (2 px ring, white at 30 % with a full-white turning quarter, `doan-spin` 1 s), `aria-busy` and `aria-disabled`, with the default cursor; options, Other and Skip are `aria-disabled` with the default cursor; Stop stays live | |
| Failed | "Couldn’t send your answer. Try again." as the shared inline error (`settings-msg error`: the 16 px alert icon, body-sm 14/20 `--text-danger`) under the actions, 12 px below them, across the card; the choices stay. A refused Skip reads "Couldn’t skip the question. Try again." (the strip's sentence) in the same line. A permission answer that did not reach the agent shows "Couldn’t send your answer. Choose again." as the same line in the permission notice's text column | Not measured in the real app: the failed Skip's sentence is pinned by unit tests only. |
| Keyboard focus | An option row whose control has `:focus-visible` takes the inset ring: 2 px black, offset −2, 16 px corners. Send takes the shared outward ring (2 px, offset 2) | The native control is transparent; the row draws its focus. |
| Folded lines | `activity-head ask-answered` in `--text-subtle`: `Answered · <header>: <answer>`, `Skipped · <header>, <header>`, `Expired without an answer · <header>`; one line, ellipsized, the full line in the shared tooltip while it is cut. The folded item sits 24 px from the item above it in the Overview and 20 px in the canvas panel; one request's lines are 20 px apart in the panel (all measured) and 24 px in the Overview (`.q-folded` gap, read from the CSS only) | The thread's own item gap per host. |
| Problem-workspace strip | The shipped strip with "<Provider> needs your answer", the first question on one ellipsized line, Skip (panel) and Stop; the title line is the alert. After Skip, focus sits on Stop and the strip reads "<Provider> is working" | |
| Accessibility (CDP) | Single choice is a `radiogroup`, multiple choice a `group`, named "<header>: <question>"; each option is a radio or checkbox named by its label and described by its description; the open Other input is a textbox named "Other answer"; the disabled Send reads disabled and focusable. While sending, the options and Skip read disabled and Send keeps focus. On a waiting card only the title is the live (assertive) alert; the failure line is its own alert | The header names the group (PRODUCT §5 item 3 'Questions'). |

### Documented deviations from the draft

- **Group name.** The app names each question's group with `aria-label="<header>: <question>"`; the draft uses `aria-labelledby` to the sentence, which leaves the header out of the name.
- **Focused Other input.** The shipped `.doan-input:focus` rule (border `--border-prominent`, no outline) wins over the draft's stand-in ring (2 px black, offset 2); the shared field keeps one focus look everywhere.
- **Tooltip gap.** The disabled Send's tooltip sits 4 px above it (shared `sideOffset`, 'Tooltip offset'), where the draft's static stand-in sits 8 px above; the stand-in's `nowrap` and absolute position belong to its staging, and the measured text and size are equal.
- **Locked controls.** While sending, the options and Other carry `aria-disabled` as well as the card's locked state; the draft draws the lock with the class only. No computed style differs.
- **Folded line tooltip.** A folded line shows its full text in the shared tooltip only while it is cut, as the draft draws it on the 248 tile; every folded line takes the same rule.
- **Entry focus.** An entry (the agent notice's Open) focuses the first option; the ring shows after a keyboard entry and not after a pointer press, as 'Evidence and verification policy' says of static `.focus` specimens.

Context, not deviations: the Stop glyph's computed `stroke-width` (the draft sets 2 on its sprite `<symbol>`, which its shapes inherit; the app's Lucide icon sets it on its `<svg>`); shipped neighbours the draft sketches differently (the permission line reads "Allowed once", the Stopped notice "You stopped the agent." with Edit and resend); the strip's width (678–689 px at a 1238 px window against the 650 px tile); the spinner's rotated bounding box; the native radio's transparent focus outline (the control is `opacity: 0`); the canvas panel's classic scrollbar (11 px) on this machine, which narrows the column at the 280 minimum to 236 px, so the 248 tiles were compared at the panel width that gives a 248 px column.

### Not verified

- Antigravity cards were not measured. Generic text-only and secret-answer states (masked input and the `Answered · <header>` line), `other: false`, three questions with a text answer, and the 248 tile with focus in a text-only input were not measured. Codex requests are declined without a card, and no current runner produces secret questions (ARCHITECTURE §7 'Questions'). Claude always sends options and Other; the shared rows, input and actions were measured through Claude's cards.
- A permission request and a question waiting at the same time: Claude Code 2.1.318 asked for the Bash permission first and sent the question only after Allow, so only "Permission answered · the question waits" was reached.
- A toast entry into the canvas panel: toasts are for Home conversations, so the panel entry was reached through the agent notice's Open.
- A long question in the strip and a cut Expired line at 248 (only the ellipsis rules were compared; the measured lines fit), the option rows under the pointer (the draft draws no hover fill and none was measured), the 236 px column a classic scrollbar leaves at the 280 minimum, and reduced motion.
- Properties the walker does not read: right and bottom border widths, the other two corners, pseudo-element transforms (the checkbox tick), and `readonly`. The spinner's 1 s period is the shared rule's value.

### Regression pointers

`ConversationThread.question.test.tsx` (structure, names, keyboard, Send states, folding), `questionDraft.test.ts`, `threadItems.test.ts`, `ConversationStripView.test.tsx`, `conversationStrip.test.ts`. The measured values above are unpinned.

## Canvas handoff

Reference: `.doan/canvases/canvas-handoff.html` (frames `source-requested`, `source-handed-off`, `source-refused`, `source-cancelled`, `handoff-card`, `toasts`). Measured at 1238 × 780 with the panel at 347: the draft is copied into a fixture repo `acme-web` as `drafts.html` and `checkout-flow.html` and read in the app's canvas iframe. Conversations were seeded as real `index.json` and JSONL history in an isolated userData; the requested line came from main sending a live turn's events (`conversation:event`), the move and both toasts from main sending `conversation:handoff`. No provider signed in.

### Measured contracts

| Element | Measured contract | Reason |
|---|---|---|
| Source thread | The asking turn's handoffs show as its canvas cards ('Canvas cards' below), each settled in place by its result: "Hands off when this turn ends", "Handed off" with Open on the new conversation, "Didn’t hand off." + the refusal's reason, "Didn’t hand off. It’s this conversation’s own canvas." without Open, "Didn’t hand off. The turn didn’t finish." | The card's head names the file, so the status never repeats it. |
| Gone target | When the handed-off target is no longer listed (by ID), the card's Open is hidden, not disabled, and its status ends with " · No longer in <project>". The handoff card's head does the same for its source | Unlike the “Moved to” line an earlier Doan's promotion left, which disables Open. |
| Refused start | A start main refused with its own code reads as "Didn’t hand off." plus Home's start refusal for that code (`startErrorView`), for example "Didn’t hand off. Couldn’t start with Claude Code: its sign-in has expired. Choose another agent."; `canvas_not_found` reads as `not_listed` | No second wording for the start codes (clarify preset). Not drawn in the draft; pinned by `canvasCardText.test.ts`. |
| Handoff card | The receiving conversation's first message: full width, `--surface-inset` (rgb(245,245,246)), radius 16 (`--radius-row`), padding 12 / 16 / 16, gap 8, `role="group"` named by its head ("Handed off from drafts.html", CDP AX). Head 32 high: caption 12/16 with 0.16 px tracking, `--text-metadata`, 14 px `forward`, the text ellipsized on one line, Open last. Body: the agent Markdown at body-sm 14/20 (the panel's rule), its inline code on `--surface-panel` (white). Its text is never read for `{{n}}` markers or a preset line | Apart from the person's right-aligned accent bubble. |
| End of the card's turn | When the turn the handoff card began fails or stops, its end notice keeps its shipped text and Sign in again but offers no Edit and resend; a later turn of the person's offers it as before | The card's text is the earlier agent's, not the person's message. Not drawn in the draft; pinned by `ConversationThread.test.tsx`. |
| Move | From the source canvas, a started handoff opens the target canvas through Quick Open's path (one canvas visit: Back enabled after it), the panel on the receiving conversation, and keyboard focus on the card: 2 px black outline at offset 2 (`:focus-visible` after a keyboard modality). The card's focus waits for the render that shows the receiving conversation and is dropped once the person leaves that canvas | The arrival first lands on the render still drawing the canvas left behind. |
| Toasts | The shipped toast ('Design system' Toast), message 14/20: "drafts.html handed off to checkout-flow.html" with the prominent Open; Open on a target no longer listed answers "Couldn’t open checkout-flow.html. The canvas isn’t in acme-web." without an action | |

### Documented differences from the draft

- **Panel width.** Every thread element is 1 px narrower (thread 314 where the draft's tiles draw 315): the panel's 1 px start border, which the draft's tiles leave out ('Context window ring', 'Panel composer width').
- **The gone card's tile.** The draft draws "drafts.html later deleted or renamed" as a line tile outside the panel, so its body falls back to the thread's 16/24; the app draws every card inside the panel at body-sm 14/20, as the draft's panel tiles do.
- **Fixture text.** The gone handoff card names `drafts.html` with an ID no longer listed (the renamed or deleted case).

### Not verified

- The draft's shipped parts left unmeasured: the permission notice in `source-requested`, the end notices in `source-cancelled`, and the person's bubble in the second `handoff-card` tile (the card itself is the same rule; the literal `{{1}}` is pinned by `ConversationThread.test.tsx`).
- A real handoff from a provider turn (the R1 runtime check). Not reached in the real app: the move held by a typing composer, a dialog or a choice made while the read is awaited, the 10 s wait, and a toast's Open waiting for the list read (`App.handoff.test.tsx`); first run is checked only in the pure `handoffMove` test (`handoffView.test.ts`).
- Hover and pressed states of Open (the draft draws none).

### Regression pointers

`threadItems.test.ts` (canvas card and handoff card items), `canvasCardText.test.ts` (card copy and Open targets), `handoffView.test.ts` (handoff card head, toasts, `handoffMove`), `ConversationThread.test.tsx` (markup, Open targets), `App.handoff.test.tsx` (move, wait, toasts, card focus), `CanvasConversationPanel.hooks.test.tsx` (the move's focus wait). Sizes and colours above are `.scratch/` probes only.

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

Reference: `.doan/canvases/canvas-drawing-cards.html` (frames `running`, `asking`, `ended`, `many`; only the card and its stack are new). Measured at 1238 × 780 with the panel at its default 347 and again narrowed to 280: the draft opened in a second window of the same Electron build, the app's canvas panel on a fixture repo `acme-web` whose canvas conversation was seeded as real `index.json` and JSONL history (one stopped turn with `canvas.drawn`, `handoff.requested`, `handoff.resolved` and `handoff.missed` events). Computed styles of the card and each part, CDP accessibility tree. No provider signed in.

| Element | Measured contract | Reason |
|---|---|---|
| Card | One per canvas path a turn drew (`canvas.drawn`), asked a handoff for, or missed. Grid `auto minmax(0, 1fr) auto`, column gap 8, centred; padding 8 / 8 / 8 / 12; radius 16 (`--radius-row`); `--surface-inset` (rgb(245,245,246)); no border or edge stripe. 52 high with one status line (68 with two) | The handoff card's surface, so the two read as one family. |
| Stack | A turn's cards sit together at its end, 8 apart (`.canvas-cards`, gap `--space-2`), 20 below the item before them (the thread gap); each card is its own thread item keyed by turn and path. While a request of the running turn waits, the stack sits above it and above Send now's messages, and moves below it once it folds; focus on a card's Open stays there through that move | What needs an answer stays last; a card keeps its element through every status. |
| State icon | 14 × 14 (`--size-icon-sm`) in `--text-metadata` (rgb(95,95,95)), 19 from the card's top: the shipped spinner while the turn runs on a card the turn drew, Lucide `check` for Drawn, `forward` for a handoff waiting (on a card the turn did not draw, also while the turn runs) or started, `ban` for refused, cancelled and missed | `check` says the file was written, not that the turn succeeded. |
| Name | Lucide `panels-top-left` (the sidebar's canvas icon) 14 × 14 in `--text-standard`, gap 4, then the file name at body-sm 14/20 medium, -0.035 px tracking, `--text-standard` (rgb(15,15,15)), one line. A name wider than its column is cut in the middle by the component, keeping its extension (measured: “onboarding-per…dmins.html” at 347, “onboarding…s.html” at 280), with the full name in the shipped tooltip on hover | The name never wraps and Open never shrinks. |
| Status | Caption 12/16, 0.16 px tracking, `--text-metadata`, wraps (`overflow-wrap: anywhere`): “Drawing”, “Hands off when this turn ends”, “Drawn”, “Handed off”, “Didn’t hand off.” + reason, “Didn’t hand off. The turn didn’t finish.”, “Didn’t hand off. The agent didn’t ask to.”; a canvas no longer listed adds “ · No longer in <project>” and hides Open, except after a refusal that already says it is no single canvas, while a handoff waits (its path may not be listed yet) and while the card still draws (the renderer's list can lag main's by a read) | The status never repeats the file name. |
| Open | The sm `trigger` button, 51.2 × 32, label 14/20 medium in `--text-standard`. It opens the new conversation for a started handoff and the canvas alone (Quick Open's path) otherwise; none for the conversation's own canvas or a canvas gone. In the prototype window it goes through the main window, as every Open there does | |
| Names | The card is `role="group"` named “<file>, <status>” (CDP: “checkout-flow.html, Drawn”, “gone.html, Drawn · No longer in acme-web”); Open is named “Open <file>” or “Open the new conversation on <file>”; the spinner and both icons are hidden. No live region: once the turn has ended (its end event, not Stop hiding the indicator), the thread's status line adds “<n> new canvases” after the end's title | |

Documented differences from the draft:
- **Panel width.** Cards are 1 px narrower (314 where the draft's tiles draw 315; 247 at 280): the panel's 1 px start border ('Canvas handoff').
- **Inherited text on containers.** The board's body is 14/20, the panel's 13/normal; only the card's containers inherit it, and every text part sets its own size, so no height or position differs.
- **Icon strokes.** The draft's icons set `stroke-width` on a `<use>` symbol, Lucide on the `<svg>`; both draw 2.
- **The long name at 280.** The draft's hand-cut “onboarding-per…dmins.html” is wider than its own 280 tile and clipped there; the app cuts to the width it has.

Not verified in the real app (no agent turn was running): the spinner states (“Drawing”, “Hands off when this turn ends”), the `asking` frame's order, the Overview's `running` frame and the prototype window itself (its 280 width was simulated in the canvas panel); pinned by `threadItems.test.ts`, `turnStatus.test.ts` and `ConversationThread.test.tsx`. Hover, pressed and keyboard-focus states of Open (the shared `trigger` button).

A handoff from a project conversation reuses the measured card, toasts and move with other text: the card head “Handed off from Overview” (“ · Conversation deleted” without Open once the source is deleted), the toasts “<project> Overview handed off to <target file>” and “<project> Overview handed off to <n> canvases”, and the move from the Overview. Not measured in the real app; pinned by `handoffView.test.ts`, `ConversationThread.test.tsx` and `App.handoff.test.tsx`.

Regression pointers: `threadItems.test.ts` (card items, order, placement, late events, keys), `turnStatus.test.ts` (indicator past cards, a stage before `canvas.drawn`, `drawingCards`), `canvasCardText.test.ts` (copy, icons, Open targets, `middleCut`, new canvases), `ConversationThread.test.tsx` (markup, stack, names, status line, path-only cards), `ConversationThread.focus.test.tsx` (Open's focus when the stack moves), `overviewRun.test.ts` (unseen ignores `canvas.drawn`). Sizes and colours above are `.scratch/design-sync/canvas-drawing-cards/` probes only.

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

- **Line spacing.** The draft draws the thread line inside the reply's `.msg-agent`, 8 below the reply; the app draws it as its own thread item, so it sits the thread's item gap below (24 in the Overview), as every folded line does (see Agent question card 'Folded lines').
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
| Place | The thread's last item, in the reply's place: after the last item at the thread's item gap (20 in the panel, 24 in the Overview), after a Send now sending message, and under the hand-off line. Absent while a permission card (measured) or a question card waits | PRODUCT §5 item 3 'Turn indicator'. |
| Line | `.ti-reply`: flex, centred, gap 8, `--text-subtle`; one line in the reply's type, body-sm 14/20 (−0.035 px) in the panel and 16/24 in the Overview, so it is 20 / 24 high in every state: a stage change pushed after the read kept the item 20 high and the scroll height unchanged | The scroll follows `[items]` only, so a stage change must not move the thread. |
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
