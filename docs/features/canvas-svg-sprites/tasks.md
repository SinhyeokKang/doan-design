# canvas-svg-sprites — 작업

## 작업 순서

- [ ] 1. **PoC: SVG `<use>`** (design.md 'PoC 의존' 1~3). `.scratch/canvas-svg-sprites/`에 임시 repo를 만들고 경우마다 캔버스를 하나씩 둔다. 캔버스 경로는 임시 repo 기준이다.
  - 외부 `<use>`: 로컬 `href`, `xlink:href`, CDN, `data:`.
  - 인라인 스프라이트: `<style>` 포함.
  - 대체 후보: 아이콘별 SVG의 `<img src>`, CSS `mask: url(icon.svg)`, 링크한 CSS의 `mask: url(sprite.svg#icon)`, `<img src="sprite.svg#icon">`.
  - 판정: "보인다"는 스크린숏과 대상 요소의 computed bbox로, "서버 요청"은 serve 로그나 요청 listener로 정한다.
  - 같은 캔버스를 export해 Chromium에서 연다. Safari 확인은 사용자가 export 파일을 Safari에서 직접 열고 스크린숏을 남긴다(자동화 도구는 들이지 않는다).
  - 검증: `go build -o <tmp>/doan ./cli/cmd/doan` 후 `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<tmp>`(AGENTS.md의 HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME` 격리 적용), `go run ./cli/cmd/doan export <canvas> -o <tmp>/out.html --repo <tmp repo> --json`.
  - 관찰은 아래 'PoC 기록'에 날짜와 함께 남긴다. 결과가 design.md 가정과 다르면 작업 3 전에 설계를 고친다.
- [ ] 2. **PoC: custom property `url()`** (design.md 'PoC 의존' 4). 레이아웃마다 페이지 하나로, 두 폴더의 사용처가 서로 다른 경로로 푸는 경우, 같은 경로로 푸는 경우, `@property` `<url>` 등록 경우를 격리 앱에서 확인한다. 같은 경로로 푸는 경우는 export 결과도 기록한다. 검증: 작업 1과 같은 격리 앱 명령과 export 명령. 같은 경로로 풀리는 경우가 순서에 따라 달라지면 warning 조건을 "사용 폴더 둘 이상"으로 바꿀지 사용자에게 묻는다.
- [ ] 3. **`/tdd`: 판정 함수, check 규칙, export 기대값.**
  - 순수 함수: `<use>` 비조각 판별, custom property 사용 경로 계산과 모호성 판정(`cli/internal/canvas`).
  - `check_test.go`: 두 규칙의 code·수준·attribution·메시지(design.md 'finding'), CDN `<use>`에 `external_url`이 없음.
  - `<use>` 경우: `xlink:href`(xlink 네임스페이스), `data:`, `http(s):`, `//cdn`, 앞뒤 공백, 빈 값, `<svg>` 밖 HTML 네임스페이스 `<use>`(무시), `href="#missing"`(보고 안 함), 두 속성이 다 있으면 `href` 우선, 빈 캔버스, `<svg>` 없는 캔버스, `<template>` 안 `<use>`, `<template/>` 최상위·중첩.
  - custom property 경우: `.doan/` 밖 `tokenCss`를 `.doan/ds/`와 캔버스 `<style>`이 쓰는 경우, 연쇄와 순환(`--a: var(--b)`, `--b: var(--a)`), `@property`의 `<url>`·`*` 문법, 절대 경로·`data:`·http `url()` 제외, `@import`로 닿은 시트, `style` 속성 사용, `.doan/canvases/`·`.doan/ds/`가 같은 경로로 푸는 경우(보고 안 함), POSTMORTEM 2026-11-03의 디자인 시스템 패턴(사용 폴더 하나, 경고 없음).
  - export 기대값: `exporttest/seed.go:95` `Full` 캔버스의 `<use>`를 인라인 스프라이트로 바꾸고, 거부 전용 seed(예: `RefuseUseExternal`)를 더한다. `sprite_test.go`와 `fix2_test.go`(53–101)의 `ReasonUse*` 기대값을 지우거나 바꾸고, `fix2_test.go:99`의 `": "` 가드를 새 사유로 옮긴다. `ReasonAmbiguous` 문구 변경과 "후보 하나만 존재해도 거부"를 기대값에 넣는다.
  - check·export 일치 테스트: seed repo에서 실제 `checkInput`→`check.Run`과 `export`를 돌린다. 경우: 서빙 범위 밖 시트, `<template>` 안 `<link>`, 같은 폴더 `<base>`(check reach ⊇ export reach를 고정).
  - 컴파일: 새 함수·필드·사유가 없으면 `canvas`, `check`, `export` 패키지 테스트가 컴파일되지 않는다. 빈 stub(항상 "없음"을 돌려주는 함수, 빈 `check.Input` 필드, 사유 상수)을 함께 넣어 컴파일되게 한다.
  - 검증: `go test ./...`에서 새 테스트만 red이고, 나머지 테스트는 green. **테스트 커밋 경계**.
- [ ] 4. **`/implement`: check와 export.**
  - 판정 함수와 두 check 규칙. `check.Input`에 시트별 `CustomUses`·`CSSRefs` 필드를 더하고(`canvas.Scan`은 그대로, `css_golden_test.go` 유지), `cli/internal/cli/check.go` `checkInput`의 `visit`와 `canvas.Parse`(캔버스 `<style>`·`style` 속성)에서 채운다.
  - export: 조각이 아닌 `<use>`를 `resolveAsset` 전에 새 사유로 거부, 스프라이트 복사 제거, `replaceCustom` 조건을 판정 함수로 바꾸고 `ReasonAmbiguous` 문구를 "resolves to different paths…"로 바꾼다.
  - 고아 정리: `sprite`·`spriteContent`·`spriteContainer`·`spriteIDs`·`spriteStyled`, `ReasonUseFragment`·`ReasonUseID`·`ReasonUseCollision`·`ReasonUseType`·`ReasonUseStyle`, 스프라이트에만 쓰이면 `documentIDs`, `datauri.go:59` `fragment`, `replaceCustom`·`uses`의 "one candidate that exists" 주석.
  - 검증: `go test ./...`, `go vet ./...`, `node .agents/skills/verify/scripts/verify.mjs`. 이 repo를 임시 디렉터리에 복사해 `go run ./cli/cmd/doan check --repo <tmp copy> --json`을 돌리고 새 finding이 0개인지 확인한다. **구현 커밋 경계**.
- [ ] 5. **가이드와 preset.**
  - `cli/internal/cli/skill.md`: 아이콘이 스프라이트 파일에만 있으면 필요한 `<symbol>`을 캔버스에 인라인으로 복사하고 `<use href="#id">`로 그리며 원본 파일을 주석으로 남긴다. 스프라이트의 `<style>`은 캔버스 전체에 걸린다. custom property `url()`은 한 폴더의 스타일시트에서만 쓰거나 `@property` `<url>`로 등록한다. `ambiguous_custom_url`이 남으면 export가 거부된다. 관례 9("External resources are allowed; `doan check` reports them as warnings.")에 `<use>` 외부 URL은 error라는 예외를 넣는다. 작업 1에서 확인된 대체 형태만 쓴다.
  - 가이드 예산: `skill.md`는 18,640 B이고 `skillOutputBudget`은 envelope와 bundleNote를 포함해 21,600 B다. 문장을 짧게 넣는다.
  - `cli/internal/designskill/presets/document.md`의 아이콘 문장("Draw an icon from the project's icon source (package, SVG file, sprite, …)")에 스프라이트는 필요한 `<symbol>`만 인라인으로 복사한다는 내용을 더한다.
  - 검증: `go test ./...`(`TestSkillGuideFitsToolOutputCap`, designskill 테스트 포함), `go run ./cli/cmd/doan skill --repo <tmp> --json` 출력에서 문장 확인. **가이드 커밋 경계**.
- [ ] 6. **`/code-review` → `/refactor` → `/agent-eval`.**
  - 시나리오: `eval/scenarios/`에 하나를 추가한다. seed에 `.doan/assets/`의 외부 스프라이트 파일과, 두 폴더의 스타일시트가 같은 custom property `url()`을 쓰는 형태를 두고, 아이콘이 있는 화면을 그리게 한다. 통과 조건: 아이콘을 인라인 `<use href="#id">`로 그리고, `doan check`에 `svg_use_not_inline`·`ambiguous_custom_url`이 남지 않는다. pass·fail fixture를 두고, 실패 조건을 `checks.test.ts`에 하나씩 따로 고정한다(W5 방식). id는 기존 이름 규칙에 맞춰 구현 때 정한다.
  - 검증: `node eval/run.ts --self-test`(전체)가 `self-test PASS`와 exit 0, `node --test 'eval/**/*.test.ts'` green, `node .agents/skills/verify/scripts/verify.mjs --eval`. 그다음 `npm --prefix app run package` 후 `node eval/run.ts --round <name>`(가이드가 바뀌므로 전체 시나리오).
  - 결과(두 에이전트의 pass/fail, 새 이슈)를 `docs/USABILITY-EVAL.md`에 기록한다. 시나리오와 USABILITY-EVAL은 커밋을 나눈다. **시나리오 커밋 경계**, **USABILITY-EVAL 커밋 경계**.
  - 앱 코드는 바뀌지 않으므로 `/runtime-test`는 하지 않는다. 작업 1의 격리 앱으로 인라인 스프라이트 캔버스와 export 파일을 한 번 더 비교한다.
- [ ] 7. **승격과 정리.** 영문으로 현재 규칙을 쓴다.
  - PRODUCT §5 item 3 'Export and viewer': 복사 목록에서 'SVG sprites'를 빼고, 스프라이트 `<style>` 거부 문장을 비조각 `<use>` 거부로 바꾸고, custom property 거부 조건을 고친다.
  - PRODUCT §5 item 11: check 목록에 두 규칙과 "external URLs are warnings, except a `<use>` external URL, which the app cannot draw: error"를 넣는다. §3 Out of scope 2 문장은 그대로 둔다.
  - ARCHITECTURE §1: 관례 한 줄, 관례 9 예외, check 규칙 표 두 줄. §3: 'SVG `<use>`'와 'Custom property `url()`s resolve from their user'(현재 문장 "custom properties inside sprite copies keep the declaring file as base" 삭제 포함). §12 export 거부 목록(855행 근처)에 비조각 `<use>` 항목.
  - PoC 관찰은 커밋 메시지에 넣고, 누군가 되돌릴 만한 제약만 문서에 문장으로 남긴다.
  - `docs/BACKLOG.md` 'Known defects': 결함 1·2는 지운다. 결함 3은 "custom property users are counted by name only, so a rule that never applies still raises the warning and export refusal"로 바꿔 남긴다.
  - 그다음 `docs/features/canvas-svg-sprites/`를 삭제한다.
  - 검증: spec.md 완료 조건 1~7을 코드·테스트·PoC 기록과 대조한다. `git diff --stat origin/develop -- app/`가 비어 있다. `rg -n 'ReasonUseStyle|SVG sprites' cli docs`에 남은 것이 없다. **문서별 커밋 경계**.

## PoC 기록

(작업 1·2에서 채운다.)
