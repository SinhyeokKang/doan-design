# sidebar-canvas-conversations — design

develop `777085d87` 기준. 하위 1(`canvas-concurrent-conversations`)이 병합되면 그 코드와 다시 맞춘다(tasks 1).

## 영향받는 컴포넌트

- **사이드바**: `app/src/renderer/ShellSidebar.tsx`
  - 캔버스 행(`:377`): 보고 있는 캔버스이고 대화가 2개 이상이면 아이콘 자리에 셰브론 버튼을 겹친다(프로젝트 행의 `.shell-lead`/`.shell-disclosure`, `:333-334`와 같은 구조). 행에 `aria-expanded`를 둔다.
  - 그 아래 `role="group"` 안에 대화 행(`role="treeitem"`, `aria-level={4}`). 행: 제목, `SlotMark`(`:115-120`) 또는 휴지통, 선택된 행은 `aria-selected`.
  - 키보드 행 목록(`rows`, `:225-268`): 대화 행을 캔버스 행 다음에 넣는다. 캔버스 행의 `right`/`left`(지금 `right: () => {}`, `left: () => focus(head)`, `:267`)에 펴기·접기·첫 대화로 이동을 더한다.
  - 포커스 복구(`:276-287`의 `ownedFocus`·`recoveryKey`): 목록이 접히거나 대화 행이 지워질 때 그대로 쓴다. 대화 행의 부모는 캔버스 행 키다.
- **신호**: `app/src/renderer/conversationList.ts`
  - `slotsFromList`(`:49-62`)는 행마다 가장 강한 신호 하나를 만든다. 대화 행은 대화마다 신호가 필요하므로 `conversationWork`(`:18-27`)를 대화별로 부른다.
  - `fromHome` 필터(`:53`)를 캔버스 대화에 풀지는 '확인 필요' 1.
  - 펼친 동안 캔버스 행의 신호를 비우는 일은 `sidebarSlots`(`canvasNotice.ts:30-43`) 뒤, 사이드바가 받기 전에 한다(순수 함수 2).
- **ui-state**: `app/src/restore/uiState.ts`의 `sidebar?: { width?: number; hidden?: true }`(`:68`)에 `conversationsFolded?: true`를 더한다(접힘만 저장, 없으면 펼침). `parseUiState`의 다른 sidebar 필드처럼 따로 검증해 잘못된 값만 버린다. POSTMORTEM 2026-11-01의 첫 읽기 전 저장 금지 규칙을 따른다.
- **App**: `app/src/renderer/App.tsx`
  - 사이드바에 보고 있는 캔버스의 대화 목록, 보여 주는 대화 ID, 펼침 값, `openConversation(id)`, `deleteConversation(id)`를 넘긴다.
  - 대화 행 누르기는 하위 1의 "요청된 대화" 경로(알림의 Open과 같은 entry)를 쓴다. Back/Forward 방문을 만들지 않는다.
  - 휴지통은 패널 제목 메뉴 Delete와 같은 확인 경로(`conversationDelete.ts`의 `deleteAvailability`·`deleteDialogView`, 툴팁 `DELETE_TOOLTIP`)를 쓴다.
- **스타일**: `app/src/renderer/styles.css`의 `.shell-canvas-row`(`:569` 근처), `.shell-disclosure`(`:546-555`). 대화 행 들여쓰기, 선택 표시, 휴지통이 신호 자리를 대신하는 규칙(캔버스 행 메뉴 버튼이 슬롯 자리를 대신하는 지금 규칙과 같다, PRODUCT §5 item 1 'Canvas row menu').
- **바뀌지 않음**: main, preload, IPC, CLI, 스키마. 대화 목록은 렌더러가 이미 가진 main 목록을 쓴다.

## 순수 함수로 뺄 것(`/tdd` 대상)

1. **`viewedCanvasConversations(list, canvas)`**: 보고 있는 캔버스의 대화 행. 캔버스 ID가 한 행에만 있으면 ID로, 없으면 경로로 묶는다(`listed`, `conversationList.ts:35-39`와 같은 규칙). 순서는 최근 활동 순(하위 1의 제목 메뉴 순서 함수와 같은 것을 쓴다). 2개 미만이면 빈 배열. 각 행에 `conversationWork`의 신호.
2. **`placeSlots(slots, viewed, folded)`**: 펼친 동안 보고 있는 캔버스 행의 신호를 비우고, 접혔거나 목록이 없으면 그대로 둔다. 프로젝트 행 규칙(`projectSlot`, `ShellSidebar.tsx:106-113`)은 그대로다.
3. **`canvasDisclosure(viewed, count)`**: 셰브론을 보일지(보고 있는 캔버스이고 대화 2개 이상).
4. **키보드 순서와 화살표**: 캔버스 행 다음에 대화 행. 캔버스 행 →: 접혀 있으면 펴고, 펼쳐 있으면 첫 대화 행으로. 캔버스 행 ←: 펼쳐 있으면 접고, 아니면 그룹 머리로. 대화 행 →: 휴지통(쓸 수 있을 때). 대화 행 ←: 캔버스 행. 휴지통 ←: 대화 행.
5. **ui-state `sidebar.conversationsFolded`**: 파싱(참만 받음), 저장(접힘만 씀).

## 세부 규칙

- **신호와 표시**: 대화 행의 표시는 `SlotMark`를 그대로 쓴다(손, 스피너, 시계, 말풍선). 휴지통이 보이는 동안 표시는 가려지지만 행의 접근 가능한 설명으로 남는다(캔버스 행 메뉴 규칙과 같다).
- **선택된 행**: 패널이 보여 주는 대화. 패널이 접혀 있어도 펼치면 보일 대화를 선택으로 표시한다(하위 1의 기본 대화 규칙).
- **숨겨진 사이드바의 Show sidebar 신호**: 바뀌지 않는다. 사이드바 슬롯 집합의 가장 강한 신호다(PRODUCT §5 item 1). 펼친 동안 캔버스 행 신호를 비우는 것은 표시 위치만 바꾸므로 집계에는 들어간다. 리드 판단 — 숨겨진 사이드바는 목록을 보이지 않으므로 대화 행을 따로 셀 필요가 없다.
- **폭과 긴 제목**: 180–360 px. 대화 행은 캔버스 행보다 한 단계 들여쓴다. 제목은 `min-width: 0`과 말줄임표, 전체 제목은 행의 접근 가능한 이름. 제목이 비면 "Conversation"(하위 1 Overview 행 규칙과 같다).
- **행 밀림**: 보고 있는 캔버스가 바뀌면 목록이 그 캔버스로 옮겨 가고 아래 행들이 밀린다. 애니메이션은 없다(그래서 reduced motion은 해당하지 않는다). 사이드바 스크롤 위치는 지금처럼 둔다.
- **목록 읽기 실패·읽는 중**: 그 루트의 대화 목록을 읽지 못하면 목록을 보이지 않고 캔버스 행은 지금처럼 동작한다(하위 1이 목록 오류를 다루는 곳은 패널이다). 읽는 중에도 보이지 않는다.
- **캔버스가 프로젝트를 떠남**: 보고 있는 캔버스가 목록에서 사라지면 그 행과 대화 목록이 함께 사라지고, 포커스는 기존 `recoveryKey` 규칙을 따른다.
- **포커스**: 목록을 접을 때 포커스가 대화 행이나 휴지통에 있으면 캔버스 행으로 간다. 포커스가 있던 대화 행이 지워지면 다음 대화 행, 없으면 이전, 없으면 캔버스 행. 휴지통 확인 창이 닫히면 출시된 Delete 규칙처럼 돌아온다. 숨긴 휴지통은 `display: none`이 아니라 시각적으로만 숨긴다(POSTMORTEM 2026-11-03).
- **셰브론 보이기**: `:focus-visible`/`:has(:focus-visible)`와 hover로만 보인다(POSTMORTEM 2026-11-06 'The project row chevron stayed…').

## 형식 변경

- 저장 형식·CLI·소켓 없음. ui-state(`app/src/restore/uiState.ts`)에 선택 필드 하나(`sidebar.conversationsFolded`). ui-state는 TS만 읽고, 모르는 필드는 버리는 규칙이라 버전을 올리지 않는다.

## 규약 영향

- 없다. ARCHITECTURE §1과 `doan check`는 그대로다.

## 결정 영향

- PRODUCT §5 item 1 사이드바(캔버스 행 아래 대화 목록, 접힘 값, 셰브론), item 3 'The sidebar row slot …'(신호 자리 규칙, '확인 필요' 1의 결과).
- `/agent-eval` 대상이 아니다. 에이전트가 읽는 guide, 스킬 스텁, CLI 출력, 소켓이 바뀌지 않는다.

## PoC 의존

- 없다. 프로젝트 행 셰브론, 캔버스 행 메뉴의 슬롯 대체, 로빙 포커스 복구는 출시된 패턴이다.

## 확인 필요

1. **캔버스 행 신호에 캔버스 패널에서 시작한 대화도 넣을까?** 지금 사이드바 신호는 Home에서 시작한 대화만 센다(`conversationList.ts:53`). 대화 행은 정한 점 2대로 그 캔버스의 모든 대화 상태를 보이므로, 접었을 때 캔버스 행도 모든 대화를 세야 정한 점 5("같은 신호를 두 곳에 보이지 않는다")가 맞는다. 권장: 캔버스 행(펼침·접힘 모두)은 그 캔버스에 묶인 모든 대화를 센다. 프로젝트 행은 지금 규칙(Home 대화와 화면 밖 캔버스 행의 신호)을 둔다.
2. **보고 있지 않은 캔버스 행도 모든 대화를 셀까?** 1과 같은 질문이 다른 캔버스 행에도 있다. 권장: 1과 같이 센다. 캔버스 패널에서 시작한 대화의 상태가 다른 캔버스를 볼 때도 사이드바에 보인다.

## 디자인 프리셋

`doan design-skill shape`, `harden`, `clarify`를 읽었다(상태 목록, 긴 제목·빈 제목·실패 상태, 휴지통 툴팁 문구).

## 초안 요청

`/design-draft`에 넘길 내용이다. 출시된 사이드바를 다시 그리는 redesign 초안이고, 출시된 초안은 고치지 않는다(AGENTS.md 'Workflow' redesign 예외). 이 초안이 이 feature가 병합될 때까지 `/design-sync` 기준이다.

- 캔버스: `.doan/canvases/sidebar-canvas-conversations.html`, 캔버스 ID `sidebar-canvas-conversations`.
- 프레임
  - `unfolded`: 보고 있는 캔버스 아래 대화 4개, 상태가 섞임(답 필요, 작업 중, 한도 대기, 안 본 종료), 선택된 행, 캔버스 행 신호 없음.
  - `folded`: 같은 캔버스 접힘, 캔버스 행에 가장 강한 신호.
  - `hover-chevron`: 아이콘에 포인터, 셰브론(펼침·접힘 두 타일).
  - `single-conversation`: 대화 1개인 캔버스, 목록 없음, 포인터를 올려도 셰브론 없음.
  - `hover-delete`: 대화 행에 포인터, 휴지통이 상태 자리를 대신함. 작업 중 행의 쓸 수 없는 휴지통 타일.
  - `keyboard-trash`: 키보드 포커스가 휴지통.
  - `narrow-180`: 180 px, 긴 제목과 빈 제목("Conversation").
  - `long-list`: 대화 12개, 사이드바 스크롤.
  - `list-read-failure`: 대화 목록을 읽지 못한 루트의 보고 있는 캔버스(목록 없음, 캔버스 행은 지금 모양).
- 제약: 출시된 토큰과 컴포넌트만. 문구는 `clarify` 프리셋으로(휴지통 툴팁은 제목 메뉴 Delete 문구를 그대로).

## POSTMORTEM에서 가져온 것

- **2026-11-06 'The project row chevron stayed after a click until something else took focus'**: "a reveal-on-focus rule on a clickable focusable element uses `:focus-visible` / `:has(:focus-visible)`, unless PRODUCT says any focus." 캔버스 행 셰브론과 대화 행 휴지통에 그대로 쓴다.
- **2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'**: "an element that receives focus programmatically … is hidden only visually …, never with `display: none` or `visibility: hidden`." 휴지통과 셰브론의 숨김 규칙.
- **2026-11-01 'A ui-state save sent before the startup read could replace every remembered field'**: "a client of a replace-semantics store sends nothing until its first read has settled, and merges what it read before the first save." 새 `sidebar.conversationsFolded`도 이 경로로 저장한다.
- **2026-10-25 'Removing the remembered row removed a card from keyboard navigation'**: "derive roving focus from the current item set, including remove and re-root transitions." 대화 행이 지워지고 목록이 접힐 때.
- **2026-11-06 'Unfolding older models moved the line under the pointer, so a second press picked a model'**: 목록을 펼 때 포인터 아래 행이 움직이지 않는지 본다. 목록은 캔버스 행 아래로 자라므로 셰브론 자체는 움직이지 않는다.
