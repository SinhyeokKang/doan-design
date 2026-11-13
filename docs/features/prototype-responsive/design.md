# prototype-responsive — design

spec.md '결정'(사용자 확인)을 구현하는 방법이다. 용어는 spec.md 머리의 정의(Fit 모드, Responsive 모드, 창 맞춤)를 따른다.

## 지금 코드 (확인한 사실)

- `app/src/main/prototype/fit.ts`: `PROTOTYPE_CHROME`(header 56, side 8, bottom 8), `PROTOTYPE_WINDOW_MIN_WIDTH` 360, `PROTOTYPE_NARROW_BELOW` 344. `fitPrototypeWindow(size, workArea, current?)`는 창 콘텐츠 bounds를, `prototypeIframeBox(panelWidth, markWidth)`는 iframe의 가로 상자(x, width)만 돌려준다. 높이는 늘 패널 전체다.
- `app/src/renderer/styles.css`: `.pw`는 `grid-template-rows: var(--size-chrome) minmax(0, 1fr)`에 `padding: 0 var(--space-2) var(--space-2)`이다. 헤더는 콘텐츠 패널 위의 56 줄이고, 패널 아래는 8 여백이다. `.pw-panel`은 `overflow: hidden`이다(1833행).
- `app/src/renderer/prototype/PrototypeWindow.tsx` `ContentPanel`: 패널 폭을 `ResizeObserver`로 읽어 `prototypeIframeBox`로 iframe과 정지 이미지의 `left`·`width`를 정한다. 모든 iframe이 같은 자리(`place`)를 쓴다. 상태 overlay(`.pw-panel > .problem-overlay`, z-index 5)는 콘텐츠 패널만 덮고, 덮는 동안 `.pw-content`는 `inert`다.
- `app/src/main/prototypeWindow.ts` `capture(markWidth)`: 창 콘텐츠 크기와 `prototypeIframeBox`로 캡처 사각형을 main에서 다시 계산하고 `capturePage`로 창의 그 영역을 찍는다. Electron의 `Rectangle`은 정수만 받는다(`electron.d.ts`). 캡처가 실패하면 `controller.ts`의 `.catch(() => null)` 때문에 정지 이미지가 조용히 빠진다.
- `app/src/main/prototype/windowState.ts`: `OpenState.run`은 `{url, markWidth}`이고 표시 높이는 없다. `start`는 표시 크기를 모르면(읽기 실패 뒤 `listChanged`) `markWidth`를 0으로 둔다. `report`는 ready 크기로 `markWidth`만 바꾼다. `start`의 `base`와 `close`는 state를 펼치지 않고 새 객체를 만든다. `ClosedState`는 `gen`과 `history`만 갖는다.
- `senderAllowed.ts`와 `index.ts`는 프로토타입 창 요청 목록을 `PROTOTYPE_WINDOW_REQUESTS`에서 만든다. 요청별 처리는 `controller.ts`의 `request` switch에 있다. 목록은 `ipc.test.ts`(목록 `toEqual`)와 `preload/prototype.test.ts`(채널 집합)가 고정한다.
- `prototypeScript.ts`는 프레임이 viewport 폭을 채우고 높이는 최소 viewport 높이가 되게 한다. 그래서 iframe 크기가 곧 프레임의 viewport다.
- 캔버스 툴바: `app/src/renderer/CanvasTools.tsx`, `styles.css`의 `.doan-canvas-tools`, DESIGN.md 'Canvas area and right panel' 'Tools row'(`.doan-floating` 90 % 흰 유리, `--blur-sm`, `--shadow-panel`, radius 24, inset 4, gap 2, 40 px `md` 버튼, 눌린 버튼은 hover·누르는 동안에도 `--affordance-backdrop-pressed`).

## 영향 범위

| 파일 | 변경 |
|---|---|
| `app/src/main/prototype/fit.ts` | `PROTOTYPE_CHROME`에 툴바 줄 높이 `tools: 66`. 창 맞춤 높이가 `header + tools`를 더한다. 순수 함수 1·2. `prototypeIframeBox`와 `PROTOTYPE_NARROW_BELOW`를 지운다 |
| `app/src/main/prototype/ipc.ts` | `PrototypeMode = "fit" \| "responsive"`. `PrototypeView`에 `mode`, `run`은 `{url, markWidth, markHeight}`. `PrototypeSnapshot`에 찍은 상자 `box`. 요청 채널 `prototype:mode`(payload `{mode}`), `PROTOTYPE_WINDOW_REQUESTS`에 추가, `PrototypeWindowApi.setMode(mode)` |
| `app/src/main/prototype/requests.ts` | 순수 함수 4 |
| `app/src/main/prototype/windowState.ts` | 순수 함수 3. `ClosedState`와 `OpenState`에 `mode`(처음 값 `"fit"`). `start`의 `base`와 `close`가 `mode`를 옮긴다. `start`와 `report`가 `run`에 표시 높이를 둔다 |
| `app/src/main/prototype/controller.ts` | `request` switch에 `prototype:mode` case. `host.capture`에 표시 크기와 모드를 넘기고, 받은 상자를 스냅숏과 함께 보낸다 |
| `app/src/main/prototypeWindow.ts` | `capture`가 순수 함수 2의 사각형을 쓴다 |
| `app/src/preload/prototype.ts` | `setMode` |
| `app/src/renderer/prototype/host.ts` | 순수 함수 5 |
| `app/src/renderer/prototype/view.ts` | 순수 함수 6 |
| `app/src/renderer/prototype/PrototypeWindow.tsx` | `WindowShell`의 툴바 줄과 새 컴포넌트 `PrototypeModeTools`, `ContentPanel`의 폭·높이 측정과 iframe별 상자(`transform: scale`), 툴바 tooltip Esc와 드로어 닫기 연결 |
| `app/src/renderer/CanvasTools.tsx` → 새 `app/src/renderer/toolbarKeys.ts` | `moveBetweenTools`를 옮겨 두 툴바가 같은 함수를 쓴다. 캔버스 툴바 동작은 바뀌지 않는다 |
| `app/src/renderer/styles.css` | `.pw`의 셋째 줄(툴바 줄), 툴바 자리(`.pw-tools`), 패널 안 프레임 배치, `.pw-panel`의 `overflow: clip` |

`senderAllowed.ts`, `index.ts`, CLI(Go), 스킬, guide, 공유 스키마, 프로토타입 창 헤더는 바뀌지 않는다.

## 툴바 줄

### 높이와 창 맞춤

- 헤더가 `--size-chrome`(56) 줄을 콘텐츠 패널 위에 잡듯이, 툴바 줄은 콘텐츠 패널 아래에 66을 잡는다: 위 여백 8 + 캡슐 50 + 창 아래 여백 8. 지금 패널 아래의 8 여백(`PROTOTYPE_CHROME.bottom`)은 이 줄 안으로 들어간다. 그래서 프레임 열에서 패널 아래 가장자리부터 창 아래까지는 8에서 66이 된다.
- `.pw`의 줄은 `var(--size-chrome) minmax(0, 1fr) <툴바 줄>`이 된다. 툴바 줄 높이는 `fit.ts`의 상수와 CSS 값이 같아야 하므로 테스트로 함께 고정한다(헤더 56이 `--size-chrome`과 `PROTOTYPE_CHROME.header`로 맞춰진 것과 같다).
- 창 맞춤: 콘텐츠 폭은 지금처럼 표시 폭 + 16(최소 360, 작업 영역 안)이고, 높이는 표시 높이 + 56 + 66 = 표시 높이 + 122(작업 영역 높이까지)다. 지금은 + 64다. 예: 390×844는 406 × 966, 1440×900은 1456 × 1022다.
- iframe은 툴바 줄을 뺀 콘텐츠 패널을 쓴다. 그래서 툴바는 프레임을 가리지 않고, 프레임 viewport의 모든 영역이 포인터를 받는다.
- 작업 영역이 표시 높이 + 122보다 낮으면 창 높이가 작업 영역에서 잘린다. 노트북에서 844 높이 프레임이 흔히 여기에 걸린다. Fit 모드에서는 프레임이 줄어 `innerHeight`가 표시 높이로 남고, Responsive 모드에서는 패널 높이가 된다.

### 툴바 줄과 대화 열

- 툴바 줄은 프레임 열(콘텐츠 패널)에만 있고, 형제 feature `prototype-conversation`의 대화 열은 지금처럼 헤더 아래에서 창 아래 8까지 내려간다.
- 이유: 헤더가 창 전체 폭인 것은 그 컨트롤(Back, Forward, Reload, 프레임 이름, Export, 대화 버튼)이 창 전체에 작용하기 때문이다. 모드 툴바는 프레임에만 작용하므로, 캔버스 툴바가 보드에 속하듯이 프레임 열에 속한다. 창 전체 폭으로 두면 대화 열이 58만큼 짧아져 thread와 composer가 공간을 잃고, 툴바를 어느 폭의 가운데에 둘지도 흐려진다.
- 그래서 대화 패널을 열면 툴바 줄은 프레임 열과 함께 좁아지고, 툴바는 그 가운데로 옮겨 간다. 대화 열의 손잡이는 프레임 열과 대화 열 사이에 있으므로 툴바와 겹치지 않는다.
- 형제 feature의 창 맞춤 규칙(패널을 연 채 Play하면 표시 + chrome + 패널 폭)에서 "chrome" 높이는 이 feature의 + 122를 쓴다. 형제 feature의 폭 규칙(360·640)은 바뀌지 않는다.
- 콘텐츠 패널이 가장 좁을 때(360 창에서 344)에도 92 폭 캡슐은 들어간다.

### 토스트

- 형제 feature가 이 창에 두는 토스트(오른쪽 아래 16, 폭 384, z-index 6)는 폭이 약 892보다 좁은 창에서 툴바 줄의 툴바와 겹칠 수 있다. 받아들인다(결정 11).

## 모드별 iframe 상자

순수 함수 1 `prototypeViewportBox(panel, mark, mode)`가 iframe의 CSS 크기와 놓는 자리를 정한다. `panel`은 툴바 줄을 뺀 콘텐츠 패널이다.

- 표시 크기를 모를 때(`mark`의 폭이나 높이가 0, run이 없음): 모드와 상관없이 `{x: 0, y: 0, width: panel.width, height: panel.height, scale: 1}`.
- Responsive 모드: 같은 채움 상자. 표시 폭과 상관없다(결정 5).
- Fit 모드: `scale = min(1, panel.width / mark.width, panel.height / mark.height)`. iframe의 CSS 크기는 `mark.width × mark.height`이고, `transform: scale(scale)`과 `transform-origin: 0 0`으로 줄인다. 보이는 상자(`mark × scale`)가 패널 가운데에 오게 `x`, `y`를 정한다.
- 결과의 `x`, `y`, 보이는 폭과 높이는 모두 정수로 내린다. 배치와 캡처가 같은 정수를 쓴다. 예: 패널 344 × 844, 표시 390×844 → scale 0.882…, 보이는 상자 344 × 744, `x` 0, `y` 50.
- 줄여도 iframe 문서의 layout viewport는 CSS 크기 그대로라서 `innerWidth`, `innerHeight`, media query, `100vh`가 표시 크기를 따른다. 이 가정은 PoC로 확인한다('PoC 의존').
- 상자는 패널 크기와 표시 크기, 모드로만 정한다. 프레임 문서에서 잰 값을 다시 넣지 않는다(아래 POSTMORTEM 2026-11-01).
- `ContentPanel`의 `ResizeObserver`가 폭과 높이를 함께 읽는다.
- 각 iframe(`RunFrame`)은 자기 run의 표시 크기를 갖고 자기 상자를 쓴다. 그래야 Fit 모드에서 드로어로 다른 표시를 골랐을 때, 새 run이 ready가 될 때까지 보이는 이전 문서가 새 표시 크기로 resize되지 않는다.
- Fit 모드에서 패널이 표시보다 크면 프레임 바깥은 패널 면이다. 프레임 경계를 어떻게 보일지(외곽선, 바깥 면 색)는 `/design-draft`에서 그린다.

## 모드 상태와 IPC

- 모드는 main의 `PrototypeState`에 둔다. 처음 값은 `"fit"`이다(결정 3). `CLOSED`에도 있어서 창을 닫아도 남고, 앱 종료로만 사라진다(결정 4). `start`의 `base`와 `close`가 새 state를 만들 때 `mode`를 옮긴다. 형제 feature `prototype-conversation`이 패널 열림·폭을 두는 방식과 같다.
- 모드를 바꾸는 요청은 `prototype:mode`(payload `{mode: "fit" | "responsive"}`)다. 프로토타입 창의 main frame만 보낸다. `PROTOTYPE_WINDOW_REQUESTS`에 넣으면 `senderAllowed.ts`와 `index.ts`가 그 목록에서 허용을 만든다. 같은 모드면 아무 일도 하지 않는다.
- 전환은 effect가 없다: gen을 올리지 않고, `load`·`fit`·`kill`이 없다. 로딩 중이면 그 run의 10초 시간 제한도 그대로 흐른다. 새 view만 보낸다. renderer는 같은 iframe 요소의 크기만 바꾼다(ARCHITECTURE §3 'Canvas view'의 "iframe is never reused"는 새 run에 대한 규칙이라 그대로다).
- 캡처: main은 run이 ready에서 벗어날 때 iframe 영역을 찍는다. 사각형은 순수 함수 2가 `PROTOTYPE_CHROME`(헤더, 옆 여백, 툴바 줄)과 순수 함수 1의 보이는 상자로 정한다. 툴바는 패널 밖에 있으므로 찍히지 않는다. 형제 feature의 대화 패널이 develop에 있으면 이 feature가 콘텐츠 패널 폭에서 대화 열 폭을 뺀다(그쪽 문서에는 capture 변경이 없다).
- 정지 이미지 자리: main이 찍을 때 쓴 패널 기준 상자를 `PrototypeSnapshot.box`로 함께 보내고, renderer는 그 값을 그대로 쓴다(순수 함수 5). 최신 이미지를 같은 gen으로 다시 보낼 때(kill 뒤)도 처음 찍을 때의 상자를 쓴다. 도착할 때 다시 계산하면 `fit` effect나 다시 보내기 뒤에 상자가 틀어진다. 모드를 바꿔도 정지 이미지는 그 자리에 남는다.

## 모드 툴바

### 자리와 모습

- 툴바 줄의 가운데(프레임 열 기준), 위 여백 8에 둔다. 캔버스 툴바의 모습을 그대로 쓴다(결정 2): `.doan-floating` 캡슐 92 × 50(테두리 1 + inset 4 + 40 + 2 + 40 + inset 4 + 테두리 1), `doan-icon-button doan-canvas-tool` `data-ui-size="md"` 버튼, `.doan-canvas-tools`의 규칙(아이콘 색, 눌린 버튼 채움 유지, 간격 2), `role="toolbar"`와 `aria-label` "Prototype viewport", `aria-pressed`, 눌린 버튼만 `tabIndex=0`, ←/→ 이동(`moveBetweenTools`를 `toolbarKeys.ts`로 옮겨 함께 쓴다), 공유 `Tooltip`·`TooltipTrigger`(asChild).
- 컴포넌트는 새로 둔다(`PrototypeModeTools`). `CanvasTools`는 Select/Hand 목록, Picker, Capture area, Play, Export, docked buddy 자리, 캔버스 Esc 단계를 props로 묶은 캔버스 전용 컴포넌트라서 두 버튼만 꺼내 쓸 수 없다. 공용 컴포넌트로 나누는 리팩터는 하지 않는다.
- 클래스는 그대로 붙인다(`doan-floating doan-canvas-tools`). 그러면 `styles.css`의 툴바 규칙이 같은 값으로 걸린다. 캔버스 자리에만 걸리는 규칙(`.doan-canvas-bottom > …`)은 `.pw-tools` 자리 규칙으로 따로 둔다.
- 빼는 것: 키 tooltip(`has-key`와 `doan-kbd`, 단축키가 없으므로), docked buddy 자리, 구분선, 캔버스 Esc 단계.
- 아이콘은 lucide 1.61.0(앱 의존성)에 있는 후보 `Proportions`, `Scaling`, `Shrink`, `MoveHorizontal`, `Expand` 중에서 `/design-draft`에서 고른다.
- view가 오기 전에는 두 버튼 모두 `disabled`이고 `aria-pressed`가 둘 다 false다. 같은 컴포넌트 트리 안에서 속성만 바꾼다(아래 POSTMORTEM 2026-11-13).

### 포인터와 포커스

- 버튼의 `mousedown`에서 `preventDefault()`를 불러 포인터 누름이 포커스를 옮기지 않게 한다(결정 10). 클릭은 그대로 모드를 바꾼다. 그래서 프레임 iframe 안 입력의 포커스와 blur로 닫히는 메뉴가 남는다. 툴바에는 키보드로만 포커스가 온다. iframe 안에 포커스가 있을 때 바깥 문서의 `mousedown` 기본 동작을 막으면 포커스가 iframe에 남는지는 PoC로 확인한다.
- DOM에서 툴바를 `.pw-panel`보다 앞에 두고, grid로 아래 줄에 놓는다. 그래서 Tab 순서는 헤더 → 툴바(눌린 버튼 하나) → 프레임 콘텐츠 → 형제 feature의 대화 패널이다. 프레임은 Tab 정지가 많을 수 있어서, 툴바를 그 뒤에 두면 닿기 어렵다. overlay가 덮은 동안은 헤더 → 툴바 → 장면 버튼(Retry, Close, Details)이다. 보이는 자리(아래)와 Tab 순서(콘텐츠 앞)가 다른 점은 `/design-draft`에서 확인한다.
- 형제 feature의 "Tab 순서는 헤더 → 프레임 콘텐츠 → 패널"은 툴바를 헤더와 콘텐츠 사이에 넣어도 그대로 성립한다.

### 상태 overlay와 Esc

- 로딩·실패·lost overlay는 콘텐츠 패널만 덮는다. 툴바 줄은 패널 밖이므로 overlay와 겹치지 않고, `.pw-content`의 `inert`에도 들지 않는다. overlay의 padding과 스크롤은 지금 그대로다.
- Esc: 프로토타입 창의 Esc는 드로어를 닫거나 프레임 콘텐츠로 간다(PRODUCT §5 item 2). 툴바 tooltip이 열린 채 Esc를 누르면 Radix가 tooltip을 닫는다. 프레임 드로어는 non-modal Popover라서, 드로어도 열려 있을 때 Radix는 tooltip만 닫는다. 그래서 툴바 tooltip의 `onEscapeKeyDown`이 드로어가 열려 있으면 드로어도 닫고 포커스를 프레임 이름에 둔다. 드로어 열림 상태는 `WindowShell`이 툴바와 드로어에 함께 넘긴다. 캔버스 툴바의 캔버스 Esc 단계는 연결하지 않는다. 툴바에 포커스가 있고 tooltip이 없을 때 Esc는 아무 일도 하지 않는다.

### 그리는 층

- 툴바는 패널 밖에 있어 상태 overlay(z-index 5)와 겹치지 않으므로 따로 z-index를 두지 않는다. 프레임 드로어(Radix portal, z-index 50)가 짧은 창에서 툴바 줄까지 내려오면 드로어가 위에 그려져야 한다. 실제 앱에서 스크린샷으로 확인한다(POSTMORTEM 2026-11-02 'Every Overview menu…').

## 헤더

- 이 feature는 헤더를 바꾸지 않는다. 형제 feature들이 더하는 [Export][대화 버튼]만 있을 때 360 창을 계산했다.
- 이름 버튼 왼쪽 끝은 창에서 200이다(DESIGN.md 'Frame name': `.pw` 8 + 헤더 padding 8 + traffic light 72 + 버튼 32 × 3 + 간격 4 × 2 + 8). 오른쪽 그룹은 32 + 4 + 32 = 68이고, 창 오른쪽 inset은 16이다(`.pw` 8 + 헤더 padding 8). 이름 버튼과 그룹 사이 간격을 왼쪽과 같은 8로 두면 360 창에서 이름 버튼 폭은 360 − 200 − 8 − 68 − 16 = 68이다.
- 68 폭 안에서 `.shell-search`의 padding 10 × 2, 간격 8, chevron 16을 빼면 글자 자리는 24다. 버튼은 들어가고, 이름은 2–3글자와 말줄임표로 보이며, 잘리면 지금처럼 tooltip이 전체 이름을 보인다. 지금 360 창의 이름 버튼(144)보다 76 좁아지는 것은 형제 feature들의 변경 때문이고, 그 폭은 두 feature가 정한다.

## 순수 함수로 뺄 것 (`/tdd` 대상)

1. `prototypeViewportBox(panel: {width, height}, mark: PrototypeSize, mode)` (`main/prototype/fit.ts`) → `{x, y, width, height, scale}`(`width`·`height`는 iframe CSS 크기, 보이는 크기는 `width × scale`·`height × scale`을 내린 값). 경우: Responsive 채움(표시 폭 240 포함), Fit 1배(패널이 더 큼, 가운데), Fit 축소(폭 기준, 높이 기준, 둘 다), 표시 0(채움), 패널 0. 모든 출력의 위치와 보이는 크기가 정수인지.
2. `prototypeCaptureRect(content: {width, height}, mark, mode, sideColumn = 0)` (`main/prototype/fit.ts`) → 창 콘텐츠 좌표의 정수 사각형 또는 null(폭이나 높이가 0 이하). 경우: Responsive, Fit 1배, Fit 축소, 패널 0. `fitPrototypeWindow`의 높이에 툴바 줄 66이 더해지는지(390×844 → 406 × 966)도 같은 파일에서 고정한다.
3. `setMode(state, mode)` (`main/prototype/windowState.ts`) → `Step`. 같은 모드면 같은 state 객체(뷰를 보내지 않음), 다른 모드면 effect 없이 `mode`만 바뀜, 처음 값 Fit, `CLOSED`에서도 남음, 로딩 중 전환에서 gen 그대로. `play`·`reload`·`back`·`forward`·`choose`·`close` 뒤 `mode` 유지(`start`의 `base`와 `close`의 새 객체 포함). `start`·`report`가 `run`에 표시 높이를 두는지.
4. `parseModeRequest(kind, value)` (`main/prototype/requests.ts`) → `"fit" | "responsive" | null`. 기존 `record(value, [...])` 꼴로 `{mode}`만 받는다. role 불일치, 다른 문자열, 모르는 속성을 거절.
5. `layersForSnapshot` 확장 (`renderer/prototype/host.ts`): 스냅숏이 실어 온 `box`를 그대로 저장하고, 이후 view의 모드가 바뀌어도 그 상자를 유지. `RunFrame`이 자기 표시 크기를 갖는지(`layersForView`).
6. `modeTooltip(mode, mark)` (`renderer/prototype/view.ts`) → "Fit to 390 × 844", "Responsive". 표시 크기를 모르면(view 없음, run 없음, 표시 0) "Fit".

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11), app-socket, `runtime.json`, `.doan/config.json`, CLI 응답, userData 파일은 바뀌지 않는다. 형식 버전 `v`도 그대로다.
- 바뀌는 것은 앱 내부 IPC뿐이다: 요청 채널 `prototype:mode`(payload `{mode}`), `PrototypeView.mode`, `PrototypeView.run`의 `markHeight`, `PrototypeSnapshot.box`, preload API `setMode`. ARCHITECTURE §7 'Prototype window IPC'의 "No new format"은 그대로 참이다.

## 규칙(conventions) 영향

- 없다. 기본이 Fit 모드이므로 convention 14의 표시 뜻과 PRODUCT의 "at the size the agent marked"는 그대로 지켜진다. Responsive 모드는 사람이 고를 때만 창을 따른다. 새 `doan check` 규칙도 없다. guide가 바뀌지 않으므로 `/agent-eval`도 필요 없다.

## 결정 영향

- **sandbox iframe**(`allow-scripts allow-forms`, no `allow-same-origin`), 주입 스크립트, navigation gate, partition, kill 규칙은 그대로다. 줄이기는 바깥 문서의 CSS `transform`이고 iframe 안으로 아무것도 넣지 않는다.
- **PRODUCT §5 item 2 'Prototype window'**: 'One window'의 "lays the frame out again when the person resizes it, like a browser viewport; a frame narrower than the content panel of a 360 px window keeps its own width, centred"가 두 모드 문장으로 바뀌고, 창 맞춤에 툴바 줄이 더해진다. 'Content'의 "the frame fills the window's content panel as a viewport"가 모드별로 바뀐다. 'Header'의 Tab 순서 문장에 툴바가 더해지고, Esc 문장("otherwise reaches the content")에 툴바 tooltip 경우가 더해진다. 모드 툴바(툴바 줄, 이름과 tooltip, 포인터 포커스, 기억)가 새로 들어간다. 마지막 task가 고친다.
- **ARCHITECTURE §3 'Prototype window'**: 'One window'(모드 상태가 닫힘을 넘어 남음), 'Rendering in place'(모드별 iframe 상자, 축소, iframe별 표시 크기), 'Timeout and kill'(캡처 영역과 스냅숏 상자), 'Fit'(창 맞춤만 남김: 툴바 줄 높이, `PROTOTYPE_NARROW_BELOW` 문장 삭제)가 바뀐다. §7 'Prototype window IPC'에 모드 요청과 스냅숏 상자가 더해진다.
- **형제 feature와 겹치는 곳**
  - `prototype-conversation`: 대화 패널은 콘텐츠 패널 폭을 가져간다. Responsive 모드에서는 그만큼 viewport가 줄고, Fit 모드에서는 viewport가 표시 크기를 지키고 패널이 좁아지면 줄어든다. 그쪽의 창 폭 규칙(360·640, 열 때 640으로 넓힘, 패널을 연 채 Play하면 표시 + 패널 폭)은 콘텐츠 패널에 대한 규칙이라 두 모드에서 같고, 창 맞춤 높이는 이 feature의 + 122를 쓴다. 툴바 줄은 프레임 열에만 있다('툴바 줄과 대화 열'). 그쪽 design.md '패널 폭'의 "마크가 344보다 좁은 프레임은 지금처럼 자기 폭을 지키고 가운데에 놓인다"는 결정 3·5와 맞지 않는다: 기본(Fit 모드)에서는 자기 크기로 가운데이고, Responsive 모드에서는 패널을 채운다. 그쪽이 먼저 `/tdd`를 돌면 지울 동작을 고정하게 되므로, 그 문장은 이 feature의 구현 전에 맞춰야 한다. 대화 패널 관련 확인은 `prototype-conversation`이 develop에 있을 때만 한다(두 feature의 병합 순서는 아직 정해지지 않았다).
  - `prototype-cli-export`: 헤더는 바뀌지 않는다. 내보낸 파일은 모드와 상관없이 viewport를 채운다(그쪽 결정 5). `doan open --prototype`의 재생은 다른 Play처럼 모드를 유지한다. 그쪽 design.md 29행과 tasks.md 2의 "모드 전환의 자리"는 헤더에 없으므로 빠져야 하고, 142행의 앱과 파일의 차이 설명("앱 프로토타입 창은 표시 폭이 `PROTOTYPE_NARROW_BELOW`보다 좁으면 그 폭을 지키고 가운데 둔다")은 "앱은 기본(Fit 모드)에서 표시 크기를 지킨다"로 바뀌어야 한다.
  - 초안: 세 feature가 각자 새 초안을 그리고 기존 `frame-prototype.html`은 고치지 않는다.

## PoC 의존

Fit 모드의 축소(결정 1)와 포인터 포커스(결정 10)는 아직 확인하지 않은 가정에 기댄다. 첫 task로 Electron 45 격리 앱에서 확인한다.

- 프로토타입 partition의 cross-origin sandboxed iframe(별도 renderer process)에 바깥 문서가 `transform: scale(s)`을 걸어도 iframe 문서의 `innerWidth`·`innerHeight`·`matchMedia`·`100vh`가 CSS 크기(표시 크기) 그대로인지.
- 줄인 iframe에서 클릭, hover, 드래그, 휠 스크롤, 텍스트 선택이 맞는 요소에 닿는지.
- 줄인 글자가 흐리지 않게 다시 그려지는지(눈으로 확인, 스크린샷).
- 아주 큰 표시(5000×5000)를 줄여 그릴 때 화면이 나오는지와 걸리는 시간·메모리.
- `webContents.capturePage(rect)`가 줄인 iframe을 보이는 대로 찍는지.
- 모드 전환으로 iframe 크기를 바꿔도 문서가 다시 불러와지지 않고 `resize`만 받는지(입력 값과 열린 모달 유지).
- iframe 안 입력에 포커스가 있을 때 바깥 문서 버튼의 `mousedown`에서 `preventDefault()`를 부르면, 클릭은 일어나고 포커스는 iframe 입력에 남는지.

실패하면 design.md를 고치고 멈춰 사용자에게 해당 결정을 다시 묻는다. Responsive 모드는 지금 코드와 같은 방식이라 PoC가 필요 없다.

## POSTMORTEM에서 가져온 함정

- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: "a wrapper that adapts props for some states keeps the same component tree in every state and decides inside it". 모드 버튼은 눌림이 바뀌어도, view가 처음 와서 `disabled`가 풀려도 같은 요소로 남아야 한다. 두 상태를 렌더해 자식 요소의 `type`이 같은지 테스트하고, 실제 앱에서 포커스된 버튼의 눌림을 바꾼 뒤 `document.activeElement`를 읽는다.
- **2026-11-07 'A toolbar tooltip took the Esc the canvas needed'**: "a Radix layer over a control whose Esc matters hands the decision on rather than taking the step". 툴바 tooltip은 Esc를 혼자 갖지 않고, 드로어가 열려 있으면 드로어 닫기를 함께 한다. tooltip과 드로어가 함께 열린 경우와 tooltip만 열린 경우를 테스트한다.
- **2026-11-02 'Tab walked into the draft…'**: `overflow: hidden` 상자는 포커스된 자손을 드러내려고 스크롤한다. Fit 모드에서 줄인 프레임의 아래쪽 컨트롤로 Tab하면 `.pw-panel`이 스크롤해 프레임 자리가 틀어질 수 있으므로 `.pw-panel`을 `overflow: clip`으로 바꾼다.
- **2026-11-02 'Every Overview menu…'**: 새로 그리는 층은 기존 portal 메뉴보다 위에 그려지면 안 된다. 툴바 줄이 보이는 채 드로어를 열고, 드로어가 위에 그려지는지 스크린샷으로 판정한다.
- **2026-11-01 'A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever'**: "for any value the canvas measures against a size the renderer then sets from it, test the loop to its fixed point". 이 feature의 iframe 상자는 패널 크기와 표시 크기로만 정하고 프레임 문서에서 잰 값을 받지 않으므로 고리가 생기지 않는다. 이 성질을 유지한다.

## 디자인 프리셋

- `clarify`: 이름은 사용자가 정한 "Fit", "Responsive"이고 접근 이름도 같다. Fit의 tooltip은 결과를 말하는 "Fit to 390 × 844"로 접근 이름보다 길다. 크기는 숫자를 구조로 두고 "×"(U+00D7)와 공백을 PRODUCT·DESIGN의 크기 표기와 맞춘다.
- `adapt`: "A size is not a device"에 따라 기기 이름을 쓰지 않는다. 좁은 콘텐츠 패널(344–360)에서도 툴바가 들어가는지 확인했다.
- `harden`: 로딩·실패·lost 상태의 툴바, 정지 이미지 자리, 작업 영역보다 큰 표시, 표시 크기를 모르는 run, 아주 큰 표시를 상태로 다룬다.

## 참고와 출처

- Chrome DevTools의 device toolbar(Responsive 크기, 가장자리 손잡이, "Fit to window" 줌)는 기억으로만 참고했다. 2026-11-13에 `developer.chrome.com/docs/devtools/device-mode`를 열려 했지만 이 환경에서 접속하지 못해(`ENOTFOUND`) 확인하지 못했다. 이 문서의 어느 규칙도 그 동작에 기대지 않는다.
- 캔버스 툴바: `app/src/renderer/CanvasTools.tsx`, `styles.css` `.doan-canvas-tools`, DESIGN.md 'Canvas area and right panel' 'Tools row'. 헤더 수치: DESIGN.md 'Frame prototype'. 헤더 줄 패턴: `styles.css` `.pw`, `fit.ts` `PROTOTYPE_CHROME`.
- `/feature-review` 결과(A 1–25, B 1–5, C)는 사용자 결정대로 반영했다.
