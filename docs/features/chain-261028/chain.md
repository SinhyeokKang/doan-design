# orchestrate chain — 2026-10-28

규칙: [`/orchestrate` §6 'Linked runs'](../../../.agents/skills/orchestrate/SKILL.md), AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

1. `agent-cli-versions` — [spec](../agent-cli-versions/spec.md)·[design](../agent-cli-versions/design.md)·[tasks](../agent-cli-versions/tasks.md). `/feature`와 네 관점 `/feature-review`를 마쳤다. 다음 단계는 `/tdd` → 구현이다.
2. `buzz-onboarding` — [spec](../buzz-onboarding/spec.md)·[design](../buzz-onboarding/design.md)·[tasks](../buzz-onboarding/tasks.md). F4는 확정이다(2026-10-28). F5(PRODUCT 기록)는 이 링크의 intake에서 한다. F6은 링크 1 병합을 확인하고 상태 대응 표를 갱신한다. T1(새 토큰)은 B2 앞이다.

각 링크는 새 세션·새 Orca worktree(최신 `origin/main`에서 생성)에서 시작하고, 병합한 뒤 다음 링크의 세션을 띄워 인계하고 물러난다.

## 상시 권한 (2026-10-28 사용자)

- **main 병합**: 두 링크 모두 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **Codex 작업자**: 두 링크 모두 Claude 지휘자가 필요한 배치에 Codex 작업자를 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 모델·effort 선택은 orchestrate §0의 Codex 규칙(Astra는 판단이 필요한 배치에 medium까지, Sol은 기계적 배치에 low·medium, 단계가 많으면 high)을 따른다. 독립 리뷰는 구현과 다른 계열을 써도 된다. 사용한 범위는 각 링크의 orch.md에 적는다.
- 그 밖의 권한(실제 userData 사용, 새 의존성, 범위 밖 변경)은 평소대로 사용자에게 묻는다.

## 운영 메모 (agent-auth run에서 넘어온 것)

- 실인증 확인은 agent-auth D1과 같은 조건이다: 실제 HOME, 격리 userData·`DOAN_RUNTIME`, setup 쓰기 단계 없음. doan이 만든 Keychain 항목은 만들고 지운 목록을 보고한다.
- 로그인 승인은 지휘자가 ego-lite(`ego-browser` 스킬)로 처리한다. Claude는 ego-lite에 로그인된 구독 계정, Codex·Cursor·Antigravity는 ego-lite의 Google 계정, Copilot은 GitHub 계정이다. claude.ai 승인 버튼은 창 포커스가 없으면 비활성이라 CDP `Emulation.setFocusEmulationEnabled`를 켠 뒤 누른다. 승인 뒤에는 성공 페이지(Claude `platform.claude.com/oauth/code/success`, Codex `127.0.0.1:1455/success`, Copilot·Antigravity의 localhost 콜백 화면)를 확인한 다음에 작업자에게 답한다. 콜백 이동이 끝나기 전에 탭을 옮기면 로그인이 실패한다. GitHub 2FA가 필요하면 사용자가 승인한다.
- 이 머신의 CLI: Claude Code 2.1.312, codex-cli 0.164.0(PATH의 codex는 Orca 런타임 링크), Cursor `agent` 2026.10.22-27dcf5f, Copilot 1.0.105. Antigravity 서버는 앱이 내려받는다.
- worker 대기 루프는 heartbeat·status를 조용히 ack하고 `worker_done`·`question`·`escalation`에만 깨운다.
- probe 출력은 파일로 남기고 EPIPE 보호와 timeout을 둔다. 패키지 앱에서만 드러나는 타이밍 문제가 있었다(agent-auth D1의 turn.done 직후 busy).

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 agent-cli-versions | (인계 시 기록) | | | 대기 |
| 2 buzz-onboarding | | | | 대기(링크 1 병합 후) |

## 인계 기록

- 2026-10-28 체인 작성 세션 → 링크 1: 이 파일과 규칙을 main에 push한 뒤 링크 1 세션을 띄운다. 링크 1이 시작 확인을 남기면 체인 작성 세션은 물러난다.
