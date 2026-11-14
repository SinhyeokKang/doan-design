# canvas-mark-accent — design

## 바뀌는 곳

- 앱 렌더러만 바뀐다.
  - `app/src/renderer/styles.css`: `.mark`, `.mark.hover`, `.dims`, `.bubble-play`, `.mark.jump-highlight`(그리고 `.working`)
  - `app/src/renderer/CanvasController.ts`: 크기 버블 구성(`makeBubble`, `placeSize`), `SIZE_BUBBLE.gap`(159행), 버블 포커스
  - `app/src/renderer/sizeBubble.ts`·`sizeBubble.test.ts`: 위치 판단(`sizeBubblePlace`). 함수는 바꾸지 않고, 넘기는 간격만 바뀐다
  - `app/src/renderer/App.tsx`: 버블 버튼의 가용성, 툴팁, 칩 넣기
  - `app/src/renderer/ds/checks.test.ts`: accent 사용처 고정(`accentPlaces`, `violetAllowed`)에 새 선택자를 더한다
  - 순수 함수는 `canvasPicker.ts`에 둔다
- CLI, 스킬, 형식, `doan check` 규칙은 바뀌지 않는다.

## 색

| 대상 | 지금 | 바뀐 뒤 |
|---|---|---|
| 선택·호버 선 | 1px `--border-focus`(검정) + 바깥 `--surface-panel` 1px 링 | 1.5px `--text-accent`(`--buddy-icon`), 링 없음 |
| 크기 버블 | `--affordance-prominent` 배경, `--text-on-prominent` 글자 | `--affordance-accent` 배경, `--text-on-accent` 글자 |
| 버블 버튼 잉크·호버 칠·키보드 링 | `--text-on-prominent` 기준 | `--text-on-accent` 기준(호버와 누름 칠 16 % 혼합, 링 2px −2px는 그대로) |
| Add to message 비활성 | 없음(새 버튼) | 잉크 `color-mix(--text-on-accent 45 %, transparent)`, 칠 없음, `cursor: default` |
| 점프 하이라이트 | accent → `--indigo-600` 선, 흰 링, accent 45 % 빛 번짐 | 같음 |

- 선에 `--affordance-accent`(버디 9단계)를 쓰지 않는다. 푸리 #55bc98·둥둥 #e8ab00은 흰 캔버스 대비가 약 2:1이다. `--text-accent`는 DESIGN.md 'Tokens'가 "Accent icons, dots and outlines"로 정한 역할이고, 흰 캔버스에서 다섯 버디 모두 4.24–5.21:1이다(tech 리뷰 계산).
- 버블은 accent 버튼과 같은 조합이다(`--affordance-accent` + `--text-on-accent`, DESIGN.md 'Accent places').
- **버블 글자 대비 예외**(사용자 결정): 12px 크기 글자가 포포 3.02:1, 도리 3.20:1로 본문 기준 4.5:1에 못 미친다(도니 5.21, 푸리 8.25, 둥둥 9.36). accent 버블을 유지하고 DESIGN.md 'Intended exceptions'에 적는다. 지금 116행 "Dimension label = tooltip capsule" 항목을 이 내용으로 바꾼다.
- 비활성 잉크를 `--text-disabled`로 하지 않는 이유: 보라 accent 위에서는 거의 안 보이고, 둥둥 accent 위에서는 활성 잉크보다 뚜렷해 보인다(사용자 결정).
- **버블 버튼 칠의 특이도**: `ds/controls.css`의 기본 icon-button hover 규칙(97행)은 (0,4,0), active 규칙(112행)은 (0,5,0)이다. 지금 `.bubble-play:hover`((0,2,0))는 hover 규칙에 져서 불투명한 연회색 칠이 된다(초안 리뷰에서 headless Chromium으로 확인, 앱에서는 재지 않음). 초안은 `.overlay .dims .bubble-button:is(:hover, :active):not([aria-disabled="true"])`((0,5,0))로 쓴다. active와는 동점이고, `styles.css`가 `ds/index.css`를 먼저 `@import`하므로 나중에 오는 이 규칙이 이긴다. 그래서 이 규칙은 `styles.css`에 두어야 한다.
- 새 토큰은 없다.

## 기하

요소 영역은 `boardRectToScreen`으로 얻는 화면 사각형 `r`이다. 표시는 화면 px이므로 캔버스 배율과 관계없이 두께와 바깥 간격이 같다.

- **선택·호버**: 선이 `r` 바깥 1.5px를 차지한다. CSS만으로 한다: `.mark { box-sizing: content-box; margin: -1.5px; border-width: 1.5px }`. 그러면 `place`, `drawJump`, `drawWork`의 배치 코드는 바뀌지 않는다. JS를 건드리게 되면 POSTMORTEM 2026-11-11 규칙대로 `className`과 `hidden`은 건드리지 않는다.
- Chromium은 테두리 두께를 장치 픽셀 단위로 내림하므로 2x 화면에서는 3 장치 픽셀, 1x에서는 1px로 그린다. 측정은 2x 기준이고, 1x는 probe로 틈과 번짐만 확인한다.
- **크기 버블**: 선의 바깥 가장자리에서 5px 아래(위로 뒤집힐 때는 5px 위)에 둔다.
  - CSS: `top: calc(100% + 1.5px + 5px)`(뒤집힐 때 `bottom`도 같다). 100%가 표시 박스의 padding box(`r`)라 선 두께를 더해야 한다. 지금 앱은 이 때문에 1px 선 바깥에서 4px 떨어져 있다.
  - 배치 판단: `sizeBubblePlace`는 그대로 두고 `SIZE_BUBBLE.gap`을 5에서 6.5로 바꾼다. 아래·위·안쪽 결과가 선 바깥 가장자리 기준 5px가 되고, `inside`의 `style.top`(padding box 기준)도 그대로 맞는다.
- **점프 하이라이트**: 3px 선이 `r` 바깥 3px를 차지하고, 흰 1px 링은 그 바깥 1px, 빛 번짐은 링에서 시작한다. CSS: `.mark.jump-highlight:not(.jump-point) { box-sizing: content-box; margin: -3px }`. `::before`(inset −3px)는 그대로 맞는다. 강제 색상 모드의 3px `Highlight` 테두리도 같은 자리다. 작업 중 프레임 표시(`.working`, `drawWork`)도 같은 규칙을 받고, `.moving`의 슬라이드는 그대로다.
- **점**: 12px 원은 그대로다(선택자의 `:not(.jump-point)`).

## 크기 버블의 Add to message

- **구조**: `.dims` 안에 Play 버튼(있을 때), 크기 글자, Add to message 버튼의 순서다. 패딩은 0 4 0 8(크기 글자 앞 8, 버튼 뒤 4), Play가 있으면 0 4 0 4이고, 간격은 4다. DOM 순서가 보이는 순서이자 Tab 순서다. Tab 순서와 화면 밖 버블의 포커스는 지금 Play와 같게 두고 바꾸지 않는다.
- **버튼**: `doan-icon-button` xs(24×24, pill), 14px lucide `Crosshair`, `aria-label` "Add to message".
- **렌더 방식**(권장): 컨트롤러가 `.dims` 끝에 고정 host 요소를 만들고, App이 `createPortal`로 `<Tooltip><TooltipTrigger asChild><button>`을 넣는다. 가용성, 이유, 버튼 정체성(`OwnDescription`)을 React 렌더가 맡는다. 가용성은 App의 `pickerView`(`panelTarget === null` 포함)에서 오므로 컨트롤러에 따로 밀어 넣을 필요가 없다.
  - 함정 1: pointerdown·mousedown·click이 캔버스로 퍼지지 않게 하는 처리는 React 핸들러로는 늦다. 조상 viewport의 native 리스너(`clickOnMargin` 등)가 먼저 돈다. 지금 Play처럼 ref로 native 리스너를 단다.
  - 함정 2: 툴바 툴팁처럼 `onEscapeKeyDown`에 `CanvasController.toolbarEscape`를 연결한다(ARCHITECTURE §3 'Actions and focus'). 그래야 툴팁이 열린 동안에도 Esc 한 번에 툴팁이 닫히고 선택이 한 단계 올라간다.
- **툴팁**: 앱의 공유 `Tooltip`(위쪽, offset 4, 버튼 가운데)이다. 쓸 수 있으면 "Add to message", 쓸 수 없으면 이유를 보이고, 이유는 접근성 설명(`aria-describedby`)으로도 붙인다(Play controls와 같은 방식). 키보드 포커스에서도 보인다. Play는 지금처럼 툴팁이 없다.
- **가용성**: 다음 순서로 판단한다. 쓸 수 없으면 `aria-disabled`(not `disabled`)이고 버블 모양은 그대로다.
  1. Capture area 모드: "Finish or cancel the capture first."
  2. 선택이 프레임 밖 요소(노트)라서 `targetAnchor`가 프레임 없는 앵커를 낼 때: "Only frames and what's in them can go in a message." Pick이 프레임 밖을 칩으로 만들지 않는 규칙(PRODUCT §5 item 6, `CanvasController.ts:1316-1318`)과 맞춘다.
  3. `pickerView`가 쓸 수 없다고 할 때: 그 이유. 단, 캔버스 쪽 이유는 버블용 문장으로 바꾼다. 목록에 없는 캔버스는 기존 `canvasUnlistedText`, 나머지는 "Add to message isn't available while the canvas can't be shown."이다. `PICKER_UNAVAILABLE`은 다른 버튼 이름("Pick from canvas")을 말하므로 쓰지 않는다.
  4. reload 뒤 선택을 다시 찾는 중(`reanchoring`)에는 버블이 숨으므로 판단하지 않는다(아래 '포커스' 참고).
- **누르면**(`App.tsx`의 `pickFromCanvas`·`pickEnded`와 같은 길):
  1. 누른 순간의 선택으로 `targetAnchor`를 만들어 고정한다.
  2. 패널이 접혀 있으면 펼친다(`foldPanel(true, "content")`, Picker와 같은 조건). 접힌 패널의 컴포저는 마운트돼 있고 `.doan-conv-column`만 `inert`라서 같은 핸들러 안에서 `focus()`가 먹지 않는다. 그래서 넣기는 inert가 풀린 커밋 뒤로 미룬다. 위치는 inert를 끄는 layout effect보다 뒤에 선언한 layout effect다. 패널이 이미 열려 있으면 바로 넣는다.
  3. 대기 중인 넣기는 하나뿐이고 `FocusIntent`를 싣는다(ARCHITECTURE §3 'A pending pick or Add carries a `FocusIntent`'). 그 사이 다른 곳에서 `focusin`이 일어나면 포커스는 포기하고 칩만 넣는다. 다른 캔버스를 열거나, 대화가 바뀌거나, 컴포저가 입력을 받지 않게 되면 넣기를 버린다.
  4. 컴포저 필드에 포커스를 주고(조합 중이 아니면) `link.insert(anchor)`로 넣는다. 포커스를 먼저 주는 이유는 `pickEnded`의 주석과 같다(나중에 포커스를 주면 Chromium이 커서를 필드 맨 앞으로 옮긴다). 조합 중인 필드는 조합이 끝난 뒤 칩을 받는다.
  5. 선택, 크기 버블, `doan active`는 건드리지 않는다.
  6. 같은 대상을 다시 누르면 칩이 하나 더 들어가고, 반복된 Pick처럼 32곳 한도에는 한 번만 센다(PRODUCT §5 item 6).
- **포커스**(사용자 결정):
  - 버블이 사라질 때 Add to message에 포커스가 있었으면 툴바 Picker로 보내고, 없으면 viewport로 보낸다(`preventScroll`). 버블 Play는 지금처럼 툴바 Play로 간다(`App.tsx` `bubblePlay.onFocusLost`).
  - Play만 사라지고 버블이 남으면 Play에 있던 포커스는 같은 버블의 Add to message로 간다.
  - reload 뒤 같은 선택을 다시 찾았고 그 사이 포커스가 옮겨지지 않았으면, 포커스를 같은 버튼으로 돌려준다.
  - 버블 버튼에 포커스가 있을 때 ⌘L이나 툴바 Picker로 pick을 시작하면, pick이 선택을 지워 버튼이 숨는다. 이때 `togglePick`이 기록한 `from`이 숨은 버튼이면 pick을 취소할 때 포커스를 컴포저 필드로 보낸다. 페이지 body로 떨어지지 않게 하기 위해서다(PRODUCT §5 item 6 "never the page body"). 지금 Play에도 같은 경로가 있을 수 있으니 같이 고친다.
  - 가용성이 바뀌어도 버튼 요소는 같은 요소다(POSTMORTEM 2026-11-13).
- **Esc**: 버블 버튼에서 누른 Esc는 편집 필드가 아닌 곳의 Esc와 같이 선택을 한 단계 올린다(`CanvasController.ts` 1354행 근처). 툴팁이 열려 있어도 같다(위 함정 2).

## 순수 함수(`/tdd` 대상)

1. **버블 Add to message 가용성**(`canvasPicker.ts`): capture 모드 여부, 선택의 앵커(프레임 유무), `pickerView`, 목록에 없는 캔버스 여부를 받아 `{ enabled, reason }`를 낸다. 순서는 '가용성' 1–3과 같다.
2. **간격**: `SIZE_BUBBLE.gap` 6.5에서 `sizeBubblePlace`(`sizeBubble.ts`)의 아래·위·안쪽 결과가 선 바깥 가장자리 기준 5px다. 기존 `sizeBubble.test.ts`의 기대값을 이 기준으로 고친다.
3. **앵커**: App이 `targetAnchor`에 넘기는 값이 누른 순간의 현재 선택이다. 노트, 프레임 안 요소, 중첩 프레임 안 요소에서 버블과 Pick이 같은 앵커를 낸다. 노트는 버블이 비활성이다.

## POSTMORTEM에서 가져온 함정

- 2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew…': 가용성이 바뀌어도 버튼 요소의 정체성을 유지한다. 실제 앱 probe에서는 Add to message에 포커스를 둔 채 컴포저가 입력을 받지 않게 만들거나 캔버스 읽기를 실패시킨 뒤 `document.activeElement`를 읽는다.
- 2026-11-11(className·hidden): JS로 표시를 옮기게 되면 `className`과 `hidden`을 건드리지 않는다.
- 2026-11-14 'The installed Doan.app came up on the real userData…': 실제 앱 probe는 격리한다(임시 userData·HOME·SHELL·`DOAN_RUNTIME`, 설치된 `doan`을 `PATH`에서 뺌).

## 대비 측정

- 흰 캔버스에서 다섯 버디의 선 대비(`--text-accent` 대 흰색). 3:1 이상이어야 한다.
- 다섯 버디의 버블 글자 대비(`--text-on-accent` 대 `--affordance-accent`). 기록만 한다(포포·도리는 예외).
- 흰색·#050507·#5b21b6 캔버스(초안 `backgrounds`가 같은 색)에서 선택 선과 점프 하이라이트를 측정한다. 3:1 미만도 기록한다. DESIGN.md 'Overlay marks'의 기존 대비 기록(BR6 probe)과 'Not verified'의 강제 색상·사진 배경 줄(802–803행)을 새 위치 기준으로 바꾼다.

## 영향 없음

- 형식: 없음. 칩은 기존 앵커 그대로다.
- 규약(ARCHITECTURE §1)·`doan check`: 없음.
- 구조 결정: 없음. ARCHITECTURE §3 'Picking and locate'와 §7 'Renderer primitives'는 칩이 캔버스 스크립트의 pick에서 온다고 쓴다. 승격할 때 두 단락을 읽고, 렌더러가 선택에서 앵커를 만드는 경로를 한 줄 더한다.
- PoC 의존: 없음.

## 디자인 프리셋

`clarify`를 읽었다. 버튼 이름 "Add to message"는 결과(메시지 초안에 넣음)를 동사와 목적어로 말한다. 칩을 넣는 같은 동작의 기존 이름 "Pick from canvas"는 고르는 동작이라 이 버튼에 맞지 않는다. 비활성 문구도 같은 이유로 다른 버튼 이름을 쓰지 않는다.

## 초안 요청

- 캔버스 `.doan/canvases/canvas-mark-accent.html`, id `canvas-mark-accent`, 폭 1200.
- 프레임 다섯 개.
  - `marks`: 선택·호버와 바깥 기하
  - `bubble`: 크기 버블의 Add to message, Play, 위로 뒤집힘, 호버와 툴팁, 키보드 포커스, 비활성
  - `jump`: 점프 하이라이트, 작업 중 프레임, 점
  - `buddies`: 다섯 버디
  - `backgrounds`: 흰색·어두운색·보라색 캔버스
- 이 초안은 이 브랜치가 병합될 때까지 이 화면의 기준이다. 기존 초안(`doan-canvas.html`, `frame-first-selection.html`, `frame-prototype.html`)은 고치지 않는다.
- 초안에 없는 상태(노트 선택과 capture 중의 비활성 문구)는 이 문서가 기준이다. 모양은 초안의 32곳 한도 비활성 타일과 같다.

## 확인 기록

- 초안 독립 리뷰를 반영했다(버블 간격 5px, 버튼 칠 특이도, 툴팁 위치, 점 분기, 측정 배경색).
- 2026-11-14 사용자가 리뷰 중에 정했다: 선 1.5px, 버블 순서 Play · 크기 · Add to message, 비활성 잉크 45 % 혼합. 레이아웃은 "지금 괜찮다"고 했다.
- 2026-11-14 사용자가 초안을 확정했다.
- 2026-11-14 `/feature-review`(product, tech, qa, uxui) 뒤 사용자가 정했다: 노트 선택과 capture 중에는 비활성과 이유, 버블에서 포커스를 잃으면 툴바 Picker로, 포포·도리 버블 글자 대비는 예외로 기록. 나머지 권장 수정은 모두 반영했다.
