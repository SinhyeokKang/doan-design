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
- 프로토타입 창 헤더(`WindowShell`): traffic light 자리, `.shell-history` 안의 Back, Forward, Reload prototype(`IconTip` tooltip, `disabled={view === null}`, `onReload`가 `api.reload(gen)`을 부름), 그리고 `FrameMenu`(이름 버튼). 실패 장면의 Retry도 같은 `onReload`를 부른다. `.pw-name`의 `left`·`right`는 버튼 3개 폭으로 계산하고(`styles.css` 1827행), 520보다 좁으면 오른쪽 끝이 16 inset까지 물러난다(1832행).
- 모드 탭(`.doan/ds/mode-tabs.html`, `styles.css`의 `.shell-modes`): `--affordance-backdrop-hover` 트랙 안에 32 높이 탭, 지금 탭은 `--surface-panel` 바탕과 `--shadow-panel`로 올라오고 표준 잉크, 나머지는 subtle 잉크이고 hover에 트랙 위로 `--affordance-backdrop-hover`가 한 번 더 깔린다. 헤더 아이콘 버튼은 `doan-icon-button` `data-ui-placement="chrome"`(32, radius `--radius-toolbar-icon` 10, hover `--affordance-backdrop-hover`, 펼침·누름 `--affordance-backdrop-pressed`, `ds/controls.css`).

## 영향 범위

| 파일 | 변경 |
|---|---|
| `app/src/main/prototype/fit.ts` | 순수 함수 1·2·7. 헤더 오른쪽 무리 폭 상수(이 feature에서 68, 형제 feature가 104·140으로 고침), 이름 줄 경계 80과 둘째 줄 44. `fitPrototypeWindow`가 맞춘 폭의 줄 수로 높이를 정한다. `prototypeIframeBox`와 `PROTOTYPE_NARROW_BELOW`를 지운다 |
| `app/src/main/prototype/ipc.ts` | `PrototypeMode = "fit" \| "responsive"`. `PrototypeView`에 `mode`, `run`은 `{url, markWidth, markHeight}`. `PrototypeSnapshot`에 찍은 상자 `box`. 요청 채널 `prototype:mode`(payload `{mode}`), `PROTOTYPE_WINDOW_REQUESTS`에 추가, `PrototypeWindowApi.setMode(mode)` |
| `app/src/main/prototype/requests.ts` | 순수 함수 4 |
| `app/src/main/prototype/windowState.ts` | 순수 함수 3. `ClosedState`와 `OpenState`에 `mode`(처음 값 `"fit"`). `start`의 `base`와 `close`가 `mode`를 옮긴다. `start`와 `report`가 `run`에 표시 높이를 둔다 |
| `app/src/main/prototype/controller.ts` | `request` switch에 `prototype:mode` case. `host.capture`에 표시 크기와 모드를 넘기고, 받은 상자를 스냅숏과 함께 보낸다 |
| `app/src/main/prototypeWindow.ts` | `capture`가 순수 함수 2의 사각형을 쓴다 |
| `app/src/preload/prototype.ts` | `setMode` |
| `app/src/renderer/prototype/host.ts` | 순수 함수 5 |
| `app/src/renderer/prototype/view.ts` | 순수 함수 6 |
| `app/src/renderer/prototype/PrototypeWindow.tsx` | `WindowShell` 헤더의 오른쪽 무리(`.pw-right`: 모드 토글, Export 자리, 대화 버튼 자리)와 이름 캡슐의 줄(첫째·둘째, `.pw.name-row`). Reload는 지금 자리 그대로. `ContentPanel`의 폭·높이 측정과 iframe별 상자(`transform: scale`), 헤더 tooltip Esc와 프레임 메뉴 닫기 연결 |
| `app/src/renderer/CanvasTools.tsx` → 새 `app/src/renderer/toolbarKeys.ts` | `moveBetweenTools`를 옮겨 캔버스 툴바와 모드 토글이 같은 함수를 쓴다. 캔버스 툴바 동작은 바뀌지 않는다 |
| `app/src/renderer/ds/controls.css`, 새 `.doan/ds/toggle-group.html` | 새 프리미티브 `.doan-toggle-group`과 그 디자인 시스템 캔버스(DESIGN.md 'Design-system canvases'는 공유 컴포넌트마다 캔버스 하나) |
| `app/src/renderer/styles.css` | `.pw-right`, `.pw-name`의 `right`(오른쪽 무리 폭에 맞춤)와 520 경계 삭제, 둘째 줄(`.pw.name-row`: 헤더 줄 100, 캡슐 자리), 패널 안 프레임 배치, `.pw-panel`의 `overflow: clip`. `.pw`의 여백은 그대로 |

`senderAllowed.ts`, `index.ts`, CLI(Go), 스킬, guide, 공유 스키마는 바뀌지 않는다. Reload의 IPC(`prototype:reload`)와 main 쪽 처리도 그대로다.

## 헤더 배치

툴바 줄은 없다. 모드 선택을 포함한 창의 컨트롤은 모두 헤더에 있다. 헤더는 한 줄(`--size-chrome` 56)이거나, 이름이 내려간 두 줄(100)이다. 콘텐츠 패널과 그 아래 8 여백은 지금 그대로다. 창 맞춤은 표시 폭 + 16 × 표시 높이 + 64이고, 맞춘 폭에서 이름이 둘째 줄이면 + 108이다: 390×844는 R 68에서 406 × 908, R 104·140에서 406 × 952, 1440×900은 1456 × 964다. 아래 x는 창 콘텐츠 왼쪽 끝 기준이고 W는 창 콘텐츠 폭이다.

- 왼쪽 무리: 지금 그대로 Back x88, Forward x124, Reload x160(32 버튼, 간격 4), 끝 x192. `.pw-name`의 `left`(200 = `.pw` 8 + 헤더 padding 8 + traffic light 72 + 버튼 32 × 3 + 간격 4 × 2 + 8)도 그대로다.
- 오른쪽 무리(`.pw-right`): 오른쪽 끝 W − 16에 붙고, 세로 가운데, 항목 간격 4(`--space-1`). 항목은 모드 토글 68, Export 32, 대화 버튼 32다. 폭 R은 토글만 68, Export까지 104, 대화 버튼까지 140이다. 구현 순서가 이 feature → `prototype-cli-export` → `prototype-conversation`이라서 각 feature가 합쳐질 때 R이 68 → 104 → 140으로 바뀐다.
- 이름 공간: x200부터 W − 24 − R까지(양옆 8), 폭 S = W − 224 − R. 지금 `.pw-name`처럼 오른쪽 예약을 왼쪽과 같게 두지 않고, 이름을 두 무리 사이의 가운데에 둔다.
- 이름의 줄(순수 함수 7):
  - S ≥ 80: 캡슐(`.pw-name`, 지금 모습)이 첫째 줄의 공간을 채운다. 80은 캡슐이 읽히는 가장 좁은 폭이다: padding 10 × 2, 간격 8, chevron 16을 빼면 글자 자리 36이 남고, body-sm Geist에서 보통 이름의 세 글자와 말줄임표가 들어간다("Che…" 33.7, "Acc…" 32.3, "Mob…" 36.4). 지금 좁은 창 경계의 120보다 40 낮다. 글자 자리는 S − 44다.
  - S < 80(W < R + 304): 캡슐이 헤더 둘째 줄로 간다. 그 줄은 높이 44(캡슐 36 + `--space-2`)이고 캡슐은 x16부터 W − 16까지(헤더의 안쪽 여백, 이름은 창 가운데), y56–92다. traffic light, 왼쪽 무리, 오른쪽 무리는 첫째 줄에 그대로 있고, 헤더는 100, 콘텐츠 패널은 y100에서 시작한다. 둘째 줄도 첫째 줄처럼 창을 끄는 자리이고 캡슐만 no-drag다.
  - 이름은 언제나 보이고 프레임 메뉴는 언제나 열 수 있다.
- 경계(첫째 줄에 남는 창 폭): R 140이면 444 이상, R 104면 408 이상, R 68이면 372 이상. 창 최소 폭은 360(`PROTOTYPE_WINDOW_MIN_WIDTH`)이다.
- 예(R 140): 640 창 276(x200–476), 520 창 156, 444 창 80, 443 창 둘째 줄 411, 406 창 374, 360 창 328. R 104: 640 창 312, 520 창 192, 408 창 80, 407·406·360 창 둘째 줄. R 68: 640 창 348, 520 창 228, 406 창 114, 372 창 80, 371·360 창 둘째 줄.
- 구현: main의 창 맞춤과 캡처도 줄 수가 필요하므로, 꼴은 CSS media query가 아니라 `fit.ts`의 순수 함수 7이 창 폭과 R로 정하고 renderer(`ResizeObserver`가 읽는 헤더 폭 + 16)와 main이 함께 쓴다. R은 그 창에 있는 항목으로 정해지는 상수다(이 feature 68, 형제 feature가 합쳐질 때 104, 140). 렌더러는 `.pw`에 `name-row`를 붙이고 캡슐은 DOM에서 옮기지 않는다.

### 헤더와 대화 열

- 헤더는 지금처럼 창 전체 폭이다. 형제 feature `prototype-conversation`의 대화 열은 지금처럼 헤더 아래에서 창 아래 8까지 내려가고, 프레임 열과 같은 줄에 있다.
- 형제 feature의 창 맞춤 규칙(패널을 연 채 Play하면 표시 + chrome + 패널 폭)의 높이는 이 feature의 규칙(+ 64, 둘째 줄이면 + 108)이다. 그쪽의 폭 규칙(360·640)은 바뀌지 않는다.
- 대화 패널을 연 창은 640 이상이고(프레임 열 360 + 패널 최소 280), 이름은 첫째 줄이다.

## 모드별 iframe 상자

순수 함수 1 `prototypeViewportBox(panel, mark, mode)`가 iframe의 CSS 크기와 놓는 자리를 정한다. `panel`은 콘텐츠 패널이다(헤더 아래, 아래 여백 8 위).

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
- 캡처: main은 run이 ready에서 벗어날 때 iframe 영역을 찍는다. 사각형은 순수 함수 2가 `PROTOTYPE_CHROME`(헤더, 옆 여백, 아래 여백)과 순수 함수 1의 보이는 상자로 정한다. 형제 feature `prototype-conversation`이 순수 함수 2의 `sideColumn`에 대화 열 폭(손잡이 포함)을 넘겨 콘텐츠 패널 폭에서 뺀다(그쪽 design '정지 이미지'). 이 feature는 그 인자만 둔다.
- 정지 이미지 자리: main이 찍을 때 쓴 패널 기준 상자를 `PrototypeSnapshot.box`로 함께 보내고, renderer는 그 값을 그대로 쓴다(순수 함수 5). 최신 이미지를 같은 gen으로 다시 보낼 때(kill 뒤)도 처음 찍을 때의 상자를 쓴다. 도착할 때 다시 계산하면 `fit` effect나 다시 보내기 뒤에 상자가 틀어진다. 모드를 바꿔도 정지 이미지는 그 자리에 남는다.

## 헤더 컨트롤

### 모드 토글 (새 프리미티브)

- Fit과 Responsive를 한 트랙으로 감싼 토글이다(결정 11). 트랙이 두 버튼을 Export·대화 버튼과 나누므로 구분선이 없다.
- 클래스는 `ds/controls.css`의 새 `.doan-toggle-group`이다. 항목은 헤더의 다른 아이콘 버튼과 같은 `doan-icon-button` `data-ui-placement="chrome"`(32 × 32, radius 10)이고, 프리미티브는 묶음의 모습만 더한다.
  - 트랙: `display: flex`, 안쪽 `--space-half`(2), 바탕 `--affordance-backdrop-hover`, radius `--radius-chip`(12 = 항목 10 + 안쪽 2, tokens.css의 nested corner 규칙). 높이 36(32 + 2 × 2)으로 이름 캡슐과 같고, 폭은 항목 둘이면 68(2 + 32 + 32 + 2, 항목 사이 간격 0)이다.
  - 눌리지 않은 항목: 잉크 `--text-subtle`, hover에 `--affordance-backdrop-hover`(트랙 위에 한 번 더).
  - 눌린 항목(`aria-pressed="true"`): 바탕 `--surface-panel`, `--shadow-panel`, 잉크 `--text-standard`. hover·누르는 동안에도 같다. ds의 chrome `:active` 규칙(구체성 0,5,0)이 이 바탕을 덮지 않도록 토글 규칙을 더 구체적으로 둔다.
  - 누르는 동안(`:active`)의 눌리지 않은 항목: ds chrome 규칙 그대로 `--affordance-backdrop-pressed`(트랙 위에 한 번 더).
  - `disabled` 항목: `--text-disabled`, 바탕 없음(ds 규칙 그대로). 트랙은 남는다.
  - 포커스: ds 링(2 px `--border-focus`, +2) 그대로.
- 가져온 것: 모드 탭(`.shell-modes`)의 트랙과 "올라온 지금 항목" 모습, 헤더 chrome 아이콘 버튼의 크기·radius·hover·포커스. 캔버스 툴바의 눌림 채움(`--affordance-backdrop-pressed`)은 쓰지 않는다. 6 % 트랙 위에서는 10 % 눌림과 6 % hover가 거의 같아 보이기 때문이다.
- 접근성: 트랙은 `role="group"`, `aria-label` "Viewport". 항목은 `aria-pressed`와 각자의 이름("Fit", "Responsive")을 갖는다. 같은 모양의 radio group으로 두지 않는 이유는 캔버스 툴바의 Select/Hand와 같은 눌림 버튼 모델을 앱 안에서 하나로 두기 위해서다.
- 키보드: Tab 정지 하나이고 눌린 항목만 `tabIndex=0`이다. ←/→는 `moveBetweenTools`(`toolbarKeys.ts`로 옮김)로 항목 사이에서 포커스만 옮기고(누르지 않는다, 끝에서 돌아가지 않는다, `disabled` 항목을 건너뛴다), Enter/Space가 누른다. view가 오기 전에는 두 항목이 `disabled`이고 `aria-pressed`가 둘 다 false라서 Tab 정지가 없다. 같은 컴포넌트 트리 안에서 속성만 바꾼다(아래 POSTMORTEM 2026-11-13).
- 아이콘은 lucide 1.61.0(앱 의존성)의 `Proportions`(Fit)와 `Expand`(Responsive)다. tooltip은 공유 `Tooltip`(키 없음)이고 내용은 순수 함수 6이 정한다.
- 이 feature에서 쓰는 곳은 프로토타입 창 헤더 하나다. 다른 화면으로 넓히지 않는다.

### Reload prototype

- 지금 헤더의 자리(x160), 이름과 tooltip "Reload prototype", `RotateCw`, `disabled={view === null}`, 누르면 `onReload`(현재 gen으로 `api.reload`)가 그대로다. main의 `reload` 처리(다시 시작, 창 크기 유지, 기록 없음)와 실패 장면의 Retry가 같은 `onReload`를 쓰는 것도 그대로다. 새로 더하는 것은 모드 유지(위 '모드 상태와 IPC')와 아래 포인터 규칙뿐이다.

### 프레임 이름의 둘째 줄

- S가 80보다 작으면 `.pw`에 `name-row`가 붙어 헤더 줄이 100이 되고, 캡슐이 둘째 줄(x16–W−16, y56)로 간다. 같은 `FrameMenu` 트리거이고 모습, 이름, 메뉴가 그대로다.
- 메뉴(Radix Popover, z-index 50)는 지금처럼 캡슐 4 아래(둘째 줄이면 y96), 캡슐 가운데에 맞추고 8 collision padding 안으로 밀린다. 406 창에서는 캡슐 가운데 x203에서 320 메뉴가 왼쪽 43에 놓인다.
- 사람이 창을 끌어 경계를 지나면 콘텐츠 패널이 애니메이션 없이 44 움직이고(다른 창 크기 변경과 같다) iframe 상자가 따라간다(Fit 모드는 다시 줄이고, Responsive 모드는 문서가 `resize`를 받는다). 창 크기는 바꾸지 않는다. 포커스와 열린 메뉴는 캡슐에 남고, 메뉴는 Radix가 캡슐을 따라 다시 놓는다. 줄 수는 창 폭으로만 정하므로 첫 view 전(이름 없음)에도 둘째 줄 자리가 있어 view가 와도 패널이 움직이지 않는다.

### Export 자리

- 오른쪽 무리에서 토글 다음에 헤더 아이콘 버튼(32) 자리를 둔다. 이름("Export prototype"), 쓸 수 없는 이유(`aria-disabled`와 sr-only 설명), 저장 패널, 토스트, 저장 패널 뒤 포커스 복귀는 `prototype-cli-export`가 정한다. 이 feature가 정하는 것은 자리, 모습(chrome 아이콘 버튼), 자기 Tab 정지, 포인터 누름이 포커스를 옮기지 않는 것이다.
- 이 feature가 합쳐질 때 오른쪽 무리는 토글뿐이다(R 68).

### 키보드

- 헤더 컨트롤은 지금처럼 각자 Tab 정지를 갖고, 토글만 Tab 정지 하나다. DOM 순서가 보이는 순서와 같다: Back, Forward, Reload, 이름(줄과 상관없이 같은 자리), 토글, Export, 대화 버튼, 그다음 `.pw-panel`의 프레임 콘텐츠, 형제 feature의 대화 패널. overlay가 덮은 동안은 헤더 → 장면 버튼(Retry, Close, Details)이다.
- 형제 feature의 "Tab 순서는 헤더 → 프레임 콘텐츠 → 패널"은 그대로 성립한다.

### 포인터와 포커스

- Reload, Fit, Responsive의 `mousedown`에서 `preventDefault()`를 불러 포인터 누름이 포커스를 옮기지 않게 한다(결정 10). 클릭은 그대로 일어난다. Export도 같은 규칙을 따른다(그쪽 구현).
- 모드 전환에서는 프레임 iframe 안 입력의 포커스와 blur로 닫히는 메뉴가 남는다.
- Reload에서는 run이 새 iframe으로 바뀐다. 이전 iframe은 로딩 동안 `inert`이고 새 run이 ready일 때 빠지므로, 프레임 안에 있던 포커스는 그사이 페이지로 떨어진다. 그래서 Reload의 `mousedown`에서 포커스가 프레임 iframe 안이거나 페이지(`document.activeElement`가 run iframe이거나 `body`)였는지를 그 gen과 함께 기억하고, 그 gen의 run이 ready가 되어 보일 때 포커스가 여전히 페이지(`document.activeElement`가 `body`)이면 새 iframe에 `focus()`를 부른다(결정 13). 누르기 전이나 ready 때 포커스가 다른 곳(대화 composer, 헤더, 키보드로 온 컨트롤)에 있으면 아무것도 하지 않는다. 그래서 형제 feature `prototype-conversation`의 결정 17(reload는 composer의 포커스를 빼앗지 않는다)도 지켜진다. `mousedown`에서 기억하므로 키보드로 누른 Reload에는 걸리지 않고, 포커스는 지금처럼 Reload에 남는다. 새 run이 실패 장면을 띄우면 지금 규칙대로 포커스가 장면 제목으로 간다(`focusWasInside`가 페이지로 떨어진 포커스를 안쪽으로 본다).
- 헤더 컨트롤에는 키보드로만 포커스가 온다. iframe 안에 포커스가 있을 때 바깥 문서의 `mousedown` 기본 동작을 막으면 포커스가 iframe에 남는지는 PoC로 확인한다.

### 상태 overlay와 Esc

- 로딩·실패·lost overlay는 지금처럼 콘텐츠 패널만 덮고, 헤더는 그 밖이라 `inert`에 들지 않는다. 실패 화면에서는 헤더의 Reload와 장면의 Retry가 같은 일을 한다.
- Esc: 프로토타입 창의 Esc는 프레임 메뉴를 닫거나 프레임 콘텐츠로 간다(PRODUCT §5 item 2). 헤더 tooltip이 열린 채 Esc를 누르면 Radix가 tooltip을 닫는다. 프레임 메뉴는 non-modal Popover라서, 메뉴도 열려 있을 때 Radix는 tooltip만 닫는다. 그래서 헤더 tooltip(Reload, 토글 항목, 잘린 이름)의 `onEscapeKeyDown`이 메뉴가 열려 있으면 메뉴도 닫고 포커스를 이름 캡슐에 둔다. 메뉴 열림 상태는 `WindowShell`이 헤더 컨트롤과 메뉴에 함께 넘긴다. tooltip이 없을 때의 Esc는 지금과 같다.

### 그리는 층

- 새 층이 없다. 헤더의 tooltip과 프레임 메뉴는 지금처럼 Radix portal이다.

## 순수 함수로 뺄 것 (`/tdd` 대상)

1. `prototypeViewportBox(panel: {width, height}, mark: PrototypeSize, mode)` (`main/prototype/fit.ts`) → `{x, y, width, height, scale}`(`width`·`height`는 iframe CSS 크기, 보이는 크기는 `width × scale`·`height × scale`을 내린 값). 경우: Responsive 채움(표시 폭 240 포함), Fit 1배(패널이 더 큼, 가운데), Fit 축소(폭 기준, 높이 기준, 둘 다), 표시 0(채움), 패널 0. 모든 출력의 위치와 보이는 크기가 정수인지.
2. `prototypeCaptureRect(content: {width, height}, mark, mode, sideColumn = 0)` (`main/prototype/fit.ts`) → 창 콘텐츠 좌표의 정수 사각형 또는 null(폭이나 높이가 0 이하). 경우: Responsive, Fit 1배, Fit 축소, 패널 0. 헤더 높이는 순수 함수 7의 줄 수로 정한다(56 또는 100). `fitPrototypeWindow`: 맞춘 폭이 R + 304보다 작으면 높이에 44를 더한다(390×844 → R 68에서 406 × 908, R 104·140에서 406 × 952). 작업 영역에서 폭이 잘리면 잘린 폭으로 줄 수를 정한다.
3. `setMode(state, mode)` (`main/prototype/windowState.ts`) → `Step`. 같은 모드면 같은 state 객체(뷰를 보내지 않음), 다른 모드면 effect 없이 `mode`만 바뀜, 처음 값 Fit, `CLOSED`에서도 남음, 로딩 중 전환에서 gen 그대로. `play`·`reload`·`back`·`forward`·`choose`·`close` 뒤 `mode` 유지(`start`의 `base`와 `close`의 새 객체 포함). `start`·`report`가 `run`에 표시 높이를 두는지.
4. `parseModeRequest(kind, value)` (`main/prototype/requests.ts`) → `"fit" | "responsive" | null`. 기존 `record(value, [...])` 꼴로 `{mode}`만 받는다. role 불일치, 다른 문자열, 모르는 속성을 거절.
5. `layersForSnapshot` 확장 (`renderer/prototype/host.ts`): 스냅숏이 실어 온 `box`를 그대로 저장하고, 이후 view의 모드가 바뀌어도 그 상자를 유지. `RunFrame`이 자기 표시 크기를 갖는지(`layersForView`).
6. `modeTooltip(mode, mark)` (`renderer/prototype/view.ts`) → "Fit 390 × 844 to the window", "Responsive". 표시 크기를 모르면(view 없음, run 없음, 표시 0) "Fit to the window".
7. `prototypeHeaderRows(width, right)` (`main/prototype/fit.ts`) → `1 | 2`. width − 224 − right ≥ 80이면 1, 아니면 2. 경우: R 140·104·68 각각 경계 양옆(444/443, 408/407, 372/371), 640·520·406·360.

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11), app-socket, `runtime.json`, `.doan/config.json`, CLI 응답, userData 파일은 바뀌지 않는다. 형식 버전 `v`도 그대로다.
- 바뀌는 것은 앱 내부 IPC뿐이다: 요청 채널 `prototype:mode`(payload `{mode}`), `PrototypeView.mode`, `PrototypeView.run`의 `markHeight`, `PrototypeSnapshot.box`, preload API `setMode`. ARCHITECTURE §7 'Prototype window IPC'의 "No new format"은 그대로 참이다.

## 규칙(conventions) 영향

- 없다. 기본이 Fit 모드이므로 convention 14의 표시 뜻과 PRODUCT의 "at the size the agent marked"는 그대로 지켜진다. Responsive 모드는 사람이 고를 때만 창을 따른다. 새 `doan check` 규칙도 없다. guide가 바뀌지 않으므로 `/agent-eval`도 필요 없다.

## 결정 영향

- **sandbox iframe**(`allow-scripts allow-forms`, no `allow-same-origin`), 주입 스크립트, navigation gate, partition, kill 규칙은 그대로다. 줄이기는 바깥 문서의 CSS `transform`이고 iframe 안으로 아무것도 넣지 않는다.
- **PRODUCT §5 item 2 'Prototype window'**: 마지막 task가 다음을 고친다.
  - 'One window'의 "lays the frame out again when the person resizes it, like a browser viewport; a frame narrower than the content panel of a 360 px window keeps its own width, centred"를 두 모드 문장으로 바꾼다. 창 맞춤은 그대로다.
  - 'Header'의 첫 문장 "Back and Forward in the main window's place and look, Reload prototype, and the playing frame's name …"을 세 무리(왼쪽 Back, Forward, Reload; 가운데 이름; 오른쪽 모드 토글, Export, 대화 버튼)로 바꾸고, 이름이 두 무리 사이 가운데에 놓이며 좁은 창에서 헤더 둘째 줄로 내려가는 것을 더한다. 'One window'의 창 맞춤에 둘째 줄을 더한다.
  - 'Header'의 Reload 문장에서 "keeps the window's size"를 "keeps the window's size and mode"로 고친다.
  - 'Header'의 "Tab reaches Back, Forward, Reload and the name before the frame's content"에 모드 토글(Tab 정지 하나, ←/→)을 더하고(Export와 대화 버튼은 각 feature가 더한다), "Esc … otherwise reaches the content"에 헤더 tooltip 경우를 더한다.
  - 'Header'에 모드 토글: 이름과 tooltip, 기본 Fit, 기억, 포인터 누름이 포커스를 옮기지 않는 것, 포인터 Reload 전 프레임이나 페이지에 있던 포커스가 ready 때도 페이지에 있으면 새 프레임으로 가는 것.
  - 'Content'의 "the frame fills the window's content panel as a viewport"를 모드별로 바꾼다.
- **ARCHITECTURE §3 'Prototype window'**: 'One window'(모드 상태가 닫힘을 넘어 남음), 'Rendering in place'(모드별 iframe 상자, 축소, iframe별 표시 크기), 'Timeout and kill'(캡처 영역과 스냅숏 상자), 'Fit'(창 맞춤만 남김: `PROTOTYPE_NARROW_BELOW` 문장 삭제)가 바뀐다. §7 'Prototype window IPC'에 모드 요청과 스냅숏 상자가 더해진다.
- **형제 feature와 겹치는 곳**
  - `prototype-conversation`: 대화 패널은 콘텐츠 패널 폭을 가져간다. Responsive 모드에서는 그만큼 viewport가 줄고, Fit 모드에서는 viewport가 표시 크기를 지키고 패널이 좁아지면 줄어든다. 그쪽 문서는 이미 이 feature의 헤더(세 무리, 이름 캡슐의 둘째 줄), 창 맞춤 높이(+ 64, 맞춘 폭에서 둘째 줄이면 + 108), Tab 순서(헤더 → 프레임 콘텐츠 → 대화 패널), 포인터 Reload 뒤 포커스 규칙(그쪽 결정 17이 composer를 지킨다), 두 모드의 344 규칙, 캡처의 `sideColumn`을 따른다. 대화 버튼은 오른쪽 무리 끝(Export 뒤 4)에 더해져 R을 104에서 140으로 만들고, 그때 이름은 창 폭 444부터 첫째 줄이다. 대화 열은 헤더 아래에서 창 아래 8까지 내려가고, 콘텐츠 패널은 시작 쪽, 대화 열은 끝 쪽 모서리를 둥글게 둔다. 패널을 연 창은 640 이상이라 이름은 첫째 줄이다. 대화 패널 관련 확인은 `prototype-conversation`이 develop에 있을 때만 한다.
  - `prototype-cli-export`: Export는 헤더 오른쪽 무리에서 토글 다음의 32 chrome 아이콘 버튼(`Download`)이고 자기 Tab 정지를 갖는다(결정 12). 그쪽이 R을 68에서 104로 넓히고, 그쪽 초안은 R 104로 그린다. 그쪽 문서는 이미 이 헤더 배치, 창 맞춤(R 104에서 390×844 → 406 × 952), Tab 순서, 포인터 누름이 포커스를 옮기지 않는 것(결정 10)을 따른다. 저장 패널 뒤 포커스 복귀와 Export의 상태·동작은 그쪽이 정한다. 내보낸 파일은 모드와 상관없이 viewport를 채운다(그쪽 결정 5). `doan open --prototype`의 재생은 다른 Play처럼 모드를 유지한다.
  - 초안: 세 feature가 각자 새 초안을 그리고 기존 `frame-prototype.html`은 고치지 않는다.

## PoC 의존

Fit 모드의 축소(결정 1)와 포인터 포커스(결정 10·13)는 아직 확인하지 않은 가정에 기댄다. 첫 task로 Electron 45 격리 앱에서 확인한다.

- 프로토타입 partition의 cross-origin sandboxed iframe(별도 renderer process)에 바깥 문서가 `transform: scale(s)`을 걸어도 iframe 문서의 `innerWidth`·`innerHeight`·`matchMedia`·`100vh`가 CSS 크기(표시 크기) 그대로인지.
- 줄인 iframe에서 클릭, hover, 드래그, 휠 스크롤, 텍스트 선택이 맞는 요소에 닿는지.
- 줄인 글자가 흐리지 않게 다시 그려지는지(눈으로 확인, 스크린샷).
- 아주 큰 표시(5000×5000)를 줄여 그릴 때 화면이 나오는지와 걸리는 시간·메모리.
- `webContents.capturePage(rect)`가 줄인 iframe을 보이는 대로 찍는지.
- 모드 전환으로 iframe 크기를 바꿔도 문서가 다시 불러와지지 않고 `resize`만 받는지(입력 값과 열린 모달 유지).
- iframe 안 입력에 포커스가 있을 때 바깥 문서 버튼의 `mousedown`에서 `preventDefault()`를 부르면, 클릭은 일어나고 포커스는 iframe 입력에 남는지.
- 바깥 문서가 새 run의 cross-origin sandboxed iframe에 `focus()`를 부르면 그 뒤의 키가 프레임 문서로 가는지(결정 13).

실패하면 design.md를 고치고 멈춰 사용자에게 해당 결정을 다시 묻는다. Responsive 모드는 지금 코드와 같은 방식이라 PoC가 필요 없다.

### PoC 결과

2026-11-13, Electron 45.0.0, dev 빌드(`app/out/`)를 격리 환경(`app/runtime/` 임시 userData·HOME·SHELL·DOAN_RUNTIME)으로 띄웠다. probe는 `.scratch/prototype-responsive/probe.mjs`이고, 앱 코드는 바꾸지 않고 바깥 문서에 축소 상자와 리스너를 주입했다. 축소는 패널 344 × 500, 표시 390×844, scale 0.592(보이는 상자 231 × 500, x 56)로 쟀다. 입력은 Playwright가 CDP로 창에 보낸 포인터·키 이벤트이고 OS의 실제 입력은 아니다. 실제 사용자 상태는 바뀌지 않았다(real-state 확인 통과). 여덟 항목 모두 통과했다.

- (a) 통과: 줄인 iframe 문서의 `innerWidth` 390, `innerHeight` 844, `(width: 390px)`·`(height: 844px)` media query 일치, `100vh` 844, `documentElement` 390 × 844.
- (b) 통과: 클릭 1회가 버튼에 닿았고, hover는 `:hover`와 `mouseenter`가 맞았다. 화면 30 × 20 드래그는 문서 좌표 50.6 × 33.8(= 30/s × 20/s)로 왔고, 휠은 스크롤 상자를 202.5 움직였으며, 텍스트 선택은 "Alpha bravo charlie del"이었다.
- (c) 통과(눈으로 확인): 11px·20px 글자가 0.592배에서도 흐리지 않게 다시 그려졌다(`c-text-scaled.png`, 프레임 DPR 2).
- (d) 통과: 5000×5000 표시를 패널 1424 × 759에서 scale 0.152로 줄이자 245 ms 안에 네 모서리 표식이 모두 찍혔다. 앱 전체 메모리는 줄이기 전 681 MB에서 704 MB로 늘었다. 줄인 문서의 `innerWidth`·`innerHeight`는 5000이다.
- (e) 통과: `webContents.capturePage({x: 64, y: 56, width: 231, height: 500})`가 줄인 프레임을 보이는 대로 찍었다(462 × 1000 px, 왼쪽 위 빨강·오른쪽 위 파랑·아래 막대 초록이 제자리).
- (f) 통과: Fit → Responsive(344 × 500) → Fit으로 iframe 크기만 바꿨을 때 문서가 다시 불러와지지 않았다(같은 boot 표식, `load` 1회). `resize`만 두 번 받았고 입력 값 "keep"과 열린 `<dialog>` 모달이 남았다.
- (g) 통과: 프레임 입력에 포커스가 있을 때 `mousedown`에서 `preventDefault()`를 부르는 바깥 버튼을 포인터로 누르면 클릭은 일어나고, 바깥 `activeElement`는 iframe, 프레임 `activeElement`는 그 입력으로 남았으며, 이어 친 키가 입력에 들어갔다. 대조군(`preventDefault()` 없음)은 포커스를 버튼으로 가져가 키가 프레임에 가지 않았다.
- (h) 통과: Reload에 `mousedown` `preventDefault()`를 걸고 포인터로 누르자(누르기 전 포커스는 iframe) 새 run이 정상으로 떴다(새 boot 표식, overlay 없음, 390 × 844). ready 때 바깥 포커스는 `body`였고, 바깥 문서가 새 iframe에 `focus()`를 부른 뒤의 키("k", "q")가 새 프레임 문서로 갔다.
- 구현에 남길 관찰: 프로토타입 페이지의 CSP(`default-src 'self'`)는 주입한 `<style>` 요소를 막는다. 축소 상자는 React 인라인 style(CSSOM)로 주면 된다.

## POSTMORTEM에서 가져온 함정

- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: "a wrapper that adapts props for some states keeps the same component tree in every state and decides inside it". 모드 버튼은 눌림이 바뀌어도 같은 요소로 남아야 하고, Reload와 모드 버튼은 view가 처음 와서 `disabled`가 풀려도 같은 요소로 남아야 한다. 토글 항목도 `IconTip`의 `TooltipTrigger`(asChild) 구조를 쓴다. 이름 캡슐은 줄이 바뀌어도 DOM에서 옮기지 않고 CSS(`.pw.name-row`)로 자리만 바꾸므로 포커스와 열린 메뉴가 남는다. 두 상태를 렌더해 자식 요소의 `type`이 같은지 테스트하고, 실제 앱에서 포커스된 버튼의 눌림을 바꾼 뒤 `document.activeElement`를 읽는다.
- **2026-11-07 'A toolbar tooltip took the Esc the canvas needed'**: "a Radix layer over a control whose Esc matters hands the decision on rather than taking the step". 헤더 tooltip은 Esc를 혼자 갖지 않고, 프레임 메뉴가 열려 있으면 메뉴 닫기를 함께 한다. tooltip과 메뉴가 함께 열린 경우와 tooltip만 열린 경우를 테스트한다.
- **2026-11-02 'Tab walked into the draft…'**: `overflow: hidden` 상자는 포커스된 자손을 드러내려고 스크롤한다. Fit 모드에서 줄인 프레임의 아래쪽 컨트롤로 Tab하면 `.pw-panel`이 스크롤해 프레임 자리가 틀어질 수 있으므로 `.pw-panel`을 `overflow: clip`으로 바꾼다.
- **2026-11-02 'Every Overview menu…'**: 새로 그리는 층은 기존 portal 메뉴보다 위에 그려지면 안 된다. 이 feature는 새 층을 더하지 않는다. 둘째 줄 캡슐에서 연 메뉴가 헤더와 프레임 위에 그려지는지 스크린샷으로 판정한다.
- **2026-11-01 'A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever'** (줄 수는 창 폭과 R로만 정하고 패널 크기에서 다시 읽지 않으므로 줄 바꿈도 고리를 만들지 않는다): "for any value the canvas measures against a size the renderer then sets from it, test the loop to its fixed point". 이 feature의 iframe 상자는 패널 크기와 표시 크기로만 정하고 프레임 문서에서 잰 값을 받지 않으므로 고리가 생기지 않는다. 이 성질을 유지한다.

## 디자인 프리셋

- `clarify`: 이름은 사용자가 정한 "Fit", "Responsive"이고 접근 이름도 같다. 토글 묶음의 이름은 두 모드가 정하는 대상인 "Viewport"다. Fit의 tooltip은 크기와 맞추는 대상(창)을 함께 말하는 "Fit 390 × 844 to the window"로 접근 이름보다 길다. 크기 앞에 "to"를 두면 창을 그 크기로 바꾼다고 읽힌다. 크기는 숫자를 구조로 두고 "×"(U+00D7)와 공백을 PRODUCT·DESIGN의 크기 표기와 맞춘다.
- `adapt`: "A size is not a device"에 따라 기기 이름을 쓰지 않는다. 창이 좁아지면 이름이 헤더 둘째 줄로 내려가고, 컨트롤은 줄지 않는다. 창 폭 360·406·520·640과 R마다 경계 양옆을 그렸다.
- `harden`: 로딩·실패·lost 상태의 헤더, 정지 이미지 자리, 작업 영역보다 큰 표시, 표시 크기를 모르는 run, 아주 큰 표시를 상태로 다룬다.

## 참고와 출처

- Chrome DevTools의 device toolbar(Responsive 크기, 가장자리 손잡이, "Fit to window" 줌)는 기억으로만 참고했다. 2026-11-13에 `developer.chrome.com/docs/devtools/device-mode`를 열려 했지만 이 환경에서 접속하지 못해(`ENOTFOUND`) 확인하지 못했다. 이 문서의 어느 규칙도 그 동작에 기대지 않는다.
- 모드 탭: `.doan/ds/mode-tabs.html`, `styles.css` `.shell-modes`. chrome 아이콘 버튼: `ds/controls.css`. ←/→: `CanvasTools.tsx` `moveBetweenTools`. 헤더 수치: DESIGN.md 'Frame prototype'. 헤더 줄 패턴: `styles.css` `.pw`, `fit.ts` `PROTOTYPE_CHROME`.
- `/feature-review` 결과(A 1–25, B 1–5, C)는 사용자 결정대로 반영했다.
