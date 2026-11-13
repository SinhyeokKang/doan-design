# prototype-responsive — design

spec.md '결정'(사용자 확인)을 구현하는 방법이다.

## 지금 코드 (확인한 사실)

- `app/src/main/prototype/fit.ts`: `PROTOTYPE_CHROME`(header 56, side 8, bottom 8), `PROTOTYPE_WINDOW_MIN_WIDTH` 360, `PROTOTYPE_NARROW_BELOW` 344. `fitPrototypeWindow(size, workArea, current?)`는 창 콘텐츠 bounds를, `prototypeIframeBox(panelWidth, markWidth)`는 iframe의 가로 상자(x, width)만 돌려준다. 높이는 늘 패널 전체다.
- `app/src/renderer/prototype/PrototypeWindow.tsx` `ContentPanel`: 패널 폭을 `ResizeObserver`로 읽어 `prototypeIframeBox`로 iframe과 정지 이미지의 `left`·`width`를 정한다. 상태 overlay(`.pw-panel > .problem-overlay`, z-index 5)는 콘텐츠 패널만 덮고, 덮는 동안 `.pw-content`는 `inert`다.
- `app/src/main/prototypeWindow.ts` `capture(markWidth)`: 창 콘텐츠 크기와 `prototypeIframeBox`로 캡처 사각형을 main에서 다시 계산하고 `capturePage`로 창의 그 영역을 보이는 대로 찍는다. 그래서 모드는 main도 알아야 한다.
- `app/src/main/prototype/windowState.ts`: `OpenState.run`은 `{url, markWidth}`이고 표시 높이는 없다. `fitHint`와 history의 `size`에만 높이가 있다. `ClosedState`는 `gen`과 `history`만 갖는다.
- `prototypeScript.ts`는 프레임이 viewport 폭을 채우고 높이는 최소 viewport 높이가 되게 한다. 그래서 iframe 크기가 곧 프레임의 viewport다.
- 캔버스 툴바: `app/src/renderer/CanvasTools.tsx`, `styles.css`의 `.doan-canvas-bottom`(보드 아래 20 위 가운데, 자기 폭, 자식만 포인터를 받음)과 `.doan-canvas-tools`, DESIGN.md 'Canvas area and right panel' 'Tools row'('.doan-floating' 90 % 흰 유리, `--blur-sm`, `--shadow-panel`, radius 24, inset 4, gap 2, 40 px `md` 버튼, 눌린 버튼은 hover·누르는 동안에도 `--affordance-backdrop-pressed`).

## 영향 범위

| 파일 | 변경 |
|---|---|
| `app/src/main/prototype/fit.ts` | 순수 함수 1. `prototypeIframeBox`와 `PROTOTYPE_NARROW_BELOW`를 대체한다(결정 5) |
| `app/src/main/prototype/ipc.ts` | `PrototypeMode = "fit" \| "responsive"`. `PrototypeView`에 `mode`, `run`에 표시 높이(`{url, markWidth, markHeight}` 또는 `mark: PrototypeSize`). 요청 채널 `prototype:mode`, `PROTOTYPE_WINDOW_REQUESTS`에 추가, `PrototypeWindowApi.setMode(mode)` |
| `app/src/main/prototype/requests.ts` | 순수 함수 3 |
| `app/src/main/prototype/windowState.ts` | 순수 함수 2. `ClosedState`와 `OpenState`에 `mode`. `start`와 `result`가 `run`에 표시 높이를 둔다 |
| `app/src/main/prototype/controller.ts` | 모드 입력, `host.capture`에 표시 크기와 모드를 넘긴다 |
| `app/src/main/prototypeWindow.ts` | `capture`가 순수 함수 1의 상자(줄인 크기)로 사각형을 만든다 |
| `app/src/main/senderAllowed.ts`, `app/src/main/index.ts` | `prototype:mode`를 프로토타입 role에만 허용하고 핸들러를 단다 |
| `app/src/preload/prototype.ts` | `setMode`. 채널 이름 고정 테스트(`prototype.test.ts`) |
| `app/src/renderer/prototype/host.ts` | 순수 함수 4 |
| `app/src/renderer/prototype/view.ts` | 모드 이름과 tooltip 문구(순수 함수 5) |
| `app/src/renderer/prototype/PrototypeWindow.tsx` | `ContentPanel`의 폭·높이 측정과 `transform: scale`, 모드 툴바(새 컴포넌트 `PrototypeModeTools`) |
| `app/src/renderer/CanvasTools.tsx` → 새 `app/src/renderer/toolbarKeys.ts` | `moveBetweenTools`를 옮겨 두 툴바가 같은 함수를 쓴다. 캔버스 툴바 동작은 바뀌지 않는다 |
| `app/src/renderer/styles.css` | 툴바 자리(`.pw-tools`), `.doan-canvas-tools` 규칙을 그대로 쓰는 선택자, 패널 안 프레임 배치, overlay 아래 여백 |

CLI(Go), 스킬, guide, 공유 스키마, 프로토타입 창 헤더는 바뀌지 않는다.

## 모드별 iframe 상자

순수 함수 1 `prototypeViewportBox(panel, mark, mode)`가 iframe의 CSS 크기와 놓는 자리를 정한다.

- Responsive: `{x: 0, y: 0, width: panel.width, height: panel.height, scale: 1}`. 표시 폭과 상관없다(결정 5).
- Fit: `scale = min(1, panel.width / mark.width, panel.height / mark.height)`. iframe의 CSS 크기는 `mark.width × mark.height`이고, `transform: scale(scale)`과 `transform-origin: 0 0`으로 줄인다. 줄인 상자(`mark × scale`)가 패널 가운데에 오게 `x`, `y`를 정한다(정수로 내림).
- 줄여도 iframe 문서의 layout viewport는 CSS 크기 그대로라서 `innerWidth`, `innerHeight`, media query, `100vh`가 표시 크기를 따른다. 이 가정은 PoC로 확인한다('PoC 의존').
- 상자는 패널 크기와 표시 크기, 모드로만 정한다. 프레임 문서에서 잰 값을 다시 넣지 않는다(아래 POSTMORTEM 2026-11-01). 툴바 자리도 빼지 않는다(결정 2: 툴바는 프레임 위에 뜬다).
- 패널 높이도 재야 하므로 `ContentPanel`의 `ResizeObserver`가 폭과 높이를 함께 읽는다.
- Fit에서 패널이 표시보다 크면 프레임 바깥은 패널 면이다. 프레임 경계를 어떻게 보일지(외곽선, 바깥 면 색)는 `/design-draft`에서 그린다.

## 모드 상태와 IPC

- 모드는 main의 `PrototypeState`에 둔다. `CLOSED`에도 있어서 창을 닫아도 남고, 앱 종료로만 사라진다(결정 4). 형제 feature `prototype-conversation`이 패널 열림·폭을 두는 방식과 같다.
- 모드를 바꾸는 요청은 `prototype:mode`(payload `"fit" | "responsive"`)다. 프로토타입 창의 main frame만 보낸다. 같은 모드면 아무 일도 하지 않는다.
- 전환은 effect가 없다: gen을 올리지 않고, `load`·`fit`·`kill`이 없다. 새 view만 보낸다. renderer는 같은 iframe 요소의 크기만 바꾼다(ARCHITECTURE §3 'Canvas view'의 "iframe is never reused"는 새 run에 대한 규칙이라 그대로다).
- 캡처: main은 run이 ready에서 벗어날 때 iframe 영역을 찍는다. 사각형은 `PROTOTYPE_CHROME`과 순수 함수 1의 줄인 상자다. 형제 feature의 대화 패널이 열려 있으면 콘텐츠 패널 폭에서 대화 열 폭을 뺀다(그쪽 feature도 `capture`의 패널 폭을 고치므로, 나중에 합쳐지는 쪽이 둘을 함께 쓴다).
- 정지 이미지 자리: renderer는 스냅숏이 도착할 때의 상자를 함께 저장한다(순수 함수 4). 그 뒤 모드를 바꿔도 정지 이미지는 찍힌 자리와 크기를 지킨다. 다음 run은 새 모드 상자로 놓인다.

## 모드 툴바

### 자리

- `.pw-panel` 안, 아래 가장자리에서 20 위 가운데에 놓는다(캔버스의 `.doan-canvas-bottom`과 같은 값). 래퍼는 포인터를 받지 않고 캡슐만 받는다. 캡슐은 테두리 1 + inset 4 + 40 + 2 + 40 + inset 4 + 테두리 1 = 92 × 50이다.
- 기준은 창이 아니라 콘텐츠 패널이다. 그래서 형제 feature의 대화 패널이 열려 콘텐츠 패널이 좁아지면 툴바도 그 가운데로 옮겨 간다. 대화 열의 손잡이와 겹치지 않는다. 콘텐츠 패널이 가장 좁을 때(형제 feature 기준 360, 대화 패널 없이 360 창이면 344)에도 92 폭은 들어간다.
- z-index는 상태 overlay(5)보다 위인 6이다. `.pw-content` 밖에 있으므로 overlay가 콘텐츠를 `inert`로 만들어도 툴바는 쓸 수 있다.

### 가리는 것

- 툴바는 프레임 위에 뜬다(결정 2). iframe 상자와 창 맞춤은 툴바 자리를 빼지 않으므로, Responsive와 1배 Fit에서는 프레임 viewport의 아래쪽 가운데, 아래 가장자리에서 20–70 높이의 92 폭 영역을 가린다. 모바일 프레임에서는 보통 하단 탭 막대의 가운데 항목, 주요 버튼, home indicator가 있는 자리다. 그 영역의 클릭은 툴바가 받고, 캡슐 양옆은 프레임이 받는다.
- Fit에서 프레임이 줄어 패널 아래쪽에 빈 면이 생기면 툴바가 프레임 밖에 놓일 수 있다. 일부러 그렇게 맞추지는 않는다.
- 저절로 숨기지 않는다. 캔버스 툴바도 숨지 않고, 숨기면 모드 컨트롤을 찾기 어렵다.

### 상태 overlay와 Esc

- 로딩·실패·lost overlay는 콘텐츠 패널을 덮고 툴바는 그 위에 남는다. 실패·lost 장면이 툴바에 가리지 않도록 overlay의 아래 padding을 80으로 한다(20 + 툴바 50 + 10, 캔버스 safe area의 아래쪽 값과 같다). 장면이 넘치면 지금처럼 overlay가 스크롤한다(DESIGN.md 'Frame prototype' 'State overlay', 360 × 284).
- Esc: 프로토타입 창의 Esc는 드로어를 닫거나 프레임 콘텐츠로 간다(PRODUCT §5 item 2). 툴바 tooltip이 열린 채 Esc를 누르면 Radix가 tooltip만 닫는다. 캔버스 툴바의 `onEscapeKeyDown`(캔버스의 다음 Esc 단계)은 연결하지 않는다. 프로토타입 창에는 그런 단계가 없기 때문이다. 툴바에 포커스가 있고 tooltip이 없을 때 Esc는 아무 일도 하지 않는다.

### 포커스와 Tab 순서

- DOM에서 툴바를 `.pw-content`보다 앞에 둔다. 그래서 Tab 순서는 헤더 → 툴바(눌린 버튼 하나) → 프레임 콘텐츠 → 형제 feature의 대화 패널이다. 프레임은 Tab 정지가 많을 수 있어서, 툴바를 그 뒤에 두면 닿기 어렵다. 보이는 자리(아래)와 Tab 순서(콘텐츠 앞)가 다른 점은 `/design-draft`에서 확인한다.
- 형제 feature의 "Tab 순서는 헤더 → 프레임 콘텐츠 → 패널"은 툴바를 헤더와 콘텐츠 사이에 넣어도 그대로 성립한다.

### 캡처에 들어가는 툴바

- `capturePage`는 창을 보이는 대로 찍으므로, 툴바가 iframe 상자와 겹치면 정지 이미지에 툴바가 함께 찍힌다. 캡처 직전에 툴바를 숨기려면 main이 renderer에 묻고 기다려야 하는데, 캡처는 상태가 ready를 벗어나는 그 단계의 effect보다 먼저 시작해야 한다(ARCHITECTURE §3 'Timeout and kill'). 그래서 숨기지 않는다.
- 정지 이미지는 찍힌 자리에 그대로 놓이고 실제 툴바는 같은 창 위치에 있으므로, 패널 크기가 그대로면 찍힌 툴바는 실제 툴바 밑에 정확히 숨는다. 실패·lost 화면에서는 정지 이미지 위에 overlay의 흐림도 있다.
- 정지 이미지가 보이는 동안 창 크기를 바꾸거나 대화 패널을 열고 닫으면, 찍힌 툴바가 흐림 밑에서 실제 툴바와 어긋나 보인다. 이 차이는 받아들이고 DESIGN.md 'Frame prototype'의 documented differences에 적는다.

## 툴바 재사용

사용자 지시("캔버스의 툴바와 동일한 스타일 재사용")와 결정 2에 따라 모습을 그대로 쓴다.

- 그대로 쓰는 것: `.doan-floating` 캡슐, `doan-icon-button doan-canvas-tool` `data-ui-size="md"` 버튼, `.doan-canvas-tools`의 규칙(아이콘 색, 눌린 버튼 채움 유지, 간격 2), `role="toolbar"`와 `aria-label`, `aria-pressed`, 눌린 버튼만 `tabIndex=0`, ←/→ 이동(`moveBetweenTools`를 `toolbarKeys.ts`로 옮겨 함께 쓴다), 공유 `Tooltip`·`TooltipTrigger`(asChild).
- 컴포넌트는 새로 둔다(`PrototypeModeTools`). `CanvasTools`는 Select/Hand 목록, Picker, Capture area, Play, Export, docked buddy 자리, 캔버스 Esc 단계를 props로 묶은 캔버스 전용 컴포넌트라서 두 버튼만 꺼내 쓸 수 없다. 공용 컴포넌트로 나누는 리팩터는 하지 않는다.
- 클래스는 그대로 붙인다(`doan-floating doan-canvas-tools`). 그러면 `styles.css`의 툴바 규칙이 같은 값으로 걸린다. `.doan-canvas-bottom > .doan-canvas-tools`처럼 캔버스 자리에만 걸리는 규칙은 `.pw-tools` 자리 규칙으로 따로 둔다.
- 빼는 것: 키 tooltip(`has-key`와 `doan-kbd`, 단축키가 없으므로), docked buddy 자리, 구분선, `onEscapeKeyDown`.
- 아이콘은 lucide 1.61.0(앱 의존성)에 있는 후보 `Proportions`, `Scaling`, `Shrink`, `MoveHorizontal`, `Expand` 중에서 `/design-draft`에서 고른다.

## 헤더

- 이 feature는 헤더를 바꾸지 않는다. 결정 9를 위해 형제 feature들이 더하는 [Export][대화 버튼]만 있을 때 360 창을 다시 계산했다.
- 이름 버튼 왼쪽 끝은 창에서 200이다(DESIGN.md 'Frame name': `.pw` 8 + 헤더 padding 8 + traffic light 72 + 버튼 32 × 3 + 간격 4 × 2 + 8). 오른쪽 그룹은 32 + 4 + 32 = 68이고, 창 오른쪽 inset은 16이다(`.pw` 8 + 헤더 padding 8). 이름 버튼과 그룹 사이 간격을 왼쪽과 같은 8로 두면 360 창에서 이름 버튼 폭은 360 − 200 − 8 − 68 − 16 = 68이다.
- 68 폭 안에서 `.shell-search`의 padding 10 × 2, 간격 8, chevron 16을 빼면 글자 자리는 24다. 버튼은 들어가고, 이름은 2–3글자와 말줄임표로 보이며, 잘리면 지금처럼 tooltip이 전체 이름을 보인다. 지금 360 창의 이름 버튼(144)보다 76 좁아지는 것은 형제 feature들의 변경 때문이고, 그 폭은 두 feature가 정한다(`prototype-cli-export` design.md "모드 전환의 자리와 프레임 이름 버튼의 폭은 세 기능의 초안이 맞춰 정한다").
- 그래서 More 메뉴와 `prototypeHeaderOverflow`는 두지 않는다.

## 순수 함수로 뺄 것 (`/tdd` 대상)

1. `prototypeViewportBox(panel: {width, height}, mark: PrototypeSize, mode)` (`main/prototype/fit.ts`) → `{x, y, width, height, scale}`. Responsive 채움(표시 폭 240 포함), Fit 1배(패널이 더 큼, 가운데), Fit 축소(폭 기준, 높이 기준, 둘 다), 패널 0.
2. `setMode(state, mode)` (`main/prototype/windowState.ts`) → `Step`. 같은 모드면 같은 state 객체(뷰를 보내지 않음), 다른 모드면 effect 없이 `mode`만 바뀜, `CLOSED`에서도 남음, 처음 값은 Responsive. `play`·`reload`·`back`·`forward`·`choose`·창 닫힘 뒤 `mode` 유지. `start`·`result`가 `run`에 표시 높이를 두는지.
3. `parseModeRequest(kind, value)` (`main/prototype/requests.ts`) → `"fit" | "responsive" | null`. role 불일치, 다른 문자열, 객체를 거절.
4. `layersForSnapshot` 확장 (`renderer/prototype/host.ts`): 스냅숏에 도착 때의 상자를 함께 저장하고, 이후 view의 모드가 바뀌어도 그 상자를 유지.
5. `modeTooltip(mode, mark)` (`renderer/prototype/view.ts`) → "Fit to 390 × 844", "Responsive". 표시가 아직 없을 때(view가 없음)는 "Fit".

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11), app-socket, `runtime.json`, `.doan/config.json`, CLI 응답, userData 파일은 바뀌지 않는다. 형식 버전 `v`도 그대로다.
- 바뀌는 것은 앱 내부 IPC뿐이다: 요청 채널 `prototype:mode`, `PrototypeView.mode`, `PrototypeView.run`의 표시 높이, preload API `setMode`. ARCHITECTURE §7 'Prototype window IPC'의 "No new format"은 그대로 참이다.

## 규칙(conventions) 영향

- 없다. convention 14의 표시 뜻("that first viewport size")은 그대로다. Responsive에서는 첫 크기이고, Fit에서는 계속 그 크기다. 새 `doan check` 규칙도 없다. guide가 바뀌지 않으므로 `/agent-eval`도 필요 없다.

## 결정 영향

- **sandbox iframe**(`allow-scripts allow-forms`, no `allow-same-origin`), 주입 스크립트, navigation gate, partition, kill 규칙은 그대로다. 줄이기는 바깥 문서의 CSS `transform`이고 iframe 안으로 아무것도 넣지 않는다.
- **PRODUCT §5 item 2 'Prototype window'**: 'One window'의 "lays the frame out again when the person resizes it, like a browser viewport; a frame narrower than the content panel of a 360 px window keeps its own width, centred"가 모드별 문장으로 바뀐다. 모드 툴바(자리, 가리는 영역, Tab 순서, 기억)와 'Content'의 "the frame fills the window's content panel as a viewport"가 모드별로 바뀐다. 'Header'의 "Tab reaches Back, Forward, Reload and the name before the frame's content"에 툴바가 더해진다. 마지막 task가 고친다.
- **ARCHITECTURE §3 'Prototype window'**: 'Rendering in place'의 "sized to the content panel, so `innerWidth`… follow the window"가 모드별로, 'Fit'의 `PROTOTYPE_NARROW_BELOW` 문장이 없어지고 Fit 모드 설명으로, 'Timeout and kill'의 캡처 영역이 모드별 상자로 바뀐다(툴바가 찍힌다는 사실 포함). §7 'Prototype window IPC'에 모드 요청이 더해진다.
- **형제 feature와 겹치는 곳**
  - `prototype-conversation`: 대화 패널은 콘텐츠 패널 폭을 가져간다. Responsive에서는 그만큼 viewport가 줄고(그쪽 spec 그대로), Fit에서는 viewport가 표시 크기를 지키고 패널이 좁아지면 줄어든다. 그쪽의 창 폭 규칙(360·640, 열 때 640으로 넓힘, 패널을 연 채 Play하면 표시 + 패널 폭)은 콘텐츠 패널에 대한 규칙이라 두 모드에서 같다. 그쪽 design.md '패널 폭'의 "마크가 344보다 좁은 프레임은 지금처럼 자기 폭을 지키고 가운데에 놓인다"는 결정 5와 맞지 않는다. 이 feature의 승격 task가 PRODUCT·ARCHITECTURE에 결정 5를 적고, 그쪽 문서가 아직 남아 있으면 그 문장을 "Responsive는 패널을 채우고, 표시 크기는 Fit이 지킨다"로 고친다. `prototypeIframeBox`와 `capture`의 패널 폭은 두 feature가 함께 고치므로 나중에 합쳐지는 쪽이 맞춘다. 툴바는 콘텐츠 패널 기준이라 대화 열과 겹치지 않는다.
  - `prototype-cli-export`: 헤더는 바뀌지 않는다. 내보낸 파일은 모드와 상관없이 viewport를 채운다(그쪽 결정 5). `doan open --prototype`의 재생은 다른 Play처럼 모드를 유지한다. 그쪽 design.md와 tasks.md 2의 "모드 전환의 자리"는 헤더에 없으므로 헤더 배치에서 빠진다.
  - 초안: 세 feature가 각자 새 초안을 그리고 기존 `frame-prototype.html`은 고치지 않는다.

## PoC 의존

Fit 축소(결정 1)는 아직 확인하지 않은 가정에 기댄다. 첫 task로 Electron 45 격리 앱에서 확인한다.

- 프로토타입 partition의 cross-origin sandboxed iframe(별도 renderer process)에 바깥 문서가 `transform: scale(s)`을 걸어도 iframe 문서의 `innerWidth`·`innerHeight`·`matchMedia`·`100vh`가 CSS 크기(표시 크기) 그대로인지.
- 줄인 iframe에서 클릭, hover, 드래그, 휠 스크롤, 텍스트 선택이 맞는 요소에 닿는지.
- 줄인 글자가 흐리지 않게 다시 그려지는지(눈으로 확인, 스크린샷).
- `webContents.capturePage(rect)`가 줄인 iframe을 보이는 대로 찍는지.
- 모드 전환으로 iframe 크기를 바꿔도 문서가 다시 불러와지지 않고 `resize`만 받는지(입력 값과 열린 모달 유지).

실패하면 design.md를 고치고 사용자에게 결정 1을 다시 묻는다. Responsive는 지금 코드와 같은 방식이라 PoC가 필요 없다.

## POSTMORTEM에서 가져온 함정

- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: "a wrapper that adapts props for some states keeps the same component tree in every state and decides inside it". 모드 버튼은 눌림이 바뀌어도 같은 요소로 남아야 한다. 두 상태를 렌더해 자식 요소의 `type`이 같은지 테스트하고, 실제 앱에서 포커스된 버튼의 눌림을 바꾼 뒤 `document.activeElement`를 읽는다. view가 없을 때 쓸 수 없게 하는 처리도 같은 트리 안에서 한다.
- **2026-11-07 'A toolbar tooltip took the Esc the canvas needed'**: "a Radix layer over a control whose Esc matters hands the decision on rather than taking the step". 프로토타입 창의 Esc는 드로어를 닫거나 프레임 콘텐츠로 간다. 툴바 tooltip이 열린 채 Esc를 누르면 tooltip만 닫히고 다른 일이 없음을 테스트하고, 열린 드로어가 있을 때의 Esc 순서도 함께 본다.
- **2026-11-01 'A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever'**: "for any value the canvas measures against a size the renderer then sets from it, test the loop to its fixed point". 이 feature의 iframe 상자는 패널 크기와 표시 크기로만 정하고 프레임 문서에서 잰 값을 받지 않으므로 고리가 생기지 않는다. 이 성질을 유지한다.

## 디자인 프리셋

- `clarify`: 이름은 사용자가 정한 "Fit", "Responsive"이고 tooltip은 결과를 말한다("Fit to 390 × 844"). 크기는 숫자를 구조로 두고 "×"(U+00D7)와 공백을 PRODUCT·DESIGN의 크기 표기와 맞춘다. 화면 낭독기 이름은 보이는 tooltip과 같다.
- `adapt`: "A size is not a device"에 따라 기기 이름을 쓰지 않는다. 좁은 콘텐츠 패널(344–360)에서도 툴바가 들어가는지 확인했다.
- `harden`: 로딩·실패·lost 상태에서 툴바, overlay 아래 여백, 정지 이미지 자리, 작업 영역보다 큰 표시를 상태로 다룬다.

## 참고와 출처

- Chrome DevTools의 device toolbar(Responsive 크기, 가장자리 손잡이, "Fit to window" 줌)는 기억으로만 참고했다. 2026-11-13에 `developer.chrome.com/docs/devtools/device-mode`를 열려 했지만 이 환경에서 접속하지 못해(`ENOTFOUND`) 확인하지 못했다. 이 문서의 어느 규칙도 그 동작에 기대지 않는다.
- 캔버스 툴바: `app/src/renderer/CanvasTools.tsx`, `styles.css` `.doan-canvas-bottom`·`.doan-canvas-tools`, DESIGN.md 'Canvas area and right panel' 'Tools row'. 헤더와 overlay 수치: DESIGN.md 'Frame prototype'.
