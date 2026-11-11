# canvas-svg-sprites — 설계

## 방향

앱이 그리는 것을 기준으로 삼고, 앱에서 다르게 보일 작성을 `doan check`와 가이드로 막는다. export는 같은 조건을 거부한다. 앱 코드는 바꾸지 않는다.

- **외부 `<use>`**: 앱은 opaque origin 때문에 그리지 못한다. 앱을 고치는 대신 "외부 `<use>`는 지원하지 않는다"를 관례로 정하고, check error와 export 거부로 맞춘다. export의 스프라이트 복사가 없어지므로 결함 2(스프라이트 `<style>` 거부)는 사라진다.
- **custom property `url()`**: 사용처가 서로 다른 경로로 푸는 경우를 check warning과 export 거부의 같은 조건으로 묶는다. export는 파일 존재 여부와 관계없이 거부한다.

check와 가이드를 지렛대로 쓰는 이유: 문제가 에이전트의 작성 형태에서 생기고, 앱 쪽 해법은 모두 구조 결정을 건드린다(아래 '검토한 대안'). check 규칙과 가이드가 바뀌므로 `/agent-eval`을 작업에 넣는다.

## 검토한 대안 (결함 1)

| 안 | 내용 | 판단 |
|---|---|---|
| A (채택) | 외부 `<use>` 미지원. check error, export 거부, 가이드에 인라인 스프라이트 | 앱·썸네일·export가 같은 규칙을 따른다. 구조 결정 변경 없음 |
| B | 주입 스크립트가 스프라이트를 `fetch`(in-scope는 `Access-Control-Allow-Origin: null`로 가능)해 문서에 넣고 `href`를 `#id`로 바꾼다 | 캔버스 DOM을 앱이 바꾼다. `doan active`의 `html`, 캔버스 스크립트, 선택 anchor가 바뀐 DOM을 본다. 썸네일 창은 주입이 없어 계속 빈칸이다. 스프라이트 `<style>`은 앱에서도 캔버스 전체에 걸린다 |
| C | 서버가 캔버스 HTML 응답을 재작성해 스프라이트를 넣는다 | 썸네일까지 맞지만, 서버가 스트리밍 바이트를 해시하는 문서 바인딩(§3 'Document origin')과 "앱은 캔버스 내용을 쓰지 않는다"(PRODUCT §3 Out of scope 7)를 건드린다 |
| D | iframe에 `allow-same-origin` 추가 | §3 샌드박스 결정(에이전트가 쓴 HTML을 앱 UI·디스크와 분리) 위반. 제외 |

B·C를 고르면 이 문서의 결함 2 처리(스프라이트 `<style>` 범위 문제)가 앱 쪽에도 생기므로 다시 설계해야 한다.

## 영향 받는 구성요소

- **CLI (Go)**
  - `cli/internal/check/`: 규칙 두 개 추가.
    - `svg_use_not_inline` (error): `<template>` 밖 `<use>`의 `href` 또는 `xlink:href`가 앞뒤 공백(URL 파서가 지우는 범위)을 뺀 뒤 `#`로 시작하지 않는다. 빈 값은 보고하지 않는다. 외부 URL·`data:`도 포함한다(앱에서 둘 다 그려지지 않는다, PoC로 확인).
    - `ambiguous_custom_url` (warning): 등록되지 않은 custom property 값의 상대 `url()`을, 그 property를 직접 또는 다른 custom property를 거쳐 실제 property에 넣는 폴더들에서 풀었을 때 둘 이상의 서로 다른 repo 경로가 나온다. `@property`로 `<url>` 문법을 등록한 property는 선언 위치에서 풀리므로 제외한다. 경로 기준이라 `.doan/canvases/`와 `.doan/ds/`가 같은 `../assets/x.svg`를 쓰는 경우는 보고하지 않는다.
  - `cli/internal/export/`:
    - `<use>`의 로컬 비조각 `href`는 새 사유(내부 상수 이름은 구현에서 정한다. 예: `ReasonUseExternal`, "the app does not draw an external use; inline the sprite")로 거부한다.
    - 스프라이트 복사(`sprite`, `spriteContent`, `spriteContainer`, `spriteIDs`, `spriteStyled`)와 사유 `ReasonUseFragment`·`ReasonUseID`·`ReasonUseCollision`·`ReasonUseType`·`ReasonUseStyle`은 고아가 되므로 제거한다. `documentIDs`가 스프라이트 충돌 검사에만 쓰이면 함께 제거한다.
    - `replaceCustom`의 모호성 조건을 위 `ambiguous_custom_url`과 같은 함수로 바꾼다. 존재하는 파일이 하나뿐이어도 후보 경로가 둘 이상이면 `ReasonAmbiguous`로 거부한다.
  - `cli/internal/cli/skill.md`: 가이드 문장 추가(작업 5).
- **app (Electron + TS)**: 코드 변경 없음. Export…의 거부 목록은 `interpretExport`가 `- <item>: <detail>` 줄을 그대로 읽으므로 새 사유 문구가 그대로 보인다. check 결과를 화면에 쓰는 곳은 없다(`app/src`에 check 코드 문자열 없음).
- **스킬**: 가이드 변경. `SKILL.md` stub은 그대로.
- **형식**: schema 변경 없음(아래).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. **`<use>` 참조 판별** — 파싱된 캔버스 트리에서 `<template>` 밖 `<use>`의 `href`/`xlink:href`를 모아 비조각 여부를 판정한다. check는 `html.Parse` 기반 `canvas` 패키지를 쓰므로 그 트리 위에서 구현한다. export 쪽은 기존 `rewriteHTML`의 `kindUse` 분기에서 같은 판정 함수(공백 처리, `#` 여부)를 호출한다.
2. **custom property 사용 경로 계산** — export의 `uses`/`consumers`(`customurl.go`)를 I/O 없는 함수로 `cli/internal/canvas` 쪽으로 옮기고, "property → 사용 폴더 집합 → 상대 `url()`이 풀리는 repo 경로 집합"을 돌려준다. 경로 해석(`resolveAsset`)은 파일시스템을 보므로 함수 밖에 두고, 순수 부분은 `path.Join` 기반 후보 경로 계산과 "서로 다른 경로가 둘 이상인가" 판정이다.
3. **모호성 판정** — 2의 결과로 check finding과 export 거부를 같은 조건으로 낸다. check와 export가 같은 입력에 같은 판정을 내는지 Go 테스트 하나로 고정한다.

## 형식 변경

- JSON Schema 변경 없음. check finding 모양은 그대로이고 `code` 값만 늘어난다. finding code 목록을 열거하는 schema는 없다.
- CLI 출력: check의 새 code 두 개, export 거부의 새 사유 문구. 에이전트가 읽는 출력이므로 `/agent-eval` 대상이다(AGENTS.md 'Workflow').
- 형식 버전 `v` 변경 없음.

## 관례 영향 (ARCHITECTURE §1)

- 캔버스 관례에 한 줄 추가: "SVG `<use>` references a symbol in the same canvas (`href="#id"`); the app cannot load another file's symbols."
- `doan check` 규칙 표에 위 두 규칙 추가: `svg_use_not_inline`은 error, `ambiguous_custom_url`은 warning.
- PRODUCT §3 Out of scope 2('Enforcing a canvas format')와의 관계: 이 규칙은 형식 강제가 아니라 "앱이 그리지 못하는 참조"를 알리는 것으로, `css_not_served`(앱이 렌더하지 않는 CSS를 error로 보고)와 같은 성격이다. 승격 때 PRODUCT §5 item 11의 check 목록을 갱신한다.

## 결정 영향 (ARCHITECTURE 구조 결정)

| 결정 | 위치 | 이 설계에서 |
|---|---|---|
| 샌드박스 iframe(`sandbox="allow-scripts"`, `allow-same-origin` 없음) | §3 | 유지. 앱은 그대로 두고 작성 규칙으로 맞춘다. 대안 D 제외 |
| 서빙 범위와 토큰 경로, `Access-Control-Allow-Origin: null` | §3 | 유지. 외부 `<use>`는 렌더러의 same-origin 검사에서 막혀 서버를 바꿔도 풀리지 않는다고 본다(작업 1에서 서버 요청 여부 확인) |
| 앱은 캔버스 내용·스타일 값을 쓰지 않는다 | PRODUCT §3 Out of scope 7, §1 관례 11 | 유지. 대안 B·C 제외 |
| 서빙 범위 = export 경계 | §3 'Exported canvas and viewer' | 유지. 새 거부는 경계를 넓히거나 좁히지 않는다 |
| export의 SVG `<use>` 복사 | §3 'SVG `<use>`', PRODUCT §5 item 3('SVG sprites' 포함, 스프라이트 `<style>` 거부 문장) | **변경(사용자 승인).** 복사를 없애고 거부로 바꾼다 |
| custom property `url()`은 사용처에서 해석 | §3 'Custom property `url()`s resolve from their user', PRODUCT §5 item 3 | 해석 규칙은 유지하고 거부 조건만 넓힌다(사용자 승인) |
| export viewer의 `srcdoc` 샌드박스, CSP meta 없음 | §3 'Page' | 유지 |

## PoC 의존

아직 확인되지 않은 가정이다. 작업 1·2에서 먼저 확인한다.

1. Electron 45 앱에서 외부 `<use>`가 로컬 파일, `xlink:href`, CDN URL, `data:` 모두 그려지지 않고, 서버에 요청이 오지 않는다. BACKLOG는 로컬 `href` 한 경우만 관찰했다.
2. 인라인 스프라이트(그 안의 `<symbol>`·`<style>` 포함)가 앱, export 파일의 Chromium·Safari에서 같은 결과를 보인다. 스프라이트 `<style>`이 캔버스 전체에 걸리는 점도 세 곳에서 같다.
3. 가이드가 외부 스프라이트 대신 권할 형태가 앱과 export에서 모두 보인다: 아이콘별 SVG 파일의 `<img src>`, CSS `mask: url(icon.svg)`. 보이지 않는 형태는 가이드에 넣지 않는다.
4. custom property `url()`: 같은 텍스트를 두 폴더의 사용처가 서로 다른 경로로 풀면 앱 결과가 순서에 따라 달라진다(재현). 같은 경로로 풀리면 순서와 관계없이 그 파일이 보인다. `@property` `<url>` 등록 property는 선언 위치에서 풀린다.

측정 방법은 POSTMORTEM 2026-11-03의 권고를 따라 레이아웃마다 페이지를 하나씩 쓴다.

## POSTMORTEM에서 가져온 함정

- **2026-11-03 — Export refused icons the app showed, set as url() in a custom property**: "any code that resolves a CSS `url()` must ask whether the token sits in a custom property value (`canvas.CSSRef.Custom`) and, if so, resolve from its users (`uses.consumers`). Measure browser URL resolution in Electron with one page per layout (`.scratch/export-var-url/main.cjs` pattern): Chromium reuses the first resolution of identical `url()` text within a page, so a combined fixture page gives order-dependent results." → 새 check 규칙도 `consumers`와 같은 사용처 계산을 써야 하고, PoC 4는 페이지를 나눠 측정한다. 이 항목의 원인이 된 디자인 시스템 패턴(캔버스가 선언하고 `.doan/assets/`의 공유 CSS 한 곳이 쓰는 경우)은 사용 폴더가 하나이므로 새 warning에 걸리지 않아야 한다. 테스트에 그 형태를 넣는다.
- **2026-11-09 — Export inlined the wrong file after a nested self-closing `<template/>`**: "every tokenizer walker that skips `<template>` content counts depth through `templateTag` … A new walker's tests include `<template/>` at top level and nested." → `<use>` 판별을 export의 tokenizer 쪽에 두면 `templateTag`를 쓰고, check 쪽은 `html.Parse` 트리를 따른다. 둘 다 `<template/>` 최상위·중첩 테스트를 넣는다.

## 결정

사용자가 다음을 확정했다.

1. 결함 1은 A안: 외부 `<use>`를 지원하지 않는다. check error와 export 거부로 맞추고 export의 스프라이트 복사를 제거한다.
2. `svg_use_not_inline`은 error다.
3. export는 로컬 외부 `<use>`를 거부한다.
4. `ambiguous_custom_url`은 warning이다.
5. export는 후보 경로가 둘 이상이면 파일 존재 여부와 관계없이 거부한다.
6. 외부 스프라이트와 custom property `url()`을 쓰는 `/agent-eval` 시나리오를 하나 추가한다(tasks.md 작업 6).
