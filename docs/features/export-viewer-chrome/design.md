# export-viewer-chrome — design

## 영향받는 구성 요소

- **CLI(Go) viewer 파일**: `cli/internal/export/viewer/`의 `shell.html`, `shell.css`, `lib.js`, `shell.js`, `measure.js`. 빌드 단계 없이 손으로 쓴 JS/CSS이고, `cli/internal/export/assemble.go`가 `//go:embed viewer/*`로 넣는다. 앱 코드와의 일치는 `app/src/main/exportViewer.test.ts`가 고정한다(ARCHITECTURE §3 'Exported canvas and viewer': copies pinned, 같은 class 이름).
- **app(TS)**: 앱 코드는 바뀌지 않는다. `exportViewer.test.ts`가 새 viewer 함수와 앱 원본(`canvasTool.ts`, `viewport.ts`, `CanvasTools.tsx`의 키·순서)을 비교하도록 넓어진다.
- **skills·guide·`doan check`**: 바뀌지 않는다. `cli/internal/cli/skill.md`의 `doan export` 줄은 그대로다.
- **공유 포맷**: 바뀌지 않는다. CLI 응답과 출력 파일 이름 규칙도 그대로다.

## 구조

### content panel

- `shell.html`: `body` 아래에 `.doan-canvas-panel`(앱과 같은 class 이름)을 두고 헤더와 `#board`를 그 안으로 옮긴다. `shell.css`: body 배경 `--bg-app`, panel은 흰 배경·8px 여백·네 모서리 24px·`overflow: clip`·`isolation: isolate`. 보드는 panel 안을 채운다. 토큰 값은 viewer CSS에 이미 복사된 방식대로 값으로 넣고 테스트가 앱 토큰과 비교한다.
- 창이 작을 때(960px 미만)는 지금도 확인하지 않은 영역이다(DESIGN.md 'Not verified'). panel 여백은 창 크기와 상관없이 8px로 둔다.

### 툴바와 Hand

- 마크업: `.doan-canvas-bottom` 안에 `.doan-canvas-tools`(`role="toolbar"`, 이름 "Canvas tools")와 Select·Hand 버튼 두 개. 앱 `CanvasTools.tsx`의 순서·접근 이름·`aria-pressed`·roving tabindex·←/→를 따른다. tooltip은 앱의 Radix tooltip 대신 viewer가 그리는 작은 tooltip(이미 있는 viewer 팝업 방식)으로, 이름과 키(`V`, `H`)를 보인다.
- 아이콘: lucide `MousePointer2`, `Hand`의 path를 inline SVG로 넣는다. `xmlns="http://…"`는 파일 규칙(`https?:` 금지) 때문에 쓰지 않는다(지금 viewer SVG와 같다).
- drag layer: 캔버스는 sandbox iframe이라 iframe 위의 pointer 이벤트를 부모가 받지 못한다. 앱처럼(`CanvasController.syncLayer`) 보드 위에 `.drag-layer`를 두고, Hand이거나 Space를 누르고 있거나 끌기가 진행 중일 때만 보인다. layer에서 pointerdown(주 버튼만, `setPointerCapture`) → pointermove마다 증분만큼 이동 → pointerup.
- 이동 모델: viewer는 보기를 `.board`의 네이티브 스크롤로 다룬다(`lib.js`의 `geometry`·`scrollFor`·`viewFrom`). 끌기는 `scrollLeft/Top`을 증분만큼 바꾼다. 앱의 `panBy`와 같은 결과(보기 이동)를 스크롤 좌표로 계산하는 순수 함수를 `lib.js`에 둔다. 확대 범위(`MIN_SCALE`, `MAX_SCALE`)는 스크롤 모델에서 이미 지켜진다.
- Hand의 일반 휠: 지금 `wheelAction`은 Select의 앱 동작과 같다. 앱처럼 Hand에서 일반 휠은 항상 이동하도록 도구를 인자로 받는다(앱 `wheelAction`이 이미 도구를 받는지 확인해 그 모양을 그대로 복사한다).
- 키: `toolShortcut`·`escapeStep`(`app/src/renderer/canvasTool.ts`)을 `lib.js`에 복사하고 텍스트 골든으로 고정한다. 부모 문서에 포커스가 있을 때는 부모의 keydown/keyup으로 처리한다. iframe 안에 포커스가 있을 때는 `measure.js`가 Space down/up과 V/H를 `key` 메시지로 보내고(앱 `canvasScript.ts`와 같은 판정: 수정 키·IME·편집 가능한 대상·반복 제외), `lib.js`의 `parseMessage`가 `key`를 받아들인다. 이것이 ARCHITECTURE §3의 "Left out: … key forwarding"을 바꾸는 부분이다.
- Esc 순서: viewer에는 메뉴(확대 메뉴, Frames)가 있으므로 "열린 메뉴 닫기 → Hand를 Select로" 순서다.
- 커서: layer는 `grab`, 끄는 중 `grabbing`(앱 styles.css의 `.drag-layer` 규칙과 같다). `cursor: url(...)`은 쓰지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

모두 `lib.js`(DOM 없는 함수만, `exportViewer.test.ts` 규칙)에 두고 앱 원본과 비교한다.

- `toolShortcut(event, …)`, `escapeStep(…)`: `canvasTool.ts`의 텍스트 골든.
- `panScroll(scroll, dx, dy)` 또는 같은 역할: 끌기 증분 → 새 스크롤 좌표. 앱 `panBy`와 같은 보기 이동이 되는지 값으로 비교한다.
- `wheelAction(…, tool)`: Hand에서 일반 휠은 이동. 앱 함수와 값 비교.
- `layerShown(tool, spaceHeld, dragging, boardDrawn)`: 앱 `syncLayer` 조건의 순수 판정.
- `parseMessage`의 `key` 메시지(형식 검증, 알 수 없는 키 거부).
- `toolbarMove(index, key)`: ←/→ roving 순서.

## 포맷 변경

- 공유 JSON Schema, `v`, CLI 응답, app socket 메시지: 없다.
- 출력 파일: viewer HTML·CSS·JS가 바뀐다. `assemble.go`의 placeholder(`NAME:2, WIDTH:1, META:1, STYLE:1, SCRIPT:1, SRCDOC:1`)는 늘리지 않는다. 늘려야 하면 `assemble_test.go`와 `exportViewer.test.ts`의 placeholder 수를 함께 고친다.
- 크기: viewer가 커지는 만큼 50 MiB 상한 안의 여유가 준다. 늘어나는 바이트를 측정해 tasks 결과에 적는다.

## 컨벤션 영향

없다. 캔버스 컨벤션, 에이전트 규칙, `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- **PRODUCT §5 item 3 'Export and viewer'**: "no selection, tools, …"를 "no selection, … ; Select and Hand tools as on the canvas page"로 바꾼다. 사용자 요청이며 Z1에서 고친다.
- **ARCHITECTURE §3 'Exported canvas and viewer'**: "Left out: … key forwarding"에서 key forwarding을 빼고, 앞으로 넘기는 키는 Space와 V/H뿐이라고 적는다. 이유: Hand와 Space는 포커스가 캔버스 안에 있을 때도 동작해야 앱과 같다.
- **CSP 없음, sandbox `allow-scripts`만, 외부 요청 없음**: 유지한다. 새 코드도 inline이고 요청을 만들지 않는다. message listener는 계속 하나(`acceptMessage`)다.
- **한 파일, 네트워크 없음, 50 MiB**: 유지한다.

## PoC 의존

없다. Safari(WebKit)에서 sandbox iframe 위 drag layer의 pointer capture와 iframe→부모 key 메시지가 동작하는지는 C1에서 Playwright WebKit과 실제 Safari로 확인한다. 실제 Safari를 열 수 없으면 그렇게 적고 미확인으로 남긴다.

## POSTMORTEM에서 가져온 함정

- 2026-11-02 'Tab walked into the draft, drew its focus rings and scrolled the floating tools away': 변환된 보드와 떠 있는 툴바를 가진 상자는 `overflow: clip`이어야 하고, iframe은 `tabindex=-1`이다. viewer에 툴바가 생기므로 그대로 적용한다.
- 2026-10-23 'Hover stayed hidden across direct reentry and Alt focus transfer': OOPIF의 `pointerout`은 믿을 수 없다. layer 표시는 pointer 이벤트가 아니라 도구·Space 상태로만 정한다.
- 2026-11-01 'A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever', 2026-10-26 'A reloaded canvas stayed 150 px tall when its iframe was off-screen': panel 구조를 바꿀 때 높이 측정 경로(`measure.js`, `nextHeight`)를 건드리지 않는다.
- 2026-11-02 'The canvas conversation panel's head was 8px shorter than the canvas header': 헤더를 panel 안으로 옮길 때 높이 56px을 유지한다.
