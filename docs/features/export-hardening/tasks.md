# export-hardening — tasks

순서: PoC → 순수 함수 → shell(I/O) → 문서 올리기. 앱 UI 변경은 없다. spec '결정'의 Q1–Q7을 따른 순서다.

## PoC

- [ ] **T1. 메모리 프로파일** (결정 Q5)
  - 테스트 안에서 24 MiB CSS 하나를 `<link>`하는 캔버스를 만들고(minify한 것과 아닌 것 두 가지, `url()` 수 기록) `export.Inline` + `export.Assemble`의 할당 상위를 잰다. 빌드한 CLI로 같은 입력의 최대 RSS도 잰다.
  - design.md §2에 측정값, 상위 할당 함수, 고칠 곳과 고른 이유를 적는다. 가설(lex token slice, `string(b)` 사본, `dataURI` 사본, `Assemble` 사본)마다 맞았는지 적는다.
  - 검증: `go test ./cli/internal/export/ -run <프로파일 테스트> -memprofile <tmp>/mem.out`(AGENTS.md 'Commands'의 `go test`에 플래그를 더한 것)으로 프로파일을 만든다. 프로파일을 읽는 `go tool pprof`와 RSS를 재는 `/usr/bin/time -l <tmp>/doan export …`(CLI는 `go build -o <tmp>/doan ./cli/cmd/doan`)는 'Commands'에 없지만 PoC·측정 task에만 쓰도록 허용됐다. 프로파일 파일과 측정 스크립트는 `.scratch/export-hardening/`에 두고, 결과는 design.md §2에 적는다.

- [ ] **T2. SVG sprite `<style>` PoC** (결정 Q4)
  - 경우마다 페이지 하나씩(POSTMORTEM 2026-11-03): (1) 앱처럼 외부 `file.svg#id`를 `<use>`, (2) 숨긴 같은 문서 sprite + `:where([data-doan-sprite="N"])`로 좁힌 규칙 + `<use href="#id">`, (3) (2)에서 sprite 밖 캔버스 요소. Electron 45 Chromium과 Playwright WebKit에서 복사본과 캔버스 요소의 computed `fill`·`stroke`·`opacity`를 비교한다.
  - design.md §4에 결과와 판정(구현 / 비목표)을 적는다. 비목표면 spec Done when의 해당 항목을 Non-goals로 옮기고 T10·T11을 지운다.
  - 검증: `.scratch/export-hardening/` 아래 측정 스크립트를 node로 실행(Playwright `_electron`과 WebKit). 'Commands'에 없지만 PoC·측정 task에만 쓰도록 허용됐다. 스크립트는 `.scratch/`에 두고 결과 표를 design.md §4에 적는다.

- **커밋 경계 C1**: `docs(feature): export-hardening PoC results` — `docs/features/export-hardening/`만.

## 경로 해석 (결정 Q6·Q7)

- [ ] **T3. 디렉터리 index 순수 함수 (test 먼저)**
  - 이름 목록 → index, index 조회가 지금 `diskSpelling`의 선형 탐색과 같은 후보를 같은 순서로 내는지 표 테스트: 정확한 이름, 대소문자 차이, NFC/NFD 한글, Kelvin 기호 K, `ß`, `İ`·`ı`, 같은 접은 key의 이름 여럿.
  - 검증: `go test ./cli/internal/repo/` — 새 테스트가 구현 전 빨갛고 구현 뒤 초록.

- [ ] **T4. `repo.Resolver`와 호출 교체**
  - `NewResolver`·`(*Resolver).Resolve`, `repo.Resolve`는 wrapper로. export의 inliner와 check의 `checkInput`이 Resolver 하나를 공유한다.
  - 디렉터리 읽기 횟수를 세는 테스트: 한 디렉터리 자산 5,000개를 참조하는 캔버스의 export와 같은 디렉터리 CSS 여러 개를 link하는 캔버스의 check가 그 디렉터리를 한 번만 읽는다.
  - 기존 `repo_test.go`, `path_audit_test.go`, `scope_test.go`, export·check 테스트가 그대로 통과한다. scope 밖·symlink 탈출 테스트는 cache를 우회한 잘못된 구현에서 빨개지는지 한 번 확인한다(POSTMORTEM 2026-10-21).
  - 검증: `go test ./...`, `go vet ./...`.

- [ ] **T5. 속도 측정**
  - 임시 repo에 한 디렉터리 자산 5,000개 캔버스를 만들고 `go run ./cli/cmd/doan export <canvas> -o <tmp>/out.html --repo <tmp repo>`의 걸린 시간을 재서 이 task에 적는다. 목표 2 s 이하(결정 Q7). 비교용으로 고치기 전 커밋에서도 같은 명령을 잰다.
  - 검증: 측정값이 이 줄에 기록되어 있다.

- **커밋 경계 C2**: `test(repo): …`, `fix(cli): read each directory once per export and check`.

## `<base href>` (결정 Q2)

- [ ] **T6. base 판정 순수 함수 (test 먼저)**
  - `firstBaseHref`: `href` 있는 첫 `<base>`, `<template>` 안 무시, `href` 없는 `<base target>` 건너뜀, 앞뒤 공백 자르기.
  - `baseMoves`: false — 빈 값, `#x`, `?q`, `.`, `./`, `x.html`, `./x.html`. true — `..`, `%2e%2e`, `../`, `a/`, `a\b`, `/`, `https://cdn.example/`, `file:///x/`, `data:,`, `../canvases/`.
  - 검증: `go test ./cli/internal/export/` — 구현 전 빨갛고 뒤 초록.

- [ ] **T7. export가 base에 기대는 참조를 거절**
  - `ReasonBase`(`": "` 없음). 캔버스 수준 `<img>`·`<link rel=stylesheet>`·`<script src>`·`<use>`·`<style>` 안 `url()`·`@import`·`style` 속성, 그리고 사용처가 캔버스인 custom property `url()`이 거절된다. CSS 파일 안 참조, 절대 URL, `data:`, fragment, `<a href>`는 영향이 없다. base가 폴더를 바꾸지 않는 캔버스의 결과는 지금과 바이트까지 같다.
  - `exporttest/seed.go`에 `RefuseBase` 캔버스를 더하고, `cli/internal/cli/export_test.go`의 refusal 표에 이유 줄을 더한다. 메시지에 절대 경로가 없다.
  - 검증: `go test ./...`.

- **커밋 경계 C3**: `test(export): …`, `fix(export): refuse references that rely on a base element`.

## 메모리 (결정 Q5)

- [ ] **T8. T1이 가리킨 곳 고치기**
  - 고치기 전 결과를 기준으로 결과 HTML이 바이트까지 같은지 비교하는 테스트를 먼저 둔다(기존 export 테스트 + 큰 CSS 입력 하나).
  - 생성한 큰 CSS(테스트 시간 안에 드는 크기, 예: 8 MiB) export의 `runtime.MemStats.TotalAlloc` 증가분에 상한을 두는 테스트. 상한은 수정 뒤 측정값에 여유를 둔다.
  - lexer를 바꾸면 `canvas_test.go`의 `ScanCSS`·`CSSRefs` 일치 고정이 그대로 통과한다.
  - 검증: `go test ./...`, `go vet ./...`.

- [ ] **T9. RSS 다시 재기**
  - T1과 같은 입력으로 최대 RSS를 재서 입력 × 10 이하인지 확인하고 design.md §2에 적는다.
  - 검증: `/usr/bin/time -l <tmp>/doan export …`(측정 task에만 허용, 입력은 `.scratch/export-hardening/`). 측정값이 design.md §2에 있다.

- **커밋 경계 C4**: `test(export): …`, `fix(export): …`(고친 곳에 맞춘 제목).

## SVG sprite `<style>` (T2 판정이 구현일 때만, 결정 Q4)

- [ ] **T10. `scopeSpriteStyle` 순수 함수 (test 먼저)**
  - 단순 selector, selector 목록, `@media`·`@supports` 안 규칙, 주석과 문자열 안 `{`·`,`, `:is()` 안 쉼표에 prefix가 붙는다. `@import`·`@font-face`·`@keyframes`·`@property`·`@counter-style`·`@layer`, `:root`·`html`·`body`·`:host`, 나눌 수 없는 구문은 false.
  - 검증: `go test ./cli/internal/export/`.

- [ ] **T11. sprite 복사에 적용**
  - sprite root에 표식 속성을 달고, 좁힌 `<style>`의 `url()`을 SVG 파일 폴더 기준으로 다시 쓴다. false면 지금처럼 `ReasonUseStyle`. `fix2_test.go`의 `<style>` 거절 기대를 새 규칙에 맞게 고친다(지원하는 style은 export, 지원하지 않는 style은 거절).
  - 결과 파일을 Chromium과 WebKit에서 열어 T2와 같은 값을 다시 잰다.
  - 검증: `go test ./...`; 브라우저 확인은 `.scratch/export-hardening/`의 T2 측정 스크립트(측정에만 허용)로 하고 결과를 design.md §4에 적는다.

- **커밋 경계 C5**: `test(export): …`, `feat(export): include sprites whose style can be scoped`.

## 마무리

- [ ] **T12. 전체 gate**
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. 앱 동작은 바뀌지 않으므로 `/runtime-test`는 하지 않는다.

- [ ] **T13. `/agent-eval`** (CLI 메시지에 새 거절 이유가 생긴다)
  - `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios X1 --agents claude,codex`. X1은 성공한 export만 재므로(BACKLOG) 성공 경로가 그대로인지 확인하는 용도다.
  - 검증: 라운드 결과가 `docs/USABILITY-EVAL.md`에 기록된다.

- [ ] **T14. 문서 올리기와 feature 디렉터리 삭제** (문서마다 커밋을 나눈다)
  - `docs/PRODUCT.md` §5 item 3 'Export and viewer': base에 기대는 참조의 거절, (구현했다면) 범위를 좁힐 수 있는 sprite `<style>` 포함. frame 안 로컬 문서와 JavaScript 문장은 그대로.
  - `docs/ARCHITECTURE.md` §3 'Exported canvas and viewer': base 판정과 거절, 'SVG `<use>`' 항목의 `<style>` 규칙, 메모리에서 남길 만한 제약(결과 바이트 고정, 고른 방식의 이유). §12 `doan export`의 거절 목록에 base. §13 'Paths inside the repo': 명령 한 번 동안 디렉터리 index를 한 번 만드는 snapshot 의미.
  - `docs/BACKLOG.md` 'Known defects': 고친 줄(경로 해석, 메모리, base, sprite `<style>`)을 지운다. sprite가 비목표가 됐으면 그 줄에 PoC 결과를 더한다. frame·JavaScript 줄과 custom property 줄은 남긴다.
  - `docs/features/export-hardening/` 삭제.
  - 검증: `rg -n "diskSpelling|base href|1.36 GB" docs/BACKLOG.md`가 고친 항목을 찾지 못한다; `docs/features/export-hardening/`가 없다.
