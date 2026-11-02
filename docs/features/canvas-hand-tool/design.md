# canvas-hand-tool — design

## 방식

- **끌기 표면**: Hand이거나 Space를 누르고 있는 동안, 보드 viewport 위에 투명한 끌기 레이어를 둔다. 레이어가 iframe보다 위에 있어 pointer 이벤트를 먼저 받는다. 그래서 주입 스크립트의 선택 경로를 바꾸지 않는다. 레이어는 `setPointerCapture`로 끄는 동안 창 밖으로 나가도 이벤트를 받는다.
- **이동 계산**: pointermove의 화면 이동량을 그대로 `panBy(view, dx, dy)`에 넘긴다(`viewport.ts`, 휠과 같은 함수). 확대 배율은 보드 transform에 이미 들어 있으므로 나누지 않는다.
- **Space 감지**: 앱 문서의 keydown/keyup과, iframe에 포커스가 있을 때 주입 스크립트가 보내는 `key` 메시지(지금 Alt·Escape를 보내는 경로, `canvasScript.ts` 694–744행)에 Space를 더한다. 편집 가능한 대상(`editable`)이면 보내지 않는다. 키 반복(repeat)은 무시하고, 창이 포커스를 잃으면 Space 상태를 푼다(keyup을 놓친 경우).
- **도구 상태**: `CanvasController`의 `tool`은 지금 `"select" | "pick"`이다. 여기에 `"hand"`를 더하고, Space는 별도의 `spaceHeld` 상태로 둔다. 레이어 표시 여부는 `tool === "hand" || (tool === "select" && spaceHeld)`다. 픽 중(`"pick"`)에는 레이어를 보이지 않는다.
- **유지**: Hand는 App 수준 상태로 두어 캔버스가 바뀌어도 남는다. ui-state에 저장하지 않는다.
- **단축키**: V·H는 메뉴 단축키가 아니라 캔버스 페이지의 keydown으로 처리한다(입력 중 오작동을 막기 위해 `editableTarget` 검사를 쓴다). 메뉴에 넣을지는 BACKLOG의 네이티브 단축키 미확인과 같은 문제가 있어 넣지 않는다.

## 영향 받는 부분

- **renderer**: `CanvasTools.tsx`(Hand 버튼, `aria-pressed` 실제 상태, Select에 onClick), `CanvasController.ts`(도구 상태, 끌기 레이어, Space·V·H·Esc), `viewport.ts`(끌기 → pan 순수 함수), `canvasMessage.ts`(`key` 메시지에 Space down/up), `styles.css`(레이어와 커서), `App.tsx`(도구 상태 유지).
- **main**: `canvasScript.ts`의 keydown/keyup 전달에 Space.
- **CLI·skills·형식**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `dragPan(view, from, to)`: 두 포인터 위치로 새 view.
- `activeTool(tool, spaceHeld)`: 레이어 표시와 커서(`grab`/`grabbing`/없음).
- `escapeStep(state)`: Esc 순서에 'Hand를 Select로'를 끼운 다음 동작(지금 `shouldGuardEscape`·`clearOnEscape` 순서의 확장).
- `toolShortcut(key, target)`: V·H·Space를 편집 대상에서 무시하는 판정.
- `parseCanvasMessage`의 Space down/up 검증.

## 형식 변경

- 공유 형식은 바뀌지 않는다. 캔버스 → 앱 `key` 메시지는 앱 내부 메시지이고, 검증 함수(`canvasMessage.ts`)와 그 테스트만 바뀐다.

## 규약 영향

- 없음.

## 결정 영향

- PRODUCT §5 item 2 'Toolbar'("Select, always pressed … A click in the canvas always selects")를 바꾼다. 새 규칙: Select·Hand 중 하나가 눌려 있고, Hand에서는 클릭이 선택하지 않는다. Option-click 통과는 Select에서 그대로다.
- PRODUCT §5 item 2 'Notices and states'의 Esc 순서에 Hand 단계를 더한다.
- ARCHITECTURE §3 'Input'("the injected script owns pointer events in the iframe")에 끌기 레이어가 있을 때는 레이어가 먼저 받는다고 더한다.
- 에이전트 작업 표시("never blocks selecting, panning or zooming")는 그대로다. 끌기 레이어는 표시보다 위에 둔다.

## PoC 의존

- 없음. 레이어가 sandbox iframe 위에서 pointer capture를 받는지는 T4 runtime-test에서 본다.

## POSTMORTEM에서 가져온 함정

- 내비게이션·포커스 항목: hover가 캔버스로 포커스를 끌어오지 않는다는 규칙(ARCHITECTURE §3 'Practical nested iframe limit')을 지킨다. 끌기 레이어는 포커스를 가져가지 않는다(`tabIndex` 없음, pointerdown에서 `preventDefault`로 포커스 이동을 막는다).
- 선택 메시지는 신뢰하지 않는 데이터다(ARCHITECTURE 'Untrusted messages'). 캔버스 스크립트가 Space down을 위조하면 Hand 레이어가 뜰 뿐 선택·`doan active`는 바뀌지 않는다. 받아들여도 되는 영향이다.
