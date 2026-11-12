# canvas-svg-sprites — 스펙

앱이 그리는 캔버스와 `doan export`가 만든 파일이 SVG 스프라이트와 custom property `url()` 자산에서 같은 결과를 보이게 한다. 출처는 `docs/BACKLOG.md` 'Known defects'의 세 항목이다.

## 사용자

- **에이전트**: 캔버스를 쓰는 쪽이다. `doan check`가 앱에서 보이지 않을 참조와 앱·export에서 다르게 풀릴 참조를 작성 시점에 알려 주고, 가이드(`doan skill`)가 대신 쓸 형태를 알려 준다.
- **사람**: 앱에서 캔버스를 보고 Export…로 파일을 보낸다. 앱과 export가 다르게 보일 수 있는 캔버스는 export가 거부하고, 그 사유는 `doan check`가 먼저 알려 준다.

## 문제 (관찰된 사실)

BACKLOG 원문:

1. "The app does not draw an external `<use href="file.svg#id">`: the canvas runs in a `sandbox="allow-scripts"` iframe with an opaque origin, so the SVG on the same server counts as cross-origin (`Unsafe attempt to load URL … Domains, protocols and ports must match.`, seen in the built app on 2026-11-09). `doan export` copies the sprite into the canvas, so the exported file shows icons the app leaves blank. Inline sprites (`<use href="#id">`) render in both."
2. "`doan export` refuses an SVG sprite that contains a `<style>` element, because inlined it would style the whole canvas. Scoping the style to the copy does not work in Chromium: in the 2026-11-09 PoC a `:where([data-doan-sprite])` prefix and `@scope`, with the marker on the sprite root or a `<g>` wrapper, styled the `<use>` clone in WebKit only, never in Chromium 148 or Electron 45. Copying the sprite without its `<style>` was not taken either, because the app draws no external `<use>` at all (next line)."
3. "`doan export` matches custom property users by name only (ARCHITECTURE §3 'Custom property `url()`s resolve from their user'), so a rule that never applies to the declaring element still counts, and two existing candidate files refuse an export the app shows. Chromium also reuses the first resolution of the same `url()` text for later users in a page (seen in the Electron 45 probe), so with users in two folders the app can show nothing where the export shows a file."

정리하면 다음과 같다.

- 외부 `<use>`는 앱에서 빈칸이고 export에서는 보인다(결함 1). 결함 2는 결함 1의 export 쪽 처리(스프라이트 복사)에서 생긴 거부다.
- custom property 안의 상대 `url()`을 서로 다른 폴더의 스타일시트가 쓰면, 앱 결과는 요소와 해석 순서에 따라 달라지고 export는 이름만 보고 판단한다(결함 3).
- 현재 `doan check`는 둘 다 알려 주지 않는다. 에이전트는 export가 거부되거나 사람이 빈 아이콘을 볼 때까지 모른다.

이 기능 뒤에도 남는 결함: custom property 사용처는 이름으로만 센다. 그래서 선언한 요소에 실제로는 적용되지 않는 규칙도 사용처로 잡혀 `ambiguous_custom_url` warning과 export 거부가 나올 수 있다. 고칠 방법은 사용처를 한 폴더로 모으는 것이다. BACKLOG 결함 3은 이 문장으로 바꿔 남긴다(작업 7).

## 완료 조건

사용자가 확정한 방향(design.md '결정')을 기준으로 한다.

1. 캔버스(`.doan/canvases/`, `.doan/ds/`)의 `<template>` 밖 `<use>`가 같은 문서 조각(`#id`)이 아닌 `href` 또는 `xlink:href`를 가지면 `doan check`가 error를 보고한다. 인라인 `<use href="#id">`는 보고하지 않는다. 외부 URL `<use>`(CDN)는 `svg_use_not_inline`만 보고하고 `external_url`은 보고하지 않는다.
2. `doan export`는 조각이 아닌 모든 `<use>`(로컬, CDN, `data:`)를 새 사유 하나로 거부한다. 이 판정은 경로 해석(`resolveAsset`) 전에 한다. 거부 사유는 인라인 스프라이트로 바꾸라는 뜻을 담는다. 외부 SVG 파일을 캔버스에 복사하는 경로는 없어지고, 따라서 "SVG file has a style element" 거부와 그 밖의 `<use>` 전용 거부 사유도 없어진다.
3. 인라인 스프라이트(그 안의 `<style>` 포함)를 쓴 캔버스는 앱과 export 파일(Chromium, Safari)에서 같은 아이콘을 보인다. PoC(작업 1)로 확인한다.
4. 등록되지 않은 custom property가 상대 `url()`을 담고, 그 property를 `var()`로 실제 property에 넣는 사용 폴더들(다른 custom property를 거친 사용 포함)이 그 `url()`을 둘 이상의 서로 다른 repo 경로로 풀면 `doan check`가 warning을 보고한다. 모두 같은 경로로 풀리면(예: `.doan/canvases/`와 `.doan/ds/`가 같은 `../assets/x.svg`를 쓰는 경우) 보고하지 않는다. `@property`로 `<url>` 문법을 등록한 property는 선언 위치에서 풀리므로 대상이 아니다. 후보 경로는 `canvas.LocalPath`를 거친 상대 경로만이다.
5. `doan export`는 4와 같은 조건에서 파일 존재 여부와 관계없이 거부한다. 4와 5는 같은 순수 함수로 판단해, check가 조용한 캔버스는 이 이유로 export가 거부되지 않는다.
6. 가이드(`cli/internal/cli/skill.md`)와 preset `document.md`가 알려 준다: 아이콘이 스프라이트 파일에만 있으면 필요한 `<symbol>`을 캔버스에 인라인으로 복사하고 `<use href="#id">`로 그리며 원본 파일을 주석으로 남긴다. custom property `url()`은 한 폴더에서만 쓴다. `ambiguous_custom_url`이 남으면 export가 거부된다. CDN `<use>`는 외부 자원 warning의 예외로 error다. 새 `/agent-eval` 시나리오의 self-test가 PASS이고, 실제 라운드 결과(두 에이전트의 pass/fail, 새 이슈)가 `docs/USABILITY-EVAL.md`에 기록되어 있다.
7. 앱 코드(샌드박스 iframe, 서버, 주입 스크립트, 썸네일)는 바뀌지 않는다. `git diff --stat origin/develop -- app/`가 비어 있다.

## 기존 동작 변경

이 기능은 지금 통과하는 캔버스 일부를 막는다. 릴리스 노트에 두 항목을 넣는다.

1. **외부 스프라이트를 쓰는 캔버스**(`<style>` 없는 스프라이트라 지금은 export가 된다)
   - 사람: Export…가 실패하고, 토스트의 거부 목록에 해당 `<use>`와 새 사유가 보인다. 앱에서는 지금도 아이콘이 빈칸이다.
   - 에이전트: `doan check`가 `svg_use_not_inline` error로 exit 4를 낸다. check 통과를 요구하는 흐름(관례 E, 이 repo의 `/design-draft` 등)이 여기서 멈춘다.
   - 복구: 사람은 에이전트에게 고쳐 달라고 한다(사람은 캔버스를 직접 고치지 않는다, PRODUCT §3 Out of scope 7). 에이전트는 필요한 `<symbol>`을 인라인으로 옮긴다.
   - 릴리스 노트: "Canvases that use an SVG symbol from another file (`<use href="file.svg#id">`) now fail `doan check` and export; Doan never drew them. Ask your agent to inline the symbols."
2. **custom property `url()`의 후보 파일이 하나만 존재하는 캔버스**(지금은 그 파일로 export된다)
   - 사람: Export…가 실패하고, 거부 목록에 해당 `url()`과 "resolves to different paths…" 사유가 보인다.
   - 에이전트: `doan check`가 `ambiguous_custom_url` warning을 낸다. exit code는 바뀌지 않는다.
   - 복구: 1과 같다. 에이전트는 property를 한 폴더에서만 쓰게 고친다.
   - 릴리스 노트: "Export now refuses a `url()` in a custom property that stylesheets in different folders would resolve to different files, even when only one exists; `doan check` warns about it first."

## 범위 밖

- 앱이 외부 `<use>`를 그리게 하는 일: `allow-same-origin` 추가, 주입 스크립트의 런타임 인라인, 서버의 HTML 재작성(design.md '검토한 대안'). 사용자가 A안을 골랐다.
- 스프라이트 `<style>`을 복사본에만 적용하는 범위 지정. 2026-11-09 PoC에서 Chromium·Electron 45가 지원하지 않았다.
- custom property 사용처를 선택자와 cascade로 정확히 계산하는 일. Chromium의 첫 해석 재사용은 순서에 달려 있어 정적으로 재현할 수 없다.
- `<img>`·`feImage`·CSS로 불러오는 SVG 파일 안의 `<use>`. 그 문서 안 동작은 이번 범위가 아니다.
