# 캔버스 인스펙터 — design

## 영향 받는 부분

- **앱(Electron + TS)**: main(CDP 수집기 복원, `windowDebugger.ts`에 세션 API, IPC 채널 하나), preload(API 하나), renderer(셸 그리드, 헤더 버튼, 인스펙터 패널, ui-state, 프로토타입 창의 대화 버튼).
- **CLI(Go)**, **스킬**, `doan check`, 캔버스 규약: 바뀌지 않는다. 가이드·CLI 출력·check 규칙·스킬 stub이 바뀌지 않으므로 `/agent-eval` 대상이 아니다.
- **형식**: 공유 JSON Schema(ARCHITECTURE §11)는 바뀌지 않는다. 기기 로컬 ui-state(`app/src/restore/uiState.ts`, TS만 읽음)에 필드 하나가 늘어난다.

## 레이아웃 (확정 초안)

초안: `.doan/canvases/canvas-inspector-layout.html`, 프레임 `inspector-column`(`b781e5681`). 출시된 캔버스 화면 DOM과 CSS를 그대로 뜬 위에 인스펙터 열만 더했다. 구현은 이 초안의 셸 부분을 따른다.

- **그리드**: `.workspace.app-shell`에 네 번째 열을 더한다. `var(--doan-sidebar-width) minmax(0, 1fr) var(--doan-inspector-width) var(--doan-right-width)`. 열이 넷이 되면서 같이 고칠 규칙(`app/src/renderer/styles.css`):
  - 인스펙터 열 `grid-column: 3`, 대화 열(`.doan-conv-column`)과 Overview의 `.right-stack`은 `grid-column: 4`로 고정한다. 지금은 자동 배치이고, 사이드바 숨김 규칙(:1680)만 3으로 옮긴다.
  - 사이드바 숨김 그리드(:1675)를 네 열로 바꾼다.
  - `.workspace > .problem-overlay { grid-column: 2 / 4 }`(:1909)를 `2 / 5`로, `.doan-overview-handle { grid-column: 3 / 4 }`(:1668)를 `4 / 5`로 옮긴다.
  - Overview에서는 `--doan-inspector-width`를 0으로 둔다(인스펙터는 캔버스 화면에만 있다).
- **접힘**: 인스펙터 열은 대화 열과 같은 방식으로 접힌다. 폭 0, `data-collapsed`, `inert`, 닫힌 뒤 `visibility: hidden`. 접고 펼 때만 `data-panel-motion`으로 움직이고, 드래그 중에는 움직이지 않는다.
- **모서리**: 흰 패널의 오른쪽 모서리는 마지막으로 보이는 열이 가진다. 대화가 열려 있으면 대화, 대화만 접히면 인스펙터, 둘 다 접히면 캔버스 패널(`data-panel="collapsed"`는 둘 다 접혔을 때만 붙는다).
- **폭** (`app/src/renderer/rightPanelSize.ts`를 확장한다. 새 함수를 따로 만들지 않는다):
  - `panelBounds(windowWidth, shellWidth, reserved = 0)`: 지금 규칙에서 보드 한계를 `shellWidth − reserved − 360`으로 계산한다. Overview는 `reserved` 없이 지금처럼 쓴다.
  - **계산 순서**: 대화를 먼저 정한다. 대화 폭 = `panelWidth(저장값, panelBounds(창, 셸), 기본값)`. 그다음 인스펙터: 남는 폭 `셸 − 대화 − 360`이 280 미만이면 인스펙터는 보이지 않는다(`inspectorFits = false`). 280 이상이면 인스펙터 폭 = `panelWidth(저장값, {min: 280, max: 남는 폭}, 280)`. 인스펙터가 보이면 대화 최대를 다시 `panelBounds(창, 셸, 인스펙터 폭)`으로 잡아 드래그 한계로 쓴다.
  - 대화가 접혀 있으면 대화 폭은 0으로 계산한다.
  - 저장된 폭이 최대보다 크면 최대로 보이고, 저장 값은 그대로 둔다(`panelWidth`의 지금 규칙).
- **핸들**: `.doan-panel-handle`을 인스펙터 열 시작 가장자리에 둔다. 라벨 "Resize inspector", `aria-valuemin`·`aria-valuemax`·`aria-valuenow`, ←/→로 16씩(`NUDGE`), hover·drag·focus 표시는 출시된 핸들과 같다.
- **헤더 버튼**: 인스펙터나 대화가 접혀 있으면 Reload 뒤에 구분선(`.doan-canvas-head-sep`) 하나를 두고, 접힌 것만 Show inspector, Show conversation 순서로 나온다.
  - 버튼마다 `data-panel-target="inspector" | "conversation"`을 단다. 접고 펼 때 포커스를 돌려주는 셀렉터(`App.tsx:2309`의 `.doan-canvas-head .doan-panel-show`)를 이 속성으로 나누고, `panelFocus`를 패널마다 둔다. 접으면 그 패널의 Show 버튼으로, 펴면 그 패널의 Hide 버튼으로 포커스가 간다.
  - Show inspector: lucide `sliders-horizontal`, `aria-controls`는 인스펙터 패널. 좁은 창이라 보일 수 없으면 `aria-disabled`이고 툴팁이 이유를 말한다(문구는 초안에서).
  - Show conversation: lucide `message-square`(`CanvasHeader.tsx`의 `PanelRightOpen`을 바꾼다).
- **안 읽음 배지**: 캔버스 헤더의 Show conversation과 프로토타입 창의 대화 버튼(`.pw-conv`) 둘 다 `data-badge="unseen"`이 말풍선(`.badge-bubble`) 대신 답 대기와 같은 8px 액센트 점을 그린다. 툴팁이 지금 고정 "Show conversation"이므로(`CanvasHeader.tsx:42` `IconTip`) 배지 상태의 aria-label을 툴팁 문구로도 쓴다. 프로토타입 창 아이콘도 `message-square`로 바꾼다. 사이드바 슬롯과 Show sidebar는 바꾸지 않는다.

## 인스펙터 패널

패널 내부 화면은 `/design-draft`로 그린다. 여기서는 구조, 상태, 상호작용을 정한다.

- **head** (56px, 대화 head와 같은 높이): 제목 "Inspector", 보기 전환(Tokens / Values), Hide inspector(`panel-right-close`).
- **보기 전환**: 두 버튼에 `aria-pressed`를 단 세그먼트. 도구 줄처럼 하나의 Tab 정지점이고 ←/→로 옮긴다. 보기를 바꿔도 포커스한 행과 스크롤을 유지하고, 다시 요청하지 않는다(한 응답에 토큰과 값이 다 있다).
- **상태** (패널 쪽):
  - 선택 없음: 빈 상태 문구(초안: "Select a frame or element on the canvas to see its properties.", 대화 패널의 `.doan-conv-empty` 모양). 보드가 없을 때(캔버스 로드 중, 첫 레이아웃 실패, 목록에 없거나 ID가 겹치는 캔버스)도 선택이 없으므로 같은 빈 상태다.
  - 읽는 중: 선택이 바뀌었으면 이전 행을 지우고 로딩 표시를 보인다. 짧은 읽기에서 깜빡이지 않도록 늦게 보인다(지연 값은 초안에서 정한다). 같은 선택을 다시 읽으면(reload 뒤 다시 찾음, 같은 캔버스 ID로 이동, Retry) 이전 행을 둔 채 응답이 오면 그 자리에서 바꾸고, 스크롤과 포커스를 유지한다.
  - 실패: 실패 문구와 Retry. CDP가 붙지 않았거나 시간을 넘긴 경우에만 Retry를 둔다.
  - 값: 그룹 머리글(Layout, Box, Typography, Colors, Radius, Shadow, Attributes)과 행.
  - 선택 대상 이름: 선택한 프레임·요소 이름을 패널 위쪽에 보인다(자리는 초안에서 정한다).
- **상태** (보드 쪽 사건):
  - reload가 선택을 다시 찾는 중: 이전 행을 유지한다.
  - 선택이 사라짐(PRODUCT §5 item 4의 토스트 "The selection is no longer in the canvas."): 빈 상태로 바뀐다. 인스펙터는 토스트를 따로 띄우지 않는다.
  - 선택한 노드를 CDP가 찾지 못함: 실패가 아니라 선택 소실과 같게 다룬다(빈 상태). Retry로 고쳐지지 않기 때문이다.
  - 응답의 캔버스가 지금 보이는 캔버스와 다름(전환 중 경쟁): 실패를 보이지 않고, 새 문서의 선택이 정해지면 다시 요청한다.
  - 읽는 중에 Hide: 응답을 버린다. 다시 열면 새로 요청한다.
- **행**:
  - 행마다 안정된 키 `group:property`(예: `box:padding`)를 둔다. 포커스·스크롤 유지와 늦은 응답 비교에 쓰고, 테스트로 고정한다.
  - 토큰 보기: 토큰이 있으면 토큰 이름(체인이 있으면 툴팁으로 `--a → --b → 값`), 없으면 출처 라벨(Hardcoded / Unknown source / Default)과 값. 출처 라벨마다 툴팁 한 줄로 뜻을 말한다(문구는 초안에서; 예전 `UNKNOWN_SOURCE_TIP` "Doan can’t tell where this value comes from"을 출발점으로). 상속된 값은 어디서 상속했는지 표시한다(`inheritedFrom`).
  - 값 보기: 표시용으로 가공한 computed 값(색은 hex, 상하좌우가 같으면 하나로 접음, 긴 값은 자름). 색은 견본 칩을 함께 보인다. 견본 색은 예전 `swatchColor`처럼 hex·transparent만 받는다.
  - 복사: 토큰 보기에서 토큰이 있으면 `--name`, 없으면 값. 값 보기에서는 값. 복사는 `app/src/renderer/copyText.ts`로 한다(main이 권한을 거부해 async Clipboard API를 쓸 수 없다, ARCHITECTURE §7). 누른 행 안에 체크와 "Copied"가 잠깐 보이고 sr-only `role="status"`로도 알린다(앱의 기존 복사 피드백, `ProjectSettingsPage.tsx`·`SettingsAbout.tsx`·`ConversationThread.tsx`). 실패하면 그 행에 실패 문구를 보인다(문구는 초안에서).
- **키보드**:
  - Tab 순서: 보드 영역 → 인스펙터(Hide inspector, 보기 전환, 행 목록) → 대화.
  - 행 목록은 Tab 정지점 하나다(roving tabindex). ↑/↓로 행을 옮기고 Home/End로 처음·끝으로 간다. Enter·Space·⌘C로 복사한다.
  - 포커스가 인스펙터 안에 있어도 Esc는 선택을 한 단계 뒤로 돌린다(PRODUCT §5 item 4). 인스펙터에서 Esc가 하는 다른 일은 없다.

## 데이터 경로

- **수집기 복원**: 지운 `app/src/main/inspect.ts`(순수 리졸버, 이름 `inspectRows`)와 `inspect.test.ts`·`inspect.fixture.json`을 `67c222f71~1`에서 되살린다. `inspector.ts`의 CDP 부분(직렬 큐, 2초 예산, fail closed, `inheritedFrom`, 재attach)을 되살리되, 세션은 `windowDebugger.ts`의 새 API로 고른다. 예전 `canvasSession()`(토큰 경로에 있는 가장 최근 iframe 세션 휴리스틱)과 세션 추적 테스트는 되살리지 않는다(세션 소유권 테스트는 이미 `windowDebugger.test.ts`에 있다). 타임아웃이 CDP 명령을 취소하지 않는다는 예전 한계는 그대로 남고, ARCHITECTURE에 다시 적는다.
- **`windowDebugger.ts` API 추가**: `sessionOf(frameId): string | null` — `frameOwners`에서 그 프레임의 현재 소유 세션을 돌려주고, 소유자가 바뀌었거나 분리된 세션이면 null이다. 수집기는 보이는 캔버스의 프레임을 read-state와 같은 근거(`app/src/main/seenProof.ts` `shownDocument`)로 찾고, 그 프레임의 `sessionOf`로만 명령을 보낸다. 그래서 "보이는 문서가 요청한 캔버스인가"와 "어느 세션에 보내나"가 visible proof와 한 근거로 정해진다.
- **그룹**: `InspectGroup`을 `"layout" | "box" | "typography" | "colors" | "radius" | "shadow"`로 바꾼다. 예전 `effects`의 Radius·Shadow 행이 각 그룹으로 간다.
- **Layout 행**: `display`, `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `gap`은 Box에 그대로 둔다. Layout 행은 `display`가 flex·inline-flex·grid·inline-grid일 때만 방향·wrap·정렬 행을 낸다(`display: block`에서 `flex-direction: row` 같은 무의미한 행을 내지 않는다). `grid-template-columns`도 출처를 판정한다(다른 행과 같은 리졸버 경로).
- **Attributes 행**: 이미 부르는 `DOM.getDocument {depth: -1}`의 노드 `attributes`에서 `data-doan-*`만 골라 값 행(출처 없음)으로 더한다. 값은 `cap`으로 자르고, 최대 32개까지 낸다. 행이 없으면 그룹을 보이지 않는다. 다른 그룹은 `inspectRows`가 행을 항상 내므로 비지 않는다.
- **IPC**: `inspect:get`(main 창 전용, `senderAllowed.ts`에 다시 넣는다). 요청은 `{selector, canvas: {root, path}, seq}`. 보이는 문서가 그 캔버스가 아니면 main은 `{ok: false, reason: "not-shown"}`으로 답한다. 실패 이유는 `not-shown`(전환 경쟁), `not-found`(노드 없음), `unavailable`(CDP 미연결·시간 초과) 셋이다.
- **요청 시점**: 인스펙터가 보이고(열림 + 좁은 창 아님) 선택이 있을 때만 요청한다. 선택 기준은 렌더러가 받아들인 선택(main이 보낸 선택 갱신을 CanvasController가 적용한 것)이고, 보냈지만 아직 받아들이지 않은 선택이 아니다(postmortem 2026-10-23 comments-ui Recurrence). 선택이 바뀔 때, reload 뒤 다시 찾았을 때, 인스펙터가 보이게 될 때, Retry 때 한 번씩 요청한다.
- **늦은 응답**: 렌더러는 마지막 요청의 seq, 선택 키, 캔버스가 모두 맞는 응답만 받아들인다.

## 상태 저장

- ui-state에 `inspector?: { open: boolean; width?: number; view?: "tokens" | "values" }`를 더한다. 파싱은 `parseRightPanel`과 같은 방식이지만 **open 기본값은 false**다(`parseRightPanel`은 `open ?? true`). 폭 상한은 같은 `RIGHT_PANEL_MAX_SAVED_WIDTH`. 알 수 없는 `view`는 버리고 토큰 보기로 둔다.

## 순수 함수로 뺄 것 (`/tdd` 대상)

| 함수 | 파일 | 내용 |
|---|---|---|
| `inspectRows` | `app/src/main/inspect.ts`(복원) | 기존 테스트 + 그룹 6개, Layout 조건, `grid-template-columns`, Attributes 행·상한 |
| `panelBounds`(확장), `canvasPanelsLayout` | `app/src/renderer/rightPanelSize.ts` | `reserved` 인자, 대화 먼저 → 인스펙터 순서, `inspectorFits`, 960·1280·1470·1512 창, 사이드바 숨김, 저장 폭이 최대보다 큰 경우 |
| `parseInspectorState` | `app/src/restore/uiState.ts` | 빠짐, open 기본 false, 잘못된 open 타입, 음수·NaN·상한 초과 폭, 알 수 없는 view |
| `rowDisplay`, `rowCopyText`, `rowKey` | `app/src/renderer/inspectorRows.ts`(예전 `renderer/inspector.ts`의 `sourceNotes`·`tokenTitle`·`swatchColor`를 흡수) | 보기별 표시·라벨·툴팁·복사 텍스트, 견본 가드, 키 |
| `inspectRequestFor` | 같은 파일 | 보임·선택·이전 요청을 받아 요청할지와 같은 선택 재요청인지 |
| `acceptInspect` | 같은 파일 | seq·선택 키·캔버스로 늦은 응답 거부, 실패 이유별 다음 상태 |
| `headerShowButtons` | `app/src/renderer/CanvasHeader.tsx` 옆 순수 모듈 | 구분선·Show 버튼 순서·비활성 |
| `parseInspectRequest` | `app/src/main/inspector.ts` | `{selector, canvas, seq}` 검증, 셀렉터 캡 |

## 결정 영향

- **PRODUCT** (마지막 task에서 고친다):
  - §3 In scope 1(Show)에 인스펙터.
  - §5 item 4의 "There is no Inspector" 줄을 인스펙터 규칙으로.
  - §5 item 2 'Canvas header'(Show conversation 아이콘과 Show inspector), 'Conversation panel'(폭 규칙, 좁은 창), 'Prototype window'(대화 버튼 아이콘, 안 읽음 점).
  - §5 item 0 'Text edit menu'(인스펙터 행 복사).
- **ARCHITECTURE**:
  - §3 'Selection'에 수집기(CDP, `windowDebugger.ts`의 `sessionOf`), `inspect:get` 계약, 늦은 응답 규칙.
  - 'Window debugger' 문단(:148)에 수집기 역할.
  - 예전 'Resolver limits'와 'CDP collector'(직렬 큐, 2초 예산, 타임아웃이 명령을 취소하지 않음)를 되살린다.
  - §3 rendering의 주입 스크립트 문단에 "inspector style rows는 보내지 않는다"를 다시 적는다.
- **`docs/design/canvas.md` 'Panel width'**: 960 측정값과 인스펙터 폭을 새로 잰다(tasks 6).
- **샌드박스·서빙 범위**: 바뀌지 않는다. CDP는 main의 창 디버거로 읽고, 캔버스 iframe에는 아무것도 더 주입하지 않는다.
- **PoC 의존**: 없다. CDP 수집은 예전 PoC와 출시 코드로 확인됐고, 세션 소유권은 지금의 `windowDebugger.ts`가 지킨다. 복원한 수집기가 `sessionOf`와 맞물리는지는 실제 앱에서 확인한다(tasks 6).

## 관련 postmortem

- **2026-10-25 — Runtime checks could finish before the evidence or cleanup**, Recurrence(UX C): "the new Inspector test initially waited for main's release plus 100ms, which did not prove the stale response was consumed." → 늦은 응답 테스트는 실제 컨트롤러 콜백이 끝난 것을 확인한 뒤 값을 단언한다.
- **2026-10-23 — Response eviction and OOPIF swaps lost a live comment document**, Recurrence(inspector session ownership): "a delayed `Target.detachedFromTarget` for the former OOPIF session retired the frame already committed by its replacement." → 세션 소유권은 `windowDebugger.ts`에만 두고, 수집기는 `sessionOf`가 돌려준 현재 소유 세션으로만 명령을 보낸다.
- **2026-10-23 comments-ui Recurrence**: 보낸 선택 floor를 수락의 증거로 쓰다 생긴 버그 → 요청 시점은 받아들인 선택 기준.

## 디자인 프리셋

`doan design-skill --json`으로 목록을 보고 `/design-draft` 때 `harden`(빈·실패 상태)과 `clarify`(문구)를 읽는다.
