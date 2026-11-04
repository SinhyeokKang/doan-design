# canvas-composer-polish — design

## 영향받는 구성 요소

app(Electron + TS)만 바뀐다. CLI(Go)·skills·공유 포맷(comment events, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지)·대화 history 포맷은 바뀌지 않는다. 새 UI 초안 `.doan/canvases/canvas-composer-polish.html`을 그린다(아래 '초안 요청').

### 1. Presets 목록 바깥 클릭

- 위치: `app/src/renderer/ComposerParts.tsx`의 `PresetsButton`(Radix `Popover`)과 `SlashPresets`(직접 그린 목록), 이를 쓰는 `HomeComposerView.tsx`·`DockedComposer.tsx`.
- `PresetsButton`: Radix 기본값으로 부모 문서의 바깥 pointerdown에 이미 닫히고, portal된 목록 안은 Radix가 안으로 본다. 캔버스 iframe은 OOPIF라(`main/index.ts`, `CanvasController.ts` 주석) 그 안의 pointerdown은 부모 문서에 오지 않는다. 지금 iframe 스크립트는 pointerdown을 앱에 보내지 않는다(`canvasScript.ts`는 click의 `select`·`clear`, `picked`, `hover`, `key`만 보낸다). 다만 클릭 선택은 `focusOnClick()`으로 부모 문서의 캔버스 영역에 포커스를 옮기므로, Radix의 focus-outside로 이미 닫힐 수 있다(픽 중이나 ⌥-클릭은 예외일 수 있다). T1에서 확인한 결과로 정한다:
  - 신호가 필요하면 먼저 기존 `select`·`clear`·`picked` 처리에서 "캔버스를 눌렀다"는 렌더러 이벤트를 낸다.
  - 그것으로 모자랄 때만 새 canvas script 메시지를 더한다. 그때는 `parseCanvasMessage`와 `canvasMessage.test.ts`를 거친다(ARCHITECTURE §3 'Untrusted messages'). 위조된 메시지가 할 수 있는 일은 목록을 닫는 것뿐이다.
  - 신호로 닫을 때는 Radix가 트리거로 포커스를 돌리지 않게 `onCloseAutoFocus`에서 `preventDefault`한다(Radix는 바깥 상호작용을 본 경우만 이를 건너뛰는데, 신호로 닫는 것은 바깥 상호작용으로 잡히지 않는다).
- `SlashPresets`: 바깥 pointerdown 처리를 새로 둔다. 트리거는 필드다. 기존 패턴은 `CanvasConversationList.tsx`(capture 단계 document pointerdown + `contains`)와 `ConversationThread.tsx`의 `useLocateNote`다. 닫으면 Escape와 같은 dismissed 상태로 둔다. dismissed는 컴포넌트 상태다(Home의 `setDismissed(true)`, Docked의 `setDismissedKey(key)`). `slashQuery`(`homeComposer.ts`)는 상태가 없으므로 바꾸지 않는다.
- 바깥 판정 순수 함수는 `/` 목록에만 쓴다(아래). Presets 버튼 목록은 Radix 판정과 캔버스 신호로 충분하다.

### 2. Send now를 쓰레드로

- main은 바꾸지 않는다. `ConversationService.sendNow`가 에이전트가 읽은 뒤(`steerConsumed`) `user.message`를 append하고 IPC에 답하는 흐름은 그대로다. history는 append-only이고, 읽히기 전의 메시지를 history에 미리 쓰지 않는다.
- renderer: `ConversationStore`가 Send now 중인 항목을 큐 표시에서 빼고 "보내는 중" 목록으로 옮긴다(`conversationStore.ts`의 `markQueued(..., true)`·`syncQueues`가 지금은 큐 안에 `sending`으로 둔다). 쓰레드(`ConversationThread.tsx`, `threadItems.ts`)는 history 항목 뒤에 보내는 중인 메시지를 사람 메시지 모양으로 칩·첨부까지 그리고, 보내는 중 표시를 붙인다. 열린 권한 요청 카드가 있으면 그 카드를 마지막에 두고 보내는 중 메시지는 그 위에 둔다.
- 칩·첨부: 지금 renderer의 `QueuedMessage`는 `{ id, text, sending? }`뿐이다(큐에 넣을 때 `queuedText(request)`로 글자만 남긴다, `CanvasConversationPanel.tsx`·`overviewRun.ts`). `QueuedMessage`에 `anchors`와 첨부 표시 값을 더한다. 큐에 넣는 요청에 이미 있는 값으로 채우고, 첨부를 그리는 데 모자란 값(이름, 종류 등)은 `conversation:queue` 응답에 더해 받는다. 이 응답은 app 내부 IPC라 공유 포맷이 아니다. history와 app socket 메시지는 바뀌지 않는다.
- 읽힘 판정: steer로 append되는 `user.message`에는 큐 항목 id도 message id도 없다(`service.ts` `sendNow`의 `messageId`는 main 안에서만 쓴다). 그래서 renderer는 지금 `unqueued`처럼 `sendQueuedNow` IPC가 성공하면 보내는 중 항목을 지운다. main은 `user.message`를 전달한 뒤 IPC에 답하므로, 한 렌더 동안 실제 메시지와 보내는 중 항목이 함께 보일 수 있다. history에 id를 더하는 것은 포맷 변경이라 하지 않는다. `/tdd`에서 두 도착 순서(이벤트 먼저·응답 나중, 그 반대)를 모두 고정한다.
- 큐로 돌리는 경우: IPC 거절(`not_running`, `stale`, `attachment_missing`, `bad_request`)과 턴 종료. `stale`은 턴 종료가 아니라 항목이 없어졌거나 이미 나가는 중이라는 뜻이다. 돌아온 뒤는 main의 큐 규칙을 따른다(끝난 턴 뒤 다음 턴, 실패·중지 뒤 초안). 지금 거절 문구를 보이는 큐 줄 아래 status line은 그대로 쓴다.
- 거절 알림: 줄이 빠졌다가 거절 문구를 단 채 다시 그려지면, 내용을 가진 채 삽입된 live region은 스크린 리더가 읽지 않을 수 있다. 거절 문구는 계속 붙어 있는 live region(`DockedComposer.tsx`의 `sr-only` status)으로도 알린다. 큐와 쓰레드 사이의 이동 애니메이션은 없으므로 reduced motion에 따로 할 일은 없고, 스크롤은 쓰레드의 기존 따라가기·Jump to latest 규칙을 따른다.
- reload: 보내는 중 항목은 renderer 상태이고 main의 `queued()`는 `sending` 항목을 빼므로, Send now 중에 reload하면 그 메시지는 읽히거나 거절될 때까지 큐에도 쓰레드에도 보이지 않는다. 지금과 같은 한계다.
- 큐에서 줄이 빠질 때의 포커스는 `queueFocusAfter`(`queueFocus.ts`) 규칙을 그대로 쓴다. 지금은 IPC 성공 때 줄이 빠지지만, 이제 누르는 순간 빠진다. 거절로 줄이 돌아올 때 포커스는 옮기지 않는다.
- Claude의 읽기 대기 상한 `STEER_READ_WAIT_MS`(30초)와 그 뒤 동작은 바뀌지 않는다. 쓰레드의 보내는 중 항목은 그동안 남아 있다. 상한이 지나면 main은 턴을 done으로 끝내고(`expireRead`), steer를 `not_running`으로 거절하고(`dropSteers`), 큐를 다음 턴으로 보낸다. 그래서 메시지는 쓰레드 → 큐 → 다음 턴의 쓰레드로 옮겨 보인다.

### 3. 툴바 Picker와 ⌘L

- `app/src/renderer/CanvasTools.tsx`: 세 번째 버튼을 Add to conversation(`MessageSquarePlus`)에서 Picker로 바꾼다. 아이콘은 대화창 Pick 버튼과 같은 lucide `Crosshair`. Picker는 Select·Hand와 달리 지속 도구가 아니라 픽 한 번을 시작하는 버튼이고, 픽 중에만 눌린 상태(`aria-pressed`)다. 픽 중에는 Picker만 눌린 상태이고 Select·Hand는 `aria-pressed=false`로 보인다. 픽이 끝나면 픽 전의 도구가 다시 눌린다.
- 픽 중 Select·Hand: 지금 `CanvasController.setTool`은 픽 중이면 아무것도 하지 않는다. 툴바 버튼에서 온 호출은 픽을 취소한 뒤 그 도구로 바꾸도록 고친다. V·H 단축키 경로는 지금처럼 픽 중에 무시한다(PRODUCT §5 item 2 'Toolbar').
- 동작은 대화창의 `togglePick`(`App.tsx`)과 같은 함수를 부른다. 대화창이 접혀 있으면 `foldPanel(true, …)`(`App.tsx`)로 먼저 펼친다. 펼침 이유는 `rightPanelOpen.ts`의 기존 `{ kind: "addToConversation" }` trigger 이름을 바꿔 쓴다(새 trigger를 옆에 더하지 않는다). 접힌 대화창도 composer를 마운트한 채 두므로(`App.tsx` 주석) 필드를 기다릴 필요 없이 바로 픽을 시작한다. 펼침이 `composerKey`를 바꾸지 않아 `cancelPick` effect가 픽을 바로 취소하지 않는지 `/tdd`에서 고정한다. 칩은 기존 `pickEnded`가 보관한 캐럿에 넣는다.
- 픽 뒤 포커스: 칩을 넣으면 `pickEnded`대로 필드로 간다. 툴바 Picker를 다시 눌러 취소하면 Picker에 남고, Esc로 취소하면 픽 전에 있던 곳으로 돌아간다.
- ⌘L: 메뉴 항목은 main의 Edit 메뉴에 있다(`app/src/main/index.ts`의 `MenuCommand` `addSelectionToConversation`, 이름 "Add Selection to Conversation", accelerator `CmdOrCtrl+L`). 활성 규칙은 `app/src/main/menuState.ts`의 `screen === "canvas" && selection && pickerAvailable`이고, renderer가 `App.tsx`에서 `selection`·`pickerAvailable`을 메뉴 context로 보낸다. 바꿀 것:
  - 명령과 이름을 픽 시작으로 바꾼다(아래 문구). 픽 중의 ⌘L은 `togglePick`이므로 픽을 취소한다.
  - 활성 규칙에서 `selection`을 뺀다(`screen === "canvas" && pickerAvailable`).
  - 고아가 되는 것을 지운다: `MenuInputs.selection`, `menuSelection`, `addReady`, `addSelection`, `focusOnOpen`과 그 effect, `CanvasTools.tsx`의 `AddTool`.
  - 대화창 필드(contenteditable)에 포커스가 있을 때 ⌘L이 메뉴에 닿는지 확인한다(ARCHITECTURE의 ⌘B 메모: 페이지가 처리한 키는 메뉴에 가지 않는다).
- 쓸 수 있는지는 `pickerView`(`pickerAvailability`, `canvasPicker.ts`)를 그대로 쓴다. `pickerAvailability`는 대화창 접힘을 보지 않으므로 툴바용 함수를 따로 두지 않는다.
- Esc 순서(PRODUCT §5 item 2 'Notices and states': 메뉴·popover → `/` 목록 → 픽 취소 → Hand → 선택 해제)는 바뀌지 않는다.

### 4. 답 대기 중인 대화는 막지 않음

- main: `app/src/main/conversation/service.ts`의 `checkProject`가 start(`newDesign`)·send 두 곳에서 두 조건으로 막는다. 둘 다 바꿔야 답 대기 중인 대화가 막지 않는다.
  - `projectBusy`(`project.ts`)는 `turn.busy && !turn.terminal`로 실행 중과 답 대기를 함께 센다. `ProjectTurn`과 `Live`에는 답 대기를 나타내는 값이 없으므로, `receive()`가 `permission.request`·`permission.resolved`·만료로 열린 권한 요청 수를 세어 live 상태에 둔다. `projectBusy`는 열린 요청이 있는 턴을 세지 않는다. 나머지(`holding`, 끝난 지 10초 안이고 판정하지 않음)는 그대로 둔다.
  - evidence 조건: evidence는 턴을 받아들일 때 만들어져(`service.ts`의 start·send) 판정할 때까지 남고, 그동안 같은 root의 다른 대화를 막는다. 답을 기다리는 턴의 evidence는 세지 않는다. 끝난 턴의 미판정 evidence는 그대로 막는다(2026-10-28 POSTMORTEM).
  - `service.test.ts`(`app/src/main/conversation/`)의 "keeps counting a project turn that made a canvas…" 케이스도 이 규칙에 맞게 고친다.
- renderer: `homeRun.ts`의 `holdsRoot`는 시작 판정(`running()`, 이유 줄)과 프로젝트 제거 확인(`remove()`의 `removalConfirm`) 두 곳에 쓰인다. 제거 확인은 답 대기를 계속 세야 하므로 `holdsRoot`는 그대로 두고, 시작 판정용 술어를 따로 둔다(`working && phase !== "waiting"`). `working`은 main(`app/src/main/conversation/summary.ts`, `service.working`)이 계산하고 사이드바 슬롯·strip이 쓰므로 바꾸지 않는다.
- 문구: `homeConversations.ts`의 `anotherConversation(project, waiting)`은 `waiting` 분기를 지운다. 호출하는 곳도 함께 고친다: `dockedRules.ts`의 `busyReason`(`DockedBusy.waiting`), `homeComposer.ts`, `homeRun.ts`의 `waiting:`, `ProjectOverview.tsx`의 `holder.waiting`과 `openOther(... "permission")`(고아가 되면 지운다). 제거 확인의 `aConversation`은 그대로다.
- 겹치는 턴: 답 대기 중인 대화가 답을 받아 다시 실행되면, 그 사이 시작한 다른 project conversation과 같은 root에서 함께 실행된다. 답을 기다리는 대화가 여럿이면 둘 이상의 턴이 겹칠 수 있다. 그때부터는 새로 시작·보내기가 다시 막힌다(실행 중이 있으므로). Overview는 지금처럼 하나의 현재 project conversation을 보이고, 다른 대화는 제목 메뉴와 사이드바 슬롯으로 연다.
- 겹친 동안의 큐: 끝난 턴의 큐는 `flush` → `send` → `checkProject`를 거치므로, 같은 root의 다른 턴이 실행 중이면 `project_busy`로 거절되고 `giveBack`이 초안으로 돌려준다. 이 동작은 바꾸지 않는다(사용자 결정). 보통의 보내기도 같은 이유 줄로 막힌다.
- promotion: 기존 규칙은 겹친 턴에서 틀린 대화를 고를 수 있다. `canvasWorking`(`service.ts`)은 대상 캔버스의 현재 대화가 working일 때만 막고, 판정이 끝난 대화는 working이 아니다. 예: A가 답을 기다리는 동안 B가 시작해 캔버스 X를 만들고 끝나 X에 붙는다. 그 뒤 A가 답을 받고 끝나면, X는 A의 snapshot에 없으므로 A의 새 캔버스 후보가 되고, `promoteTo`가 A를 X에 붙이며 B를 archive한다. 그래서 규칙을 하나 더한다(사용자 결정):
  - 턴의 판정은 그 턴의 snapshot 뒤에 다른 대화에 붙은 캔버스를 후보에서 뺀다(새 캔버스, 기존 캔버스 모두).
  - main은 evidence마다 "snapshot 뒤 다른 대화에 붙은 캔버스" 집합을 두고, 다른 대화를 캔버스에 붙이는 쓰기(promotion의 `conversation.bound`)가 일어나면 같은 root의 다른 evidence에 그 캔버스를 더한다. `promotionTarget`(`project.ts`)은 이 집합을 받아 후보에서 뺀다.
  - `/tdd`에서 위 예(A 나중 판정)와 반대 순서, 겹치지 않는 기존 경우를 고정한다.
- Home의 새 캔버스: `homeRun.ts`의 `entriesChanged`는 새 캔버스를 root의 첫 live Home 대화에 붙여 `canvasAppeared`(자동 열기 또는 toast)와 `drew`를 정한다. 겹친 턴에서는 다른 대화의 캔버스를 그 대화의 것으로 볼 수 있으므로, 같은 root에 live 턴(실행 중, 답 대기, 끝난 뒤 판정 창 안)이 둘 이상이면 새 캔버스 후보를 확인한 것으로만 두고(`checked`) `canvasAppeared`와 `drew`를 건너뛴다(사용자 결정). live 턴 수는 Home이 시작한 대화만이 아니라 그 root의 모든 project conversation으로 센다.

### 5. 툴바 Export

- `CanvasTools.tsx` 끝에 구분선(`role="separator"`)과 Export 버튼(lucide `Download`, 행 메뉴와 같은 아이콘)을 둔다. Export는 도구가 아니라 동작이므로 `aria-pressed`가 없다. ←/→ 툴바 이동에는 포함한다. 비활성은 `disabled`가 아니라 `aria-disabled`로 둔다: `moveBetweenTools`는 `:disabled`만 건너뛰므로 ←/→로 닿고, 저장 패널과 내보내기 중에도 포커스가 버튼에 남는다. 저장 패널이 닫히면 포커스를 Export로 돌린다.
- 실행은 행 메뉴와 같은 `exportCanvas(root, row)`(`App.tsx`)를 부른다. 열린 캔버스의 행은 이미 `CanvasState.open.row`(`CanvasController.ts`)에 있으므로 따로 찾지 않는다. 목록에 없는 페이지는 `state.unlisted`로 안다. `exportCanvas`는 페이지 잠금 중에 아무것도 하지 않으므로(`locked()`), 툴바 Export도 그동안 행 메뉴 버튼처럼 아무것도 하지 않는다.
- 비활성 이유는 행 메뉴의 `exportReason`(`ShellSidebar.tsx`: "Can’t read this canvas.", "Exporting")을 순수 함수로 꺼내 둘이 같이 쓴다. 목록에 없는 페이지의 이유는 앱에 이미 있는 "This page is not a listed canvas."를 쓴다.

### 6. Canvas conversations 행의 Delete

- 위치: `app/src/renderer/CanvasConversationList.tsx`(Overview 오른쪽 패널). main과 IPC는 바뀌지 않는다. 재사용하는 것:
  - 판정·문구: `conversationDelete.ts`의 `deleteAvailability`, `deleteDialogView`, `deleteRefusalText`.
  - 확인 창: `ConversationDeleteDialog.tsx`의 `ConversationDeleteDialog`. `ConversationDeleteItem`은 Radix `DropdownMenu.Item`이라 메뉴 밖에서 쓸 수 없으므로, 이 목록의 버튼은 따로 그린다.
  - 삭제 실행: `App.tsx`의 `confirmDelete`·`deleteSummary`. `DeleteTarget.from`(`"overview" | "canvas"`)에 이 목록에서 연 경우를 더해, 끝난 뒤 포커스를 제목 메뉴 트리거가 아니라 아래 규칙으로 보낸다.
- 마크업: 행은 `<button class="cv-row">`이므로 Delete는 그 안에 넣을 수 없다. 같은 `li` 안의 형제 버튼으로 두고, 시간 자리에 겹쳐 행이 밀리지 않게 한다. 포인터가 행 위에 있을 때만 보이는 버튼도 키보드 포커스에서는 보여야 한다.
- 키보드: 사이드바 캔버스 행 메뉴 버튼과 같이 Tab·Shift-Tab이 행과 Delete 사이를 오가고, ↑/↓·Home·End(`listKeyTarget`)는 행 사이만 움직인다.
- 삭제 뒤 포커스: 다음 행, 없으면 앞 행, 없으면 패널 제목(2026-11-03 POSTMORTEM 'A canvas row menu closed by Esc dropped focus to the page body'). 이 규칙은 이미 `listKeyboard.ts`의 `focusAfterLeave`(`RowFocusMemory.left`)에 있으므로 새 함수를 만들지 않는다. 다만 확인 창이 포커스를 가져가면 `RowFocusMemory`의 blur가 행을 잊고, 목록의 pointerdown 처리도 `.cv-row` 밖의 Delete를 누르면 기억을 지운다. 그래서 확인 창을 열기 전에 갈 곳을 `focusAfterLeave`로 계산해 삭제 경로에 넘긴다. Cancel·Esc는 그 행의 Delete로 포커스를 돌린다.
- main이 거절하면(그 사이 대화가 working이 됨) 제목 메뉴와 같은 toast를 보이고 행은 남는다.
- 특수 행(목록에 없는 캔버스, 여러 캔버스가 쓰는 ID, 읽을 수 없는 캔버스)에도 같은 Delete를 둔다(사용자 결정). 지금 특수 행은 `problem` 문구로 이름과 이유를 읽힌다(`CanvasConversationList.tsx`). Delete는 그 행의 형제 버튼이라 행의 열림 여부(`openable`)와 상관없이 동작한다.

## 초안 요청 (`/design-draft`, task U0)

바뀌는 화면은 모두 main에 있고 이 feature는 parent의 redesign child가 아니다. 그래도 사람이 이 feature에 한해 새 초안을 그리는 것을 승인했다(tasks U0). 새 초안은 C1 `/design-sync`의 기준이다.

- 캔버스: `.doan/canvases/canvas-composer-polish.html`, id `canvas-composer-polish`. 기존 초안(`canvas-hand-tool.html`, `queue-send-now.html`, `conversation-delete.html`, `buzz-canvas.html`, `buzz-canvas-conversation.html`, `buzz-project.html`, `buzz-home.html` 등)은 고치지 않는다. 셸·툴바·쓰레드·목록 행의 프리미티브는 지금 구현과 `docs/DESIGN.md` 측정값을 따른다.
- 프레임:
  1. `toolbar-default` — 캔버스 툴바: Select(눌림), Hand, Picker, 구분선, Export. Picker tooltip("Pick from canvas", ⌘L)과 Export tooltip("Export…").
  2. `toolbar-picking` — 픽 중: Picker만 눌림(Select·Hand 눌리지 않음), 대화창 Pick 버튼도 눌림.
  3. `toolbar-disabled` — 비활성과 이유 tooltip: Picker(지금 Pick from canvas의 비활성 이유 하나), Export(목록에 없는 페이지 "This page is not a listed canvas.", 행 읽기 오류 "Can’t read this canvas.", 내보내기 중). 비활성 버튼은 포커스를 받을 수 있는 모양(`aria-disabled`)이다.
  4. `sending` — 쓰레드: 칩과 첨부를 가진 보내는 중 메시지(`Sending`)가 열린 권한 요청 카드 바로 위에 있고, 권한 요청 카드가 마지막이다. 위의 큐 줄 하나는 남아 있다.
  5. `sending-read` — 읽힘: `Sending` 표시가 사라지고 메시지가 턴 안의 실제 위치에 있으며, 에이전트의 이어지는 답이 뒤따른다.
  6. `sending-refused` — 거절: 쓰레드의 메시지가 사라지고 큐의 원래 자리에 줄이 돌아와, 그 아래에 "Couldn’t send now. It stays queued." status line이 있다.
  7. `cv-delete` — Overview Canvas conversations 행: 포인터가 올라간 행의 시간 자리에 Delete, 키보드 포커스가 있는 Delete와 tooltip “Delete conversation”, working·답 대기 행의 Delete와 이유 tooltip.
  8. `cv-special` — 특수 행 세 가지(목록에 없는 캔버스, 여러 캔버스가 쓰는 ID, 읽을 수 없는 캔버스) 각각의 Delete.
  9. `home-reason` — Home composer의 이유 줄 "Another conversation is still running in <project>."(needs your answer 줄 없음).
- 그리지 않는 것: Presets 목록 바깥 닫기, admission 변경, 삭제 확인 창(기존 `conversation-delete.html`과 같음), Export 저장 패널·toast(기존과 같음).
- 제약: 값은 spec 완료 조건 2·3·4·5·6과 이 design을 따른다. 프레임 목록에 없는 상태는 그리지 않는다.

## 문구 (clarify preset을 적용해 `/design-draft`·`/implement`에서 확정)

- 툴바 Picker tooltip·접근 이름: 대화창 Pick 버튼의 이름 "Pick from canvas"를 그대로 쓴다. 단축키 표시 ⌘L은 툴바 Picker와 대화창 Pick 버튼 tooltip 모두에 보인다.
- 메뉴 명령(⌘L): "Pick from Canvas" (macOS 메뉴 title case).
- 툴바 Export tooltip·접근 이름: "Export…"(저장 패널을 여는 명령이라 말줄임표를 유지한다. 행 메뉴의 Export…와 같은 이름, PRODUCT §5 item 1 'Canvas row menu').
- Send now 중인 쓰레드 메시지의 표시: 진행 상태이므로 말줄임표 없는 "Sending"을 쓴다.
- 4번의 이유 줄: "Another conversation is still running in <project>."만 남는다.
- 툴바 Export의 목록에 없는 페이지 이유: "This page is not a listed canvas."(App.tsx의 기존 notice 문구).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `outsidePresetList(target, list, field)` 또는 같은 역할의 판정: `/` 목록에서 pointerdown이 목록과 필드 밖인지.
- 보내는 중 메시지의 표시 목록: 큐 항목과 보내는 중 항목에서 큐 줄과 쓰레드 끝의 보내는 중 항목을 만드는 함수(`threadItems.ts`·`conversationStore.ts` 쪽). IPC 성공(읽힘), 거절, 턴 종료에서의 이동, 두 줄 연달아 누른 순서, 열린 권한 요청 카드 위의 위치를 포함한다.
- `promotionTarget`의 "snapshot 뒤 다른 대화에 붙은 캔버스" 제외.
- Home의 새 캔버스 처리: root의 live 턴 수가 둘 이상이면 자동 열기와 `drew`를 건너뛰는 판정.
- `projectBusy`(main)의 답 대기 제외와 evidence 조건, renderer의 시작 판정 술어. 두 쪽은 입력 모양이 달라 모듈을 공유하지 않고, design에 적은 같은 상태 표로 각각 테스트한다.
- `anotherConversation`의 문구 축소.
- `canvasExportReason(row, exporting, unlisted)`: 행 메뉴와 툴바 Export가 같이 쓰는 비활성 이유.

## 포맷 변경

없다. JSON Schema, `v`, 픽스처, CLI 응답, app socket 메시지, 대화 history 포맷 모두 그대로다. 보내는 중 메시지는 renderer 상태일 뿐 history에 쓰지 않는다. `conversation:queue` 응답에 첨부 표시 값을 더하는 것은 app 내부 IPC 변경이다.

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. ARCHITECTURE §7 'Agent conversation runtime and IPC'의 다음 설명은 바뀌므로 Z1에서 고친다: `projectBusy` 문단의 "A conversation without a canvas holds its root from admission for the whole turn"(답 대기와 evidence 예외), Send now 문단의 "the renderer keeps those rows itself"(줄이 쓰레드로 옮겨짐). T1 결과로 새 canvas script 메시지를 더하면 §3의 메시지 설명도 고친다.

## 결정 영향

- **append-only events**: 유지한다. Send now 메시지는 에이전트가 읽은 뒤에만 history에 쓰고, 그 전의 쓰레드 표시는 renderer 상태다.
- **한 root에 project conversation 하나**(PRODUCT §5 item 1 'Project conversations'): 답 대기 중인 대화를 실행 중으로 세지 않도록 규칙을 바꾼다. 사용자 결정이며, Z1에서 PRODUCT를 고친다. 답을 받은 뒤 두 턴이 겹칠 수 있다는 점을 같은 문단에 적는다.
- **PRODUCT §5 item 2 'Toolbar', item 6**: Add to conversation이 Picker로 바뀌고 ⌘L이 픽을 시작한다. 사용자 결정이며, Z1에서 PRODUCT를 고친다.
- **PRODUCT §3 In scope 8**: Export를 여는 곳에 툴바가 더해진다. Z1에서 고친다.
- **ARCHITECTURE §7**: 위 '컨벤션 영향'의 두 문단. Z1에서 고친다.
- 서빙 범위, sandbox iframe, 토큰 처리, git 동작에는 닿지 않는다.

## PoC 의존

없다. 다만 문제 1의 "캔버스 iframe 클릭에 Presets popover가 닫히지 않는다"는 코드에서 추론한 것이므로, T1에서 실제 앱으로 먼저 확인하고 결과에 맞춰 1번 설계(캔버스 신호가 필요한지)를 정한다.

## POSTMORTEM에서 가져온 함정

- 2026-11-02 'Every Overview menu opened under the Overview itself': docked composer의 Presets popover는 portal로 그려진다. 바깥 판정은 portal된 목록의 DOM을 기준으로 한다.
- 2026-11-01 'A frame drawer list closed by a disabled trigger reopened by itself': 트리거를 눌러 닫는 것과 바깥 클릭으로 닫는 것이 겹쳐 다시 열리지 않게, 트리거는 바깥에서 뺀다.
- 2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body': 툴바 Export와 Picker 뒤의 포커스도 body로 떨어지지 않게 한다.
- 2026-11-02 'Tab walked into the draft, drew its focus rings and scrolled the floating tools away': 툴바에 버튼을 더할 때 툴바의 Tab 순서와 ←/→ 이동 규칙을 지킨다.
- 2026-11-03 'Export refused icons the app showed, set as url() in a custom property': 툴바 Export는 같은 export 경로를 쓰므로 새 거절 경로를 만들지 않는다.
- 2026-10-27 'Awaited conversation work outlived its current turn': Send now의 보내는 중 항목은 턴이 끝나면 반드시 지운다.
- 2026-10-28 'A send right after turn.done was refused as busy until the previous process group was gone': 4번에서 admission을 바꿀 때 끝난 직후의 busy 판정을 건드리지 않는다.
- 2026-10-30 'A renderer import of a main module left the built app's window blank': `projectBusy`와 `holdsRoot`의 공통 판정을 렌더러에서 쓰려면 순수·타입 전용 모듈에 둔다.
