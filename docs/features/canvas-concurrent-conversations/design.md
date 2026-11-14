# canvas-concurrent-conversations — design

상위 [design.md](../canvas-multi-conversation/design.md) '지금 구조'의 조사(2026-11-14 develop 기준)를 바탕으로 한다. 아래 줄 번호는 2026-11-14 develop(`9693e9edb`)에서 확인했다.

## 영향받는 컴포넌트

- **저장(main)**: `app/src/main/conversation/store.ts`(색인 v3, `metadata`·`validEntries`·`parseIndex`, 저널 `JournalChange`·`changeState`·복구, `save`), `app/src/main/conversation/fixtures/index-v*.json`, `fixtures/README.md`.
- **접기와 스레드**: `app/src/main/conversation/state.ts:61-63`(보관 뒤 이벤트 건너뛰기), `summary.ts:60`(안 본 종료), `app/src/renderer/threadItems.ts:186-187`(보관·복원 표시), `app/src/main/index.ts:1197`(프로토타입 필터 색인 무효화).
- **런타임(main)**: `app/src/main/conversation/service.ts` — 시작의 `replaced`(`:355`, `:366-379`), handoff의 `has_conversation`(`:358`), 복원 경로(`:413-484`, `replacing()` `:520-530`), `forCanvas`(`:731-739`), 울타리(아래 '살아 있는 대화'), 승격(`:1423-1440`), `checkSend`(`:1656`). `conversation/handoff.ts`(`HandoffReason`의 `has_conversation`, `:42`, `:59`), `conversation/project.ts`(`promotionTarget`의 `busy`), `app/src/main/canvasTrash.ts`(`trashBusy`), `conversation/types.ts:66-69`(이벤트 종류).
- **IPC와 preload**: `forCanvas` 모양(`app/src/preload/index.ts:121`, `app/src/preload/prototype.ts:131`).
- **캔버스 패널(renderer)**: `canvasConversation.ts`(`pickCanvasConversation` `:46`, 제목 메뉴 순서 `:71-76`, 본 표시 `:81`, `newConversationMode` `:107`), `canvasRun.ts`(새 대화로 넘어가기 `:313-336`, 목록을 읽는 동안 보내기 대기 `:342-344`, 삭제 뒤 `:227`), `CanvasConversationPanel.tsx`(보관 대화 보기 `:453-457`), `dockedRules.ts`(`dockedAvailability` `:84`, 문구 `:103`).
- **보드**: `agentPresence.ts:19`, `agentIndicator.ts`(`pickWork` `:41`, 정지 `:149-159`), `CanvasAgent.tsx`(Stop `:64-72`), `App.tsx`(대기 알림 Open `:2132`, 배지 입력 `:1839-1840`, 캔버스 행 클릭 `:757-764`), `rightPanelOpen.ts`(`openButtonBadge` `:44`).
- **Overview**: `canvasConversationRows.ts:41`, `ProjectOverview.tsx`.
- **프로토타입 창**: `app/src/renderer/prototype/conversation.ts`(`prototypeShownConversation` `:25`, 배지), `conversationRun.ts`(main 창의 새 대화 따라가기, 초안 옮기기), `PrototypeConversation.tsx`(머리 제목), `app/src/main/prototype/showing.ts`(알림 억제).
- **ui-state**: `app/src/restore/uiState.ts`(새 `conversationByCanvas`, 검증, `renameUiRoots`).
- **프로젝트 대화 규칙**: `app/src/renderer/homeRun.ts:65` `holdsRoot`(`state === "current"` 조건을 뺀다).
- **CLI·소켓·guide**: 바뀌지 않는다(아래 '에이전트 쪽').

## 리드 판단

- **v3 색인에서 `state` 필드를 없앤다** — 리드 판단: `archived`를 쓰는 곳은 캔버스 대화뿐이고(시작의 `replaced`와 승격만 보관한다, `service.ts:355`, `:1433`), 보관이 없어지면 남는 값은 `current` 하나라 정보가 없다. 이전 빌드는 `v: 3`을 `unknown_version`으로 거부하므로(`store.ts:66`) 필드를 남겨 두어 얻는 호환도 없다. 읽기는 v1·v2·v3를 받고 쓰기는 v3만 한다. v2를 읽으면 `state`를 버리고 쓴다. v1·v2의 `archived` 프로젝트 대화(있다면)도 보통 대화가 된다.
- **이전 시점**: 첫 `save` 때가 아니라 시작할 때 한 번 한다. 순서는 v2 의미로 남은 저널을 먼저 복구하고, 그다음 v3로 다시 쓴다. 다시 쓰기에 실패하면 v2 그대로 두고 다음 실행에 다시 한다(POSTMORTEM 2026-10-27 'A rejected conversation replacement…'의 커밋 지점 규칙).
- **저널**: 새 기록은 `start`·`bind`·`promote`만 쓰고 `replaced`가 없다. `restore` 종류와 `replaced`가 있는 옛 기록은 이전 전 복구에서만 읽고 그 의미로 끝낸다.
- **이벤트**: `conversation.archived`·`conversation.restored`는 더 쓰지 않는다. 옛 기록은 계속 읽는다. 접기는 `archived`에서 대기 중인 권한·질문만 만료시키고(`expire()`) 그 뒤 이벤트를 건너뛰지 않는다. 보관된 대화에는 복원 전까지 새 이벤트가 없었으므로 옛 기록의 결과는 같다. 스레드는 두 표시를 더 그리지 않는다(이제 사람에게 뜻이 없다). `conversation.bound` 표시는 그대로다.
- **"이 기기에서 그 캔버스에서 마지막으로 본 대화"**: ui-state에 `conversationByCanvas?: Record<root, Record<canvasPath, conversationId>>`를 둔다. `conversationByRoot`(`uiState.ts:59`, `:133`)와 같은 규칙으로 저장된 루트만, 대화 ID 규칙(`CONVERSATION_ID`)과 캔버스 경로 규칙으로 걸러 받고, `renameUiRoots`의 다시 키 매기기 목록(`:179`)에 넣는다. 없는 대화를 가리키면 무시한다.
- **`takeNewCurrent`를 대체한다**: 지금 규칙의 근거(`defaultNew`, POSTMORTEM 2026-11-14 'The main window's panel never showed…')는 유지한다. 패널이 기본값으로 새 대화 상태를 보이는 동안 다른 곳(프로토타입 창, handoff, 승격)에서 이 캔버스에 새 대화가 생기면 그 새 대화로 넘어간다. "현재 대화"가 아니라 "직전 목록에 없던 대화"를 고른다. 사람이 고른 상태는 바꾸지 않는다.
- **살아 있는 대화**: 다음 울타리는 "현재가 아니면 죽은 대화"에서 "삭제되지 않은 대화"로 바꾼다. 대기 메시지 내보내기(`service.ts:1501`), handoff 대기열 이동(`:1402`), 사용량 한도 예약(`:1153`, `:1035`, `:1043`), 다음 메시지 제안(`:1589`), `doan handoff` 요청자 조건(`:634`, `:1353`), Codex 서버 재사용(`:547-549`), `checkSend`의 상태 인자(`:1656`), 안 본 종료(`summary.ts:60`), Move to Trash(`canvasTrash.ts` `trashBusy`).
- **`forCanvas` IPC**: `{ conversations: Summary[] }`를 돌려준다. 최근 활동 순이고 `state`가 없다. 지금 렌더러 호출은 없지만(주석 `homeConversations.ts:97`뿐) preload가 노출하므로 모양을 맞춘다.
- **목록을 읽는 동안 새 대화 보내기 대기**(`canvasRun.ts:341-344`)를 없앤다 — 리드 판단: 근거가 "아직 목록에 없는 현재 대화의 턴을 끝내지 않게"였는데(ARCHITECTURE §7), 새 대화가 다른 대화를 끝내지 않게 된다. 터미널 세션 이어받기의 대기는 그 세션이 아직 일하는지 몰라서이므로 그대로 둔다.
- **프로토타입 창의 알림 억제는 그 창이 보여 주는 대화를 따른다**(`app/src/main/prototype/showing.ts`). 창이 대화를 바꾸면 억제 대상도 바뀐다.
- **보관 대화 보기 UI 제거**: `CanvasConversationPanel.tsx`의 보관 보기와 복원 보내기, `newConversationMode`의 `restore` 보류, `dockedAvailability`의 `restore` 문구를 없앤다.

## 순수 함수(`/tdd` 대상)

1. **`pickShownConversation(input)`**: 요청된 대화 → 답을 기다리는 대화 → `conversationByCanvas`의 대화 → 최근 활동 순 첫 대화 → 새 대화 상태(상위 결정 5). main 창 패널, 프로토타입 창, 삭제 뒤(정한 점 6)가 같이 쓴다. `pickCanvasConversation`을 대체한다.
2. **`boardPresence(list, shownId)`**: 따를 대화(보이는 대화가 작업·대기 중이면 그것, 아니면 대기 > 작업 순으로 다른 대화 하나)와 나머지 작업 중인 대화 수, 수를 눌렀을 때 갈 대화. `agentPresence`를 대체한다(루트까지 포함한 정체성, POSTMORTEM 2026-11-01).
3. **`pickWork`의 입력**: 보드가 따르는 대화 ID만 받는다(정한 점 2).
4. **`canvasStrongestSignal(list, seen)`**: 답 필요 > 작업 중 > 안 본 종료. `openButtonBadge`가 쓴다. 사이드바의 `RANK`(`conversationList.ts:12`)와 순서를 맞춘다.
5. **`titleMenuOrder(list, frozen)`**: 최근 활동 순, 메뉴가 열린 동안은 연 시점의 순서를 유지하고 새로 생긴 대화는 끝에 붙인다.
6. **`migrateIndex(raw)`**: v1·v2 → v3 엔트리(`state` 제거). 복구 뒤에만 부른다.
7. **`canvasConversationRows`**: 대화마다 한 행, 행에 제목.
8. **접기**: `conversation.archived` 뒤 이벤트를 건너뛰지 않음, `restored`는 표시 없음.
9. **`handoffDecision`·`promotionTarget`**: `has_conversation`과 `busy` 조건 제거.

## 형식 변경

- `<userData>/conversations/index.json` v2 → v3. TS만 읽는다(`schema/` 밖, ARCHITECTURE §11의 공유 형식이 아니다). fixture: `app/src/main/conversation/fixtures/index-v3.json`(새), v2 → v3 이전 사례(보관 대화가 섞인 v2), 저널이 남은 v2. `fixtures/README.md`를 고친다.
- ui-state에 `conversationByCanvas`(선택 필드). 이전 빌드는 모르는 키를 버린다.
- CLI 출력, 소켓, `runtime.json`은 바뀌지 않는다.

## 에이전트 쪽

- `doan handoff`의 소켓 거부 코드(`schema/app-socket.v5.schema.json:69-76`)와 CLI 문구(`cli/internal/cli/handoff_rules.go:80-136`)는 바뀌지 않는다. `has_conversation`은 소켓 코드가 아니라 턴이 끝난 뒤 앱이 보이는 놓친 handoff 줄의 이유다(`handoff.ts:12`, 문구 `app/src/renderer/handoffView.ts:49` "It already has a conversation."). 이 이유와 문구는 없어진다.
- guide(`cli/internal/cli/skill.md`)와 스킬 스텁(`app/src/main/onboarding/SKILL.md`)은 현재 대화나 보관을 말하지 않는다.
- 그래서 `/agent-eval` 대상이 아니다. PR 본문에 이유를 적는다.

## 규약 영향

- 없다. ARCHITECTURE §1과 `doan check`는 그대로다.

## 결정 영향

- PRODUCT §5 item 2 'Canvas conversation'(현재 대화, 보관, 보류, 복원, 기본 대화, 제목 메뉴, 삭제 뒤), 보드 알림·Stop·작업 메모·Following, Show conversation 배지, 'Prototype window'의 대화 패널, 'Handoff', item 3 Overview Canvas conversations와 승격, item 1 Move to Trash 문장이 바뀐다.
- PRODUCT §3 Out of scope 7에 "에이전트끼리의 동시 편집은 막지 않는다"를 더한다.
- ARCHITECTURE §7 'Agent conversation runtime and IPC'(보관·복원·승격 경로, 저장 형식 v3, 저널, 목록 읽는 동안 보내기 대기 제거)와 'Canvas conversation panel'.

## PoC 의존

- 같은 계정으로 한 캔버스에서 턴 여러 개를 동시에 돌리는 것. 지금 근거는 handoff의 "첫 턴들이 같은 계정에서 동시에 돈다"(PRODUCT §5 item 2 'Handoff')뿐이다. 프로바이더마다 프로세스 구조가 다르다(Claude Code는 턴마다 새 CLI, Codex는 대화마다 `app-server`, ACP는 턴마다 서버, ARCHITECTURE §7). 다섯 모두 실제 로그인으로 본다(정한 점 7). 관찰 항목: 두세 턴이 겹쳐 끝까지 도는지, 서로의 세션·프로필 파일을 건드리지 않는지, 권한 요청이 각 대화에 따로 오는지, 사용량 한도에 걸릴 때 각 대화가 따로 보이는지, Stop이 한 대화만 멈추는지.

## POSTMORTEM

- **2026-10-27 'A rejected conversation replacement had already changed current history'**: "validate prompt and old histories first, publish a store-local undo record before appending, and use the final index rename as the commit point." v3 이전도 같은 커밋 지점(색인 rename)을 쓰고, 이전 전에 저널을 v2 의미로 끝낸다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: "recheck current metadata and live execution identity after preparation and opening, before acceptance." 시작 전 재확인에서 "현재인지"를 빼되, 삭제 여부와 live 정체성 확인은 남긴다.
- **2026-11-14 'A queue taken back as a draft was still sent by the flush already under way'**: "a deferred callback … must first check that it still owns it … and a conversation still current." "still current"를 "not deleted"로 바꾸고, 테스트는 보관 대신 삭제와 `stopRuns`를 끼워 넣는다.
- **2026-11-14 'The main window's panel never showed the conversation the prototype window's first message started'**: "a state picked because nothing existed is marked as a default (`defaultNew`) and gives way to what newly appears, while the person's choice does not." `takeNewCurrent` 대체가 이 규칙을 지킨다.
- **2026-11-14 'A list read moved the prototype window's first message, still being sent, into the conversation it started'**: "a move of a draft driven by a list read or an event never takes a draft whose send can be in flight." 프로토타입 창이 대화를 바꿀 수 있게 되어도 같은 규칙.
- **2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop'**: "any state kept across a failed or pending read about a canvas carries the project root in its identity." `boardPresence`도 루트를 정체성에 넣는다.

## 초안 요청

`/design-draft`에 넘길 내용이다. 출시된 화면을 다시 설계하는 새 초안 파일이고, 출시된 초안(`doan-canvas-conversation.html`, `prototype-conversation-panel.html` 등)은 고치지 않는다(AGENTS.md 'Workflow'의 redesign 예외: 이 초안이 병합 전까지 기준).

- 캔버스: `.doan/canvases/canvas-concurrent-conversations.html`, 캔버스 ID `canvas-concurrent-conversations`.
- 프레임
  - `board-notice`: 보이는 대화가 작업 중(+0), 보이는 대화가 작업 중이고 다른 둘도 작업 중("+2 working"), 보이는 대화가 쉬고 다른 대화가 작업 중(그 대화를 따름), 다른 대화가 답을 기다림(답 필요가 먼저).
  - `board-stop`: Stop이 따르는 대화 하나만 멈춘 뒤 알림이 다음 대화로 넘어가는 모습.
  - `title-menu`: 대화 넷(작업 중 둘, 답 필요 하나, 안 본 종료 하나), 보이는 대화에 체크, 행 상태 표시와 Delete, 긴 제목.
  - `badge`: 접힌 패널의 Show conversation 배지가 캔버스 전체의 가장 강한 신호를 보이는 세 경우.
  - `overview-rows`: Overview Canvas conversations, 한 캔버스의 대화 셋이 각각 한 행(제목과 상태).
  - `prototype-head-menu`: 프로토타입 창 머리 제목의 대화 메뉴와 New conversation.
  - `delete-shown`: 보던 대화를 삭제한 뒤 다음 대화가 보이는 상태와, 남은 대화가 없어 새 대화 상태가 되는 상태.
- 제약: 출시된 토큰과 컴포넌트만 쓴다. 영어 문구는 `clarify` 프리셋으로 정한다("+2 working" 포함).
