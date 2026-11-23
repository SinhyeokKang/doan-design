# Overview 대화 목록 — orch

- 계획 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 해시: `faef5e5a4` (origin/develop와 같다)
- 통합 브랜치: `feat/overview-conversation-list` (lead가 만들었다)
- 기준 시안: `.doan/canvases/overview-conversation-list.html` (task 1, 사람이 확정했다)

## 결정 기록

- 새로 물을 결정이 없다. design.md '결정'이 feature review에서 정해졌고, 시안 문구도 확정됐다 — 지휘자 판단(design.md '시안 확정').
- task 2–4를 한 배치로 묶는다 — 지휘자 판단. union 행 타입이 `canvasConversationRows.ts`, `CanvasConversationList.tsx`, `RightPanel.tsx`, `App.tsx`를 함께 바꾸고 테스트 파일도 겹쳐서 병렬로 나눌 수 없다.
- task 5(`/design-sync`)는 B1 워커에게 후속 Task로 보낸다 — 같은 파일(`styles.css`, `CanvasConversationList.tsx`)을 고치고 B1의 맥락을 그대로 쓴다.
- task 6(문서 승격)은 지휘자가 docs-freshness 커밋으로 한다.
- `/agent-eval`은 건너뛴다 — design.md '영향받는 구성 요소'(가이드·CLI 출력·check 규칙·스킬 스텁 변경 없음).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | tasks 2, 3, 4 | `app/src/renderer/canvasConversationRows{,.test}.ts`, `CanvasConversationList{,.test,.keyboard.test}.tsx`, `RightPanel{,.test}.tsx`, `App.tsx`, `App.conversationPanel.test.tsx`, `App.conversationDelete.test.tsx`, `styles.css` | 없음 | Claude Opus high — 여러 구성 요소에 걸친 union 타입, 포커스·순서 고정·이벤트와 목록 읽기 사이의 경합을 다룬다 | `/ship bypass`(push 전 정지): 테스트 red→green, `/verify`, `/runtime-test` 프로브 3개 | 대기 |
| R1 | B1 리뷰 | 읽기만 | B1 | Claude Opus medium — 경합·포커스 판단은 필요하지만 보고만 한다 | `/code-review` 보고서, 🔴 0 | 대기 |
| B2 | task 5 | B1과 같다 + `docs/design/project.md` | B1·R1 | B1 워커 후속 Task(Opus high) — B1 맥락 재사용 | `/design-sync` 보고서: 차이 0 또는 문서화 | 대기 |
| D | task 6 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/design/*.md`, `docs/BACKLOG.md`, feature 디렉터리 삭제 | B2 | 지휘자 | tasks.md 6의 grep | 대기 |

## 파일 겹침과 순서

B1 → R1 → (수정 라운드) → B2 → 통합 `/verify` → D → push. 모든 배치가 같은 renderer 파일을 고쳐서 직렬이다.
