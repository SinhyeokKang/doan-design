# export-viewer-chrome — tasks

순서: UI 초안 → 순수 함수 → viewer 셸(마크업·CSS·이벤트) → 브라우저 확인 → 문서 승격.

## U. UI 초안

- [ ] U0. `/design-draft`로 새 초안 `.doan/canvases/export-viewer-chrome.html`을 그린다: 내보낸 파일의 content panel과 툴바(Select 눌림, Hand 눌림, 끄는 중), 960px 창. 기존 `canvas-row-menu.html`의 `viewer-shell` 프레임은 고치지 않는다. 사람이 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 base와 같은 finding만 낸다, 사람의 확인.

── commit: `docs(design): draft export-viewer-chrome` ──

## A. 순수 함수 (`lib.js`)

- [ ] A1. `toolShortcut`·`escapeStep` 복사, `panScroll`, 도구를 받는 `wheelAction`, `layerShown`, `toolbarMove`, `parseMessage`의 `key`.
  - 검증: `npm --prefix app test` — `exportViewer.test.ts`에 새 테스트 먼저 red, 구현 뒤 green(`canvasTool.ts`와 텍스트 골든, `viewport.ts`의 `panBy`·`wheelAction`과 값 비교, 잘못된 `key` 메시지 거부). `lib.js` DOM 금지 규칙 통과.

── commit: `feat: add Hand tool rules to the export viewer` ──

## B. viewer 셸

- [ ] B1. `shell.html`·`shell.css`: content panel, 툴바 마크업과 inline SVG 아이콘, drag layer.
  - 검증: `npm --prefix app test`(파일 규칙: `https?:`·`url(`·`@import` 없음, placeholder 수, CSS 값이 앱 토큰과 같음), `go test ./...`(`assemble_test.go`).
- [ ] B2. `shell.js`·`measure.js`: 도구 상태, layer 끌기, Space, V/H/Esc(부모 포커스와 iframe `key` 메시지), Hand의 일반 휠, 툴바 ←/→와 tooltip.
  - 검증: `npm --prefix app test`(message listener 하나, `textContent`만), `go test ./...`, `go vet ./...`.

── commit: `feat: give the export viewer the canvas panel and the Hand tool` ──

## C. 확인

- [ ] C1. 브라우저 확인: 실제 내보낸 파일 하나를 Playwright Chromium·WebKit으로 열어 panel 값, 툴바, Hand 끌기, Space 끌기(캔버스 안 포커스 포함), V/H/Esc, Hand의 휠 이동, Fit이 툴바를 가리지 않음을 확인한다. 실제 Safari는 열 수 있으면 확인하고, 아니면 미확인으로 적는다. 늘어난 viewer 바이트를 적는다.
  - 검증: 명령 미정 — `.scratch` probe(Playwright로 `doan export` 결과 열기). 스크린샷과 결과를 이 파일에 적는다.
- [ ] C2. `/design-sync`에 준하는 측정: viewer는 앱 화면이 아니므로 초안과 내보낸 파일을 같은 Playwright 브라우저에서 computed style로 비교하고 DESIGN.md 'Canvas row menu and export viewer'에 적는다.
  - 검증: 측정값이 초안과 일치(차이는 DESIGN.md에 이유와 함께).
- [ ] C3. `node eval/run.ts --self-test --scenarios X1`(X1은 viewer 바이트를 고정하지 않지만 출력 형식 확인), `node .agents/skills/verify/scripts/verify.mjs --eval`.
  - 검증: `self-test PASS`와 exit 0, verify exit 0.

`/agent-eval` 실제 라운드는 생략한다. guide·CLI 명령·응답·`doan check` 규칙이 바뀌지 않고, X1은 같은 CLI로 다시 내보낸 바이트를 비교하므로 viewer 변경과 무관하다. 출력 파일 내용은 바뀌므로 self-test로 확인한다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT §5 item 3 'Export and viewer': Select·Hand 도구, Space, V/H/Esc, panel.
  - ARCHITECTURE §3 'Exported canvas and viewer': 넘기는 키(Space, V, H), drag layer, 복사본 목록에 `canvasTool.ts`.
  - DESIGN.md: C2 측정값, Viewer header·board 행 갱신.
  - 그리고 `docs/features/export-viewer-chrome/`를 지운다.
  - 검증: `grep -n 'no selection, tools' docs/PRODUCT.md`에 줄이 없다, `grep -n 'key forwarding' docs/ARCHITECTURE.md`가 새 규칙을 보인다, `docs/features/export-viewer-chrome/`가 없다.

── commit: `docs(product): Hand tool in the export viewer` / `docs(architecture): export viewer key forwarding` / `docs(design): measure the export viewer panel and tools` / `docs(feature): remove export-viewer-chrome docs` ──
