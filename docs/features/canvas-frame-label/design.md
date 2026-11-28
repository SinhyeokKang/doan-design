# 프레임 이름표 — design

## 영향 범위

- **앱(renderer)**:
  - `app/src/renderer/CanvasController.ts`: overlay에 이름표 층을 둔다. 팬과 줌에서는 선택 표시처럼 transform을 동기로 고치고 React는 다시 그리지 않는다. 이름표 누르기는 기존 `select-anchor` 명령으로 그 프레임을 선택한다(selection seq를 올리는 지금 경로).
  - 새 순수 모듈(예: `app/src/renderer/frameLabels.ts`): 아래 '순수 함수'.
  - `app/src/renderer/styles.css`: 이름표 모습. overlay는 지금 `pointer-events: none`이므로 이름표만 누르기를 받는다.
- **내보낸 viewer**: `cli/internal/export/viewer/`(`shell.css`, `inspect*.js`, `viewerApp.js`). 앱 TS에서 만들어지는 inspector 스크립트는 `node app/scripts/viewerInspect.mjs`로 다시 만든다.
- **CLI(Go)**: export가 viewer 파일을 담는 것 말고는 바뀌지 않는다.
- **형식**: 바뀌지 않는다. `layout` 메시지는 이미 프레임마다 `id`, `title`, `parent`(감싸는 프레임의 index), 보드 좌표를 보낸다(`canvasMessage.ts` `CanvasFrameRect`). 최상위 프레임은 `parent`가 없는 프레임이다.
- **스킬과 `doan check`**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `topFrames(frames)`: `parent`가 없는 프레임만, 문서 순서대로. `cut` 프레임도 이름표는 있다(이름은 잘린 id).
- `labelPlacement(frame, view, labelHeight)`: 보드 좌표의 프레임 사각형과 view(x, y, scale)에서 이름표의 화면 위치(프레임 왼쪽 위 바깥, 위쪽 가장자리 바로 위)와 최대 폭(프레임의 화면 폭). 폭이 최소값보다 좁으면 숨김.
- `labelHit(target)` 또는 누르기 → 선택 명령 변환: 이름표의 프레임 id와 anchor(지금 프레임 anchor 규칙: frame id와 selector)를 `select-anchor` 명령으로.
- Picker 중 누르기 → 프레임 칩 anchor: size bubble의 Add to message처럼 renderer가 `targetAnchor`로 만든다(ARCHITECTURE §3 'Picking and locate'). pick 응답과 같은 칩이어야 한다.
- 선택 상태: 지금 선택이 그 최상위 프레임 자체일 때만 선택 상태다(그 안의 요소가 선택됐을 때는 아니다 — 드래프트에서 확인).

## 렌더링 규칙

- 이름표는 overlay(보드 transform 밖)에 그리므로 줌과 관계없이 같은 크기다(ARCHITECTURE §3 'Zoom and pan').
- 이름표의 사각형은 iframe 밖 앱 문서에 있으므로, 누르기는 앱이 직접 받는다. 캔버스 스크립트가 보낸 메시지를 근거로 삼지 않으므로 위조된 메시지와 상관없다(ARCHITECTURE §3 'Untrusted messages'). 이름 글자는 `textContent`로만 넣는다.
- 이름표는 `aria-hidden`이고 Tab 순서에 없다(사용자 결정). 누르기 뒤 포커스는 캔버스 클릭처럼 `section.area`로 간다(ARCHITECTURE §3 'Canvas click focus').
- Capture area 중에는 이름표가 누르기를 받지 않는다.
- Hand 도구와 Space 끌기에서는 `.drag-layer`가 overlay 위에 있으므로 이름표는 누르기를 받지 않는다(지금 구조 그대로).
- 다시 읽기 중에는 마지막 geometry를 유지하고, 새 layout이 오면 바꾼다. "아직 재지 않음"(모든 프레임 0 × 0)과 "프레임 없음"을 구분한다.
- 1,000개 프레임 한도 안에서 최상위 프레임만 그린다. 화면 밖 이름표는 그리지 않아도 된다(성능, `/implement`에서 판단).

## postmortem에서 가져온 주의점

- 2026-11-11 "The working-frame marker blinked on every agent write to the canvas": overlay를 일시 상태에서 `hidden`/`display`로 껐다 켜지 말고 마지막 geometry를 유지한다.
- 2026-11-19 "Hover and selection outlines of a clipped element reached across neighbouring frames": 앱이 그리는 사각형은 보이는 부분으로 자른다. 최상위 프레임은 보통 잘리지 않지만, 이름표 자리는 `layout`의 사각형을 그대로 쓴다.
- 2026-11-23 "The export viewer cut the selection line of a frame as wide as the canvas": viewer의 overlay 클립 상자가 프레임 바깥에 그리는 표시(이름표)를 자르지 않는지, 캔버스 맨 위 프레임의 이름표로 확인한다.
- Radix 포털 pointer 규칙(2026-11, tooltip wrapper): 이름표에 tooltip을 달면 wrapper까지 hit-test한다.

## 형식, 규약, 결정에 미치는 영향

- 형식 변경 없음. ARCHITECTURE §1 규약 변경 없음. `doan check` 규칙 추가 없음.
- 구조 결정: iframe 격리(§3 'Canvas rendering')는 그대로다. 이름표는 앱 문서에 있다.
- PRODUCT 변경(승격 때): §5 item 4 'Selection'의 첫 줄("selects by ordinary clicks … a frame first")에 이름표 누르기를 더하고, item 2 'Canvas view'와 item 3 'Export and viewer'에 이름표를 적는다. 프로토타입 창과 프로토타입 파일에는 없다고 적는다.

## PoC

- 필요 없다. 이름과 geometry는 이미 `layout`에 있고, 선택 명령도 있다.

## 읽은 design preset

- `shape`(기능 brief 정리). 이름표 문구는 프레임 이름 그대로라 새 UI 문구가 없어 `clarify`는 읽지 않았다.

## 드래프트 요청

`/design-draft canvas-frame-label`로 새 드래프트를 그린다. 참고: 사용자가 준 Figma 스크린샷(프레임 왼쪽 위 바깥의 파란 이름표, 선택된 프레임).

- **프레임**:
  - `board`: 최상위 프레임 여러 개와 중첩 프레임이 있는 보드(이름표는 최상위에만), 줌 25 %·100 %·200 %에서 같은 크기
  - `states`: 기본, hover(프레임의 hover 표시와 함께), 선택(선택 표시와 size bubble과 함께), 긴 이름의 말줄임표, 좁은 프레임
  - `overlap`: 위아래로 붙은 프레임에서 이름표가 위 프레임에 걸치는 모습, working-frame marker와 함께 있는 모습, 캔버스 맨 위 프레임
  - `viewer`: 내보낸 viewer에서의 모습
- **정할 것**: 글자 스타일과 색(기본·hover·선택), 이름표와 프레임 사이 간격, 최소 폭과 숨김 기준, 다크 모드와 forced colors.
