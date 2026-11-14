# canvas-mark-accent — orch

- 원천: [spec](spec.md) · [design](design.md) · [tasks](tasks.md). 체인 `chain-261114-2` 링크 4.
- 시작 해시: `2e74bf489`(develop, 링크 2 #201 병합 뒤). 통합 브랜치: `feat/canvas-mark-accent`.
- 초안 `.doan/canvases/canvas-mark-accent.html`은 사용자가 확정했고, 이 링크가 병합될 때까지 오버레이의 기준이다.
- 함께 도는 링크 3(canvas-edit-awareness, #200)은 CLI·스키마·main·eval만 고친다. 링크 3이 먼저 병합한다.

## 모델 경계

- 체인 파일 '상시 권한'이 링크 4에 Codex 워커를 허가했다.
- 2026-11-15 시작 시 Codex 주간 사용량: 46 % 사용(Orca `CODEX_HOME` 최신 rollout, `window_minutes: 10080`).
- 범위: 구현과 측정·probe 배치는 Claude, 독립 `/code-review`는 Codex `gpt-6-astra` medium. 그 밖의 Codex 사용은 이 표에 적는다.

## 결정 기록

- 컨덕터 판단 — design.md가 모든 동작을 정했고 사용자가 초안과 `/feature-review` 결과를 확정해서, 시작 전에 물을 결정이 없다.
- 컨덕터 판단 — design.md 인용을 develop(`2e74bf489`)과 대조했다. `styles.css:82-83`, `456-457`, `SIZE_BUBBLE.gap`(159행), `ds/controls.css` 97·112행은 그대로다. Pick의 프레임 밖 거절은 `CanvasController.ts` 1320–1322행, Esc 처리는 1356–1363행으로 몇 줄 밀렸다. 내용은 같다. DESIGN.md 행 번호는 승격 때 제목으로 찾는다.
- 컨덕터 판단 — 작업 2와 3은 `CanvasController.ts`(`SIZE_BUBBLE.gap`)가 겹치고 작업 3이 작업 2의 함수를 쓰므로, 한 워커가 차례로 한다. 작업 4·5도 같은 코드의 측정·수정과 GUI probe라서 같은 워커가 이어서 한다. GUI probe가 겹치지 않는다.
- 컨덕터 판단 — 작업 6(승격)은 컨덕터의 문서 커밋이다(`/orchestrate` §4·§5).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| M | 작업 2, 3 | `canvasPicker.ts`(+test), `sizeBubble.test.ts`, `CanvasController.ts`(+test), `App.tsx`(+test), `styles.css`, `ds/checks.test.ts` | — | Claude Opus high — 포커스 이동, 대기 중 넣기, 툴팁 Esc처럼 틀리면 포커스가 body로 떨어지는 판단이 많다 | `npm --prefix app test`, `typecheck`, `lint`, `build` | 진행 중 |
| R1 | M 리뷰 | 보고만 | M | Codex gpt-6-astra medium — 다른 계열의 독립 판단 | `/code-review` 보고서 | 대기 |
| S | 작업 4 `/design-sync` | M과 같음 + `docs/DESIGN.md` 측정값 | M 통합 | Claude Opus high(M 워커) — 측정 결과로 구현을 고친다 | `node .scratch/design-sync/canvas-mark-accent/measure.mjs` exit 0 | 대기 |
| T | 작업 5 `/runtime-test` | 보고만(`.scratch/runtime-test/canvas-mark-accent/`) | S | Claude Opus high(M 워커) — 격리 probe, 실제 상태 보호 | probe exit 0과 완료 표시, 스크린샷 | 대기 |
| R2 | 통합본 최종 리뷰 | 보고만 | S, T | Codex gpt-6-astra medium | `/code-review` 보고서 | 대기 |
| D | 작업 6 승격 | `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, feature 디렉터리 삭제 | R2 | 컨덕터 | tasks.md 작업 6 검증 | 대기 |

- 작업 1은 리드가 끝냈다. tasks.md의 체크 항목 2–6이 모두 위 행 하나씩에 있다.
- 겹침: M·S·T는 같은 워커가 차례로 하므로 병렬 편집이 없다.

## 진행

- 2026-11-15 M 시작: Orca run `run_1e77781701e9`, dispatch `ctx_85f6a623fc52`, 워크트리 `cma-m`(브랜치 `SinhyeokKang/cma-m`, `a7741f38c`에서), Claude opus high.
