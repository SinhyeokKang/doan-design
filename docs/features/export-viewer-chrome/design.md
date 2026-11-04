# export-viewer-chrome — design

## 영향받는 구성 요소

- **CLI(Go) viewer 파일**: `cli/internal/export/viewer/`의 `shell.html`, `shell.css`, `lib.js`, `shell.js`, `measure.js`. 빌드 단계 없이 손으로 쓴 JS/CSS이고, `cli/internal/export/assemble.go`가 `//go:embed viewer/*`로 넣는다. 앱 코드와의 일치는 `app/src/main/exportViewer.test.ts`가 고정한다(ARCHITECTURE §3 'Exported canvas and viewer': copies pinned, 같은 class 이름).
- **app(TS)**: 앱 코드는 바뀌지 않는다. `exportViewer.test.ts`가 새 viewer 함수와 앱 원본(`canvasTool.ts`의 `toolShortcut`, `selection.ts`의 `editableTarget`, `viewport.ts`의 `panBy`, `CanvasTools.tsx`의 Select·Hand 항목)을 비교하도록 넓어진다. `CanvasTools.tsx`에서는 Select·Hand 두 항목(이름·키·아이콘·순서)과 toolbar 이름만 고정하고, 버튼 전체 목록은 고정하지 않는다. canvas-composer-polish가 앱 툴바에 Picker·Export를 더하기 때문이다.
- **skills·guide·`doan check`**: 바뀌지 않는다. `cli/internal/cli/skill.md`의 `doan export` 줄은 그대로다.
- **공유 포맷**: 바뀌지 않는다. CLI 응답과 출력 파일 이름 규칙도 그대로다.

## 구조

### content panel

- `shell.html`: `body` 아래에 `.doan-canvas-panel`(앱과 같은 class 이름)을 두고 헤더, `#board`, 툴바 `.doan-canvas-bottom`을 그 안에 형제로 둔다. 툴바는 `#board` 안에 두지 않는다. `#board`는 스크롤 상자로 남으므로, 안에 두면 툴바가 함께 스크롤된다.
- `shell.css`: body 배경 `--bg-app`, panel은 흰 배경·8px 여백·네 모서리 24px·`position: relative`·`overflow: clip`·`isolation: isolate`. 보드는 panel 안을 채운다. 토큰 값은 viewer CSS에 이미 복사된 방식대로 값으로 넣고, 테스트가 앱 토큰과 비교한다(이 테스트는 지금 없으므로 새로 만든다). 새로 복사할 값: `.doan-canvas-bottom`이 쓰는 `--space-5`, tooltip 키의 `.doan-kbd`(`on-prominent`, `sm`).
- JavaScript 없는 화면: panel은 CSS라 그대로 보인다. 툴바는 `.js`가 없으면 헤더 도구처럼 숨는다(`shell.css`의 헤더 도구 규칙과 같은 방식).
- 쌓임 순서: 헤더 메뉴(Frames, 확대 메뉴) > 툴바 > 보드. 메뉴는 보드 영역으로 내려오므로 툴바보다 위에 둔다.
- 창이 작을 때(960px 미만)는 지금도 확인하지 않은 영역이다(DESIGN.md 'Not verified'). panel 여백은 창 크기와 상관없이 8px로 둔다.
- 클래식 스크롤바에서는 툴바(보드 아래 20px)가 `#board`의 가로 스크롤바 위에 놓일 수 있다. C1에서 확인하고, 겹치면 DESIGN.md에 적는다.

### 툴바와 Hand

- 마크업: `.doan-canvas-bottom` 안에 `.doan-canvas-tools`(`role="toolbar"`, `aria-label="Canvas tools"`)와 Select·Hand 버튼 두 개. 앱 `CanvasTools.tsx`처럼 버튼은 `aria-pressed`, `aria-label`, `aria-keyshortcuts`(`V`, `H`), `data-ui-size="md"`를 갖고, 눌린 도구만 `tabindex=0`이다. 도구가 바뀌면 Tab 자리도 새로 눌린 도구로 옮긴다. ←/→는 포커스만 옮기고 끝에서 멈추며, Home/End는 없다(앱 `moveBetweenTools`).
- tooltip: viewer에는 지금 tooltip이 없다(헤더는 `title`을 쓴다). 툴바 버튼에만 작은 tooltip을 새로 그린다. 마우스를 올리거나 키보드로 포커스하면 이름과 키(`.doan-kbd`)를 보이고, pointerdown·blur·Esc에 닫힌다. tooltip이 둘 뜨지 않도록 버튼에는 `title`을 두지 않는다.
- 아이콘: lucide `MousePointer2`, `Hand`의 path를 inline SVG로 넣는다. `xmlns="http://…"`는 파일 규칙(`https?:` 금지) 때문에 쓰지 않는다(지금 viewer SVG와 같다).
- 끌기 표면: 캔버스는 sandbox iframe이라 iframe 위의 pointer 이벤트를 부모가 받지 못한다. 앱은 따로 `.drag-layer`를 띄운다. viewer는 Hand이거나 Space를 누르고 있거나 끌기가 진행 중일 때(`layerShown`) iframe에 `pointer-events: none`을 주고, `#board`에서 pointer를 받는다. 그러면 iframe 위의 휠도 `#board`에 닿아 네이티브 스크롤(관성 포함)과 지금의 ⌘/Ctrl-휠 listener(`shell.js`)를 그대로 쓴다. 따로 layer를 두면, `#board` 안에서는 함께 스크롤되어 사라지고 밖에서는 휠 처리를 다시 복사해야 한다. ARCHITECTURE §3의 "iframe의 `pointer-events`는 pick만 바꾼다"는 앱의 규칙이고, viewer에는 pick이 없다.
- 끌기 순서: `#board`에서 pointerdown(주 버튼만, 스크롤바 위는 무시, `setPointerCapture`) → pointermove마다 증분만큼 이동 → pointerup·pointercancel·lostpointercapture에서 끝난다. Hand 끌기의 pointerdown은 `#board`에 포커스를 준다(`preventScroll`). 그래야 뒤이은 Esc·V·H가 부모에 온다(앱 `layerDown`과 같다). 끄는 중에 누른 V·H·Esc나 뗀 Space는 pointerup 뒤에 적용한다(ARCHITECTURE §3 'Input').
- 캔버스가 그려지기 전(`viewer.phase`가 `ready`가 아닐 때)에는 `layerShown`이 거짓이다. 그때 누르고 있던 Space는 그려진 뒤로 이어지지 않는다(앱 `CanvasController`와 같다).
- 이동 모델: viewer는 보기를 `.board`의 네이티브 스크롤로 다룬다(`lib.js`의 `geometry`·`scrollFor`·`viewFrom`). 끌기는 `scrollLeft/Top`을 증분만큼 바꾸고, 스크롤 범위(0부터 최대 스크롤까지) 밖으로는 가지 않는다. 앱의 `panBy`는 범위가 없지만 viewer는 이 범위 안에서만 움직인다(사람의 결정). 범위 안에서는 앱의 `panBy`와 같은 결과(보기 이동)를 내는 순수 함수를 `lib.js`에 두고, 범위 끝에서는 그 값에 멈춘다. 확대 범위(`MIN_SCALE`, `MAX_SCALE`)는 스크롤 모델에서 이미 지켜진다. Safari는 `scrollLeft/Top`을 정수로 맞추므로, pointermove 증분의 소수 나머지는 다음 이동으로 넘겨 커서와 어긋나지 않게 한다.
- Hand의 일반 휠: 앱 `wheelAction(input)`(`viewport.ts`)은 도구를 받지 않는다. 앱에서 Hand의 일반 휠이 항상 이동하는 것은 layer가 iframe을 덮어 휠이 캔버스 영역으로 가기 때문이다(ARCHITECTURE §3 'Input'). viewer도 같은 방식이다. Hand에서는 iframe이 `pointer-events: none`이므로 휠이 `#board`에 닿는다. 일반 휠은 네이티브 스크롤로 이동하고, ⌘/Ctrl-휠은 포인터 위치에서 확대한다. `wheelAction`은 바꾸지 않는다.
- 키 판정: `toolShortcut`(`app/src/renderer/canvasTool.ts`)과 그것이 쓰는 `editableTarget`(`selection.ts`), `TOOL_KEYS`, `CONTROL_ROLES`, `interactiveTarget`을 `lib.js`에 복사한다. `TOOL_KEYS`·`CONTROL_ROLES`·`interactiveTarget`은 앱에서 export되지 않아 텍스트 골든으로 고정할 수 없다. 그래서 같은 이벤트 표(code, repeat, IME, 수정 키, keyup, 가짜 target)를 앱과 viewer의 `toolShortcut`에 넣어 값으로 비교하고, `editableTarget`도 같은 방식으로 비교한다.
- 부모 문서: document의 keydown/keyup(bubble)에서 `toolShortcut(event, { canvasPage: true })`로 판정한다. 메뉴의 keydown handler가 먼저 처리해 `preventDefault`한 키는 `toolShortcut`이 거른다. Frames나 확대 메뉴가 열려 있는 동안 메뉴 handler는 V·H(`code`)도 처리한 키로 막는다. 그래서 키는 메뉴에 남고 도구는 바뀌지 않는다(사람의 결정). 메뉴 안 Space는 지금처럼 메뉴 항목을 고른다. 툴바 버튼을 마우스로 누른 뒤 포커스는 그 버튼에 남고, 그 위의 Space는 `toolShortcut`의 컨트롤 규칙대로 버튼을 누른다(앱과 같다, 사람의 결정). ⇧1·⇧0은 지금처럼 부모 문서의 keydown에서만 처리하고 iframe에서 넘기지 않는다(사람의 결정). Space를 누르고 있는 동안에는 반복 keydown까지 모두 `preventDefault`한다. `#board`는 `tabindex=0`인 스크롤 상자라, 막지 않으면 Space가 한 화면 아래로 스크롤한다.
- iframe 안: `measure.js`(앞에 `lib.js`가 붙는다)가 bubble 단계에서 같은 `toolShortcut`으로 판정한다. `defaultPrevented`인 키는 보내지 않으므로 캔버스 자신의 키 처리가 이긴다. 보내는 키는 Space down/up, V/H, 편집 가능한 대상이 아닐 때의 Escape다. 앱 `canvasScript.ts`의 판정은 버튼을 빼지 않는다. viewer는 Select에서 캔버스 내용을 지금처럼 조작하므로 `toolShortcut`의 규칙(포커스된 컨트롤 위의 Space는 그 컨트롤을 누른다, PRODUCT §5 item 2 'Toolbar')을 따른다. 보낸 Space keydown은 iframe 안에서도 `preventDefault`한다. `lib.js`의 `parseMessage`가 `key`를 받아들인다. 이것이 ARCHITECTURE §3의 "Left out: … key forwarding"을 바꾸는 부분이다.
- Space가 남지 않게 하는 규칙(앱 ARCHITECTURE §3 'Tool keys'와 같다):
  - Space-up은 모든 keyup에서 보내고, 수정 키·편집 대상·IME·반복 조건과 상관없이 항상 처리한다.
  - 부모는 iframe이 보낸 Space-down을 `document.activeElement`가 그 iframe일 때만 받는다. 캔버스 자신의 스크립트가 보낸 메시지로 끌기 상태가 되지 않게 하기 위해서다.
  - `measure.js`는 자기 창의 blur와 pagehide에서 Space-up을 보낸다.
  - 부모는 창 blur에서 `document.hasFocus()`가 거짓일 때만 Space를 놓는다(iframe으로 간 blur는 유지). iframe의 `load`(캔버스가 다른 문서로 이동)에서도 놓는다. 이 blur 처리는 지금의 팝업 blur handler(`shell.js`)와 같은 이벤트를 쓰므로 서로 막지 않게 둔다.
- Esc: `escapeStep`은 복사하지 않는다. 앱 함수는 viewer에 없는 `cancelPick`·`clearSelection`을 돌려주기 때문이다. viewer 규칙은 "Hand이고, 편집 대상이 아니고, 아직 처리되지 않은(`defaultPrevented`가 아닌) Esc면 Select로"다. 순서는 tooltip 닫기 → 열린 메뉴 닫기(메뉴 handler가 `preventDefault`한다) → Hand를 Select로. Select에서 Esc는 아무것도 하지 않고 기본 동작도 막지 않는다.
- 커서: 끌기 표면이 켜지면 `#board`는 `grab`, 끄는 중 `grabbing`(앱 styles.css의 `.drag-layer` 규칙과 같은 값). `cursor: url(...)`은 쓰지 않는다.
- 코드 주석: 도구와 키가 없다고 적은 주석(`lib.js`의 복사본 목록과 `parseMessage` 위, `shell.js`·`measure.js` 머리말)을 새 규칙에 맞게 고친다.

### 초안 요청 (`/design-draft`)

viewer는 이미 main에 있는 화면이고 이 feature는 parent의 redesign child가 아니다. 그래도 사람이 이 feature에 한해 새 초안을 그리는 것을 승인했다(tasks U0). 새 초안은 C2의 측정 기준이다.

- 캔버스: `.doan/canvases/export-viewer-chrome.html`, id `export-viewer-chrome`. 기존 `canvas-row-menu.html`의 `viewer-shell` 프레임은 고치지 않는다.
- 프레임(960px 창, content panel과 헤더·보드·툴바): `viewer-select`(Select 눌림), `viewer-hand`(Hand 눌림), `viewer-dragging`(끄는 중, `grabbing` 커서).
- 제약: 값은 spec 완료 조건 1·2와 위 구조를 따른다. 프레임 목록에 없는 상태는 그리지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

모두 `lib.js`(DOM 없는 함수만, `exportViewer.test.ts` 규칙)에 둔다. 앱 원본이 있는 것은 앱 원본과 비교하고, 없는 것은 viewer 동작만 테스트한다.

- `toolShortcut(event, …)`와 `editableTarget`: 앱 함수와 같은 이벤트 표로 값 비교.
- `panScroll(scroll, max, dx, dy)` 또는 같은 역할: 끌기 증분 → 새 스크롤 좌표. 스크롤 범위 안에서는 앱 `panBy`와 같은 보기 이동이 되는지 값으로 비교하고, 범위를 넘는 증분은 0과 최대 스크롤에서 멈추는지 확인한다(캔버스가 보드보다 좁은 방향은 최대 스크롤이 0이라 움직이지 않는다).
- `layerShown(tool, spaceHeld, dragging, boardDrawn)`: 앱 `syncLayer`의 조건을 옮긴 판정. `syncLayer`는 부수 효과가 있는 private 메서드라 viewer 동작으로만 테스트한다.
- viewer의 Esc 판정(`hand`, `editable`, `defaultPrevented` → Select로 바꿀지): viewer 동작으로 테스트.
- `parseMessage`의 `key` 메시지(형식 검증, Space down/up·V·H·Escape 외의 키 거부).
- `toolbarMove(index, count, key)`: ←/→ 순서, 끝에서 멈춤. 앱 `moveBetweenTools`는 export되지 않고 DOM을 다루므로 viewer 동작으로만 테스트한다.

## 포맷 변경

- 공유 JSON Schema, `v`, CLI 응답, app socket 메시지: 없다.
- 출력 파일: viewer HTML·CSS·JS가 바뀐다. `assemble.go`의 placeholder(`NAME:2, WIDTH:1, META:1, STYLE:1, SCRIPT:1, SRCDOC:1`)는 늘리지 않는다. 늘려야 하면 `assemble_test.go`와 `exportViewer.test.ts`의 placeholder 수를 함께 고친다.
- 크기: viewer가 커지는 만큼 50 MiB 상한 안의 여유가 준다. 늘어나는 바이트를 측정해 tasks 결과에 적는다.

## 컨벤션 영향

없다. 캔버스 컨벤션, 에이전트 규칙, `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **PRODUCT §5 item 3 'Export and viewer'**: "no selection, tools, …"를 "no selection, … ; Select and Hand tools as on the canvas page"로 바꾼다. 사용자 요청이며 Z1에서 고친다.
- **ARCHITECTURE §3 'Exported canvas and viewer'**: "Left out: … key forwarding"에서 key forwarding을 빼고, 앞으로 넘기는 키는 Space, V, H, Escape뿐이라고 적는다. 이유: Hand·Space·Esc는 포커스가 캔버스 안에 있을 때도 동작해야 앱과 같다. 끄는 동안 iframe에 주는 `pointer-events: none`, Space를 놓는 규칙, 복사본 목록의 `canvasTool.ts`·`editableTarget`도 적는다.
- **CSP 없음, sandbox `allow-scripts`만, 외부 요청 없음**: 유지한다. 새 코드도 inline이고 요청을 만들지 않는다. message listener는 계속 하나(`acceptMessage`)다.
- **한 파일, 네트워크 없음, 50 MiB**: 유지한다.

## PoC 의존

없다. Safari(WebKit)에서 iframe `pointer-events: none` 상태의 `#board` pointer capture와 iframe→부모 key 메시지가 동작하는지는 C1에서 Playwright WebKit과 실제 Safari로 확인한다. 실제 Safari를 열 수 없으면 그렇게 적고 미확인으로 남긴다.

## POSTMORTEM에서 가져온 함정

- 2026-11-02 'Tab walked into the draft, drew its focus rings and scrolled the floating tools away': 떠 있는 툴바를 가진 상자는 `overflow: clip`이어야 한다. viewer는 툴바를 스크롤 상자 `#board` 밖, `overflow: clip`인 panel 안에 두어 이를 지킨다. iframe의 `tabindex=-1`은 가져오지 않는다. 앱에서 캔버스 안 컨트롤은 목업이지만, viewer의 Select는 캔버스 내용을 지금처럼 조작하므로 Tab이 캔버스 안 컨트롤에 닿아야 한다(지금 viewer iframe에는 tabindex가 없다). Tab이 iframe 안 요소로 가며 스크롤되는 것은 `#board`뿐이고 툴바는 그대로다.
- 2026-10-23 'Hover stayed hidden across direct reentry and Alt focus transfer': OOPIF의 `pointerout`은 믿을 수 없다. 끌기 표면(iframe `pointer-events`)은 pointer 이벤트가 아니라 도구·Space·끌기 상태로만 정한다.
- 2026-11-01 'A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever', 2026-10-26 'A reloaded canvas stayed 150 px tall when its iframe was off-screen': panel 구조를 바꿀 때 높이 측정 경로(`measure.js`, `nextHeight`)를 건드리지 않는다.
- 2026-11-02 'The canvas conversation panel's head was 8px shorter than the canvas header': 헤더를 panel 안으로 옮길 때 높이 56px을 유지한다.
