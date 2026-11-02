# canvas-viewport-units — tasks

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `rewriteViewportUnits`, `rewriteCanvasHtml`, `viewportHeight` (TS, `app/src/main/serve/`).
  - 검증: `npm --prefix app test` green. 주석·문자열·`url()`·`@media` prelude·식별자를 건너뛰는 경우와 `calc(100dvh - 128px)`, `min(55dvh, 576px)`, `style="height:100vh"`, `<head>` 없는 문서를 덮는다.
- [ ] T1b. `nextHeight`의 폰트 로드 신호(design.md '폰트 적용 뒤 높이'). measure → send → resize → measure 고정점을 대체 폰트 높이 → 폰트 적용 높이 순서로 돌리는 테스트와, 바꿔 쓰기가 닿지 않는 `min-height: 100vh` 문서가 여전히 멈추는 테스트를 더한다.
  - 검증: `npm --prefix app test` green (`canvasScript.test.ts`).
- [ ] T2. Go: `doan:viewport-height` 메타 읽기와 `invalid_viewport_height` 경고.
  - 검증: `go test ./...`, `go vet ./...` 통과.

── commit: `feat(serve): viewport unit rewriting rules` / `feat(check): warn on an invalid doan:viewport-height` ──

## S. 셸

- [ ] T3. `serve/server.ts`에서 HTML·CSS 응답에 적용한다. 그 전에 ARCHITECTURE §3 'Serving'의 "그대로 내보낸다" 결정, 캐시·조건부 요청, 캔버스 CSP와 인라인 `<style>`을 확인하고, 결정을 바꾸게 되면 design.md에 적는다.
  - 검증: `npm --prefix app test` green (`server.test.ts`에 응답 본문과 `Content-Length` 케이스).
- [ ] T4. 가이드(`cli/internal/cli/skill.md`)에 design.md 'skills'의 두 줄.
  - 검증: `go test ./...` 통과.
- [ ] T4b. (T3이 막힐 때만) design.md '대체 경로': 가이드 문구 교체와 `viewport_height_unit` 경고. T1의 TS 바꿔 쓰기와 T3은 되돌린다.
  - 검증: `go test ./...` 통과, `buzz-project-settings` 복사본에서 `go run ./cli/cmd/doan check --repo <tmp>`가 경고를 낸다.

── commit: `feat(serve): resolve viewport units against doan:viewport-height` / `docs(skill): doan:viewport-height` ──

## R. 확인

- [ ] T5. `/runtime-test`: `buzz-project-settings`에서 두 우회(dvh 규칙, 폰트 게이트)를 뺀 복사본, 폰트 응답을 400ms 늦춘 픽스처, `calc(100vh + 200px)` 픽스처, 메타 1200 픽스처를 실제 앱에서 열어 잘림·스크롤·높이 고정 여부를 본다. Overview 썸네일도 본다.
  - 검증: runtime-test 스크린샷과 iframe `style.height`·문서 `scrollHeight` 측정값.
- [ ] T6. `/agent-eval`(가이드와 check 규칙 변경).
  - 검증: `node eval/run.ts --self-test` `self-test PASS`, 실제 라운드 결과를 `docs/USABILITY-EVAL.md`에 기록.
- [ ] T7. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## Z. 정리

- [ ] Z1. ARCHITECTURE §1(메타·check 규칙 표)·§3(바꿔 쓰기, 알려진 한계에서 `calc(100vh + N)` 제거, `innerHeight`·높이 미디어 쿼리 한계 추가), PRODUCT §5 item 2 'Canvas view'에 필요한 한 줄, BACKLOG(`doan:width`를 넘는 가로 넘침)를 고친다. `buzz-project-settings`의 두 우회(dvh 규칙, 폰트 게이트)와 주석을 지운다(그 캔버스가 커밋된 뒤). `docs/features/canvas-viewport-units/`를 지운다.
  - 검증: `grep -n "calc(100vh + N)" docs/ARCHITECTURE.md` 결과 없음, `go run ./cli/cmd/doan check --repo .` 오류 없음.

── commit: `docs(architecture): viewport units in canvases` / `docs(product): …` / `docs(backlog): …` / `docs(design): drop the dvh workaround` / `docs(feature): remove canvas-viewport-units` ──
