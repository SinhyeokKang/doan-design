# 체인 261113-2

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

## 순서

직렬 체인이다. 링크 2는 링크 1이 병합된 뒤 시작한다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1. `quick-open-conversations` | [spec](../quick-open-conversations/spec.md) · [design](../quick-open-conversations/design.md) · [tasks](../quick-open-conversations/tasks.md) | `/feature-review` 완료(`5abc704f`). 초안 `.doan/canvases/quick-open-conversations.html` 사용자 확인 완료(`7431dc49`, tasks 1 완료) | renderer만 바뀌는 작은 링크라 먼저 끝낸다 |
| 2. `usage-limit-resume` | [spec](../usage-limit-resume/spec.md) · [design](../usage-limit-resume/design.md) · [tasks](../usage-limit-resume/tasks.md) | `/feature-review` 완료(`330e8d8e`). 초안 `.doan/canvases/usage-limit-resume.html` 사용자 확인 완료(`35d2edc1`, tasks 2 완료). PoC는 로그 기반으로 완료(`92e38a89`, tasks 1 완료) | main·renderer·IPC를 함께 바꾸는 큰 링크라 뒤에 둔다 |

**직렬 판단**: 두 링크 모두 `app/src/renderer/homeRun.ts`를 바꾼다(링크 1은 미리 찾은 대상으로 여는 메서드와 `canvasRow`, 링크 2는 슬롯 우선순위). `App.tsx`도 함께 바꿀 가능성이 크다. 그래서 직렬로 둔다.

## 시작 점검

lead는 링크 1 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **실제 앱 확인 창**: 두 링크 모두 `/design-sync`와 `/runtime-test`에서 격리된 dev 앱 창을 띄운다(`app/runtime/` 격리, 임시 HOME·userData·SHELL). 사용자가 일하는 중에 창이 뜬다.
2. **링크 2 runtime-test 장치**: 한도 실패는 가짜 Claude CLI(`runners.ts`가 SDK에 넘기는 `pathToClaudeCodeExecutable`)로 만든다. Codex와 잠자기·깨어나기는 단위 테스트로만 확인하고 runtime 미확인으로 남긴다(tasks 8).
3. **링크 2 실제 한도 미확인**: 한도에 걸린 계정이 없어 PoC는 로그 기반이다. 한도 직후 Agent usage의 `limited`, 리셋 직후 전송의 수락 여부는 확인하지 않은 채로 구현하고, 승격 때 BACKLOG에 남긴다(design.md 'PoC 결과').
4. **링크 2 fixture**: 과거 Claude Code transcript와 Codex 세션 기록에서 필요한 줄만 골라 대화 내용을 지우고 `app/src/main/conversation/fixtures/`에 넣는다. 사용자의 실제 로그를 읽는다(읽기만 한다).

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합하고, 다음 링크를 시작한다.
- conductor 런타임은 Claude Code다. 모델 계열을 넘는 워커는 허가되지 않았다.

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- 두 링크 모두 로그인이 필요 없다.
- `/agent-eval`: 해당하지 않는다. 두 링크 모두 가이드, CLI 출력이나 메시지, `doan check` 규칙, 스킬 stub을 바꾸지 않는다.
- GUI probe는 짧게 돌린다. 사용자에게 화면이 필요한 동안과 끝난 때를 lead에게 알린다(`[conductor <slug>] GUI done` / `GUI again`).
- subagent와 워커는 `rm` 같은 삭제 명령을 쓰지 않는다. 사용자 터미널에 경고가 뜬다. 스크래치 파일은 `.scratch/`에 그대로 둔다.
- 체인과 별개로 lead 세션은 프로토타입 후속 feature 세 개의 `/feature` 라운드를 진행한다(BACKLOG 'Undecided': `prototype-conversation`, CLI로 프로토타입 열기, 프로토타입 Export). frame-prototype이 develop에 들어간 뒤 시작한다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1. `quick-open-conversations` | Claude Code · `quick-open-conversations-orch` (`feat/quick-open-conversations`) | 2026-11-13 16:05, `11bf5a9d` | | 진행 중 |
| 2. `usage-limit-resume` | | | | 대기 |

## 인계 기록

- 2026-11-13 lead(develop checkout): 사용자 요청으로 체인 파일을 썼다. 컨텍스트가 커서 다음 lead 세션에 인계한다. 다음 세션은 (1) 시작 점검을 사용자에게 한 번에 묻고 승인을 여기에 남긴 뒤 링크 1을 시작하고, (2) 링크가 도는 동안 프로토타입 후속 feature 세 개의 `/feature`를 쓴다.
- 2026-11-13 lead(develop checkout): 이전 체인 정리는 이미 끝나 있었다(PR #184 병합, `ba51bf23`에서 chain-261113-1 삭제). 사용자가 시작 점검 네 항목을 모두 승인했다. 링크 1을 시작한다. 브리프와 subagent 지시에 `rm` 같은 삭제 명령 금지를 넣는다.
- 2026-11-13 lead(develop checkout): 사용량 한도에 걸려 인계한다. 링크 1 conductor는 진행 중이다(PR 아직 없음). 프로토타입 후속 feature: `prototype-conversation` 문서는 커밋했다(`bae013c6`). `prototype-cli-export`(CLI 열기와 Export를 하나로 묶음)는 문서를 썼고 사용자 답을 반영하는 중이며 커밋 전이다. 새 feature `prototype-responsive`(Fit/Responsive 토글, 캔버스 툴바 스타일 재사용)는 문서를 쓰는 중이다. 헤더 오른쪽 끝은 [Export] [Conversation]이다. 별건으로 Home 크레딧 줄 초안 `.doan/canvases/home-credits.html`(미커밋)을 새 리뷰어가 검수 중이며, 수정 뒤 사용자에게 보인다. 다음 lead는 남은 두 feature를 커밋하고 `/feature-review` → `/design-draft` → 새 리뷰어 검수(critique·audit·clarify·harden) 순으로 진행한다.
- 2026-11-13 lead(develop checkout): 사용자 지시로, 링크 1을 병합한 뒤 링크 2를 바로 시작하지 않는다. 사용자가 계정을 바꾼 뒤 시작하라고 할 때까지 기다린다. 이 지시는 '상시 권한'의 "다음 링크를 시작한다"보다 우선한다.
