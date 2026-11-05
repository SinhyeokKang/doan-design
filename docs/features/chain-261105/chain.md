# 체인 2026-11-05

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 네 feature 모두 `/feature-review`를 마쳤다(2026-11-05).

1. `prompt-suggestion` — [spec](../prompt-suggestion/spec.md)·[design](../prompt-suggestion/design.md)·[tasks](../prompt-suggestion/tasks.md). 초안 없음(design 결정 10). 사람이 함께 있는 동안 P1 PoC를 끝내려고 첫 링크에 둔다(사용자): P1이 실패하면 기능 전체가 서지 않으므로, 사람이 있을 때 결과를 보고 design을 고치거나 링크를 접는다. 턴 끝 runner(`conversation/runners.ts`, `service.ts`)와 composer 키(`ComposerField`, `homeComposer.ts`)를 바꾸므로 같은 곳을 고치는 링크 2·4보다 앞에 둔다(design '다른 feature와 겹치는 곳').
2. `queue-steer-shortcut` — [spec](../queue-steer-shortcut/spec.md)·[design](../queue-steer-shortcut/design.md)·[tasks](../queue-steer-shortcut/tasks.md). 초안 `.doan/canvases/queue-steer-shortcut.html`을 그리는 중이고 사용자 확인이 필요하다. renderer만 바꾼다. 링크 1의 `ComposerField` 키 연결 위에서 `onKey` → `onSteerKey` → `isSubmitKey` 순서를 맞춘다(design '함께 고치는 feature').
3. `canvas-capture` — [spec](../canvas-capture/spec.md)·[design](../canvas-capture/design.md)·[tasks](../canvas-capture/tasks.md). 초안 `.doan/canvases/canvas-capture.html`을 그리는 중이고 사용자 확인이 필요하다. provider 로그인이 필요 없다. 캔버스 도구모음·`CanvasController`·첨부(main `attachments.ts`)를 바꿔 다른 링크와 겹치는 곳이 적다.
4. `context-window-ring` — [spec](../context-window-ring/spec.md)·[design](../context-window-ring/design.md)·[tasks](../context-window-ring/tasks.md). 초안 `.doan/canvases/context-window-ring.html`을 그리는 중이고 사용자 확인이 필요하다. `transport.ts`·`acp.ts`의 terminal과 `DockedComposer`의 Send 자리를 바꾸므로 링크 1·2 뒤에 둔다. header 사용량 링(`AgentUsageButton.tsx`)을 공유 링으로 빼는 일도 여기서 한다.

## 시작 점검 (첫 지휘자)

첫 지휘자는 링크 1을 시작하기 전에 다음을 점검하고, 사용자에게 한 번에 승인을 받아 '인계 기록'에 적는다. 승인 뒤에는 링크마다 멈추지 않는다.

- 네 feature 문서와 세 초안이 main에 있고, 세 초안을 사용자가 확인했는지 확인한다. 확인하지 않은 초안이 있으면 그 링크의 `/tdd` 전에 사용자 확인을 받는다.
- 링크 3 D1의 남은 결정: 캡처에 앱 메뉴 막대 항목(Edit > Pick from Canvas 같은 것)을 둘지. 초안 확인 때 사용자에게 묻고 canvas-capture design 결정 5에 적는다.
- 링크 1 P1의 실행 명령: tasks에 "command undecided — needs user confirmation"으로 남아 있다(`.scratch/prompt-suggestion/`의 node SDK script와 P1-b 앱 probe). 무엇으로 돌릴지 사용자에게 확인받는다.
- 링크 1 P1은 사용자와 함께 한다(사용자, 2026-11-05). 첫 지휘자는 P1 결과를 사용자와 보고, design과 다르면 고친 뒤 진행할지 사용자에게 묻는다. P1 뒤에는 사용자가 자리를 비운다고 보고 '상시 권한'대로 진행한다.
- 로그인: 아래 '로그인'의 공용 프로필을 이때 만든다. P1-a·c·d·e는 임시 `CLAUDE_CONFIG_DIR`로 로그인하는 script라서 공용 프로필과 따로다(prompt-suggestion design 결정 12). 끝난 뒤 그 로그인과 Keychain 항목을 지울지 사용자에게 묻는다.
- 링크 4 P6은 사람의 결정 단계다. P1–P5 결과가 결정 3·4를 다시 물을 조건에 걸리지 않으면 지휘자가 그대로 진행하고 결과를 '인계 기록'에 적는다. 걸리면 그 링크에서 멈추고 사용자에게 묻는다.
- 실제 키보드와 한국어 IME 확인(링크 1·2 E1 (b))은 밤사이 사람이 할 수 없다. 자동 입력으로 확인하지 못한 것은 미검증으로 보고에 남기고 진행한다.

승인 뒤 각 지휘자는 일상적인 판단을 스스로 한다. 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정이 생길 때만 묻는다.

## 상시 권한 (2026-11-05 사용자, 2026-11-04 체인 `501b54bd^`의 조건을 옮김)

- **main 병합**: 모든 링크가 자기 PR을 main에 병합한다. 병합 전 조건은 orchestrate의 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제다.
- **멈추지 않고 진행**: 체인을 멈추지 말고 끝까지 간다. 웬만한 결정은 지휘자가 내린다. 새 의존성, 범위 밖 변경, 실제 사용자 상태를 되돌릴 수 없게 바꾸는 일만 묻는다.
- **지휘자 런타임**: Claude Code.
- **Codex 작업자**(사용자가 이 체인의 모든 링크에 허용함, 2026-11-05): 모든 링크에서 Claude 지휘자가 Codex 작업자를 섞어 쓸 수 있다(AGENTS.md 'Runtime differences'의 교차 허가). 모델·effort는 orchestrate §0의 Codex 규칙을 따른다. 지휘자는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고 그에 맞춰 Codex에 줄 배치를 정한다. 사용한 범위는 각 링크의 orch.md에 적는다. 지난 체인에서는 Codex 모델 목록에 orchestrate §0의 Astra·Sol id가 없어 Codex 작업자를 쓰지 못했다. 링크 시작 때 모델 목록(`~/.codex/models_cache.json`)을 먼저 확인한다.
- 그 밖의 권한(새 의존성, 범위 밖 변경)은 평소대로 사용자에게 묻는다.

## 로그인 (필요한 링크만)

- 로그인한 provider가 필요한 확인: 링크 1 P1-b와 E1(Claude Code), 링크 2 E1(Claude Code·Codex), 링크 4 P1–P5와 E(Doan 연결 provider). 링크 3은 필요 없다.
- probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: 첫 지휘자가 시작 점검에서 사용자 브라우저 승인으로 필요한 provider의 로그인을 만든다. 로그인한 userData는 main checkout의 절대 경로 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 달라서다. `DOAN_RUNTIME`과 repo는 probe마다 임시로 둔다.
- 지난 체인에서 공용 프로필의 **복사본**을 다른 worktree의 dev 앱으로 열면 vault를 읽지 못했다. 복사본이 아니라 그 자리의 프로필을 쓰고, 프로필을 망가뜨릴 수 있는 probe만 복사본으로 돌린다. 로그인을 다시 요청하기 전에 프로필이 연결되어 있는지 먼저 확인한다.
- 링크마다 병합할 때 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 연결을 모두 로그아웃하고, 그 프로필이 만든 Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다.
- 셸에서 `doan check`를 돌릴 때는 임시 `DOAN_RUNTIME`을 준다(ARCHITECTURE §4 'Shell check session associations').

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 작업자 대기는 orchestrate의 대기 loop를 따른다.
- `/agent-eval`: 네 링크 모두 CLI 출력·guide·`doan check` 규칙·skill stub을 바꾸지 않아 해당하지 않는다.
- 링크 1·2·4가 composer와 턴 끝 runner를 이어서 고친다. 각 지휘자는 앞 링크가 병합한 모양을 다시 읽고 시작한다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 prompt-suggestion | — | — | — | 대기 |
| 2 queue-steer-shortcut | — | — | — | 대기 |
| 3 canvas-capture | — | — | — | 대기 |
| 4 context-window-ring | — | — | — | 대기 |

## 인계 기록

- 2026-11-05 체인 작성 세션(feature-review 세션): 네 feature의 `/feature-review` 반영을 main에 넣은 뒤, 순서(링크 1 prompt-suggestion은 사용자가 정함, 나머지는 파일 겹침)와 상시 권한(지난 체인과 같게: 각 링크가 병합, 멈추지 않고 진행, Claude Code 지휘자. 그리고 모든 링크에 Codex 작업자 허가)을 사용자와 정해 이 파일을 썼다. 사용자가 밤에 체인을 시작하고 링크 1 PoC까지 함께한다. 세 초안(링크 2·3·4)은 이 세션의 서브 에이전트가 그리는 중이다.
