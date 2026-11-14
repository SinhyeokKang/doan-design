# sidebar-canvas-conversations — design

develop `7fdcd1dbf` 기준. 하위 1(`canvas-concurrent-conversations`)이 병합되면 그 코드와 다시 맞춘다(tasks 2).

## 영향받는 컴포넌트

- **사이드바**: `app/src/renderer/ShellSidebar.tsx`
  - 캔버스 행(`:267`에서 키보드 행으로 넣는 행): 보고 있는 캔버스이고 대화가 2개 이상이면 아이콘 자리에 셰브론을 겹친다. 프로젝트 행의 `.shell-lead`/`.shell-disclosure`(`:333-334`)와 같은 구조로, 셰브론은 `tabIndex=-1`이고 행에 `aria-expanded`를 둔다. 셰브론은 행에 포인터가 있거나 행 안에 `:focus-visible`이 있을 때 보인다.
  - 대화 목록은 `.shell-canvas-row` 안이 아니라 그 옆 형제로 둔다(`role="group"`). 캔버스 행의 `:has(:focus-visible)` 규칙과 `onClick`이 목록에 걸리지 않게 하기 위해서다.
  - 대화 행: `role="treeitem"`, `aria-level={4}`, 제목, 상태 표시, 휴지통. 패널이 보여 주는 대화(하위 1의 보여 주는 대화)의 행은 `aria-current="true"`. 상태는 `aria-describedby`로 sr-only 상태 이름을 단다(휴지통이 표시를 가려도 읽힌다).
  - 상태 표시와 휴지통은 둘 다 늘 마운트하고 CSS로 바꾼다. 캔버스 행의 메뉴 버튼과 `.row-slot` 규칙(`app/src/renderer/styles.css:579-582`)과 같은 방식이다.
  - 키보드 행 목록(`rows`, `:225-268`): 대화 행을 캔버스 행 다음에 넣는다. 캔버스 행의 `right`/`left`(지금 `:267`)에 펴기·접기·첫 대화로 이동을 더한다. 대화 행의 →는 아무것도 하지 않고, ←는 캔버스 행으로 간다. 휴지통은 Tab 순서에만 있다.
  - 포커스 복구(`:277-288`의 `ownedFocus`·`recoveryKey`): `recoveryKey`(`:91-101`)의 "다음 형제, 없으면 이전, 없으면 부모" 규칙은 지금 `canvas` 표시가 있는 행에만 쓴다(`:95`). 대화 행에도 그 규칙을 쓰도록 형제 표시를 단다. 셰브론이 사라질 때(대화가 1개가 되거나 다른 캔버스로 갈 때) 포커스가 셰브론에 있었으면 캔버스 행으로 간다.
- **신호**: `app/src/renderer/conversationList.ts`
  - `slotsFromList`(`:49-62`)의 `fromHome` 필터(`:53`)를 캔버스에 묶인 대화(`c.canvas`)에는 걸지 않는다. 프로젝트 대화는 지금처럼 Home 대화만 센다.
  - 대화 행은 대화마다 신호가 필요하므로 `conversationWork`(`:18-27`)를 대화별로 부른다. 순서는 이 파일의 `RANK`(`:12`)를 쓴다.
  - 가장 강한 신호는 사이드바 `RANK`(사용량 한도 대기 포함)다. 하위 1의 패널 배지 순서(`canvasStrongestSignal`, 한도 대기 없음)를 쓰지 않는다.
- **안 본 표시**: `app/src/renderer/homeRun.ts`의 `visit`(`:371-378`)도 `fromHome`만 본다(`:374`). 같은 이유로 캔버스에 묶인 대화에서는 이 조건을 뺀다. 그러지 않으면 캔버스 패널에서 시작한 대화의 캔버스가 프로젝트를 떠났을 때, 프로젝트 행의 안 본 말풍선이 지워지지 않는다.
- **신호 배치**: `App.tsx:2262`의 `shellSlots = sidebarSlots(withTerminalSlots(run.slots(), work, entries), entries, shownCanvas)`는 그대로 둔다. 이 전체 집합을 `projectSlot`(`ShellSidebar.tsx:106-113`), `sidebarToggleView`(`App.tsx:2271`), `openSidebarCanvas`(`App.tsx:757`)가 계속 쓴다. 목록이 실제로 보이는 동안 보고 있는 캔버스 행의 표시만 따로 고른다(순수 함수 2): 대화 신호를 빼고 터미널 스피너(`withTerminalSlots`, `conversationList.ts:73`)와 캔버스 알림 점(`sidebarSlots`, `canvasNotice.ts:30-43`)만 남긴다.
- **ui-state**: `app/src/restore/uiState.ts`의 `sidebar?: { width?: number; hidden?: true }`(`:68`)에 `conversationsFolded?: true`를 더한다(접힘만 저장, 없으면 펼침). `parseUiState`(`:138-141`)의 sidebar 분기에 셋째 필드로 따로 검증해 잘못된 값만 버린다. 렌더러 쪽 연결은 `App.tsx:645-703`의 `sidebarState`, touched 표시, 첫 읽기 병합에 더한다(POSTMORTEM 2026-11-01). 접힘 값만 저장해도 폭·숨김 값이 그대로여야 한다.
- **App**: `app/src/renderer/App.tsx`
  - 사이드바에 보고 있는 캔버스의 대화 목록, 보여 주는 대화 ID, 펼침 값, `openConversation(id)`, `deleteConversation(id, after)`를 넘긴다.
  - 대화 행 누르기는 하위 1의 "요청된 대화" 경로(알림의 Open과 같은 entry, PRODUCT §5 item 2 'Opening')를 쓰고, 접힌 패널은 그 경로로 펼친다. Back/Forward 방문을 만들지 않는다.
  - 휴지통은 `openDelete`(`:1368`)와 `conversationDelete.ts`의 `deleteAvailability`(`:12-16`)·`DELETE_TOOLTIP`·`deleteItemLabel`을 쓴다. 페이지가 잠긴 동안 `openDelete`는 아무것도 하지 않는다(`:1369`). 그때 휴지통은 다른 사이드바 동작처럼 비활성 잉크다.
  - 사이드바에서 연 삭제는 `DeleteTarget`(`ConversationDeleteDialog.tsx:12-14`)에 `from: "sidebar"`와 `after`를 더해 넘긴다. `after`는 확인 창이 포커스를 가져가기 전에 사이드바가 계산한다(다음 대화 행, 없으면 이전 행, 없으면 캔버스 행). `canvasList`의 `ListFocus`와 같은 방식이다. 확인 창이 열린 동안 `ownedFocus` 복구는 건너뛰므로(`ShellSidebar.tsx:279`) 이 값이 필요하다. Cancel과 Escape는 휴지통으로 돌아간다. 사이드바에서 시작한 삭제에서는 이 규칙이 하위 1의 "보던 대화를 지우면 포커스는 제목 메뉴 버튼"보다 앞선다.
- **스타일**: `styles.css`의 `.shell-canvas-row`, `.shell-disclosure`(`:546-555`), 캔버스 행 메뉴의 숨김·대체 규칙(`:576-582`). 대화 행 들여쓰기, 현재 행 표시, 휴지통이 신호 자리를 대신하는 규칙.
- **바뀌지 않음**: main, preload, IPC, CLI, 스키마. `listState(root)`가 이미 루트의 모든 대화를 주므로 렌더러가 가진 목록을 쓴다.

## 순수 함수로 뺄 것(`/tdd` 대상)

1. **`viewedCanvasConversations(list, root, viewedPath, rows, seen, now)`**: 보고 있는 캔버스의 대화 행. 보고 있는 루트의 목록만 본다(목록은 루트별이라 같은 캔버스 ID를 가진 워크트리끼리 섞이지 않는다). 소속은 `slotKeyOf(root, c, rows) === slotKey(root, viewedPath)`로 정한다(`conversationList.ts:41-44`). 그래서 두 행이 같은 ID를 가지면(`listed`가 null, `:34-38`) 빈 목록이다. 각 행에 `conversationWork`의 신호(`scheduledOf`를 위해 `now`를 받는다). 2개 미만이면 빈 배열. 순서는 하위 1의 제목 메뉴 순서 함수, 멈춘 순서가 있으면 그 순서에 새 대화를 끝에 붙인다.
2. **`canvasRowMark(fullSlots, terminal, notices, viewedKey, listShown)`**: 목록이 실제로 보이는 동안 보고 있는 캔버스 행에 보일 표시. 대화 신호를 빼고 터미널 스피너와 캔버스 알림 점 중 더 강한 것. 목록이 안 보이면(접힘, 2개 미만, 캔버스 행이 화면에 없음, 목록 읽는 중이나 실패) 전체 집합의 값을 그대로 쓴다. 전체 집합 자체는 바꾸지 않는다.
3. **`slotsFromList` 범위**: 캔버스에 묶인 대화는 `fromHome`과 상관없이 센다. 캔버스 대화가 프로젝트를 떠나면 프로젝트 행에 보인다. 프로젝트 대화는 Home 대화만.
4. **`canvasDisclosure(viewed, count)`**: 셰브론을 보일지(보고 있는 캔버스이고 대화 2개 이상).
5. **키보드 순서와 화살표**: 캔버스 행 다음에 대화 행. 캔버스 행 →: 접혀 있으면 펴고, 펼쳐 있으면 첫 대화 행으로. 캔버스 행 ←: 펼쳐 있으면 접고, 아니면 그룹 머리로. 대화 행 →: 아무것도 하지 않음. 대화 행 ←: 캔버스 행. 휴지통은 화살표 순서에 없고 Tab으로만 닿는다.
6. **순서 멈춤과 목록 유지**: 포인터나 포커스가 목록 안에 있는 동안의 순서(새 대화는 끝), 아래 캔버스 행을 누른 뒤 포인터가 사이드바를 떠날 때까지 이전 목록을 보이는 규칙.
7. **ui-state `sidebar.conversationsFolded`**: 파싱(참만 받음), 저장(접힘만 씀), 폭·숨김과 서로 덮어쓰지 않음.

## 세부 규칙

- **신호와 표시**: 대화 행의 표시는 `SlotMark`(`ShellSidebar.tsx:115-120`)를 그대로 쓴다(손, 스피너, 시계, 말풍선). 휴지통이 보이는 동안 표시는 가려지지만 `aria-describedby`의 상태 이름은 남는다. 대화가 `working`이면 표시도 작업 중이어서 휴지통 이유("The agent is working on this conversation.", `conversationDelete.ts:14`)와 어긋나지 않는다.
- **현재 행**: 패널이 보여 주는 대화. 패널이 접혀 있으면 펼쳤을 때 보일 대화(하위 1의 기본 대화 규칙)다. 패널이 새 대화 상태면 현재 행이 없다.
- **숨겨진 사이드바의 Show sidebar 신호**: 계산 방식(`sidebarToggleView`)은 그대로이고, 입력인 전체 집합이 캔버스 패널에서 시작한 대화를 새로 센다(정한 점 7).
- **폭과 긴 제목**: 180–360 px. 대화 행은 캔버스 행보다 한 단계 들여쓴다. 제목은 `min-width: 0`과 말줄임표, 전체 제목은 행의 접근 가능한 이름. 들여쓰기는 초안에서 180 px일 때 제목이 읽히게 정한다.
- **행 밀림**: 보고 있는 캔버스가 바뀌면 목록이 그 캔버스로 옮겨 가고 아래 행들이 밀린다. 사이드바 안에서 누른 경우는 정한 점 10대로 포인터가 떠날 때까지 미룬다. 애니메이션은 없다(reduced motion은 해당하지 않는다).
- **목록 읽는 중·실패**: 그 루트의 대화 목록을 읽는 중이거나 읽지 못하면 목록을 보이지 않고 캔버스 행은 지금처럼 동작한다(하위 1이 목록 오류를 다루는 곳은 패널이다).
- **캔버스가 프로젝트를 떠남**: 보고 있는 캔버스가 목록에서 사라지면 그 행과 대화 목록이 함께 사라지고, 포커스는 `recoveryKey` 규칙을 따른다.
- **포커스**: 목록을 접을 때 포커스가 대화 행이나 휴지통에 있으면 캔버스 행으로 간다. 포커스가 있던 대화 행이 다른 곳에서 지워지면 다음 대화 행, 없으면 이전, 없으면 캔버스 행. 숨긴 휴지통과 셰브론은 `display: none`이 아니라 시각적으로만 숨긴다(POSTMORTEM 2026-11-03).
- **셰브론 보이기**: hover와 `:focus-visible`/`:has(:focus-visible)`로만 보인다(POSTMORTEM 2026-11-06 'The project row chevron stayed…'). 셰브론의 이름은 "Expand <canvas>"와 "Collapse <canvas>"다(문구는 초안에서 `clarify`로 확인한다).
- **잠긴 페이지**: 페이지가 잠긴 동안 대화 행 누르기와 휴지통은 다른 사이드바 동작처럼 비활성 잉크이고 아무것도 하지 않는다. 접고 펴기는 지금 프로젝트 펼치기처럼 된다(PRODUCT §5 item 1 'Leaving').

## 형식 변경

- 저장 형식·CLI·소켓 없음. ui-state(`app/src/restore/uiState.ts`)에 선택 필드 하나(`sidebar.conversationsFolded`). ui-state는 TS만 읽고 모르는 필드는 버리는 규칙이라 버전을 올리지 않는다.

## 규약 영향

- 없다. ARCHITECTURE §1과 `doan check`는 그대로다.

## 결정 영향

- PRODUCT §5 item 1 사이드바: 캔버스 행 아래 대화 목록, 접힘 값, 셰브론, 슬롯 문장(`docs/PRODUCT.md:244`, Home 대화만 → 모든 대화)과 Show sidebar 문장(`:203`).
- `/agent-eval` 대상이 아니다. 에이전트가 읽는 guide, 스킬 스텁, CLI 출력, 소켓이 바뀌지 않는다. AGENTS.md 'Workflow'의 "feature의 마지막 통합 전" 조건을 벗어나는 이유이고, 사용자가 승인했다(spec '사용자 결정'). 하위 3 `canvas-edit-awareness`가 `/agent-eval`을 돈다.

## PoC 의존

- 없다. 프로젝트 행 셰브론, 캔버스 행 메뉴의 슬롯 대체, 로빙 포커스 복구, 삭제 확인 창 뒤 포커스(`canvasList`)는 출시된 패턴이다.

## 디자인 프리셋

`doan design-skill shape`, `harden`, `clarify`를 읽었다(상태 목록, 긴 제목·빈 제목·실패 상태, 휴지통 툴팁 문구).

## 초안 요청

`/design-draft`에 넘길 내용이다. 하위 1의 초안(`.doan/canvases/canvas-concurrent-conversations.html`)이 사용자에게 확인된 뒤에 그린다. 그 초안의 제목 메뉴 행 표시와 Delete를 이 목록이 그대로 쓴다. 출시된 사이드바를 다시 그리는 redesign 초안이고, 출시된 초안은 고치지 않는다(AGENTS.md 'Workflow' redesign 예외). 이 초안이 이 feature가 병합될 때까지 `/design-sync` 기준이다.

- 캔버스: `.doan/canvases/sidebar-canvas-conversations.html`, 캔버스 ID `sidebar-canvas-conversations`.
- 프레임
  - `unfolded`: 보고 있는 캔버스 아래 대화 4개, 상태가 섞임(답 필요, 작업 중, 한도 대기, 안 본 종료), 현재 행, 캔버스 행에 대화 신호 없음. 같은 캔버스에 터미널 에이전트가 작업 중인 타일(캔버스 행에 스피너가 남음).
  - `folded`: 같은 캔버스 접힘, 캔버스 행에 가장 강한 신호. 한도 대기만 있는 타일.
  - `hover-chevron`: 행에 포인터, 셰브론(펼침·접힘 두 타일).
  - `single-conversation`: 대화 1개인 캔버스, 목록 없음, 포인터를 올려도 셰브론 없음.
  - `hover-delete`: 대화 행에 포인터, 휴지통이 상태 자리를 대신함. 작업 중 행의 쓸 수 없는 휴지통 타일(이유 툴팁).
  - `keyboard-trash`: Tab으로 휴지통에 포커스.
  - `narrow-180`: 180 px, 긴 제목과 빈 제목("Conversation").
  - `long-list`: 대화 12개, 사이드바 스크롤.
  - `list-read-failure`: 대화 목록을 읽지 못한 루트의 보고 있는 캔버스(목록 없음, 캔버스 행은 지금 모양).
- 제약: 출시된 토큰과 컴포넌트만. 문구는 `clarify` 프리셋으로(휴지통 툴팁과 이름은 제목 메뉴 Delete 문구 `DELETE_TOOLTIP`, `deleteItemLabel` 그대로, 셰브론 "Expand/Collapse <canvas>").

## POSTMORTEM에서 가져온 것

- **2026-11-06 'The project row chevron stayed after a click until something else took focus'**: "a reveal-on-focus rule on a clickable focusable element uses `:focus-visible` / `:has(:focus-visible)`, unless PRODUCT says any focus." 캔버스 행 셰브론과 대화 행 휴지통에 그대로 쓴다.
- **2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'**: "an element that receives focus programmatically … is hidden only visually …, never with `display: none` or `visibility: hidden`." 휴지통과 셰브론의 숨김 규칙.
- **2026-11-01 'A ui-state save sent before the startup read could replace every remembered field'**: "a client of a replace-semantics store sends nothing until its first read has settled, and merges what it read before the first save." 새 `sidebar.conversationsFolded`도 이 경로로 저장한다.
- **2026-10-25 'Removing the remembered row removed a card from keyboard navigation'**: "derive roving focus from the current item set, including remove and re-root transitions." 대화 행이 지워지고 목록이 접힐 때.
- **2026-11-06 'Unfolding older models moved the line under the pointer, so a second press picked a model'**: 포인터 아래 행이 움직이면 두 번째 누름이 다른 것을 고른다. 정한 점 4(순서 멈춤)와 10(아래 캔버스 행을 누른 뒤 목록 유지)이 이 규칙을 따른다.
