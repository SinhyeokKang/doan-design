# 프레임 이름표 — design

## 영향 범위

- **앱(renderer)**:
  - `app/src/renderer/CanvasController.ts`: overlay에 이름표 층을 둔다. 팬과 줌에서는 선택 표시처럼 transform을 동기로 고치고 React는 다시 그리지 않는다.
    - 선택: 프레임 drawer의 `selectFrame`(`pick-frame {index, id}`, index와 잘린 id를 함께 맞춘다, `canvasScript.ts` `pick-frame`)에서 화면 이동(`jump`)만 뺀 경로를 쓴다. `select-anchor`는 쓰지 않는다: layout에는 selector가 없고, `{frame: id}`만으로는 id가 겹치는 두 번째 프레임을 고르지 못하며 잘린 id는 아무 프레임과도 맞지 않는다.
    - reload 중 누르기: drawer의 `pendingFrame`처럼 새 layout이 오면 index와 id로 선택한다. 새 문서에 그 프레임이 없으면 선택을 바꾸지 않고 toast도 없다.
    - 포커스: Select에서는 `pick-frame` 응답이 command reply라 `focusOnClick`이 불리지 않으므로, 누르기에서 `section.area.focus({preventScroll, focusVisible: false})`를 직접 부른다. Picker 중에는 mousedown에서 `preventDefault`해 포커스를 composer에 둔다.
    - hover: 포인터가 앱 요소로 들어오면 `pointerOnApp`이 `hoverRect`를 비우므로, `treeHover`(`previewElement`)처럼 앱이 덮어쓰는 rect로 그 프레임의 hover 표시를 그린다. 이름표 위에 있는 동안에는 이름표 hover가 이기고, 늦게 온 iframe hover 응답은 무시한다. 이미 선택된 프레임이면 hover 표시를 그리지 않는다(캔버스 hover 규칙).
    - 누르기의 부수 효과: 캔버스 누르기처럼 텍스트 범위를 지우고 열린 preset 목록·Agent usage·update popover를 닫는다(iframe 밖이라 `press` 메시지가 없으므로 앱이 직접 처리한다).
    - 끌기: `canvasChipDrag.ts`의 메모리 끌기 상태와 `CANVAS_DRAG_TYPE` 표식, `registerChipComposer`·`useCanvasChipDrop`, 놓을 자리 표시와 이유 줄을 그대로 쓴다. 지금 `CanvasDrag`는 `{root, path, id}`(캔버스)만 담으므로, 끄는 대상을 캔버스 또는 프레임 anchor(`{frame: {id, title}}`, 캔버스 경로와 함께)로 넓힌다. 판정(`judge`)은 프레임이면 '같은 캔버스의 composer'만 받는다. `dataTransfer`에는 지금처럼 표식만 싣고 경로나 id는 싣지 않는다(ARCHITECTURE §7 'Renderer primitives'). 이름표는 앱 문서의 요소라 HTML5 drag를 직접 시작할 수 있다(`draggable`, 4 px 문턱 뒤).
  - 새 순수 모듈 `app/src/renderer/frameLabels.ts`: 아래 '순수 함수'.
  - `app/src/renderer/styles.css`: 이름표 모습. overlay는 `pointer-events: none`이고, size bubble의 버튼과 이름표만 누르기를 받는다(`styles.css`의 overlay 주석도 고친다).
- **내보낸 viewer**: 구조가 앱과 다르다.
  - 자리: `.vw-overlay`는 배율이 걸린 `.stage` 안에 있고 `overflow: clip`으로 잘린다(`shell.html`, `shell.css`). 이름표는 `.vw-selection`처럼 배율 없는 spacer 층에 화면 px로 두고, stage의 left/top과 scale로 자리를 정한다(`shell.js`). 팬은 native scroll이 맡는다.
  - 선택 명령: viewer에는 index로 프레임을 고르는 명령이 없다(프레임 drawer는 화면만 옮긴다). epoch로 거르고 index와 잘린 id를 확인하는 새 `inspect-*` 명령을 `inspectSelection.js`에 더한다.
  - hover: `inspect-marks`로 그리는 `hover-mark`(`inspectView.js`)를 덮어쓴다.
  - Hand: viewer에는 drag layer가 없고 `#board[data-pan]`과 iframe `pointer-events: none`으로 팬한다. 이름표에 `[data-pan]` 규칙과 도구 확인을 따로 둔다.
  - 끌기: viewer에는 composer가 없어 이름표 끌기는 아무것도 하지 않는다.
  - 고칠 파일: `shell.html`, `shell.css`, `shell.js`, `inspectSelection.js`, `inspectView.js`. `inspect.js`와 `inspectPanel.js`는 생성 파일이라 손으로 고치지 않는다. `renderer/frameLabels`를 `app/scripts/viewerInspect.mjs`의 `viewerApp.js` 항목에 더해 앱과 viewer가 같은 순수 함수를 쓰게 한다.
- **CLI(Go)**: export가 viewer 파일을 담는 것 말고는 바뀌지 않는다.
- **형식**: 바뀌지 않는다. `layout` 메시지는 이미 프레임마다 `id`, `title`, `parent`(감싸는 프레임의 index), 보드 좌표를 보낸다(`canvasMessage.ts` `CanvasFrameRect`). 최상위 프레임은 `parent`가 없는 프레임이다. 한계: `parseFrame`이 부모를 버리면 자식의 `parent`도 사라져 그 자식에 이름표가 생긴다.
- **스킬과 `doan check`**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `topFrames(frames)`: `parent`가 없는 프레임만, 문서 순서와 index를 지닌 채로. `cut` 프레임도 이름표가 있다(이름은 잘린 id).
- `labelText(frame, index)`: 프레임 drawer 버튼과 같은 "<index + 1>. <이름>"(`frameDrawer.ts`의 번호와 이름 규칙을 공유한다. 번호는 전체 프레임의 문서 순서). 이름은 `frameName`(제목, 공백뿐이면 id), 둘 다 없으면 "(no id)". 말줄임은 이름에만 걸고 번호는 남긴다.
- `labelPlacement(frame, view, metrics)`: 보드 좌표의 프레임 사각형과 view에서 이름표의 화면 위치(프레임 왼쪽 위 바깥, 위쪽 가장자리 바로 위)와 최대 폭(프레임의 화면 폭). 최소 폭보다 좁으면 숨김. view는 앱의 transform(x, y, scale)과 viewer의 stage 위치 + scale을 모두 받는 모양이다.
- `labelPress(label, mode)`: Select → `pick-frame {index, id}`(화면 이동 없음), Picker → 프레임 칩 anchor `{frame: {id, title}}`(layout의 id·title을 MAX_STRING으로 잘라 `endPick({kind: "picked", …})`, 프레임 pick 응답과 같은 칩), id가 빈 프레임은 Picker에서 칩을 만들지 않는다(main이 빈 id를 거절한다).
- `labelState(label, selection, hover)`: 선택 상태는 그 최상위 프레임 자체가 선택됐을 때만(`element === undefined`이고 `frameIndex`와 `frame.id`가 같을 때, `canvasMessage.ts`; viewer는 `frameOf`의 `kind: "frame"`과 index). hover 상태는 hover 대상이 그 프레임일 때(이름표 위든 프레임 안이든).
- 끌기 판정: 4 px 이하는 누르기, 넘으면 칩 끌기. 프레임 끌기의 받기 판정(같은 캔버스의 대화 패널 composer만, 그 밖의 이유는 canvas-chip과 같은 이유 문장).

## 렌더링과 상호작용 규칙

- 이름표는 overlay(보드 transform 밖)에 그리므로 줌과 관계없이 같은 크기다(ARCHITECTURE §3 'Zoom and pan').
- 누르기는 앱 문서가 직접 받는다. 캔버스 메시지를 근거로 삼지 않으므로 위조와 상관없다(§3 'Untrusted messages'). 이름 글자는 `textContent`로만 넣는다.
- 이름표는 `aria-hidden`이고 Tab 순서에 없다. tooltip은 없다.
- 겹침 순서: 툴바·알림·canvas status·toast > size bubble > 이름표 > 선택·hover 표시와 working-frame marker. 이름표끼리는 문서 순서가 뒤인 것이 위다. 다른 프레임 위에 걸친 이름표 자리를 누르면 이름표의 프레임이 선택된다.
- 수식키와 버튼(사용자 결정): ⌘·Shift는 보통 누르기와 같다. Option을 누른 채 이름표 위에 있으면 그 프레임이 측정 대상이고, Option-click은 선택하지 않는다. 오른쪽·Ctrl 누르기는 아무것도 하지 않는다. 더블 클릭은 두 번 누른 것이다. 누른 뒤 Esc 한 번에 선택이 없어진다(최상위 프레임이라).
- Hand 도구와 Space 끌기에서는 `.drag-layer`가 overlay 위에 있어 이름표가 누르기를 받지 않는다. Capture area 중에도 받지 않고(`pointer-events: none`, crosshair 커서 유지), 캡처 PNG에는 이름표가 없다(`[data-capture-snapshot] .overlay`가 opacity 0).
- 커서: Select에서 기본 화살표, Picker에서 Picker 커서.
- 다시 읽기 중에는 같은 캔버스면 마지막 geometry를 유지하고, 새 layout이 오면 바꾼다. "아직 재지 않음"(모든 프레임 0 × 0)과 "프레임 없음"을 구분한다. 다른 캔버스로 바꾸면 이름표를 지운다. 제목만 바뀌면 글자만 바꾸고 선택은 그대로다.
- 프레임 윗변이 화면 밖이면 이름표도 함께 나간다(상단 고정 없음). Hide UI(⌘\)에서도 보인다(보드 위 표시).
- 1,000개 프레임 한도 안에서 최상위 프레임만 그린다. 팬에서는 DOM을 다시 만들지 않고 transform만 바꾼다.

## postmortem에서 가져온 주의점

- 2026-11-11 "The working-frame marker blinked on every agent write to the canvas": 일시 상태에서 `hidden`/`display`로 껐다 켜지 말고 마지막 geometry를 유지한다.
- 2026-11-13, 2026-11-26 재발(`sendCommand`가 loading 중 명령을 보내지 않음): reload 중 누르기는 대기 후 선택으로 처리한다.
- 2026-11-19 "Hover and selection outlines of a clipped element reached across neighbouring frames": 앱이 그리는 사각형은 보이는 부분으로 자른다. 최상위 프레임은 보통 잘리지 않지만, 이름표 자리는 `layout`의 사각형을 그대로 쓴다.
- 2026-11-23 "The export viewer cut the selection line of a frame as wide as the canvas": viewer의 overlay 클립이 이름표를 자르지 않는지 캔버스 맨 위 프레임으로 확인한다(이름표는 배율 없는 층에 둔다).
- 2026-11-25 forced colors: fill로 그린 모양에는 forced-colors 규칙과 `forcedColors.test.ts` 줄, 에뮬레이션 확인이 필요하다.
- 2026-11-18 "An open tooltip still took the click meant for the control under it": Radix 포털 표시가 이름표 위에 열릴 때 wrapper까지 hit-test한다.

## 형식, 규약, 결정에 미치는 영향

- 형식 변경 없음. ARCHITECTURE §1 규약 변경 없음. `doan check` 규칙 추가 없음.
- 구조 결정: iframe 격리(§3 'Canvas rendering')는 그대로다. 이름표는 앱 문서에 있다.
- PRODUCT 변경(승격 때): §5 item 4 'Selection'에 이름표 누르기와 수식키 규칙을, item 2 'Canvas view'에 이름표를, item 2 'Toolbar'의 캡처에서 빠지는 앱 표시 목록에 이름표를, item 3 'Export and viewer'에 viewer 이름표를 적는다. 프로토타입 창과 프로토타입 파일에는 없다고 적는다.
- ARCHITECTURE 변경(승격 때): §3 'Zoom and pan'의 `pointer-events: none` overlay 문장(누르기를 받는 표시: size bubble 버튼과 이름표), §3 'Canvas view'의 이름표 층과 `pick-frame` 경로, §3 'Exported canvas and viewer'의 viewer 이름표와 새 선택 명령, 프로토타입 창·파일에 이름표가 없다는 것.

## PoC

- 필요 없다. 이름과 geometry는 `layout`에 있고, 선택은 `pick-frame`이 있다.

## 읽은 design preset

- `shape`(기능 brief 정리). 이름표 문구는 프레임 이름 그대로라 새 UI 문구가 없어 `clarify`는 읽지 않았다.

## 드래프트 요청

`/design-draft canvas-frame-label`로 새 드래프트 `.doan/canvases/canvas-frame-label.html`(캔버스 id `canvas-frame-label`, 프레임 id `board`, `drag`, `states`, `overlap`, `viewer`)을 그린다. 참고: 사용자가 준 Figma 스크린샷(프레임 왼쪽 위 바깥의 파란 이름표, 선택된 프레임).

- **프레임**:
  - `board`: 최상위 프레임 여러 개와 중첩 프레임이 있는 보드(이름표는 최상위에만), 줌 5 %·25 %·100 %·200 %
  - `drag`: 이름표를 끌어 대화 패널 composer에 놓는 모습(끄는 칩, 놓을 자리 표시, 받지 않을 때의 이유 줄)
  - `states`: 기본, hover(이름표 위와 프레임 안 양쪽), 선택(선택 표시와 size bubble과 함께), 긴 이름의 말줄임표, 좁은 프레임과 숨김, "(no id)"
  - `overlap`: 위아래로 붙은 프레임에서 이름표가 위 프레임에 걸치는 모습, 위 프레임의 size bubble과 아래 이름표, working-frame marker와 함께 있는 모습, 캔버스 맨 위 프레임과 agent notice
  - `viewer`: 내보낸 viewer에서의 모습
- **정할 것**: 글자 스타일과 색(기본·hover·선택), 이름표와 프레임 사이 간격(working-frame marker의 4 px 선과 glow, jump highlight의 3 px 선과 ring을 비킨다), 최소 폭과 숨김 기준, 다크 모드와 forced colors.

## 드래프트에서 정한 것 (사용자)

- 선택된 이름표: `--affordance-accent` 채움에 `--text-on-accent` 글자(size bubble과 같은 짝). Figma 참고처럼 채움 없는 accent 글자는 일부 buddy 색에서 12 px 이하 글자의 대비 4.5:1에 못 미쳐 고르지 않았다.
- 숨김 기준: 프레임 화면 폭이 56 px보다 좁으면 이름표를 숨긴다(40·48 px에서는 두세 글자만 남는다).
- 겹침: Option 측정 표시(`.measure`)는 이름표 위다. 그 아래로 size bubble > 이름표 > 선택·hover 표시.
- 글자: 11 px, 새 토큰(이름과 값은 드래프트와 `tokens.css`, DESIGN.md 줄). Figma의 공식 값은 찾지 못했고 Figma UI가 약 11 px라는 사용자 관찰만 있다(forum.figma.com).
- 기본: 보드 위에서는 `--text-subtle` 글자가 `--surface-inset` 채움 위에 있어 맨 글자처럼 보이고, 캔버스 내용 위에서는 회색 pill로 보인다. hover: 글자는 `--text-accent`(사용자 결정), 이름표 칩 안쪽에 accent 색 1px inset box-shadow(사용자 결정), 프레임에 점선 hover 표시. 프레임 위로 6 px(`--space-1h`) 띄운다. 높이 16 px, 좌우 padding 4 px, `--radius-inline`. 누름·hover 영역은 아래 간격 6 px까지 넓힌다(위로는 넓히지 않는다).
- forced colors: 기본과 hover는 시스템 색(Canvas, CanvasText), 선택만 `forced-color-adjust: none`으로 `Highlight`/`HighlightText`.
- 구현 메모: 겹침 순서를 위해 `.dims`에 `z-index: 1`이 필요하고 `.measure`는 그 위로 유지한다.
- 번호: 이름표는 프레임 drawer와 같은 "<번호>. <이름>"이다. 번호는 중첩 프레임까지 센 문서 순서라 최상위 이름표끼리 건너뛸 수 있다.
- 마커 통일(사용자 결정): jump highlight를 working-frame 마커의 모습(4 px 흐르는 그라데이션 선, 흰 링 없음, 숨 쉬는 색 glow, `styles.css` `.mark.jump-highlight.working`)으로 바꾼다. 보이는 시간과 사라짐(1.2 s, 0.8 s 뒤 0.4 s에 걸쳐 사라짐), reduced motion·reduced transparency·forced colours 규칙은 지금 jump highlight 것을 유지한다. 요소와 점(12 px 원)의 jump highlight도 같은 선 모양으로 맞춘다(lead 판단, 드래프트에서 확인). `docs/design/canvas.md`의 Jump highlight 줄과 'Working-frame marker' 줄을 승격 때 고친다.
- 마커 상태(사용자 결정): 최상위 프레임에 마커가 붙은 동안 이름표 채움을 마커 그라데이션으로 칠한다. 선택 상태와 구분한다. 순수 함수 `labelState`가 마커 여부를 입력으로 받는다.
