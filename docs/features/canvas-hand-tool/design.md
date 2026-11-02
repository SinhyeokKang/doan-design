# canvas-hand-tool — design

## 방식

- **끌기 레이어**: Hand이거나 Space를 누르고 있는 동안, 투명한 끌기 레이어를 `section.area`의 자식으로 `.overlay` 바로 뒤에 둔다(z-index 0–1). 레이어는 보드와 iframe보다 위, 에이전트 glow(z1, 클릭을 받지 않음)와 `.doan-canvas-top`(z3: 에이전트 알림의 Stop·Open, 캔버스 알림), `.canvas-status`(Reload), `.doan-canvas-bottom`(z3: 도구모음)보다 아래다. 그래서 Stop·Open·Reload·도구모음은 계속 눌린다(PRODUCT §5 item 2 'Agent indicator': "never blocks…"). 레이어가 iframe보다 위에 있어 pointer 이벤트를 먼저 받으므로 주입 스크립트의 선택 경로는 바뀌지 않는다. iframe의 `pointer-events`도 건드리지 않는다(픽의 ack 전 경로만 그 스타일을 쓴다, ARCHITECTURE §3).
- **레이어 표시 조건**: `(hand || spaceHeld) && pick 없음 && 프레임이 있음 && status === null && 문제 없음`. 보드를 그리지 않는 상태에서는 Hand 버튼만 눌려 있고 레이어는 없다.
- **이동 계산**: pointermove마다 직전 위치와의 화면 이동량을 `panBy(view, dx, dy)`에 넘긴다(`viewport.ts`, 휠과 같은 함수). 시작 view + 누적량이 아니라 증분이라서, 끄는 중의 ⌘-휠 확대가 덮이지 않는다. 확대 배율은 보드 transform에 이미 들어 있으므로 나누지 않는다.
- **끌기 수명**: 레이어는 pointerdown(기본 버튼만)에서 `setPointerCapture`로 창 밖에서도 이벤트를 받는다. pointerup·`pointercancel`·`lostpointercapture`, 보드가 사라짐(리로드·닫기·캔버스 전환), 작업 공간 이탈에서 끌기가 끝난다. 끄는 도중 Space를 놓거나 V·Esc를 누르면 그 변화는 pointerup 뒤에 적용한다. 레이어를 먼저 치우면 pointerup이 iframe에 떨어져 선택이 되기 때문이다. 우클릭·더블클릭은 레이어가 받고 아무 일을 하지 않는다.
- **hover**: 레이어가 뜨는 순간 `hoverRect`를 비우고 `hover-leave`를 보낸다. 레이어가 덮으면 iframe은 pointermove를 받지 않고, OOPIF의 pointerout은 믿을 수 없다(POSTMORTEM 2026-10-23). 레이어가 있는 동안 hover는 그리지 않고 선택 표시는 그대로 둔다.
- **휠**: 레이어는 `.area`의 DOM 자식이므로 휠·핀치는 지금처럼 `.area`의 `wheelOnMargin`으로 간다(`CanvasController.ts`, 대상 검사 없음). 그래서 Hand에서는 초안 안 스크롤 영역 위의 휠도 보드를 옮긴다(spec 결정 6). 레이어를 portal로 옮기면 이 경로가 끊긴다.

## 키

- **판정**: `toolShortcut(event, context)`는 키 이벤트 전체를 받는다. `event.code`로 KeyV·KeyH·Space를 판정한다. `repeat`, `isComposing`·`keyCode === 229`, `defaultPrevented`, `metaKey`·`ctrlKey`·`altKey`, 편집 대상(`editableTarget`)이면 무시한다. 캔버스 페이지가 아니면(`workspaceActive`가 아니거나 Overview·Home·모달) 무시한다. 지금 keydown은 `workspaceActive`만 본다.
- **Space와 대화형 컨트롤**: 대상이 대화형 컨트롤(button, `a[href]`, `[role=button|menuitem|treeitem|option|tab|switch|checkbox|radio|combobox]`)이면 Space는 그 컨트롤의 일을 한다. 아니면 Space로 이동을 시작하고 keydown·keyup에서 `preventDefault`한다. 사이드바 트리는 Space를 `preventDefault`하므로 `defaultPrevented`로 이미 빠진다.
- **keyup**: Space keyup은 편집 대상이든 아니든 항상 Space를 푼다. keydown만 거른다. Space를 누른 채 composer를 클릭하고 떼었을 때 `spaceHeld`가 남지 않게 하기 위해서다.
- **iframe 경로**: ⌥-click 뒤 iframe에 포커스가 있으면 주입 스크립트가 keydown·keyup의 Space와 keydown의 V·H를 `key` 메시지로 넘긴다(지금 Alt·Escape를 보내는 경로, `canvasScript.ts` 738–767행). 편집 대상이면 보내지 않는다. Space는 iframe 안에서도 `preventDefault`해 초안이 스크롤되거나 초안의 컨트롤이 눌리지 않게 한다. 스크립트는 자기 window `blur`에서 Space-up을 보낸다.
- **Space 상태 정리**: 렌더러는 iframe에서 온 Space-down을 `document.activeElement === frame`일 때만 받는다. Space-up은 항상 받는다. 앱 `window` `blur`는 포커스가 iframe으로 갈 때도 일어나므로 그것만으로 풀지 않는다. 앱 창 자체가 포커스를 잃을 때(`document.hasFocus()`가 false가 될 때)와 `setWorkspaceActive(false)`에서 `spaceHeld`와 진행 중인 끌기를 푼다.
- **seq 없음**: Alt는 캔버스가 pointermove마다 스냅샷을 보내서 오래된 스냅샷을 막는 seq가 필요했다. Space는 keydown·keyup에서만 보내고 스냅샷을 보내는 곳이 없으며, Space를 누른 동안 레이어가 포커스 이동을 막으므로 seq를 쓰지 않는다.
- **V·H**: 메뉴 단축키가 아니라 캔버스 페이지의 keydown으로 처리한다. 수정키 없는 메뉴 accelerator는 입력창 안에서도 발동하기 때문이다.
- **Esc**: `escapeStep(state)`이 다음 동작을 고른다. 순서는 열린 메뉴·팝오버·`/` 목록(이미 `defaultPrevented`) → 픽 취소(편집 대상 검사 전, 지금처럼) → Hand를 Select로(편집 대상 검사 뒤) → 선택 해제. 앱 keydown 경로와 iframe의 `key` Escape 경로(`CanvasController.ts`의 수신부, 지금은 `clearOnEscape`를 바로 부른다) 모두 `escapeStep`을 거친다.

## 포커스

- 캔버스 여백 클릭(`clickOnMargin`)과 캔버스 안 클릭은 `section.area`에 `focus({ preventScroll: true })`를 준다. 픽 중 클릭은 포커스를 옮기지 않는다. hover는 포커스를 가져가지 않는다(ARCHITECTURE §3 'Practical nested iframe limit').
- 캔버스 안 클릭은 iframe에서 일어나 앱이 직접 보지 못한다. 그래서 주입 스크립트가 보내는 클릭 선택 메시지를 받았을 때 포커스를 옮긴다. 이 메시지는 위조할 수 있다(ARCHITECTURE 'Untrusted messages'). 위조된 메시지가 composer 포커스를 가져갈 수 있는지와 그 대응은 `/tdd` 전에 정한다(아래 '열린 점').
- 끌기 레이어는 포커스를 가져가지 않는다(`tabIndex` 없음, pointerdown에서 `preventDefault`).

## 도구 상태

- `CanvasController`는 앱 수명 동안 하나다(`App.tsx`에서 한 번 만든다). 그래서 Hand는 controller의 private 필드로 두고, Overview·빈 상태로 `state`를 다시 만들 때 `activity`처럼 넘겨서 유지한다. `state.tool`로 내보낸다.
- **기기 저장**: 마지막 도구를 ui-state(`<userData>/ui-state.json`, 모양은 `app/src/restore/uiState.ts`의 `UiState`)에 선택 필드 `canvasTool?: "hand"`로 저장한다. 필드가 없으면 Select다. Select는 저장하지 않는다(필드를 지운다). main의 검증(`app/src/main/uiState.ts`)은 `"hand"`가 아닌 값을 버리고, 그러면 Select로 시작한다.
- **시작 복원**: 저장은 지금 ui-state 규칙을 그대로 따른다. 처음 읽기가 끝나기 전에는 저장을 보내지 않고, 끝난 뒤 읽은 값과 합친 상태를 한 번 저장한다(POSTMORTEM 2026-11-01). 읽기가 끝나면 controller의 도구를 저장값으로 정한다. 다만 그 전에 사람이 V·H·버튼으로 도구를 바꿨다면 늦은 저장값이 덮지 않는다(ARCHITECTURE 'Navigation recovery'와 같은 원칙).
- `tool`은 지속 도구 `"select" | "hand"`와, 별도의 `pick` 상태로 나눈다. 지금은 `tool: "select" | "pick"` 하나의 유니언이다. 픽은 도구를 바꾸지 않고 잠시 앞선다. 픽이 끝나면 `tool`이 그대로 남아 있으므로 픽 전의 도구로 돌아간다.

## 도구모음

- Hand 버튼은 Select와 같은 40px(`md`) `doan-icon-button doan-canvas-tool`이다. `aria-pressed`는 실제 도구 상태를 따른다. Select에도 onClick이 생긴다.
- 툴팁은 "Select" + `doan-kbd` "V", "Hand" + `doan-kbd` "H"다. 버튼에 `aria-keyshortcuts="V"`·`"H"`를 단다.
- 도구모음의 roving tabindex에서 `tabIndex=0`은 눌린 도구가 가진다(지금은 Select 고정).
- 모양은 새 초안 `.doan/canvases/canvas-hand-tool.html`에서 정한다(tasks D1). 기존 `buzz-canvas.html`은 고치지 않는다.

## 어두운 바탕의 키 표시 (`/design-draft`에서 사용자가 정함)

- `doan-kbd`에 공용 변형 `data-ui-variant="on-prominent"`를 더한다. 면을 칠한다. 배경은 부모 잉크의 16%(`color-mix(in srgb, currentColor 16%, transparent)`)이고, 글자는 부모의 잉크를 따르며, 윤곽선은 없다. 16%는 같은 어두운 바탕에 있는 에이전트 알림 Stop 버튼의 채움과 같은 값이다.
- 크기는 두 가지다. 기본은 지금 `doan-kbd`(본문 sm 글꼴, 여백 4/8, 높이 28)이고 픽 안내의 Esc가 쓴다. `data-ui-size="sm"`은 캡션 글꼴, 여백 0/6, 높이 16이고 툴팁이 쓴다. 툴팁 높이는 24 그대로다(4 + 16 + 4). 버튼 안 단축키(`.doan-button .doan-kbd`)와 같은 크기다.
- 픽 안내의 Esc는 화면 전용 규칙 대신 이 변형을 쓴다. 그래서 `.doan-picking-esc.doan-kbd` 규칙은 없어지고, 픽 안내의 Esc는 지금의 윤곽선 모양에서 채운 모양으로 바뀐다. 크기는 그대로다.
- 흐린 잉크(새 토큰)는 쓰지 않는다. 픽 안내는 60% 검정이라 밝은 보드 위에서 바탕이 약 #626262가 되고, 그 위 #b3b3b3 글자는 대비가 약 2.9:1이기 때문이다.
- 툴팁에 키가 있으면 이름과 키를 한 줄에 놓고 간격은 8이다.
- 공용 변형이므로 `.doan/ds/tooltip.html`에 키가 있는 툴팁을 더하고, `docs/DESIGN.md`의 `.doan-kbd` 설명(지금은 "only the canvas picking hint's Esc key")을 고친다(tasks T3·Z1).

## 초안 요청 (`/design-draft`)

- 경로·id: `.doan/canvases/canvas-hand-tool.html`, `canvas-hand-tool`.
- 프레임: `tools-select`(Select 눌림, 툴팁 "Select" V), `tools-hand`(Hand 눌림, 툴팁 "Hand" H), `kbd-on-prominent`(공용 키 변형: 픽 안내의 Esc 기본 크기와 툴팁의 V·H sm 크기), `board-hand`(Hand: 프레임 위 grab 커서, 선택 표시 유지, hover 없음, 에이전트 알림 Stop이 레이어 위), `board-space`(Select + Space로 끄는 중: grabbing 커서, Select 눌림), `board-failed`(Hand + 로드 실패: Hand 눌림, grab 커서 없음, Reload).
- 커서는 정적 초안에서 보이지 않으므로 커서 모양을 그림으로 표시하고 설명용이라고 적는다.
- 확정: 사용자가 앱에서 초안을 확인하고 확정했다(2026-11-03, 리비전 ea58be23 기준: 면 채움 키 표시, 마지막 도구 기기 저장 반영). `/design-sync`는 이 초안을 기준으로 한다.

## 영향 받는 부분

- **renderer**: `CanvasTools.tsx`(Hand 버튼, `aria-pressed`, Select onClick, 툴팁, tabIndex, 위쪽 주석), `CanvasController.ts`(도구·pick 상태, 끌기 레이어, Space·V·H·Esc, 포커스, hover), `selection.ts` 또는 새 파일(`toolShortcut`, `escapeStep`), `canvasMessage.ts`(`key` 메시지에 Space down/up, V·H), `styles.css`(레이어와 커서), `App.tsx`(레이어 요소를 `.overlay` 뒤에 둔다, 도구 저장·복원), `app/src/restore/uiState.ts`(`canvasTool`).
- **main**: `canvasScript.ts`의 keydown/keyup 전달에 Space·V·H, Space `preventDefault`, blur 시 Space-up. `uiState.ts`의 `canvasTool` 검증.
- **CLI·skills·형식**: 바뀌지 않는다.

## 순수 함수 (`/tdd` 대상)

- `toolShortcut(event, context)`: V·H·Space를 수정키·조합·`defaultPrevented`·편집 대상·대화형 컨트롤·캔버스 페이지 아님에서 거르는 판정.
- `escapeStep(state)`: Esc 순서에 'Hand를 Select로'를 끼운 다음 동작(지금 `shouldGuardEscape`·`clearOnEscape` 순서의 확장).
- `parseCanvasMessage`의 Space down/up, V·H 검증.
- 레이어 표시·커서·Space·끌기 수명은 순수 함수로 빼지 않고 기존 `CanvasController.test.ts` 하네스(`h.key`, `h.receive`)로 테스트한다. `dragPan`은 `panBy` 한 줄이라 만들지 않는다.

## 형식 변경

- 공유 형식은 바뀌지 않는다. ui-state는 기기 로컬 파일이고 TS만 읽으므로 JSON Schema·Go fixture 대상이 아니다. 선택 필드 하나를 더할 뿐이라 예전 파일도 그대로 읽힌다.
- 캔버스 → 앱 `key` 메시지는 앱 내부 메시지이고(ARCHITECTURE §3 'Selection and inspector': 영속 스키마·소켓·CLI 계약에 없음), 검증 함수(`canvasMessage.ts`)와 그 테스트만 바뀐다.

## 규약 영향

- 없음.

## 결정 영향 (Z1에서 고친다)

- PRODUCT §5 item 2 'Toolbar'("Select, always pressed … A click in the canvas always selects; Option-click passes through"): Select·Hand 중 하나가 눌려 있고 V·H로 바꾼다. Space로 잠시 옮긴다. Hand에서는 클릭이 선택하지 않고 ⌥-click도 통과하지 않는다. 캔버스 클릭은 포커스를 캔버스로 옮긴다(픽 제외).
- PRODUCT §5 item 2 'Notices and states': Esc 순서에 Hand 단계를 더한다.
- PRODUCT §5 item 1 시작 복원("Launch restores the last Home or workspace screen, canvas …, viewport and tree expansion"): 마지막 캔버스 도구를 더한다.
- PRODUCT §5 item 4(선택): "selects … by an ordinary click; hover only highlights candidates"와 "Esc or empty-space clicks clear it"에 Hand 예외를 더한다.
- PRODUCT §5 item 6 픽: "Pan and pinch still work"를 휠 이동과 핀치는 되고 Hand·Space 끌기는 없다고 고친다. 픽이 끝나면 픽 전 도구로 돌아간다.
- ARCHITECTURE §3 'Input': "The injected script owns pointer events in the iframe"에 끌기 레이어가 있으면 레이어가 먼저 받는다고 더한다. plain wheel 규칙에 Hand에서는 휠이 항상 보드를 옮긴다고 더한다. 캔버스 클릭 포커스 규칙을 더한다.
- 에이전트 작업 표시("never blocks selecting, panning or zooming")는 그대로다. 끌기 레이어는 glow 위, 알림 아래다.

## T4에서 확인할 가정

PoC로 확인된 적이 없다. T4 runtime-test에서 본다.
- 부모 문서에서 OOPIF iframe 위에 있는 요소가 hit-test에서 이긴다.
- `setPointerCapture`가 창 밖으로 나간 포인터에도 유지된다. 안 되면 끄는 동안 window의 pointermove·pointerup 리스너로 대신한다.
- Space를 누르고 포인터를 움직이지 않아도 커서가 grab으로 바뀐다(Chromium은 pointermove 없이 커서를 갱신하지 않을 수 있다).
- 레이어 위의 휠·⌘-휠이 `.area`로 간다.

## 열린 점

- 위조된 클릭 선택 메시지가 composer 포커스를 가져갈 수 있다. 지금은 위조된 선택이 선택만 바꾼다. `/tdd` 전에 대응을 정한다(예: 앱이 본 마지막 포인터 위치가 iframe 위일 때만 포커스를 옮긴다).

## POSTMORTEM에서 가져온 함정

- 2026-11-02 Tab이 초안으로 들어간 일: 끌기 레이어는 포커스를 가져가지 않고, `.area`의 `overflow: clip`을 바꾸지 않는다. T4에서 Hand 상태로 Tab을 누른다.
- 2026-10-23 hover·Alt가 포커스 이동을 넘어 남은 일: 레이어가 뜰 때 `hover-leave`를 보낸다. Space가 iframe과 앱 사이에서 눌리고 떼일 때를 실제 입력으로 확인한다.
- 2026-10-24 키가 포커스를 잃은 일: 키 처리는 window keydown(capture)에서 한다. 컨트롤이 스스로 비활성되면 포커스가 body로 떨어진다.
- 선택 메시지는 신뢰하지 않는 데이터다(ARCHITECTURE 'Untrusted messages'). 캔버스 스크립트가 Space-down을 위조하면 레이어가 떠서 keyup·blur까지 사람의 선택 클릭을 막을 수 있다. 렌더러가 iframe에 포커스가 있을 때만 Space-down을 받으므로 대부분 막힌다. 선택·`doan active`는 바뀌지 않는다.
