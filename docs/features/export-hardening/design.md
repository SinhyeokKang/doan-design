# export-hardening — design

## Affected components

- **CLI (Go)**: `cli/internal/repo/resolve.go`(디렉터리 index, `Resolver`), `cli/internal/export/`(`resolve.go`, `inline.go`, `customurl.go`, `rewrite.go`, `datauri.go`, `assemble.go` 중 프로파일이 가리키는 곳, base 판정과 제거, sprite), `cli/internal/canvas/css.go`(프로파일이 lexer를 가리킬 때), `cli/internal/cli/check.go`(같은 `Resolver` 사용), `cli/internal/cli/export.go`(메모리 한도를 쓰게 될 때), 테스트 fixture `cli/internal/export/exporttest/seed.go`.
- **App (Electron + TS)**: 없음(결정 B). 앱의 `listed`(`app/src/main/canvasExport.ts`)는 `- <item>: <detail>` 줄에서 detail을 버리고, 토스트는 첫 참조와 개수만 보인다(`app/src/renderer/canvasRowMessages.ts`). base 거절도 같은 문구로 보인다. 이유는 에이전트가 `doan export` 메시지에서 읽는다.
- **Skills**: 없음. 가이드(`cli/internal/cli/skill.md`)는 거절 이유를 나열하지 않는다.
- **Formats**: 없음(아래 'Format changes').

## 1. 경로 해석 (`diskSpelling`)

지금 `repo.Resolve`는 호출마다 `filepath.EvalSymlinks(root)`를 하고, `diskSpelling`이 경로의 각 segment마다 `os.ReadDir`로 디렉터리 전체를 읽어 이름을 찾는다. 같은 디렉터리의 참조 N개는 디렉터리를 N번 읽는다.

결정(Q6 (a)):

- **`repo.Resolver`**: `repo.NewResolver(root)`와 테스트용 `repo.NewResolverWith(root, readDir)`(디렉터리 읽기 함수를 받는 exported 생성자)를 둔다. `(*Resolver).Resolve(base, p)`는 지금 `Resolve`와 같은 순서(lexical → `EvalSymlinks` → real root 기준 비교 → on-disk spelling)를 따른다. real root는 처음 필요할 때 한 번 구한다. 생성자에서 미리 구하면 lexical 검사보다 링크 해석이 먼저 일어나므로, lexical-first 규칙(POSTMORTEM 2026-11-09)을 지키려고 늦게 구한다.
- **index의 key**: real 디렉터리의 절대 경로다. on-disk spelling은 `EvalSymlinks`가 낸 real 경로를 걷는 단계에서만 찾으므로, symlink 디렉터리 alias와 그 real 디렉터리는 index 하나, 읽기 한 번을 공유한다. lexical 경로를 key로 쓰거나 이름 → `State`를 cache하면 안 된다. 같은 lexical 경로가 symlink 교체로 다른 real 경로를 가리킬 수 있고, scope 판정은 real 경로에서 해야 하기 때문이다.
- `repo.Resolve(root, base, p)`는 시그니처와 동작을 그대로 두고, 새 Resolver 하나로 한 번 푸는 wrapper가 된다. 한두 번 부르는 호출(`config.go`, `init.go`, `storage.go`, `work_rules.go`, `sessions.go`, `scope.go`)은 바꾸지 않는다. `diskSpelling`을 직접 부르는 다른 곳(`inside_relative.go:91`, `find.go:49`, `git.go:101`)도 지금의 일회용 경로를 그대로 쓴다.
- 참조마다 부르는 곳만 Resolver를 쓴다. export의 inline 단계와 check의 `checkInput`이 Resolver를 인자로 받는다(테스트가 `NewResolverWith`로 만든 것을 넘긴다). export는 inliner 하나가 들고 `collectUses`·`replace`·`replaceCustom`·sprite가 공유하고, check는 모든 캔버스의 `visit`과 `Implements`가 공유한다.
- **index**: 디렉터리 항목 이름으로 (1) 정확한 이름 집합과 (2) 대소문자·NFC를 접은 key → 원래 이름 목록(ReadDir 순서)을 만든다. 조회는 정확한 이름이 있으면 그것, 없으면 접은 key의 bucket을 지금처럼 `strings.EqualFold(NFC(a), NFC(b))`로 다시 거르고 `os.Lstat` + `os.SameFile`로 확정한다. bucket key는 `strings.EqualFold`가 같다고 보는 두 이름이 반드시 같은 bucket에 들어가야 한다(예: `unicode.SimpleFold`의 orbit에서 가장 작은 rune으로 접기). Go `strings.EqualFold`는 simple folding만 쓰므로 기대값은 다음과 같다(2026-11-09 go run으로 확인): `ß`와 `ẞ`는 같다, `ß`와 `ss`, `ẞ`와 `SS`는 다르다, `İ`는 `i`·`I`와 다르다, `ı`는 `i`·`I`와 다르다, Kelvin 기호 `K`(U+212A)는 `k`·`K`와 같다.
- **수명과 경합**: Resolver는 명령 한 번(export 한 번, check 한 번)만 산다. 첫 읽기 뒤 생긴 파일은 그 실행에서 Missing으로 보인다. export는 읽는 순간 `O_NOFOLLOW`로 다시 열므로(`export.ReadFile`) 이름이 바뀌거나 symlink로 바뀐 파일은 읽기에서 실패한다. 이 snapshot 의미를 ARCHITECTURE §13 'Paths inside the repo'에 한 줄로 올린다.

고르지 않은 안: (b) macOS `fcntl(F_GETPATH)`나 `realpath(3)`로 on-disk spelling을 얻는 방법은 APFS에서 대소문자와 NFC/NFD를 디스크 spelling으로 돌려주는지, Linux CI에서 같은 결과를 내는지 PoC가 필요하다. (c) package 전역 cache는 테스트끼리 상태를 나누고 수명이 코드에 드러나지 않는다.

## 2. 메모리

원인은 측정하지 않았다. PoC(tasks T1)가 먼저다.

- **입력**: `.scratch/export-hardening/`의 결정적(deterministic) 생성기 하나가 T1·T5·T9의 입력을 만든다. CSS는 minify 여부, `url()` 수, 참조 자산 크기를 고정하고, 자산 5,000개 캔버스는 1 KiB 이하 `<img>` 5,000개(합계는 `MaxBytes` 50 MiB 미만)로 만든다. T8의 커밋되는 Go 테스트는 같은 생성 규칙을 테스트 안에 옮겨 쓰고, T1에서 두 생성 결과의 sha256이 같은지 확인한다.
- **측정**: 24 MiB CSS 하나를 `<link>`하는 캔버스로 `export.Inline`과 `Assemble`을 돌리고 `-memprofile`로 할당 상위를 본다. 최대 RSS는 빌드한 CLI를 `/usr/bin/time -l`로 세 번 돌려 가장 큰 값을 쓴다. 기계, Go 버전, 커밋 sha를 함께 적는다. RSS의 기준은 CSS 크기다(24 MiB → 240 MiB 이하). 입력 전체 바이트도 기록한다.
- **후보**(코드를 읽고 세운 가설, 측정 전):
  1. `canvas.lex`가 공백 아닌 글자마다 `token{kind, text, start, end}`(약 40 B)를 slice에 쌓는다. minify한 CSS는 글자 3~4개마다 token 하나라서 24 MiB에서 수백 MB가 되고, append 확장으로 순간 두 배가 된다. 한 stylesheet를 `collectText`의 `CustomUses`·`CSSRefs`, `inlineFile`의 `CSSRefs`로 세 번 lex한다.
  2. `string(b)` 변환(`collectSheet`, `inlineFile`)과 `dataURI([]byte(text))`가 각각 입력 크기의 사본을 만든다. `inliner.files`가 읽은 바이트를 export 끝까지 들고 있다.
  3. `rewriteCSSRefs`의 `strings.Builder`가 `Grow` 없이 늘어난다.
  4. `Assemble`이 `attributeEscaper.Replace` 세 번, 문자열 연결, `strings.NewReplacer`, `[]byte` 변환으로 결과 크기의 사본을 여러 번 만든다. 결과는 `export.go`에서 다시 `page`로 남는다.
  5. Go GC는 기본 `GOGC=100`이라 heap이 살아 있는 양의 두 배까지 자란 뒤 회수한다.
- **고치는 방식 후보**: lex를 한 번만 하고 token을 세 호출이 나눠 쓰기, token을 줄이기(`int32` offset, `text`는 원문에서 잘라 쓰기), slice 대신 token을 하나씩 내기, `inliner.files`가 다 쓴 바이트를 놓기, 사본 줄이기. 프로파일 수치로 고르고 고른 이유를 이 문서에 적는다.
- **고치는 원칙**: 결과 바이트는 바꾸지 않는다(기존 export 테스트와, 고치기 전 결과의 sha256을 넣어 둔 비교 테스트). lexer를 바꾸면 한 입력 묶음에 대해 `ScanCSS`, `CSSRefs`, `CustomUses`(그리고 `viewportHeights`를 쓰는 쪽)의 결과를 바꾸기 전과 비교해 `doan check` 결과가 그대로인지 확인하고, `cli/internal/canvas/css_refs_test.go`의 `TestCSSRefsMatchesScanCSS`를 깨지 않는다. 쓰기 경로를 건드리면 `export_signal_test.go`, `TestExportTemporaryCollisionPreservesOtherWriter`, `TestExportTooLarge*` 순서 테스트가 그대로 통과해야 한다.
- **GC 한도(결정 D)**: 원인을 먼저 고친다. 그래도 목표에 못 미치면 `GOMEMLIMIT`/`debug.SetMemoryLimit`를 보조로 쓸 수 있다. 쓰게 되면 한도 없이 고친 값, 한도를 둔 값, 고치기 전 값을 함께 기록하고, 한도는 `doan export` 명령에만 건다. `debug.SetGCPercent`만으로 줄이는 방법은 쓰지 않는다.
- **회귀 감지**: `runtime.GC()` 뒤 `runtime.ReadMemStats`로 export 전후의 `TotalAlloc` 증가분에 상한을 두는 테스트(`t.Parallel` 없음). 할당 총량은 최대 사용량의 상한이고 GC 시점에 덜 흔들린다. RSS 자체는 T9에서 잰다. 상한 값은 수정 뒤 측정값에 여유를 두어 정한다. 24 MiB 프로파일 테스트는 Go internal 규칙 때문에 `cli/internal/export`에 두고, 환경 변수가 있을 때만 돈다(없으면 `t.Skip`).

## 3. `<base href>`

결정(Q2, A): base가 캔버스 폴더를 바꾸면 그 base에 기대는 참조를 거절한다. base를 따라 푸는 것은 하지 않는다. 결과에서는 `href`가 있는 `<base>`를 지운다.

- **어떤 base인가**: 순수 함수 `firstBaseHref(src []byte) (string, bool)`. 문서에서 `href`가 있는 첫 `<base>`를 tokenizer로 찾는다. 태그와 속성 이름은 대소문자를 가리지 않고(`<BASE HREF>`), 속성 값의 entity는 풀고, `<template>` 안과 주석 안은 무시한다. 본문에서 참조보다 뒤에 있는 `<base>`도 센다(문서 전체의 첫 base가 기준이다). 알려진 한계: inline `<svg>`·`<math>` 안 `<base>`도 tokenizer는 세므로, 그런 캔버스는 필요 이상으로 거절될 수 있다(받아들인다).
- **"폴더를 옮기는가"의 판정**: 순수 함수 `baseMoves(href string) bool`. 먼저 값 안의 ASCII tab·LF·CR을 모두 지우고(WHATWG URL parser가 하는 대로) 앞뒤 C0·공백을 자른다(`trimURL`). `%2E`(대소문자 무관)는 `.`로 읽는다. query와 fragment는 뗀다. 남은 값이 빈 값, `.`, `./`, 또는 같은 폴더의 파일 이름 한 segment(앞의 `./`는 허용)일 때만 false다. 한 segment는 `/`·`\`(URL parser가 `/`로 읽는다)·`:`(scheme)를 포함하지 않고 `..`가 아니어야 한다. 나머지(`..`, `.%2e`, 다른 폴더, 앞 `/`, `//host/`, `http:`·`file:`·`data:` 같은 scheme)는 모두 true다. `../canvases/`처럼 결국 같은 폴더를 가리키는 값도 true로 본다. 판정을 단순하게 두고, 그런 캔버스는 base를 지우면 된다.
- **거절 대상**: base가 폴더를 옮기면, 캔버스 문서 수준의 상대 참조 중 export가 포함하려던 것(`classInline`과 `kindUse`의 로컬 참조, `<style>`과 `style` 속성 안 `url()`·`@import`)을 해석하지 않고 새 이유 `ReasonBase`로 거절한다. 이유 글자는 `": "`를 포함하지 않는다(예: `relative to a base element`). 그래서 base 아래의 scope 밖·없는 참조도 `ReasonBase` 하나로 나온다. custom property의 사용처가 캔버스 자신인 경우도 같은 이유로 거절한다: 사용처 기록에 캔버스 폴더 대신 "base로 옮겨진 문서"라는 표식을 넣고 `replaceCustom`이 그 표식을 만나면 거절한다. 아무도 쓰지 않는 캔버스 안 custom property `url()`은 거절하지 않고 쓴 그대로 둔다(앱도 읽지 않는다).
- **거절 순서**: parse 거절(`doan:width` 없음·중복)이 먼저이고 지금과 같다. 로컬 `iframe`·`frame`·`object`·`embed`는 base와 관계없이 `ReasonFrame`이다(분류가 해석보다 먼저다). 거절 목록은 문서 순서다(`TestExportCollectsAllRefusalsInDocumentOrder`). 참조가 하나도 없는 캔버스는 base가 있어도 export된다.
- **결과에서 base 지우기**: `<template>` 밖의 모든 `<base>`에서 `href` 속성을 지우고, 남은 속성이 없으면 element째 지운다. `href` 없는 `<base target>`은 그대로 둔다. 모든 참조가 data URI가 되므로 base는 쓸모가 없고, 남기면 viewer `srcdoc` 안에서 `<use href="#id">`·`url(#grad)` 같은 fragment 참조가 다른 문서를 가리키게 된다(T2 PoC에서 한 번 확인한다).
- **영향 없음**: CSS 파일 안 참조(그 파일 URL 기준), sprite 안 참조(SVG 파일 기준), 절대 URL, `data:`, fragment만 있는 참조, `<a href>`·`<form action>`(지금처럼 `links`).
- `doan check`는 바꾸지 않는다. `<base>`를 무시하는 check와 결과가 어긋나지 않도록 export는 거절만 하고 다르게 풀지 않는다.

고르지 않은 안 (b)는 base 기준 폴더로 참조를 풀어 serving scope 검사를 거치게 하는 것이고, (c)는 check의 Reach까지 같은 규칙으로 바꾸는 것(ARCHITECTURE §1 'Reach' 변경)이다.

## 4. SVG sprite `<style>`

PoC가 먼저다(tasks T2). 결과에 따라 세 갈래 중 하나로 가거나 비목표로 옮긴다(결정 Q4, C).

- **앱의 기준**: 앱은 `<use href="file.svg#id">`로 외부 SVG 문서를 참조한다. 그 문서의 `<style>`이 복사본에 어떻게 걸리는지는 확인되지 않았다. export는 sprite를 캔버스 문서 안으로 복사하므로, 그대로 두면 `<style>`이 캔버스 전체에 걸린다.
- **PoC 측정 방식**: 규칙마다 서로 다른 불투명 색을 주고 고정 좌표의 pixel을 읽는다(두 엔진 모두). Chromium은 CDP pierce와 `getComputedStyleForNode`로 보조 확인을 더할 수 있다. 경우마다 페이지를 나눈다(POSTMORTEM 2026-11-03).
  - (1) 앱 구조: local HTTP server + `sandbox="allow-scripts"` iframe, Electron 45를 `--user-data-dir=<tmp>`로 띄운다. POSTMORTEM이 가리킨 `.scratch/export-var-url/main.cjs`는 남아 있지 않으므로 새로 쓴다.
  - (2a) `:where([data-doan-sprite="N"]) <selector>` prefix, (2b) `@scope ([data-doan-sprite="N"]) { … }`. 표식은 sprite root `<svg>`의 속성으로 다는 경우와 `<g data-doan-sprite>` wrapper로 감싸는 경우를 둘 다 본다.
  - (3) (2)에서 sprite 밖 캔버스 요소에 규칙이 걸리지 않는지.
  - (2)(3)은 `Assemble` 결과를 viewer `srcdoc` 안에서 연다. 같은 페이지에서 결과에 `<base>`를 남겼을 때 fragment 참조가 깨지는지도 한 번 본다(결정 A).
  - selector 모양: type `path`, class `.st0`, 자손 `g path`, `#id`, `symbol`과 `g`를 겨냥한 규칙, 두 sprite 파일이 `.st0`에 서로 다른 색을 주는 경우.
- **판정**: 앱이 외부 sprite의 `<style>`을 복사본에 전혀 적용하지 않으면, export는 sprite를 `<style>` 없이 복사한다(범위 좁히기 함수는 만들지 않는다). 적용한다면 (2a)·(2b) 중 Chromium과 WebKit에서 모든 경우를 통과한 방식을 쓴다. 실패가 하나라도 있으면 비목표로 옮긴다.
- **구현(범위 좁히기로 갈 때)**: 순수 함수 `scopeSpriteStyle(css, marker string) (string, bool)`. 허용 목록 방식이다: at-rule이 없는 평범한 style rule만 받고, 각 selector 앞에 PoC가 고른 방식으로 범위를 붙인다. 다음은 false를 내고 지금처럼 `ReasonUseStyle`로 거절한다: 모든 at-rule(`@media`·`@supports` 포함, 모르는 at-rule 포함), nesting(`&`, 규칙 안 규칙), `:root`·`html`·`body`·`:host`를 쓰는 selector, selector를 나눌 수 없는 구문.
- **foreign `<style>` 읽기**: SVG 안 `<style>`은 foreign content라 지금 `rewriteMarkup`이 CSS로 다루지 않는다. 자식이 text와 CDATA뿐일 때만 entity를 풀고 이어 붙여 CSS 한 덩어리를 만든다. 자식에 element가 있으면 거절한다. 범위를 붙인 결과는 CDATA 하나로 다시 쓰고, 결과에 `]]>`가 있으면 거절한다. `<style>`이 여러 개면 각각 처리한다. `media` 속성이 있는 `<style>`은 거절한다. `type`이 비었거나 `text/css`가 아닌 `<style>`은 브라우저가 적용하지 않으므로 복사본에서 뺀다.
- **복사본**: 같은 sprite 파일을 두 fragment로 참조해도 복사본과 표식은 하나다. 표식 번호는 문서 순서로 매긴다. 범위를 붙인 `<style>`의 `url()`과 그 안 custom property `url()`은 선언한 파일(SVG 파일) 기준으로 다시 쓴다(ARCHITECTURE §3: sprite 복사본 안 custom property는 선언한 파일이 기준).
- **이미 있는 한계**: 캔버스 자신의 규칙(예: `path { fill: red }`)이 sprite 복사본에 걸리는 것은 `<style>` 없는 sprite에서도 지금 그대로이고 이번에 다루지 않는다.

## Parts to split out as pure functions (`/tdd` 대상)

- `repo`: 디렉터리 이름 목록 → index 만들기, index 조회(정확한 이름, 접은 key 후보). 지금 `diskSpelling`의 선형 탐색과 같은 후보·순서를 내는지 표 테스트.
- `export`: `firstBaseHref(src []byte) (string, bool)`, `baseMoves(href string) bool`, 결과에서 base `href`를 지우는 다시 쓰기.
- `export`: `scopeSpriteStyle(css, marker string) (string, bool)`, foreign `<style>` 내용 읽기(범위 좁히기로 갈 때).
- 메모리: 프로파일이 가리키는 함수(예: `canvas.lex`의 대체, `dataURI` 쓰기 경로)를 바꾸면 그 함수의 결과가 바꾸기 전과 같은지 비교 테스트.

## Format changes

없다. JSON Schema(ARCHITECTURE §11)와 CLI 응답 모양(§12 `doan export`)은 그대로다. `export_refused`에 새 detail 글자(`ReasonBase`)가 생기지만 줄 형식 `- <item>: <detail>`과 앱의 해석(`canvasExport.ts` `listed`)은 바뀌지 않는다.

## Conventions impact

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. check는 같은 결과를 더 빨리 낸다.

## Decision impact

- **serving scope가 export 경계다**(ARCHITECTURE §3 'Exported canvas and viewer'): Resolver는 같은 해석 순서를 cache할 뿐 새 경로를 만들지 않는다. "Never widen this with a path of its own"을 지킨다. base 처리는 거절만 더하고, sprite 처리는 새 파일을 읽지 않는다.
- **PRODUCT §5 item 3 'Export and viewer'**: frame 안 로컬 문서 거절과 "JavaScript is not read"는 그대로다(결정 Q1). sprite `<style>` 거절은 제품 결정이 아니라 구현 한계였다(item 3은 SVG sprite를 이미 포함 대상으로 적는다). base 거절·제거와 sprite `<style>` 처리는 완료 후 이 항목에 현재 규칙으로 올린다.
- **CLI는 앱 없이 동작한다**(PRODUCT §5 item 12): 렌더링에 기대는 해법(custom property cascade)은 쓰지 않는다.
- sandbox iframe, CSP 없음, `O_NOFOLLOW` 읽기는 손대지 않는다.

## PoC dependency

- **메모리 원인**(T1): 프로파일 전에는 어디를 고칠지 정할 수 없다.
- **sprite `<style>`**(T2): 앱이 외부 sprite의 `<style>`을 `<use>` 복사본에 적용하는지, 범위를 좁힌 규칙이 Chromium(Electron 45)과 WebKit의 `<use>` shadow tree에서 어떻게 매칭되는지 확인되지 않았다. 결과에 남은 `<base>`가 `srcdoc` 안 fragment 참조를 깨는지도 여기서 확인한다.
- 경로 해석(결정 Q6)은 PoC가 필요 없다.

## POSTMORTEM

- **2026-11-03 'Export refused icons the app showed, set as url() in a custom property'**: "any code that resolves a CSS `url()` must ask whether the token sits in a custom property value (`canvas.CSSRef.Custom`) and, if so, resolve from its users (`uses.consumers`)." base 거절은 custom property 사용처가 캔버스인 경우를 같이 다룬다. 브라우저 측정은 "one page per layout"로 한다: "Chromium reuses the first resolution of identical `url()` text within a page, so a combined fixture page gives order-dependent results." sprite PoC도 경우마다 페이지를 나눈다.
- **2026-10-25 'Init published success before merge setup could fail'**: "Preserve on-disk spelling using name equivalence plus filesystem identity, and keep unexpected permission/I/O failures distinct from missing paths." index 조회도 이름 동등 + `os.SameFile`을 유지하고, ReadDir·Lstat 오류를 Missing으로 바꾸지 않는다.
- **2026-11-09 'CLI path messages contradicted ARCHITECTURE §12 and §13'**: "before resolving links, compare the cleaned path with the root lexically … Test a missing `../x` alongside every 'missing' path case." Resolver는 real root를 늦게 구해 lexical 검사를 먼저 하고, 새 거절 이유가 들어간 메시지에도 절대 경로가 없는지 본다.
- **2026-10-31 'A linked default directory served its unconfigured target'**: scope 계산과 목록이 같은 symlink 규칙을 써야 한다. Resolver는 `Scope`의 결과를 바꾸지 않는다(`scope.go`는 일회용 `Resolve`를 그대로 쓴다).
- **2026-10-21 'Local server guarantees lived in comments …'**: "prove each security test with a mutation that must turn it red." 잘못 공유한 cache(lexical 디렉터리 key, 또는 이름 → `State` cache)를 넣은 구현에서 scope·symlink 탈출 테스트가 빨개지는지 확인한다.
