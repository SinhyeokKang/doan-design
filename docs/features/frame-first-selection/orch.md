# 프레임 우선 선택 orchestrate

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: `docs/features/chain-261111/chain.md` 링크 1 (`origin/develop`에서 읽음)
- 시작 해시: `b45ae233` (develop)
- 통합 브랜치: `feat/frame-first-selection`
- 모델 계열: Claude만. 계열 교차 허가 없음.

## 결정 기록

- 배치 분할 — conductor 판단, 근거: 작업 2·3·4가 모두 `canvasScript.ts`·`CanvasController.ts`·`selection.ts`를 고친다. 파일이 겹치므로 병렬로 나누지 않고 한 워커가 순서대로 한다.
- 작업 5(PRODUCT·ARCHITECTURE 승격과 디렉터리 삭제) — conductor 판단, 근거: `/orchestrate` §4·§5와 `/chain` §3 'Conductor'가 문서 승격을 conductor 몫으로 둔다.
- `/agent-eval` 해당 없음 — 체인 파일 운영 메모: 링크 1은 CLI 출력·가이드·`doan check`를 바꾸지 않는다.
- 새 제품·범위 결정은 아직 없다. spec의 확정 동작과 상태표가 판단을 덮는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 구현 | tasks 2·3, tasks 4의 `/design-sync`·`/runtime-test` | `app/src/main/canvasScript.ts`, `app/src/renderer/CanvasController.ts`, `selection.ts`, `canvasTool.ts`, `canvasMessage.ts`, 선택 표시 컴포넌트와 그 테스트, `docs/DESIGN.md`의 선택 측정값 | 없음 | Opus high — hover/선택 seq 분리, modifier 고착, 재로드 복구 순서처럼 틀리면 회귀가 나는 동시성·이벤트 순서 판단이 많다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, 격리 앱 probe와 `doan active` 대조 | 대기 |
| R1 리뷰 | B1 diff의 `/code-review`, handoff 주장 판정 | 읽기만 | B1 | Opus high — 선택 수명·Esc 소유·메시지 검증 경계를 판정해야 한다 | 보고서 | 대기 |
| B1 수정 라운드 | R1의 🔴/🟡 | B1과 같음 | R1 | B1과 같음 | B1과 같음 | 대기 |
| C 문서 | tasks 4의 최종 `/verify`, tasks 5 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, 이 디렉터리 삭제 | B1 통합 | conductor | `node .agents/skills/verify/scripts/verify.mjs` | 대기 |

tasks 체크 항목 대응: 1 완료(체인 전), 2·3 → B1, 4 → B1(design-sync·runtime-test)·R1(code-review)·C(verify), 5 → C. 주인 없는 항목은 없다.

## 겹침과 순서

B1 → R1 → B1 수정 → 통합 → C 순서로 직렬이다. 병렬 링크 `canvas-activity-notices`와 겹치는 파일은 없다(체인 파일 '병렬 판단').
