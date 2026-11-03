# canvas-selection-tools — orch

- 원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261103](../chain-261103/chain.md) 링크 2.
- 시작 커밋: `971ef797`(origin/main). 통합 브랜치: `feat/canvas-selection-tools`.

## 결정 기록

- `/feature-review`·`/design-draft` 생략: 사용자 결정(체인 시작 점검, spec 결정 5).
- 배치를 하나로 둔다: 지휘자 판단 — T·I 항목이 모두 `CanvasController.ts`·`CanvasController.test.ts`·`styles.css`에 모여 병렬로 나눌 파일이 없다(tasks '한 번의 `/ship`').
- Codex 작업자를 쓰지 않는다: 지휘자 판단 — 시작 때 Codex 5시간 한도의 95%를 썼다(11/4 15:35 KST 초기화). Claude 7일 한도는 87%(사용자 확인).
- R1·R2 `/runtime-test`는 W1이 한다: 지휘자 판단 — R2에서 강도를 조정하면 `styles.css`를 다시 고쳐야 하고, 배치 코드는 W1이 소유한다. R2 스크린샷은 지휘자가 사용자에게 보여 강도를 확인받는다(chain.md 링크 2).
- C2 `/verify`, Z1–Z4 문서 승격은 지휘자가 통합 HEAD에서 한다: orchestrate §4·§5.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| W1 | T1–T4, I1–I3, R1, R2 | `app/src/renderer/CanvasController.ts`, `CanvasController.test.ts`, `styles.css`, `tokens.css`(주석), `ds/checks.test.ts`, CSS 고정 테스트 파일, `.scratch/runtime-test/canvas-selection-tools/` | — | Claude Opus medium — selection seq·`clear` 순서를 틀리면 선택이 되살아나는 회귀가 난다(POSTMORTEM 2026-10-23). 설계가 구체적이라 high까지는 필요 없다 | tasks 각 항목 검증 + `npm --prefix app test`·`typecheck` green, R1·R2 스크린샷 | 대기 |
| R | C1 `/code-review` | 보고만 | W1 | Claude Sonnet medium — 설계 대조 위주, 변경이 한 controller와 CSS 한 블록 | 🔴 0 | 대기 |
| 지휘자 | C2, Z1–Z4 | `docs/`, `docs/features/canvas-selection-tools/` | W1, R | — | tasks C2·Z 검증 | 대기 |

겹침: 없음(배치 하나). 순서: W1(T→I→R1·R2 스크린샷) → 사용자 강도 확인 → R → (수정 라운드) → 통합 → C2 → Z1–Z4 → push·PR·병합.
