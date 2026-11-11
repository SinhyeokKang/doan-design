# canvas-svg-sprites — 스펙

앱이 그리는 캔버스와 `doan export`가 만든 파일이 SVG 스프라이트와 custom property `url()` 자산에서 같은 결과를 보이게 한다. 출처는 `docs/BACKLOG.md` 'Known defects'의 세 항목이다.

## 사용자

- **에이전트**: 캔버스를 쓰는 쪽이다. `doan check`가 앱에서 보이지 않을 참조와 앱·export에서 다르게 풀릴 참조를 작성 시점에 알려 주고, 가이드(`doan skill`)가 대신 쓸 형태를 알려 준다.
- **사람**: 앱에서 캔버스를 보고 Export…로 파일을 보낸다. 앱에서 빈 아이콘이 export 파일에서만 보이거나, 앱에서 보이는 캔버스가 export에서 이유 없이 거부되는 일이 없어야 한다.

## 문제 (관찰된 사실)

BACKLOG 원문:

1. "The app does not draw an external `<use href="file.svg#id">`: the canvas runs in a `sandbox="allow-scripts"` iframe with an opaque origin, so the SVG on the same server counts as cross-origin (`Unsafe attempt to load URL … Domains, protocols and ports must match.`, seen in the built app on 2026-11-09). `doan export` copies the sprite into the canvas, so the exported file shows icons the app leaves blank. Inline sprites (`<use href="#id">`) render in both."
2. "`doan export` refuses an SVG sprite that contains a `<style>` element, because inlined it would style the whole canvas. Scoping the style to the copy does not work in Chromium: in the 2026-11-09 PoC a `:where([data-doan-sprite])` prefix and `@scope`, with the marker on the sprite root or a `<g>` wrapper, styled the `<use>` clone in WebKit only, never in Chromium 148 or Electron 45. Copying the sprite without its `<style>` was not taken either, because the app draws no external `<use>` at all (next line)."
3. "`doan export` matches custom property users by name only (ARCHITECTURE §3 'Custom property `url()`s resolve from their user'), so a rule that never applies to the declaring element still counts, and two existing candidate files refuse an export the app shows. Chromium also reuses the first resolution of the same `url()` text for later users in a page (seen in the Electron 45 probe), so with users in two folders the app can show nothing where the export shows a file."

정리하면 다음과 같다.

- 외부 `<use>`는 앱에서 빈칸이고 export에서는 보인다(결함 1). 결함 2는 결함 1의 export 쪽 처리(스프라이트 복사)에서 생긴 거부다.
- custom property 안의 상대 `url()`을 서로 다른 폴더의 스타일시트가 쓰면, 앱 결과는 요소와 해석 순서에 따라 달라지고 export는 이름만 보고 판단한다(결함 3).
- 현재 `doan check`는 둘 다 알려 주지 않는다. 에이전트는 export가 거부되거나 사람이 빈 아이콘을 볼 때까지 모른다.

## 완료 조건

사용자가 확정한 방향(design.md '결정')을 기준으로 한다.

1. 캔버스(`.doan/canvases/`, `.doan/ds/`)의 `<template>` 밖 `<use>`가 같은 문서 조각(`#id`)이 아닌 `href` 또는 `xlink:href`를 가지면 `doan check`가 error를 보고한다. 인라인 `<use href="#id">`는 보고하지 않는다.
2. `doan export`는 같은 `<use>`를 거부하고, 거부 사유가 인라인 스프라이트로 바꾸라는 뜻을 담는다. 외부 SVG 파일을 캔버스에 복사하는 경로는 없어지고, 따라서 "SVG file has a style element" 거부도 없어진다.
3. 인라인 스프라이트(그 안의 `<style>` 포함)를 쓴 캔버스는 앱과 export 파일(Chromium, Safari)에서 같은 아이콘을 보인다. PoC(작업 1)로 확인한다.
4. 등록되지 않은 custom property가 상대 `url()`을 담고, 그 property를 `var()`로 실제 property에 넣는 스타일 텍스트들이 그 `url()`을 둘 이상의 서로 다른 경로로 풀면 `doan check`가 warning을 보고한다. 모두 같은 경로로 풀리면 보고하지 않는다.
5. `doan export`는 4와 같은 조건에서 파일 존재 여부와 관계없이 거부한다. 4와 5는 같은 순수 함수로 판단해, check가 조용한 캔버스는 이 이유로 export가 거부되지 않는다.
6. 가이드(`cli/internal/cli/skill.md`)가 인라인 스프라이트 사용, 외부 스프라이트 대신 쓸 형태, custom property `url()`을 한 폴더에서만 쓰는 방법을 알려 준다. 외부 스프라이트와 custom property `url()`을 쓰는 `/agent-eval` 시나리오 하나를 추가하고, 그 시나리오를 포함한 라운드가 변경을 측정한다.
7. 앱 코드(샌드박스 iframe, 서버, 주입 스크립트, 썸네일)는 바뀌지 않는다.

## 범위 밖

- 앱이 외부 `<use>`를 그리게 하는 일: `allow-same-origin` 추가, 주입 스크립트의 런타임 인라인, 서버의 HTML 재작성(design.md '검토한 대안'). 사용자가 A안을 골랐다.
- 스프라이트 `<style>`을 복사본에만 적용하는 범위 지정. 2026-11-09 PoC에서 Chromium·Electron 45가 지원하지 않았다.
- custom property 사용처를 선택자와 cascade로 정확히 계산하는 일. Chromium의 첫 해석 재사용은 순서에 달려 있어 정적으로 재현할 수 없다.
- `<img>`·`feImage`·CSS로 불러오는 SVG 파일 안의 `<use>`. 그 문서 안 동작은 이번 범위가 아니다.
- 외부 CDN `<use>`의 export 처리 변경. 지금처럼 외부 링크로 남고 앱·export 둘 다 그리지 않는다. check 규칙(완료 조건 1)은 이것도 error로 보고한다.
