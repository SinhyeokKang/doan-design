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
- B2 추가 — lead 전달, 사용자 승인: 에이전트 작업 중 작업 프레임 강조가 깜빡이는 버그를 같은 브랜치·PR에서 고친다. 원인은 `CanvasController.ts` `drawWork()`가 재로드 중 표시를 숨기는 것이다(lead probe 근거 `/Users/sinhyeokkang/code/doan-design/.scratch/flicker/`). 대화 입력창 깜빡임은 재현되지 않아 범위 밖이다. PR 본문에 별도 제목으로 적는다.
- Esc 자동 반복 무시 — conductor 판단, 근거: spec 3항 '한 단계씩'. 누르고 있으면 반복마다 단계가 진행돼 곧 전체 해제되던 것(B1 리뷰 ⚪)을 B2에서 막았다.
- 프레임을 감싼 wrapper의 자기 배경 클릭 — 사용자 결정: 빈 공간으로 보고 전체 해제한다. 프레임을 품지 않은 프레임 밖 요소는 노트로 바로 선택한다. Picker 대상은 바꾸지 않는다(R1 🟡2).
- canvas가 응답하지 않을 때 Esc timeout 해제 — conductor 판단: 이번에는 넣지 않고 BACKLOG에 적는다. 보드 여백 클릭이 즉시 해제하는 우회로가 있다(R1 ⚪3).
- reanchor 중 Esc 전체 해제 — conductor 판단: 기준 노드가 없으므로 타당하다. 승격 때 적는다(R1 ⚪4).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 구현 | tasks 2·3, tasks 4의 `/design-sync`·`/runtime-test` | `app/src/main/canvasScript.ts`, `app/src/renderer/CanvasController.ts`, `selection.ts`, `canvasTool.ts`, `canvasMessage.ts`, 선택 표시 컴포넌트와 그 테스트, `docs/DESIGN.md`의 선택 측정값 | 없음 | Opus high — hover/선택 seq 분리, modifier 고착, 재로드 복구 순서처럼 틀리면 회귀가 나는 동시성·이벤트 순서 판단이 많다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, 격리 앱 probe와 `doan active` 대조 | 완료 `5b2eb1a6`·`7be16485`·`1aa3f5a0` |
| B2 깜빡임 수정 | 작업 프레임 강조 재로드 중 숨김 버그, 회귀 테스트, 짧은 probe, `/postmortem` | `app/src/renderer/CanvasController.ts`, `CanvasController.test.ts`, `docs/POSTMORTEM.md` | B1 완료(같은 파일) | Opus high — B1 터미널을 재사용한다. 원인이 확정돼 변경은 작지만 B1 선택 변경과 같은 파일이라 맥락을 가진 워커가 맞다 | 회귀 테스트 red→green, 앱 테스트·typecheck·lint, 격리 probe | 완료 `a561c18b`..`37c14fc2` |
| R1 리뷰 결과 | B1·B2 diff `f91696da..37c14fc2` | — | — | Opus high | 🔴 0, 🟡 2(Esc 소유 테스트 무력화, wrapper 클릭), ⚪ 9. 보고서 B1 worktree `.scratch/review-R1.md` | 완료 |
| F1 수정 | R1 🟡1·🟡2 | `CanvasController.test.ts`, `canvasScript.ts`·테스트 | R1 | Opus high — 테스트 변이 검증과 클릭 대상 규칙 변경 | 변이 실패 확인, red→green, 게이트, 짧은 probe | 진행 중 |
| C 문서 | tasks 4의 최종 `/verify`, tasks 5 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, 이 디렉터리 삭제 | B1 통합 | conductor | `node .agents/skills/verify/scripts/verify.mjs` | 대기 |

tasks 체크 항목 대응: 1 완료(체인 전), 2·3 → B1, 4 → B1(design-sync·runtime-test)·R1(code-review)·C(verify), 5 → C. 주인 없는 항목은 없다.

## 겹침과 순서

B1 → B2 → R1(B1·B2 diff) → 수정 → 통합 → C 순서로 직렬이다. B2는 B1과 `CanvasController.ts`가 겹쳐 병렬로 돌리지 않는다. 병렬 링크 `canvas-activity-notices`와 겹치는 파일은 없다(체인 파일 '병렬 판단').
