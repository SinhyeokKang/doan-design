# 캔버스 카드 — orch

- 원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md). 체인: [chain-261116-1](../chain-261116-1/chain.md) 링크 1.
- 시작 해시: `54f471ee`(origin/develop에서 리드가 만든 브랜치).
- 통합 브랜치: `feat/canvas-drawing-cards`(이 워크트리 `canvas-drawing-cards-orch`).
- 컨덕터: Claude. 워커도 Claude만 쓴다(모델 경계를 넘는 허가 없음).

## 결정 기록

- 카드 문구(`canvasCardText`): 초안의 문구가 design '문구'와 같으므로 사용자에게 묻지 않는다 — 컨덕터 판단, 근거: 체인 파일 '시작 점검' 2.
- tasks 0(초안): 끝났다(0c2eabd8). 건너뛴다.
- `/agent-eval`: 돌리지 않는다. 가이드, CLI 출력, `doan check` 규칙, skill stub을 바꾸지 않는다 — 체인 파일 '시작 점검' 3.
- tasks 8 실제 턴 probe: 실제 HOME과 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`로 띄운다. 지우거나 바꾸는 probe는 복사본을 쓴다. 로그아웃하지 않는다 — 체인 파일 '로그인'.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| T | tasks 1 | `app/src/main/conversation/types.ts`, `store.ts`, store 테스트 | 없음 | Sonnet medium — 타입 하나와 검증 한 줄, 기계적 | `npm --prefix app test`, typecheck | 통합(eed1213b, e4123acf) |
| A | tasks 2, 3(main `summary.ts`), 4 | `app/src/main/conversation/`(`handoff.ts` 옆 `drawnCanvases`, `summary.ts`, `service.ts`, 테스트). `types.ts`·`store.ts`는 T 뒤 읽기만 | T | Opus high — 턴 수명, 기한, 삭제·종료 경합, 쓰기 재확인 | `npm --prefix app test`, typecheck, lint | 진행(ctx_ed75fc143bf4, cdc-batch-a) |
| B | tasks 3(renderer `overviewRun.ts`), 5, 6, 7과 `/design-sync` | `app/src/renderer/`(`threadItems.ts`, `turnStatus.ts`, `overviewRun.ts`, `handoffView.ts`, `revealDecision.ts`, 새 `canvasCardText`, `ConversationThread.tsx`, `styles.css`, 테스트), `docs/design/conversation.md`·`prototype.md`(측정값) | T | Opus high — 스레드 배치·포커스·접근성 규칙이 많고 design-sync까지 한다 | `npm --prefix app test`, typecheck, lint, `/design-sync` | 진행(ctx_b6e4743267df, cdc-batch-b) |
| R-A, R-B | A, B 리뷰(`/code-review`) | 보고만 | 각 배치 | Opus high — 규칙 대조와 경합 판단 | 🔴 0 | 대기 |
| C | tasks 8 `/runtime-test`, 9 `/verify`, 10 승격 | 문서(PRODUCT, ARCHITECTURE, BACKLOG), `orch.md` | A, B 통합 | 컨덕터가 직접 한다(코드 편집 없음) | verify 종료 코드 0, tasks 10 grep | 대기 |

## 겹침과 순서

- T를 먼저 통합한다. renderer가 `main/conversation/types.ts`의 `ConversationEvent`를 가져다 쓰기 때문이다.
- A와 B는 파일이 겹치지 않아 병렬로 돈다(main/conversation 대 renderer). 둘 다 T를 통합한 `feat/canvas-drawing-cards`에서 child worktree로 시작한다.
- `docs/design/*`는 B만 고친다. PRODUCT·ARCHITECTURE·BACKLOG 승격은 컨덕터가 마지막에 한다.

## 진행 기록

- Run `run_a7fabeaa16df`. T는 현재 워크트리에서 바로 커밋했다(작아서 cherry-pick 없이). 테스트 13433개, typecheck, lint 통과. types.ts 주석의 "guided turn"은 모든 턴이 쓰므로 A가 고친다.
- A, B를 `feat/canvas-drawing-cards`(e4123acf) 기준 child worktree로 시작했다(Opus high, launch.effective 확인).
- A 질문: 편집 경로를 `insideDesign`으로 거르면 `/tmp`로 보고된 경로가 빠진다. 컨덕터 판단 — 모든 `edit` 경로를 모으고 `canvasesAt`과 목록 행 필터에 맡긴다(missed 줄과 같은 근거, 결과는 design 의도와 같다).
- A 완료(21e57afd, a51ec2a5, 1259e74f). 계획과 다른 점: 진행 중 턴에 `canvas.drawn`이 쓰이면 renderer가 실행 단계를 잃으므로, main이 쓰기 뒤 현재 단계를 새 seq로 다시 보낸다. 독립 리뷰 R-A(ctx_5599e919110c, Opus high)에 맡겼다. A 워커는 수정 라운드를 위해 남겨 둔다(retain).
- R-A: 🔴 0, 🟡 1. main의 단계 재전송이 이미 밀려난 단계를 되살린다. 컨덕터 판단 — renderer 층에서 막는다(`turnOf`가 lastSeq를 셀 때 `canvas.drawn`을 건너뛴다, B에 추가). A는 1259e74f를 되돌린다(수정 라운드 ctx_9c69246f75d6, Sonnet medium — 되돌리기만 하는 기계적 작업).
- 승격 때 반영할 리뷰 메모: 루트 목록이 `list`가 아니면(깨진 config) 스냅숏이 비어 기존 캔버스에 카드가 붙을 수 있다(BACKLOG). 같은 대화의 연속 두 턴도 같은 새 경로에 각각 카드를 얻는다(PRODUCT 문구). ARCHITECTURE는 "insideDesign 편집 경로"가 아니라 모든 `edit` 경로를 쓴다고 적는다.
