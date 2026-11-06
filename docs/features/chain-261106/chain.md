# 체인 2026-11-06 (두 번째)

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막으로 병합하는 링크가 병합한 뒤 이 디렉터리를 지운다. 같은 이름의 앞 체인(work-update → canvas-handoff → small-ui-tweaks)은 `87b02c9f`에서 지웠다. 이 체인과 상관없다.

## 순서

이 체인은 turn-activity가 main에 병합된 뒤 시작한다(사용자, 2026-11-06). turn-activity는 이 체인의 링크가 아니다. 이 파일을 쓴 세션이 main을 polling하다가 병합을 보면 첫 지휘자를 시작한다.

링크는 직렬이다. 두 링크가 함께 고치는 코드가 있어서 병렬 조건(`/chain` §1 step 2)에 맞지 않는다: `app/src/renderer/ComposerParts.tsx`(model-drawer-older는 `AgentPicker`, project-skill-drawer는 `PresetOption`·`presetBody`), `app/src/renderer/homeComposer.ts`(`modelPickerView`와 `presetListView`), `app/src/renderer/styles.css`.

1. `model-drawer-older` — [spec](../model-drawer-older/spec.md)·[design](../model-drawer-older/design.md)·[tasks](../model-drawer-older/tasks.md). `/feature-review` 반영(`e8d9cd33`). 초안 `.doan/canvases/model-drawer-older.html` 사용자 확정(2026-11-06, 같은 자리에서 펼치기를 고름, `b7fe41ea`). 작고 모델 목록 파서와 모델 메뉴만 고친다. project-skill-drawer가 넓히는 목록 읽기 lease(`service.ts` `listModels`, `runners.ts`)는 건드리지 않는다. 가장 큰 링크를 마지막에 두는 규칙대로 먼저 둔다.
2. `project-skill-drawer` — [spec](../project-skill-drawer/spec.md)·[design](../project-skill-drawer/design.md)·[tasks](../project-skill-drawer/tasks.md). `/feature-review` 반영(`390c8018`). 초안 `.doan/canvases/project-skill-drawer.html` 사용자 확정(`ed101a9a`, tasks D0). PoC P1–P3·P5 완료(`ff59c416`, tasks 'P 결과'). P5 판정에 따라 F1(Antigravity stub 경로 옮기기)을 한다. 가장 크고, 링크 1과 turn-activity가 바꾼 composer·thread 모양 위에서 시작해야 하므로 마지막이다. tasks의 시작 조건 "turn-activity와의 순서는 그때 정한다"는 사용자가 정했다: turn-activity가 먼저다.

## 시작 점검 (첫 지휘자)

첫 지휘자(링크 1)는 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 적는다. 승인 뒤 각 지휘자는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

- turn-activity가 병합한 모양을 다시 읽는다. turn-activity는 `ConversationThread.tsx`, `DockedComposer.tsx`, `styles.css`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`를 고친다. 두 링크 문서의 줄 번호 인용이 어긋났으면 지휘자가 고친다(일상 판단).
- project-skill-drawer R1의 사람 확인: native macOS 한글 IME로 `/deploy에서도`와 `/deploy로`를 조합하는 동안·끝난 뒤의 하이라이트와 caret을 사람이 한 번 본다(tasks R1, 결정 20). 링크 2 구현 뒤에만 할 수 있다. 사용자가 그때 볼 수 있는지, 아니면 녹화·스크린샷으로 대신하고 병합할지, 링크 2 PR을 병합하지 않고 기다릴지 받는다.
- 공용 프로필 probe 승인: project-skill-drawer F1 검증의 실제 Antigravity 턴과 R1의 실제 Claude Code·Codex 턴(공용 프로필, probe repo는 `folders.json`에 잠시 더했다가 되돌림). model-drawer-older는 로그인이 필요 없다(4b는 `conversation:models` handler를 fixture로 바꾼다).
- `/agent-eval`: project-skill-drawer F1은 Doan이 Antigravity에 쓰는 skill stub의 경로를 옮긴다. AGENTS.md는 skill stub을 바꾸는 PR에 `/agent-eval`을 요구한다. 돌릴지(Antigravity는 eval 대상이 아니므로 생략할 수 있다) 받는다.
- 체인 끝 로그인 정리: 공용 프로필 userData와 그 Keychain 항목, `.scratch/prompt-suggestion/claude-config`와 Keychain `Claude Code-credentials-dc1943d2`를 남길지 지울지 받는다. 앞 체인은 "전부 남김"이었다. 이 체인에 그대로 옮기지 않는다. 이 파일을 쓴 세션이 실제 HOME에 만든 Cursor CLI 로그인(`cursor-agent login`, 2026-11-06, Keychain `cursor-access-token`·`cursor-refresh-token`)은 Orca와 터미널이 함께 쓰게 되었고, 사용자가 그대로 두기로 했다. 정리 대상이 아니다.

## 상시 권한

- **main 병합과 인계**(체인 기본): 각 링크가 통합 gate(최신 `origin/main` 위로 rebase한 HEAD에서 `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제를 마친 뒤 자기 PR을 main에 병합하고 다음 링크에 인계한다.
- **지휘자 런타임**: Claude Code. 주 작업자도 Claude다.
- **Codex 작업자 허용**(사용자, 2026-11-06, "Codex 워커도 허가야"): 범위는 두 링크 모두이고, 쓸지와 얼마나 쓸지는 각 링크 지휘자가 정한다. 지휘자는 링크를 시작할 때와 batch를 나눌 때 Codex 주간 한도를 직접 확인한다. 가장 최근 Codex rollout의 `rate_limits` 가운데 `"window_minutes":10080` 항목을 읽는다. claude-dashboard의 Codex %는 30일 창이라 쓰지 않는다. 남은 양이 적으면 쓰지 않는다. 쓴 범위는 각 링크의 `orch.md`에 적는다. `/agent-eval`이 Claude Code와 Codex를 모두 돌리는 것은 AGENTS.md의 상시 예외다.

## 로그인

- 로그인한 provider가 필요한 확인: project-skill-drawer F1 검증(Antigravity 턴)과 R1(Claude Code·Codex 턴). model-drawer-older는 필요 없다.
- probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`. 앞 체인이 남긴 것을 이 체인도 쓴다. 그 자리의 프로필을 main checkout의 Electron으로 연다(복사본은 vault를 읽지 못한다). 프로필을 망가뜨릴 수 있는 probe만 복사본으로 돌린다. 로그인을 다시 요청하기 전에 연결 상태를 먼저 확인한다. probe repo를 `folders.json`에 더했다면 끝나고 되돌린다.
- 실행 방법 선례: `/Users/sinhyeok/code/doan-design/.scratch/project-skill-drawer/`의 `launch.sh`와 `drive.mjs`(PoC P2·P5), `/Users/sinhyeok/code/doan-design/.scratch/canvas-handoff/`.
- 체인 끝 정리는 시작 점검의 답을 따른다.
- 셸에서 `doan check`를 돌릴 때는 임시 `DOAN_RUNTIME`을 준다(ARCHITECTURE §4 'Shell check session associations').

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- **main이 체인 밖에서도 움직인다**: 다른 feature의 문서·초안이 main에 쌓일 수 있다. 각 링크는 PR을 병합하기 전에 `feat/<slug>`를 최신 `origin/main` 위로 rebase하고, 통합 gate를 그 HEAD에서 돌린다. 충돌이 나면 main 쪽 문서와 초안을 그대로 두고 링크 쪽만 맞춘다.
- 작업자 대기는 orchestrate의 대기 loop를 따른다. 멈춘 작업자 감지 포함(orchestrate §2).
- `/agent-eval`: 링크 1은 guide·CLI 출력·`doan check` 규칙·skill stub을 바꾸지 않으므로 해당하지 않는다. 링크 2는 시작 점검의 답을 따른다.
- model-drawer-older의 실측 원시 응답과 script는 main checkout `.scratch/model-drawer-older/`에 있다(tasks 1의 fixture 원본).
- macOS `printenv`는 이름을 하나만 받는다. 환경 확인은 변수마다 따로 묻는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 model-drawer-older | Claude Code, Orca worktree `model-drawer-older-orch` | 2026-11-06 | PR #112, `0825d9eb` | 병합 |
| 2 project-skill-drawer | Claude Code, Orca worktree `project-skill-drawer-orch` | 2026-11-06 | — | 시작 |

## 인계 기록

- 2026-11-06 체인 작성 세션(main checkout, model-drawer-older를 `/feature`·`/design-draft`·`/feature-review`한 세션): 사용자가 model-drawer-older와 project-skill-drawer를 한 체인으로 묶었다. 같은 날 `/chain` 규칙을 바꿔, 코드·테스트·시안이 겹치지 않는 링크는 병렬로 돌게 했다(`cbce13d5`). 이 두 링크는 겹치므로 직렬이다. 사용자가 Codex 작업자를 허용했다. turn-activity가 main에 병합되면 이 세션이 첫 지휘자를 시작한다.
- 2026-11-06 링크 1 지휘자(worktree `model-drawer-older-orch`), turn-activity 병합(PR #111, `d936d157`) 확인 뒤 시작했다.
  - **시작 점검 승인**(사용자, 2026-11-06):
    - project-skill-drawer R1의 한글 IME 확인: 녹화·스크린샷으로 대신하고, 사람 확인 없이 병합한다. 링크 2 지휘자는 조합 중·조합 뒤의 하이라이트와 caret을 녹화나 스크린샷으로 남기고 PR과 이 파일에 위치를 적는다.
    - 공용 프로필 probe: 전부 승인. F1의 실제 Antigravity 턴과 R1의 실제 Claude Code·Codex 턴을 묻지 않고 돌린다. 로그인이 끊겼을 때만 사용자에게 승인을 요청한다. probe repo를 `folders.json`에 더했다면 끝나고 되돌린다.
    - `/agent-eval`: 링크 2는 통합 gate에서 돌린다(F1이 skill stub 경로를 옮기므로). 링크 1은 해당하지 않는다.
    - 체인 끝 로그인 정리: 전부 남긴다. 공용 프로필 userData와 그 Keychain 항목, `.scratch/prompt-suggestion/claude-config`와 Keychain `Claude Code-credentials-dc1943d2`를 지우지 않는다.
  - 두 링크 문서의 줄 번호 인용을 `d936d157` 코드와 대조했다. model-drawer-older는 모두 맞았고, project-skill-drawer spec·design의 인용 43곳을 고쳤다(`sdk.d.ts` 0.3.312 인용은 맞음). 링크 1이 `homeComposer.ts`·`ComposerParts.tsx`·`styles.css`를 고치므로 링크 2 문서의 그 파일 인용은 링크 1 병합 뒤 다시 어긋날 수 있다. 링크 2 지휘자는 시작할 때 그 파일 인용만 다시 맞춘다.
  - Codex 주간 한도: Orca가 띄우는 Codex의 rollout은 `~/.codex`가 아니라 Orca Codex 계정의 `$CODEX_HOME`(`~/Library/Application Support/orca/codex-accounts/<id>/home/sessions`)에 있다. 그 가장 최근 rollout의 10080분 창은 28% 사용(2026-11-06)이다. 사용자가 "코덱스 한도 졸라 여유로움 팡팡 써도 돼"라고 했다. 링크 1은 리뷰와 4a·4b를 Codex로 돌린다.
- 2026-11-06 링크 1 지휘자: model-drawer-older를 PR #112로 병합했다(`0825d9eb`). batch A(tasks 1–3, Claude Opus), 리뷰 RA(Codex gpt-6-astra), batch B(4a·4b, Codex gpt-6-astra), 리뷰 RB(Claude Opus). 통합 gate: rebase한 HEAD에서 `/verify` PASS, `/runtime-test`는 B가 같은 코드에서 다섯 화면을 확인했다. `/agent-eval`은 해당하지 않는다. batch worktree `mdo-batch-a`·`mdo-batch-b`는 지웠고 로컬 브랜치 `SinhyeokKang/mdo-batch-a`(`0d961737`)·`SinhyeokKang/mdo-batch-b`(`3ff82b20`)는 남겼다.
  - 사용자 결정(구현 중): 위로 열린 composer 메뉴는 이전 모델을 "Older models" 줄 위에 펼친다. 지휘자 판단: 메뉴는 처음 펼치거나 접을 때 그려진 쪽에 닫힐 때까지 고정한다. PRODUCT §5 item 0·1, ARCHITECTURE §7 'Models', DESIGN 'Older model disclosure', POSTMORTEM에 있다.
  - 확인하지 못한 것: 실제 provider 목록 읽기와 턴(fixture로 대신함), Copilot 유료 계정의 접기(BACKLOG).
  - **링크 2가 알아야 할 것**: `ComposerParts.tsx`(`AgentPicker`, 새 `useOlderFold`), `homeComposer.ts`(`foldRows`·`olderOrder`·`lockedOlderSide`·`heldScrollTop` 추가), `SettingsAgents.tsx`, `styles.css`가 바뀌었다. project-skill-drawer spec·design의 이 파일 줄 번호 인용(spec 2곳, design 7곳)은 링크 2 지휘자가 시작할 때 다시 맞춘다. `PresetOption`·`presetListView`·`slashQuery` 자체는 이 링크가 고치지 않았다.
  - Codex 한도는 Orca Codex 계정의 `$CODEX_HOME/sessions` rollout에서 읽는다(위 시작 점검 기록). 사용자는 Codex를 넉넉히 써도 된다고 했다.
