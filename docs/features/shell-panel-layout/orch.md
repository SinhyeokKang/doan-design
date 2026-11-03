# shell-panel-layout — orch

- 원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261103](../chain-261103/chain.md) 링크 3(마지막).
- 시작 커밋: `5f0a0e58`(origin/main). 통합 브랜치: `feat/shell-panel-layout`.

## 결정 기록

- `/feature-review`·`/design-draft` 생략: 사용자 결정(체인 시작 점검).
- T0 실행 명령: 사용자 승인(체인 시작 점검, tasks T0). 화면이 잠겨 네이티브 키를 보낼 수 없으면 '입력창이 직접 넘김' 갈래로 간다.
- 배치를 하나로 둔다: 지휘자 판단 — T2·T5·T9가 모두 `App.tsx`를, T4·T8이 `restore/uiState.ts`를, T1·T5가 `rightPanelSize.ts`를 고쳐 병렬로 나눌 수 없다(tasks '한 번의 `/ship`', 커밋 4개).
- Codex 작업자를 쓰지 않는다: 지휘자 판단 — 시작 때 Codex 5시간 한도 97%. Claude 7일 한도는 87%(사용자 확인, 스크립트는 98%로 읽음).
- T11 `/runtime-test`는 W1이 한다: 지휘자 판단 — 결과에 따라 배치 코드를 고칠 수 있고, 배치 코드는 W1이 소유한다(링크 2와 같음). 로그인 프로필 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`를 쓰고, 프로필을 바꿀 수 있는 probe는 복사본으로 돌린다.
- T10 `/verify`, Z1 문서 승격은 지휘자가 통합 HEAD에서 한다: orchestrate §4·§5.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| W1 | T0–T9, T11 | `app/src/` 아래 design이 가리키는 파일(`App.tsx`, `rightPanelSize.ts`, `sidebarSize.ts`, `ProjectOverview.tsx`, `ConversationPanel.tsx`, `CanvasConversationPanel.tsx`, `ShellSidebar.tsx`, `chipField.ts`, `components/ui/resizable.tsx`, `restore/uiState.ts`, `main/index.ts`, `main/menuState.ts`, `styles.css`)과 그 테스트, preload 메뉴 타입, tasks T9의 'T0 결과' 줄, `.scratch/shell-panel-layout/`, `.scratch/runtime-test/shell-panel-layout/` | — | Claude Opus medium — 메뉴 입력 검증, 읽기 전 저장 규칙, 포커스 이동, unmount가 얽혀 틀리면 상태 유실·이중 토글이 난다. 설계가 구체적이라 high까지는 필요 없다 | tasks 각 항목 검증 + `npm --prefix app test`·`typecheck` green, T11 보고서·스크린샷 | 대기 |
| R | `/code-review` | 보고만 | W1 | Claude Sonnet medium — 설계 대조 위주 | 🔴 0 | 대기 |
| 지휘자 | T10, Z1 | `docs/`, `docs/features/shell-panel-layout/` | W1, R | — | tasks T10·Z1 검증 | 대기 |

겹침: 없음(배치 하나). 순서: W1(T0 → 커밋 1–4 → T11) → R → (수정 라운드) → 통합 → T10 → Z1 → push·PR·병합 → 로그인 정리 → 체인 디렉터리 삭제.
