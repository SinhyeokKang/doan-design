# orchestrate chain — 2026-11-03

규칙: [`/orchestrate` §6 'Linked runs'](../../../.agents/skills/orchestrate/SKILL.md), AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 순서는 고치는 파일이 겹치는 feature를 앞뒤로 붙여, 뒤 링크가 앞 링크의 결과 위에서 시작하도록 정했다.

1. `canvas-hand-tool` — [spec](../canvas-hand-tool/spec.md)·[design](../canvas-hand-tool/design.md)·[tasks](../canvas-hand-tool/tasks.md). `/feature-review`와 초안 확정(D1)을 마쳤다. 가장 작다. `CanvasController.ts`·`canvasScript.ts`·`App.tsx`를 먼저 정리해 링크 4의 locate 작업이 그 위에서 시작한다.
2. `project-settings` — [spec](../project-settings/spec.md)·[design](../project-settings/design.md)·[tasks](../project-settings/tasks.md). buzz-restyle의 자식 13번이다(부모 규칙을 따른다). `ShellSidebar.tsx`·`App.tsx`·가이드 `skill.md`를 고친다. 링크 5도 `ShellSidebar.tsx`의 행 메뉴와 `skill.md`를 고치므로 그보다 먼저 둔다.
3. `canvas-open-offer` — [spec](../canvas-open-offer/spec.md)·[design](../canvas-open-offer/design.md)·[tasks](../canvas-open-offer/tasks.md). 이 파일을 쓸 때 `/feature-review`가 진행 중이었다(spec만 intake했다). 가이드 규칙 J, 턴 프롬프트(`prompt.ts`), 앱 소켓 v4, 에이전트 설정을 바꾼다. 링크 4도 `prompt.ts`에 규칙 J 링크를 언급하는 한 줄을 넣으므로, 규칙 J를 먼저 바꿔 링크 4가 새 규칙 위에서 그 줄을 쓰게 한다.
4. `agent-reply-chips` — [spec](../agent-reply-chips/spec.md)·[design](../agent-reply-chips/design.md)·[tasks](../agent-reply-chips/tasks.md). `/feature-review`를 마쳤다. D1 초안 `agent-reply-chips.html`은 시작 점검에서 그리고 확정했다. 링크 1의 locate·`openCanvas`와 링크 3의 규칙 J 위에서 시작한다. intake에서 T5의 "규칙 J의 링크는 최종 답의 캔버스 목록으로 그대로 둔다"를 링크 3의 결과에 맞게 고친다.
5. `canvas-row-menu` — [spec](../canvas-row-menu/spec.md)·[design](../canvas-row-menu/design.md)·[tasks](../canvas-row-menu/tasks.md). P1·P2(문구, 초안)를 마쳤다. 가장 크다(Go `doan export`, viewer, 휴지통 IPC, 사이드바). 앞 링크들이 고친 사이드바와 가이드 위에서 마지막으로 정리한다. design의 전제였던 terminal-agent-activity는 이미 main에 있다.
6. `setup-via-onboarding` — [spec](../setup-via-onboarding/spec.md)·[design](../setup-via-onboarding/design.md)·[tasks](../setup-via-onboarding/tasks.md). 2026-11-03에 체인 작성 세션이 `/feature`로 만들고 링크로 더했다(사용자). `/feature-review`는 시작 점검에서 마쳤다(5521360b). 가이드 'Onboarding'과 `doan init` 줄을 고치고 새 eval O3를 더한다. 링크 2·3·5가 고친 가이드와 출력 예산 위에서 마지막으로 정리한다. UI가 없어 초안이 없다.

## 시작 점검 (첫 지휘자, 2026-11-03 사용자)

첫 지휘자는 링크 1을 시작하기 전에 체인의 모든 feature(링크 1–6)를 점검하고, 사용자에게 한 번에 승인을 받는다. 승인 뒤에는 링크마다 멈추지 않는다. 점검에서 끝낼 것:

- 모든 feature의 `/feature-review`가 끝났는지 확인한다. 링크 3(canvas-open-offer)은 이 파일을 쓸 때 리뷰 중이었고(뒤에 465c5fa9로 마침), 링크 6(setup-via-onboarding)은 리뷰 전에 더해졌다.
- 사람이 확인해야 하는 초안을 모두 확정한다: 링크 2의 `buzz-project-settings.html`(2026-11-03에 수정됨, feature 문서에 확정 기록 없음), 링크 4의 D1 새 초안(`/design-draft`로 그린다). 링크 1·5의 초안은 확정됐다.
- 문서에 남은 열린 점을 사용자 결정으로 닫는다. 예: 링크 1 design '열린 점'(위조된 클릭 선택 메시지가 composer 포커스를 가져가는 문제의 대응).
- 체인 전체에 필요한 provider 로그인을 만든다(아래 '로그인').
- 위 결과와 남은 결정을 사용자에게 한 번에 보이고 일괄 승인을 받는다. 승인 내용은 이 파일의 '인계 기록'에 적는다.

승인 뒤 각 지휘자는 일상적인 판단을 스스로 한다. 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정이 생길 때만 묻는다.

## 상시 권한 (2026-11-03 사용자)

- **main 병합**: 모든 링크가 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **Codex 작업자**: 모든 링크에서 Claude 지휘자가 Codex 작업자를 섞어 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 지휘자는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고(예: `claude-dashboard:check-usage`), 남은 양에 맞춰 Codex에 줄 배치를 정한다. 주 구현은 Claude가 맡고, Codex는 독립 리뷰와 일부 기계적 배치에 쓴다. 모델·effort는 orchestrate §0의 Codex 규칙을 따른다. 사용한 범위는 각 링크의 orch.md에 적는다.
- 그 밖의 권한(새 의존성, 범위 밖 변경)은 평소대로 사용자에게 묻는다.

## 로그인 (2026-11-03 사용자)

- 모든 링크는 실제 HOME(Keychain)의 provider 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 첫 지휘자가 시작 점검에서 체인 전체에 필요한 로그인(Claude Code, Codex 등 각 feature의 runtime-test 범위로 정한다)을 사용자 브라우저 승인으로 한 번에 만든다.
- 로그인한 userData는 링크 worktree가 아니라 main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 달라서다. `DOAN_RUNTIME`과 repo는 probe마다 임시로 둔다.
- 모든 링크가 이 프로필을 재사용한다. 프로필을 망가뜨릴 수 있는 probe는 복사본으로 돌린다. 로그인을 다시 요청하기 전에 프로필이 연결되어 있는지 먼저 확인한다.
- 링크마다 병합할 때 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 로그아웃하고 Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다.

## 인계와 물러나기

- 각 링크는 새 Claude Code 세션과 최신 `origin/main`에서 만든 새 Orca worktree에서 시작한다(§6 'One session per link').
- 나가는 지휘자는 링크를 끝까지 마친다: 배치 통합, 최종 `/verify`, 문서 승격과 feature 디렉터리 삭제, PR push·병합, local main pull, 배치 worktree 정리. 그 뒤 이 파일에 결과(병합 커밋, PR, 확인하지 못한 항목, 다음 링크가 알아야 할 결정)를 적고 main에 push한다.
- 다음 링크 세션을 이 파일·다음 feature 문서·아직 적지 않은 사항을 가리키는 브리프로 띄우고, 새 세션이 브리프로 시작한 것을 확인할 때까지 질문에 답한다.
- 확인되면 물러난다(§6 'Retire'). 컨텍스트를 링크마다 새로 시작하기 위해서다. 새 세션의 것은 닫지 않고, 자기 worktree가 깨끗하고 main에 모두 들어갔는지(`git cherry`에 `+` 없음) 확인한 뒤 worktree를 지우거나 사용자에게 세션을 닫아 달라고 하고 보고한다.

## 운영 메모

- worker 대기 루프는 heartbeat·status를 조용히 ack하고 `worker_done`·`question`·`escalation`에만 깨운다. 작업자가 `worker_done` 없이 멈출 수 있으므로 idle 프롬프트나 working이 아닌 상태에서도 깨운다.
- `/agent-eval`을 도는 링크(2·3·4·5·6)는 패키지 앱을 빌드한 뒤 돌린다. 실제 에이전트 상태를 건드린다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 canvas-hand-tool | Claude Code 세션 ceb45427, worktree `canvas-hand-tool-orch` | 2026-11-03 | | 진행 중 |
| 2 project-settings | | | | 대기 |
| 3 canvas-open-offer | | | | 대기 |
| 4 agent-reply-chips | | | | 대기 |
| 5 canvas-row-menu | | | | 대기 |
| 6 setup-via-onboarding | | | | 대기 |

## 인계 기록

- 2026-11-03 체인 작성 세션: 순서와 상시 권한을 사용자와 정해 이 파일을 main에 push했다. 첫 지휘자는 '시작 점검'부터 한다.
- 2026-11-03 첫 지휘자(링크 1, 세션 ceb45427): 시작 점검을 마치고 사용자의 일괄 승인을 받았다. 승인 내용은 다음과 같다.
  - `/feature-review`: 링크 1–5는 이미 끝나 있었다(링크 5는 6893929b). 링크 6은 product·tech·qa로 돌리고 사용자 결정을 반영했다(5521360b). 첫 실행이 끝났으면 select까지만 하고 O3b를 더한다. 앱에 닿지 못하면 init으로 가고 알린다. token CSS는 묻지 않는다. O3는 저장소 안에서 경로 없이 요청한다.
  - 초안: 링크 2 `buzz-project-settings.html`(61d515e8)을 확정했다. 링크 4 `agent-reply-chips.html`은 새로 그려 확정했다. 다른 캔버스 접미사는 잘리지 않고, layout이 없으면 목록 행의 프레임 제목을 쓰며, 칩의 로딩 토스트는 "Try again shortly."다.
  - 링크 1 열린 점: 위조된 선택 메시지는 앱이 마지막으로 본 포인터가 캔버스 영역 위일 때만 포커스를 옮긴다(a3ec28b3).
  - 로그인: 앱 프로필에는 Claude Code 하나만 연결했다(링크 1 T4의 에이전트 알림 확인용). 다른 링크의 runtime-test는 앱 로그인이 필요 없다. `/agent-eval`은 실제 HOME의 `claude`·`codex` 터미널 로그인을 쓰며, 둘 다 로그인되어 있다.
  - 지휘자 재량: 링크 3과 4가 둘 다 R8을 R8b로 바꾸므로 링크 4 intake에서 겹치지 않는 id로 바꾼다. 링크 5의 "terminal-agent-activity와 같은 PR" 전제(tasks 3–5행, Z1)는 #72 병합으로 지난 것이라 링크 5 intake에서 지운다. 링크 4 T5의 규칙 J 문장은 링크 4 intake에서 링크 3의 결과에 맞춘다. 링크 5의 실제 Safari 확인과 Put Back은 임시 파일로만 하며 묻지 않는다.
  - 사용량(시작 시점): Codex는 18%를 썼다. Claude는 7일 한도의 74%를 썼고 2026-11-04 13:59 KST에 초기화된다. 리뷰와 기계적 배치는 Codex 비중을 높인다.
