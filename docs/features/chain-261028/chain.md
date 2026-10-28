# orchestrate chain — 2026-10-28

규칙: [`/orchestrate` §6 'Linked runs'](../../../.agents/skills/orchestrate/SKILL.md), AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

1. `agent-cli-versions` — 끝났다. feature 디렉터리는 지웠고 결론은 PRODUCT §3·§6·§7·§8과 ARCHITECTURE §7('Agent conversation runtime and IPC', 'Agent authentication')에 있다.
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
| 1 agent-cli-versions | Claude Code 세션 · Orca worktree `agent-cli-versions-orch`(브랜치 `feat-agent-cli-versions`) | 2026-10-28 | [PR #34](https://github.com/SinhyeokKang/doan-design/pull/34) · 병합 `e517c22`(2026-10-29) | 완료 |
| 2 buzz-onboarding | | | | 대기(링크 1 병합 후) |

## 링크 2가 알아야 할 것 (링크 1, 2026-10-29)

- readiness `cause` → `action` 순서(ARCHITECTURE §7 'State, attempts and readiness'): `cli_missing` → install, `version_unsupported` → update(설치 버전이 최소 버전보다 낮을 때만), `version_unknown` → retry(`--version` 출력에서 버전을 읽지 못함), `version_incompatible` → retry(새 세션 handshake가 비호환 기록을 남김), 그다음은 전과 같다(`busy` → wait …). buzz-onboarding design의 상태 대응 표(F6)는 이 순서를 쓰면 된다. "CLI가 고정 버전보다 새로우니 Doan을 업데이트" 경우는 없다.
- 최소 버전: Claude Code 2.1.312, Codex 0.164.0, Cursor 2026.10.22(빌드 접미사 무관), Copilot 1.0.105. Antigravity는 Doan이 내려받는 서버 1.3.0 그대로라 버전 원인이 생기지 않는다. 이 Mac의 설치본은 모두 최소 버전과 같다.
- `version_unknown`·`version_incompatible`이면 `actions`에 `retry`가 붙는다(계정이 아무 action도 주지 않을 때도). 버전 원인(`version_*` 셋 다)일 때 `agent-auth:check`는 tool facts만 다시 읽고 `{ok: true}`를 attempt 없이 돌려준다. 결과는 `agent-auth:changed`로 온다. preload 타입은 `AuthCheckReply`다. Copilot도 이때는 요청을 쓰지 않는다.
- `version_incompatible`은 사전 탐지가 없어서 첫 실행이 거절된 뒤에만 보인다. 온보딩보다 홈의 첫 대화와 Settings에서 주로 보인다. 그 실행의 IPC 오류는 기존 코드(`runtime_unsupported`·`session_unavailable`·`unknown`)이므로 원인은 공급자 readiness로 정한다. 거절이 돌아오기 전에 readiness가 이미 바뀌어 있다.
- app-socket v2가 readiness를 CLI로 내보내면 fixture에 `version_incompatible`을 넣는다(링크 1 design '형식 변경').
- 범위 밖 결함 후보: shell 연결(legacy external) Claude는 `CLAUDE_CONFIG_DIR`가 비어 있어도 `$HOME/.claude`를 명시해서 넘긴다. 그래서 shell과 다른 Keychain 항목을 쓰고, 그 항목이 만료되면 재개가 인증 실패한다. PRODUCT §8 열린 질문에 적었다.

## 인계 기록

- 2026-10-28 체인 작성 세션 → 링크 1: 이 파일과 규칙을 main에 push한 뒤 링크 1 세션을 띄운다. 링크 1이 시작 확인을 남기면 체인 작성 세션은 물러난다.
- 2026-10-28 링크 1 시작: `agent-cli-versions-orch` worktree에서 main `f884c73`으로부터 `feat-agent-cli-versions`를 만들고 `/orchestrate agent-cli-versions`를 시작했다. 체인 작성 세션은 물러나도 된다.
- 2026-10-29 링크 1 완료: PR #34를 main에 병합했다(`e517c22`). 통합 HEAD `/verify` 통과, 실제 앱 확인(B2) 통과, `/agent-eval`은 사용자 결정으로 생략했다. 미검증: 실제 비호환 handshake의 기록·거절·예약 해제, 버전 원인일 때의 check, 최소보다 새 CLI, 패키지 앱. 모델 교차: 두 배치의 독립 리뷰에 Codex `gpt-6-astra` medium을 썼다. 링크 2가 알아야 할 것은 위 절에 있다. 링크 1 → 링크 2 인계를 시작한다.
