# project-remove-confirm — orch

- 원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261103](../chain-261103/chain.md) 링크 1.
- 시작 커밋: `8c4c5393`(origin/main). 통합 브랜치: `feat/project-remove-confirm`.

## 결정 기록

- `/feature-review`·`/design-draft` 생략: 사용자 결정(체인 시작 점검).
- 배치를 하나로 둔다: 지휘자 판단 — A·B·C 모두 `App.tsx`를 고치고 C는 B가 끝난 메뉴·토스트 경로를 지우므로 병렬로 나눌 파일이 없다(tasks '한 번의 `/ship`').
- Codex 작업자를 쓰지 않는다: 지휘자 판단 — 시작 때 Codex 5시간 한도의 95%를 썼다(11/4 15:35 KST 초기화). Claude 7일 한도는 86%(사용자 확인).
- D1 `/runtime-test`, D3 `/verify`, E1–E5 회고·문서 승격은 지휘자가 통합 HEAD에서 한다: orchestrate §4·§5(통합 gate와 문서 승격은 지휘자 몫).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| W1 | A1, A2, B1, B2, C1 | `app/src/renderer/`(App.tsx, addProjectsNav.ts, homeRun.ts, homeConversations.ts, homeCards.ts, toastState.ts 주석, 관련 테스트), `app/src/main/`(index.ts, menuState.ts, shell.ts, folders.ts, removal.ts 삭제, 관련 테스트), `app/src/preload/` | — | Claude Opus medium — 화면 이동 회귀와 IPC·메뉴 경로 삭제가 겹쳐, 놓치면 다른 화면 이동이나 메뉴가 깨진다. 설계가 구체적이라 high까지는 필요 없다 | tasks 각 항목의 검증 + `npm --prefix app test`·`typecheck` green, C1 `rg` 0건 | 대기 |
| R1 | D2 `/code-review` | 보고만 | W1 | Claude Sonnet medium — 설계 대조 위주의 리뷰, 변경 범위가 한 기능 | 🔴 0 | 대기 |
| 지휘자 | D1, D3, E1–E5 | `docs/`, `docs/features/project-remove-confirm/` | W1, R1 | — | tasks D1·D3·E 검증 | 대기 |

겹침: 없음(배치 하나). 순서: W1 → R1 → (수정 라운드) → 통합 → D1·D3 → E1–E5 → push·PR·병합.
