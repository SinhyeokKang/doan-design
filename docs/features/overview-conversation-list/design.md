# Overview 대화 목록 — design

이 feature는 이미 develop에 있는 Overview 오른쪽 패널을 다시 디자인하는 standalone redesign이다(AGENTS.md 'Workflow' `/design-draft`·`/design-sync` 예외). 새 시안 파일 `.doan/canvases/overview-conversation-list.html`을 그리고, 기존 시안(`doan-project.html`, `canvas-concurrent-conversations.html` 등)은 고치지 않는다. 이 feature의 브랜치가 머지될 때까지는 새 시안이 이 패널의 기준이다.

## 결정

- **목록 이름**: "Conversations". 다른 문구는 아래로 시안에 그렸고, 사람이 시안을 확정하면 함께 확정된다.

  | 위치 | 지금 | 시안 |
  |---|---|---|
  | 패널 제목과 region 라벨 (`RightPanel.tsx`) | Canvas conversations | Conversations |
  | 크기 조절 핸들 (`App.tsx`) | Resize canvas conversations | Resize conversations |
  | 빈 목록 (`CanvasConversationList.tsx`) | No canvas conversations yet. / When a conversation draws or edits a canvas, the canvas shows here. | No conversations yet. / Conversations you start in the Overview or on a canvas show here. |
  | 로딩 (`CanvasConversationList.tsx`) | Loading canvas conversations | Loading conversations |

- **행 순서**: 종류를 나누지 않는 한 목록이다. 최근 활동이 앞에 오고, 같은 시각일 때는 아래 순서를 따른다.
  - 프로젝트 대화끼리는 대화 ID순이다. Conversation menu의 `byActivity`와 같아서 목록과 메뉴의 상대 순서가 같다.
  - 프로젝트 대화는 캔버스 대화보다 앞이다.
  - 캔버스 대화끼리는 지금처럼 캔버스 경로순이다.
  - 읽을 수 없어 `lastActivityAt`이 빈 대화는 맨 끝이다.
- **순서 고정**: 사이드바의 'Viewed canvas's conversations' 규칙(PRODUCT §5 item 1)과 같다. 포인터나 키보드 포커스가 목록 안에 있는 동안 순서를 고정하고, 새 행은 끝에 붙인다. 둘 다 목록을 떠나면 한 번 다시 정렬한다. 상태 표시는 그동안에도 바뀐다.
- **프로젝트 대화 행 모양**:
  - 높이와 정렬은 캔버스 행과 같다.
  - 썸네일 자리(72×48)에는 inset 채움 위에 대화 아이콘을 두고(시안: lucide `message-square`, `--text-metadata`) `aria-hidden`으로 숨긴다. `Thumb`의 "Preview unavailable" 문구를 쓰지 않는다.
  - 첫 줄은 캔버스 행과 같다(provider 로고, 제목, 상태 표시, 시간·Delete).
  - 캡션 줄에는 캔버스 이름 대신 "Overview"를 쓴다. 스크린리더도 이 캡션으로 두 종류를 구분한다.
  - 그 아래 미리보기 두 줄이 온다.
  - 썸네일 캡처는 요청하지 않는다.
  - 읽을 수 없는 프로젝트 대화는 제목(없으면 "Conversation"), 미리보기 "Can’t read this conversation", 시간 없음으로 나온다(`conversationLine`의 기존 결과). 누르면 가운데 열에 읽기 실패가 표시된다.
- **프로젝트 대화 행 클릭**: 페이지를 옮기지 않고 가운데 열을 그 대화로 바꾼다. Conversation menu에서 고를 때처럼 Back/Forward 방문은 추가되지 않는다.
  - 응답을 기다리는 대화는 토스트의 Open과 같은 경로(`OverviewRun.request`에 permission scroll)로 열고, 가장 최근의 미응답 요청의 첫 선택지에 포커스를 준다. PRODUCT §5 item 2 'Opening'의 캔버스 행 규칙과 같다.
  - 그 밖에는 `OverviewRun.select`로 열고 composer에 포커스를 준다. 포커스는 `focusField`·`newConversation`과 같은 microtask 지연 경로를 쓴다.
  - 이미 보이는 대화의 행을 누르면 대화를 바꾸지 않고 포커스만 위 규칙대로 옮긴다.
  - 두 경로 모두 intent를 옮기므로 fresh start의 선택으로 친다(PRODUCT §5 item 3 'Which conversation shows').
- **current 표시**: 가운데 열에 보이는 프로젝트 대화의 행에만 붙는다.
  - 모양은 Overview 헤더 Conversation menu의 현재 항목, 사이드바의 현재 캔버스 행과 같은 10% pressed 채움(`--affordance-backdrop-pressed`)이다(docs/design/project.md 'Conversation menu', docs/design/shell.md 'Viewed canvas's conversation list'의 viewed canvas row).
  - current 행 옆 구분선은 숨긴다. `aria-current="true"`를 붙인다.
  - hover, 키보드 포커스, Delete가 보일 때 current 행이 어떻게 보일지는 시안에서 정한다.
  - current는 목록 읽기가 아니라 `OverviewRun`이 보여주는 대화를 따른다. App이 Overview의 현재 대화 ID를 `RightPanel`을 거쳐 prop으로 넘기고, 행이 `kind === "project"`이고 키가 같을 때 current다.
  - 새 대화 상태, 아직 목록에 없는 대화, 캔버스 행에는 current가 없다.
- **키보드**:
  - roving tabindex는 지금과 같다. Tab으로 들어올 때 마지막으로 포커스한 행, 없으면 current 행, 그것도 없으면 첫 행이 Tab 정지점이다.
  - ↑/↓, Home, End는 종류와 상관없이 행 사이를 움직인다. Tab과 Shift-Tab은 행과 그 Delete 사이를 움직인다.
  - 화살표 이동은 대화를 바꾸지 않는다.
- **헤더 Conversation menu**: 지금 그대로 둔다. 머리글 "Conversations in <project>"도 그대로다. 메뉴와 목록 어디서 고르든 같은 `OverviewRun`을 거치므로 current와 메뉴의 현재 항목이 함께 바뀐다.
- **보이는 대화를 목록에서 Delete**:
  - 가운데 열은 새 대화 상태가 된다(`OverviewRun.deleted`, 지금과 같다).
  - 포커스는 목록 규칙(다음 행, 없으면 이전 행, 그것도 없으면 패널 제목)을 따른다. 사이드바 선례("focus stays in the list it was pressed in")와 같다.
  - 그래서 PRODUCT §5 item 3 Delete의 "If the Overview showed it … focus in its composer" 문장을 헤더 메뉴에서 지울 때로 좁혀야 한다(tasks 문서 승격).
- **상태별 모습**:
  - 보이는 중 승격되면 같은 키의 행이 같은 자리에서 캔버스 행으로 바뀌고 current가 풀린다. 키가 같으므로 키보드 포커스는 유지된다.
  - 막 시작한 대화(`OverviewRun.started`)는 목록 읽기 전까지 행이 없어서 current도 없다. 루트의 첫 대화라면 그동안 빈 목록이 실행 중인 스레드 옆에 보인다. 이 상태는 받아들인다.
  - 캔버스 행을 눌러 Overview를 떠났다가 Back으로 돌아오면 `OverviewRun`이 보여주던 대화를 그대로 보여주고, current도 같은 행에 다시 붙는다.

## 바뀌지 않는 것

- 캔버스 대화 행의 모양, 특수 행(사라진 캔버스, ID 중복, 읽을 수 없는 캔버스), 누르면 캔버스를 여는 동작.
- Overview가 어떤 대화를 보여줄지 고르는 규칙(PRODUCT §5 item 3 'Which conversation shows')과 seen 규칙. 행으로 열면 `setCurrent` → `checkSeen` 경로를 탄다.
- Delete의 가능 여부, 확인 창, main의 재확인.
- 한 루트에서 프로젝트 대화가 하나만 일할 수 있다는 제한(PRODUCT §5 item 1 'Project conversations').
- 내부 이름(`canvasConversationRows`, `CanvasConversationRow`, `CanvasConversationList`, `CanvasConversations`)과 ui-state에 저장되는 패널 폭 키. 키 이름을 바꾸면 저장된 폭이 사라진다.

## 영향받는 구성 요소

- **app (renderer)**만 바뀐다.
  - `canvasConversationRows.ts`
    - 지금은 `c.canvas`가 없는 대화를 건너뛴다(`:46`). 프로젝트 대화 행도 만든다.
    - 행 타입을 종류별 union으로 나눈다: `{ kind: "canvas"; canvas; row; problem; openable } | { kind: "project" }`. 공통 필드는 키, 제목, heading, 상태 줄, deletable이다. 이렇게 해야 프로젝트 행을 처리하지 않은 곳(예: `App.tsx`의 `if (item.row)`)이 컴파일 오류로 드러난다.
    - 정렬은 위 '행 순서'를 따른다.
  - `CanvasConversationList.tsx`
    - 프로젝트 대화 행과 아이콘 타일, current 표시와 `aria-current`, Tab 정지점 규칙, 순서 고정, 빈 목록·로딩 문구.
    - 썸네일, 가시성 관찰(`observedRows`), `.cv-row[data-path]`는 `CanvasRow`가 없는 프로젝트 행을 지금처럼 건너뛴다.
  - `RightPanel.tsx`: 패널 제목과 region 라벨. current 대화 ID prop을 목록으로 넘긴다.
  - `App.tsx`
    - 행 열기(`open`)에서 프로젝트 행이면 위 '프로젝트 대화 행 클릭'대로 `select` 또는 `request`를 부르고, 캔버스 행은 지금처럼 캔버스를 연다.
    - current 대화 ID를 `RightPanel`로 넘긴다.
    - 크기 조절 핸들 라벨, `:2562` 주석.
    - Delete 후 포커스는 지금 `from: "canvasList"` 분기(`:1617`)가 먼저 처리하므로 그대로 둔다. 테스트로만 고정한다.
  - `canvasConversationRows.ts:8`, `CanvasConversationList.tsx:17`의 머리 주석.
  - `styles.css`, 그리고 `docs/design/project.md`의 'Right rows' 측정값(`/design-sync`가 기록).
- **CLI, 스킬, 포맷**: 바뀌지 않는다. App은 같은 `run.listState(overview.path)`를 Conversation menu(`projectConversationMenu`)와 `canvasConversationRows`에 넘기므로, 목록에는 이미 프로젝트 대화가 들어 있다.
- **`/agent-eval`**: 건너뛴다. 가이드, CLI 출력, `doan check` 규칙, 스킬 스텁 중 어느 것도 바뀌지 않는다(AGENTS.md 'Workflow').

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `canvasConversationRows`가 프로젝트 대화까지 담는 union 행 목록을 만든다. 확인할 점:
  - 프로젝트 행의 종류, 'Overview' 캡션에 쓸 필드, 썸네일 없음
  - 정렬과 동점 처리(프로젝트끼리 ID순, 프로젝트가 캔버스보다 앞, 캔버스끼리 경로순, 시간 없는 행은 맨 끝)
  - 읽을 수 없는 프로젝트 대화의 행
  - 상태 표시(`conversationLine`)와 Delete 가능 여부(`deleteAvailability`)는 그대로 쓴다. 응답 필요, 작업 중(promotion 판정 대기와 곧 나갈 큐 포함), 사용량 한도 대기, 안 본 끝, `{ phase: "ended", working: true }`를 확인한다.
- 순서 고정은 목록 컴포넌트 안의 작은 순수 함수로 뺀다. 사이드바에 같은 기능의 함수가 있으면 그것을 재사용한다(구현 전에 찾아본다).
- current 판정과 열기 분기는 따로 함수로 빼지 않는다. 종류 판별 한 줄과 두 갈래 분기라서, 컴포넌트·App 테스트로 확인한다.

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
- **2026-11-23 'Send now came back on a flushed queue's rows for about 10 ms as the next turn started'**: 이벤트와 목록 읽기가 따로 도착하는 사이의 상태를 확인하지 않았다. current는 `OverviewRun`을 따르므로, 둘이 실제로 어긋나는 두 순간을 테스트한다.
  - 새 대화 상태에서 시작한 직후, 목록에 아직 없을 때는 current가 없고, 첫 목록 읽기에서 current가 된다.
  - 승격으로 같은 키가 프로젝트 행에서 캔버스 행으로 바뀔 때, 캔버스 행은 current가 되지 않는다(`sync`가 렌더보다 먼저 도는 경우 포함).
- **2026-11-17 'Window activation put focus on Hide sidebar after the sidebar had recovered it in the background'**(재발 기록에 캔버스 대화 목록이 나온다): 창이 뒤에 있는 동안 행이 사라지면 활성화될 때 포커스를 다시 넘긴다. 프로젝트 대화 행도 같은 `RowFocusMemory`와 `useActivationFocus` 경로를 탄다.
- **2026-10-25 'Delayed startup restoration replaced newer navigation'**(`overviewRun.ts:287`이 인용): 나중에 도착한 목록 읽기가 사람의 선택을 덮어쓰지 않는다. 행으로 고르는 것도 `OverviewRun.select`나 `request`를 거치므로 revision과 intent 보호를 그대로 받는다.

## 참고한 디자인 프리셋

- `shape`: 기존 화면을 확장하는 경우라 시각 체계는 그대로 물려받고, 새 행의 목적·상태·상호작용만 정한다.
