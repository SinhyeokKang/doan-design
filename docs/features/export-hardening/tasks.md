# export-hardening — tasks

순서: 기준 빌드 → PoC → 순수 함수 → shell(I/O) → 문서 올리기. 앱 UI 변경은 없다. spec '결정'의 Q1–Q7과 A–D를 따른 순서다.

**측정 공통 규칙**: `go tool pprof`, `/usr/bin/time -l`, `.scratch/` Playwright 스크립트는 AGENTS.md 'Commands'에 없지만 PoC·측정 task에만 쓰도록 허용됐다. 스크립트·생성기·프로파일 파일은 `.scratch/export-hardening/`에 둔다. 시간과 RSS는 `/usr/bin/time -l`로 세 번 돌려 가장 큰 값을 쓰고, 기계, Go 버전, 커밋 sha를 함께 적는다. 이 디렉터리는 T14에서 지워지므로 측정값은 C2·C4 커밋 본문에도 적는다.

## 기준과 PoC

- [ ] **T0. 기준 빌드와 입력 생성기**
  - T3를 시작하기 전 커밋에서 `go build -o <tmp>/doan-before ./cli/cmd/doan`. 고친 뒤에는 `go build -o <tmp>/doan ./cli/cmd/doan`.
  - `.scratch/export-hardening/`에 결정적 생성기 하나를 둔다. (a) 한 디렉터리 자산 5,000개 캔버스: 1 KiB 이하 `<img>` 5,000개, 합계 `MaxBytes`(50 MiB) 미만. (b) 24 MiB CSS 하나를 `<link>`하는 캔버스: minify 여부, `url()` 수, 참조 자산 크기를 고정한다. T1·T5·T8·T9가 이 입력을 같이 쓴다.
  - 검증: 생성기를 두 번 돌린 결과의 sha256이 같다.

- [ ] **T1. 메모리 프로파일** (결정 Q5, D)
  - T0 (b) 입력으로 `export.Inline` + `export.Assemble`의 할당 상위를 잰다. 프로파일 테스트는 Go internal 규칙 때문에 `cli/internal/export`에 두고, 환경 변수가 있을 때만 돈다(없으면 `t.Skip`). 이 테스트는 T8과 함께 C4에서 커밋한다. 테스트 안 생성 규칙이 T0 생성기와 같은 바이트를 내는지 sha256으로 확인한다.
  - `<tmp>/doan-before`로 같은 입력의 최대 RSS를 잰다. 기준은 CSS 크기(24 MiB → 목표 240 MiB 이하)이고, 입력 전체 바이트도 적는다.
  - design.md §2에 측정값, 상위 할당 함수, 고칠 곳과 고른 이유를 적는다. 가설(lex token slice와 세 번 lex, `string(b)` 사본, `inliner.files`, `dataURI` 사본, `Assemble` 사본, GC)마다 맞았는지 적는다.
  - 검증: `go test ./cli/internal/export/ -run <프로파일 테스트> -memprofile <tmp>/mem.out`(환경 변수 설정)으로 프로파일을 만들고 `go tool pprof`로 읽는다. 결과가 design.md §2에 있다.

- [ ] **T2. SVG sprite `<style>` PoC** (결정 Q4, A, C)
  - design.md §4 'PoC 측정 방식' 그대로: 규칙마다 다른 불투명 색, 고정 좌표 pixel 읽기(Chromium과 WebKit), 경우마다 페이지 하나(POSTMORTEM 2026-11-03).
  - (1) 앱 구조: local HTTP server + `sandbox="allow-scripts"` iframe, Electron 45 `--user-data-dir=<tmp>`. 측정 스크립트는 새로 쓴다(POSTMORTEM이 가리킨 `.scratch/export-var-url/main.cjs`는 없다).
  - (2a) `:where([data-doan-sprite="N"])` prefix, (2b) `@scope ([data-doan-sprite="N"])`, 각각 root 속성과 `<g data-doan-sprite>` wrapper. (3) sprite 밖 캔버스 요소. (2)(3)은 `Assemble` 결과를 viewer `srcdoc`에서 연다.
  - selector 모양: `path`, `.st0`, `g path`, `#id`, `symbol`과 `g`를 겨냥한 규칙, 두 sprite 파일이 `.st0`에 다른 색을 주는 경우.
  - 같은 `srcdoc`에서 결과에 `<base href>`를 남기면 `<use href="#id">`·`url(#grad)`가 깨지는지 한 번 본다(결정 A).
  - design.md §4에 결과 표와 판정을 적는다: (i) 앱이 외부 sprite `<style>`을 적용하지 않음 → `<style>` 없이 복사, (ii) 적용하고 (2a) 또는 (2b)가 모든 경우 통과 → 범위 좁히기, (iii) 실패가 하나라도 있음 → 비목표(spec Done when의 해당 항목을 Non-goals로 옮기고 T10·T11을 지운다).
  - 검증: `.scratch/export-hardening/`의 측정 스크립트를 node로 실행(Playwright `_electron`과 WebKit). 결과 표가 design.md §4에 있다.

- **커밋 경계 C1**: `docs(feature): export-hardening PoC results` — `docs/features/export-hardening/`만.

## 경로 해석 (결정 Q6·Q7)

- [ ] **T3. 디렉터리 index 순수 함수 (test 먼저)**
  - 이름 목록 → index, index 조회가 지금 `diskSpelling`의 선형 탐색과 같은 후보를 같은 순서로 내는지 표 테스트: 정확한 이름, 대소문자 차이, NFC/NFD 한글, 같은 접은 key의 이름 여럿. 기대값(Go `strings.EqualFold`): `ß`↔`ẞ` 같음, `ß`↔`ss`·`ẞ`↔`SS` 다름, `İ`↔`i`·`I` 다름, `ı`↔`i`·`I` 다름, Kelvin `K`(U+212A)↔`k`·`K` 같음.
  - 검증: `go test ./cli/internal/repo/` — 새 테스트가 구현 전 빨갛고 구현 뒤 초록.

- [ ] **T4. `repo.Resolver`와 호출 교체**
  - `repo.NewResolver(root)`, `repo.NewResolverWith(root, readDir)`, `(*Resolver).Resolve(base, p)`. real root는 처음 필요할 때 구한다(lexical 먼저, POSTMORTEM 2026-11-09). index key는 real 디렉터리 절대 경로. `repo.Resolve`는 wrapper. export의 inline 단계와 check의 `checkInput`이 Resolver를 인자로 받는다.
  - 읽기 횟수 테스트: 한 디렉터리 자산 5,000개를 참조하는 캔버스의 export, 같은 디렉터리 CSS 여러 개를 link하는 캔버스의 check에서 Resolver가 그 디렉터리를 한 번만 읽는다. `repo.Scope`의 일회용 해석은 셈에서 뺀다.
  - Resolver 하나로 기존 `TestResolve` 표를 순서대로, 그리고 거꾸로 풀어 같은 결과를 낸다. 같은 디렉터리 경우를 더한다: 대소문자 alias, 대소문자만 다른 real 파일 둘(대소문자를 가리는 filesystem에서만), NFC/NFD, `TestDiskSpellingDoesNotChooseUnrelatedHardlink` 같은 hardlink, symlink와 그 대상, symlink 디렉터리 alias와 real 디렉터리(index 하나, 읽기 한 번).
  - mutation: 잘못 공유한 cache(lexical 디렉터리 key, 또는 이름 → `State` cache)를 넣으면 scope·symlink 탈출 테스트가 빨개지는지 한 번 확인한다(POSTMORTEM 2026-10-21).
  - 반드시 그대로 통과: `repo_test.go`, `path_audit_test.go`, `inside_relative_test.go`, `scope_test.go`, export·check 테스트. `diskSpelling`의 다른 호출(`inside_relative.go:91`, `find.go:49`, `git.go:101`)은 일회용 경로 그대로다.
  - 검증: `go test ./...`, `go vet ./...`.

- [ ] **T5. 속도 측정**
  - T0 (a) 입력으로 `<tmp>/doan-before export …`와 `<tmp>/doan export …`를 측정 공통 규칙대로 잰다.
  - 검증: 고친 쪽이 2 s 이하다. 넘으면 C2를 push하기 전에 멈추고 보고한다. 측정값을 C2 커밋 본문에 적는다.

- **커밋 경계 C2**: `test(repo): …`, `fix(cli): read each directory once per export and check`(본문에 T5 측정값).

## `<base href>` (결정 Q2, A)

- [ ] **T6. base 판정 순수 함수 (test 먼저)**
  - `firstBaseHref`: `href` 있는 첫 `<base>`, `<template>` 안 무시, 주석 안 `<base>` 무시, `href` 없는 `<base target>` 건너뜀, `<BASE HREF>` 대문자, entity로 쓴 href(푼 값), 본문에서 참조 뒤에 온 `<base>`(센다), inline `<svg>`·`<math>` 안 `<base>`(tokenizer가 세므로 센다 — 필요 이상 거절, 받아들인 한계).
  - `baseMoves`: false — 빈 값, `#x`, `?q`, `.`, `./`, `%2e`(한 개), `x.html`, `./x.html`. true — `..`, `.%2e`, `%2E.`, `%2e%2e`, `".\t."`, `"a\n/"`, `../`, `a/`, `a\b`, `/`, `//cdn.example/`, `https://cdn.example/`, `file:///x/`, `data:,`, `../canvases/`.
  - 결과에서 base `href` 지우기: `href`만 있는 `<base>`는 element째, `href`와 `target`이 있으면 `href`만, `target`만 있으면 그대로, `<template>` 안은 그대로.
  - 검증: `go test ./cli/internal/export/` — 구현 전 빨갛고 뒤 초록.

- [ ] **T7. export가 base에 기대는 참조를 거절하고 결과에서 base를 지운다**
  - `ReasonBase`(`": "` 없음). 캔버스 수준 `<img>`·`<link rel=stylesheet>`·`<script src>`·`<use>`·`<style>` 안 `url()`·`@import`·`style` 속성, 사용처가 캔버스인 custom property `url()`이 거절된다. 아무도 쓰지 않는 캔버스 안 custom property `url()`은 거절되지 않고 쓴 그대로 남는다. CSS 파일 안 참조, 절대 URL, `data:`, fragment, `<a href>`는 영향이 없다.
  - 거절 순서를 고정한다: parse 거절(`doan:width` 없음·중복)이 먼저, 움직이는 base 아래 로컬 iframe은 `ReasonFrame`, 움직이는 base 아래 scope 밖·없는 참조는 `ReasonBase`, 거절 목록은 문서 순서(`TestExportCollectsAllRefusalsInDocumentOrder`), 참조가 없는 캔버스는 base가 있어도 export된다.
  - "지금과 바이트까지 같다"의 비교: 움직이지 않는 base(`./` 등)가 있는 캔버스의 결과를, base 줄을 뺀 같은 캔버스의 결과와 비교한다(golden 파일 없음). `<base target>`만 있는 캔버스는 결과에 그 줄이 남는다.
  - `exporttest/seed.go`에 `RefuseBase` 캔버스를 더하고, `cli/internal/cli/export_test.go`의 refusal 표에 이유 줄을 더한다. 메시지에 절대 경로가 없다.
  - 검증: `go test ./...`.

- **커밋 경계 C3**: `test(export): …`, `fix(export): refuse references that rely on a base element`.

## 메모리 (결정 Q5, D)

- [ ] **T8. T1이 가리킨 곳 고치기**
  - 먼저 고치기 전 결과의 sha256을 넣어 둔 비교 테스트를 둔다(T0 (b) 생성 규칙의 작은 입력 + 기존 export 테스트).
  - lexer를 바꾸면 한 입력 묶음으로 `ScanCSS`, `CSSRefs`, `CustomUses`(그리고 `viewportHeights`를 쓰는 쪽)의 결과를 바꾸기 전과 비교하는 테스트를 더하고, `cli/internal/canvas/css_refs_test.go`의 `TestCSSRefsMatchesScanCSS`가 그대로 통과한다.
  - 회귀 감지 테스트: `runtime.GC()` 뒤 `runtime.ReadMemStats`로 export 전후의 `TotalAlloc` 증가분에 상한을 둔다. `t.Parallel` 없음. 상한은 수정 뒤 측정값에 여유를 둔다. RSS는 T9에서 잰다.
  - 원인을 고친 뒤에도 T9에서 목표에 못 미치면 `GOMEMLIMIT`/`debug.SetMemoryLimit`를 `doan export`에만 보조로 건다.
  - 쓰기 경로를 건드리면 `export_signal_test.go`, `TestExportTemporaryCollisionPreservesOtherWriter`, `TestExportTooLarge*` 순서 테스트가 그대로 통과한다.
  - 검증: `go test ./...`, `go vet ./...`.

- [ ] **T9. RSS 다시 재기**
  - T0 (b) 입력으로 `<tmp>/doan-before`와 `<tmp>/doan`의 최대 RSS를 측정 공통 규칙대로 잰다. 메모리 한도를 썼다면 한도 없는 값과 한도 있는 값을 함께 잰다.
  - 검증: 240 MiB 이하다. 값이 design.md §2와 C4 커밋 본문에 있다.

- **커밋 경계 C4**: `test(export): …`(T1 프로파일 테스트 포함), `fix(export): …`(고친 곳에 맞춘 제목, 본문에 T1·T9 측정값).

## SVG sprite `<style>` (T2 판정이 (i) 또는 (ii)일 때만, 결정 Q4, C)

- [ ] **T10. 순수 함수 (test 먼저)**
  - 공통 — foreign `<style>` 내용 읽기: CDATA, `&gt;` 같은 entity, text가 나뉜 경우, `<style>` 여러 개, element 자식(거절), `<style media>`(거절), `type="text/foo"`(복사본에서 뺀다).
  - (ii)일 때만 — `scopeSpriteStyle`: 단순 selector, selector 목록, 주석과 문자열 안 `{`·`,`, `:is()` 안 쉼표에 범위가 붙는다. 모든 at-rule(`@media`·`@supports`·모르는 at-rule 포함), nesting `&`, `:root`·`html`·`body`·`:host`, 나눌 수 없는 구문은 false(허용 목록). 결과를 CDATA로 쓸 때 `]]>`가 있으면 거절.
  - 검증: `go test ./cli/internal/export/`.

- [ ] **T11. sprite 복사에 적용**
  - (i): 복사본에서 `<style>`을 뺀다. (ii): 표식을 달고 범위를 붙인 `<style>`을 CDATA 하나로 쓴다. 범위를 붙일 수 없으면 지금처럼 `ReasonUseStyle`.
  - 같은 sprite 파일을 두 fragment로 참조하면 복사본과 표식이 하나다. 표식 번호는 문서 순서다. `<style>` 안 `url()`과 custom property `url()`은 선언한 SVG 파일 기준으로 다시 쓴다(ARCHITECTURE §3).
  - `fix2_test.go`의 `<style>` 거절 기대를 새 규칙에 맞게 고친다.
  - 결과 파일을 Chromium과 WebKit에서 열어 T2와 같은 pixel 값을 다시 잰다.
  - 검증: `go test ./...`; 브라우저 확인은 `.scratch/export-hardening/`의 T2 측정 스크립트로 하고 결과를 design.md §4에 적는다.

- **커밋 경계 C5**: `test(export): …`, `feat(export): …`((i)이면 "copy sprites without the style the app ignores", (ii)이면 "include sprites whose style can be scoped").

## 마무리

- [ ] **T12. 전체 gate**
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. 앱 동작은 바뀌지 않으므로 `/runtime-test`는 하지 않는다.

- [ ] **T13. `/agent-eval`** (CLI 메시지에 새 거절 이유가 생긴다)
  - `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios X1 --agents claude,codex --round export-hardening`. X1은 성공한 export만 재므로 성공 경로가 그대로인지 확인하는 용도다.
  - 검증: 두 에이전트 모두 X1 결과가 직전 라운드보다 나빠지지 않고, 라운드가 `docs/USABILITY-EVAL.md`에 기록된다. BACKLOG의 "X1 measures only the successful export" 줄(91행)은 그대로 남는다.

- [ ] **T14. 문서 올리기와 feature 디렉터리 삭제** (문서마다 커밋을 나눈다)
  - `docs/PRODUCT.md` §5 item 3 'Export and viewer': base에 기대는 참조의 거절과 결과에서 base 제거, sprite `<style>` 처리(T2 판정에 따라). frame 안 로컬 문서와 JavaScript 문장은 그대로.
  - `docs/ARCHITECTURE.md` §3 'Exported canvas and viewer': 'The serving scope is the export boundary'의 "through `repo.Resolve`"를 `repo.Resolver`로 고친다. base 판정·거절·제거. 'SVG `<use>`' 항목의 "holds a `<style>`" 규칙을 T2 판정에 맞게 고친다. 'Rewriting'의 `canvas_test.go` 인용을 `cli/internal/canvas/css_refs_test.go`(`TestCSSRefsMatchesScanCSS`)로 고친다. 메모리에서 남길 만한 제약(결과 바이트 고정, 고른 방식, 메모리 한도를 썼다면 그 이유). §12 `doan export`의 거절 목록에 base. §13 'Paths inside the repo': 명령 한 번 동안 real 디렉터리마다 index를 한 번 만드는 snapshot 의미.
  - `docs/BACKLOG.md` 'Known defects': 고친 줄(경로 해석, 메모리, base, sprite `<style>`)을 지운다. sprite가 비목표가 됐으면 그 줄에 PoC 결과를 더한다. frame·JavaScript 줄, custom property 줄, X1 줄은 남긴다.
  - `docs/features/export-hardening/` 삭제.
  - 검증:
    - `grep -n "diskSpelling\|1.36 GB\|ignores \`<base href>\`" docs/BACKLOG.md` → 0줄.
    - `grep -c "SVG sprite that contains a \`<style>\`" docs/BACKLOG.md` → 구현했으면 0, 비목표면 1(PoC 결과 포함).
    - `grep -n "holds a \`<style>\`" docs/ARCHITECTURE.md` → T2 판정과 맞는 문장만 남는다.
    - `grep -n "base" docs/PRODUCT.md docs/ARCHITECTURE.md` → §5 item 3, §3, §12에 base 규칙이 있다.
    - `grep -n "through \`repo.Resolve\`\|canvas_test.go\` pins" docs/ARCHITECTURE.md` → 0줄.
    - `docs/features/export-hardening/`가 없다.
