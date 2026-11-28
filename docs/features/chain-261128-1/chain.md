# chain-261128-1 — canvas-message → subagent-progress

## 규칙

- [chain 스킬](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다.

## 순서

직렬이다. 두 링크 모두 `app/src/main/conversation/service.ts`(큐·handoff 경로)와 `app/src/renderer/threadItems.ts`, `ConversationThread.tsx`, `styles.css`를 바꾸므로 병렬로 돌리지 않는다.

1. **canvas-message** — [spec](../canvas-message/spec.md) · [design](../canvas-message/design.md) · [tasks](../canvas-message/tasks.md)
   - `/feature-review` 반영됨(3151cc0f1). 드래프트 `.doan/canvases/canvas-message.html` 확정(tasks T1 완료, design '드래프트 확정').
   - 시작 조건: canvas-chip이 develop에 머지됐다(`git ls-tree origin/develop docs/features/canvas-chip`가 비어 있다). canvas-chip은 이 chain 밖의 `/orchestrate` 컨덕터(`feat/canvas-chip`)가 돌리고 있다.
   - 순서 이유: subagent-progress의 tasks가 canvas-message 머지를 구현(T3) 시작 조건으로 둔다.
2. **subagent-progress** — [spec](../subagent-progress/spec.md) · [design](../subagent-progress/design.md) · [tasks](../subagent-progress/tasks.md)
   - `/feature-review` 반영됨(822425ceb). PoC T1·T1b 완료. 드래프트 `.doan/canvases/subagent-progress.html` 확정(design '확정').
   - 순서 이유: canvas-message가 바꾸는 큐·handoff 경로와 `threadItems.ts` 위에 얹는다.
   - T9(후행 기능 시작)는 lead 몫이다. 링크 머지 뒤 lead가 사용자에게 알린다.

## 시작 점검

- 두 링크 모두 리뷰와 드래프트 확정이 끝났고, 문서에 남은 '열린 질문'은 드래프트 결정으로 답이 났다(subagent-progress design '드래프트에서 정한 것' 명령 행).
- 실제 에이전트 실행(subagent-progress T6 `/runtime-test`)은 AGENTS.md 'Real agent sign-ins'대로 로그인 복사본으로 한다. 앱 안 provider 로그인은 필요 없다.
- 남은 점검 항목이 없어 사용자에게 따로 묻지 않았다. 시작 승인은 `인계 기록`에 있다.
- 승인 뒤 컨덕터는 일상적인 판단을 스스로 내리고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

## 상시 권한

- lead는 각 링크의 PR을 리뷰와 gate 통과 뒤 링크 순서대로 develop에 머지하고 다음 링크를 시작한다.
- lead는 canvas-chip이 머지되면 링크 1을, 링크 1이 머지되면 링크 2를 사용자에게 다시 묻지 않고 시작한다.
- 컨덕터 runtime은 Claude Code다(lead와 같은 계열). 모델 계열을 넘는 허락은 없다.

## 진행 규칙

- [chain 스킬 §3](../../../.agents/skills/chain/SKILL.md#3-running-the-links).

## 운영 메모

- 컨덕터는 워커를 기다리는 동안 터미널이 자주 쉰다. lead의 감시는 PR이 열릴 때 깨운다.
- `/agent-eval`: canvas-message는 CLI 출력이나 안내(`send`, handoff)를 바꾸면 AGENTS.md 'Workflow'의 조건에 걸린다. 해당 여부는 각 컨덕터가 PR 본문에 적는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·머지 | 상태 |
|---|---|---|---|---|
| canvas-message | — | — | — | 대기(canvas-chip 머지 대기) |
| subagent-progress | — | — | — | 대기 |

## 인계 기록

- 2026-11-28 lead: chain 파일을 썼다. 사용자가 "chain으로 지금 묶어놓고, 시작할 차례되면 알아서 띄워줘"라고 해서, 시작 조건이 차면 각 링크를 따로 묻지 않고 시작한다.
