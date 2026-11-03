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
