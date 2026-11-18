# 캔버스 인스펙터 — design

## 영향 받는 부분

- **앱(Electron + TS)**: main(CDP 수집기 복원, IPC 채널 하나), preload(API 하나), renderer(셸 그리드, 헤더 버튼, 인스펙터 패널, ui-state).
- **CLI(Go)**, **스킬**, `doan check`, 캔버스 규약: 바뀌지 않는다.
- **형식**: 공유 JSON Schema(ARCHITECTURE §11)는 바뀌지 않는다. 기기 로컬 ui-state(`app/src/restore/uiState.ts`, TS만 읽음)에 필드 하나가 늘어난다.

## 레이아웃 (확정 초안)

초안: `.doan/canvases/canvas-inspector-layout.html`, 프레임 `inspector-column`(`b781e5681`). 출시된 캔버스 화면 DOM과 CSS를 그대로 뜬 위에 인스펙터 열만 더했다. 구현은 이 초안의 셸 부분을 따른다.

- **그리드**: `.workspace.app-shell`에 네 번째 열을 더한다. `var(--doan-sidebar-width) minmax(0, 1fr) var(--doan-inspector-width) var(--doan-right-width)`. 사이드바가 숨겨지면 첫 열만 0이 된다. 인스펙터 열은 `grid-column: 3`, 대화 열은 `grid-column: 4`로 고정한다(지금 사이드바 숨김 규칙이 대화 열을 3으로 옮기므로 함께 바꾼다).
- **접힘**: 인스펙터 열은 대화 열과 같은 방식으로 접힌다. 폭 0, `data-collapsed`, `inert`, 닫힌 뒤 `visibility: hidden`. 접고 펼 때만 `data-panel-motion`으로 움직이고, 드래그 중에는 움직이지 않는다.
- **모서리**: 흰 패널의 오른쪽 모서리는 마지막으로 보이는 열이 가진다. 대화가 열려 있으면 대화, 대화만 접히면 인스펙터, 둘 다 접히면 캔버스 패널(`data-panel="collapsed"`는 둘 다 접혔을 때만 붙는다).
- **폭**:
  - 인스펙터: 최소 280, 기본 280, 최대 `max(280, 셸 열 폭 − 대화 폭 − 360)`. 더블클릭은 280으로 돌린다.
  - 대화: 지금 규칙(최소 280, 기본 `max(320px, 28dvw)`, 최대 `min(50dvw, 보드에 360을 남기는 폭)`)에서 "보드에 360을 남기는 폭"을 열린 인스펙터 폭을 뺀 값으로 계산한다.
  - 저장된 폭이 최대보다 크면 최대로 보이고, 저장 값은 그대로 둔다(대화 패널과 같은 규칙).
- **핸들**: `.doan-panel-handle`을 인스펙터 열 시작 가장자리에 둔다. 라벨 "Resize inspector", hover·drag·focus 표시는 출시된 핸들과 같다.
- **헤더 버튼**: 인스펙터나 대화가 접혀 있으면 Reload 뒤에 구분선(`.doan-canvas-head-sep`) 하나를 두고, 접힌 것만 Show inspector, Show conversation 순서로 나온다.
  - Show inspector: lucide `sliders-horizontal`, `aria-controls`는 인스펙터 패널.
  - Show conversation: lucide `message-square`로 바꾼다(`CanvasHeader.tsx`의 `PanelRightOpen`). 배지 규칙은 아래.
  - 접으면 포커스가 Show 버튼으로, 펴면 Hide 버튼으로 간다(대화 패널의 `panelFocus` 규칙).
- **안 읽음 배지**: `data-badge="unseen"`이 말풍선 아이콘(`.badge-bubble`) 대신 답 대기와 같은 8px 액센트 점을 그린다. aria-label은 지금 그대로("Show conversation, needs your answer" / 안 읽음 문구)다. 스피너 배지는 바뀌지 않는다. 프로토타입 창의 대화 버튼(`.pw-conv`, 패널이 하나뿐)은 바꾸지 않는다.

## 인스펙터 패널

패널 내부 화면은 `/design-draft`로 그린다. 여기서는 구조와 상태만 정한다.

- **head** (56px, 대화 head와 같은 높이): 제목 "Inspector", 보기 전환(Tokens / Values), Hide inspector(`panel-right-close`).
- **상태**:
  - 선택 없음: 빈 상태 문구(초안: "Select a frame or element on the canvas to see its properties.", 대화 패널의 `.doan-conv-empty` 모양).
  - 읽는 중: 이전 행을 지우고 로딩 표시. 짧은 읽기에서 깜빡이지 않도록 늦게 보인다(지연 값은 초안에서 정한다).
  - 실패: 실패 문구와 Retry. CDP가 붙지 않았거나, 선택한 노드를 찾지 못했거나, 시간을 넘긴 경우.
  - 값: 그룹 머리글(Layout, Box, Typography, Colors, Radius, Shadow, Attributes)과 행. 값이 없는 그룹은 보이지 않는다.
  - 선택 대상 이름: head 아래나 첫 줄에 선택한 프레임·요소 이름을 보인다(초안에서 정한다).
- **행**:
  - 토큰 보기: 토큰이 있으면 토큰 이름(체인이 있으면 툴팁으로 `--a → --b → 값`), 없으면 출처 라벨(Hardcoded / Unknown / Default)과 값. 상속된 값은 어디서 상속했는지 표시한다(`inheritedFrom`).
  - 값 보기: computed 값. 색은 견본 칩을 함께 보인다.
  - 누르면 지금 보기의 표시 텍스트를 복사하고 토스트 "Copied"를 띄운다(기존 토스트). 키보드로도 누를 수 있다.

## 데이터 경로

- **수집기 복원**: 지운 `app/src/main/inspect.ts`(순수 리졸버)와 `inspect.test.ts`·`inspect.fixture.json`을 `67c222f71~1`에서 되살린다. `inspector.ts`의 CDP 부분은 지금의 `windowDebugger.ts`(세션 소유권, 문서 바인딩)를 쓰도록 다시 붙인다. 세션 수명 관리는 `windowDebugger.ts`에 그대로 두고 수집기는 그 위에서 명령만 보낸다.
- **Layout 그룹 추가**: 리졸버의 `ROWS`에 `display`, `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `grid-template-columns`(값만)를 더한다. 그룹 `"layout"`을 `InspectGroup`에 더한다.
- **Radius·Shadow 분리**: 예전 `effects` 그룹을 Radius와 Shadow로 나눠 보인다(리졸버 그룹 또는 표시 단계에서 나눈다 — 순수 함수에서 정한다).
- **`data-doan-*` 속성**: CDP `DOM.getAttributes`로 읽어 Attributes 그룹 행(출처 없음, 값만)으로 더한다.
- **IPC**: `inspect:get`(main 창 전용, 기존 sender-frame 가드). 요청은 `{selector, canvas: {root, path}, seq}`로 바꿔 문서 정체성을 함께 보낸다. 지금 보이는 문서가 그 캔버스가 아니면 main은 실패로 답한다(예전 API의 "캔버스 전환과 경쟁하는 요청이 새 문서를 읽을 수 있다" 한계를 막는다).
- **요청 시점**: 인스펙터가 열려 있고 선택이 있을 때만 요청한다. 선택이 바뀌거나, reload 뒤 선택을 다시 찾았거나, 인스펙터가 열릴 때 요청한다. 보기 전환은 다시 요청하지 않는다(한 응답에 토큰과 값이 다 있다).
- **늦은 응답**: 렌더러는 마지막 요청의 seq와 선택 키만 받아들인다. 늦게 온 응답은 버린다.

## 상태 저장

- ui-state에 `inspector?: { open: boolean; width?: number; view?: "tokens" | "values" }`를 더한다. 파싱은 `parseRightPanel`과 같은 규칙(이상한 값은 버림, 폭 상한 `RIGHT_PANEL_MAX_SAVED_WIDTH`). 없으면 닫힘·폭 기본·토큰 보기.

## 순수 함수로 뺄 것 (`/tdd` 대상)

1. `resolveInspect`(복원한 리졸버) — 기존 테스트 + Layout 행, Radius/Shadow 분리, `data-doan-*` 행.
2. `inspectorWidth` / `conversationWidth` — 창 폭, 사이드바 폭과 숨김, 서로의 열림·폭을 받아 최소·기본·최대를 계산한다. 저장 폭이 최대보다 크면 최대로 보인다.
3. `parseInspectorState`(ui-state 파싱) — 빠진 값, 잘못된 타입, 폭 상한.
4. `rowDisplay(row, view)` — 행 하나를 보기별 표시 텍스트·라벨·복사 텍스트로 바꾼다.
5. `acceptInspect(latest, response)` — 늦은 응답 거부(seq, 선택 키, 캔버스).
6. `headerShowButtons(inspectorOpen, conversationOpen)` — 구분선과 Show 버튼 순서.
7. `parseInspectRequest` — IPC 요청 검증(셀렉터 캡, 캔버스 정체성).

## 결정 영향

- **PRODUCT**: §5 item 4의 "There is no Inspector" 줄을 인스펙터 규칙으로 바꾼다. §5 item 2 'Conversation panel'의 폭 규칙과 헤더 버튼 설명, §3 In scope 1(Show)에 인스펙터를 더한다. 마지막 task에서 한다.
- **ARCHITECTURE**: §3 'Selection'에 인스펙터 수집기(CDP, `windowDebugger.ts` 위), `inspect:get` 계약, 늦은 응답 규칙을 적는다. 예전 'Resolver limits' 문단(모델링하지 않는 것)을 되살린다.
- **샌드박스·서빙 범위**: 바뀌지 않는다. CDP는 main의 창 디버거로 읽고, 캔버스 iframe에는 아무것도 더 주입하지 않는다.
- **PoC 의존**: 없다. CDP 수집은 예전 PoC와 출시 코드로 확인됐고, 세션 소유권은 지금의 `windowDebugger.ts`가 지킨다. 다만 복원한 수집기가 `windowDebugger.ts`와 맞물리는지는 실제 앱에서 확인한다(tasks 6).

## 관련 postmortem

- **2026-10-25 — Runtime checks could finish before the evidence or cleanup**, Recurrence(UX C): "the new Inspector test initially waited for main's release plus 100ms, which did not prove the stale response was consumed." → 늦은 응답 테스트는 실제 컨트롤러 콜백이 끝난 것을 확인한 뒤 값을 단언한다.
- **2026-10-23 — Response eviction and OOPIF swaps lost a live comment document**, Recurrence(inspector session ownership): "a delayed `Target.detachedFromTarget` for the former OOPIF session retired the frame already committed by its replacement." → 세션 소유권은 `windowDebugger.ts`에만 두고, 수집기는 현재 소유 세션으로만 명령을 보낸다. 수집기에 별도 세션 추적을 만들지 않는다.

## 디자인 프리셋

`doan design-skill --json`으로 목록을 보고 `/design-draft` 때 `harden`(빈·실패 상태)과 `clarify`(문구)를 읽는다.
