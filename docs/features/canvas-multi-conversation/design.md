# canvas-multi-conversation — design (상위 feature)

이 문서는 2026-11-14 develop(`f01ae5f16` 이후)의 코드와 문서를 조사한 결과다. 하위 feature가 자기 design.md를 쓸 때 이 목록에서 자기 몫을 가져가고, 다시 develop과 맞춘다.

## 지금 구조(조사)

### 런타임과 저장

- **새 대화는 같은 캔버스의 현재 대화를 모두 보관한다**: `service.ts:355`의 `replaced`, `:366-370`이 돌고 있는 턴에 `interrupted`와 `conversation.archived`를 쓰고, `:379` `archive(old)`가 러너를 닫는다. 터미널 세션 이어받기(`mode: "resume"`)도 같은 경로다.
- **보관은 일을 멈춘다**: `archive()`(`service.ts:1442-1462`)가 러너를 닫고, 사용량 한도 조회와 대기 handoff를 취소하고, 대기 메시지를 초안으로 돌리고, `doan work` 항목을 끝낸다. 승격과 복원도 이 경로를 쓴다.
- **복원은 현재 대화가 작업 중이면 거부된다**: `replacing()`(`service.ts:524-530`)이 `busy`를 던진다.
- **"현재가 아니면 죽은 대화"로 보는 울타리**: 대기 메시지 내보내기(`service.ts:1501`), handoff 대기열 이동(`:1402`), 사용량 한도 예약(`:1153`, `:1035`, `:1043`), 다음 메시지 제안(`:1589`), `doan handoff` 요청자 조건(`:634`, `:1353`), Codex 서버 재사용(`:547-549`).
- **접기는 보관 뒤 이벤트를 버린다**: `state.ts:61-63`이 `archived = true`를 세우고, 그 뒤 이벤트는 복원 전까지 건너뛴다.
- **안 본 종료는 현재 대화만**: `summary.ts:60`.
- **`forCanvas` IPC는 현재 하나 + 보관 목록 모양**: `service.ts:738`, `preload/index.ts:121`, `preload/prototype.ts:131`.
- **저장 형식**: `<userData>/conversations/index.json` v2의 항목마다 `state: "current" | "archived"`(`store.ts:21`, `:44`, `:247`). 모르는 값이면 읽기를 거부한다. "캔버스당 현재 하나"는 쓰는 쪽이 지키고 읽는 쪽은 검사하지 않는다(`validEntries`, `store.ts:57-59`). 저널 `start-undo.json`(`store.ts:166-199`)은 바뀐 대화가 모두 current → archived로 간다고 가정한다. 이벤트 `conversation.archived`·`bound`·`restored`(`types.ts:66-69`)는 스레드에 표시된다(`threadItems.ts:186-187`). 공유 스키마(`schema/`)가 아니라 TS만 읽고, fixture는 `app/src/main/conversation/fixtures/index-v*.json`이다.
- **한도는 이미 대화별**: 전역 상한 없음, "프로젝트 대화는 루트당 작업 하나, 대화마다 턴 하나"(ARCHITECTURE §7). `liveTurns()`(`service.ts:699-707`)와 `working()`(`:1225-1229`)은 대화 ID 기준이다.

### 화면

- **캔버스 패널**: 기본 대화 고르기(`canvasConversation.ts:43-67`), 제목 메뉴의 "현재 먼저"(`:71-76`), 보류(`:107-113`, `CanvasConversationPanel.tsx:453-457`, `dockedRules.ts:92`·`:101-104`), 목록을 읽는 동안 보내기 대기(`canvasRun.ts:342-344`), 새 현재 대화로 넘어가기(`takeNewCurrent`, `canvasRun.ts:324-336`), 보여 주던 대화 삭제(`canvasRun.ts:227`), 본 표시(`canvasConversation.ts:81`).
- **보드 알림·glow·Stop**: `agentPresence`(`agentPresence.ts:19-30`)가 캔버스의 첫 작업·대기 대화 하나를 고른다. Stop은 그 대화만(`CanvasAgent.tsx:64-72`, `agentIndicator.ts:149-159`). 대기 알림의 Open도 첫 대기 대화(`App.tsx:2132`).
- **작업 메모와 Following**: `pickWork`(`agentIndicator.ts:41-58`)는 presence 대화의 `doan work update`만 본다. Following 자체는 턴 여러 개를 이미 다룬다(`agentIndicator.ts:62-68`).
- **Show conversation 배지**: 현재 대화 하나(`rightPanelOpen.ts:44-50`, `App.tsx:1839-1840`).
- **사이드바 슬롯**: 행마다 가장 높은 신호(`conversationList.ts:49-62`). 캔버스 행 클릭은 현재 대화를 연다(`App.tsx:757-764`).
- **Overview의 Canvas conversations**: 현재 캔버스 대화마다 한 행(`canvasConversationRows.ts:41-67`). 대화가 여럿이면 한 캔버스가 여러 행이 된다.
- **프로토타입 창**: 첫 현재 대화(`renderer/prototype/conversation.ts:23-31`), main 창의 새 현재 대화 따라가기(`conversationRun.ts:228-241`), 배지(`conversation.ts:75-81`), 알림 억제용 보여 주는 대화 하나(`showing.ts:17-31`).
- **handoff**: 대상에 현재 대화가 있으면 거부(`handoff.ts:42`, `:59`, `service.ts:358`, `:1741`), 요청자는 현재여야 함(`service.ts:634`, `:1353`).
- **승격**: 작업 중인 대상은 건너뛰고(`project.ts:47-58`, `service.ts:1423-1425`) 대상의 현재 대화를 보관(`service.ts:1426-1440`).
- **Move to Trash**: 현재 대화만 센다(`canvasTrash.ts:66`).
- **영향 없음**: 알림(대화 ID별), Quick Open(ID별, 기본 고르기만 결정 5를 따름), 답장 칩, `doan active`, `doan work update`(대화 ID별), 삭제.

## 공통 설계

- **런타임**: 새 대화 시작, 터미널 세션 이어받기, handoff, 승격이 다른 대화를 보관하거나 끊지 않는다. `replaced`·`replacing()`·복원 경로·`conversation.restored`를 없앤다. 보관과 함께 쓰던 일 멈추기는 삭제·로그아웃·종료·업데이트 재시작에만 남는다.
- **울타리**: "현재가 아니면 죽은 대화"로 보던 곳은 "삭제되지 않은 대화"로 바꾼다. 캔버스 대화는 모두 산 대화다.
- **저장 형식 v3**: 이전 `state`를 읽어 캔버스 대화의 `archived`를 `current`로 바꿔 v3로 쓴다(한 번, 원자적으로, 실패하면 v2 그대로 다음 실행에 다시). 프로젝트 대화의 `state`는 그대로다. v3에서 캔버스 대화의 `state` 필드를 남길지는 하위 1의 결정이다. 저널과 이벤트에서 복원·보관 종류를 어떻게 정리할지도 하위 1이 정한다(이미 기록된 이벤트는 계속 읽어야 한다).
- **기본 대화 고르기**: 결정 5를 순수 함수 하나로 둔다. main 창 패널, 프로토타입 창, 사이드바가 같이 쓴다. "이 기기에서 마지막으로 본 대화"를 어디에 기억하는지(ui-state)는 하위 1이 정한다.

## 하위 1의 범위 — `canvas-concurrent-conversations`

런타임과 저장 형식 전부, 그리고 다음 화면의 결정과 구현.
- 캔버스 패널: 기본 대화, 제목 메뉴(작업 중·대기 표시, 정렬), 보류 제거, 목록을 읽는 동안의 보내기, `takeNewCurrent` 대체, 삭제 뒤 보여 줄 대화.
- 보드 알림·glow·Stop·대기 알림의 Open: 대화가 여럿 작업할 때 무엇을 보이고 Stop은 무엇에 적용하는지.
- 작업 메모와 Following이 어느 대화의 `work update`를 따르는지.
- Show conversation 배지.
- Overview의 Canvas conversations: 캔버스당 한 행인지 대화당 한 행인지.
- 프로토타입 창: 대화 전환 메뉴와 새 대화(결정 6), 배지, 알림 억제.
- handoff·승격 합류(결정 7), Move to Trash가 세는 대화.
- 초안: 캔버스 페이지, 패널, 제목 메뉴, 프로토타입 창 머리, Overview 행.

## 하위 2의 범위 — `sidebar-canvas-conversations`

- 보고 있는 캔버스 행 아래 대화 목록(그 캔버스에서만, 접고 펴기), 대화 행마다 상태(답 필요, 작업 중, 사용량 한도 대기, 안 본 종료).
- 캔버스 행의 신호 자리와 대화 행 신호의 관계, 사이드바가 숨겨졌을 때의 신호.
- 패널이 접혀 있을 때 대화 행을 누르면 패널이 그 대화로 열림. 캔버스 행 클릭은 결정 5.
- 폭(180–360 px), 긴 제목, 키보드(로빙 포커스, ←/→), 행 밀림.
- 초안: 사이드바.

## 하위 3의 범위 — `canvas-edit-awareness`

- 에이전트가 같은 캔버스를 고치는 다른 세션이 있는지 알게 한다. 편집 전에 부르는 `doan work start`와 프레임마다 부르는 `doan work update`의 답에 "이 캔버스에서 작업 중인 다른 세션"(터미널 세션과 앱 대화, 종류와 프로바이더 정도)을 싣는다. 앱은 이미 안다(`workState.ts`, `conversationWork.ts`, 턴별 작업 상태).
- guide 규칙: 다른 세션이 있고 사람이 캔버스 편집을 시키면, 편집을 시작하기 전에 사람에게 한 번 확인한다. Doan이 막지 않는다(공통 결정 3과 맞는다). 앱이 꺼져 있거나 답이 없으면 묻지 않고 지금처럼 진행한다.
- 소켓 v3 답, CLI 출력, guide가 바뀌므로 `/agent-eval`이 필요하다. 하위 1이 병합된 뒤에 시작한다(동시 대화가 가능해져야 의미가 있다).

## 형식 변경

- `conversations/index.json` v2 → v3(TS만 읽음, `schema/` 밖). fixture `app/src/main/conversation/fixtures/`에 v3와 v2→v3 이전 사례를 더한다. CLI 형식과 소켓은 바뀌지 않는다.

## 규약 영향

- 없다. ARCHITECTURE §1과 `doan check`는 그대로다. guide와 스킬 스텁이 "현재 대화"나 handoff 조건을 말하는지 하위 1이 확인한다. 말한다면 `/agent-eval` 대상이다.

## 결정 영향

- PRODUCT §5 item 2 'Canvas conversation'(현재 대화, 보관, 보류, 복원), item 3(Overview Canvas conversations, Quick Open, 'Handoff', 승격), 프로토타입 창(item 2 'Prototype window'), Move to Trash(item 1)가 바뀐다.
- PRODUCT §3 Out of scope 7(사람과 에이전트의 동시 편집)은 그대로다. 에이전트끼리의 동시 편집은 막지 않는다는 문장을 더한다.
- ARCHITECTURE §7 'Agent conversation runtime and IPC'의 보관·복원·승격 경로와 저장 형식.

## PoC 의존

- 같은 계정으로 한 캔버스에서 턴 여러 개를 동시에 돌리는 일. handoff가 이미 "첫 턴들이 같은 계정에서 동시에 돈다"(PRODUCT §5 item 2 'Handoff')를 한다. 하위 1이 다섯 프로바이더에서 다시 확인할지 정한다.

## POSTMORTEM

하위 feature가 자기 design.md에서 찾아 인용한다(대화 저장 형식 이전, 접기, 울타리, 프로토타입 창 대화 패널 관련 항목).
