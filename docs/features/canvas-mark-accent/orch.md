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
| M | 작업 2, 3 | `canvasPicker.ts`(+test), `sizeBubble.test.ts`, `CanvasController.ts`(+test), `App.tsx`(+test), `styles.css`, `ds/checks.test.ts` | — | Claude Opus high — 포커스 이동, 대기 중 넣기, 툴팁 Esc처럼 틀리면 포커스가 body로 떨어지는 판단이 많다 | `npm --prefix app test`, `typecheck`, `lint`, `build` | 통합(`7579948ea`…`b84fb0ebb`) |
| R1 | M 리뷰 | 보고만 | M | Codex gpt-6-astra medium — 다른 계열의 독립 판단 | `/code-review` 보고서 | 완료(2회차 🔴0 🟡0) |
| S | 작업 4 `/design-sync` | M과 같음 + `docs/DESIGN.md` 측정값 | M 통합 | Claude Opus high(M 워커) — 측정 결과로 구현을 고친다 | `node .scratch/design-sync/canvas-mark-accent/measure.mjs` exit 0 | 통합(`bc8b35d8f`, `3364845b9`) |
| T | 작업 5 `/runtime-test` | 보고만(`.scratch/runtime-test/canvas-mark-accent/`) | S | Claude Opus high(M 워커) — 격리 probe, 실제 상태 보호 | probe exit 0과 완료 표시, 스크린샷 | 통합(`b854ec890`…`2245380fb`) |
| R2 | 통합본 최종 리뷰 | 보고만 | S, T | Codex gpt-6-astra medium | `/code-review` 보고서 | 진행 중 |
| D | 작업 6 승격 | `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, feature 디렉터리 삭제 | R2 | 컨덕터 | tasks.md 작업 6 검증 | 대기 |

- 작업 1은 리드가 끝냈다. tasks.md의 체크 항목 2–6이 모두 위 행 하나씩에 있다.
- 겹침: M·S·T는 같은 워커가 차례로 하므로 병렬 편집이 없다.

## 진행

- 2026-11-15 M 시작: Orca run `run_1e77781701e9`, dispatch `ctx_85f6a623fc52`, 워크트리 `cma-m`(브랜치 `SinhyeokKang/cma-m`, `a7741f38c`에서), Claude opus high.
- 2026-11-15 M 완료: 커밋 `8c5f580bf` `83452cd4f` `c7dcb6ecf` `a0be42474`. 앱 테스트·typecheck·lint·build·verify.mjs 통과. 설계와 다른 점(`SIZE_BUBBLE`을 `sizeBubble.ts`로 옮김, 버블 버튼에서 pick을 시작하면 시작 전에 포커스를 컴포저 필드로 옮김, 누르기는 host의 native click이 받음)은 R1이 판단한다.
- 2026-11-15 R1 시작: dispatch `ctx_61bd72207a4a`, `cma-m` 워크트리에서 보고만, Codex gpt-6-astra medium.
- 2026-11-15 R1 완료: 🔴0 🟡2 🟢2(보고서 `cma-m/.scratch/review-R1.md`, `.scratch/review-R1.md`로 복사). 🟡1 접힌 패널에서 버블 버튼으로 시작한 pick을 취소하면 포커스가 컴포저가 아닌 툴바 Picker에 남는다. 🟡2 reload 중 포커스가 다른 곳을 거쳐 원래 자리로 돌아오면 버블이 포커스를 다시 가져간다. 사용자 결정은 필요 없다(design.md '포커스'대로 고친다).
- 2026-11-15 M 수정 1회차 시작: follow-up dispatch `ctx_a455e02da563`.
- 2026-11-15 M 수정 1회차 완료: `b5c7bbf6a`(test) `567818d00`(fix). 버블 버튼에서 시작한 pick을 취소하면 패널이 접혀 있었든 열려 있었든 컴포저 필드로 간다. pick 전에 필드에 주던 포커스는 없앴다. reload 복귀는 다른 곳의 `focusin`이 한 번이라도 있으면 영영 포기한다. verify.mjs 통과.
- 2026-11-15 R1 2회차: 기존 Codex 세션에 follow-up을 보냈지만 Codex 업데이트 화면에 막혀 시작하지 못했다(`ctx_185a3a84d978` 해제). 같은 모델로 새로 시작했다(`ctx_3450fb074fc0`).
- 2026-11-15 R1 2회차: 🔴0 🟡0 ⚪1(실제 앱에서 확인할 pick 포커스 경우들). 이 경우들을 작업 5 probe에 넣었다.
- 2026-11-15 M 통합: 커밋 여섯 개를 `7579948ea`…`b84fb0ebb`로 cherry-pick했다. 통합 HEAD의 `app/` 트리가 워커가 verify.mjs를 통과한 `567818d00`과 같다(`git diff --stat 567818d00 HEAD -- app`가 비었음). 그래서 통합 시점 `/verify`는 그 결과로 갈음하고, 최종 `/verify`는 S·T를 통합한 뒤 돌린다.
- 컨덕터 판단 — DESIGN.md는 작업 4의 측정 커밋에서 워커가 작업 6 목록의 DESIGN.md 행까지 함께 고친다. 측정한 사람이 행을 쓰는 편이 정확하고, 컨덕터는 PRODUCT·ARCHITECTURE를 쓰고 작업 6 검증을 돌린다.
- 2026-11-15 S·T 시작: follow-up dispatch `ctx_985ee844ee5d`(M 워커, 작업 4 다음 작업 5).
- 2026-11-15 S 완료: `/design-sync` 다섯 프레임 215행, 차이 0, 편차 4(툴팁 간격·중심이 반 장치 픽셀 안, 작업 중 표시의 그라디언트·빛 번짐은 초안 메모 9대로 그대로). 구현 수정은 없고 주석 하나를 고쳤다. DESIGN.md는 작업 6 목록까지 고쳤다. 워커 안에서 Claude 독립 리뷰 두 번.
- 2026-11-15 T 완료: probe 34/34 통과, 관찰 19. 1x에서 선이 1px로 내림되는데 margin이 −1.5px라 한쪽에 틈, 다른 쪽에 요소 픽셀 덮임이 있었다. `/refactor`로 고쳤다(`@media (resolution < 2dppx)`에서 선 1px, margin −1px, 버블 간격 1px 기준). 실제 상태 그대로, `/Applications/Doan.app` 새 프로세스 없음. 남은 관찰: 마우스를 버튼 밖에서 뗀 뒤 키보드 포커스를 주면 Add 툴팁은 열리고 Zoom in은 열리지 않는다(명세는 충족, R2가 판단).
- 2026-11-15 S·T 통합: `bc8b35d8f`…`2245380fb`. R2 시작: dispatch `ctx_14c08817598f`, Codex gpt-6-astra medium, 전체 diff 최종 리뷰.
- 2026-11-15 승격(D 일부): PRODUCT `67a10469a`, ARCHITECTURE `f8c582773`. BACKLOG와 feature 디렉터리 삭제는 R2 뒤에 한다.
