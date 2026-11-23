# Overview 대화 목록 — design

## 결정

질문으로 정한 것을 여기에 적는다. 정하기 전 항목은 '미정'이다.

- **목록 이름**: "Conversations". 빈 목록, 로딩 문구, 접근성 이름처럼 "canvas conversations"를 쓰던 문구도 같이 바꾼다(문구는 시안에서 정한다).
- **프로젝트 대화 행 모양**: 캔버스 행과 높이·정렬이 같다. 썸네일 자리(72×48)에는 inset 채움 위에 대화 아이콘을 둔다(아이콘은 시안에서 정한다). 첫 줄은 캔버스 행과 같고(provider 로고, 제목, 상태 표시, 시간·Delete), 캡션 줄에는 캔버스 이름 대신 "Overview"를 쓴다. 그 아래는 미리보기 두 줄이다. 썸네일 캡처는 요청하지 않는다.
- **행 순서**: 종류를 나누지 않는 한 목록이다. 최근 활동이 앞에 오고, 같으면 지금처럼 캔버스 경로순이다. 프로젝트 대화는 경로가 없으니 같은 시각의 캔버스 대화보다 앞에 둔다.
- **프로젝트 대화 행 클릭과 current 표시**: 프로젝트 대화 행을 누르면 페이지 이동 없이 가운데 열이 그 대화로 바뀌고, 포커스는 composer로 간다. Conversation menu에서 고를 때처럼 Back/Forward 방문은 추가되지 않는다. 지금 가운데 열에 보이는 대화의 행은 current로 표시한다. 시각 언어는 사이드바의 현재 행을 따른다. 사이드바 현재 행이 쓰는 10% pressed location fill(rgba(0,0,0,.1))과 standard ink를 쓰고(docs/design/shell.md 'Sidebar', 'Viewed canvas's conversation list'), `aria-current`를 붙인다. 새 대화 상태에서는 current 행이 없다. 캔버스 대화는 가운데 열에 보이지 않으니 current가 되지 않는다. current 행 위에 hover가 올라가면 어떻게 보일지는 시안에서 정한다.
- **헤더 Conversation menu**: 지금 그대로 둔다. New conversation, 프로젝트 대화 목록, Delete가 그대로 있다. 메뉴와 목록 어디서 고르든 같은 `OverviewRun.select`를 거치므로 current 표시와 메뉴의 현재 행이 함께 바뀐다. 캔버스 패널의 제목 메뉴와 모양이 같아서 일관성이 유지된다.

## 바뀌지 않는 것

- 캔버스 대화 행의 모양, 특수 행(사라진 캔버스, ID 중복, 읽을 수 없는 캔버스), 클릭하면 캔버스를 여는 동작.
- Overview가 어떤 대화를 보여줄지 고르는 규칙(PRODUCT §5 item 3 'Which conversation shows')과 seen 규칙.
- Delete 규칙: 가능 여부, 확인 창, main의 재확인. Overview가 보여주던 대화를 지우면 새 대화 상태가 된다.
- 한 루트에서 프로젝트 대화가 하나만 일할 수 있다는 제한(PRODUCT §5 item 1 'Project conversations').
- 목록에 넣는 프로젝트 대화의 범위: Conversation menu(`projectConversationMenu`)와 같다. 읽을 수 없는 프로젝트 대화도 행으로 나오고, 누르면 가운데 열에 읽기 실패가 표시된다.

## 영향받는 구성 요소

- **app (renderer)**만 바뀐다.
  - `canvasConversationRows.ts`: 지금은 `c.canvas`가 없는 대화를 건너뛴다. 프로젝트 대화 행도 만든다.
  - `CanvasConversationList.tsx`: 프로젝트 대화 행 렌더링, current 표시, 빈 목록 문구, 로딩 문구.
  - `App.tsx`의 행 열기(`open`): 프로젝트 대화 행이면 `OverviewRun.select`로 가운데 열을 바꾼다. 캔버스 행은 지금처럼 캔버스를 연다.
  - `ProjectOverview.tsx`: 바뀌지 않는다(헤더 Conversation menu 유지).
  - `styles.css`, 그리고 `docs/design/project.md`의 'Right rows' 측정값.
- **CLI, 스킬, 포맷**: 바뀌지 않는다. main의 대화 목록(`listConversations`)은 이미 프로젝트 대화를 포함해서 돌려준다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `canvasConversationRows` → 프로젝트 대화까지 담는 행 목록 함수. 확인할 점:
  - 프로젝트 대화 행의 종류 구분, 정렬 순서(결정에 따름), 동점 처리
  - 읽을 수 없는 프로젝트 대화의 행
  - 상태 표시는 `conversationLine`, Delete 가능 여부는 `deleteAvailability`를 그대로 쓴다.
- current 행을 정하는 함수: 보여주는 대화 ID와 행 목록에서 current 행 키를 정한다. 새 대화 상태이면 없다.
- 행 열기 분기: 행 종류에 따라 가운데 열을 바꿀지 캔버스를 열지 정한다.

## 포맷 변경

없다. JSON Schema, `v`, fixture 모두 그대로다.

## 컨벤션 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

없다. 서빙 범위, sandbox iframe, GitHub 토큰, git 명령에 닿지 않는다.

## PoC 의존

없다.

## postmortem에서 가져온 함정

- **2026-11-17 'The same conversation read as finished in its row while Delete said the agent was working'**: 행 상태와 Delete가 서로 다른 working 신호를 읽어 어긋났다. 프로젝트 대화 행도 `conversationLine`과 `deleteAvailability`를 그대로 써서 같은 신호를 읽는다. 테스트에 `{ phase: "ended", working: true }`를 넣는다.
- **2026-11-23 'Send now came back on a flushed queue's rows'**: 목록 읽기와 이벤트가 따로 도착하는 사이의 상태를 확인하지 않았다. current 표시는 목록 읽기가 아니라 `OverviewRun`의 현재 대화를 따르므로, 대화를 고른 직후 목록 읽기 전에도 current가 맞는지 테스트한다.
- **POSTMORTEM 2026-11-17(목록 포커스 이동)**: 창이 뒤에 있는 동안 행이 사라지면 활성화될 때 포커스를 다시 넘긴다. 프로젝트 대화 행도 같은 `RowFocusMemory`와 `useActivationFocus` 경로를 탄다.
- **POSTMORTEM 2026-10-26(start·send 응답과 선택)**: start나 send 응답이 그 뒤에 한 선택을 덮어쓰지 않는다. 행으로 고르는 것도 `OverviewRun.select`를 거치므로 같은 revision 보호를 받는다.

## 참고한 디자인 프리셋

- `shape`: 기존 화면을 확장하는 경우라 시각 체계는 그대로 물려받고, 새 행의 목적·상태·상호작용만 정한다.
