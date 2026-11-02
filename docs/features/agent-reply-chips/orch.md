# agent-reply-chips — orch

- 계획: [spec](spec.md)·[design](design.md)·[tasks](tasks.md). 체인: [chain-261103](../chain-261103/chain.md) 링크 4.
- 시작: main 2a052b3c(47952cb7 위에 링크 4 시작 기록). 통합 브랜치 `feat/agent-reply-chips`.
- 지휘자: Claude Code 세션 0344e3fb(Opus), worktree `agent-reply-chips-orch`.

## 결정 기록

- 규칙 J 전제(spec 문제·결정 2·완료 조건·비목표, design 형식, tasks T5): canvas-open-offer가 바꾼 규칙에 맞춰 고쳤다. 에이전트는 `doan://` 링크를 최종 답에 넣지 않고 열어 줄지 묻는다. 앱 대화에서는 `OPEN_GUIDANCE`가 그 제안도 막는다. 칩 링크 줄은 `OPEN_GUIDANCE`와 함께 두고 제안이 아니라 위치임을 밝힌다. — 지휘자 재량, chain.md 링크 3 인계 기록.
- R8b → R8c: canvas-open-offer가 이미 R8을 R8b로 바꿨으므로 겹치지 않는 id를 쓴다. R8c rubric은 `doan:` 위치 링크를 허용하고 `doan://` 링크와 열기 제안은 R8b처럼 partial이다. — 지휘자 재량, 체인 시작 점검.
- 다른 캔버스 칩의 이동은 `openLink`와 같은 `decideOpen`(`openDecision.ts`) 경로를 쓴다. main `resolveOpenTarget`은 root와 경로로 찾으므로 쓰지 않는다. 칩의 판정은 캔버스 id로 `replyChipTarget`이 한다. — 지휘자 재량, canvas-open-offer design '다른 feature와의 관계'.
- 작업자는 모두 Claude다. Codex 주간 한도가 9% 남아(91% 사용, 2026-11-04 15:35 KST 초기화) 체인 규칙대로 Codex 작업자를 쓰지 않는다. 리뷰는 Claude 서브에이전트로 한다. `/agent-eval`은 Claude 쪽을 먼저 돌리고 Codex 쪽을 따로 돌린다. Codex 쪽이 한도로 못 돌면 그 사실을 기록하고, Claude 쪽이 pass이면 병합한다(체인 진행을 막지 않기 위해서다). — 링크 4 브리프.
- `/design-sync`는 tasks에 없다. 칩은 기존 `SentChip` 모양을 재사용한다. 모양은 T7 `/runtime-test` 스크린샷으로 초안과 대조한다. — 지휘자 재량.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| A1 | T0·T1·T2 | `app/src/main/conversation/types.ts`, `app/src/main/canvasScript.ts`+테스트, `CanvasController.ts`의 `locate`만, 새 `app/src/main/conversation/replyAnchor.ts`+테스트, renderer 새 파일(`replyUrlTransform`, `replyChipTarget`)+테스트 | 없음 | Claude Sonnet high: 순수 함수와 테스트 목록이 정해져 있다. 파싱은 신뢰하지 않는 입력이라 high | app test·typecheck, verify | 진행(dispatch ctx_f7f2ef82c851, worktree `agent-reply-chips-a1`) |
| B | T5·T6 | `app/src/main/conversation/prompt.ts`+테스트, `eval/`(R8b→R8c, 새 R9, `eval/lib` `finalAnswer`), `docs/USABILITY-EVAL.md` | T6은 A1의 T1 커밋 | Claude Sonnet high: 프롬프트 한 줄과 eval 시나리오. 선례(R8b, H4)가 있다 | app test, eval unit, self-test, `/agent-eval` | 진행(dispatch ctx_7a1af6eff60b, worktree `agent-reply-chips-b`) |
| A2 | T3·T4 | `ConversationThread.tsx`+테스트, `CanvasController.ts`, `App.tsx`+테스트, `CanvasConversationPanel.tsx`, `ProjectOverview.tsx` | A1 통합 | Claude Opus high: 이동·방문 기록·대기 locate 수명 주기·root 경계 판단이 많다 | app test·typecheck·build, verify | 대기 |
| C | T7 | `.scratch/runtime-test/agent-reply-chips/` | A2 통합 | Claude Sonnet high: probe 선례가 있다 | probe exit 0, 스크린샷, real-state | 대기 |
| 지휘자 | T8·Z1 | 통합 브랜치, `docs/` 승격 | 모든 배치 | — | `/verify --eval`, Z1 grep | 대기 |

Orca run `run_09060a2df817`. 리뷰: RA1·RB는 Claude Sonnet 서브에이전트, RA2는 Claude Opus 서브에이전트(`/code-review`, 보고만).

## 겹침과 순서

- A1과 B는 파일이 겹치지 않아 함께 시작한다. B는 T5와 R8c를 먼저 하고, A1의 T1 커밋이 feat에 들어오면 rebase해 T6을 한다.
- A1과 A2는 `CanvasController.ts`가 겹치므로 직렬이다.
- C는 A2 통합 뒤, B의 `/agent-eval`과 GUI가 겹치지 않게 돌린다.
