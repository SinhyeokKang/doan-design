# prompt-suggestion — orch

원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261105](../chain-261105/chain.md) 링크 2.

- 시작 hash: `942041d6`(origin/main, P1 결과 반영 뒤)
- 통합 branch: `feat/prompt-suggestion`
- 지휘자: Claude Code(Opus), worktree `/Users/sinhyeok/orca/workspaces/doan-design/prompt-suggestion-orch`

## 결정 기록

- P1은 사용자와 함께 마쳤다(2026-11-05, Claude Code 2.1.318). 결과와 고친 결정(결정 2: Doan이 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=true` 기본값, shell 값이 이김, probe가 이 변수를 읽음 / 결정 5: group stop / P1-b의 앱 확인은 E1(c))은 design 'PoC 결과'와 `6ad651d3`에 있다. 사용자가 이대로 계속하기로 했다.
- 링크 3 PoC를 사용자와 하는 동안 작업자를 먼저 띄운다(사용자 제안). 링크 3 PoC는 `.scratch/context-window-ring/`의 script와 공용 프로필만 쓰고 이 branch의 코드를 바꾸지 않는다.
- renderer 배치 R은 main 배치 M의 `ConversationSummary.suggestion`을 기다리지 않는다(지휘자 판단 — orchestrate §0.4). 두 host가 summary의 제안을 넘기는 연결과 `homeRun.test.ts` 사례는 R의 '미룬 항목'이고, M의 summary 커밋을 통합한 뒤 새 Task로 보낸다.
- box 모양의 빈 placeholder(제안 포함)는 capsule과 같은 한 줄 말줄임이다(사람, R의 질문 — docked의 빈 입력란 최소 높이가 한 줄이라 두 줄 clamp는 스크롤을 만든다). spec 3·design renderer 2·tasks E1(a)·Z1을 고쳤다.
- E1(실제 앱 확인)은 공용 프로필과 사람의 키보드가 필요해서 지휘자가 `/runtime-test`로 한다.

## Codex 사용

- 링크 시작 때 Orca Codex 계정의 주간 사용량: 79% 사용(2026-11-05 14시대, 사용자가 확인). 같은 계정의 가장 최근 rollout `rate_limits`(`window_minutes: 10080`)는 69%였는데, 13:03Z 기록이라 늦은 값이었다. 모델 목록에 `gpt-6-astra`, `gpt-6.1-sol`이 있다.
- 범위: 구현 배치 리뷰(M·R)만 Codex Astra medium이 맡기로 했다(다른 계열의 독립 리뷰). 남은 21%를 링크 3과 나눠 써야 해서 구현은 Claude가 한다.
- R 리뷰의 Codex Astra 작업자(`ctx_97ca8de5f372`)가 "Selected model is at capacity"로 멈췄다(그때 주간 18% 남음). 지휘자 판단으로 멈추고 같은 Task를 Claude Opus medium 리뷰어로 다시 띄웠다(`ctx_fd5653fc3ad6`). 남은 리뷰도 Claude로 한다 — 주간 한도가 링크 3에 남도록 둔다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| M | A1, B1, B2 | `app/src/main/conversation/` 의 새 `promptSuggestion.ts`(+test), `summary.ts`·`service.ts`·`runners.ts`·`environment.ts`·`prepare.ts`(+각 test), `app/src/main/onboarding/machine.ts`(+test), `app/src/main/index.ts` | 없음 | Claude Opus high — live·turnId 울타리, 다음 send의 group stop, 종료 예산. 틀리면 send가 `busy`가 되거나 늦은 제안이 다음 턴을 건드린다 | `npm --prefix app test`(새 사례 red→green 기록), typecheck | 대기 |
| R | A2, C1(host의 summary 연결 제외) | `app/src/renderer/` 의 `dockedRules.ts`·`homeComposer.ts`·`chipField.ts`·`ComposerParts.tsx`·`DockedComposer.tsx`(+각 test), `styles.css`, `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`(placeholder 식 교체만) | 없음 | Claude Opus high — 키 판정, IME, undo history, 접근성 알림. 틀리면 글자를 잃거나 제안이 보내진다 | `npm --prefix app test`, typecheck, build | 대기 |
| R2 | C1의 host 연결, `homeRun.test.ts` 사례 | `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`(+test), `homeRun.ts`(+test) | M의 summary, R 통합 | R과 같은 작업자 | 위와 같음 | 대기 |
| 지휘자 | E1, Z1, Z2 | `docs/PRODUCT.md`·`docs/ARCHITECTURE.md`·`docs/DESIGN.md`, feature 디렉터리 삭제, `.scratch/runtime-test/prompt-suggestion/` | M, R, R2 통합 | — | `/runtime-test` 보고, 통합 HEAD `/verify` | 대기 |

리뷰: M·R(R2 포함) 각각 Codex Astra medium 독립 리뷰(`/code-review`, 보고만). 🔴가 0이 될 때까지 소유 작업자에게 고칠 것을 보낸다.

## 파일 겹침과 순서

- 1차(병렬): M, R. M은 `app/src/main/`, R은 `app/src/renderer/`만 고친다. 겹치는 파일이 없다.
- 2차: R2. host가 `ConversationSummary.suggestion`(M의 `summary.ts`)을 읽는다.
- 마지막: 지휘자가 E1, Z1, Z2를 한다.

## 항목 대응

P1→지휘자(완료), A1→M, A2→R, B1→M, B2→M, C1→R·R2, E1→지휘자, Z1→지휘자, Z2→지휘자. 주인 없는 항목 0.

## 실행

- Orca run `run_59a44f7535ec`. 1차 작업자는 `722fac80`에서 갈라졌다.
- M: dispatch `ctx_99df85acb907`, worktree `prompt-suggestion-m`, Claude Opus high(launch 확인).
- R: dispatch `ctx_debd4ad423fe`, worktree `prompt-suggestion-r`, Claude Opus high(launch 확인).
