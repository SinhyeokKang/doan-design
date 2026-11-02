# canvas-viewport-units — design

## 방식

로컬 서버(`app/src/main/serve/server.ts`)가 캔버스 HTML과 서버 범위 안의 `.css`를 내보낼 때 텍스트를 바꿔 쓴다. 디스크의 파일은 그대로다.

1. **CSS 값 바꿔 쓰기**: 값 안의 `<number>vh`, `<number>dvh`, `<number>svh`, `<number>lvh`를 `calc(<number> * var(--doan-vh))`로 바꾼다.
   - 대상: `.css` 응답 전체, HTML의 `<style>` 블록, HTML 요소의 `style` 속성.
   - 건너뛰는 곳: 주석, 문자열, `url()`, at-rule의 prelude(`@media (min-height: 50vh)`처럼 `var()`가 허용되지 않는 곳). 숫자에 붙지 않은 식별자(`.vh-wrap`, `--foo-vh`)는 바꾸지 않는다.
2. **기준 변수 넣기**: 캔버스 HTML 응답의 `<head>` 맨 앞에 `<style>:root{--doan-vh:<H/100>px}</style>`를 넣는다. H는 `doan:viewport-height` 메타 값, 없거나 잘못되면 900이다.
   - 변수를 쓰는 이유: 하나의 스타일시트를 기준이 다른 여러 캔버스가 링크할 수 있어서, CSS 응답에서는 px로 바로 바꿀 수 없다.
   - 대체값(`var(--doan-vh, 1vh)`)은 두지 않는다. 대체값이 쓰이면 순환이 그대로 돌아온다. 변수가 없으면 계산이 무효가 되어 그 선언만 빠진다.

## 폰트 적용 뒤 높이

- `nextHeight(prev, measured, inner)`에 "이 측정 전에 폰트 로드가 끝났다"는 신호를 더한다. 주입 스크립트가 `document.fonts`의 `loadingdone` 이벤트(그리고 `document.fonts.ready`)를 받으면 다음 측정에서 고정 상태를 풀고 측정값을 그대로 보낸다.
- 이유: 폰트 교체로 커진 높이는 viewport를 따라 커진 것이 아니다. viewport 단위를 바꿔 쓴 뒤에는 따라 커지는 문서가 거의 남지 않으므로, 풀었다가 다시 고정되는 진동 위험은 바꿔 쓰기가 닿지 않는 경우에만 남는다. 그 경우도 `nextHeight`가 다시 고정하므로 한 번 더 크기를 바꾸고 멈춘다. 고정점 테스트로 확인한다(POSTMORTEM 2026-11-01 '…resized its iframe between 0 and 405 px forever'의 예방 규칙).
- 첫 측정을 폰트 로드 뒤로 미루는 방법(캔버스의 폰트 게이트를 앱이 대신 하기)은 버린다. 폰트가 느리거나 실패하면 보드가 늦게 뜨거나 3초 타임아웃이 필요하다.

## 대안과 버린 이유

- iframe 안 스크립트로 `document.styleSheets`를 고친다: iframe은 opaque origin이라 링크된 스타일시트의 `cssRules`를 읽을 수 없다(ARCHITECTURE §3 CORS). 버린다.
- CDP `Emulation.setDeviceMetricsOverride`로 iframe viewport를 속인다: 하위 프레임 단위로 적용할 수 있는지 확인되지 않았고, 레이아웃 크기와 보이는 크기가 갈라져 측정 루프가 더 복잡해진다. 버린다.
- iframe 높이를 고정하고 문서를 안에서 스크롤해 팬한다: 줌·팬·선택 좌표 전체를 다시 짜야 한다(ARCHITECTURE §3 'Zoom and pan are a transform outside the iframe'). 범위가 너무 크다.

## 영향 받는 부분

- **app main**: `serve/server.ts`에서 HTML과 CSS 응답을 바꿔 쓴다. 바꿔 쓴 본문의 `Content-Length`가 달라진다. 캐시 헤더나 조건부 요청이 있다면 바꿔 쓴 본문을 기준으로 한다(T3에서 확인).
- **썸네일**: capture window의 iframe도 같은 서버에서 읽으므로 자동으로 같은 기준을 쓴다(ARCHITECTURE §3 'Capture document'). T4에서 확인한다.
- **인스펙터 값(CDP)**: computed 값은 px라서 그대로다. 지정 값을 보여주는 곳이 있으면 `calc(… var(--doan-vh))`가 보인다. 알려진 한계로 적는다.
- **CLI(Go)**: `cli/internal/canvas`가 `doan:viewport-height` 메타를 읽는다. `cli/internal/check`에 경고 규칙 하나(`invalid_viewport_height`: 메타가 있는데 양의 정수가 아님)를 더한다.
- **skills**: `doan skill` 가이드(`cli/internal/cli/skill.md`)의 캔버스 규약에 두 줄을 더한다. "viewport 높이 단위(vh·dvh·svh·lvh)는 앱에서 doan:viewport-height(기본 900px)로 계산된다." "문서나 보드 높이를 viewport 높이에 맞추지 말고, 프레임 높이는 px나 내용으로 정한다. 앱 CSS를 가져올 때도 같다."

## 대체 경로 (앱 수정이 막힐 때)

T3에서 바꿔 쓰기를 적용할 수 없다고 판명되면(서버 결정, CSP, 캐시 등) 앱 수정을 멈추고 아래로 바꾼다. 바꿀 때 사용자에게 알린다.

- 가이드: "캔버스 CSS에 viewport 높이 단위를 쓰지 않는다. 앱 CSS를 가져올 때는 그 값을 px로 바꾼다."
- `doan check`: 캔버스 HTML과 Reach 안의 로컬 스타일시트에서 viewport 높이 단위를 찾으면 `viewport_height_unit`(warning). 파일·줄과 "px로 바꾸라"는 고칠 방법을 낸다. 기존 CSS 스캐너(`cli/internal/canvas`)를 쓴다.
- ARCHITECTURE의 알려진 한계 `calc(100vh + N)`은 남기고, 경고로 막는다고 적는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `rewriteViewportUnits(css: string): string`: CSS 토크나이저 수준의 바꿔 쓰기. 주석·문자열·`url()`·at-rule prelude·식별자를 건너뛴다.
- `rewriteCanvasHtml(html: string): string`: `<style>` 블록과 `style` 속성을 바꾸고 `<head>` 맨 앞에 기준 변수를 넣는다. `<head>`가 없는 문서도 다룬다.
- `viewportHeight(meta: string | null): number`: 메타 값 파싱, 기본 900.
- Go: `canvas` 모델의 메타 읽기와 `check` 경고 규칙.

## 형식 변경

- 공유 JSON Schema는 바뀌지 않는다. CLI 응답에 메타 값을 싣지 않는다.

## 규약 영향

- ARCHITECTURE §1 'Canvas conventions'에 선택 메타 `doan:viewport-height`를 더한다. `doan check` 규칙 표에 `invalid_viewport_height`(warning)를 더한다.
- 가이드와 `doan check` 규칙이 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌린다.

## 결정 영향

- ARCHITECTURE §3 'Serving'에 "서버는 파일을 그대로 내보낸다"는 결정이 있는지 T3에서 확인한다. 있으면 이 feature가 그 결정을 바꾼다(사용자 승인됨: 앱에서 근본 해결).
- 캔버스 파일은 바꾸지 않으므로 PRODUCT §3 Out of scope 2(캔버스 형식 강제)와 7(동시 편집)에 닿지 않는다.
- sandbox iframe, 주입 스크립트, CSP는 그대로다. `<head>`에 넣는 것은 인라인 `<style>`이다. 캔버스 CSP가 인라인 스타일을 막는 경우 기준 변수가 빠진다. T3에서 캔버스 CSP 처리를 확인한다.

## PoC 의존

- 없음. `buzz-project-settings`와 `calc(100vh + 200px)` 픽스처로 실제 앱에서 확인한다(T5).

## POSTMORTEM에서 가져온 함정

- ARCHITECTURE §3 Height의 POSTMORTEM 항목들(absolute 프레임 높이 진동, 화면 밖 iframe의 animation frame 없음): 높이 측정 코드는 건드리지 않는다. 바꿔 쓰기는 측정 입력만 안정시킨다.
