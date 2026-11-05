# queue-steer-shortcut — design

renderer만 바뀐다. main의 Send now 경로, IPC, 포맷은 그대로 쓴다. 사람이 정한 점은 아래 '결정'에 있다.

## 지금 코드(2026-11-05 확인)

- **키 처리.** `ComposerField`(`ComposerParts.tsx`)의 `onKeyDown`이 먼저 host의 `onKey`(`/` 목록, Backspace로 chip 지우기)를 부르고, 처리되지 않았으면 `isSubmitKey`(`homeComposer.ts`)로 `onSubmit`을 부른다. `isSubmitKey`는 `key === "Enter"`, Shift 없음, 조합 중 아님(`isComposing`, `keyCode 229`)만 보므로 Control+Enter도 보낸다. Home composer와 docked composer가 같은 `ComposerField`를 쓴다.
- **Send 자리.** `composerAction`(`composerRules.ts`): 턴이 없으면 send, 턴이 돌고 입력란이 비면 stop, 글이 있으면 queue. 입력란이 빈 채 Enter를 누르면 `send()`가 stop에서 바로 돌아가므로 아무 일도 없다.
- **Send now.** 행 버튼은 `QueueRows`(`DockedComposer.tsx`)의 `sendNow(id)`를 부른다. 이 함수가 같은 행의 두 번째 누름을 막고(`flying`), 행이 빠질 때의 포커스를 정하고(`focusAfter`, 포커스가 그 행의 버튼에 있을 때만 옮긴다), 거절 줄과 알림(`refused`, `announce`)을 맡는다. host는 `store.sendQueuedNow`(`conversationStore.ts`)로 행을 누른 순서(`pressed`)로 표시하고 IPC `conversation:sendQueuedNow`를 부른다. main의 `ConversationService.sendNow`는 IPC가 온 순서대로 `runner.steer`를 부르고, agent가 읽은 뒤에 답한다.
- **보이는 조건.** `sendNowShown`(`steerSupport.ts`): provider가 `STEER_PROVIDERS`(claude, codex)이고 phase가 running 또는 waiting. host가 이 값을 `DockedComposer`의 `sendNow` prop으로 준다.
- **큐에 넣기.** host의 `queue`(`CanvasConversationPanel.tsx`, `ProjectOverview.tsx`)가 `queueConversation` 답의 `itemId`로 store에 행을 넣고 `{ ok: true }`만 돌려준다.

## 영향받는 구성 요소

- **app(renderer)**: `homeComposer.ts`(키 판정), `composerRules.ts`(계획), `ComposerParts.tsx`(`ComposerField`의 키 연결), `DockedComposer.tsx`(`steerAll`, `QueueRows`의 handle과 큐 아래 단축키 caption, `send()`의 반환, `DockedOutcome`), `CanvasConversationPanel.tsx`·`ProjectOverview.tsx`(queue 답에 `itemId`).
- **app(main)·CLI·skills·포맷**: 바뀌지 않는다.

### 동작

1. `ComposerField`에 선택 prop `onSteerKey`를 더한다. `onKey`가 처리하지 않은 키가 `steerKey`(아래)에 맞고 `onSteerKey`가 있으면 기본 동작을 막고 `onSteerKey`를 부른 뒤 끝낸다. 그 밖에는 지금처럼 `isSubmitKey`로 간다. Home composer는 `onSteerKey`를 주지 않으므로 Control+Enter가 지금처럼 보낸다. `/` 목록이 열려 있으면 `onKey`가 먼저 처리하므로 지금과 같다.
2. `DockedComposer`의 `steerAll()`이 `steerAllPlan`의 답을 따른다.
   - `enter`: `send()`를 부른다(Enter와 같음).
   - `rows`가 참: `QueueRows`의 handle `sendAll()`을 부른다. `sendAll()`은 지금 그려진 `items`를 위에서부터 돌며 행마다 기존 `sendNow(id)`를 기다리지 않고 부른다. `flying`에 있는 행은 `sendNow`가 스스로 건너뛴다. 행 버튼을 빠르게 차례로 누른 것과 같은 경로이므로, 누른 순서 표시, 거절 줄, 알림, 큐 read mark(POSTMORTEM 2026-11-05)가 그대로 적용된다.
   - `draft`가 참: `send()`를 queue로 부른다. `send()`는 지금 `Promise<void>`라 outcome을 삼키므로, 최종 `DockedOutcome`을 돌려주도록 바꾼다. 답이 `{ ok: true, itemId }`이고 그때 `key`가 `shown.current`와 같을 때만 handle의 `sendNow(itemId)`를 부른다. 답을 기다리는 사이 사람이 다른 대화로 바꾸면 `QueueRows`가 다시 마운트되어 handle이 새 대화의 것이 되므로, 부르지 않고 그 행은 원래 대화의 큐에 남긴다(`send()` 자신의 `at === shown.current` 확인과 같은 이유). 이 행은 가장 새 행이므로 기존 행 뒤에 눌려 순서가 지켜진다. queue가 `not_running`(턴이 먼저 끝남)으로 거절되어 `send()`가 보내기로 넘어가면, 그 답은 `onSend`의 것이라 `itemId`가 없으므로 steer하지 않는다. 입력란의 글을 큐에 넣을 수 없으면(`availability` 거짓: 보내는 중, busy, 첨부 문제, 잠김) `send()`는 지금처럼 이유 줄을 남기고, 행은 `sendAll()`대로 간다. queue가 다른 이유로 실패하면 입력란은 지금처럼 남고 오류를 보이며, 이미 시도한 행은 그대로 간다.
   - `none`: 아무것도 하지 않는다(입력란이 비고 큐도 빔. Enter처럼 Stop을 부르지 않는다).
3. `DockedOutcome`의 성공을 `{ ok: true; itemId?: string }`로 넓히고, 두 host의 `queue`가 `reply.itemId`를 넣는다. renderer 안의 타입이고 IPC 답은 이미 `itemId`를 준다.
4. 접근성: `ComposerField`가 Send now를 쓸 수 있는 동안(`sendNow`가 참) 입력란에 `aria-keyshortcuts="Control+Enter"`를 두고, 쓸 수 없으면 두지 않는다. 화면에는 보이지 않는다.
5. 포커스: 키는 입력란에서 눌리므로 `focusAfter`가 포커스를 옮기지 않는다. draft를 queue로 보낸 경우 입력란이 비고 포커스는 `send()`의 `focus({ kind: "sent" })`대로 입력란에 남는다.

## 순수 함수로 뺄 부분(`/tdd` 대상)

- `steerKey(event: { key; ctrlKey; metaKey; altKey; shiftKey; isComposing; keyCode }): boolean` — `homeComposer.ts`, `isSubmitKey` 옆. Enter이고 Control만 눌렸고(Shift·Option·Command 없음) 조합 중이 아니며 `keyCode !== 229`일 때만 참.
- `steerAllPlan(input: { sendNow: boolean; rows: number; draft: boolean }): "enter" | "none" | { rows: boolean; draft: boolean }` — `composerRules.ts`. `sendNow`가 거짓이면 `enter`(결정 2), 참이면 행이 있으면 `rows`, 입력란에 보낼 것이 있으면 `draft`(결정 1), 둘 다 없으면 `none`. `draft`는 `composerAction`과 같은 기준(`dockedMessage(draft).text.trim() !== ""`)이다.

이 둘 밖의 판단(행 순서, 중복, 거절)은 기존 `QueueRows.sendNow`와 `conversationStore`가 이미 맡는다. 새 연결은 `DockedComposer.queue.test.tsx`·`DockedComposer.interaction.test.tsx`에서 실제 `ComposerField`의 keydown으로 확인한다(POSTMORTEM 2026-10-27 'typeahead': helper 테스트만으로는 연결을 못 잡았다).

## 포맷 변경

없다. JSON Schema, 대화 이벤트, IPC 채널과 답의 모양이 그대로다.

## 관례 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙을 건드리지 않는다.

## 결정 영향

- ARCHITECTURE의 구조 결정(append-only 이벤트, 토큰 미취급, git 미실행 등)을 건드리지 않는다. Send now의 main 쪽 규칙(ARCHITECTURE §7, `sendNow`가 항목 하나씩 `sending`으로 표시하고 읽힌 뒤 답함)을 그대로 쓴다.
- Claude runner는 steer가 있었던 턴의 끝에서 usage를 읽지 않는다(`runners.ts` `!state.steered?.length`, ARCHITECTURE §7 'Agent usage'). 이 단축키로 steer가 늘면 header의 Claude 사용량 링이 덜 갱신되지만, 이 기능은 그 규칙을 바꾸지 않는다.
- PRODUCT §5 'Project conversations'의 Send now 항목에 단축키 한 줄을 더하고, DESIGN.md의 Queued row 항목에 caption을 적는다(tasks Z1).

## 함께 고치는 feature

prompt-suggestion(`ComposerField`의 키 연결, `homeComposer.ts`의 키 판정, `takesSuggestion` ArrowRight)과 context-window-ring(`DockedComposer`의 새 prop)이 같은 renderer 파일을 고친다. 키는 겹치지 않는다. 나중에 들어가는 쪽이 `onKey` → `onSteerKey` → `isSubmitKey` 순서를 맞춘다.

## PoC 의존

- **한 번에 보낸 steer의 순서.** PRODUCT는 "Rows sent now one after another keep that order"라고 하지만, 같은 tick에 연달아 보낸 steer가 provider에서 그 순서로 읽히는지는 확인한 기록이 없다(git log·DESIGN.md·BACKLOG.md에서 찾지 못함, BACKLOG의 Codex process death 순서 항목은 다른 경우다). Doan 안에서는 순서가 지켜진다: renderer가 IPC를 누른 순서로 부르고, main의 `sendNow`는 `runner.steer`까지 같은 tick에서 간다. Claude는 턴의 input `inbox`에 넣은 순서대로(FIFO) CLI에 내보낸다(`runners.ts` `enqueue`·`messages`). Codex는 `turn/steer` 요청을 보낸 순서로 쓰지만(`dispatcher.ts` `steer`), 서버가 겹친 요청을 그 순서로 처리하고 읽는지는 코드로 알 수 없다. Claude CLI가 연달아 들어온 메시지를 그 순서로 읽는지도 실제로 본 적이 없다. tasks E1의 실제 앱 확인에서 행 셋을 한 번에 보내 thread의 순서를 본다. 순서가 어긋나면 구현을 멈추고 다시 설계한다(대안: main이 대화마다 앞 steer의 수락을 기다린 뒤 다음을 보낸다).
- **macOS에서의 실제 키.** Control+Enter가 contentEditable에서 Chromium keydown으로 `key: "Enter"`, `ctrlKey: true`로 오는지, 한국어 IME 조합 중 Control+Enter가 Enter처럼 조합을 끝낸 뒤 조합 아닌 keydown을 한 번 더 보내는지는 확인하지 않았다. 합성 이벤트는 이를 증명하지 못하므로(POSTMORTEM 2026-10-27 'typeahead': "Preserve separate native-focus/input verification") E1에서 실제 키 입력으로 본다.

## POSTMORTEM에서 가져온 함정

- 2026-11-05 "A Send now row refused back into the queue could vanish while main still held it": "when main's count of something can drop and come back (an in-flight mark, a lease), move the read mark to `readsStarted(root)` at the moment it comes back". 이번에는 여러 행이 한꺼번에 in-flight와 거절을 오가므로, store를 거치지 않는 새 경로를 만들지 않고 행마다 기존 `store.sendQueuedNow`를 부른다.
- 2026-10-27 "Rewritten shell typeahead skipped repeated letters and the current prefix match": "reuse the established keyboard matcher and test its actual event-handler wiring rather than relying only on helper tests". 키 판정은 `isSubmitKey` 옆에 두고, 테스트는 실제 `ComposerField` keydown에서 한다. 같은 항목의 "Preserve separate native-focus/input verification rather than treating renderer DOM focus as OS focus"에 따라 실제 키 입력은 따로 확인한다.
- 2026-10-28 "A send right after turn.done was refused as busy": 턴이 끝나는 순간의 경계. 이번 기능은 send 경로를 바꾸지 않지만, draft를 queue한 직후 턴이 끝나면 `send()`의 `not_running` 보내기 전환을 그대로 타는지 테스트로 확인한다.

## 읽은 design preset

읽지 않았다. 결정 3의 caption은 caption 글자와 `--text-metadata`를 쓰는 텍스트 한 줄이다. 사람이 화면을 보고 싶어 해서 초안을 그렸다(아래).

## 초안 요청

canvas `.doan/canvases/queue-steer-shortcut.html`, id `queue-steer-shortcut`. 캔버스 대화 패널(기본 360)의 docked composer를 shipped 코드와 docs/DESIGN.md대로 옮겨 그리고, 큐 목록 아래의 단축키 caption(결정 3, spec 완료 조건 7)만 새로 그린다. `.doan/canvases/queue-send-now.html`은 참고만 하고 고치지 않는다. Frames: `running`(턴이 도는 중, 행 2–3개, caption 보임), `no-send-now`(ACP provider이거나 턴이 없어 Send now를 쓸 수 없음, 행은 보이고 caption은 없음), `single-row`(행 하나), `refused`(단축키 뒤 한 행이 거절되어 그 행 아래 "Couldn’t send now. It stays queued.", caption은 유지), `draft-kept`(입력란의 글을 큐에 넣지 못해 이유 줄이 남고, 행들은 보내짐). Caption은 `doan-kbd` 키 "Ctrl"·"Enter"와 "Send all now"다. 행의 Send now 툴팁은 바뀌지 않는다. `/design-sync`는 다섯 frame을 모두 비교한다.

## 결정

1. **입력란에 글이 있을 때(Send now를 쓸 수 있는 턴)**: 그 글을 큐 끝에 넣고(입력란이 빔), 기존 행 다음에 그것까지 steer한다. 키 한 번으로 화면에 보이는 것을 모두 지금 턴에 넣고, 입력한 글이 가장 새것이라 순서도 지켜진다(사람).
2. **Send now를 쓸 수 없을 때**(턴 없음, ACP provider, 준비 중·판정 대기·큐 전송 직전): Enter와 같다. 턴이 없으면 보내고, 턴이 돌면 큐에 넣는다. 지금의 Control+Enter 동작을 바꾸지 않고, 키가 아무 일도 하지 않는 경우를 만들지 않는다(사람).
3. **표시**: 큐 목록 아래에 caption 한 줄을 두고, 글자 시작을 큐 행의 글자와 거절 줄의 글자 시작에 맞춰 왼쪽 정렬한다. 일반 텍스트 "Press Ctrl + Enter to send all now."로(`doan-kbd`·기호 없음, 행이 하나여도 같음), 대화가 Send now를 보이고 큐에 행이 있을 때만 보인다. 키는 행 하나가 아니라 큐 전체를 보내고 입력란에서만 듣으므로, 행 버튼 툴팁이 아니라 큐 아래에 알린다. 행의 Send now 툴팁은 바꾸지 않는다(사람).
4. **키가 듣는 곳**: docked composer의 입력란에 포커스가 있을 때만. Enter·Shift+Enter·IME 규칙이 입력란에 있고, 결정 1의 draft 처리도 입력란 기준이다(사람).
5. **초안 확인 답(2026-11-05, 사람).** 초안 `queue-steer-shortcut.html`을 보고 답했다. caption은 일반 텍스트 한 문장 "Press Ctrl + Enter to send all now."이고 행이 하나여도 같다. 위치는 왼쪽 정렬이고 글자 시작을 큐 행의 글자·거절 줄의 글자와 같은 x에 맞춘다(16 안쪽 + 16 아이콘 + 8 간격). 처음엔 16 안쪽 왼쪽 정렬, 이어 가운데 정렬이었다가, caption을 일반 텍스트로 바꾼 뒤 이 정렬로 돌아왔다. 목록 아래 4, card 위 8에 둔다. 색은 `--text-metadata`다. 기호 "⌃↩"와 `doan-kbd` 키 표시는 쓰지 않는다(두 차례 초안을 본 뒤 정함). 입력란은 Send now를 쓸 수 있는 동안만 `aria-keyshortcuts="Control+Enter"`를 갖는다. 사용자 확정(2026-11-05): 초안 확인.
