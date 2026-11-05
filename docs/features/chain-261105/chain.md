# 체인 2026-11-05

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 세 feature 모두 `/feature-review`를 마쳤고 초안을 사용자가 확정했다(2026-11-05). `queue-steer-shortcut`은 체인에서 빼고 체인 밖에서 따로 진행한다(사용자, 2026-11-05). 같은 composer 파일을 고치므로, 각 지휘자는 그 feature가 먼저 main에 들어갔는지 확인하고 들어갔으면 그 모양 위에서 시작한다.

1. `prompt-suggestion` — [spec](../prompt-suggestion/spec.md)·[design](../prompt-suggestion/design.md)·[tasks](../prompt-suggestion/tasks.md). 초안 없음(design 결정 10). 사람이 함께 있는 동안 P1 PoC를 끝내려고 첫 링크에 둔다(사용자): P1이 실패하면 기능 전체가 서지 않으므로, 사람이 있을 때 결과를 보고 design을 고치거나 링크를 접는다. 턴 끝 runner(`conversation/runners.ts`, `service.ts`)와 composer 키(`ComposerField`, `homeComposer.ts`)를 바꾸므로 같은 곳을 고치는 링크 3보다 앞에 둔다(design '다른 feature와 겹치는 곳').
2. `canvas-capture` — [spec](../canvas-capture/spec.md)·[design](../canvas-capture/design.md)·[tasks](../canvas-capture/tasks.md). 초안 `.doan/canvases/canvas-capture.html` 확정(design '초안 요청'). 메뉴 막대 항목은 두지 않는다(design 결정 5). provider 로그인이 필요 없다. 캔버스 도구모음·`CanvasController`·첨부(main `attachments.ts`)를 바꿔 다른 링크와 겹치는 곳이 적다.
3. `context-window-ring` — [spec](../context-window-ring/spec.md)·[design](../context-window-ring/design.md)·[tasks](../context-window-ring/tasks.md). 초안 `.doan/canvases/context-window-ring.html` 확정(링은 tray 오른쪽 끝). `transport.ts`·`acp.ts`의 terminal과 `DockedComposer`의 tray를 바꾸므로 링크 1 뒤에 둔다. header 사용량 링(`AgentUsageButton.tsx`)을 공유 링으로 빼는 일도 여기서 한다.

## 시작 점검 (첫 지휘자)

첫 지휘자는 링크 1을 시작하기 전에 다음을 점검하고, 사용자에게 한 번에 승인을 받아 '인계 기록'에 적는다. 승인 뒤에는 링크마다 멈추지 않는다.

**사용자가 있는 동안 세 링크에 필요한 사람의 일을 모두 미리 확보한다**(사용자, 2026-11-05). 사용자는 체인을 시작하고 링크 1 PoC까지 함께한 뒤 자리를 비운다. 그래서 첫 지휘자는 그 사이에 뒤 링크들이 사람을 기다릴 일을 남기지 않는다: 모든 링크의 로그인(세션), 실제 HOME·공용 프로필 사용 승인, 사람의 메시지로 시작해야 하는 provider 턴, 사람의 결정 단계. 무엇을 확보했고 무엇을 못 했는지 '인계 기록'에 적고, 각 링크 지휘자는 그 기록을 먼저 읽는다. 아래 항목이 그 목록이다.

- 세 feature 문서와 두 초안이 main에 있는지 확인한다(두 초안은 사용자가 2026-11-05에 확정했다).
- 링크 1 P1의 실행 명령: tasks에 "command undecided — needs user confirmation"으로 남아 있다(`.scratch/prompt-suggestion/`의 node SDK script와 P1-b 앱 probe). 무엇으로 돌릴지 사용자에게 확인받는다.
- 링크 1 P1은 사용자와 함께 한다(사용자, 2026-11-05). 첫 지휘자는 P1 결과를 사용자와 보고, design과 다르면 고친 뒤 진행할지 사용자에게 묻는다. P1 뒤에는 사용자가 자리를 비운다고 보고 '상시 권한'대로 진행한다.
- 로그인: 아래 '로그인'의 공용 프로필을 이때 만든다. P1-a·c·d·e는 임시 `CLAUDE_CONFIG_DIR`로 로그인하는 script라서 공용 프로필과 따로다(prompt-suggestion design 결정 12). 끝난 뒤 그 로그인과 Keychain 항목을 지울지 사용자에게 묻는다.
- 링크 3 PoC(P1–P5)도 이때 첫 지휘자가 사용자와 함께 돌린다. 실제 계정과 공용 프로필을 쓰고, 대화 턴을 사람의 메시지로 시작해야 해서 밤사이에는 할 수 없다. 코드를 바꾸지 않는 일회성 script(`.scratch/context-window-ring/`)이므로 링크 1 구현과 겹치지 않는다. 결과는 context-window-ring tasks.md의 'P 결과'에 적어 main에 커밋하고, 링크 3 지휘자는 P1–P5를 다시 하지 않는다(링크 1이 바꾼 runner가 결과를 무효로 만들 만큼 달라졌으면 그 점만 다시 확인한다).
- 링크 3 P6(사람의 결정)도 P1–P5 결과를 보고 이때 사용자에게 받는다. 결정 3·4를 다시 묻는 조건에 걸리면 사용자의 답으로 context-window-ring design을 고친 뒤 커밋한다.
- 링크 1·3의 E1(`/runtime-test`)이 쓸 로그인을 모두 공용 프로필에 미리 만든다: Claude Code(링크 1·3), Codex와 링크 3이 확인할 나머지 Doan 연결 provider. 실제 HOME·공용 프로필 사용 승인을 이때 세 링크 몫으로 한 번에 받는다. 공용 프로필이 queue-steer-shortcut PoC 때 이미 만들어졌으면 연결 상태만 확인한다.
- 실제 키보드와 한국어 IME 확인(링크 1 E1 (b))은 밤사이 사람이 할 수 없다. 자동 입력으로 확인하지 못한 것은 미검증으로 보고에 남기고 진행한다.

승인 뒤 각 지휘자는 일상적인 판단을 스스로 한다. 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정이 생길 때만 묻는다.

## 상시 권한 (2026-11-05 사용자, 2026-11-04 체인 `501b54bd^`의 조건을 옮김)

- **main 병합**: 모든 링크가 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **멈추지 않고 진행**: 체인을 멈추지 말고 끝까지 간다. 웬만한 결정은 지휘자가 내린다. 새 의존성, 범위 밖 변경, 실제 사용자 상태를 되돌릴 수 없게 바꾸는 일만 묻는다.
- **지휘자 런타임**: Claude Code.
- **Codex 작업자**(사용자가 이 체인의 모든 링크에 허용함, 2026-11-05): 모든 링크에서 Claude 지휘자가 Codex 작업자를 섞어 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 모델·effort는 orchestrate §0의 Codex 규칙을 따른다. 지휘자는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고 그에 맞춰 Codex에 줄 배치를 정한다. 사용한 범위는 각 링크의 orch.md에 적는다. 지난 체인에서는 Codex 모델 목록에 orchestrate §0의 Astra·Sol id가 없어 Codex 작업자를 쓰지 못했다. 링크 시작 때 모델 목록(`~/.codex/models_cache.json`)을 먼저 확인한다.
- 그 밖의 권한(새 의존성, 범위 밖 변경)은 평소대로 사용자에게 묻는다.

## 로그인 (필요한 링크만)

- 로그인한 provider가 필요한 확인: 링크 1 P1-b와 E1(Claude Code), 링크 3 P1–P5와 E(Doan 연결 provider). 링크 2는 필요 없다.
- probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: 첫 지휘자가 시작 점검에서 사용자 브라우저 승인으로 필요한 provider의 로그인을 만든다. 로그인한 userData는 main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 달라서다. `DOAN_RUNTIME`과 repo는 probe마다 임시로 둔다.
- 지난 체인에서 공용 프로필의 **복사본**을 다른 worktree의 dev 앱으로 열면 vault를 읽지 못했다. 복사본이 아니라 그 자리의 프로필을 쓰고, 프로필을 망가뜨릴 수 있는 probe만 복사본으로 돌린다. 로그인을 다시 요청하기 전에 프로필이 연결되어 있는지 먼저 확인한다.
- 링크마다 병합할 때 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 연결을 모두 로그아웃하고, 그 프로필이 만든 Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다.
- 셸에서 `doan check`를 돌릴 때는 임시 `DOAN_RUNTIME`을 준다(ARCHITECTURE §4 'Shell check session associations').

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 작업자 대기는 orchestrate의 대기 loop를 따른다.
- `/agent-eval`: 세 링크 모두 CLI 출력·guide·`doan check` 규칙·skill stub을 바꾸지 않아 해당하지 않는다.
- 링크 1·3과 체인 밖의 queue-steer-shortcut이 composer와 턴 끝 runner를 이어서 고친다. 각 지휘자는 앞 링크가 병합한 모양을 다시 읽고 시작한다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 prompt-suggestion | — | — | — | 대기 |
| 2 canvas-capture | — | — | — | 대기 |
| 3 context-window-ring | — | — | — | 대기 |

## 인계 기록

- 2026-11-05 체인 작성 세션(feature-review 세션): 네 feature의 `/feature-review` 반영을 main에 넣은 뒤, 순서(링크 1 prompt-suggestion은 사용자가 정함, 나머지는 파일 겹침)와 상시 권한(지난 체인과 같게: 각 링크가 병합, 멈추지 않고 진행, Claude Code 지휘자. 그리고 모든 링크에 Codex 작업자 허가)을 사용자와 정해 이 파일을 썼다. 사용자가 밤에 체인을 시작하고 링크 1 PoC까지 함께한다. 세 초안(링크 2·3·4)은 이 세션의 서브 에이전트가 그리는 중이다.
- 2026-11-05 체인 작성 세션: 사용자가 세 초안(canvas-capture, context-window-ring, queue-steer-shortcut)을 확정했다. 사용자가 `queue-steer-shortcut`을 체인에서 빼고 지금 체인 밖에서 PoC부터 시작하기로 했다. 링크를 셋으로 다시 매겼다. 그 PoC가 공용 프로필(Claude Code·Codex 로그인)을 만들면 첫 지휘자는 그것을 그대로 쓴다.
