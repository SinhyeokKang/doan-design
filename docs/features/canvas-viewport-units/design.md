# canvas-viewport-units — design

## 방식

두 갈래다. 앱은 캔버스의 스타일 값을 바꾸지 않는다(spec 결정 1).

1. **`doan check` 경고 `viewport_height_unit`**: 기존 CSS 스캐너(`cli/internal/canvas/css.go` `ScanCSS`)가 선언 값의 dimension 토큰 중 viewport 높이 단위를 모은다. `check`는 `hardcoded_color`와 같은 경로로 보고한다.
2. **폰트 적용 뒤 높이**: 주입 스크립트(`app/src/main/canvasScript.ts`)가 `document.fonts`의 `loadingdone`을 세고, `nextHeight`가 그 수가 바뀐 측정에서 고정을 한 번 푼다.

## `viewport_height_unit`

- **스캔**: `Scan`에 `ViewportHeights []string`을 더한다. `Colors`를 모으는 같은 자리(선언 값)에서 dimension 토큰의 단위가 `vh`·`dvh`·`svh`·`lvh`·`vb`·`dvb`·`svb`·`lvb`이면 원문 토큰(`100dvh`)을 넣는다.
  - 단위는 ASCII 대소문자를 가리지 않는다. 숫자 형식은 CSS dimension 토큰을 따른다(`.5vh`, `-10vh`, `1e2vh`).
  - 주석·문자열·`url()`·at-rule prelude는 스캐너가 이미 건너뛴다. 식별자(`--foo-vh`, `.vh-wrap`)는 dimension 토큰이 아니다.
  - 사용자 정의 속성 값(`--h: 100vh`)도 선언 값이므로 경고한다. 그 변수를 높이에 쓰면 같은 순환이 생긴다.
- **보고**: `check.go`의 `scan` 안 `output`에 `viewport_height_unit`을 더한다. severity는 warning이고 `Value`에 토큰을 싣는다. 공유 스타일시트에서는 `hardcoded_color`처럼 파일·코드·값마다 한 번만 보고하고 `Canvas`를 비운다. `tokenCss` 파일 예외는 두지 않는다. 그 파일에 viewport 높이 단위가 있으면 그 파일을 링크한 모든 캔버스의 높이가 순환한다.
- **메시지**: `Viewport height unit "<value>" resolves against the whole board in the app, so the canvas height chases itself. Use a pixel value instead.`
- **가이드**: `cli/internal/cli/skill.md`의 캔버스 규약에 한 줄을 더한다. "Do not use viewport height units (vh, dvh, svh, lvh, vb) in a canvas: in the app they resolve against the whole board. Write pixel values, also when copying app CSS that uses them; `doan check` warns with `viewport_height_unit`."

## 폰트 적용 뒤 높이

- `HeightState`에 `fonts: number`를 더하고 `nextHeight(prev, measured, inner, fonts)`로 바꾼다. `prev.fonts !== fonts`이면 고정 여부와 상관없이 측정값을 받아들이고(`frozen: false`) `fonts`를 갱신한다. 같으면 지금 규칙 그대로다.
- 주입 스크립트는 `document.fonts.addEventListener("loadingdone", …)`에서 카운터를 올리고 `schedule()`을 직접 부른다. 측정이 이벤트보다 먼저 와서 이미 고정됐더라도, 이벤트 뒤의 측정이 고정을 푼다.
- `document.fonts.ready`는 신호로 쓰지 않는다. 주입 시점에 이미 resolve되어 있으면 첫 측정 전에 신호가 켜져, 따라 커지는 문서의 첫 고정을 놓친다. 기존 `ready` 훅(`schedule`, `tryPending`)은 그대로 둔다.
- **진동 범위**: viewport를 따라 커지는 문서는 `loadingdone` 한 번마다 한 번 더 커지고 다시 고정된다. 이벤트 수만큼만 커지므로 끝이 있다. `viewport_height_unit` 경고가 이런 문서를 드러낸다.
- **보이는 상태**: 첫 그림은 대체 폰트 높이다. 폰트가 적용되면 보드가 아래로 한 번 자란다. 화면 위치와 배율은 바뀌지 않는다(Fit은 너비 기준, `viewport.ts`). 폰트가 실패하면(`loadingerror`) 대체 폰트 높이 그대로다.
- 첫 측정을 폰트 로드 뒤로 미루는 방법(캔버스의 폰트 게이트를 앱이 대신 하기)은 버린다. 폰트가 느리거나 실패하면 보드가 늦게 뜨거나 타임아웃이 필요하다.

## 대안과 버린 이유

- 서버가 HTML·CSS 응답의 viewport 높이 단위를 `calc(N * var(--doan-vh))`로 바꿔 쓰고 메타 `doan:viewport-height`로 기준을 정한다: 사용자 스타일 값을 바꾼다. 인스펙터가 바꾼 값을 토큰 `--doan-vh`로 분류하고(`inspect.ts` `sourceOfValue`), `doan active`의 html(`outerHTML`)에 디스크에 없는 값이 실린다. 서버의 스트리밍·`Content-Length`·해시 불변식(ARCHITECTURE §3 'Local server implementation', 'Document origin')도 바뀐다. `/feature-review`에서 버렸다.
- iframe 안 스크립트로 `document.styleSheets`를 고친다: iframe은 opaque origin이라 링크된 스타일시트의 `cssRules`를 읽을 수 없다(ARCHITECTURE §3 CORS). 값도 바꾼다.
- CDP `Emulation.setDeviceMetricsOverride`로 iframe viewport를 속인다: 하위 프레임 단위로 적용할 수 있는지 확인되지 않았고, 레이아웃 크기와 보이는 크기가 갈라져 측정 루프가 더 복잡해진다.
- iframe 높이를 고정하고 문서를 안에서 스크롤해 팬한다: 줌·팬·선택 좌표 전체를 다시 짜야 한다(ARCHITECTURE §3 'Zoom and pan are a transform outside the iframe').

## 영향 받는 부분

- **CLI(Go)**: `cli/internal/canvas/css.go`(스캔), `cli/internal/check/check.go`(규칙), `cli/internal/cli/skill.md`(가이드).
- **app main**: `canvasScript.ts`의 `nextHeight`·`HeightState`, 주입 스크립트의 `loadingdone` 처리. `nextHeight` 위 주석(`min-height: 100vh` 설명)에 폰트 예외를 더한다.
- **서버·썸네일·인스펙터**: 바뀌지 않는다.
- **캔버스**: `buzz-project-settings`의 dvh 값을 px로 바꾸고 두 우회를 지운다(tasks Z1). 이 캔버스는 buzz-restyle C13의 초안이다. 같은 모양을 유지하는 최소 수정만 한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- Go: `ScanCSS`의 `ViewportHeights` 수집, `check`의 `viewport_height_unit` 보고.
- TS: `nextHeight`의 `fonts` 입력.

## 형식 변경

- 없음. 공유 JSON Schema와 캔버스 메타는 바뀌지 않는다. `doan check` 규칙이 하나 늘어난다.

## 규약 영향

- ARCHITECTURE §1 `doan check` 규칙 표에 `viewport_height_unit`(warning)을 더한다.
- 가이드와 `doan check` 규칙이 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌린다.

## 결정 영향

- PRODUCT §3 Out of scope 2(캔버스 형식 강제): 경고만 내고 쓰기를 막지 않으므로 `hardcoded_color`와 같은 수준이다. Doan이 읽는 규약 목록은 늘지 않는다.
- ARCHITECTURE §3 Height의 알려진 한계 "`calc(100vh + N)` canvases clip at first measurement"는 남는다. `viewport_height_unit` 경고가 이 경우를 드러낸다고 덧붙인다.

## PoC 의존

- 없음. 폰트 지연 픽스처와 `buzz-project-settings`로 실제 앱에서 확인한다(T4).

## POSTMORTEM에서 가져온 함정

- 2026-11-01 "…resized its iframe between 0 and 405 px forever": 측정값이 다시 크기를 정하는 루프는 한 단계가 아니라 고정점까지 테스트한다(measure → send → resize → measure). `nextHeight` 변경도 150과 0에서 시작하는 여러 라운드, absolute 프레임만 있는 문서, `loadingdone`이 두 번 오는 경우를 돌린다.
