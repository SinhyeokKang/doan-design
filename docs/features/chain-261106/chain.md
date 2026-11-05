# 체인 2026-11-06

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 이 체인은 앞 체인 [chain-261105](../chain-261105/chain.md)의 마지막 링크(context-window-ring)가 병합되고 그 체인이 정리된 뒤 시작한다(사용자, 2026-11-06). 두 feature의 PoC(P)는 2026-11-06에 마쳤다(각 tasks 'P 결과').

1. `work-update` — [spec](../work-update/spec.md)·[design](../work-update/design.md)·[tasks](../work-update/tasks.md). 초안 `.doan/canvases/work-update.html` 사용자 확정(design §9). guide를 줄이고(G0) `update` 문장을 넣으며(E1) 전체 `/agent-eval` 라운드로 새 기준을 만든다. canvas-handoff는 guide를 바꾸지 않으므로(그 design 결정 11) guide 예산은 이 링크만 쓴다. 그래서 먼저 둔다(사용자, 2026-11-06).
2. `canvas-handoff` — [spec](../canvas-handoff/spec.md)·[design](../canvas-handoff/design.md)·[tasks](../canvas-handoff/tasks.md). `/feature-review` 반영(`d12f2686`), 초안 `.doan/canvases/canvas-handoff.html` 사용자 확정(design '초안 요청'). 링크 1이 병합한 모양 위에서 시작한다.

두 링크가 함께 고치는 곳: `cli/internal/cli/run.go`(앱 대화 환경 변수 읽기: `DOAN_CONVERSATION_ID` / 핸드오프 키), 앱 대화 환경(`app/src/main/conversation/environment.ts`, `agentAuth/environment.ts`의 `RESERVED`), `app/src/main/runtime.ts` `answerLine`(v3 `update` / v5 handoff), `doan help`와 `nextSteps`, `eval/lib/socket.ts`의 fake app. 링크 2 지휘자는 링크 1이 병합한 모양을 다시 읽고 시작한다.

## 시작 점검 (첫 지휘자)

첫 지휘자(링크 1)는 시작 전에 다음을 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 적는다. 승인 뒤에는 링크마다 멈추지 않는다. 승인 뒤 각 지휘자는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

- work-update `/feature-review`: git 이력에 리뷰 반영 커밋이 없다(`b91bf162` 작성, `b4d6e90a`·`3be3961e` 초안 확정). 리뷰를 돌릴지, 생략할지 묻는다.
- work-update 초안: design §9에 "마지막 수정본(너비 규칙, 공통 앞부분, 커서)의 모양은 사람이 아직 앱에서 다시 보지 않았다"고 적혀 있다. 그 뒤 `3be3961e`(커서 간격 2px 확정)가 있다. 수정본을 확인했는지 묻는다.
- work-update Z1 검증의 "남은 `work-update` 링크를 찾는 명령"이 "command undecided — needs user confirmation"이다. 명령을 정한다.
- 실제 HOME과 공용 프로필 사용을 두 링크 몫으로 한 번에 받는다(work-update R1 (b)의 앱 대화, canvas-handoff R의 provider 확인). 프로필에는 다섯 provider가 연결되어 있으므로 연결 상태만 확인한다. Cursor는 2026-11-06 PoC 때 계정 한도("Upgrade your plan to continue")로 턴이 시작되지 않았다. 사람의 판단으로 미검증으로 두고, R에서 한도가 풀렸으면 다시 본다.

## 상시 권한

- **main 병합과 인계**(체인 기본): 각 링크가 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제를 마친 뒤 자기 PR을 main에 병합하고 다음 링크에 인계한다.
- **멈추지 않고 진행**: 새 의존성, 범위 밖 변경, 실제 사용자 상태를 되돌릴 수 없게 바꾸는 일만 묻는다.
- **지휘자 런타임**: Claude Code. 작업자도 Claude다. 모델 계열을 넘는 작업자(Codex)는 사용자가 이 체인에 허용하지 않았다. 허용하면 그 범위를 여기 적는다. `/agent-eval`이 Claude Code와 Codex를 모두 돌리는 것은 AGENTS.md의 상시 예외다.

## 로그인

- 로그인한 provider가 필요한 확인: work-update R1 (b)(Claude Code, 가능하면 Codex의 캔버스 대화·project 대화), canvas-handoff R(다섯 provider의 핸드오프).
- probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`. 앞 체인에서 만든 것을 지우지 않고 이 체인까지 쓴다(사용자, 2026-11-06). 그 자리의 프로필을 main checkout의 Electron으로 연다(복사본은 vault를 읽지 못한다). 프로필을 망가뜨릴 수 있는 probe만 복사본으로 돌린다. 로그인을 다시 요청하기 전에 연결 상태를 먼저 확인한다. probe repo를 그 프로필의 `folders.json`에 더했다면 끝나고 되돌린다.
- 실행 방법 선례: `/Users/sinhyeok/code/doan-design/.scratch/canvas-handoff/`의 `launch.sh`(main checkout build·Electron, spawn hook, CDP)와 `drive.mjs`(preload API로 대화 시작, permission 기록). worktree 빌드는 main checkout의 Electron으로 열 수 있다(chain-261105 링크 2 인계 5).
- 링크마다 로그아웃하지 않는다. 마지막 링크가 병합하기 전에 앱에서 연결을 모두 로그아웃하고, 그 프로필이 만든 Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다. 실제 Keychain에서 지우기 전에 사용자에게 묻는다.
- 앞 체인이 남긴 임시 Claude 로그인도 이 체인이 맡는다(사용자, 2026-11-06에 남겨 두기로 함): `CLAUDE_CONFIG_DIR` `/Users/sinhyeok/code/doan-design/.scratch/prompt-suggestion/claude-config`(SDK script PoC용 `p1.mjs`가 씀)와 Keychain 항목 `Claude Code-credentials-dc1943d2`. SDK script로 돌리는 PoC가 있으면 다시 쓰고, 마지막 링크의 정리 때 사용자에게 물은 뒤 함께 지운다.
- 셸에서 `doan check`를 돌릴 때는 임시 `DOAN_RUNTIME`을 준다(ARCHITECTURE §4 'Shell check session associations').

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 작업자 대기는 orchestrate의 대기 loop를 따른다. 멈춘 작업자 감지 포함(orchestrate §2).
- `/agent-eval`: 두 링크 모두 해당한다. work-update는 guide·CLI 출력·eval 시나리오(W5)를, canvas-handoff는 `doan help`·`nextSteps`·eval 시나리오(핸드오프, R8c·R9 대체)를 바꾼다.
- macOS `printenv`는 이름을 하나만 받는다. 환경 확인은 변수마다 따로 묻는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 work-update | — | — | — | 대기 |
| 2 canvas-handoff | — | — | — | 대기 |

## 인계 기록

- 2026-11-06 체인 작성 세션(chain-261105 링크 3 지휘자, context-window-ring-orch): 사용자가 두 feature를 한 체인으로 묶고 순서(work-update → canvas-handoff)를 정했다. 앞 체인이 main에 들어가고 정리되면 바로 이어서 시작한다. 병합과 인계는 체인 기본이다(`/chain` §1 step 3, `103f2dee`). 이 세션은 앞 체인의 링크 3을 맡고 있으므로, 이 체인의 첫 지휘자는 새 세션이다. 앞 체인 정리 때 공용 프로필은 지우지 않고, 링크 2가 남긴 임시 `CLAUDE_CONFIG_DIR`과 그 Keychain 항목만 지운다.
