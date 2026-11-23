# 프로토타입 재생에서 프레임 바깥에 캔버스 배경이 비치지 않게 — design

## 영향받는 컴포넌트

- **앱 (TS)**: `app/src/main/prototypeScript.ts`의 `isolate`. 프로토타입 창이 iframe 문서에 주입한다.
- **CLI 저장소 안의 JS**:
  - `cli/internal/export/viewer/isolate.js`: 내보낸 캔버스 파일의 플레이어(`player.js`)와 내보낸 프로토타입 파일이 함께 쓴다.
  - `cli/internal/export/viewer/viewerApp.js`: `node app/scripts/viewerInspect.mjs`가 `prototypeScript.ts`에서 생성하는 파일이다. 플레이어가 `isolate.js` 뒤에 실행하는 run 스크립트(`prototypeScriptSource`)가 여기에 들어 있으므로 함께 다시 생성한다.
  - Go 코드는 바뀌지 않는다.
- **테스트**: `app/src/main/prototypeScript.test.ts`, `app/src/main/exportViewer.test.ts`.
- 스킬, 형식(`.doan/config.json`, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`)은 바뀌지 않는다.

## 동작

`isolate(el)`이 지금 하는 일(조상에 `data-doan-proto-path`, 형제에 `data-doan-proto-hidden`, 프레임에 `data-doan-proto-frame`, `!important` 시트 채택)은 그대로 두고 다음을 더한다.

1. **판단 `judge(el)`**:
   - `el`이 `document.documentElement`나 `document.body`이면 아무것도 하지 않는다.
   - 그 밖에는 전역 `getComputedStyle(el)`로 `backgroundColor`를 읽는다. 배경 이미지는 보지 않는다(spec 완료 조건 1·2). `window.getComputedStyle`이 아니라 전역 함수를 쓰는 이유는 fake 하네스(`runIsolate`)의 `window`가 전역과 다른 객체이기 때문이다.
   - `ownBackground(color)`가 참이면 `document.documentElement`에 `data-doan-proto-clear`를 붙인다. 속성은 붙이기만 하고 떼지 않는다.
2. **판단 시점**:
   - 격리할 때 시트를 채택한 직후에 한 번 판단한다.
   - `load` 핸들러가 모두 끝난 뒤(각 스크립트의 기존 `afterLoad` 방식, `load` 리스너 안의 0 ms 타이머) 한 번 더 판단한다. 격리가 이미 그 시점 뒤에 일어났으면(`readyState === "complete"`, 늦게 나타난 프레임) 두 번째 판단은 생략한다.
   - DOMContentLoaded는 뒤에 스크립트가 없는 `<link rel="stylesheet">`를 기다리지 않는다. 그래서 첫 판단에서는 프레임이 투명으로 읽힐 수 있다. head의 link는 렌더링을 막으므로, 두 번째 판단 전에 모서리가 보이는 일은 드물다.
3. **시트에 추가할 규칙** (두 스크립트에 같은 글자로):

```css
[data-doan-proto-clear][data-doan-proto-path], [data-doan-proto-clear] [data-doan-proto-path] {
  background: none !important; box-shadow: none !important; outline: none !important; }
```

- `html`은 `body`의 부모라서 `data-doan-proto-path`를 받는다. 첫 번째 선택자는 `html` 자신에, 두 번째 선택자는 그 아래 조상에 걸린다. 프레임은 `data-doan-proto-path`를 받지 않으므로 두 선택자 모두 프레임에는 걸리지 않는다.
- `border`는 기존 `[data-doan-proto-path]` 규칙이 이미 `0`으로 만든다. `border` 단축 속성은 `border-image`도 초기화한다.
- `html`과 `body`의 배경이 모두 `none`이면 뷰포트 배경으로 번질 색이 없어서 iframe이 투명해지고, 호스트가 iframe 뒤에 칠한 색이 보인다.
- 조상의 `::before`·`::after`는 건드리지 않는다(spec 비목표).

### 플레이어의 두 번 실행

내보낸 캔버스 파일의 플레이어에서는 `isolate.js`와 run 스크립트(`viewerApp.js`)가 같은 문서에서 모두 `isolate`를 실행한다(`player.js:468`). 속성은 붙이기만 하므로 먼저 지우기로 판단한 결과가 유지된다. 나중 판단은 조상 칠이 이미 지워진 뒤에 읽는다. 그래서 `background: inherit` 프레임은 투명으로 읽히지만, 이미 붙은 속성을 떼지 않으므로 결과는 같다.

### `ownBackground(color)`

Chromium의 계산된 `background-color`는 `rgb(r, g, b)`, `rgba(r, g, b, a)`, 또는 `oklch|oklab|lab|lch(… / a)`, `color(space … / a)` 형태다. `/ a`는 알파가 1보다 작을 때만 붙는다. 판단 규칙은 다음과 같다.

- 색의 알파가 1일 때만 참(spec 완료 조건 1·2).
  - `transparent`면 알파는 0이다.
  - `/`가 있으면 그 뒤 값이 알파다. `none`은 0, 퍼센트는 100으로 나눈다.
  - `rgba(`·`hsla(`이면 네 번째 인자가 알파다.
  - 그 밖(알파 없는 표기)은 1이다.
  - 파싱 결과가 NaN이면 0으로 본다.

두 스크립트에 같은 본문으로 둔다.

- `isolate.js`: 최상위 `function ownBackground(color) { … }`
- `prototypeScript.ts`: 함수 안의 `function ownBackground(color: string): boolean { … }`. `prototypeScript`는 `toString()`으로 직렬화되므로 import할 수 없다.
- 본문에는 TS 문법(`as`, `!`, 타입 주석)을 쓰지 않는다. 시그니처가 TS와 JS에서 다르므로 테스트는 `extractFunction`으로 함수를 꺼낸 뒤 첫 `{` 이후의 본문만 `normalize`해서 비교한다.

## 순수 함수로 떼어 낼 부분 (/tdd 대상)

- **`ownBackground` 표 테스트**: `loadFunctions(isolateJs, ["ownBackground"])`로 DOM 없이 돌린다. 행은 다음과 같다.
  - `rgba(0, 0, 0, 0)`, `rgb(255, 255, 255)`, `rgba(0, 0, 0, 0.5)`, `rgba(0, 0, 0, 1)`
  - `oklch(0.5 0.1 200 / 0)`, `oklch(0.5 0.1 200)`, `color(srgb 1 1 1 / 0.5)`, `lab(50 0 0 / none)`
  - `rgb(0 0 0 / 50%)`, `transparent`, `hsla(0, 0%, 0%, 0)`
- **두 복사본의 일치**: 기존 `isolationSheet()` 비교에 판단 함수 본문 비교를 더한다. 한쪽을 바꾸면 비교가 실패하는 drift 케이스도 기존 테스트처럼 넣는다.
- **실제 DOM**: `prototypeScript.test.ts` "in a real DOM"과 `exportViewer.test.ts`의 srcdoc 실제 DOM 테스트로 Chromium이 실제로 내는 계산값과 격리 결과를 확인한다(tasks T1).

## 형식 변경

없다. JSON Schema, 형식 버전 `v`, 픽스처 변경이 없다.

## 규약 영향

- ARCHITECTURE §1 규약은 바뀌지 않는다. 규약 14('`data-doan-prototype`')는 마크 문법과 재생 크기만 정한다.
- `doan check` 규칙을 더하지 않는다.

## 결정 영향

- ARCHITECTURE §3 'Prototype window' 'Rendering in place'의 "never from anything measured in the frame" 규칙은 iframe 상자의 위치·크기를 프레임에서 측정한 값으로 정하지 말라는 것이다. 이번 측정은 문서 안에서 칠만 바꾸고 상자나 main으로 돌아가지 않으므로 이 규칙에 걸리지 않는다. 승격할 때 이 구분을 문장으로 남긴다.
- 같은 절의 "The script keeps the whole document"는 유지된다. 조상은 문서에 남고 칠만 꺼진다. 상속되는 폰트·색·CSS 변수와 조상 선택자는 그대로 동작한다.
- 샌드박스 iframe, 서빙 범위, 앱 소켓은 건드리지 않는다. ARCHITECTURE의 'No four-equal-radius clip over the iframe'도 건드리지 않는다. 새로 클립하는 것이 없기 때문이다.
- PRODUCT §5 item 2 'Prototype window' 'Content'에 조상 칠 규칙을 더하고, item 3 'Prototype file'과 'Browser player'가 그 규칙을 따른다고 적는다(승격 작업).

## PoC 의존

- **`color-scheme` 불일치**: 호스트 두 곳(`app/src/renderer/styles.css`, `cli/internal/export/viewer/prototype.css`)은 `color-scheme: light`다. CSS Color Adjust 명세는 iframe 문서 루트의 color-scheme이 소유 요소와 다르면 브라우저가 불투명한 캔버스 배경을 칠하도록 한다. 다음 경우에는 칠을 지워도 모서리가 어둡게 남을 수 있다.
  - `:root { color-scheme: dark }` 캔버스
  - `color-scheme: light dark` 캔버스를 다크 모드 브라우저에서 연 경우(내보낸 파일)

  Electron DOM 하네스(`app/runtime/electronDom.ts`)는 숨은 `about:blank` 창이라 픽셀을 읽을 수 없다. 그래서 실제 앱 프로브에서 모서리 픽셀로 확인한다(tasks T3). 그렇게 남으면 비목표대로 한계로 기록한다.
- 내보낸 파일의 WebKit 동작은 이번에 확인하지 않는다(BACKLOG).

## postmortem에서 가져온 함정

- **2026-11-18 — The canvas export viewer kept the srcdoc navigation bugs the prototype page had already fixed**: 내보낸 문서에서 먼저 실행되는 스크립트의 동작은 모든 복사본에 넣고, 복사본 사이에 텍스트 고정과 srcdoc 실제 DOM 테스트를 둔다.
  - 이번 적용: 시트와 판단 함수를 `isolate.js`, `prototypeScript.ts`, 생성된 `viewerApp.js`에 같게 넣는다. `exportViewer.test.ts`에서 글자 비교와 srcdoc 실제 DOM 테스트를 둔다.
  - `measure.js`(내보낸 캔버스 뷰어의 보드)와 `canvasScript.ts`는 보드라서 바꾸지 않는다(완료 조건 7).
- **2026-11-01 — A canvas of absolutely positioned frames resized its iframe between 0 and 405 px forever**: 캔버스가 측정한 값을 렌더러가 다시 크기로 쓰면 되먹임 루프가 생긴다. 이번 측정은 칠에만 쓰고 크기로 돌아가지 않으며, 속성은 붙이기만 하므로 루프가 생기지 않는다.

## 디자인 프리셋

이번 기능은 새 화면이나 UI 컴포넌트를 만들지 않고 캔버스 문서의 칠만 끈다. 그래서 디자인 프리셋은 읽지 않았다.
