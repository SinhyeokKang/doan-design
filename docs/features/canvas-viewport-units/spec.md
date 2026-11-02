# canvas-viewport-units — spec

출처: 실사용 테스트 이슈 "캔버스가 프레임보다 작아서 스크롤이 발생하는 경우가 있음". 재현 캔버스는 `buzz-project-settings`다. 결정은 대화와 `/feature-review`에서 사용자가 했다.

## 사용자

- **사람**: 캔버스가 잘리거나 보드 iframe 안에 문서 스크롤이 생기지 않고, 그린 그대로 끝까지 보인다.
- **에이전트**: 캔버스에 viewport 높이 단위를 쓰면 `doan check`가 어느 파일의 어떤 값인지와 고칠 방법을 알려 준다. 가이드에서 미리 배운다.

## 문제

- 앱은 보드 iframe 높이를 캔버스 문서 높이에 맞춘다(ARCHITECTURE §3 'Canvas view' Height). 그런데 iframe 안의 `vh`·`dvh`·`svh`·`lvh`와 `vb` 계열은 그 iframe 높이, 곧 캔버스 전체 높이를 가리킨다. 문서 높이가 viewport 단위를 쓰면 높이가 자기 자신을 따라가는 순환이 생긴다.
- 그 결과 첫 측정에서 높이가 굳어 아래 프레임이 잘리거나(`nextHeight`의 고정), 작은 초기 높이(150px)에서 계산된 요소가 넘쳐 스크롤이 생긴다. ARCHITECTURE의 알려진 한계 "`calc(100vh + N)` canvases clip at first measurement"가 이 경우다.
- `buzz-project-settings`는 앱의 `.doan-dialog`(`max-height: calc(100dvh - …)`)와 Project Settings 목록(`height: min(55dvh, …)`) CSS를 그대로 가져와 이 문제를 겪었다. 다른 세션이 캔버스에 `.doan-dialog[open]{max-height:none}`을 넣어 피했다(주석 "The shipped dialog caps its height at 100dvh…" 아래 규칙). 앱 CSS를 가져오는 초안이라면 언제든 다시 생긴다.
- 브라우저에는 iframe 안 viewport 단위의 기준을 바꾸는 API가 없다.
- 두 번째 원인: 늦게 적용되는 웹폰트. 앱은 DOMContentLoaded 시점에 대체 폰트로 첫 높이를 재고(`buzz-project-settings`에서 7832px), 그 높이에 iframe을 맞춘다. 그 뒤 Geist가 적용되어 문서가 7932px가 된다. 그러면 `nextHeight`(`app/src/main/canvasScript.ts`)는 "앱이 크기를 바꾼 직후 문서가 더 커졌다"고 보고 `min-height: 100vh`류로 판단해 높이를 고정한다. 그래서 아래 약 100px이 잘린다. 다른 세션이 이 캔버스에 `html{display:none}` 폰트 게이트를 넣어 우회했다(첫 측정 0px는 고정하지 않는 규칙을 이용한다). 같은 `@font-face`를 쓰는 다른 캔버스에도 생길 수 있다.

## 결정

1. 앱은 캔버스의 스타일 값을 바꾸지 않는다. 서버가 응답을 바꿔 쓰는 방식은 버린다(`/feature-review`에서 사용자 결정). 바꿔 쓴 값이 인스펙터와 `doan active`의 html로 새고, 서버 불변식이 바뀌기 때문이다.
2. viewport 높이 단위는 가이드와 `doan check` 경고로 막는다. 가이드는 "캔버스에 viewport 높이 단위를 쓰지 않는다. 앱 CSS를 가져올 때는 그 값을 px로 바꾼다"고 안내한다. `doan check`는 캔버스 HTML의 `<style>`·`style` 속성 선언 값에서 이 단위를 찾으면 `viewport_height_unit` 경고를 낸다. 캔버스가 링크한 스타일시트는 보지 않는다. 그 파일은 앱이 실제로 쓰는 제품 CSS라 에이전트가 고칠 수 없기 때문이다(오케스트레이션 중 사용자 결정). 링크한 CSS가 이 단위를 쓰면 가이드가 캔버스에서 px로 덮어쓰라고 안내한다.
3. 경고하는 단위는 `vh`·`dvh`·`svh`·`lvh`·`vb`·`dvb`·`svb`·`lvb`다. `vmin`·`vmax` 계열은 경고하지 않는다. 이 repo의 앱 CSS가 `box-shadow: inset 0 0 0 100vmax …` 채움 기법을 여러 캔버스에 쓰고, 이 값은 레이아웃 높이에 영향을 주지 않기 때문이다.
4. 폰트 경로는 앱에서 고친다. 스타일 값을 건드리지 않는 수정이다. 폰트 로드가 끝난 뒤(`document.fonts`의 `loadingdone`) 늘어난 높이는 한 번 받아들이고, 고정은 그 뒤에 다시 판단한다.

## 완료 조건

- `doan check`가 캔버스 HTML의 `<style>`·`style` 속성 선언 값에서 결정 3의 단위를 찾으면 `viewport_height_unit` warning을 낸다. 캔버스가 링크한 스타일시트(예: `app/src/renderer/ds/surfaces.css`의 `100dvh`)에는 경고하지 않는다. finding에는 파일 경로와 값(예: `100dvh`)이 있고, 메시지는 px로 바꾸라고 말한다.
  - 대소문자를 가리지 않는다(`100VH`). 주석·문자열·`url()`·at-rule prelude·식별자(`.vh-wrap`, `--foo-vh`)는 경고하지 않는다.
  - `vmin`·`vmax`는 경고하지 않는다.
- `doan skill` 가이드에 결정 2의 안내가 있다.
- 폰트 응답을 400ms 늦춘 픽스처에서, 폰트 게이트 없이도 보드 iframe `style.height`가 폰트 적용 뒤 문서 높이와 같아진다.
- `min-height: 100vh`처럼 viewport를 따라 커지는 문서는 지금처럼 높이가 고정된다(회귀 없음).
- `buzz-project-settings`에서 캔버스 안 dvh 값을 px로 바꾸고 폰트 게이트를 뺀 뒤에도, 실제 앱에서 마지막 프레임까지 보이고 보드 iframe 안에 문서 스크롤이 없다. `go run ./cli/cmd/doan check --repo .`에 `viewport_height_unit`이 없다.
- `/agent-eval` 라운드 결과가 `docs/USABILITY-EVAL.md`에 있다.

## 비목표

- 캔버스 CSS 값을 앱이 바꿔 쓰거나 기준 높이를 정하는 메타. 결정 1로 버렸다.
- 이미 viewport 높이 단위를 쓰는 캔버스를 앱이 바로잡는 것. 경고를 보고 에이전트가 고친다. 고치기 전까지 그 캔버스는 지금처럼 잘릴 수 있다.
- `vmin`·`vmax`, `cqh`·`cqb`(size container가 없으면 small viewport를 따른다), `vw` 등 너비 단위.
- 스크립트가 읽는 `innerHeight`·`matchMedia('(height…)')`, 높이 미디어 쿼리.
- 캔버스가 링크한 스타일시트의 viewport 높이 단위. 경고하지 않고, 가이드가 캔버스에서 px로 덮어쓰라고 안내한다. `buzz-project-settings`의 `.doan-dialog[open]{max-height:none}`이 그 덮어쓰기라서 남긴다.
- CDN 등 서버 밖 스타일시트와 런타임에 생성되는 CSS(Tailwind Play CDN의 `h-screen`, CSS-in-JS). `doan check`가 읽지 못한다.
- `doan:width`를 넘는 내용의 가로 넘침. 이번 재현의 원인이 아니어서 BACKLOG에 남긴다.
- body가 직접 스크롤하는 캔버스(알려진 한계 그대로).
