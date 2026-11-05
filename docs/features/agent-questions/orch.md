# agent-questions — orch

- 정본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). P·U는 main에서 끝났다.
- 시작 hash: `77a1af19`(main). 통합 브랜치: `feat/agent-questions`.
- 체인 밖의 단독 run이다(chain-261104의 상시 권한은 쓰지 않는다). 모델 교차 허가가 없으므로 작업자와 리뷰는 모두 Claude다.

## 결정 기록

1. D1·D2 실행: 이 기기에 새 공용 프로필을 만든다. 실제 HOME과 이 run 전용 userData(`/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`)에서 Doan 연결로 Claude Code에 브라우저 로그인한다(그때 사용자 승인). 끝나면 sign out, Keychain 항목과 userData를 지운다(사용자).
2. D2에서 Antigravity도 같은 프로필의 실제 로그인으로 본다. 끝나면 ACP logout으로 토큰을 지운다(사용자).
3. 지휘자 판단 — main의 답 대기 판정(`service.ts` `Live.asking`, `project.ts` `ProjectTurn.asking`)은 `permission.request`·`permission.resolved`만 센다(chain-261104 링크 2 인계 (3)). design '다른 feature와의 관계'의 "별도 코드가 필요 없다"와 달리, 질문 대기도 같은 root를 막지 않으려면 `question.request`·`question.resolved`를 그 집합에 더해야 한다. M2가 맡는다(spec 완료 조건 7).
4. 지휘자 판단 — B4의 "접힌 줄의 header 없는 경우"는 `threadItems`·`ConversationThread`의 일이라 R이 맡는다. G는 `acp.ts`·`acpRunner.ts`만 고친다.
5. 지휘자 판단 — R이 M2를 기다리지 않도록 M1이 preload `answerConversationQuestion`과 `Runner.answerQuestion?` 타입 한 줄을 미리 더한다. IPC 처리기와 검증은 M2다.
6. 지휘자 판단 — B2는 P2 결과로 줄었다: 모든 `item/tool/requestUserInput`에 빈 답 `{answers: {}}`, 질문 표·`answerQuestion`·`isSecret`은 하지 않는다.
7. 질문 카드의 버튼 순서는 초안대로 Send(왼쪽) → Skip → Stop이다. 쓰레드 권한 카드(Allow → Deny → Stop, `ConversationThread.tsx:404-407`)와 strip이 주 동작을 먼저 두므로 맞춘다. "완료 동작은 끝"은 dialog 규칙이다(DESIGN.md 'Dialogs')(사용자).
8. 지휘자 판단 — D3·Z1은 지휘자가 한다(orchestrate §4·§5의 통합 gate와 승격).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| M1 | A1, A4, 결정 5 | `main/conversation/` 새 질문 타입·상한 모듈과 `questionAnswer` 모듈, `types.ts`, `store.ts`, `state.ts`, `summary.ts`, `service.ts`(Runner 타입 한 줄만), `preload/index.ts`(한 줄), 그 테스트 | — | Opus medium — append-only 포맷과 접기 규칙이 뒤 배치 전부의 바탕이라 틀리면 다 깨진다. 분량은 작다 | `npm --prefix app test`, typecheck | 통합 `d6cdd06f`(리뷰 Opus medium 🔴0 🟡0 ⚪3) |
| X | C2, C3 | `CanvasTools.tsx`, `canvasTree.ts`, `main/view.ts`와 `<title>` 표시를 기대하던 테스트 | — | Sonnet medium — 이름 바꾸기와 필드 제거, 판단이 적다 | test, typecheck, build | 통합 `caf182cc`(리뷰 Sonnet high 🔴0 🟡0 ⚪7, r1: postmortem과 ⚪1–4) |
| M2 | A2, A3, B1, B2(축소), B3, 결정 3 | `transport.ts`, `fixtures/`, `runners.ts`, `dispatcher.ts`, `service.ts`, `project.ts`, `ipc.ts`, `main/index.ts`, 그 테스트 | M1 | Opus high — SDK `canUseTool` 동시성, 응답 한 번 보장, Stop·close 경계, secret 비저장 | test, typecheck | 통합 `6fa01204`(리뷰 Opus high 🔴0 🟡0 ⚪4) |
| R | A5, C1, B4의 접힌 줄 | `main/notifications.ts`·`notifyService.ts`, `renderer/` 전부(`ConversationThread.tsx`, `CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, `homeRun.ts`, `homeConversations.ts`, `overviewRun.ts`, `threadItems.ts`, `conversationStrip.ts`, `ConversationStripView.tsx`, `composerRules.ts`, `conversationStore.ts`, 새 `questionDraft.ts`), CSS, 그 테스트 | M1 | Opus high — 키보드·IME·포커스·접근성 규칙이 많고 진입 경로가 여럿이다 | test, typecheck, build | 통합 `56ab6070`(리뷰 Opus high 🔴0 🟡1, r1 Opus medium으로 고침, 지휘자가 diff 확인) |
| G | B4(접힌 줄 제외) | `acp.ts`, `acpRunner.ts`, 그 테스트 | M1 | Opus medium — 질문으로 읽는 조건이 좁고, 틀리면 권한 요청이 질문으로 바뀐다 | test, typecheck | 통합 `0e4143e1`(리뷰 Sonnet high 🔴0 🟡2, 둘 다 뒤 배치로 넘김) |
| D1 | `/design-sync` | R의 renderer 파일(수정), `docs/DESIGN.md` | M2, R, G 통합 | Opus high — 계산 스타일 측정과 수정 | `/design-sync` 보고 | 대기 |
| D2 | `/runtime-test` | 없음(보고만) | D1 | Opus medium — 항목이 많고 사람 상태 보존이 중요 | `/runtime-test` 보고 | 대기 |
| D3·Z1 | gate, 승격 | `docs/` | D2 | 지휘자 | `verify.mjs` exit 0, Z1 grep | 대기 |

리뷰는 배치마다 독립 리뷰 작업자(`/code-review`, 보고만)다. M2·R은 Opus high, 나머지는 Sonnet high.

## 겹침과 순서

- wave 1: M1 ∥ X. 겹치는 파일이 없다(X는 `main/view.ts`, M1은 `main/conversation/`).
- wave 2(M1 통합 뒤): M2 ∥ R ∥ G. `service.ts`는 M1이 한 줄 고친 뒤 M2만 고친다. `main/index.ts`는 M2만, `notifications.ts`는 R만 고친다. R이 `main/conversation/`이나 `main/index.ts`를 고쳐야 하면 deferred로 보고한다.
- wave 3: D1 → D2 → D3·Z1 직렬.

## 검토 기록

- X: 리뷰 🔴·🟡 없음. 캔버스 이름 결함(PRODUCT의 file stem 규칙과 `canvasLabel`의 title 우선)은 r1에서 POSTMORTEM에 적었다. ⚪6(DESIGN·PRODUCT의 툴바 Export 문구)은 Z1에서 지휘자가 고친다. 끝난 작업자 터미널 재사용은 Orca가 `agent_unconfigured`로 거절해, r1은 같은 worktree의 새 작업자가 했다.
- M1: 리뷰 🔴·🟡 없음. ⚪(`__proto__` question id, 바꿀 수 있는 `QUESTION_LIMITS`, 답 타입 중복)는 고치지 않았다. `rendererImports.test.ts` EXTRA_ROOTS에 두 모듈을 더한 것은 기존 방식이라 리뷰가 받아들였다.
- G: 리뷰 🔴 없음. 🟡1 — 질문으로 읽는 모양은 P5의 질문 하나로만 확인했고, Antigravity의 실제 도구 권한 요청이 거절 선택지 없이 `allow_once` 여럿으로 오면 질문 카드가 된다. D2에서 실제 파일 쓰기·명령 권한을 일으켜 `options`의 kind를 기록하고, 그런 모양이 오면 구별 조건(`toolCall.kind` 없음, `rawInput` 비어 있음)과 테스트를 더한다. 🟡2 — `respond`가 실패하면 `answerQuestion`이 `stale`을 돌려주고 요청은 `expire()`까지 남는다. 카드는 `question.resolved`로만 접혀야 하므로 R에 전달했다. 분기를 `onRequestOf`가 아니라 runner 처리기에 둔 것(연결이 provider를 모름)은 받아들였고 Z1에서 design §4 문구를 고친다.
- R: 리뷰(Opus high) 🔴 없음, 🟡1 — 여러 선택 질문에서 Other를 체크하고 글을 비우면 Other가 말없이 빠졌다. 지휘자 판단: design §7 "Other를 골랐는데 글이 비었으면 답하지 않은 것이다"는 여러 선택에도 적용한다(그 질문은 미답, Send 꺼짐). r1이 `questionDraft.ts`와 `questionAnswer.ts`(M1 모듈, M2 소유 아님)를 고친다. ⚪1·2·4도 r1. ⚪3(카드 Stop 뒤 포커스가 body로 떨어짐, 권한 카드와 같은 기존 동작)과 ⚪5(strip Skip 실패 신호 없음, 결정 10)는 Z1에서 BACKLOG에 적는다. ⚪6(`closesNotification`이 요청 종류를 보지 않음)은 M2 통합 때 권한·질문 id가 겹치지 않는지 확인한다. 그룹 이름 `aria-label="<header>: <question>"`은 결정 19대로이므로 D1에서 초안의 `aria-labelledby`에 맞추지 않는다.
- M2: 리뷰 🔴·🟡 없음. ⚪1 질문에서 `canUseTool`의 `options.signal`을 보지 않아 CLI가 취소한 질문이 답할 수 있게 남는다(권한과 같은 기존 한계, Z1 BACKLOG). ⚪2 서버 id 겹침 확인은 decline 경로만 지킨다. ⚪3 afterend·stop/close 테스트의 deny 확인 반복이 빈 채로 통과한다. ⚪4 Z1 문서(ARCHITECTURE projectBusy, id 재사용 때 elicitation도 protocol fail). R 리뷰 ⚪6(권한·질문 id 겹침)은 M2 리뷰가 겹치지 않음을 확인했다.
- Orca `worktree rm`이 batch 브랜치를 지워, 지휘자가 끝 커밋(`aq-x` 3faa4ab2, `aq-m1` d213f0e0, `aq-g` ae520bac, `aq-r` 736c1551, `aq-m2` 1d450f47)으로 다시 만들었다.
- worktree `aq-x`·`aq-m1`·`aq-g`·`aq-r`·`aq-m2`는 통합 뒤 지웠다(브랜치는 남김). 근거 사본: `.scratch/agent-questions-orch/evidence/`.
