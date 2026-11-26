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
- conductor 런타임은 Claude다(lead와 같은 모델 계열).
- 모델 계열 교차: 사용자가 두 링크의 **배치 워커**에 Codex를 허가했다. 모델은 `gpt-6.1-sol`만, reasoning effort는 `high`까지다(20달러 Plus 구독). conductor 세션은 Codex로 띄우지 않는다. Claude 워커도 그대로 쓸 수 있다.
  - conductor는 링크를 시작할 때와 배치 워커를 띄우기 전마다 Codex 남은 한도를 확인한다: `node "$(ls -d ~/.claude/plugins/cache/claude-dashboard/claude-dashboard/*/dist/check-usage.js | sort -V | tail -1)" --json`의 `codex` 항목(5h·7d 사용률). 한도가 부족하면 Claude 워커로 띄우거나 사용자에게 묻는다.
  - Codex 워커가 일찍 턴을 끝내면 모델이 Sol에서 바뀌지 않았는지(터미널 하단 `GPT-6-… · <effort>`) 먼저 본다. Sol이 아니면 워커를 멈추고 사용자에게 묻는다.
  - 각 링크의 `orch.md`에 쓴 교차 범위(어느 배치가 Codex였는지, effort)를 적는다.
- `/agent-eval`은 AGENTS.md의 상시 예외대로 두 계열을 모두 돌린다.

## 로그인

- 실제 HOME의 Claude 로그인은 로그아웃 상태다(2026-11-26 lead 확인, `loginEnded: time_limit`). 사용자가 직접 다시 로그인하기로 했다. Orca 프로필 토큰 복사는 쓰지 않는다.
- 실제 Claude 턴이 필요한 단계(check-scope T5 `/agent-eval`, 필요하면 answer-popover T5)에 이르면 conductor는 먼저 `security find-generic-password -s "Claude Code-credentials" -w`의 `claudeAiOauth.expiresAt`가 0이 아닌지 확인한다. 아직 로그아웃이면 그 단계 전에 사용자에게 로그인을 요청하고 기다린다. 로그인 뒤에는 AGENTS.md 'Real agent sign-ins'대로 임시 홈에 복제해 쓰고 지운다.
- Codex 로그인은 `~/.codex/auth.json`에 있다.

## 진행 규칙

- [`/chain` 스킬](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기: conductor는 `/orchestrate`의 워커 대기 루프를 쓴다. 워커가 완료 신호 없이 멈추는 경우를 잡는다.
- `/agent-eval`: check-scope에 해당한다(안내, CLI 출력, `doan check` 인자가 바뀐다). answer-popover는 해당하지 않는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·머지 | 상태 |
|---|---|---|---|---|
| check-scope | Claude conductor `term_51e22458` · `~/orca/workspaces/doan-design/check-scope-orch` (`feat/check-scope`) | 2026-11-26 | — | 진행 중 |
| answer-popover | Claude conductor `term_8f1ba90a` · `~/orca/workspaces/doan-design/answer-popover-orch` (`feat/answer-popover`, 지움) | 2026-11-26 | PR #411 · `69e7d71df` | 머지 |

## 인계 기록

- 2026-11-26 lead: 체인 파일을 만들었다. 시작 점검은 아직 사용자와 확인하지 않았다.
- 2026-11-26 lead(이 체인을 만든 세션): 이 체인은 새 lead 세션이 이어서 진행한다. 새 lead가 알아야 할 것:
  - 시작 점검은 아직 사용자와 확인하지 않았다. 체인 시작 요청을 받으면 '시작 점검'을 한 번에 묻는다.
  - answer-popover 드래프트에서 고르지 않은 후보(바탕 B·C, 접힌 막대 B, 280×360 불채택안)는 지웠다(`426e68f06`). 남은 프레임이 구현 기준이다.
  - 로그인: 2026-11-26 subagent-progress PoC 때 실제 HOME의 Claude 로그인이 로그아웃 상태였다. 그래서 PoC는 Orca 프로필의 Keychain 항목(`Claude Code-credentials-36ffc8d1`)에서 refresh token을 비운 access token만 임시 홈에 복사해 썼다. 사용자는 그 PoC에 대해 이 방식을 허용했다. 이 체인에서 같은 방식을 쓸지는 시작 점검에서 다시 묻는다.
  - 체인 뒤 순서: canvas-chip(드래프트 확정, T1 PoC부터) → subagent-progress(T1·T1b PoC 완료, 드래프트 `.doan/canvases/subagent-progress.html` 확정, T3부터). subagent-progress의 PoC 스크립트와 기록은 main checkout의 `.scratch/subagent-progress/`에 있다.
  - subagent-progress에서 나눈 "Claude Code 프로세스를 대화 수명 동안 유지"는 아직 feature가 없다(`docs/BACKLOG.md` 'Undecided'). 사용자가 정한 방향이고, `/feature`로 시작해야 한다.
- 2026-11-26 lead(새 세션): 사용자와 시작 점검을 확인했다.
  - 로그인: 사용자가 실제 HOME의 Claude Code에 직접 다시 로그인한다. 토큰 복사는 쓰지 않는다('로그인').
  - Codex: 배치 워커에만 허가, Sol `high`까지, 워커를 띄우기 전 한도 확인('상시 권한'). 시작 시점 Codex 사용률 5h 2%, 7d 1%.
  - answer-popover T2 PoC 방식은 conductor가 design.md 기준으로 고르고 기록한다. 두 방식 모두 안 되면 멈추고 묻는다.
  - 두 링크를 병렬 그룹으로 함께 시작했다. 두 링크 모두 `7e8f22f75`에서 갈라졌다.
- 2026-11-26 lead: check-scope conductor가 알렸다. 사용자가 그 세션에서 T5 `/agent-eval`용으로 Doan 앱 프로필의 Claude 로그인(Keychain `Claude Code-credentials-9e813622`, refresh token 포함)을 임시 `CLAUDE_CONFIG_DIR`와 임시 Keychain 항목에 복제해 쓰고 지우는 방식을 승인했다. 복제본이 토큰을 갱신하면 Doan 앱의 Claude 로그인이 풀릴 수 있다. 이 승인은 check-scope T5에만 해당한다. 그 시점에 A·B를 통합했고 C(W14)는 리뷰 중이었다.
- 2026-11-26 lead: check-scope conductor가 알렸다. `/agent-eval` 전체 회차 `check-scope-261126`가 약 15분 만에 Codex 5시간 한도에 닿았다(Plus, 52%→100%, 리셋 뒤 약 12분에 0→19%). 30/94 실행에서 사용자가 그 세션에서 일회성 예외를 정했다: 이 링크는 전체 회차를 돌리지 않고 W14(새 시나리오)와 R10(앱 턴 프롬프트 변경)만 두 에이전트와 judge로 돌린다. 측정하지 않은 범위는 회차 기록과 PR 본문에 남긴다. 그 시점에 A·B·C를 통합했고 `a8ec42d41`에서 `verify --eval` PASS, 문서 승격(`6699110a5..855070cb2`)을 마쳤다.
- 2026-11-26 lead: 사용자가 머지 순서를 바꿨다. answer-popover PR #411을 check-scope보다 먼저 머지한다. 두 링크는 파일이 겹치지 않는 병렬 그룹이고, 순서는 머지 순서만 정했기 때문이다. 이유: #411 위에서 시작할 후속 수정(질문·권한 대기 중 Send now와 composer 제출 막기)을 check-scope를 기다리지 않고 띄우기 위해서다.
- 2026-11-26 lead: answer-popover PR #411을 머지했다(`69e7d71df`). conductor와 배치 워커 `ap-b2`의 worktree를 지웠고 브랜치는 남겼다. PR이 남긴 미검증 항목(로그인된 에이전트의 대기 이유 줄, OS 알림 클릭, 네이티브 IME·VoiceOver, 실제 트랙패드, draft `stack` 프레임(큐·예약 행·`/` 목록과 팝오버), Codex 질문, problem workspace 스트립)은 체인이 끝난 뒤 lead가 develop에서 확인한다. 다음 작업이 알아야 할 것: canvas-chip은 `ConversationThread.tsx`·`styles.css`를 바꾼다. 팝오버는 `.conversation-thread` 안 `.thread-scroll` 뒤에 그려지고, 포커스 검색은 `.conversation-thread` 루트에서 시작한다(ARCHITECTURE §7 'Thread focus').
