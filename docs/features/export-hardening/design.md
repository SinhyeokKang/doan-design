# export-hardening — design

## Affected components

- **CLI (Go)**: `cli/internal/repo/resolve.go`(디렉터리 index, `Resolver`), `cli/internal/export/`(`resolve.go`, `inline.go`, `customurl.go`, `rewrite.go`, `datauri.go`, `assemble.go` 중 프로파일이 가리키는 곳), `cli/internal/canvas/css.go`(프로파일이 lexer를 가리킬 때), `cli/internal/cli/check.go`(같은 `Resolver` 사용), 테스트 fixture `cli/internal/export/exporttest/seed.go`.
- **App (Electron + TS)**: 없음. 거절 이유는 `export_refused`의 detail 글자로 그대로 지나간다(`app/src/main/canvasExport.ts` `listed`).
- **Skills**: 없음. 가이드(`cli/internal/cli/skill.md`)는 거절 이유를 나열하지 않는다.
- **Formats**: 없음(아래 'Format changes').

## 1. 경로 해석 (`diskSpelling`)

지금 `repo.Resolve`는 호출마다 `filepath.EvalSymlinks(root)`를 하고, `diskSpelling`이 경로의 각 segment마다 `os.ReadDir`로 디렉터리 전체를 읽어 이름을 찾는다. 같은 디렉터리의 참조 N개는 디렉터리를 N번 읽는다.

결정(Q6 (a)):

- `repo.Resolver`를 둔다. `NewResolver(root)`가 절대 root와 real root를 한 번 구하고, `(*Resolver).Resolve(base, p)`는 지금 `Resolve`와 같은 순서(lexical → `EvalSymlinks` → real root 기준 비교 → on-disk spelling)를 따른다. 디렉터리 index는 real 디렉터리 절대 경로를 key로 Resolver 안에 한 번만 만든다.
- `repo.Resolve(root, base, p)`는 시그니처와 동작을 그대로 두고, 새 Resolver 하나로 한 번 푸는 wrapper가 된다. 한두 번 부르는 호출(`config.go`, `init.go`, `storage.go`, `work_rules.go`, `sessions.go`, `scope.go`)은 바꾸지 않는다.
- 참조마다 부르는 곳만 Resolver를 쓴다: export의 `resolveAsset`(inliner가 하나를 들고 `collectUses`·`replace`·`replaceCustom`·sprite가 공유), check의 `visit`과 `Implements`(`checkInput`이 하나를 들고 모든 캔버스가 공유).
- **index**: 디렉터리 항목 이름으로 (1) 정확한 이름 집합과 (2) 대소문자·NFC를 접은 key → 원래 이름 목록(ReadDir 순서)을 만든다. 조회는 정확한 이름이 있으면 그것, 없으면 접은 key의 bucket을 지금처럼 `strings.EqualFold(NFC(a), NFC(b))`로 다시 거르고 `os.Lstat` + `os.SameFile`로 확정한다. bucket key는 `strings.EqualFold`가 같다고 보는 두 이름이 반드시 같은 bucket에 들어가야 한다(예: `unicode.SimpleFold`의 orbit에서 가장 작은 rune으로 접기). 접기 함수가 지금의 선형 탐색과 같은 후보를 같은 순서로 내는지 순수 함수 테스트로 고정한다(Kelvin 기호 K, `ß`, 터키어 `İ`·`ı`, NFD 한글).
- **수명과 경합**: Resolver는 명령 한 번(export 한 번, check 한 번)만 산다. 첫 읽기 뒤 생긴 파일은 그 실행에서 Missing으로 보인다. export는 어차피 읽는 순간 `O_NOFOLLOW`로 다시 열므로(`export.ReadFile`) 이름이 바뀌거나 symlink로 바뀐 파일은 읽기에서 실패한다. 이 snapshot 의미를 ARCHITECTURE §13 'Paths inside the repo'에 한 줄로 올린다.
- **검증 seam**: Resolver의 디렉터리 읽기 함수를 테스트에서 바꿔 끼워 횟수를 센다(기본값 `os.ReadDir`).

고르지 않은 안: (b) macOS `fcntl(F_GETPATH)`나 `realpath(3)`로 on-disk spelling을 얻는 방법은 APFS에서 대소문자와 NFC/NFD를 디스크 spelling으로 돌려주는지, Linux CI에서 같은 결과를 내는지 PoC가 필요하다. (c) package 전역 cache는 앱이 아닌 CLI라 당장은 명령 하나만 살지만, 테스트끼리 상태를 나누고 수명이 코드에 드러나지 않는다.

## 2. 메모리

원인은 측정하지 않았다. PoC(tasks T1)가 먼저다.

- **측정**: 24 MiB CSS 하나를 `<link>`하는 캔버스를 테스트 안에서 만들어 `export.Inline`과 `Assemble`을 돌리고 `-memprofile`로 할당 상위를 본다. 최대 RSS는 빌드한 CLI로 다시 잰다. 기존 관찰(1.36 GB)과 같은 조건인지 CSS 모양(minify 여부, `url()` 수)을 함께 기록한다.
- **후보**(코드를 읽고 세운 가설, 측정 전):
  1. `canvas.lex`가 공백 아닌 글자마다 `token{kind, text, start, end}`(약 40 B)를 slice에 쌓는다. minify한 CSS는 글자 3~4개마다 token 하나라서 24 MiB에서 수백 MB가 되고, append 확장으로 순간 두 배가 된다. 한 stylesheet를 `collectText`의 `CustomUses`·`CSSRefs`, `inlineFile`의 `CSSRefs`로 세 번 lex한다.
  2. `string(b)` 변환(`collectSheet`, `inlineFile`)과 `dataURI([]byte(text))`가 각각 입력 크기의 사본을 만든다.
  3. `rewriteCSSRefs`의 `strings.Builder`가 `Grow` 없이 늘어난다.
  4. `Assemble`이 `attributeEscaper.Replace` 세 번, 문자열 연결, `strings.NewReplacer`, `[]byte` 변환으로 결과 크기의 사본을 여러 번 만든다. 결과는 `export.go`에서 다시 `page`로 남는다.
  5. Go GC는 기본 `GOGC=100`이라 heap이 살아 있는 양의 두 배까지 자란 뒤 회수한다.
- **고치는 원칙**: 결과 바이트는 바꾸지 않는다(기존 export 테스트와, 고치기 전 결과를 저장해 비교하는 테스트). `ScanCSS`와 `CSSRefs`가 같은 규칙을 쓴다는 `canvas_test.go`의 고정을 깨지 않는다. lexer를 고친다면 slice 대신 token을 하나씩 내는 방식이나 token 크기를 줄이는 방식 중 프로파일 수치로 고르고, 고른 이유를 이 문서에 적는다. GC 설정(`debug.SetGCPercent`, `GOMEMLIMIT`)만으로 줄이는 방법은 원인을 그대로 두므로 쓰지 않는다.
- **목표**: 최대 RSS ≤ 입력 × 10(결정 Q5). 회귀 테스트는 RSS 대신 `runtime.MemStats.TotalAlloc` 증가분에 상한을 둔다. 할당 총량은 최대 사용량의 상한이고 GC 시점에 덜 흔들린다. 상한 값은 PoC 뒤 수정한 코드의 측정값에 여유를 두어 정한다.

## 3. `<base href>`

결정(Q2 (a)): base가 캔버스 폴더를 바꾸면 그 base에 기대는 참조를 거절한다. base를 따라 푸는 것은 하지 않는다.

- **어떤 base인가**: HTML 규칙대로 문서에서 `href`가 있는 첫 `<base>`만 센다. `<template>` 안은 무시한다(`documentIDs`와 같은 방식). `href` 값은 URL parser처럼 앞뒤 C0·공백을 자른다(`trimURL`).
- **"폴더를 바꾸지 않는다"의 판정**: 순수 함수 `baseMoves(href string) bool`. query와 fragment를 뗀 값이 다음 중 하나일 때만 기준 폴더가 그대로라 false다: 빈 값, `.`, `./`, 그리고 앞에 `./`가 있거나 없는 한 segment(같은 폴더의 파일 이름). 한 segment는 `/`·`\`(URL parser가 `/`로 읽는다)·`:`(scheme)를 포함하지 않고 `..`(`%2e` 표기 포함)가 아니어야 한다. 나머지(`..`, 다른 폴더, 앞 `/`, `http:`·`file:`·`data:` 같은 scheme)는 모두 true다. `../canvases/`처럼 결국 같은 폴더를 가리키는 값도 true로 본다. 판정을 단순하게 두고, 그런 캔버스는 base를 지우면 된다.
- **거절 대상**: base가 폴더를 바꾸면, 캔버스 문서 수준의 상대 참조 중 export가 포함하려던 것(`classInline`과 `kindUse`의 로컬 참조, `<style>`과 `style` 속성 안 `url()`·`@import`)을 새 이유 `ReasonBase`로 거절한다. 이유 글자는 `": "`를 포함하지 않는다(예: `relative to a base element`). custom property의 사용처가 캔버스 자신(`collectUses`에서 캔버스 폴더로 기록되는 사용처)인 경우도 같은 이유로 거절한다. 사용처 기록에 캔버스 폴더 대신 "base로 옮겨진 문서"라는 표식을 넣고 `replaceCustom`이 그 표식을 만나면 거절하는 식이다.
- **영향 없음**: CSS 파일 안 참조(그 파일 URL 기준), sprite 안 참조(SVG 파일 기준), 절대 URL, `data:`, fragment만 있는 참조, `<a href>`·`<form action>`(지금처럼 `links`). base는 결과 문서에 그대로 남는다.
- `doan check`는 바꾸지 않는다. `<base>`를 무시하는 check와 결과가 어긋나지 않도록 export는 거절만 하고 다르게 풀지 않는다.

고르지 않은 안 (b)는 base 기준 폴더로 참조를 풀어 serving scope 검사를 거치게 하는 것이고, (c)는 check의 Reach까지 같은 규칙으로 바꾸는 것(ARCHITECTURE §1 'Reach' 변경)이다.

## 4. SVG sprite `<style>`

PoC가 먼저다(tasks T2). 결과에 따라 구현하거나 비목표로 옮긴다(결정 Q4).

- **앱의 기준**: 앱은 `<use href="file.svg#id">`로 외부 SVG 문서를 참조하므로, 그 문서의 `<style>`은 그 문서 요소에만 걸리고 캔버스 요소에는 걸리지 않는다. export는 sprite를 캔버스 문서 안으로 복사하므로 그대로 두면 `<style>`이 캔버스 전체에 걸린다.
- **PoC 질문**: (1) 앱(Electron 45)에서 `<style>`이 든 외부 sprite를 `<use>`할 때 복사본의 computed style. (2) 같은 문서 안 숨긴 sprite의 root에 표식 속성(예: `data-doan-sprite="N"`)을 달고 sprite 규칙의 selector를 `:where([data-doan-sprite="N"]) <selector>`로 좁혔을 때, `<use href="#id">` 복사본에 그 규칙이 걸리는지. SVG 2는 `<use>` shadow tree의 스타일 매칭 방식을 바꿨고 브라우저마다 다를 수 있어 Chromium과 WebKit 둘 다 본다. (3) 좁힌 규칙이 sprite 밖 캔버스 요소에 걸리지 않는지.
- **구현(PoC 통과 시)**: 순수 함수 `scopeSpriteStyle(css, prefix string) (string, bool)`. 규칙 목록을 나눠 각 selector 앞에 prefix를 붙이고, `@media`·`@supports` 안 규칙도 같게 처리한다. 범위를 좁힐 수 없는 구성이면 false를 내고 지금처럼 `ReasonUseStyle`로 거절한다: `@import`, `@font-face`, `@keyframes`, `@property`, `@counter-style`, `@layer`(문서 전역 이름을 만든다), `:root`·`html`·`body`·`:host`를 쓰는 selector, selector를 나눌 수 없는 구문. `:where()`는 specificity를 더하지 않으므로 sprite 규칙끼리의 우선순위가 그대로다. 좁힌 `<style>`의 `url()`은 지금처럼 SVG 파일 폴더 기준으로 다시 쓴다(지금 foreign 모드는 `<style>` 내용을 CSS로 다시 쓰지 않으므로 이 경로를 더한다).
- **이미 있는 한계**: 캔버스 자신의 규칙(예: `path { fill: red }`)이 sprite 복사본에 걸리는 것은 `<style>` 없는 sprite에서도 지금 그대로이고 이번에 다루지 않는다.

## Parts to split out as pure functions (`/tdd` 대상)

- `repo`: 디렉터리 이름 목록 → index 만들기, index 조회(정확한 이름, 접은 key 후보). 지금 `diskSpelling`의 선형 탐색과 같은 후보·순서를 내는지 표 테스트.
- `export`: `firstBaseHref(src []byte) (string, bool)`(첫 `href` 있는 `<base>`, `<template>` 무시), `baseMoves(href string) bool`.
- `export`: `scopeSpriteStyle(css, prefix string) (string, bool)`(PoC 통과 시).
- 메모리: 프로파일이 가리키는 함수(예: `canvas.lex`의 대체, `dataURI` 쓰기 경로)를 바꾸면 그 함수의 결과가 바꾸기 전과 같은지 비교 테스트.

## Format changes

없다. JSON Schema(ARCHITECTURE §11)와 CLI 응답 모양(§12 `doan export`)은 그대로다. `export_refused`에 새 detail 글자(`ReasonBase`)가 생기지만 줄 형식 `- <item>: <detail>`과 앱의 해석(`canvasExport.ts` `listed`)은 바뀌지 않는다.

## Conventions impact

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. check는 같은 결과를 더 빨리 낸다.

## Decision impact

- **serving scope가 export 경계다**(ARCHITECTURE §3 'Exported canvas and viewer'): Resolver는 같은 해석 순서를 cache할 뿐 새 경로를 만들지 않는다. "Never widen this with a path of its own"을 지킨다. base 처리는 거절만 더하고, sprite 범위 좁히기는 새 파일을 읽지 않는다.
- **PRODUCT §5 item 3 'Export and viewer'**: frame 안 로컬 문서 거절과 "JavaScript is not read"는 그대로다(결정 Q1). base 거절과 sprite `<style>` 포함은 완료 후 이 항목에 현재 규칙으로 올린다.
- **CLI는 앱 없이 동작한다**(PRODUCT §5 item 12): 렌더링에 기대는 해법(custom property cascade)은 쓰지 않는다.
- sandbox iframe, CSP 없음, `O_NOFOLLOW` 읽기는 손대지 않는다.

## PoC dependency

- **메모리 원인**(T1): 프로파일 전에는 어디를 고칠지 정할 수 없다.
- **sprite `<style>` 범위 좁히기**(T2): `<use>` shadow tree에서 selector가 어떻게 매칭되는지 Chromium(Electron 45)과 WebKit에서 확인되지 않았다.
- 경로 해석(결정 Q6 (a))은 PoC가 필요 없다.

## POSTMORTEM

- **2026-11-03 'Export refused icons the app showed, set as url() in a custom property'**: "any code that resolves a CSS `url()` must ask whether the token sits in a custom property value (`canvas.CSSRef.Custom`) and, if so, resolve from its users (`uses.consumers`)." base 거절은 custom property 사용처가 캔버스인 경우를 같이 다룬다. 브라우저 측정은 "one page per layout"로 한다: "Chromium reuses the first resolution of identical `url()` text within a page, so a combined fixture page gives order-dependent results." sprite PoC도 경우마다 페이지를 나눈다.
- **2026-10-25 'Init published success before merge setup could fail'**: "Preserve on-disk spelling using name equivalence plus filesystem identity, and keep unexpected permission/I/O failures distinct from missing paths." index 조회도 이름 동등 + `os.SameFile`을 유지하고, ReadDir·Lstat 오류를 Missing으로 바꾸지 않는다.
- **2026-11-09 'CLI path messages contradicted ARCHITECTURE §12 and §13'**: "before resolving links, compare the cleaned path with the root lexically … Test a missing `../x` alongside every 'missing' path case." Resolver도 lexical 검사를 먼저 하고, 새 거절 이유가 들어간 메시지에도 절대 경로가 없는지 본다.
- **2026-10-31 'A linked default directory served its unconfigured target'**: scope 계산과 목록이 같은 symlink 규칙을 써야 한다. Resolver는 `Scope`의 결과를 바꾸지 않는다(`scope.go`는 일회용 `Resolve`를 그대로 쓴다).
- **2026-10-21 'Local server guarantees lived in comments …'**: "prove each security test with a mutation that must turn it red." serving scope와 관련된 Resolver 테스트(scope 밖, symlink 탈출)는 cache를 우회하게 바꾼 코드에서 빨개지는지 확인한다.
