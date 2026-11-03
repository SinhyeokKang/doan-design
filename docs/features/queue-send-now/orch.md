# queue-send-now — orchestration

- 계획 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 hash: `0346865e` (main)
- 통합 브랜치: `feat/queue-send-now`
- 모델 경계: Claude Code conductor → Claude worker만. 교차 없음.

## 결정 기록

1. T5 `/runtime-test`의 실제 Claude·Codex 턴은 현재 로그인 프로필(`CLAUDE_CONFIG_DIR`, `CODEX_HOME`=`~/.codex`)을 쓴다. userData·HOME·SHELL·`DOAN_RUNTIME`은 격리한다. 두 프로필에 테스트 세션 기록이 남는다 — 사용자 결정.
2. worker는 conductor와 같은 bypass 권한 모드로 띄운다(사용자가 자리를 비우는 동안 무인 진행). worker는 자기 worktree에서만 작업하고 push·PR을 하지 않는다 — 사용자 결정.
3. T2와 T3는 한 batch(B)로 묶는다. Claude 생성기 수명(T3)이 `normalizeClaude`의 terminal 판정(T2)에 기대고, uuid 집합을 러너와 transport가 함께 다루기 때문이다 — conductor 판단(design §2.4).
4. T6(문서 승격·디렉터리 삭제)는 conductor가 한다 — conductor 판단(orchestrate §5 '승격은 conductor').
5. D(T5)는 A 통합 뒤 바로 시작하고, IPC·preload에 기대는 store 연결과 `/runtime-test`는 C 통합 뒤 이어서 받는다(deferred) — conductor 판단(orchestrate §0.4 'worker를 기다리게 하지 않는다').

## Batch

| Batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1 전부 | `conversation/steerSupport.ts`(새), `rendererImports.test.ts`, `drafts.ts`·`drafts.test.ts`, `queueFocusAfter`가 들어갈 renderer 순수 모듈과 그 테스트, `threadItems`·`state.ts`·`summary.ts`와 각 테스트 | 없음 | Sonnet medium — 표 기반 순수 함수와 테스트 고정, 판단이 적다 | `npm --prefix app test` | 대기 |
| B | T2, T3 전부 | `conversation/transport.ts`·`transport.test.ts`, `runners.ts`·`runners.test.ts`, `dispatcher.ts`·`dispatcher.test.ts` | 없음 | Opus high — 프로세스 수명·경합, 틀리면 send가 영구 busy(POSTMORTEM 2026-10-28) | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| C | T4 전부 | `conversation/service.ts`·`service.test.ts`, `ipc.ts`·`ipc.test.ts`, `app/src/preload/index.ts` (`drafts.ts`는 A 결과를 쓰기만) | A, B 통합 | Opus high — admission 재확인·flush 순서·holding 경합 | `npm --prefix app test`, typecheck | 대기 |
| D | T5 전부 | `DockedComposer.tsx`와 테스트, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `conversationStore.ts` | A 통합(store 연결·`/runtime-test`는 C 통합 뒤 deferred) | Opus medium — 포커스 규칙과 실제 Chromium probe, 순수 로직은 A에 있다 | typecheck, test, build, `/runtime-test` | 대기 |
| T6 | 문서 승격·삭제 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/features/queue-send-now/` | A–D 통합 | conductor | targeted grep | 대기 |
| 리뷰 | 각 batch diff `/code-review` | 보고만 | 해당 batch 완료 | Opus high(B·C), Sonnet high(A·D) | — | 대기 |

## 겹침과 순서

- A ∥ B (파일 겹침 없음) → A 통합 → D 시작 → B 통합 → C → C 통합 → D deferred(store·runtime-test) → D 통합 → `/verify` → T6 → push·PR.
- C와 D는 파일이 겹치지 않아 병렬로 돈다.

## 진행 기록

- Run `run_137ea997fd5f`. worker는 Orca 기본 인자(`--dangerously-skip-permissions`)로 bypass로 뜬다.
- A: dispatch `ctx_c66bd899eeb2`, worktree `qsn-a`(branch `SinhyeokKang/qsn-a`), Sonnet medium(effective 확인).
- B: dispatch `ctx_fb4481bad936`, worktree `qsn-b`(branch `SinhyeokKang/qsn-b`), Opus high(effective 확인).
- B 질문(소비 신호 계약) → conductor 판단: 신호를 `EventPayload`·`types.ts`에 넣지 않는다(가로채기를 놓치면 v1 로그에 가짜 이벤트가 남는다). `steer()`는 받아들이면 resolve, 거절하면 reject. 소비는 runners.ts의 open 옵션 콜백 `onSteerConsumed(messageId)`로 emit과 같은 순서에 부른다. 실제 `user.message` append는 C가 service.ts에서 한다.
- A 완료(`bef2d1c6`, 테스트 6320 통과, typecheck 통과, red 선확인은 기록 없음). 통합 뒤 D 시작, A 리뷰는 병렬.
- A를 `8f693ee1`로 통합. A worker는 리뷰 수정을 받으려고 retain.
- D 1단계: dispatch `ctx_d2899cdcebc5`, worktree `qsn-d`, Opus medium(effective 확인). A 리뷰: dispatch `ctx_841a89d5eaec`, `qsn-a` worktree, Sonnet high.
- A 리뷰(Sonnet high): 🔴 0 · 🟡 3(queueFocusAfter의 sending 행, SteerPhase `starting` 매핑, red 미확인). 수정 1회차를 새 worker `ctx_ee5f4ec6f535`(qsn-a, Sonnet medium)로 보냈다. 같은 터미널 재사용은 Orca가 `agent_unconfigured`로 거절해 A·리뷰 worker를 release하고 새로 띄웠다. D에는 매핑 설명을 메시지로 보냈다.
- A 수정 1회차 `120a6a37`(🟡 3건 반영, mutation으로 red 확인, 테스트 6322 통과). 통합했다. A 완료.
- qsn-a worktree 삭제(Orca), 브랜치 `SinhyeokKang/qsn-a`는 `120a6a37`에 남겨 둠.
- D 1단계 완료 `b117df8d`(테스트 6328·build·verify 통과, verify 첫 회 `shell.test.ts` flake 1회). store는 IPC가 '소비 뒤 resolve, 거절·턴 종료는 `not_running`'이라고 가정한다 → C 브리프에 계약으로 더했다. D worker release, 리뷰 `ctx_403ed827e0e5`(Opus medium, focus 판단이 많아 올림).
- B 완료 `722aea8b`·`115ac9e0`(red 선확인, 테스트 6272·verify 통과). 계약: `steer()` resolve/reject + `steerConsumed(messageId)` 훅. 위험: Claude가 받아들인 uuid를 끝내 echo하지 않으면 턴이 stop 전까지 안 끝남(감시 타이머 없음). 통합 뒤 C 시작, B 리뷰 병렬.
- B를 `491da8df`·`9f201e4e`로 통합. B worker release. B 리뷰 `ctx_e5761caf29cb`(Opus high). C 시작 `ctx_1ef327b40012`(worktree `qsn-c`, base `9f201e4e`, Opus high).
- D 1단계 리뷰(Opus medium): 🔴 1(sending 항목만 남으면 목록 count 0으로 행이 사라짐) · 🟡 2(상태 줄이 `role=list` 직속, 턴 종료 거절 순서는 C 계약). 수정 1회차 `ctx_9def7c7d5668`(qsn-d, Opus medium). C에는 '거절 IPC 답보다 terminal 이벤트 publish가 먼저' 계약을 메시지로 보냈다.
- 통합 HEAD `9f201e4e`(A+B)에서 typecheck 통과, `npm --prefix app test` 244 files / 6349 tests 통과.
- D 수정 1회차 `1c2dbdf8`·`c14de93b`(🔴1·🟡1 반영, 테스트 6329·typecheck·build 통과). D 1단계+수정을 통합한다. 🟡2는 2단계 probe.
