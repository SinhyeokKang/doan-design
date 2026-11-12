# canvas-text-copy — design

## 방향

누름은 지금처럼 캔버스로 보내지 않는다. 캔버스 스크립트는 드래그 동안 `Range`를 직접 만들어 들고 있고, 캔버스 문서의 Selection은 쓰지 않는다. 범위의 사각형은 앱에 보내고, 앱이 overlay에 accent 반투명으로 칠한다. 복사할 텍스트는 놓을 때 한 번 읽어 보낸다. 복사는 앱 문서의 `copy` 이벤트에서 그 텍스트를 쓴다.

검토한 대안:
- **텍스트 위 누름만 캔버스로 통과**: 브라우저 기본 선택을 그대로 얻지만, 같은 누름이 초안의 `mousedown`·`pointerdown` 리스너, `:active`, 포커스에 닿는다. "plain press never reaches the canvas" 규칙이 막는 것을 다시 여는 것이라 제외한다.
- **캔버스 문서의 Selection으로 칠하기**: 포커스 없는 OOPIF의 선택은 Chromium이 inactive 색으로 흐리게 칠하고, 색을 바꾸려면 캔버스에 `::selection`을 넣어 초안의 스타일을 덮어야 한다. contenteditable 안에서는 포커스를 옮길 수 있다. overlay로 바꿨다(사용자 결정).
- **⌥-드래그 안내만 추가**: ⌥ 누름은 초안을 실제로 움직이고, 사용자가 원한 "Select에서 바로 긁기"가 아니다.

## 사용자 결정 (2026-11-12)

1. 목적은 복사뿐이다. 대화 인용은 하지 않는다.
2. 누름은 캔버스로 보내지 않고 스크립트가 범위를 만든다.
3. 하이라이트는 앱 overlay에 사람이 고른 accent 색의 반투명으로 칠한다. 캔버스의 Selection과 `::selection`은 쓰지 않는다.
4. 텍스트 드래그는 요소 선택을 바꾸지 않는다. 움직이지 않은 클릭만 요소를 선택한다.
5. Esc는 텍스트 선택을 먼저 지운다.
6. 더블클릭 단어 선택은 넣지 않는다.
7. 복사는 마지막에 만든 선택이 이긴다.
8. 범위는 시작점의 가장 안쪽 프레임(프레임 밖이면 노트) 안으로 묶는다.
9. 상한을 넘으면 앞부분만 복사하고 알리지 않는다.
10. Space, 휠 팬, 핀치, 줌은 텍스트 선택을 지우지 않는다.
11. 캔버스의 `user-select: none`은 무시한다.
12. 리뷰가 추천한 나머지 관례(Esc 사슬의 자리, 지우는 때, 화면 4px 기준, 수식 키, 드래그 중 키·커서·hover·Following, seq와 문서 토큰, 위조 메시지 범위)를 모두 받아들였다.

## 영향 받는 구성요소

- **앱(injected canvas script)**: `app/src/main/canvasScript.ts`.
  - `pointerdown`(capture)은 지금처럼 `preventDefault`·`stopPropagation`한다. 조건(아래 '시작 조건')이 맞으면 텍스트 드래그 후보를 기억한다: 시작 캐럿, 화면 좌표(`screenX`·`screenY`), 범위 경계(가장 안쪽 프레임 또는 노트). 포인터 캡처는 `document.documentElement`에 건다.
  - `pointermove`에서 `textDragState`가 드래그로 바뀌면: 앱에 드래그 시작을 알리고, `*{cursor:text!important}` constructed sheet를 adopt한다(picking의 crosshair와 같은 방식). 포인터 자리의 캐럿까지 `Range`를 갱신하고 경계 안으로 묶는다. 사각형(`Range.getClientRects()`, 문서 좌표)을 animation frame마다 한 번 보낸다.
  - `pointerup`에서 텍스트를 한 번 읽어 보낸다('텍스트 읽기'). 드래그로 끝난 누름의 `click`은 지금처럼 막고 `choose`를 부르지 않는다.
  - 드래그는 `pointerup`, `pointercancel`, `lostpointercapture`, window `blur`, `clear-text` 명령, pick 시작, 문서 unload에서 끝난다. 끝날 때 포인터 캡처를 놓고 cursor sheet를 뗀다. `pointercancel`·`lostpointercapture`·`blur`는 그때까지의 범위를 남기고, `clear-text`·Esc·pick은 범위를 지운다. 다음 `pointerdown`에서 드래그 상태를 처음부터 다시 잡는다.
  - 레이아웃이 바뀌면(스크립트가 이미 보는 layout 갱신 시점) 들고 있는 `Range`로 사각형을 다시 보낸다. 범위의 끝 노드가 문서에서 빠지면 범위를 지운다.
  - 드래그 중 hover를 숨기고, 드래그가 끝나면 hover 상태와 hover 중복 제거 값(`lastHover` 등)을 비워 포인터가 멈춘 채로도 다시 그리게 한다(POSTMORTEM 2026-10-23).
  - window `copy`(capture): 캔버스 프레임에 포커스가 있을 때(⌥-클릭 뒤) ⌘C와 Edit > Copy는 이 문서로 온다. 스크립트가 범위를 들고 있으면 `clipboardData.setData("text/plain", text)`, `preventDefault`, `stopImmediatePropagation`을 한다. 범위가 없으면 지금처럼 둔다.
- **앱(renderer)**:
  - `app/src/renderer/canvasMessage.ts`: 새 메시지 파싱(아래 '메시지').
  - `app/src/renderer/CanvasController.ts`: 캔버스 텍스트 상태(사각형, 텍스트, 드래그 중 여부), overlay 표시, `clear-text` 전이, 드래그 중 V·H·Space 무시, Following에 드래그로 알림, 놓을 때 `focusOnClick`과 같은 조건으로 캔버스 영역에 포커스, 드래그 시작에서 앱 문서 선택 접기(`getSelection().removeAllRanges()`), 앱 문서 `selectionchange`가 비어 있지 않은 선택을 만들면 `clear-text`. 휠 팬·핀치로 보드가 움직이면 포인터의 새 캔버스 좌표를 `text-point`로 스크립트에 보낸다(PoC 5: 포인터가 멈춘 채 보드가 움직이면 iframe은 `pointermove`를 받지 않는다).
  - `app/src/renderer/canvasTool.ts` `escapeStep`: 입력에 `canvasText: boolean`, 결과에 `"clearText"`를 더한다. 순서는 `cancelPick`, `cancelCapture`, `editable`(null), `selectTool`(Hand) 다음, `stepSelection` 앞이다.
  - 복사: 새 순수 함수 `textCopy`(`app/src/renderer/canvasTextCopy.ts`)와, `CanvasController`가 keydown과 함께 등록·해제하는 앱 문서 `copy` 리스너(bubble). `chipField.onCopy`와 `copyText.ts`(capture, `execCommand`)가 먼저 처리한 이벤트는 `defaultPrevented`로 건너뛴다.
  - overlay: 지금 hover·선택 표시를 그리는 overlay에 텍스트 범위 사각형 층을 더한다. 색과 투명도는 `/design-draft`에서 정한다.
- **앱(main)**: 바뀌지 않는다. Edit > Copy는 `role: "copy"` 그대로다(PoC 3: 앱 문서에 선택이 없어도 메뉴가 켜져 있고 포커스된 문서에 `copy`가 온다).
- **CLI(Go)**, **스킬**, **가이드**, `doan active`, app-socket, export viewer: 바뀌지 않는다.

## 시작 조건

- 주 버튼(`button === 0`), ⌘·⌥·Ctrl·Shift 없음, `picking === null`, Select 도구, 드래그 레이어가 없음(Hand·Space·capture 아님).
- 누른 점의 캐럿(`document.caretPositionFromPoint`)이 `Text` 노드이고, 다음 중 하나다: 캐럿 앞이나 뒤 글자(`offset - 1` 또는 `offset`)의 사각형이 누른 점을 담는다(PoC 1), 또는 누른 요소(`event.target`)가 그 텍스트 노드를 직접 자식으로 담는다(padding에서 누름). 바깥 프레임의 배경을 누르면 시작하지 않는다.
- 캔버스의 `user-select`는 보지 않는다(사용자 결정).
- 제외: `input`, `textarea`, `select`, contenteditable 안, 중첩 iframe 안(스크립트 없음), Shadow DOM 안(`caretPositionFromPoint`에 shadow root를 넘기지 않으므로 host가 나온다. BACKLOG에 남긴다).

## 범위 경계

- 경계는 시작점의 가장 안쪽 프레임(`data-doan-frame`), 프레임 밖이면 시작점의 노트(프레임 밖 클릭이 선택하는 요소와 같은 규칙)다.
- 끝점 캐럿이 경계 밖이면 문서 순서로 비교해 경계의 처음이나 끝으로 묶는다. 캐럿이 없으면(빈 곳) 마지막 끝점을 유지한다.

## 텍스트 읽기

- 놓을 때 한 task 안에서: `*{user-select:text!important}` constructed sheet를 adopt하고, 캔버스 문서의 기존 선택(⌥-드래그 등)을 저장한 뒤, 범위를 Selection에 넣어 `toString()`을 읽고, 기존 선택을 되돌리고, sheet를 뗀다. 같은 task라 화면에 칠해지지 않는다(PoC 2). 브라우저의 선택 직렬화를 그대로 써서 숨은 텍스트, 줄바꿈, 표 칸을 브라우저와 같게 얻는다.
- 캔버스 문서에는 `selectionchange`가 일어난다. 받아들이는 차이로 둔다.
- 상한 `MAX_COPY_TEXT`(코드 포인트 기준, 예: 100,000. 값은 `/tdd`에서 정한다)를 넘으면 서로게이트를 자르지 않게 앞부분만 보낸다(사용자 결정). `textQuote`(공백 접기)는 쓰지 않는다. 줄바꿈을 보존한다. 기존 `MAX_TEXT`(500)와 다른 상한이다.

## 메시지

ARCHITECTURE §3이 말하듯 내부 메시지라 JSON Schema, socket, CLI 계약에 없다. 형식 버전 변경 없음.

- 캔버스 → renderer `text-range`: `{ document, epoch, dragging, rects, text? }`. `rects`는 문서 좌표 사각형 목록(상한 있음), `text`는 놓을 때만 실린다. 빈 `rects`는 범위 없음이다.
- renderer → 캔버스 `clear-text`: `{ epoch }`. 스크립트는 범위와 드래그를 끝내고, 이후 메시지에 이 `epoch`를 싣는다.
- renderer → 캔버스 `text-point`: `{ x, y }`. 휠 팬·핀치 뒤 포인터의 새 캔버스 좌표(PoC 5에서 필요함을 확인했다).
- 순서: renderer는 `document`가 현재 문서 토큰이 아니거나 `epoch`가 마지막 `clear-text`의 것보다 작은 `text-range`를 버린다. 문서 토큰이 바뀌면(다시 불러오기, 같은 ID 이동, 전환) renderer가 직접 지운다. 스크립트의 unload 메시지에 기대지 않는다. Hand·Picker·Capture area 중에 온 `text-range`도 버린다.
- 상한: `text`가 `MAX_COPY_TEXT`를 넘거나 `rects`가 사각형 상한을 넘는 메시지는 위조만 만들 수 있으므로 버린다(기존 'Caps'와 같은 원칙). 스크립트는 보내기 전에 자른다.

## 복사

- `textCopy({ canvasText, defaultPrevented, onCanvasPage, overlayOpen })` → 넣을 텍스트 또는 `null`. 앱 선택은 조건에 없다: 앱 선택이 생기면 캔버스 텍스트가 지워지고, 캔버스 드래그가 앱 선택을 접기 때문이다(마지막 선택이 이김).
- 리스너는 `null`이 아니면 `clipboardData.setData("text/plain", text)`와 `preventDefault`를 한다. main은 renderer가 고른 문자열을 쓰지 않는다(`copyText.ts`의 "main never writes a string the renderer names"를 지킨다).
- 텍스트는 캔버스가 쓸 수 있는 데이터다(ARCHITECTURE §3 'Untrusted text'). 일반 텍스트로만 넣고 HTML로 그리지 않는다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `textDragState(prev, start, point, threshold)` → `"press" | "drag"`. 화면 좌표를 받는다. 한 번 `drag`면 원점으로 돌아와도 `drag`다. `canvasScript.ts`에서 export해 `CanvasLib`로 넘긴다(ARCHITECTURE §3 Injection "pure helpers passed as arguments").
2. `textBoundary(chain)` → 경계 노드의 위치(가장 안쪽 프레임, 아니면 노트). `frameStep`처럼 조상 사슬을 받는다. 같은 방식으로 `CanvasLib`에 넘긴다.
3. 코드 포인트 상한 자르기: 기존 `clipText`가 서로게이트를 지키는지 확인하고 재사용한다. 아니면 새로 둔다.
4. `textCopy` (`app/src/renderer/canvasTextCopy.ts`).
5. `escapeStep`에 `canvasText`와 `"clearText"`.
6. `parseCanvasMessage`의 `text-range`(타입, 상한, 문서 토큰, epoch).
7. 지우기 전이와 드래그 중 키 무시는 순수 함수가 아니다. `CanvasController.test.ts`에서 고정한다.
8. 스크립트 동작(시작 조건, 드래그 뒤 `click`이 `choose`를 부르지 않음, 끝나는 경우들, `copy` 리스너)은 `app/src/main/canvasScript.test.ts`의 "canvasScript selection input" 하네스로 고정한다.

## 관례 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 4 "Ordinary clicks suppress canvas actions; Option-click uses the canvas"와 ARCHITECTURE §3 'Input'("only trusted primary clicks select")은 지킨다. 누름은 캔버스로 가지 않는다. 새 동작은 스크립트가 만드는 범위와 앱 overlay다.
- `canvasScript.ts`의 'Input direction' 주석("text selection … stay inert")을 "브라우저 기본 텍스트 선택은 inert, 스크립트가 만드는 드래그 범위만"으로 고친다.
- ARCHITECTURE §3 'Untrusted messages'에 더할 문장: 위조한 `text-range`는 캔버스 페이지에서 ⌘C가 넣을 일반 텍스트와 overlay의 하이라이트 사각형(보드 안)을 바꿀 수 있을 뿐이다. 포커스를 가진 캔버스가 자기 `copy` 리스너로 이미 할 수 있는 일과 같은 수준이다.
- PRODUCT §5 'Text edit menu'의 선택 가능한 곳 목록에 캔버스 텍스트(Select 드래그)를 더한다. "Inside the canvas iframe … there is no menu"는 그대로다.
- PRODUCT §5 item 2: Esc 사슬에 "캔버스 텍스트 지우기"를 넣고, Following의 'a drag'에 텍스트 드래그를 넣는다. Capture area 시작이 텍스트 선택을 지우므로 캡처 이미지에는 하이라이트가 없다.
- PRODUCT §5 item 4: hover를 다시 계산하는 때에 "a text drag ending"을 더한다.
- 서빙 범위, sandbox iframe, 토큰 경로 같은 구조 결정은 건드리지 않는다.

## PoC 의존

`/tdd` 전에 격리 앱에서 확인한다. 1·2·3이 실패하면 멈추고 사용자에게 묻는다.

1. `document.caretPositionFromPoint`가 Electron 45 캔버스 iframe에서 글자, 버튼·링크 라벨, padding, `user-select: none`, `pointer-events: none` 위에서 무엇을 돌려주는지.
2. '텍스트 읽기'의 한 task 방식: `user-select: none`·`display: none` 텍스트, 블록 경계 줄바꿈, 표 칸이 어떻게 읽히는지. 화면에 선택이 한 프레임이라도 칠해지지 않는지. 캔버스 포커스가 바뀌지 않는지. 실패하면 대안은 텍스트 노드를 직접 걸어 읽는 순수 직렬화다.
3. 앱 문서에 선택이 없고 포커스가 캔버스 영역에 있을 때 ⌘C와 Edit > Copy(`role: "copy"`)가 앱 문서에 `copy` 이벤트를 보내는지, 메뉴 항목이 켜져 있는지, `setData`가 시스템 클립보드에 들어가는지. 캔버스 프레임에 포커스가 있을 때(⌥-클릭 뒤) 스크립트의 `copy` 리스너가 받는지. 대체 경로: 캔버스 텍스트가 있을 때 `beforecopy`를 `preventDefault`해 명령을 켠다. 메뉴가 회색이면 Edit > Copy를 `webContents.copy()`를 부르는 click 항목으로 바꾼다(문맥 메뉴가 이미 그렇게 한다, ARCHITECTURE §7 'Text edit menu').
4. `pointerdown`을 `preventDefault`한 뒤 `documentElement`의 포인터 캡처로 `pointermove`·`pointerup`이 iframe 밖과 창 밖까지 오는지. 드래그 중 Chromium이 기본 선택이나 drag and drop을 시작하지 않는지(링크, 이미지, `draggable`). 드래그 중 ⌘Tab.
5. 드래그 중 휠 팬과 핀치: 포인터가 멈춘 채 보드가 움직일 때 iframe이 새 `pointermove`를 받는지. 받지 않으면 renderer가 `text-point`로 새 좌표를 보낸다.

측정 방법은 POSTMORTEM 2026-11-03의 권고대로 레이아웃마다 페이지를 하나씩 쓴다.

### PoC 결과 (2026-11-13)

- 환경: 빌드한 앱(Electron 45.0.0, Chromium 156.0.8078.48)을 격리해 띄웠다(임시 userData·HOME·SHELL·DOAN_RUNTIME·CLI, `realState`·`assertRealState` 통과, `saveClipboard`·`restoreClipboard` 뒤 클립보드 해시가 같음). 실험 스크립트는 probe가 캔버스 iframe에 `frame.evaluate`로 넣었고 `app/src`는 바꾸지 않았다. 캔버스 페이지는 레이아웃마다 하나다(`ctc-caret`, `ctc-read`, `ctc-copy`, `ctc-drag`). 보드 배율은 61.4%였다.
- 입력: 포인터와 휠은 CGEvent를 HID tap에 보냈다(실제 포인터가 움직인다). ⌘C는 두 경로로 눌렀다: Playwright `keyboard.press("Meta+c")`(CDP 키 입력)와 CGEvent 키를 앱 pid에 보낸 네이티브 입력. Edit > Copy는 세 경로로 눌렀다: `app/runtime/windows.ts`의 `menu(app, page, "Copy")`, `Menu.sendActionToFirstResponder("copy:")`(메뉴 항목이 보내는 동작), System Events로 실제 메뉴 항목을 누름(AX press).
- 증거: `.scratch/runtime-test/canvas-text-copy/`의 `probe.mjs`, `results-main.json`(1–5 전체), `results.json`(1·5 재실행), `run-main.log`·`run-followup.log`, 스크린숏 `p1-caret.png`, `p2-positive-control.png`, `p2-focus-input-after-read.png`, `p3-copy.png`, `p4-after-drag.png`, `p5-ctrlWheelPinch.png`, `p5-wheelPan.png`. `invalid-run/`은 아래 '무효로 버린 실행'의 기록이다.

1. **통과.** `document.caretPositionFromPoint`는 있고 다음을 돌려준다.
   - 글자 위: 그 `Text`와 가장 가까운 글자 경계다. 누른 점을 담는 글자는 `offset` 쪽일 수도 `offset - 1` 쪽일 수도 있다(본문 중간과 버튼 라벨은 `offset - 1`, 링크는 `offset`). '시작 조건'의 글자 사각형 검사는 두 글자를 다 본다.
   - 버튼·링크 라벨: 라벨의 `Text`다.
   - padding과 줄 끝 오른쪽: 그 요소의 `Text`(처음 또는 끝)이고 글자 사각형은 점을 담지 않는다. 누른 요소가 그 `Text`를 직접 담으므로 시작 조건이 맞는다.
   - `user-select: none`: 그 `Text`를 그대로 돌려준다.
   - `pointer-events: none` 겹친 글자: 그 아래 요소의 `Text`를 돌려준다(`elementFromPoint`도 아래 요소). 겹친 글자에서는 드래그를 시작할 수 없고, 아래 글자에서 시작한다.
   - `input`: `Text`가 아니라 `input` 요소다. 빈 `div`와 프레임 배경도 요소(`offset 0`)라 시작하지 않는다.
   - 프레임 위 여백(`html`을 누름): 가장 가까운 문단의 `Text`를 돌려준다. 글자 사각형이 점을 담지 않고 `html`이 그 `Text`를 직접 담지 않으므로 시작 조건이 막는다.
   - iframe 문서 밖 좌표(왼쪽·오른쪽·위·아래): `null`이다. '범위 경계'의 "캐럿이 없으면 마지막 끝점 유지"가 이 경우다.
2. **통과.** '텍스트 읽기'의 한 task 방식으로 제목부터 마지막 문단까지 읽었다.
   - 결과: `"Heading one\nFirst unselectable words end.\n\nSecond\nline\n\nItem A\nItem B\na1\tb1\na2\tb2\nButton label\nLast para."`. `user-select: none` 글자는 sheet가 있을 때만 들어간다(없으면 빠짐). `display: none` 글자는 빠진다. 블록 경계는 줄바꿈, `<br>`도 줄바꿈, 표는 칸 사이 탭과 행 사이 줄바꿈이다. `Range.toString()`은 숨은 글자를 넣고 줄바꿈을 잃어 쓰지 않는다.
   - 칠함: 2 ms마다, 그리고 animation frame마다 읽기를 반복하는 동안(421회) 프레임 영역을 25번 찍었고 기준 화면과 모두 같았다. 선택을 남겨 둔 대조 화면은 달랐다(`p2-positive-control.png`, 포커스 없는 iframe의 회색 선택).
   - 포커스: 앱 `.area`에 포커스가 있을 때 읽어도 앱 포커스와 캔버스 `document.hasFocus()`가 그대로다. ⌥-드래그 같은 기존 문서 선택(방향 포함)은 되돌아온다. 캔버스 안 `input`에 포커스와 선택(3–5)이 있는 채로 읽으면 포커스는 남지만 input의 선택이 0–0으로 접힌다. 다만 평범한 누름은 지금처럼 캔버스 스크립트가 포커스된 요소를 blur하므로, 드래그를 놓을 때 input은 이미 포커스가 없고, 포커스 없는 input은 읽은 뒤에도 선택(3–5)을 지켰다. 실패로 보지 않는다.
   - 캔버스 문서에는 읽을 때마다 `selectionchange`가 한 번씩 일어난다(받아들인 차이).
   - 읽은 뒤 앱 `.area`에서 Tab은 캔버스 도구 버튼으로 가고 초안 안으로 들어가지 않았다. 보드도 움직이지 않았다(읽기 없음·읽기 있음·실험 스크립트 없음이 같음).
3. **통과, 대체 경로 필요 없음.** Edit 메뉴는 `role: "copy"` 그대로 둔다.
   - 앱 `.area`에 포커스가 있고 앱 문서에 선택이 없을 때: Playwright ⌘C, 네이티브 ⌘C, `copy:` 동작, 실제 메뉴 항목 누름이 모두 앱 문서에 `beforecopy`와 `copy`를 보냈다. 리스너의 `setData`가 시스템 클립보드에 들어갔다. 메뉴 항목은 켜져 있었다(AX `enabled` true). `beforecopy` `preventDefault`를 더해도 결과가 같다.
   - 평범한 네이티브 클릭 뒤 상태(`focusOnClick`이 `.area`로 포커스를 옮김)도 위와 같다.
   - ⌥-클릭으로 캔버스 프레임에 포커스가 있을 때: 같은 네 경로가 캔버스 문서에만 `beforecopy`·`copy`를 보냈고 앱 문서는 받지 못했다. 캔버스에 선택이 없어도 `copy`가 왔고, 캔버스 리스너의 `setData`가 클립보드에 들어갔다. 캔버스 안 `beforecopy` `preventDefault`는 필요 없었다.
   - `app/runtime/windows.ts`의 `menu(app, page, "Copy")`는 role 항목에서 아무것도 하지 않았다(두 문서 모두 이벤트 없음, 클립보드 그대로). macOS에서 role 항목의 JS `click`은 동작하지 않기 때문으로 보인다(원인은 Electron 소스로 확인하지 않음). 작업 6의 `/runtime-test`는 Edit > Copy를 System Events의 메뉴 누름이나 `Menu.sendActionToFirstResponder("copy:")`로 누른다.
4. **통과(⌘Tab은 대체 입력).** 네이티브 드래그에서 캔버스 스크립트가 `pointerdown`을 `preventDefault`한 뒤 실험 스크립트가 `document.documentElement.setPointerCapture`를 걸었다.
   - 옆 프레임 위, 앱 사이드바 위(iframe 밖), 창 밖(창 왼쪽 120px)에서도 `pointermove`가 계속 왔고 모두 `hasPointerCapture` true였다(40개 중 16개가 iframe 밖 좌표). 창 안으로 돌아와 놓으면 `pointerup`과 `lostpointercapture`가 왔다.
   - 링크 글자에서 시작한 드래그, 이미지와 `draggable` 블록을 지나는 드래그, `draggable` 블록 글자에서 시작한 드래그 모두에서 `dragstart`·`selectstart`가 0이었다. 캔버스 문서와 앱 문서의 선택은 비어 있었고, 초안의 요소 리스너(`pointerdown`·`mousedown`·`mouseup`·`click`·`dblclick`·`focusin`)는 아무것도 받지 않았다. 이미지 위 누름은 캐럿이 `p` 요소라 시작하지 않았다.
   - 드래그 뒤의 `click`은 window capture 리스너에 온다. 캔버스 스크립트는 지금 이 `click`으로 `choose`를 부르므로, 설계대로 드래그로 끝난 누름의 `click`을 막아야 한다.
   - ⌘Tab 대신 드래그 중 Finder를 활성화했다. 캔버스 window의 `blur`, `pointercancel`, `lostpointercapture`가 오지 않았고, 버튼을 누른 채 돌아오자 `pointermove`가 이어졌으며 놓을 때 `pointerup`으로 끝났다. 캔버스 window에는 처음부터 포커스가 없으므로(포커스는 앱 `.area`) 그 `blur`로는 앱 전환을 알 수 없다. 버튼을 누른 채 돌아오면 드래그가 이어지는 것을 받아들인다. 실제 ⌘Tab 키는 누르지 않았다(미검증).
5. **iframe은 새 `pointermove`를 받지 않는다. `text-point`가 필요하다.** 드래그 중 포인터를 멈추고 네이티브 휠 6번으로 보드를 240px 팬하거나 Ctrl 휠(핀치와 같은 경로)로 61.4%→88%로 줌해도 iframe의 `pointermove` 수와 마지막 좌표, 범위가 그대로였다. 휠 이벤트 자체는 iframe에 왔다(6번, 캔버스 스크립트가 앱에 보내 팬·줌함). 그 자리에서 1px 네이티브 이동을 하자 새 캔버스 좌표가 담긴 `pointermove`가 왔다. 따라서 renderer는 휠 팬·핀치로 보드가 움직이면 `text-point`로 포인터의 새 캔버스 좌표를 보낸다.

무효로 버린 실행: 처음 실행에서 ⌥ 플래그를 실은 CGEvent가 시스템 HID 상태에 Option을 눌린 채로 남겼다. 그 뒤의 "평범한" 클릭이 모두 ⌥-클릭이 되어 2의 Tab, 3의 일부, 4, 5 결과가 오염됐다(`invalid-run/`). Option을 풀고 네이티브 도구가 매 이벤트의 플래그를 정하고 ⌥ 뒤에 `flagsChanged`로 지우게 고친 뒤 1–5를 다시 돌렸다. 위 결과는 그 실행이고, 실행 전후 HID 플래그에 수식 키가 없었다.

## POSTMORTEM에서 가져온 함정

- **2026-10-23 — Hover stayed hidden across direct reentry and Alt focus transfer**: ARCHITECTURE §3 'Evidence limits'가 이 사례를 든다("pointer and focus tests prove only their exercised sequences (hover re-entry and Alt focus transfer once regressed with passing tests)"). 예방 규칙은 단일 포인터 점프를 시험하고, 소비자의 표시를 무효화하면 생산자의 중복 제거 캐시도 무효화하라는 것이다. → 드래그가 끝날 때 hover 중복 제거 값을 비우고, probe에서 드래그 뒤 같은 요소로 한 번에 점프해 hover가 돌아오는지 본다.
- **2026-10-23 — Hover commands discarded pending selection replies**: 채널마다 seq를 따로 둔다(ARCHITECTURE §3 'Ordering'). → 텍스트 범위는 `epoch`와 문서 토큰을 쓰는 독립 채널이고, selection·hover seq를 건드리지 않는다.
- **2026-11-02 — Tab walked into the draft, drew its focus rings and scrolled the floating tools away**: "A runtime probe of a canvas page presses Tab through it at least once with a focusable control below the fold." → 이번 변경은 포커스를 iframe으로 옮기지 않는다. probe 캔버스에 fold 아래 포커스 가능한 컨트롤을 두고 드래그 뒤 Tab을 누른다.
- **2026-10-27 — Runtime clipboard capture constructed an item with no MIME types** (와 2026-11-12 재발): probe는 `app/runtime/clipboard.ts`의 `saveClipboard`·`restoreClipboard`로 사람의 클립보드를 저장하고 되돌린다.
- **2026-11-07 — A reply one byte over the cap passed because its length was checked only on a read failure**: 상한 경계값과 +1, astral 문자로 넘는 경우를 테스트한다.

## 초안 요청

- 경로 `.doan/canvases/canvas-text-copy.html`, 캔버스 id `canvas-text-copy`, 폭 1600.
- 프레임:
  - `surfaces`: 하이라이트를 밝은 캔버스, 진한 캔버스, 보라 캔버스(`.doan/assets/mock.css`의 `--mock-bg`, `--mock-dark-bg`, `--mock-violet-bg`) 위에 그린다. 한 줄 범위, 여러 줄 범위, 버튼 라벨, 같은 요소에 요소 선택 표시가 있는 경우.
  - `drag`: 누름(아직 4px 전, hover 표시), 드래그 중(하이라이트, 텍스트 커서, hover 없음, 요소 선택 표시 유지), 놓음(하이라이트 유지, hover 복귀), 프레임 경계에서 묶임(포인터는 옆 프레임, 하이라이트는 시작 프레임 끝까지).
  - `buddies`: 다섯 버디 accent(violet, puri, dori, dungdung, popo)마다 같은 범위.
- `/design-sync`는 `surfaces`와 `drag`의 하이라이트 사각형과 표시(색, 투명도, 표시와의 겹침 순서)를 비교한다.
- 제약: overlay는 캔버스 위에 있으므로 하이라이트가 글자 위를 덮는다. 색은 `--affordance-accent`의 반투명이다(기존 jump highlight의 `color-mix(in srgb, var(--affordance-accent) 45%, transparent)`와 같은 방식). 새 문구는 없다.
- 사용자 결정(2026-11-13): 칠은 `color-mix(in srgb, var(--affordance-accent) 30%, transparent)`이고 링은 두지 않는다. 보라 캔버스나 인디고 버튼처럼 accent에 가까운 바탕에서는 칠과 바탕의 대비가 1.02~1.04로 범위가 거의 보이지 않는다. 이것을 받아들였다. 1px 패널 링 안은 검토했지만 넣지 않았다.
- 사용자가 앱에서 초안(`surfaces`, `drag`, `buddies`, 커밋 `2c4f7e13`)을 확인했다(2026-11-13).
- `Range.getClientRects()`는 범위가 통째로 담은 요소의 border box도 돌려준다. 사각형은 범위 안 `Text` 노드의 것만 쓴다. 그래야 겹친 곳의 알파가 쌓이지 않는다.

## 디자인 프리셋

overlay 하이라이트의 색, 투명도, 진한 캔버스 위 대비는 `/design-draft`에서 정한다. 새 문구는 없다.
