# 프로토타입 재생에서 프레임만 보이기 — design

## 영향받는 컴포넌트

- **앱 (TS)**: `app/src/main/prototypeScript.ts`의 `isolate`. 프로토타입 창이 iframe 문서에 주입한다.
- **CLI (Go 저장소 안의 JS)**: `cli/internal/export/viewer/isolate.js`의 `isolate`. 내보낸 캔버스 파일의 플레이어(`player.js`)와 내보낸 프로토타입 파일이 함께 쓴다. Go 코드는 바뀌지 않는다.
- **테스트**: `app/src/main/prototypeScript.test.ts`, `app/src/main/exportViewer.test.ts`.
- 스킬, 형식(`.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`)은 바뀌지 않는다.

## 동작

`isolate(el)`이 지금 하는 일(조상에 `data-doan-proto-path`, 형제에 `data-doan-proto-hidden`, 프레임에 `data-doan-proto-frame`, `!important` 시트 채택)은 그대로 두고 두 가지를 더한다.

1. **판단**: 시트를 채택하기 전에 `getComputedStyle(el)`로 프레임의 `backgroundColor`와 `backgroundImage`를 한 번 읽는다. `backgroundImage`가 `none`이 아니거나 배경색의 알파가 0보다 크면, `document.documentElement`에 `data-doan-proto-clear`를 붙인다.
2. **시트에 추가할 규칙** (두 스크립트에 같은 글자로):

```css
[data-doan-proto-path]::before, [data-doan-proto-path]::after { display: none !important; }
:root[data-doan-proto-clear], :root[data-doan-proto-clear] [data-doan-proto-path] {
  background: none !important; box-shadow: none !important; outline: none !important; }
```

- `html`도 `data-doan-proto-path`를 받지만(`body`의 부모), 두 번째 규칙의 자손 선택자에는 걸리지 않으므로 `:root[data-doan-proto-clear]`를 따로 둔다.
- `border`는 기존 `[data-doan-proto-path]` 규칙이 이미 `0`으로 만든다. `border` 단축 속성이 `border-image`도 초기화한다.
- `html`과 `body`의 배경이 모두 `none`이면 캔버스(뷰포트) 배경으로 번질 색이 없어서 iframe이 투명해지고, 호스트가 iframe 뒤에 칠한 색이 보인다.
- 의사 요소 규칙은 `data-doan-proto-clear`와 상관없이 항상 적용한다(사용자 결정). 프레임 자신(`data-doan-proto-frame`)은 `data-doan-proto-path`를 받지 않으므로 프레임의 의사 요소는 남는다.

### 알파 판단

계산된 `background-color` 문자열은 브라우저와 색 표기에 따라 `rgba(0, 0, 0, 0)`, `rgb(…)`, `oklch(… / 0)`, `color(srgb … / 0.5)`, `transparent` 등으로 나온다. 판단 함수는 다음만 본다.

- `transparent` → 투명
- `/`가 있으면 그 뒤 값, `rgba(`·`hsla(`이면 네 번째 인자를 알파로 읽는다. 퍼센트도 받는다. 0이면 투명.
- 그 밖(알파 없는 표기) → 불투명

이 함수는 두 스크립트 안에 인라인으로 둔다. `prototypeScript`는 `toString()`으로 직렬화되어 import할 수 없고, `isolate.js`는 독립 스크립트이기 때문이다. 대신 `exportViewer.test.ts`가 시트·KEEP 목록·`LATE_FRAME_MS`처럼 함수 본문을 글자로 비교한다.

## 순수 함수로 떼어 낼 부분 (/tdd 대상)

- **배경 판단 (`ownBackground(color, image)`)**: 표 기반 테스트. 입력은 위 계산값 표기들, 출력은 boolean. 스크립트 밖으로 import할 수 없으므로, 실제 Electron DOM 하네스(`app/runtime/electronDom.ts`, `prototypeScript.test.ts`의 "in a real DOM")에서 프레임 스타일을 바꿔 가며 `html`의 `data-doan-proto-clear` 유무로 확인한다. 같은 표를 `exportViewer.test.ts`의 srcdoc 실제 DOM 테스트로 `isolate.js`에도 돌린다.
- **격리 결과의 계산값**: 실제 DOM에서 `html`·`body`·중간 조상의 `getComputedStyle` 값(`background-image`, `background-color`, `box-shadow`, `outline-style`)과 조상 `::before`의 `display`를 확인한다. fake document 테스트("resolving and isolating the frame")는 시트 텍스트와 속성 부여만 확인한다.
- **두 복사본의 일치**: `isolationSheet()` 비교는 이미 있다. 판단 함수 본문 비교를 더한다.

## 형식 변경

없다. JSON Schema, 형식 버전 `v`, 픽스처 변경이 없다.

## 규약 영향

- ARCHITECTURE §1 규약은 바뀌지 않는다. 규약 14('`data-doan-prototype`')는 마크 문법과 재생 크기만 정한다.
- `doan check` 규칙을 더하지 않는다.

## 결정 영향

- ARCHITECTURE §3 'Prototype window' 'Rendering in place'의 "nothing measured in the frame" 규칙은 iframe 상자의 위치·크기를 프레임에서 측정한 값으로 정하지 말라는 것이다(POSTMORTEM 2026-11-01). 이번 측정은 문서 안에서 칠만 바꾸고 상자나 main으로 돌아가지 않으므로 이 규칙에 걸리지 않는다. 승격할 때 이 구분을 문장으로 남긴다.
- 같은 절의 "The script keeps the whole document"는 유지된다. 조상은 문서에 남고, 칠과 의사 요소만 꺼진다. 상속되는 폰트·색·CSS 변수와 조상 선택자는 그대로 동작한다.
- 샌드박스 iframe, 서빙 범위, 앱 소켓은 건드리지 않는다.
- PRODUCT §5 item 2 'Prototype window' 'Content'("everything else in the canvas is hidden")에 조상의 칠과 의사 요소 규칙을 더한다(승격 작업).

## PoC 의존

- **`color-scheme` 불일치**: 호스트 두 곳(`app/src/renderer/styles.css`, `cli/internal/export/viewer/prototype.css`)은 `color-scheme: light`다. CSS Color Adjust 명세는 iframe 문서 루트의 color-scheme이 소유 요소와 다르면 브라우저가 불투명한 캔버스 배경을 칠하도록 한다. 캔버스가 `:root { color-scheme: dark }`면 칠을 지워도 모서리가 어둡게 남을 수 있다. Electron 45(Chromium)에서 실제 DOM 테스트로 확인하고(T4), 그렇다면 비목표대로 한계로 기록한다. 내보낸 파일의 WebKit 동작은 이번에 확인하지 않는다.

## postmortem에서 가져온 함정

- **2026-11-18 — The canvas export viewer kept the srcdoc navigation bugs the prototype page had already fixed**: 내보낸 문서에서 먼저 실행되는 스크립트의 동작은 모든 복사본에 넣고, 복사본 사이에 텍스트 고정과 srcdoc 실제 DOM 테스트를 둔다. → 시트와 판단 함수를 두 스크립트에 같은 글자로 넣고, `exportViewer.test.ts`에서 글자 비교와 srcdoc 실제 DOM 테스트를 둔다. `measure.js`(내보낸 캔버스 뷰어의 보드)는 보드라서 바꾸지 않는다(완료 조건 6).
- **2026-11-01 — A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever** (ARCHITECTURE §3 'Rendering in place'가 인용): 프레임 측정값이 상자 크기로 돌아가면 되먹임 루프가 생긴다. → 이번 측정은 한 번만 하고 칠에만 쓴다.

## 디자인 프리셋

이번 기능은 새 화면이나 UI 컴포넌트를 만들지 않고 캔버스 문서의 칠만 끈다. 그래서 디자인 프리셋은 읽지 않았다.
