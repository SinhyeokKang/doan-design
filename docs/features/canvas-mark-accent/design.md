# canvas-mark-accent — design

## 바뀌는 곳

- 앱 렌더러만 바뀐다.
  - `app/src/renderer/styles.css`: `.mark`, `.mark.hover`, `.dims`, `.bubble-play`, `.mark.jump-highlight`(그리고 `.working`)
  - `app/src/renderer/CanvasController.ts`: 표시 박스 배치, 크기 버블 구성(`makeBubble`), 버블 위치
  - `app/src/renderer/App.tsx`: 버블 버튼을 칩 넣기에 잇는다
  - 순수 함수는 `selection.ts` 또는 `canvasPicker.ts`에 둔다
- CLI, 스킬, 형식, `doan check` 규칙은 바뀌지 않는다.

## 색

| 대상 | 지금 | 바뀐 뒤 |
|---|---|---|
| 선택·호버 선 | 1px `--border-focus`(검정) + 바깥 `--surface-panel` 1px 링 | 1.5px `--text-accent`(`--buddy-icon`), 링 없음 |
| 크기 버블 | `--affordance-prominent` 배경, `--text-on-prominent` 글자 | `--affordance-accent` 배경, `--text-on-accent` 글자 |
| 버블 버튼 잉크·호버 칠·키보드 링 | `--text-on-prominent` 기준 | `--text-on-accent` 기준(호버와 누름 칠 16 % 혼합, 링 2px −2px는 그대로) |
| Add to message 비활성 | 없음(새 버튼) | 잉크 `color-mix(--text-on-accent 45 %, transparent)`, 칠 없음, `cursor: default` |
| 점프 하이라이트 | 변경 없음(accent → `--indigo-600` 선, 흰 링, accent 45 % 빛 번짐) | 같음 |

- 선에 `--affordance-accent`(버디 9단계)를 쓰지 않는다. 푸리 #55bc98·둥둥 #e8ab00은 흰 캔버스 대비가 약 2:1이다. `--text-accent`는 DESIGN.md 'Tokens'가 "Accent icons, dots and outlines"로 정한 역할이고, `tokens.css` 주석대로 다섯 버디 모두 3:1을 넘는다.
- 버블은 accent 버튼과 같은 조합이다(`--affordance-accent` + `--text-on-accent`, DESIGN.md 'Accent places'). `--text-on-accent`는 버디마다 흰색 또는 표준 잉크다.
- 비활성 잉크를 `--text-disabled`로 하지 않는 이유: 보라 accent 위에서는 거의 안 보이고, 둥둥 accent 위에서는 활성 잉크보다 뚜렷해 보인다(사용자 결정).
- 버블 버튼의 호버·누름 칠 선택자는 `ds/controls.css`의 기본 icon-button hover(97행)·active(112행) 규칙(특이도 (0,4,0))보다 강해야 한다. 지금 `.bubble-play:hover`((0,2,0))는 이 규칙에 져서 불투명한 연회색 칠이 된다(초안 리뷰에서 headless Chromium으로 확인, 앱에서는 재지 않음). 초안은 `.overlay .dims .bubble-button:is(:hover, :active):not([aria-disabled="true"])`로 쓴다.
- 새 토큰은 없다.

## 기하

요소 영역은 `boardRectToScreen`으로 얻는 화면 사각형 `r`이다.

- **선택·호버**: 선이 `r` 바깥 1.5px를 차지한다. 즉 표시 박스의 바깥 가장자리는 `r`을 사방 1.5px 넓힌 사각형이다. 방법(박스를 넓혀 배치하거나 `outline`을 0 offset으로 그림)은 구현이 고른다. 점선은 Chromium의 `dashed`가 그리는 그대로다. Chromium은 테두리 두께를 장치 픽셀 단위로 내림하므로 2x 화면에서는 3 장치 픽셀, 1x에서는 1px로 그린다. 1x에서 생기는 0.5px 틈의 반올림은 구현이 정하고, 측정은 2x 기준이다.
- **크기 버블**: 선의 바깥 가장자리에서 5px 아래(위로 뒤집힐 때는 5px 위)에 둔다. `top: calc(100% + 5px)`의 100%는 표시 박스의 padding box라서 선 두께를 더해야 한다(`calc(100% + 1.5px + 5px)`). 지금 앱은 이 때문에 1px 선 바깥에서 4px 떨어져 있다(초안 리뷰). `SIZE_BUBBLE.gap`(5)과 `inside` 배치의 `style.top`도 선 바깥 가장자리 기준으로 맞춘다. `sizeBubblePlace`의 안쪽·위쪽 판단도 같은 기준이다.
- **점프 하이라이트**: 3px 선이 `r` 바깥 3px를 차지하고, 흰 1px 링은 그 바깥 1px, 빛 번짐은 링에서 시작한다. 모서리 radius 1은 선 바깥 모서리 기준으로 유지한다. 강제 색상 모드의 3px `Highlight` 테두리도 같은 자리다. 점은 넓히지 않는다: `drawJump`(`CanvasController.ts`)는 사각형과 점을 같은 박스 코드로 놓으므로 사각형 분기에서만 넓힌다. 작업 중 프레임 표시(`.working`)도 같은 기하이고, `.moving`의 슬라이드는 그대로다.
- **점**: 12px 원은 그대로다.

## 크기 버블의 Add to message

- 구조: `.dims` 안에 Play 버튼(있을 때), 크기 글자, Add to message 버튼의 순서다. 패딩은 0 4 0 8(크기 글자 앞 8, 버튼 뒤 4), Play가 있으면 0 4 0 4이고, 간격은 4다. 클래스 이름은 구현이 정한다.
- 버튼: `doan-icon-button` xs(24×24, pill), 14px lucide `Crosshair`, `aria-label` "Add to message". Play와 같이 오버레이의 pointer 대상이다(`pointer-events: auto`, pointerdown·mousedown·click이 캔버스로 퍼지지 않는다).
- 툴팁: 앱의 공유 `Tooltip` 모양(위쪽, offset 4, 버튼 가운데)으로 "Add to message" 또는 쓸 수 없는 이유를 보인다. 버블 버튼은 컨트롤러가 만드는 DOM이라 공유 툴팁을 어떻게 걸지는 구현이 정한다. Play는 지금처럼 툴팁이 없다.
- 쓸 수 있는지는 Pick from canvas의 `pickerAvailability(panelBlocked, canvasLoad, composerChips)`를 그대로 쓴다. 쓸 수 없으면 `aria-disabled`이고 툴팁은 그 `reason`이다. Pick이 진행 중일 때는 선택이 지워지므로 버블이 없다.
- 누르면 다음 순서로 동작한다(`App.tsx`의 `pickFromCanvas`·`pickEnded`와 같은 길).
  1. `targetAnchor(선택 대상)`로 앵커를 만든다.
  2. 접힌 패널을 펼친다(`foldPanel(true, "content")`, Picker와 같은 조건).
  3. 컴포저 필드에 포커스를 주고(조합 중이 아니면) `link.insert(anchor)`로 넣는다. 포커스를 먼저 준 뒤 넣는 이유는 `pickEnded`의 주석과 같다(커서가 필드 맨 앞으로 가는 Chromium 동작).
  4. 선택, 크기 버블, `doan active`는 건드리지 않는다.
  5. 같은 대상을 다시 누르면 칩이 하나 더 들어가고, 반복된 Pick처럼 32곳 한도에는 한 번만 센다(PRODUCT §5 item 6).
- 패널을 막 펼쳐서 컴포저가 아직 없으면 넣기를 그 컴포저가 등록된 뒤로 미룬다. 넣지 못하고 사라지게 두지 않는다.
- 사용할 수 없게 되는 순간(32곳째 칩) 포커스가 버블 버튼에 있으면 같은 요소가 남아야 한다(POSTMORTEM 2026-11-13 'A toolbar control that turned unavailable while focused…'). 버블 버튼은 컨트롤러가 직접 만드는 DOM이라 React 트리 교체 문제는 없지만, 버튼을 다시 만들지 말고 속성만 바꾼다.
- Esc, 선택 해제 등으로 버블이 사라질 때 포커스가 버블 버튼에 있었다면 지금 Play의 `onFocusLost` 규칙(`PrototypeClosedFocus.tsx`의 `closedFocusTarget`)을 따른다. 두 버튼 모두에 적용한다.

## 순수 함수(`/tdd` 대상)

1. **버블 구성**: 선택, Play 가능 여부, picker 가용성을 받아 `{ anchor: { enabled, reason }, play: boolean }`를 낸다. 선택이 없으면 버블이 없다.
2. **표시 박스·버블 위치**: 화면 사각형과 선 두께를 받아 표시 박스(바깥 가장자리)를 내고, `sizeBubblePlace`가 그 바깥 가장자리 기준으로 아래·안쪽·위를 고른다(기존 테스트의 기대값이 바뀐다).
3. **버블에서 칩 넣기**: 선택 대상에서 `targetAnchor`가 내는 앵커가 Pick이 같은 대상에서 내는 것과 같다(같은 함수를 쓰는지 테스트로 고정).

## POSTMORTEM에서 가져온 함정

- 2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew…': 가용성이 바뀌어도 버튼 요소의 정체성을 유지한다. 실제 앱 probe에서 포커스된 Add to message를 비활성으로 바꾼 뒤 `document.activeElement`를 읽는다.
- 2026-11-14 'The installed Doan.app came up on the real userData…': 실제 앱 probe는 격리한다(임시 userData·HOME·SHELL·`DOAN_RUNTIME`, 설치된 `doan`을 `PATH`에서 뺌).

## 대비 측정

- 흰 캔버스에서 다섯 버디의 선 대비(`--text-accent` 대 흰색).
- 다섯 버디의 버블 글자 대비(`--text-on-accent` 대 `--affordance-accent`).
- 흰색·#050507·#5b21b6 캔버스(초안 `backgrounds`가 같은 색)에서 선택 선과 점프 하이라이트를 측정한다. DESIGN.md 'Overlay marks'의 기존 대비 기록(BR6 probe)을 새 값으로 바꾼다.

## 영향 없음

- 형식: 없음. 칩은 기존 앵커 그대로다.
- 규약(ARCHITECTURE §1)·`doan check`: 없음.
- 구조 결정: 없음.
- PoC 의존: 없음.

## 디자인 프리셋

`clarify`를 읽었다. 버튼 이름 "Add to message"는 결과(메시지 초안에 넣음)를 동사와 목적어로 말한다. 칩을 넣는 같은 동작의 기존 이름 "Pick from canvas"는 고르는 동작이라 이 버튼에 맞지 않는다.

## 초안 요청

- 캔버스 `.doan/canvases/canvas-mark-accent.html`, id `canvas-mark-accent`, 폭 1200.
- 프레임 다섯 개.
  - `marks`: 선택·호버와 바깥 기하
  - `bubble`: 크기 버블의 Add to message, Play, 위로 뒤집힘, 호버와 툴팁, 키보드 포커스, 비활성
  - `jump`: 점프 하이라이트, 작업 중 프레임, 점
  - `buddies`: 다섯 버디
  - `backgrounds`: 흰색·어두운색·보라색 캔버스
- 이 초안은 이 브랜치가 병합될 때까지 이 화면의 기준이다. 기존 초안(`doan-canvas.html`, `frame-first-selection.html`, `frame-prototype.html`)은 고치지 않는다.

## 확인 기록

- 초안 독립 리뷰를 반영했다(버블 간격 5px, 버튼 칠 특이도, 툴팁 위치, 점 분기, 측정 배경색).
- 2026-11-14 사용자가 리뷰 중에 정했다: 선 1.5px, 버블 순서 Play · 크기 · Add to message, 비활성 잉크 45 % 혼합. 레이아웃은 "지금 괜찮다"고 했다.
