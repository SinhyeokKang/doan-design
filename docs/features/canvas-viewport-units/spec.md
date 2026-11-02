# canvas-viewport-units — spec

출처: 실사용 테스트 이슈 "캔버스가 프레임보다 작아서 스크롤이 발생하는 경우가 있음". 재현 캔버스는 `buzz-project-settings`다. 결정은 대화에서 사용자가 했다.

## 사용자

- **사람**: 캔버스가 잘리거나 보드 안에 스크롤바가 생기지 않고, 그린 그대로 끝까지 보인다.
- **에이전트**: 앱 CSS를 가져오거나 `100vh`·`100dvh`로 화면을 그려도 앱에서 깨지지 않는다. 화면 높이가 필요하면 새 메타 `doan:viewport-height`로 정한다.

## 문제

- 앱은 보드 iframe 높이를 캔버스 문서 높이에 맞춘다(ARCHITECTURE §3 'Canvas view' Height). 그런데 iframe 안의 `vh`·`dvh`·`svh`·`lvh`는 그 iframe 높이, 곧 캔버스 전체 높이를 가리킨다. 문서 높이가 viewport 단위를 쓰면 높이가 자기 자신을 따라가는 순환이 생긴다.
- 그 결과 첫 측정에서 높이가 굳어 아래 프레임이 잘리거나(`nextHeight`의 freeze), 작은 초기 높이(150px)에서 계산된 요소가 넘쳐 스크롤이 생긴다. ARCHITECTURE의 알려진 한계 "`calc(100vh + N)` canvases clip at first measurement"가 이 경우다.
- `buzz-project-settings`는 앱의 `.doan-dialog`(`max-height: calc(100dvh - …)`)와 Project Settings 목록(`height: min(55dvh, …)`) CSS를 그대로 가져와 이 문제를 겪었다. 다른 세션이 캔버스에 `.doan-dialog[open]{max-height:none}`을 넣어 피했다(캔버스 1110행 주석). 앱 CSS를 가져오는 초안이라면 언제든 다시 생긴다.
- 브라우저에는 iframe 안 viewport 단위의 기준을 바꾸는 API가 없다.

## 결정 (대화에서 확정)

1. 앱에서 근본적으로 해결한다. 캔버스마다 우회하거나 `doan check` 경고로 끝내지 않는다.
2. 로컬 서버가 캔버스와 그 스타일시트를 내보낼 때 viewport 높이 단위를 고정 기준의 값으로 바꿔 쓴다.
3. 기준은 캔버스가 `<meta name="doan:viewport-height" content="N">`로 정하고, 없으면 900px이다. `doan:width`처럼 캔버스 규약의 하나가 된다.
4. 에이전트 가이드로도 막는다. 가이드는 "viewport 높이 단위는 앱에서 `doan:viewport-height`로 계산된다. 보드 높이를 따라가는 레이아웃(문서 높이를 viewport 높이로 정하기)은 쓰지 않는다"고 안내한다. 앱 수정이 T3에서 막히면 이 방어선을 넓힌다: 가이드는 viewport 높이 단위를 쓰지 말라고 하고, `doan check`가 캔버스 CSS의 viewport 높이 단위를 경고한다.

## 완료 조건

- `100vh`·`100dvh`·`100svh`·`100lvh`와 그 배수·`calc()` 안의 사용이 앱 보드에서 기준 높이(기본 900px)로 계산된다. 보드 iframe 높이가 바뀌어도 그 값이 바뀌지 않는다.
- `buzz-project-settings`에서 우회 규칙(`.doan-dialog[open]{max-height:none}`)을 빼도 잘림과 스크롤이 없다(실제 앱 확인).
- `calc(100vh + 200px)` 픽스처가 끝까지 보이고, 높이가 굳지 않는다.
- `doan:viewport-height`가 있으면 그 값을 쓴다. 숫자가 아니거나 0 이하이면 900을 쓰고 `doan check`가 경고한다.
- Overview 썸네일(capture window)도 같은 기준으로 그린다.
- 바꿔 쓰기가 캔버스 파일을 바꾸지 않는다. 디스크의 파일은 그대로다.
- ARCHITECTURE의 알려진 한계에서 `calc(100vh + N)` 항목이 빠진다.

## 비목표

- `vw`·`dvw` 등 너비 단위. 보드 너비는 `doan:width`로 고정이라 순환이 생기지 않는다.
- 스크립트가 읽는 `innerHeight`·`matchMedia('(height…)')`, 높이 미디어 쿼리. CSS 텍스트 바꿔 쓰기로는 닿지 않는다. 알려진 한계로 남긴다.
- CDN 등 서버 밖에서 오는 스타일시트. 서버를 거치지 않으므로 바뀌지 않는다.
- `doan:width`를 넘는 내용의 가로 넘침. 이번 재현의 원인이 아니어서 BACKLOG에 남긴다.
- body가 직접 스크롤하는 캔버스(알려진 한계 그대로).
