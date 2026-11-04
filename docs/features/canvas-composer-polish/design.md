# canvas-composer-polish — design

## 영향받는 구성 요소

app(Electron + TS)만 바뀐다. CLI(Go)·skills·공유 포맷(comment events, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지)·대화 history 포맷은 바뀌지 않는다.

### 1. Presets 목록 바깥 클릭

- 위치: `app/src/renderer/ComposerParts.tsx`의 `PresetsButton`(Radix `Popover`)과 `SlashPresets`(직접 그린 목록), 이를 쓰는 `HomeComposerView.tsx`·`DockedComposer.tsx`.
- `PresetsButton`: Radix 기본값으로 부모 문서의 바깥 pointerdown에 이미 닫힌다. 캔버스 iframe(OOPIF) 안의 pointerdown은 부모 문서에 오지 않으므로, 캔버스 쪽 신호로 닫는다. `CanvasController`가 iframe 스크립트에서 받는 pointer 신호(선택·픽에 쓰는 것, `CanvasController.ts`)에 "캔버스에서 pointerdown이 일어났다"를 렌더러 이벤트로 하나 더 내고, 열린 Presets 목록이 이를 받아 닫는다. 새 iframe 메시지 종류가 필요하면 기존 canvas script 메시지에 더한다.
- `SlashPresets`: 바깥 pointerdown 처리를 새로 둔다. 기존 패턴은 `CanvasConversationList.tsx`(capture 단계 document pointerdown + `contains`)와 `ConversationThread.tsx`의 `useLocateNote`다. 닫으면 Escape와 같은 dismissed 상태로 둔다(`slashQuery(text, dismissed)`).
- 두 목록이 같은 판정을 쓰도록 순수 함수 하나로 뺀다(아래).

### 2. Send now를 쓰레드로

- main은 바꾸지 않는다. `ConversationService.sendNow`가 에이전트가 읽은 뒤(`steerConsumed`) `user.message`를 append하고 IPC에 답하는 흐름은 그대로다. history는 append-only이고, 읽히기 전의 메시지를 history에 미리 쓰지 않는다.
- renderer: `ConversationStore`가 Send now 중인 항목을 큐 표시에서 빼고 "보내는 중" 목록으로 옮긴다(`conversationStore.ts`의 `markQueued(..., true)`·`syncQueues`가 지금은 큐 안에 `sending`으로 둔다). 쓰레드(`ConversationThread.tsx`, `threadItems.ts`)는 history 항목 뒤에 보내는 중인 메시지를 사람 메시지 모양으로 그리고, 보내는 중 표시를 붙인다. `user.message`가 도착하면(같은 message id) 보내는 중 항목을 지운다. IPC 거절이나 턴 종료(`not_running`·`stale`)면 보내는 중 항목을 지우고 큐의 원래 자리로 돌린다. 지금 거절 문구를 보이는 큐 줄 아래 status line은 그대로 쓴다.
- 큐에서 줄이 빠질 때의 포커스는 `queueFocusAfter`(`queueFocus.ts`) 규칙을 그대로 쓴다. 지금은 IPC 성공 때 줄이 빠지지만, 이제 누르는 순간 빠진다. 거절로 줄이 돌아올 때 포커스는 옮기지 않는다.
- Claude의 읽기 대기 상한 `STEER_READ_WAIT_MS`(30초)와 그 뒤 동작은 바뀌지 않는다. 쓰레드의 보내는 중 항목은 그동안 남아 있다.

### 3. 툴바 Picker와 ⌘L

- `app/src/renderer/CanvasTools.tsx`: 세 번째 버튼을 Add to conversation(`MessageSquarePlus`)에서 Picker로 바꾼다. 아이콘은 대화창 Pick 버튼과 같은 lucide `Crosshair`. Picker는 Select·Hand와 달리 지속 도구가 아니라 픽 한 번을 시작하는 버튼이고, 픽 중에만 눌린 상태(`aria-pressed`)다. Select/Hand 중 하나가 눌려 있다는 규칙은 그대로다.
- 동작은 대화창의 `togglePick`(`App.tsx`)과 같은 함수를 부른다. 대화창이 접혀 있으면 `foldPanel(true, …)`로 먼저 펼치고(`rightPanelOpen.ts`에 새 trigger), 필드가 준비된 뒤 픽을 시작한다. 칩은 기존 `pickEnded`가 보관한 캐럿에 넣는다.
- ⌘L: App 메뉴 명령 `addSelectionToConversation`(`App.tsx` `menuCommand`)을 픽 시작으로 바꾼다. 메뉴 항목 이름도 같이 바꾼다(아래 문구). 기존 선택을 넣는 경로(`App.tsx`의 add-to-conversation, `addReady`)는 지운다.
- 쓸 수 있는지는 `pickerAvailability`(`canvasPicker.ts`)를 그대로 쓴다. 대화창이 접혀 있는 것은 비활성 이유가 아니다(펼치면 되므로). 이 차이를 순수 함수로 둔다.
- Esc 순서(PRODUCT §5 item 2 'Notices and states': 메뉴·popover → `/` 목록 → 픽 취소 → Hand → 선택 해제)는 바뀌지 않는다.

### 4. 답 대기 중인 대화는 막지 않음

- main: `app/src/main/conversation/project.ts`의 `projectBusy`가 `turn.busy && !turn.terminal`로 실행 중과 답 대기를 함께 센다. 답 대기(권한 요청이 열려 있는 상태)를 빼고, 나머지(`holding`, 끝난 지 10초 안이고 판정하지 않음, 다른 턴의 promotion evidence 미판정)는 그대로 둔다. `service.ts`의 `checkProject`가 start(`newDesign`)·send 두 곳에서 이를 쓴다.
- renderer: `homeRun.ts`의 `holdsRoot`와 `summary.ts`의 `working`이 같은 판정을 렌더러에서 한다. `holdsRoot`에서 답 대기를 뺀다(`working` 자체는 사이드바 슬롯·strip이 쓰므로 바꾸지 않는다). `homeConversations.ts`의 `anotherConversation(project, waiting)`은 `waiting` 분기를 지운다.
- 겹치는 턴: 답 대기 중인 대화가 답을 받아 다시 실행되면, 그 사이 시작한 다른 project conversation과 같은 root에서 함께 실행된다. 그때부터는 새로 시작·보내기가 다시 막힌다(실행 중이 있으므로). Overview는 지금처럼 하나의 현재 project conversation을 보이고, 다른 대화는 제목 메뉴와 사이드바 슬롯으로 연다.
- promotion: 두 턴이 겹치면 각 턴의 판정은 기존 규칙을 따른다. 새 캔버스가 하나뿐이면 두 턴이 모두 그것을 후보로 볼 수 있는데, 기존 규칙에서 대상 캔버스의 현재 대화가 working이면 promotion하지 않으므로 먼저 판정한 턴만 붙는다. `/tdd`에서 이 경우를 테스트로 고정한다.

### 5. 툴바 Export

- `CanvasTools.tsx` 끝에 구분선과 Export 버튼(lucide `Download`, 행 메뉴와 같은 아이콘)을 둔다. Export는 도구가 아니라 동작이므로 `aria-pressed`가 없다. ←/→ 툴바 이동에는 포함한다.
- 실행은 행 메뉴와 같은 `exportCanvas(root, row)`(`App.tsx`)를 부른다. 열린 캔버스의 `CanvasRow`가 필요하므로 현재 캔버스 행을 찾는다. 행이 없으면(목록에 없는 페이지, 프로젝트 문제) 비활성이다.
- 비활성 이유는 행 메뉴의 `exportReason`(`ShellSidebar.tsx`: "Can’t read this canvas.", "Exporting")을 순수 함수로 꺼내 둘이 같이 쓴다. 목록에 없는 페이지의 이유 문구를 하나 더한다.

### 6. Canvas conversations 행의 Delete

- 위치: `app/src/renderer/CanvasConversationList.tsx`(Overview 오른쪽 패널). 제목 메뉴의 Delete 버튼·이유·확인과 삭제 실행(`App.tsx`의 `window.doan.deleteConversation` 경로)을 그대로 재사용한다. main과 IPC는 바뀌지 않는다.
- 행은 지금 버튼 하나(캔버스 열기)이므로 Delete를 행 안의 별도 버튼으로 두고, 행 열기와 Delete의 키보드 순서(Tab 또는 ↓/→)는 제목 메뉴 규칙과 맞춘다. 포인터가 행 위에 있을 때만 보이는 버튼도 키보드 포커스에서는 보여야 한다.
- 삭제 뒤 포커스: 다음 행, 없으면 앞 행, 없으면 목록 머리(2026-11-03 POSTMORTEM 'A canvas row menu closed by Esc dropped focus to the page body').
- 비활성 이유는 제목 메뉴가 쓰는 판정을 그대로 쓴다.

## 문구 (clarify preset을 적용해 `/design-draft`·`/implement`에서 확정)

- 툴바 Picker tooltip·접근 이름: 대화창 Pick 버튼의 이름 "Pick from canvas"를 그대로 쓴다. 단축키 표시 ⌘L.
- 메뉴 명령(⌘L): "Pick from Canvas" (macOS 메뉴 title case).
- 툴바 Export tooltip·접근 이름: "Export…"(저장 패널을 여는 명령이라 말줄임표를 유지한다, mcp-connectors design '문구 규칙: 진행 상태').
- Send now 중인 쓰레드 메시지의 표시: 진행 상태이므로 말줄임표 없는 "Sending"을 쓴다.
- 4번의 이유 줄: "Another conversation is still running in <project>."만 남는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `outsidePresetList(target, list, trigger)` 또는 같은 역할의 판정: pointerdown이 목록과 트리거 밖인지. 캔버스 신호는 항상 바깥이다.
- `slashQuery`의 dismissed 갱신: 바깥 클릭이 Escape와 같은 상태를 만든다(기존 함수 확장).
- 보내는 중 메시지의 표시 목록: 큐 항목·보내는 중 항목·history `user.message`에서 큐 줄과 쓰레드 끝의 보내는 중 항목을 만드는 함수(`threadItems.ts`·`conversationStore.ts` 쪽). 읽힘(같은 id의 `user.message`), 거절, 턴 종료에서의 이동을 포함한다.
- `projectBusy`(main)와 `holdsRoot`(renderer)의 답 대기 제외. 두 함수가 같은 판정임을 같은 표로 테스트한다.
- `anotherConversation`의 문구 축소.
- `toolbarPicker(availability, panelFolded)`: 툴바 Picker의 활성·이유. 접힌 대화창은 활성.
- `canvasExportReason(row, exporting)`: 행 메뉴와 툴바 Export가 같이 쓰는 비활성 이유.
- Canvas conversations 목록에서 Delete 뒤 포커스가 갈 행(다음, 앞, 목록 머리).

## 포맷 변경

없다. JSON Schema, `v`, 픽스처, CLI 응답, app socket 메시지, 대화 history 포맷 모두 그대로다. 보내는 중 메시지는 renderer 상태일 뿐 history에 쓰지 않는다.

## 컨벤션 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **append-only events**: 유지한다. Send now 메시지는 에이전트가 읽은 뒤에만 history에 쓰고, 그 전의 쓰레드 표시는 renderer 상태다.
- **한 root에 project conversation 하나**(PRODUCT §5 item 1 'Project conversations'): 답 대기 중인 대화를 실행 중으로 세지 않도록 규칙을 바꾼다. 사용자 결정이며, Z1에서 PRODUCT를 고친다. 답을 받은 뒤 두 턴이 겹칠 수 있다는 점을 같은 문단에 적는다.
- **PRODUCT §5 item 2 'Toolbar', item 6**: Add to conversation이 Picker로 바뀌고 ⌘L이 픽을 시작한다. 사용자 결정이며, Z1에서 PRODUCT를 고친다.
- **PRODUCT §3 In scope 8**: Export를 여는 곳에 툴바가 더해진다. Z1에서 고친다.
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
