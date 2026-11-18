# 캔버스 인스펙터 — design

## 영향 받는 부분

- **앱(Electron + TS)**: main(CDP 수집기 복원, `windowDebugger.ts`에 세션 API, IPC 채널 하나), preload(API 하나), renderer(셸 그리드, 헤더 버튼, 인스펙터 패널, ui-state, 프로토타입 창의 대화 버튼).
- **CLI(Go)**, **스킬**, `doan check`, 캔버스 규약: 바뀌지 않는다. 가이드·CLI 출력·check 규칙·스킬 stub이 바뀌지 않으므로 `/agent-eval` 대상이 아니다.
- **형식**: 공유 JSON Schema(ARCHITECTURE §11)는 바뀌지 않는다. 기기 로컬 ui-state(`app/src/restore/uiState.ts`, TS만 읽음)에 필드 하나가 늘어난다.

## 레이아웃 (확정 초안)

초안: `.doan/canvases/canvas-inspector-layout.html`, 프레임 `inspector-column`(선택 없음)과 `inspector-selected`(요소 선택). 출시된 캔버스 화면 DOM과 CSS(`.doan/assets/canvas-page-snapshot.css`)를 그대로 뜬 위에 인스펙터 열을 더했고, 패널 안은 패널 초안과 같은 렌더러다. 구현은 이 초안의 셸 부분을 따른다.

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
  - Show inspector: lucide `sliders-horizontal`, `aria-controls`는 인스펙터 패널. 좁은 창이라 보일 수 없으면 `aria-disabled`이고, 툴팁과 `aria-describedby`가 "No room for the inspector. Widen the window or hide the conversation."을 말한다.
  - Show conversation: lucide `message-square`(`CanvasHeader.tsx`의 `PanelRightOpen`을 바꾼다).
- **안 읽음 배지**: 캔버스 헤더의 Show conversation과 프로토타입 창의 대화 버튼(`.pw-conv`) 둘 다 `data-badge="unseen"`이 말풍선(`.badge-bubble`) 대신 답 대기와 같은 8px 액센트 점을 그린다. 툴팁이 지금 고정 "Show conversation"이므로(`CanvasHeader.tsx:42` `IconTip`) 배지 상태의 aria-label을 툴팁 문구로도 쓴다. 프로토타입 창 아이콘도 `message-square`로 바꾼다. 사이드바 슬롯과 Show sidebar는 바꾸지 않는다.

## 인스펙터 패널

패널 내부 화면은 사용자가 확정한 초안 `.doan/canvases/canvas-inspector-panel.html`(프레임 `panel-prototype`, `panel-states`, `header-buttons`)이고, 레이아웃 캔버스의 `inspector-selected` 프레임이 같은 렌더러로 선택된 상태를 보인다. 여기서는 구조, 상태, 상호작용을 정한다.

- **head** (56px, 대화 head와 같은 높이): 선택이 있으면 제목 자리에 선택의 이름이 대화 head의 제목 메뉴와 같은 트리거로 온다. 선택이 없으면 "Inspector". 끝에 Hide inspector(`panel-right-close`).
- **요소 메뉴**: 트리거를 누르면 선택이 들어 있는 가장 안쪽 프레임의 트리가 열린다(Radix Popover, side bottom·align start·sideOffset 4, 대화 제목 메뉴와 같다). 공유 프리미티브 `.doan-menu[data-ui-variant="tree"]`를 쓴다(아래 '공유 프리미티브'). 역할은 `tree`/`treeitem`(`aria-level`, `aria-selected`), 트리거는 `aria-haspopup="tree"`, 목록 이름은 "Elements in <프레임 이름>".
  - 행: 프레임, 그 아래 요소들이 중첩 순서대로 들여쓰기된다. 한 단계마다 아이콘과 간격만큼 밀려 자식의 아이콘이 부모 이름 시작에 선다. 조상마다 1px `--border-standard` 들여쓰기 선이 그 조상 아이콘 가운데에서 마지막 자손 행까지 내려간다(사용자 참고: 스레드형 댓글 목록). 선택된 행은 눌린 채(`--affordance-backdrop-pressed`) 보인다.
  - 종류 아이콘(lucide): 프레임 `frame`, flex 가로 `columns-3`, flex 세로 `rows-3`, grid `grid-2x2`, 입력 컨트롤(input·textarea·select) `text-cursor-input`, 버튼 `rectangle-horizontal`, 텍스트(라벨·제목 포함) `type`, 그 밖의 박스 `square`.
  - 이름: 캔버스 스크립트의 경로 라벨 규칙(`canvasScript.ts` PathStep)을 따른다. 프레임은 제목, 요소는 `data-doan-id`, 없으면 태그와 짧은 텍스트(24자).
  - 동작: 행을 누르면 그 노드가 ⌘-click처럼 선택되고(기존 `select-anchor` 명령) 메뉴가 닫힌다. 행에 호버하거나 포커스하면 보드에 hover 표시가 뜬다. ↑/↓·Home/End로 옮기고 Enter·Space로 고르며, Esc는 메뉴만 닫고 트리거로 포커스를 돌린다(선택을 뒤로 돌리지 않는다).
  - 데이터: 주입 스크립트가 만든다. 새 요청 `element-tree`(자기 seq를 가진 채널, 선택·hover seq와 따로)에 선택의 가장 안쪽 프레임 아래 노드를 깊이·이름·종류·앵커·rect와 함께 답한다. 선택 상태를 바꾸지 않는다. 최대 200행이고, 넘으면 선택까지의 경로·형제·선택의 자식만 보낸다.
- **상태** (패널 쪽):
  - 선택 없음: 빈 상태 문구("Select a frame or element on the canvas to see its styles.", 대화 패널의 `.doan-conv-empty` 모양). 보드가 없을 때(캔버스 로드 중, 첫 레이아웃 실패, 목록에 없거나 ID가 겹치는 캔버스)도 선택이 없으므로 같은 빈 상태다.
  - 읽는 중: 선택이 바뀌었으면 이전 행을 지우고 로딩 표시를 보인다. 짧은 읽기에서 깜빡이지 않도록 300ms 뒤에 보인다("Reading styles"). 같은 선택을 다시 읽으면(reload 뒤 다시 찾음, 같은 캔버스 ID로 이동, Retry) 이전 행을 둔 채 응답이 오면 그 자리에서 바꾸고, 스크롤과 포커스를 유지한다.
  - 실패: 출시된 목록 읽기 오류(`.rp-error`) 모양 한 줄 "Couldn’t read the styles."와 그 끝의 Retry. CDP가 붙지 않았거나 시간을 넘긴 경우에만 Retry를 둔다. Retry 중에는 `aria-busy`·`aria-disabled`와 스피너.
  - 값: 그룹 머리글(Box, Typography, Colors, Radius, Shadow, Layout)과 행.
- **상태** (보드 쪽 사건):
  - reload가 선택을 다시 찾는 중: 이전 행을 유지한다.
  - 선택이 사라짐(PRODUCT §5 item 4의 토스트 "The selection is no longer in the canvas."): 빈 상태로 바뀐다. 인스펙터는 토스트를 따로 띄우지 않는다.
  - 선택한 노드를 CDP가 찾지 못함: 실패가 아니라 선택 소실과 같게 다룬다(빈 상태). Retry로 고쳐지지 않기 때문이다.
  - 응답의 캔버스가 지금 보이는 캔버스와 다름(전환 중 경쟁): 실패를 보이지 않고, 새 문서의 선택이 정해지면 다시 요청한다.
  - 읽는 중에 Hide: 응답을 버린다. 다시 열면 새로 요청한다.
- **행**:
  - 행마다 안정된 키 `group:property`(예: `box:padding`)를 둔다. 포커스·스크롤 유지와 늦은 응답 비교에 쓰고, 테스트로 고정한다.
  - `state`가 `default`인 행은 보이지 않는다(캔버스가 정한 값만). 토큰이 있으면 토큰 칩(공유 `.doan-code`)만 보이고, 없으면 값을 그대로 보인다. 면이 나뉜 행(padding, margin, radius)은 모든 면이 같은 토큰일 때만 토큰 행이다. 일부 면만 토큰이면 값을 보이고, 그 행의 툴팁에 면마다 토큰을 적는다(복원할 리졸버는 가장 나쁜 상태를 행 상태로 삼으므로, 표시 단계에서 면마다 토큰을 비교한다). 출처 캡션은 없다. 툴팁은 위에서부터: 이름이나 값이 잘렸으면 전체 텍스트(앱의 NameTip 규칙), 토큰 행이면 computed 값, 별칭이 있으면 체인(`--a → --b`), 면이 나뉜 값이면 면마다 값, 상속된 행이면 토큰이 없어도 "Inherited from <이름>"(사용자 결정: 토큰만 보이고 값은 호버로; 값과 칩을 함께 두면 280 폭에서 잘려 쓸 수 없었다). 툴팁은 행 하나에만 단다. 모든 행이 기본값이면 "The canvas sets no styles here." 문구를 보인다(초안).
  - 값: 표시용으로 가공한 computed 값(색은 hex, 상하좌우가 같으면 하나로 접음, 긴 값은 자름). 면이 나뉜 값에서 한 면에만 0이 아닌 값이 있으면 그 면 이름을 붙인다("Top 8px", 모서리는 "Top left 8px"). 그 밖의 축약형은 그대로 둔다.
  - 순서: 그룹은 Box, Typography, Colors, Radius, Shadow, Layout. Box 안은 Padding → Gap → Margin → Width → Height, Typography 안은 Size → Weight → Line height → Family, Layout 안은 Display → Direction → Columns → Wrap → Justify → Align. 색은 14px 견본을 함께 보인다. 토큰이 있는 색은 견본이 토큰 칩 안에 들어간다(새 토큰 `--size-icon-xs` 12px). 견본 테두리는 1px `--border-prominent`. 견본 색은 예전 `swatchColor`처럼 hex·transparent만 받는다.
  - 복사: 토큰이 있으면 `--name`, 없으면 값. 복사는 `app/src/renderer/copyText.ts`로 한다(main이 권한을 거부해 async Clipboard API를 쓸 수 없다, ARCHITECTURE §7). 복사 결과는 공유 토스트로 알린다(사용자 결정: 행 안에서 값이 가려지면 당황스럽다). 창 오른쪽 아래 16px, 8초, 새 토스트가 이전 것을 바꾸고, `role="status"`로 읽힌다. 문구는 "Copied <토큰 이름 또는 값>", 실패하면 "Couldn’t copy the value. Try again.". 행은 값을 그대로 보이고 포커스만 유지한다. 행 이름은 보이는 것을 읽고("Padding, 24px, token --space-6"), "Press to copy"는 `aria-describedby`로 단다.
- **키보드**:
  - Tab 순서: 보드 영역 → 인스펙터(제목 트리거, Hide inspector, 행 목록) → 대화.
  - 행 목록은 Tab 정지점 하나다(roving tabindex). ↑/↓로 행을 옮기고 Home/End로 처음·끝으로 간다. Enter·Space·⌘C로 복사한다.
  - 포커스가 인스펙터 안에 있어도 Esc는 선택을 한 단계 뒤로 돌린다(PRODUCT §5 item 4). 요소 메뉴가 열려 있을 때만 Esc가 메뉴를 닫는다.

## 데이터 경로

- **수집기 복원**: 지운 `app/src/main/inspect.ts`(순수 리졸버, 이름 `inspectRows`)와 `inspect.test.ts`·`inspect.fixture.json`을 `67c222f71~1`에서 되살린다. `inspector.ts`의 CDP 부분(직렬 큐, 2초 예산, fail closed, `inheritedFrom`, 재attach)을 되살리되, 세션은 `windowDebugger.ts`의 새 API로 고른다. 예전 `canvasSession()`(토큰 경로에 있는 가장 최근 iframe 세션 휴리스틱)과 세션 추적 테스트는 되살리지 않는다(세션 소유권 테스트는 이미 `windowDebugger.test.ts`에 있다). 타임아웃이 CDP 명령을 취소하지 않는다는 예전 한계는 그대로 남고, ARCHITECTURE에 다시 적는다.
- **`windowDebugger.ts` API 추가**: `sessionOf(frameId): string | null` — `frameOwners`에서 그 프레임의 현재 소유 세션을 돌려주고, 소유자가 바뀌었거나 분리된 세션이면 null이다. 수집기는 보이는 캔버스의 프레임을 read-state와 같은 근거(`app/src/main/seenProof.ts` `shownDocument`)로 찾고, 그 프레임의 `sessionOf`로만 명령을 보낸다. 그래서 "보이는 문서가 요청한 캔버스인가"와 "어느 세션에 보내나"가 visible proof와 한 근거로 정해진다.
- **그룹**: `InspectGroup`을 `"layout" | "box" | "typography" | "colors" | "radius" | "shadow"`로 바꾼다. 예전 `effects`의 Radius·Shadow 행이 각 그룹으로 간다.
- **Layout 행**: Layout 그룹은 Display, Direction(`flex-direction`), Columns(`grid-template-columns`), Wrap(`flex-wrap`), Justify(`justify-content`), Align(`align-items`)이다. `gap`은 Box에 둔다. `display`가 flex·inline-flex·grid·inline-grid일 때만 Layout 행을 낸다(`display: block`에서 `flex-direction: row` 같은 무의미한 행을 내지 않는다). Columns는 grid일 때만, Direction·Wrap은 flex일 때만 낸다. 모든 행이 같은 리졸버 경로로 출처를 판정한다.
- **비는 그룹**: `inspectRows`는 그룹마다 행을 항상 내지만, 기본값 행을 빼면 그룹이 빌 수 있다. 빈 그룹은 보이지 않는다.
- **IPC**: `inspect:get`(main 창 전용, `senderAllowed.ts`에 다시 넣는다). 요청은 `{selector, canvas: {root, path}, seq}`. 보이는 문서가 그 캔버스가 아니면 main은 `{ok: false, reason: "not-shown"}`으로 답한다. 실패 이유는 `not-shown`(전환 경쟁), `not-found`(노드 없음), `unavailable`(CDP 미연결·시간 초과) 셋이다.
- **요청 시점**: 인스펙터가 보이고(열림 + 좁은 창 아님) 선택이 있을 때만 요청한다. 선택 기준은 렌더러가 받아들인 선택(main이 보낸 선택 갱신을 CanvasController가 적용한 것)이고, 보냈지만 아직 받아들이지 않은 선택이 아니다(postmortem 2026-10-23 comments-ui Recurrence). 선택이 바뀔 때, reload 뒤 다시 찾았을 때, 인스펙터가 보이게 될 때, Retry 때 한 번씩 요청한다.
- **늦은 응답**: 렌더러는 마지막 요청의 seq, 선택 키, 캔버스가 모두 맞는 응답만 받아들인다.

## 상태 저장

- ui-state에 `inspector?: { open: boolean; width?: number }`를 더한다. 파싱은 `parseRightPanel`과 같은 방식이지만 **open 기본값은 false**다(`parseRightPanel`은 `open ?? true`). 폭 상한은 같은 `RIGHT_PANEL_MAX_SAVED_WIDTH`.

## 순수 함수로 뺄 것 (`/tdd` 대상)

| 함수 | 파일 | 내용 |
|---|---|---|
| `inspectRows` | `app/src/main/inspect.ts`(복원) | 기존 테스트 + 그룹 6개, Layout 조건, `grid-template-columns` |
| `panelBounds`(확장), `canvasPanelsLayout` | `app/src/renderer/rightPanelSize.ts` | `reserved` 인자, 대화 먼저 → 인스펙터 순서, `inspectorFits`, 960·1280·1470·1512 창, 사이드바 숨김, 저장 폭이 최대보다 큰 경우 |
| `parseInspectorState` | `app/src/restore/uiState.ts` | 빠짐, open 기본 false, 잘못된 open 타입, 음수·NaN·상한 초과 폭 |
| `rowDisplay`, `rowCopyText`, `rowKey` | `app/src/renderer/inspectorRows.ts`(예전 `renderer/inspector.ts`의 `sourceNotes`·`tokenTitle`·`swatchColor`를 흡수) | 표시·툴팁(잘림 전체 텍스트 → computed 값 → 체인 → 면별 값 → 상속)·복사 텍스트, Default 행 제외, 면마다 토큰이 다를 때 값으로, 한 면만 값이면 면 이름, 그룹·행 순서, 견본 가드, 키 |
| `inspectRequestFor` | 같은 파일 | 보임·선택·이전 요청을 받아 요청할지와 같은 선택 재요청인지 |
| `acceptInspect` | 같은 파일 | seq·선택 키·캔버스로 늦은 응답 거부, 실패 이유별 다음 상태 |
| `elementTree`, `nodeKind`, `nodeLabel` | `app/src/main/canvasScript.ts`(주입 스크립트의 순수 도우미, 인자로 넘긴다) | 가장 안쪽 프레임 아래 트리, 깊이, 200행 상한과 줄이기, 종류 판정(태그·display), 이름 규칙 |
| `headerShowButtons` | `app/src/renderer/CanvasHeader.tsx` 옆 순수 모듈 | 구분선·Show 버튼 순서·비활성 |
| `parseInspectRequest` | `app/src/main/inspector.ts` | `{selector, canvas, seq}` 검증, 셀렉터 캡 |

## 공유 프리미티브와 토큰

- **새 토큰** `--size-icon-xs` 12px: 토큰 칩 안의 견본. 초안과 함께 `tokens.css`와 DESIGN.md 토큰 표에 더했다. 같은 12px 리터럴(메뉴 체크, 브랜치 아이콘, glyph)을 바꾸는 일은 별도 리팩터다.
- **`.doan-code`** (`ds/controls.css`): 인라인 코드 칩. 산스, `--surface-inset`, `--radius-inline`, `0 var(--space-1)`, 한 줄 말줄임, 앞쪽 견본 자리. styles.css에 같은 묶음이 6곳 있는데, 이 feature는 인스펙터만 이것을 쓰고 6곳 교체는 별도 리팩터(BACKLOG)로 둔다.
- **`.doan-menu[data-ui-variant="tree"]`** (`ds/surfaces.css`): 행의 `--depth`로 들여쓰고, 16px `--text-metadata` 아이콘, 조상마다 1px 들여쓰기 선(`.guide`, `--level`), 선택 행은 눌린 채, 포인터·포커스 칠은 한 번에 하나(공유 listbox 규칙과 같게).
- 둘 다 DESIGN.md 'Design system'에 한 줄씩 적는다(tasks 5). 패널 head·빈 상태 클래스를 공유 이름으로 옮기는 일도 별도 리팩터(BACKLOG)다.

## 결정 영향

- **PRODUCT** (마지막 task에서 고친다):
  - §3 In scope 1(Show)에 인스펙터.
  - §5 item 4의 "There is no Inspector" 줄을 인스펙터 규칙으로.
  - §5 item 2 'Canvas header'(Show conversation 아이콘과 Show inspector), 'Conversation panel'(폭 규칙, 좁은 창), 'Prototype window'(대화 버튼 아이콘, 안 읽음 점).
  - §5 item 0 'Text edit menu'(인스펙터 행 복사).
- **ARCHITECTURE**:
  - §3 'Selection'에 수집기(CDP, `windowDebugger.ts`의 `sessionOf`), `inspect:get` 계약, 늦은 응답 규칙.
  - §3 'Canvas rendering'의 주입 스크립트 메시지에 `element-tree` 요청과 답(자기 seq 채널, 200행 상한, 선택 상태 불변)을 더한다. 메시지 모양은 `canvasMessage.ts`(TS 전용)에 두고, 공유 JSON Schema는 바뀌지 않는다.
  - 'Window debugger' 문단(:148)에 수집기 역할.
  - 예전 'Resolver limits'와 'CDP collector'(직렬 큐, 2초 예산, 타임아웃이 명령을 취소하지 않음)를 되살린다.
  - §3 rendering의 주입 스크립트 문단에 "inspector style rows는 보내지 않는다"를 다시 적는다.
- **`docs/design/canvas.md` 'Panel width'**: 960 측정값과 인스펙터 폭을 새로 잰다(tasks 6).
- **샌드박스·서빙 범위**: 바뀌지 않는다. 스타일 값은 CDP로 main의 창 디버거가 읽는다. 주입 스크립트에는 `element-tree` 요청 하나만 더한다(읽기 전용, 선택 상태 불변).
- **PoC 의존**: 없다. CDP 수집은 예전 PoC와 출시 코드로 확인됐고, 세션 소유권은 지금의 `windowDebugger.ts`가 지킨다. 복원한 수집기가 `sessionOf`와 맞물리는지는 실제 앱에서 확인한다(tasks 6).

## 관련 postmortem

- **2026-10-25 — Runtime checks could finish before the evidence or cleanup**, Recurrence(UX C): "the new Inspector test initially waited for main's release plus 100ms, which did not prove the stale response was consumed." → 늦은 응답 테스트는 실제 컨트롤러 콜백이 끝난 것을 확인한 뒤 값을 단언한다.
- **2026-10-23 — Response eviction and OOPIF swaps lost a live comment document**, Recurrence(inspector session ownership): "a delayed `Target.detachedFromTarget` for the former OOPIF session retired the frame already committed by its replacement." → 세션 소유권은 `windowDebugger.ts`에만 두고, 수집기는 `sessionOf`가 돌려준 현재 소유 세션으로만 명령을 보낸다.
- **2026-10-23 comments-ui Recurrence**: 보낸 선택 floor를 수락의 증거로 쓰다 생긴 버그 → 요청 시점은 받아들인 선택 기준.

## 디자인 프리셋

초안을 그리며 `critique`, `harden`, `clarify`, `typeset`을 읽었다(`doan design-skill <id> --json`). `/design-sync`는 두 초안의 `panel-states`·`header-buttons`·`inspector-column`·`inspector-selected` 프레임과 비교한다.
