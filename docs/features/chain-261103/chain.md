# orchestrate chain — 2026-11-03

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다. 상시 권한과 인계 규칙은 이전 체인(커밋 `09b6f50a`, 병합 뒤 삭제)과 같다(2026-11-03 사용자).

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 세 feature 모두 사용자 판단으로 `/feature-review`와 `/design-draft`를 건너뛴다. 확인은 실제 앱 스크린샷(`/runtime-test`)으로 한다.

1. `project-remove-confirm` — [spec](../project-remove-confirm/spec.md)·[design](../project-remove-confirm/design.md)·[tasks](../project-remove-confirm/tasks.md). 버그(캔버스를 연 채 프로젝트를 Remove하면 Home으로 가지 않음)가 들어 있어 먼저 한다. `App.tsx`와 main `index.ts`·`menuState.ts`에서 Undo Remove 경로를 지운다. 링크 3이 같은 파일에 View 메뉴 항목과 `menu:state` 입력을 더하므로, 지운 뒤의 메뉴 위에서 시작하게 앞에 둔다. `/postmortem` 항목을 쓴다.
2. `canvas-selection-tools` — [spec](../canvas-selection-tools/spec.md)·[design](../canvas-selection-tools/design.md)·[tasks](../canvas-selection-tools/tasks.md). `CanvasController.ts`와 `styles.css`(jump 강조)에 모인다. 다른 두 링크와 겹치는 파일이 적다. 강조 강도는 tasks R2의 실제 앱 비교로 정하고, 사용자에게 스크린샷을 보여 확인받는다.
3. `shell-panel-layout` — [spec](../shell-panel-layout/spec.md)·[design](../shell-panel-layout/design.md)·[tasks](../shell-panel-layout/tasks.md). 가장 크다(패널 폭, Overview 패널 리사이즈, Overview New conversation 버튼, 사이드바 숨기기 ⌘B). 링크 1이 정리한 메뉴와 `App.tsx` 위에서 마지막으로 한다.

## 시작 점검 (첫 지휘자)

첫 지휘자는 링크 1을 시작하기 전에 체인의 세 feature를 점검하고, 사용자에게 한 번에 승인을 받는다. 승인 뒤에는 링크마다 멈추지 않는다. 점검에서 끝낼 것:

- 세 feature 문서에 '확인 필요'가 남지 않았는지 확인한다(2026-11-03에 모두 결정으로 바꿨다).
- 링크 3의 T0(⌘B가 입력창·iframe에 포커스가 있을 때도 메뉴 단축키로 오는지 확인하는 `.scratch/` Electron PoC)의 실행 명령을 사용자에게 확인받는다. tasks.md에 "명령 미정 — 사용자 확인 필요"로 남아 있다.
- 각 링크의 `/runtime-test`에 provider 로그인이 필요한지 정한다. 필요하면 아래 '로그인'대로 한 번에 만든다.
- 위 결과와 남은 결정을 사용자에게 한 번에 보이고 일괄 승인을 받는다. 승인 내용은 이 파일의 '인계 기록'에 적는다.

승인 뒤 각 지휘자는 일상적인 판단을 스스로 한다. 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정이 생길 때만 묻는다.

## 상시 권한 (2026-11-03 사용자, 이전 체인과 같음)

- **main 병합**: 모든 링크가 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **Codex 작업자**: 모든 링크에서 Claude 지휘자가 Codex 작업자를 섞어 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 지휘자는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고(예: `claude-dashboard:check-usage`), 남은 양에 맞춰 Codex에 줄 배치를 정한다. 주 구현은 Claude가 맡고, Codex는 독립 리뷰와 일부 기계적 배치에 쓴다. 모델·effort는 orchestrate §0의 Codex 규칙을 따른다. 사용한 범위는 각 링크의 orch.md에 적는다.
- 그 밖의 권한(새 의존성, 범위 밖 변경)은 평소대로 사용자에게 묻는다.

## 로그인 (필요한 링크만)

- provider 로그인이 필요한 probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 필요하면 첫 지휘자가 시작 점검에서 체인 전체에 필요한 로그인을 사용자 브라우저 승인으로 한 번에 만든다.
- 로그인한 userData는 링크 worktree가 아니라 main checkout의 절대 경로 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 달라서다. `DOAN_RUNTIME`과 repo는 probe마다 임시로 둔다.
- 모든 링크가 이 프로필을 재사용한다. 프로필을 망가뜨릴 수 있는 probe는 복사본으로 돌린다. 로그인을 다시 요청하기 전에 프로필이 연결되어 있는지 먼저 확인한다.
- 링크마다 병합할 때 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 로그아웃하고 Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다.

## 인계와 물러나기

- 각 링크는 새 Claude Code 세션과 최신 `origin/main`에서 만든 새 Orca worktree에서 시작한다(`/chain` §3 'One session per link').
- 나가는 지휘자는 링크를 끝까지 마친다: 배치 통합, 최종 `/verify`, 문서 승격과 feature 디렉터리 삭제, PR push·병합, local main pull, 배치 worktree 정리. 그 뒤 이 파일에 결과(병합 커밋, PR, 확인하지 못한 항목, 다음 링크가 알아야 할 결정)를 적고 main에 push한다.
- 다음 링크 세션을 이 파일·다음 feature 문서·아직 적지 않은 사항을 가리키는 브리프로 띄우고, 새 세션이 브리프로 시작한 것을 확인할 때까지 질문에 답한다.
- 확인되면 물러난다(`/chain` §3 'Retire'). 새 세션의 것은 닫지 않고, 자기 worktree가 깨끗하고 main에 모두 들어갔는지(`git cherry`에 `+` 없음) 확인한 뒤 worktree를 지우거나 사용자에게 세션을 닫아 달라고 하고 보고한다.

## 운영 메모

- worker 대기 루프는 heartbeat·status를 조용히 ack하고 `worker_done`·`question`·`escalation`에만 깨운다. 작업자가 `worker_done` 없이 멈출 수 있으므로 idle 프롬프트나 working이 아닌 상태에서도 깨운다.
- 세 링크 모두 가이드·CLI 출력·`doan check` 규칙·skill stub을 바꾸지 않으면 `/agent-eval`은 돌지 않는다. 바꾸게 되면 패키지 앱을 빌드한 뒤 돌린다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 project-remove-confirm | (인계 시 기록) | | | 대기(시작 점검 후) |
| 2 canvas-selection-tools | | | | 대기 |
| 3 shell-panel-layout | | | | 대기 |

## 인계 기록

- 2026-11-03 체인 작성 세션: 순서와 상시 권한(이전 체인과 같음)을 사용자와 정해 이 파일을 main에 push했다. 첫 지휘자는 '시작 점검'부터 한다.
