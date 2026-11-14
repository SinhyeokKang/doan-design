# canvas-concurrent-conversations — design

상위 [design.md](../canvas-multi-conversation/design.md) '지금 구조'의 조사를 바탕으로 한다. 아래 줄 번호는 2026-11-14 develop(`d6938b07e`, 코드는 `9693e9edb`와 같다)에서 확인했다.

## 영향받는 컴포넌트

배치 소유는 tasks.md '배치'의 표에 있다. 여기에는 무엇이 왜 바뀌는지를 적는다.

### 저장과 접기(main)

- `app/src/main/conversation/store.ts`: 색인 v3(`parseIndex`, `metadata` `:44`, `validEntries`, `save` `:247`), 저널(`JournalChange`, `parseJournal` `:177`·`:207`·`:219`, `changeState` `:181-198`, 복구), 거부 문구 `:239`.
- `fixtures/index-v*.json`과 `fixtures/README.md`: v3 fixture와 이전 사례.
- `state.ts:61-63`: 보관 뒤 이벤트 건너뛰기.
- `summary.ts`: `:60` 안 본 종료, `:62` 다음 메시지 제안. 둘 다 `state === "current"` 조건이다.
- `types.ts:66-69`: 이벤트 종류.
- 렌더러의 스레드 표시: `app/src/renderer/threadItems.ts:186-187`, `ConversationThread.tsx:811-812`("Archived when another conversation became…", "Made current again").

### 런타임(main)

- `service.ts`
  - 시작의 `replaced`(`:355`, `:366-379`)와 handoff 대상의 `has_conversation`(`:358`).
  - 복원 경로(`:413-484`, `replacing()` `:520-530`).
  - `forCanvas`(`:731-739`). 지운다.
  - 승격(`:1423-1440`, `canvasWorking` `:1424`).
  - 삭제가 `archive()`를 다시 쓰는 곳(`:1213`). 일 멈추기만 남긴다.
  - '살아 있는 대화'의 울타리 전부.
- `handoff.ts`: `handoffDecision` `:42`, `missedHandoffs` `:59`의 `current` 필터(`:54-55` 주석이 두 함수가 같이 가야 한다고 말한다), `HandoffReason`의 `has_conversation`.
- `project.ts`: `promotionTarget`의 `busy` `:47-58`.
- `app/src/main/canvasTrash.ts:66`: `trashBusy`.
- `app/src/main/index.ts:1197`: 프로토타입 필터 색인 무효화의 이벤트 종류.
- `ipc.ts`: `conversationMethods` `:13`, `:149`, `:157`의 `forCanvas`를 지운다.
- `app/src/main/prototype/conversationScope.ts:34`, `:40`: 메서드 목록과 `BY_CANVAS`에서 `forCanvas`를 지운다.
- `app/src/main/prototype/showing.ts`: 알림 억제가 프로토타입 창이 보여 주는 대화를 따른다.

### preload

- `app/src/preload/index.ts:121`, `app/src/preload/prototype.ts:131`: `conversationForCanvas`를 지운다. 두 preload는 `ReturnType<ConversationService["forCanvas"]>`로 그 모양을 가져다 쓴다.

### 렌더러 — 캔버스 패널

- `canvasConversation.ts`
  - `pickCanvasConversation` `:43-67` → `pickShownConversation`으로 바꾼다.
  - 제목 메뉴 순서 `:71-76`, 본 표시 `:81`.
  - `newConversationMode` `:107-113`(`restore` 보류).
  - `PROMOTED_TEXT` `:16`("A project conversation is now current on this canvas.").
- `canvasRun.ts`: `takeNewCurrent` `:313-336`, 목록을 읽는 동안 보내기 대기 `:342-344`, 삭제 뒤 `:227`.
- `CanvasConversationPanel.tsx`
  - 보관 대화 보기와 `archived` 모드 `:233-240`, `:280`, `:432`, `:453-457`, `:462`, `:523`.
  - "Open the current conversation" 이름 `:510`.
- `dockedRules.ts`
  - `DockedMode`의 `archived` 종류 `:17-22`, `:38`, `:45`, `:149`.
  - 캔버스가 떠난 보관 대화 `:207`.
  - `dockedAvailability` `:84`, 문구 `:101-104`.
- `DockedComposer.tsx`: 복원 관련 문구와 주석(`:65`, `:96`, `:126`).
- `CanvasConversationList.tsx`(Overview의 목록 본문, 주석 `:11` "canvases with a current conversation"), `RightPanel.tsx`.
- `handoffView.ts:49`: `has_conversation` 문구("It already has a conversation."). 옛 기록 때문에 남긴다.

### 렌더러 — 보드, 배지, 사이드바 클릭

- `agentPresence.ts:19-30`: 첫 대화 하나를 고른다. `boardPresence`로 바꾼다.
- `agentIndicator.ts`: `pickWork` `:41-58`, 정지 `:149-159`, `settleStopping` `:162-164`.
- `CanvasAgent.tsx`: Stop `:64-72`.
- `App.tsx`
  - 사이드바 캔버스 행 클릭 `:757-764`(`openSidebarCanvas`).
  - 대기 알림 Open `:2129-2136`.
  - 배지 입력 `:1839-1840`.
  - ui-state 병합 `:641`(`mergeConversationMemory`).
- `rightPanelOpen.ts:41-49`: `openButtonBadge`. 지금 "Working has none"이다.
- `canvasRowMenu.ts:26-29`: Move to Trash 비활성 판단. main의 `trashBusy`와 같은 집합이어야 한다(ARCHITECTURE §7 'Busy grounds').

### 렌더러 — Overview, 프로토타입 창, 프로젝트 대화

- Overview: `canvasConversationRows.ts:41-67`, `ProjectOverview.tsx`, `overviewRun.ts:349`, `overviewConversation.ts:128`(`state === "archived"`).
- 프로토타입 창: `app/src/renderer/prototype/conversation.ts`(`prototypeShownConversation` `:23-31`, 배지 `:75-81`, 초안 옮기기 `:91-96`), `conversationRun.ts:228-241`(main 창의 새 대화 따라가기), `PrototypeConversation.tsx`(머리 제목, `:67`).
- 프로젝트 대화: `homeRun.ts:65` `holdsRoot`, `:580`(스텁 목록 항목의 `state: "current"`). 프로젝트 대화는 보관된 적이 없으므로 조건만 정리하고 의미는 같다.

### ui-state

- `app/src/restore/uiState.ts`: 새 `conversationByCanvas`, 검증(`:133`의 `conversationByRoot`와 같은 방식), `renameUiRoots`의 다시 키 매기기 목록(`:179`).

### 터미널 세션 이어받기

- 이어받기 제안(`resumeTarget`, `canvasConversation.ts`의 terminal session 알림)을 삭제되지 않은 대화가 그 세션을 쥐고 있을 때 숨긴다.

### CLI·소켓·guide

- 바뀌지 않는다(아래 '에이전트 쪽').

## 리드 판단

- **v3 색인에서 `state`를 없앤다**
  - 리드 판단: `archived`를 쓰는 곳은 캔버스 대화뿐이다(시작의 `replaced`와 승격만 보관한다, `service.ts:355`, `:1429`; `store.ts:141`). 보관이 없어지면 남는 값은 `current` 하나라 정보가 없다.
  - 이전 빌드는 `v: 3`을 `unknown_version`으로 거부하므로(`store.ts:239`) 필드를 남겨 얻는 호환도 없다.
  - 단, 코드에서는 배치 S–O 동안 `ConversationMetadata.state`·`ConversationSummary.state`를 상수 `"current"`로 남긴다. 마지막 정리 배치 C가 타입에서 빼고 테스트를 함께 정리한다(약 60개 테스트 파일이 `state: "current"`를 만든다). 그래야 배치마다 타입 검사를 통과한다.
- **이전은 읽을 때 메모리에서 한다**
  - 리드 판단: v1→v2와 같은 방식이다(ARCHITECTURE §7 `:695`). `parseIndex`가 v1·v2를 v3 모양으로 바꿔 메모리에 두고, 첫 `save`가 v3를 쓴다.
  - 시작할 때 한꺼번에 다시 쓰지 않는다. `new ConversationStore`(`index.ts:1147`)에서 던지면 앱이 끝나기 때문이다(`:1639-1642`).
  - v2의 `archived` 캔버스 대화는 `seenSeq`를 마지막 턴 seq로 맞춰 본 것으로 만든다(spec 정한 점 14). 보관할 때 기록된 `interrupted`(`service.ts:366-369`)가 안 본 종료로 읽히지 않게 하기 위해서다.
  - 모르는 `state` 값이 있는 v2는 지금처럼 손상으로 본다(`store.ts:245`).
- **저널**
  - 새 기록은 `v: 1`을 유지하고 `replaced: []`로 쓴다(`parseJournal`이 배열을 요구한다, `store.ts:177`).
  - `changeState`는 `replaced`가 비면 `state`를 읽지 않는 갈래를 둔다.
  - `restore` 종류와 비지 않은 `replaced`는 v2 색인 옆에서만 받는다(옛 의미로 끝낸다).
  - 되돌림의 한계: v3 색인 옆에 저널이 남은 상태로 이전 빌드가 열리면 `recover`의 `readIndex`가 던져 시작에서 끝난다. 이것을 받아들이고 ARCHITECTURE에 적는다.
- **이벤트와 스레드**
  - `conversation.archived`·`conversation.restored`는 더 쓰지 않는다. 옛 기록은 계속 읽는다.
  - 접기는 `archived`에서 대기 중인 권한·질문만 만료시키고(`expire()`) 그 뒤 이벤트를 건너뛰지 않는다. 지금 코드가 쓴 기록에서는 보관 뒤 `live.terminal`이 서서 러너 이벤트가 버려지므로 결과가 같다. 이전 빌드의 기록은 확인하지 않았으므로, 같은 턴의 늦은 이벤트가 `archived` 뒤에 있는 fixture를 둔다.
  - 스레드는 두 표시를 그리지 않는다. `conversation.bound` 표시는 그대로다.
- **옛 handoff 줄**: 옛 기록에는 `handoff.resolved`의 `reason: "has_conversation"`이 남는다(`store.ts:91`은 어떤 이유든 받는다). main의 `HandoffReason`에서만 빼고, 렌더러의 `REASONS` 문구(`handoffView.ts:49`)는 옛 기록을 위해 남긴다. 그러지 않으면 그 줄이 "Couldn't start the conversation. Try again."으로 바뀐다.
- **`forCanvas` IPC를 지운다** — 리드 판단: 렌더러 호출이 없다(주석 `homeConversations.ts:97`뿐). 모양을 바꾸지 않고 `service.ts`, `ipc.ts`, `conversationScope.ts`, 두 preload에서 지운다.
- **"이 기기에서 그 캔버스에서 마지막으로 본 대화"**
  - ui-state의 `conversationByCanvas?: Record<root, Record<canvasKey, conversationId>>`에 둔다. `canvasKey`는 캔버스 ID가 있으면 ID, 없으면 경로다(`dockedRules.ts:34-41` `draftKey`와 같은 규칙이라, 옮긴 캔버스도 같은 대화를 기억한다). 두 행이 같은 ID를 가지면(`duplicate_canvas_id`) 그 캔버스의 값은 읽지도 쓰지도 않는다.
  - 검증은 `conversationByRoot`(`uiState.ts:59`, `:133`)와 같다. 저장된 루트만, `CONVERSATION_ID` 규칙으로 거른다. `renameUiRoots`의 목록(`:179`)에 넣는다.
  - 처음 읽을 때 `mergeConversationMemory`(`App.tsx:641`)처럼 병합한다. 읽기가 끝나기 전에는 저장하지 않는다(POSTMORTEM 2026-11-01).
  - PRODUCT의 'Seen' 조건(그 대화가 실제로 보였을 때)에서만 쓴다. 없는 대화를 가리키면 무시한다.
  - 프로토타입 창은 이 값을 읽기만 한다. ui-state는 main이 통째로 바꿔 쓰는 저장소라서 두 창이 쓰면 서로를 덮는다.
- **새 대화 따라가기(`takeNewCurrent` 대체)**
  - 지금 규칙의 근거(`defaultNew`, POSTMORTEM 2026-11-14 'The main window's panel never showed…')는 유지한다.
  - 패널이 `defaultNew`인 동안 직전 목록에 없던 캔버스 대화가 나타나고, 그것이 사람이 시작한 대화이면 넘어간다. 둘 이상이면 최근 것이다.
  - handoff와 승격은 사람이 시작한 대화가 아니므로 넘기지 않는다(spec 정한 점 10). 대화 요약에 이미 있는 시작 출처(handoff로 시작했는지, 승격됐는지)로 가른다. 없으면 요약에 출처를 더한다(`summary.ts`).
- **살아 있는 대화**: 다음 울타리는 "현재가 아니면 죽은 대화"에서 "삭제되지 않은 대화"로 바꾼다.
  - 대기열과 handoff: 대기 메시지 내보내기 `service.ts:1501`, handoff 대기열 이동 `:1402`.
  - 사용량 한도: 예약 `:1153`, `scheduling` `:1003`, `limitOf` `:1035`, `limitCandidate` `:1043`, `limitEnded` `:1097`.
  - 제안과 Send now: 다음 메시지 제안 `:1589`, `summary.ts:62`, `steerable`(Send now) `:1532`.
  - handoff: `doan handoff` 요청자 조건 `:634`, `checkHandoffSource` `:1353`, `judgeHandoff` `:1295`, `current` 콜백 `:1303`·`:1741`, `writeMissed` `:1738`.
  - 그 밖: `checkSend`의 상태 인자 `:1656`, 안 본 종료 `summary.ts:60`.
  - 렌더러: `overviewRun.ts:349`(프로젝트 대화만 거르는 조건은 남긴다), `overviewConversation.ts:128`.
  - Codex 서버 재사용(`:547-549`)은 `!live.closed`를 본다. 주석만 고친다.
- **Move to Trash**: `trashBusy`(`canvasTrash.ts:66`)와 `canvasRowMenu.ts:26-29`가 "삭제되지 않았고 작업 중·준비 중·답 대기인 대화"를 같은 집합으로 센다. `boardPresence`는 쓰지 않는다(따르는 대화 하나만 보기 때문이다).
- **목록을 읽는 동안 새 대화 보내기 대기**(`canvasRun.ts:342-344`)를 없앤다 — 리드 판단: 근거가 "아직 목록에 없는 현재 대화의 턴을 끝내지 않게"였는데(ARCHITECTURE §7 `:453`), 새 대화가 다른 대화를 끝내지 않게 된다. 터미널 세션 이어받기의 대기는 그대로 둔다.
- **프로토타입 창의 알림 억제는 그 창이 보여 주는 대화를 따른다**(`showing.ts`).
- **보관 대화 보기 UI를 지운다**: `CanvasConversationPanel.tsx`의 보관 보기와 복원 보내기, `DockedMode`의 `archived`, `newConversationMode`의 `restore` 보류, `dockedAvailability`의 `restore` 문구. 캔버스가 떠난 대화의 composer 대체 문구(`dockedRules.ts:207`)는 보관과 상관없이 남긴다.
- **문구**: `PROMOTED_TEXT`와 "Open the current conversation"은 "current" 없는 문구로 바꾼다(`clarify`).

## 순수 함수(`/tdd` 대상)

1. **`pickShownConversation(input)`**
   - 입력: 목록(`list | "loading" | "error"`), 캔버스, `requested`, 지금 `shown`, `defaultNew`, `remembered | null`, 프로토타입 창의 `blocked`·`list_loading`·`list_error`.
   - 순서: 요청 → 답을 기다리는 대화(여럿이면 먼저 기다리기 시작한 것) → `remembered` → 최근 활동 순 첫 대화 → 새 대화 상태.
   - 목록을 다시 읽을 때 `shown`을 유지한다. 그러지 않으면 새로 답을 기다리는 대화가 읽을 때마다 패널을 끌어간다. 읽는 중·실패 때는 바꾸지 않는다. ui-state 읽기가 끝나기를 기다린다.
   - main 창 패널, 프로토타입 창, 삭제 뒤, 사이드바 캔버스 행 클릭이 같이 쓴다.
2. **`boardPresence(input)`**
   - 입력: 목록, 루트, 캔버스, 패널이 보여 주는 대화(접혀 있으면 펼치면 보일 대화), 직전 값(실패한 읽기 동안 유지).
   - 출력: 따르는 대화, N, 누를 때 갈 대상 목록(답 대기 먼저).
   - 같은 순위를 지키는 동안 같은 대화를 따르고, 같은 순위끼리는 먼저 시작한 대화다. main의 `working` 플래그(끝난 턴과 대기열의 다음 턴 사이)를 세어 알림이 깜빡이지 않게 한다. 정체성에 루트를 넣는다(POSTMORTEM 2026-11-01).
3. **`pickWork(…, followedId)`**: 따르는 대화 ID만 받는다.
4. **`canvasStrongestSignal(list, seen)`**: 답 필요 > 작업 중 > 안 본 종료. `scheduled`는 없다. main 창 `openButtonBadge`가 쓰고, 배지 대상 대화도 돌려준다.
5. **`titleMenuOrder(list, frozen)`**: 최근 활동 순. 메뉴가 열린 동안은 연 시점의 순서를 유지하고 새 대화는 끝에 붙인다.
6. **색인 이전(`parseIndex` v1·v2 → v3)**: `state` 제거, 보관 대화의 `seenSeq`.
7. **`canvasConversationRows`**: 대화마다 한 행, 제목, 빈 제목은 "Conversation", 정렬.
8. **접기**: `archived` 뒤 이벤트를 건너뛰지 않음, 표시 없음.
9. **`handoffDecision`·`missedHandoffs`·`promotionTarget`**: `has_conversation`과 `busy` 조건 제거.
10. **새 대화 따라가기**: `defaultNew`, 직전 목록, 새 목록, 시작 출처 → 넘어갈 대화나 없음.
11. **Stop 대상 전환**: 따르는 대화가 바뀐 시각 → 약 1초 동안 `aria-disabled`(시계 주입).
12. **`trashBlock`/`trashBusy` 집합**: 작업 중·준비 중·답 대기.

## 형식 변경

- `<userData>/conversations/index.json` v2 → v3. TS만 읽는다(`schema/` 밖, ARCHITECTURE §11의 공유 형식이 아니다).
- fixture `app/src/main/conversation/fixtures/`
  - `index-v3.json`(새)
  - v1 → v3, v2(보관 대화 포함) → v3, `index-v2-home.json`
  - 모르는 `state`가 있는 v2
  - 이전 전의 저널 종류마다 커밋됨·안 됨
  - v3에서 쓴 저널, v3 색인 옆의 v2 의미 저널
  - `fixtures/README.md`를 고친다.
- ui-state에 `conversationByCanvas`(선택 필드, device-local, `v` 변화 없음). 이전 빌드는 모르는 키를 버린다.
- 대화 요약에 시작 출처가 없으면 더한다(IPC 모양, TS만).
- CLI 출력, 소켓, `runtime.json`은 바뀌지 않는다.

## 에이전트 쪽

- `doan handoff`의 소켓 거부 코드(`schema/app-socket.v5.schema.json:69-76`)와 CLI 문구(`cli/internal/cli/handoff_rules.go`)는 바뀌지 않는다. `has_conversation`은 소켓 코드가 아니라 턴이 끝난 뒤 앱이 보이는 놓친 handoff 줄의 이유다(`handoff.ts:12`).
- guide(`cli/internal/cli/skill.md`), 스킬 스텁(`app/src/main/onboarding/SKILL.md`), `HANDOFF_GUIDANCE`(`app/src/main/conversation/prompt.ts:51`)는 현재 대화, 보관, `has_conversation`을 말하지 않는다.
- 그래서 `/agent-eval`을 하지 않는다. AGENTS.md 'Workflow'의 "before a feature's last integration" 규칙에서 벗어나는 예외다. 사용자가 2026-11-14 승인했고, PR 본문에 이 예외와 이유를 적는다.

## 규약 영향

- 없다. ARCHITECTURE §1과 `doan check`는 그대로다.

## 결정 영향

- PRODUCT
  - §3 In scope 6(`:46`).
  - §5 item 1: 프로젝트 대화와 승격(`:251`, `:254-257`), Move to Trash(`:210`).
  - §5 item 2: 'Canvas conversation'(`:270-271` 기본 대화와 New conversation, 제목 메뉴, 보류, 복원, 삭제 뒤 `:314`), 보드 알림·Stop·작업 메모·Following, 'Opening'의 배지(`:277`), 'Prototype window'의 대화 패널(`:297-299`), 'Handoff'(놓친 줄 `:276`).
  - §5 item 3: 대기열·사용량 한도의 보관 문장(`:325`, `:330`, `:344`), Overview Canvas conversations(`:353`), Quick Open(`:363`).
  - §3 Out of scope 7: 에이전트끼리의 동시 편집은 막지 않는다는 문장.
- ARCHITECTURE
  - §3 프로토타입 창의 대화 방송(`:158`).
  - §4 대화 work 상태(`:237`).
  - §7 '목록 읽는 동안 보내기 대기'(`:453`), 'Busy grounds'(`:512`), 다음 메시지 제안(`:567`), 'Restore'(`:583`), 저장 형식(`:695-699`, v3, 이전, 저널, 되돌림 한계), 'Navigation persistence and IPC'의 UI state(`:475-478`, `conversationByCanvas`).
- DESIGN: 'Open button badge'(`:844`, 작업 중 표시), 캔버스 페이지 알림, 패널 제목 메뉴, Overview 행(`:620` 근처), Frame prototype의 대화 패널.
- BACKLOG: `:91`(캔버스 대화 미확인 항목). Cursor·Antigravity·Copilot의 앱 안 동시 실행은 PoC 근거뿐이라는 항목을 더한다.

## PoC 의존

- 같은 계정으로 한 캔버스에서 턴 여러 개를 동시에 돌리는 것. 지금 근거는 handoff의 "첫 턴들이 같은 계정에서 동시에 돈다"(PRODUCT §5 item 2 'Handoff')뿐이다. 프로바이더마다 프로세스 구조가 다르다(Claude Code는 턴마다 새 CLI, Codex는 대화마다 `app-server`, ACP는 턴마다 서버, ARCHITECTURE §7).
- 관찰 항목: 두세 턴이 겹쳐 끝까지 도는지, 서로의 세션·프로필 파일을 건드리지 않는지, 권한 요청이 각 대화에 따로 오는지, 사용량 한도에 걸릴 때 각 대화가 따로 보이는지, 한 대화를 멈추면 그 대화만 멈추는지.
- **방법**: develop 앱은 동시 턴을 막으므로 `.scratch` probe가 앱 밖에서 돈다.
  - 프로바이더 CLI를 `app/src/main/agentAuth/providers.ts:136-155`의 명령·인자·환경과 `agentAuth/environment.ts:13-36`의 환경 규칙대로 직접 띄운다.
  - 로그인은 probe 전용 scratch HOME(프로바이더마다)에서 한다. 앱의 `safeStorage` 금고(`agentAuth/cipher.ts`)는 Node probe가 읽지 못하므로 쓰지 않는다. 런너는 TS라 `node poc.mjs`가 바로 가져오지 못한다(`runners.ts:7-22`).
  - probe가 건너뛰는 것을 여기에 적는다: Doan의 userData 울타리(fence), MCP 연결, 스킬 스텁 설치, 앱의 동의·권한 카드.
- **안전**(POSTMORTEM 2026-11-14 'The installed Doan.app came up on the real userData…')
  - probe와 그 에이전트의 `PATH`에서 설치된 `doan`(`~/.local/bin`)을 뺀다.
  - 실행 내내 `ps -axo pid,ppid,lstart,command | grep '/Applications/Doan.app'`로 감시하고, 뜨면 부모를 기록한다.
  - `doan://` URL을 여는 경로는 설치된 앱을 띄우는 것으로 본다.
  - 임시 `DOAN_RUNTIME`과 임시 저장소를 쓴다.
- **로그인 정리**: tasks 9(컨덕터, PR 전). 로그아웃하고 프로필과 scratch HOME을 지우고 Keychain에 남은 항목이 없는지 본다. Cursor CLI 로그인은 기기 전체 Keychain에 쓴다.
- 관찰(통과·실패·날짜)은 이 문서와 승격 커밋 메시지에 적는다.

## POSTMORTEM

- **2026-10-27 'A rejected conversation replacement had already changed current history'**: "validate prompt and old histories first, publish a store-local undo record before appending, and use the final index rename as the commit point." 이전도 색인 rename(첫 `save`)을 커밋 지점으로 쓰고, v2 의미의 저널은 v2 색인 옆에서만 끝낸다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: "recheck current metadata and live execution identity after preparation and opening, before acceptance." 시작 전 재확인에서 "현재인지"를 빼되, 삭제 여부와 live 정체성 확인은 남긴다.
- **2026-11-14 'A queue taken back as a draft was still sent by the flush already under way'**: "a deferred callback … must first check that it still owns it … and a conversation still current." "still current"를 "not deleted"로 바꾸고, 테스트는 보관 대신 삭제와 `stopRuns`를 끼워 넣는다.
- **2026-11-14 'The main window's panel never showed the conversation the prototype window's first message started'**: "a state picked because nothing existed is marked as a default (`defaultNew`) and gives way to what newly appears, while the person's choice does not." 새 대화 따라가기가 이 규칙을 지키고, 사람이 시작한 대화로 좁힌다.
- **2026-11-14 'A list read moved the prototype window's first message, still being sent, into the conversation it started'**: "a move of a draft driven by a list read or an event never takes a draft whose send can be in flight." 프로토타입 창이 대화를 바꿀 수 있게 되어도 같다.
- **2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop'**: "any state kept across a failed or pending read about a canvas carries the project root in its identity." `boardPresence`도 루트를 정체성에 넣는다.
- **2026-11-01 'A ui-state save sent before the startup read could replace every remembered field'**: "a client of a replace-semantics store sends nothing until its first read has settled, and merges what it read before the first save." `conversationByCanvas`도 같다.
- **2026-11-13 'A Stop pressed while a send was still being prepared did not stop it'**: Stop 대상이 바뀌는 동안의 테스트는 보내기 준비의 각 await에서 Stop을 누르는 기존 방식을 따른다.
- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: "+N" 버튼과 Stop은 상태가 바뀌어도 같은 요소로 남는다.
- **2026-11-14 'The installed Doan.app came up on the real userData during a real-HOME probe…'**: PoC와 `/runtime-test`의 안전 조치(위 'PoC 의존').

## 초안 요청

`/design-draft`에 넘길 내용이다. 출시된 화면을 다시 설계하는 새 초안 파일이다. 출시된 초안(`doan-canvas-conversation.html`, `prototype-conversation-panel.html` 등)은 고치지 않는다(AGENTS.md 'Workflow'의 redesign 예외: 이 초안이 병합 전까지 기준).

- 캔버스: `.doan/canvases/canvas-concurrent-conversations.html`, 캔버스 ID `canvas-concurrent-conversations`.
- 프레임
  - `board-notice`: 보이는 대화가 작업 중이고 다른 대화가 없음(+N 없음), 보이는 대화가 작업 중이고 다른 둘이 작업 중("+2"), 보이는 대화가 쉬고 다른 대화가 작업 중(그 대화를 따름, Stop이 "Stop <제목>"), 다른 대화가 답을 기다림(답 대기 우선, +N에 포함), "+N"에 키보드 포커스.
  - `board-stop`: Stop이 따르는 대화 하나를 멈춘 뒤 알림이 다음 대화로 넘어가고 Stop이 잠깐 비활성인 모습.
  - `title-menu`: 대화 넷(작업 중 둘, 답 필요 하나, 안 본 종료 하나), 보이는 대화가 눌린 행, 행 상태 표시와 Delete, 긴 제목. 열린 메뉴에 새 대화가 끝에 붙은 모습. 긴 목록. 목록을 읽는 중과 읽기 실패.
  - `badge`: 접힌 패널의 Show conversation 배지 세 경우(답 필요, 작업 중, 안 본 종료). 배지가 보이는 대화가 아닌 다른 대화를 가리키는 경우.
  - `overview-rows`: Overview Canvas conversations에서 한 캔버스의 대화 셋이 각각 한 행(제목과 상태). 제목이 빈 행("Conversation").
  - `prototype-head-menu`: 프로토타입 창 머리 제목의 대화 메뉴(New conversation, 대화 행, Delete). 읽는 중, 읽기 실패와 Retry, 막힘(캔버스가 떠남·ID가 겹침), 대화 없음.
  - `delete-shown`: 보던 대화를 삭제한 뒤 다음 대화가 보이고 포커스가 제목 메뉴 버튼인 상태, 남은 대화가 없어 새 대화 상태가 되는 상태.
- 제약: 출시된 토큰과 컴포넌트만 쓴다. 영어 문구는 `clarify` 프리셋으로 정한다("+N" 버튼, "Stop <제목>", `PROMOTED_TEXT`와 "Open the current conversation"의 대체 문구).
- 검증: `doan ls`가 위 일곱 프레임 ID를 보인다.
