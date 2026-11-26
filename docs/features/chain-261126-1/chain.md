# chain-261126-1

## 규칙

- 이 체인은 [`/chain` 스킬](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains 규칙을 따른다.
- 이 파일은 lead만 고친다. conductor는 시작할 때 읽기만 한다.

## 순서

두 링크는 하나의 병렬 그룹이다. 바꾸는 파일이 겹치지 않는다.

- check-scope는 `cli/`(check, run, skill.md, designskill 프리셋), `schema/fixtures/cli-envelope/design-skill/`, `app/src/main/conversation/prompt.ts`, `eval/`(새 시나리오, `eval/lib/transcript.ts`)를 바꾼다.
- answer-popover는 `app/src/renderer/`(ConversationThread, conversationStore, questionDraft, overviewRun, CanvasConversationPanel, ProjectOverview, prototype/conversationRun, threadMotion, styles.css)와 그 테스트를 바꾼다. 드래프트는 이미 develop에 있다.
- 공유 문서(PRODUCT, ARCHITECTURE, DESIGN, BACKLOG 등)는 겹침으로 세지 않는다.

1. **check-scope** — [spec](../check-scope/spec.md) · [design](../check-scope/design.md) · [tasks](../check-scope/tasks.md)
   - `/feature-review` 완료. UI 드래프트 없음.
   - 앞에 두는 이유: 머지 순서만 정한다. 범위가 작고 Go 중심이라 먼저 끝날 가능성이 크다.
2. **answer-popover** — [spec](../answer-popover/spec.md) · [design](../answer-popover/design.md) · [tasks](../answer-popover/tasks.md)
   - `/feature-review` 완료, 드래프트 `.doan/canvases/answer-popover.html` 사용자 확정(2026-11-26).
   - 뒤에 두는 이유: 스레드, 따라가기, 진입점을 함께 바꾸는 큰 링크다.

체인 뒤의 작업: canvas-chip은 `prompt.ts`(check-scope와 겹침)와 `ConversationThread.tsx`·`styles.css`(answer-popover와 겹침)를 바꾸므로 이 체인이 모두 머지된 뒤 시작한다. subagent-progress는 그다음이다.

## 시작 점검

lead는 링크를 시작하기 전에 아래를 사용자와 한 번에 확인하고, 승인을 '인계 기록'에 적는다. 승인 뒤에는 conductor가 일상적인 판단을 스스로 하고, 새로운 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

- 두 기능 문서에 '확인 필요'로 남은 항목은 없다.
- answer-popover T2 PoC(끝 여백 방식 A·B)의 결과로 방식을 고르는 것은 conductor가 design.md 기준으로 정하고 기록한다. 두 방식 모두 요구 항목을 못 채우면 멈추고 묻는다.
- answer-popover T5 `/runtime-test`는 가짜 스트림으로 요청을 만든다. 실제 provider 턴이 꼭 필요하면 AGENTS.md 'Real agent sign-ins'대로 로그인을 임시 홈에 복제해 쓰고 지운다. 실제 HOME의 Claude 로그인은 2026-11-26 PoC 때 이미 로그아웃 상태였다(Keychain `Claude Code-credentials`, `loginEnded: time_limit`). 이때 Orca 프로필의 Claude 인증에서 access token만 복사해 썼고, 사용자가 이 방식을 허용했다. 이 체인에서도 같은 방식을 쓸지 확인한다.
- check-scope T5는 `/agent-eval` 전체 회차를 돌린다(실제 Claude Code와 Codex, 패키지 CLI 필요). 위와 같은 로그인 상태에서 eval이 실제 Claude Code를 돌릴 수 있는지 확인한다. Codex 로그인은 `~/.codex/auth.json`에 있다.

## 상시 권한

- lead는 각 링크의 PR을 리뷰와 gate 통과 뒤 링크 순서대로 develop에 머지한다(체인 기본값). 두 링크는 함께 시작하고, check-scope PR을 먼저, answer-popover PR을 나중에 머지한다.
- conductor와 워커의 런타임은 Claude다(lead와 같은 모델 계열). 모델 계열을 넘는 허가는 없다. 단 `/agent-eval`은 AGENTS.md의 상시 예외대로 두 계열을 모두 돌린다.

## 진행 규칙

- [`/chain` 스킬](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기: conductor는 `/orchestrate`의 워커 대기 루프를 쓴다. 워커가 완료 신호 없이 멈추는 경우를 잡는다.
- `/agent-eval`: check-scope에 해당한다(안내, CLI 출력, `doan check` 인자가 바뀐다). answer-popover는 해당하지 않는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·머지 | 상태 |
|---|---|---|---|---|
| check-scope | — | — | — | 대기 |
| answer-popover | — | — | — | 대기 |

## 인계 기록

- 2026-11-26 lead: 체인 파일을 만들었다. 시작 점검은 아직 사용자와 확인하지 않았다.
- 2026-11-26 lead(이 체인을 만든 세션): 이 체인은 새 lead 세션이 이어서 진행한다. 새 lead가 알아야 할 것:
  - 시작 점검은 아직 사용자와 확인하지 않았다. 체인 시작 요청을 받으면 '시작 점검'을 한 번에 묻는다.
  - answer-popover 드래프트에서 고르지 않은 후보(바탕 B·C, 접힌 막대 B, 280×360 불채택안)는 지웠다(`426e68f06`). 남은 프레임이 구현 기준이다.
  - 로그인: 2026-11-26 subagent-progress PoC 때 실제 HOME의 Claude 로그인이 로그아웃 상태였다. 그래서 PoC는 Orca 프로필의 Keychain 항목(`Claude Code-credentials-36ffc8d1`)에서 refresh token을 비운 access token만 임시 홈에 복사해 썼다. 사용자는 그 PoC에 대해 이 방식을 허용했다. 이 체인에서 같은 방식을 쓸지는 시작 점검에서 다시 묻는다.
  - 체인 뒤 순서: canvas-chip(드래프트 확정, T1 PoC부터) → subagent-progress(T1·T1b PoC 완료, 드래프트 `.doan/canvases/subagent-progress.html` 확정, T3부터). subagent-progress의 PoC 스크립트와 기록은 main checkout의 `.scratch/subagent-progress/`에 있다.
  - subagent-progress에서 나눈 "Claude Code 프로세스를 대화 수명 동안 유지"는 아직 feature가 없다(`docs/BACKLOG.md` 'Undecided'). 사용자가 정한 방향이고, `/feature`로 시작해야 한다.
