# 컨텍스트 링 서랍 — orch

- 계획 원본: [spec.md](spec.md), [design.md](design.md), [tasks.md](tasks.md)
- 시작 해시: `0ca0b37a` (origin/develop)
- 통합 브랜치: `feat/context-ring-drawer` (lead가 만들었다)
- conductor: Claude Code(Opus). 워커는 Claude만 쓴다(모델 교차 없음).

## 결정 기록

- task 0(초안)은 lead가 develop에서 끝냈다(확정, 커밋 177fe622·a01d6828). conductor는 건너뛴다.
- 사용자에게 새로 물을 결정은 없다. spec과 design이 사용자 결정을 이미 담고 있다.
- conductor 판단 — CSS 셀렉터 이동 방식, `Row`를 export할지 공용 파일로 옮길지: design.md가 "구현 때 확정"으로 남겼고 헤더 markup이 같으면 된다. 워커 U가 정한다.
- conductor 판단 — 사용량은 실제 로그인 없이 기존 측정처럼 주입한다(tasks 7). 로그인이 필요하면 격리된 앱 인스턴스로 띄운다(사용자 지시).
- 사용자 부재(lead 전달): 남은 비차단 판단은 conductor가 권장안으로 정하고 여기에 근거와 함께 적는다. 로그인이나 GUI 승인이 필요한 일은 하지 않고, 미룬 것은 PR 본문에 적는다.
- conductor 판단 — 레이아웃 기준(task 1)은 구현 전 sha에서 재야 하므로 워커 P와 병렬로 먼저 돌린다. GUI를 쓰는 워커는 M뿐이라 겹치지 않는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| M | tasks 1 | `.scratch/context-ring-drawer/`만(커밋 없음) | 없음 | Sonnet high — 판단보다 단계가 많다(격리 앱, seeded 대화, 7개 구성) | `node .scratch/context-ring-drawer/measure.mjs` exit 0, 구성마다 값 | 완료 — baseline 8구성(커밋 없음, .scratch로 옮김), worktree 정리 |
| P | tasks 2, 3 | 새 순수 함수 파일과 테스트(renderer, main), `main/senderAllowed.ts`, `main/index.ts`(usage publish·visible), `preload/prototype.ts`(+test), `main/agentAuth/usageIpc.ts` 주석 | 없음 | Opus high — sender 허용(보안)과 포커스·툴팁 규칙 판단 | `npm --prefix app test`, typecheck | 통합 0dc9179d·9758e75a·c9b54b26 |
| U | tasks 4, 5, 7 | `ContextRing.tsx`, `AgentUsageButton.tsx`(Row), `DockedComposer.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `prototype/PrototypeConversation.tsx` 쪽, `styles.css`, 관련 테스트, `docs/design/canvas-conversation.md`(design-sync 기록) | P 통합, M 완료 | Opus high(P 워커 재사용: 같은 worktree에 순수 함수 맥락이 있다) — UI 상태·포커스가 많고 레이아웃 0px 불변 조건 | typecheck, lint, test, `/design-sync`, 측정 재실행 0px, `/runtime-test` | 대기 |
| R | tasks 6 | 보고만 | U 통합 | Opus high — IPC 권한과 포커스 규칙을 독립 판단 | 🔴 0(수정은 P·U 소유 워커로) | 대기 |
| conductor | tasks 8–12 | `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/BACKLOG.md`, `docs/DESIGN.md`, feature 디렉터리 삭제 | R 🔴 0 | — | verify exit 0, tasks의 grep | 대기 |

## 파일 겹침과 순서

- M ∥ P (겹침 없음) → U(P 통합 위에서, M의 측정 스크립트를 받는다) → R → 수정 라운드 → 통합 verify → 문서 승격 → push + PR.
- tasks 11의 `docs/design/canvas-conversation.md` 링 행은 U의 `/design-sync`가 고친다. BACKLOG와 DESIGN 인덱스는 conductor가 고친다.

## 초안 리뷰

- 해당 없음(초안은 lead 쪽에서 확정됐다).

## 배치 결과 메모

- M: 측정 실행 1회에서 real-state 지문이 어긋났고 이후 6회는 재현되지 않았다(원인 미확인). 프로토타입 창 패널은 기준에 없다(tasks 1 구성 목록에도 없다).
- P: plan과 다른 점 — `contextDrawerView`의 context가 `{ label, text, bar, full }`이다(확정 초안의 줄 문구가 `contextText`와 달라서). `prototypeWindow.ts`에 `shownChanged`를 더했다(프로토타입 창이 닫힐 때 사용량 visible 재평가). 둘 다 conductor가 받아들였다: 초안과 spec 5의 숨김 규칙을 따르는 변경이다.
