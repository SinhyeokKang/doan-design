# 체인 2026-11-05

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 세 feature 모두 `/feature-review`를 마쳤고 초안을 사용자가 확정했다(2026-11-05). `queue-steer-shortcut`은 체인에서 빼고 체인 밖에서 따로 진행한다(사용자, 2026-11-05). 같은 composer 파일을 고치므로, 각 지휘자는 그 feature가 먼저 main에 들어갔는지 확인하고 들어갔으면 그 모양 위에서 시작한다.

1. `canvas-capture` — 완료(feature 디렉터리는 승격 뒤 지웠다. 결론은 PRODUCT §5 item 2 'Toolbar', ARCHITECTURE §3 'Input'·§7 'Attachments', DESIGN 'Canvas capture'). 초안 `.doan/canvases/canvas-capture.html` 확정(design '초안 요청'). 메뉴 막대 항목은 두지 않는다(design 결정 5). provider 로그인과 PoC가 필요 없어 사람 없이 끝까지 갈 수 있으므로 첫 링크에 둔다(사용자, 2026-11-05). 캔버스 도구모음·`CanvasController`·첨부(main `attachments.ts`)를 바꿔 다른 링크와 겹치는 곳이 적다.
2. `prompt-suggestion` — 완료(feature 디렉터리는 승격 뒤 지웠다. 결론은 PRODUCT §3 Out of scope 4·'Launch environment', §5 item 3 'Next-message suggestion', ARCHITECTURE §7 'Next-message suggestions'·'Turn-end reads', DESIGN 'Narrow placeholder'). 초안 없음. P1 PoC는 사용자가 링크 2 때 함께한다(사용자, 2026-11-05): P1이 실패하면 기능 전체가 서지 않으므로, 사람이 있을 때 결과를 보고 design을 고치거나 링크를 접는다. 턴 끝 runner(`conversation/runners.ts`, `service.ts`)와 composer 키(`ComposerField`, `homeComposer.ts`)를 바꾸므로 같은 곳을 고치는 링크 3보다 앞에 둔다(design '다른 feature와 겹치는 곳').
3. `context-window-ring` — [spec](../context-window-ring/spec.md)·[design](../context-window-ring/design.md)·[tasks](../context-window-ring/tasks.md). 초안 `.doan/canvases/context-window-ring.html` 확정(링은 tray 오른쪽 끝). `transport.ts`·`acp.ts`의 terminal과 `DockedComposer`의 tray를 바꾸므로 링크 2 뒤에 둔다. header 사용량 링(`AgentUsageButton.tsx`)을 공유 링으로 빼는 일도 여기서 한다.

## 시작 점검 (첫 지휘자)

첫 지휘자(링크 1)는 링크 1을 시작하기 전에 다음을 점검하고, 사용자에게 한 번에 승인을 받아 '인계 기록'에 적는다. 승인 뒤에는 링크마다 멈추지 않는다.

- 세 feature 문서와 두 초안이 main에 있는지 확인한다(두 초안은 사용자가 2026-11-05에 확정했다).
- 링크 2 P1의 실행 명령: tasks에 "command undecided — needs user confirmation"으로 남아 있다(`.scratch/prompt-suggestion/`의 node SDK script와 P1-b 앱 probe). 무엇으로 돌릴지 사용자에게 확인받는다.
- 실제 HOME·공용 프로필 사용 승인을 세 링크 몫으로 한 번에 받는다(링크 2 P1-b·E1, 링크 3 P1–P5·E). 이 머신의 공용 프로필에는 다섯 provider(Claude Code, Codex, Cursor, Antigravity, Copilot)가 이미 연결돼 있으므로 연결 상태만 확인한다. P1-a·c·d·e는 임시 `CLAUDE_CONFIG_DIR`로 로그인하는 script라서 공용 프로필과 따로다(prompt-suggestion design 결정 12). 그 로그인과 Keychain 항목을 끝난 뒤 지울지도 이때 묻는다.
- 실제 키보드와 한국어 IME 확인(링크 2 E1 (b))은 사람이 없으면 할 수 없다. 자동 입력으로 확인하지 못한 것은 미검증으로 보고에 남기고 진행한다.

## 링크 2 시작 때 사용자와 함께 할 일

사용자는 링크 2 때 PoC를 함께한다(사용자, 2026-11-05). 그래서 사람의 메시지로 시작해야 하는 provider 턴과 사람의 결정은 링크 2 지휘자가 그때 몰아서 한다. 무엇을 끝냈고 무엇을 못 했는지 '인계 기록'에 적고, 링크 3 지휘자는 그 기록을 먼저 읽는다.

- 링크 2 P1은 사용자와 함께 한다. 지휘자는 P1 결과를 사용자와 보고, design과 다르면 고친 뒤 진행할지 사용자에게 묻는다.
- 링크 3 PoC(P1–P5)도 이때 링크 2 지휘자가 사용자와 함께 돌린다. 실제 계정과 공용 프로필을 쓰고, 대화 턴을 사람의 메시지로 시작해야 해서 사람이 없을 때는 할 수 없다. 코드를 바꾸지 않는 일회성 script(`.scratch/context-window-ring/`)이므로 링크 2 구현과 겹치지 않는다. 결과는 context-window-ring tasks.md의 'P 결과'에 적어 main에 커밋하고, 링크 3 지휘자는 P1–P5를 다시 하지 않는다(링크 2가 바꾼 runner가 결과를 무효로 만들 만큼 달라졌으면 그 점만 다시 확인한다).
- 링크 3 P6(사람의 결정)도 P1–P5 결과를 보고 이때 사용자에게 받는다. 결정 3·4를 다시 묻는 조건에 걸리면 사용자의 답으로 context-window-ring design을 고친 뒤 커밋한다.
- 이 일이 끝나면 사용자가 자리를 비운다고 보고 '상시 권한'대로 진행한다.

승인 뒤 각 지휘자는 일상적인 판단을 스스로 한다. 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정이 생길 때만 묻는다.

## 상시 권한 (2026-11-05 사용자, 2026-11-04 체인 `501b54bd^`의 조건을 옮김)

- **main 병합**: 모든 링크가 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **멈추지 않고 진행**: 체인을 멈추지 말고 끝까지 간다. 웬만한 결정은 지휘자가 내린다. 새 의존성, 범위 밖 변경, 실제 사용자 상태를 되돌릴 수 없게 바꾸는 일만 묻는다.
- **지휘자 런타임**: Claude Code.
- **Codex 작업자**(사용자가 이 체인의 모든 링크에 허용함, 2026-11-05): 모든 링크에서 Claude 지휘자가 Codex 작업자를 섞어 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 모델·effort는 orchestrate §0의 Codex 규칙을 따른다. 지휘자는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고 그에 맞춰 Codex에 줄 배치를 정한다. 사용한 범위는 각 링크의 orch.md에 적는다. 지난 체인에서는 Codex 모델 목록에 orchestrate §0의 Astra·Sol id가 없어 Codex 작업자를 쓰지 못했다. 링크 시작 때 모델 목록(`~/.codex/models_cache.json`)을 먼저 확인한다.
- 그 밖의 권한(새 의존성, 범위 밖 변경)은 평소대로 사용자에게 묻는다.

## 로그인 (필요한 링크만)

- 로그인한 provider가 필요한 확인: 링크 2 P1-b와 E1(Claude Code), 링크 3 P1–P5와 E(Doan 연결 provider). 링크 1은 필요 없다.
- probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: 검증용이다. 이 머신에는 다섯 provider가 연결된 프로필이 이미 있다(2026-11-05). 연결이 끊긴 provider만 사용자 브라우저 승인으로 다시 만든다. 로그인한 userData는 main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 달라서다. `DOAN_RUNTIME`과 repo는 probe마다 임시로 둔다.
- 지난 체인에서 공용 프로필의 **복사본**을 다른 worktree의 dev 앱으로 열면 vault를 읽지 못했다. 복사본이 아니라 그 자리의 프로필을 쓰고, 프로필을 망가뜨릴 수 있는 probe만 복사본으로 돌린다. 로그인을 다시 요청하기 전에 프로필이 연결되어 있는지 먼저 확인한다.
- 링크마다 병합할 때 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 연결을 모두 로그아웃하고, 그 프로필이 만든 Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다.
- 셸에서 `doan check`를 돌릴 때는 임시 `DOAN_RUNTIME`을 준다(ARCHITECTURE §4 'Shell check session associations').

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 작업자 대기는 orchestrate의 대기 loop를 따른다.
- `/agent-eval`: 세 링크 모두 CLI 출력·guide·`doan check` 규칙·skill stub을 바꾸지 않아 해당하지 않는다.
- 링크 2·3과 체인 밖의 queue-steer-shortcut(PR #100으로 병합됨)이 composer와 턴 끝 runner를 이어서 고친다. 각 지휘자는 앞 링크가 병합한 모양을 다시 읽고 시작한다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 canvas-capture | Claude Code · `/Users/sinhyeok/orca/workspaces/doan-design/canvas-capture-orch` | 2026-11-05 | PR #101 · `59425720` | 병합 |
| 2 prompt-suggestion | Claude Code · `/Users/sinhyeok/orca/workspaces/doan-design/prompt-suggestion-orch` | 2026-11-05 | PR #102 · `8add3c4c` | 병합 |
| 3 context-window-ring | — | — | — | 대기 |

## 인계 기록

- 2026-11-05 체인 작성 세션(feature-review 세션): 네 feature의 `/feature-review` 반영을 main에 넣은 뒤, 순서(링크 1 prompt-suggestion은 사용자가 정함, 나머지는 파일 겹침)와 상시 권한(지난 체인과 같게: 각 링크가 병합, 멈추지 않고 진행, Claude Code 지휘자. 그리고 모든 링크에 Codex 작업자 허가)을 사용자와 정해 이 파일을 썼다. 사용자가 밤에 체인을 시작하고 링크 1 PoC까지 함께한다. 세 초안(링크 2·3·4)은 이 세션의 서브 에이전트가 그리는 중이다.
- 2026-11-05 체인 작성 세션: 사용자가 세 초안(canvas-capture, context-window-ring, queue-steer-shortcut)을 확정했다. 사용자가 `queue-steer-shortcut`을 체인에서 빼고 지금 체인 밖에서 PoC부터 시작하기로 했다. 링크를 셋으로 다시 매겼다. 그 PoC가 공용 프로필(Claude Code·Codex 로그인)을 만들면 첫 지휘자는 그것을 그대로 쓴다.
- 2026-11-05 체인 작성 세션(다른 머신에서 이어받음): 공용 프로필 경로를 이 머신(`/Users/sinhyeok/...`)으로 고쳤다. 사용자가 링크 1과 2를 바꿨다: canvas-capture가 링크 1, prompt-suggestion이 링크 2다. 사용자는 링크 2 때 PoC를 함께하므로, 사람이 필요한 PoC와 결정(링크 2 P1, 링크 3 P1–P6)을 시작 점검에서 '링크 2 시작 때 사용자와 함께 할 일'로 옮겼다. 시작 점검에는 문서 확인, P1 명령, 실제 HOME·공용 프로필 승인만 남는다.
- 2026-11-05 링크 1 지휘자(canvas-capture-orch): 시작 점검을 사용자와 마치고 한 번에 승인받았다. (1) 세 feature 문서와 두 초안이 `origin/main`(`ccf5e1ff`)에 있다. (2) 링크 2 P1 실행 명령(사용자 승인): P1-a·c·d·e는 실제 HOME에서 `CLAUDE_CONFIG_DIR=<임시> node .scratch/prompt-suggestion/p1.mjs <a|c|d|e>`로 돌린다(script는 링크 2 지휘자가 만든다). P1-b는 main checkout에서 `DOAN_CLI=/Users/sinhyeok/code/doan-design/.scratch/provider-profile/doan npm --prefix app run dev -- -- --user-data-dir=/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`로 앱을 열고 사람이 턴을 보낸다. (3) 세 링크 모두 실제 HOME과 공용 프로필을 써도 된다(연결 상태만 확인, main checkout의 Electron으로만 연다). (4) P1-a·c·d·e의 임시 `CLAUDE_CONFIG_DIR` 로그인과 Keychain 항목은 P1 뒤에 지우지 않고 남긴다. 마지막 링크의 로그인 정리 때 공용 프로필과 함께 지운다. (5) 사람이 없으면 실제 키보드·한국어 IME 확인(링크 2 E1 (b))은 미검증으로 남기고 진행한다. Codex 작업자: Orca Codex 계정의 `models_cache.json`에 `gpt-6-astra`, `gpt-6.1-sol`이 있다(`~/.codex`가 아니라 Orca 계정이 출처).
- 2026-11-05 링크 1 지휘자(canvas-capture-orch): canvas-capture를 PR #101로 main에 병합했다(merge `59425720`). 통합 HEAD `/verify` 통과, `/design-sync`(frame 8개, 고친 곳 없음)와 `/runtime-test`(2배·1배, tasks F1 모든 경우 통과)를 마쳤고, 결론을 PRODUCT·ARCHITECTURE·DESIGN·BACKLOG·README로 옮긴 뒤 feature 디렉터리를 지웠다. 배치는 P(PoC C1)·K·M·U·S 다섯이고, K·M·U는 Codex Astra medium이 독립 리뷰했다(🔴 0, 🟡 3건 모두 고침). Codex 주간 사용량은 시작 때 26%였다. 미검증(BACKLOG에 적음): 사람 눈의 깜빡임, 배율이 다른 모니터, Claude Code·Cursor가 보낸 캡처를 읽는지. 다음 링크가 알 것: (1) 링크 2가 고칠 `App.tsx`·`CanvasConversationPanel.tsx`가 바뀌었다. `composerFixed(view, list, work)`와 `settleChips`가 `CanvasConversationPanel.tsx`에서 export되고, App이 `onCapture`를 등록하므로 App 테스트의 controller mock에는 `onCapture`가 있어야 한다. (2) Esc 순서에 캡처 모드가 pick과 같은 단계로 들어갔다(`escapeStep`). (3) 체인 도중 Orca가 자동 업데이트(1.4.250)로 재시작되어 대기 loop가 끊긴 적이 있다. `orca open`으로 다시 띄우면 작업자는 그대로 이어 간다. (4) 작업 중 Mac 화면이 잠겨 있던 때가 있다(`IOConsoleLocked`). 잠겨 있으면 실제 키보드·IME 확인은 미검증으로 남긴다.
- 2026-11-06 링크 2 지휘자(prompt-suggestion-orch): prompt-suggestion을 PR #102로 main에 병합했다(merge `8add3c4c`). 통합 HEAD `/verify` 통과, `/runtime-test` E1을 공용 프로필로 했고, 결론을 PRODUCT·ARCHITECTURE·DESIGN·BACKLOG·POSTMORTEM으로 옮긴 뒤 feature 디렉터리를 지웠다. 배치는 M(main)·R(renderer)·R2(host 연결)·U(사용자가 링크 도중 알린 버그: Agent usage popover가 header 빈 곳 클릭에 닫히지 않음)이고, 구현은 모두 Claude Opus high, 리뷰는 Codex Astra medium(M·R2)과 Claude Opus medium(R; Astra가 capacity로 멈췄을 때 지휘자가 바꿈 — 사용자 규칙: capacity 오류는 같은 모델로 세 번까지 재시도한 뒤 바꾼다). Codex 주간 사용량은 링크 시작 때 79%(사용자 확인), 끝날 때 Codex 화면에 14% 남음. 미검증(BACKLOG에 적음): 실제 키보드·한국어 IME의 →(사용자 확인을 받지 못함), VoiceOver, 실제 앱의 ACP placeholder, Claude Code 2.1.318 이전 버전.
  - P1(사용자와 함께, 2026-11-05): 기본 설정에서는 계정 한도 상태 `allowed_warning` 때문에 제안이 오지 않아, 사용자가 Doan이 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=true`를 기본으로 주기로 정했다(끄는 방법은 login shell의 false 하나). 다음 send는 제안을 기다리는 프로세스를 group stop으로 끝낸다(입력을 닫은 뒤에는 interrupt가 거절됨).
  - 링크 3 PoC P1–P5와 P6을 사용자와 함께 마쳤다. 결과와 P6 판단(결정 3·4 그대로)은 context-window-ring tasks.md 'P 결과'(`5a327f38`)에 있다. 링크 3은 P1–P5를 다시 하지 않는다. script, 원시 frame, prompt·계정 정보를 뺀 fixture 재료(`out/fixtures/`), 옛 버전 CLI(`old/`: Codex 0.158.0, Copilot 1.0.89, Claude Code 2.1.284)는 `/Users/sinhyeok/code/doan-design/.scratch/context-window-ring/`에 있다.
  - 링크 3이 알 것: (1) `runners.ts` `openClaude`가 terminal 뒤에도 `prompt_suggestion`을 읽고 `Runner.endSuggestion`이 생겼다. `service.ts` `previousExit`는 제안을 기다리는 Claude 프로세스를 끝낸 뒤 기다린다. 링크 3도 `result`와 프로세스 종료 사이에 일을 더하므로 턴 끝 시간을 다시 잰다(prompt-suggestion design '다른 feature와 겹치는 곳'). (2) `ConversationSummary`에 `suggestion`이 있고, `DockedComposer`가 `composerPlaceholder`와 `suggestion` prop을 쓴다. (3) `AgentUsageButton.tsx`에 popover가 열린 동안 header에 inline `-webkit-app-region: no-drag`를 두는 effect가 생겼다. 링크 3이 이 파일에서 링을 뺄 때 지키고, 드래그 영역은 `:has()`로 바꾸지 않는다(POSTMORTEM 2026-11-06). (4) 기존 결함 두 개를 BACKLOG에 적었다: `turn.done` 직후 보낸 Claude send의 턴이 약 10.8초 뒤에 시작됨(main에서도 같음, CLI는 2.5–3.7초에 끝나는데 그룹이 늦게 사라짐), Cursor 대화의 두 번째 턴이 `session_unavailable`. (5) 실제 앱 probe 방법: 공용 프로필은 main checkout의 Electron으로 worktree 빌드(`<worktree>/app`)를 열 수 있다(`.scratch/runtime-test/prompt-suggestion/launch.sh`, `--remote-debugging-port`로 CDP 연결). Playwright `_electron.launch`는 `NODE_OPTIONS`를 지운다. 공용 프로필의 `folders.json`에 probe repo를 더했다면 끝나고 되돌린다. native 클릭과 드래그는 `orca computer click/drag --restore-window`로 된다.
  - 로그인 정리 대상(마지막 링크): P1의 임시 `CLAUDE_CONFIG_DIR` `/Users/sinhyeok/code/doan-design/.scratch/prompt-suggestion/claude-config`와 그것이 만든 Keychain 항목 `Claude Code-credentials-dc1943d2`(로그인 전 목록: 같은 디렉터리의 `keychain-before.txt`).
