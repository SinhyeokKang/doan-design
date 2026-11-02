# canvas-viewport-units — tasks

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. Go: `ScanCSS`의 `ViewportHeights`와 `check`의 `viewport_height_unit`(design.md '`viewport_height_unit`').
  - 케이스: `100vh`·`100dvh`·`100svh`·`100lvh`·`100vb`·`100dvb`, `100VH`, `.5vh`, `-10vh`, `1e2vh`, `calc(100dvh - 128px)`, `min(55dvh, 576px)`, `--h: 100vh`, `style="height:100vh"` 속성. 경고하지 않는 것: 주석 안 `55dvh`, 문자열·`url()` 안, `@media (min-height: 50vh)` prelude, `--foo-vh`·`.vh-wrap` 식별자, `100vmax`·`100vmin`, `100vw`, `100vhx`. 공유 스타일시트는 파일·값마다 한 번이고 `Canvas`가 비어 있다. `tokenCss` 파일 안의 값도 경고한다.
  - 검증: `go test ./...`, `go vet ./...` 통과.
- [ ] T2. TS: `nextHeight`의 `fonts` 입력(design.md '폰트 적용 뒤 높이').
  - 케이스: 대체 폰트 높이 → 폰트 적용 높이 순서의 고정점 루프(150과 0에서 시작, 여러 라운드), 측정이 `loadingdone`보다 먼저 와서 고정된 뒤 풀리는 순서, `loadingdone` 두 번 + `min-height: 100vh` 문서(이벤트마다 한 번 커지고 다시 고정), 폰트가 주입 전에 로드된 경우(이벤트 없음, 지금 동작 그대로), absolute 프레임만 있는 문서에 폰트 신호.
  - 검증: `npm --prefix app test` green (`canvasScript.test.ts`).

── commit: `feat(check): warn on viewport height units` / `fix(canvas): accept height growth after fonts load` ──

## S. 셸

- [ ] T3. 주입 스크립트의 `loadingdone` 카운터와 `schedule()` 호출. 가이드(`cli/internal/cli/skill.md`)에 design.md '가이드'의 한 줄.
  - 검증: `npm --prefix app test` green. `go build -o <tmp>/doan ./cli/cmd/doan && <tmp>/doan skill` 출력에 `viewport_height_unit`이 있다.

── commit: `fix(canvas): unfreeze the board height when fonts load` / `docs(skill): viewport height units` ──

## R. 확인

- [ ] T4. `/runtime-test`(새 userData): 아래 캔버스를 실제 앱에서 열고 보드 iframe `style.height`, 문서 `scrollHeight`, 마지막 프레임 bottom을 잰다.
  - 폰트 응답을 400ms 늦춘 픽스처(폰트 게이트 없음): iframe 높이가 폰트 적용 뒤 문서 높이와 같다. 자라는 동안 보이는 내용 위치가 바뀌지 않는다.
  - `min-height: 100vh` 픽스처: 지금처럼 높이가 고정되고 커지기를 멈춘다.
  - `buzz-project-settings`의 Z1 수정본(dvh를 px로, 두 우회 제거): 마지막 프레임까지 보이고 iframe 안 문서 스크롤이 없다.
  - 검증: runtime-test 스크린샷과 세 측정값.
- [ ] T5. `/agent-eval`(가이드와 check 규칙 변경). 새 시나리오는 두지 않는다.
  - 검증: `node eval/run.ts --self-test`가 `self-test PASS`, exit 0. `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios W1,W2 --round canvas-viewport-units` 결과를 `docs/USABILITY-EVAL.md`에 기록한다.
- [ ] T6. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

── commit: `docs(usability-eval): canvas-viewport-units round` ──

## Z. 정리

- [ ] Z1. 문서와 캔버스를 현재 상태로 고친다.
  - ARCHITECTURE §1 `doan check` 규칙 표에 `viewport_height_unit`. §3 Height에 폰트 로드 뒤 고정을 푸는 규칙, 알려진 한계 `calc(100vh + N)`에 "`viewport_height_unit`이 경고한다"를 덧붙이고 `innerHeight`·높이 미디어 쿼리·`vmin`/`vmax` 한계를 적는다.
  - BACKLOG에 `doan:width`를 넘는 가로 넘침을 남긴다.
  - `buzz-project-settings`: 목록의 `height`·`min-height`에 있는 dvh 값을 900px 창 기준 px로 바꾸고, 주석 "The shipped dialog caps its height at 100dvh…"와 그 아래 `.doan-dialog[open]{max-height:none}`, 1행의 `<style id="font-gate">`와 그 해제 스크립트를 지운다.
  - `docs/features/canvas-viewport-units/`를 지운다.
  - 검증: `go run ./cli/cmd/doan check --repo . --json`에 `viewport_height_unit`이 없다. `grep -c "font-gate\|max-height:none" .doan/canvases/buzz-project-settings.html`이 0이다.

── commit: `docs(architecture): viewport height warning and font height rule` / `docs(backlog): horizontal overflow past doan:width` / `chore(canvas): drop buzz-project-settings height workarounds` / `docs(feature): remove canvas-viewport-units` ──
