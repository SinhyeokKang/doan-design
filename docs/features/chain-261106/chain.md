# 체인 2026-11-06

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

링크는 직렬이다. 앞 링크가 main에 병합된 뒤 다음 링크가 최신 `origin/main`에서 시작한다. 이 체인은 앞 체인 [chain-261105](../chain-261105/chain.md)의 마지막 링크(context-window-ring)가 병합되고 그 체인이 정리된 뒤 시작한다(사용자, 2026-11-06). 링크 1·2의 PoC(P)는 2026-11-06에 마쳤다(각 tasks 'P 결과'). 링크 3에는 PoC가 없다.

1. `work-update` — [spec](../work-update/spec.md)·[design](../work-update/design.md)·[tasks](../work-update/tasks.md). 초안 `.doan/canvases/work-update.html` 사용자 확정(design §9). guide를 줄이고(G0) `update` 문장을 넣으며(E1) 전체 `/agent-eval` 라운드로 새 기준을 만든다. canvas-handoff는 guide를 바꾸지 않으므로(그 design 결정 11) guide 예산은 이 링크만 쓴다. 그래서 먼저 둔다(사용자, 2026-11-06).
2. `canvas-handoff` — [spec](../canvas-handoff/spec.md)·[design](../canvas-handoff/design.md)·[tasks](../canvas-handoff/tasks.md). `/feature-review` 반영(`d12f2686`), 초안 `.doan/canvases/canvas-handoff.html` 사용자 확정(design '초안 요청'). 링크 1이 병합한 모양 위에서 시작한다.
3. `small-ui-tweaks` — [spec](../small-ui-tweaks/spec.md)·[design](../small-ui-tweaks/design.md)·[tasks](../small-ui-tweaks/tasks.md). 초안 `.doan/canvases/small-ui-tweaks.html` 사용자 확정(tasks D1b·D2b·D3). 사용자가 이 체인의 세 번째 링크로 더했다(2026-11-06). 링크 1과 `CanvasAgent.tsx`·`agentIndicator.ts`·DESIGN.md를 함께 고친다. 링크 1은 작업 notice의 글과 고르기를, 이 링크는 `DotField`의 점 무늬 자리(항목 2)를 바꾼다. 링크 2와 겹치는 파일은 DESIGN.md뿐이다. 가장 작고 앞 링크들이 바꾼 모양 위에서 시작해야 하므로 마지막에 둔다.

링크 1·2가 함께 고치는 곳: `cli/internal/cli/run.go`(앱 대화 환경 변수 읽기: `DOAN_CONVERSATION_ID` / 핸드오프 키), 앱 대화 환경(`app/src/main/conversation/environment.ts`, `agentAuth/environment.ts`의 `RESERVED`), `app/src/main/runtime.ts` `answerLine`(v3 `update` / v5 handoff), `doan help`와 `nextSteps`, `eval/lib/socket.ts`의 fake app. 링크 2 지휘자는 링크 1이 병합한 모양을 다시 읽고 시작한다.

## 시작 점검 (첫 지휘자)

**사용자는 링크 1 초반까지만 지원할 수 있다**(사용자, 2026-11-06). 그래서 첫 지휘자는 세 링크의 tasks를 모두 훑는다. 사람의 확인, 승인, 로그인, 결정이 필요한 일을 찾아, 사용자가 있는 동안 끝내거나 미리 승인을 받아 '인계 기록'에 적는다. 그 뒤의 지휘자는 여기 적힌 승인만으로 진행한다. 승인되지 않은 일이 나오면 그 링크는 "병합 준비됨"에서 멈추고 보고한다. 아래 항목 외에 미리 볼 것:

- 링크 1·2의 초안 확인(work-update D1, canvas-handoff D)이 이미 끝났는지 확인한다. 공용 프로필로 돌리는 probe의 실행 승인(work-update P·R1 (b), canvas-handoff P·R)은 세 링크 몫으로 한 번에 받는다.
- 마지막 링크의 로그인 정리('로그인' 절): 앱의 연결 로그아웃, 실제 Keychain 항목 삭제(`Claude Code-credentials-dc1943d2` 포함), userData와 `.scratch/prompt-suggestion/claude-config` 삭제를 미리 승인받는다. 승인받지 못하면 정리를 남기고 보고한다(답: 전부 남김). 이 체인 밖의 project-skill-drawer·turn-activity PoC(P)도 같은 공용 프로필을 쓴다(각 tasks P). 그래서 체인이 끝날 때 프로필을 지울지 남길지도 함께 묻는다.
- small-ui-tweaks R1 (b) "사람이 병합 전에 실제 앱에서 움직임을 본다"는 링크 3 구현 뒤에만 할 수 있다. 그때 사용자는 지원할 수 없다. 이 조건을 어떻게 할지 사용자에게 받는다. 예를 들면 녹화와 프레임 측정으로 대신하고 병합할지, 링크 3 PR을 병합하지 않고 사용자를 기다릴지다.

첫 지휘자(링크 1)는 시작 전에 다음을 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 적는다. 승인 뒤에는 링크마다 멈추지 않는다. 승인 뒤 각 지휘자는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

- work-update `/feature-review`: git 이력에 리뷰 반영 커밋이 없다(`b91bf162` 작성, `b4d6e90a`·`3be3961e` 초안 확정). 리뷰를 돌릴지, 생략할지 묻는다.
- work-update 초안: design §9에 "마지막 수정본(너비 규칙, 공통 앞부분, 커서)의 모양은 사람이 아직 앱에서 다시 보지 않았다"고 적혀 있다. 그 뒤 `3be3961e`(커서 간격 2px 확정)가 있다. 수정본을 확인했는지 묻는다.
- work-update Z1 검증의 "남은 `work-update` 링크를 찾는 명령"이 "command undecided — needs user confirmation"이다. 명령을 정한다.
- 실제 HOME과 공용 프로필 사용을 두 링크 몫으로 한 번에 받는다(work-update R1 (b)의 앱 대화, canvas-handoff R의 provider 확인). 프로필에는 다섯 provider가 연결되어 있으므로 연결 상태만 확인한다. Cursor는 2026-11-06 PoC 때 계정 한도("Upgrade your plan to continue")로 턴이 시작되지 않았다. 사람의 판단으로 미검증으로 두고, R에서 한도가 풀렸으면 다시 본다.
- small-ui-tweaks `/feature-review`: git 이력에 리뷰 반영 커밋이 없다(`fa2cb803` 작성, `fba4c0d0` 세 줄 규칙과 확정 초안 범위). 리뷰를 돌릴지, 생략할지 묻는다.
- small-ui-tweaks 병합 조건: R1 (b)는 "사람이 병합 전에 실제 앱에서 움직임을 본다"(design §5)이다. 사용자가 녹화와 프레임 측정으로 대신하기로 했다(인계 기록 '시작 점검 승인').

시작 점검의 답은 인계 기록 '시작 점검 승인'에 있다.

## 상시 권한

- **main 병합과 인계**(체인 기본): 각 링크가 통합 gate(통합 HEAD `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제를 마친 뒤 자기 PR을 main에 병합하고 다음 링크에 인계한다.
- **멈추지 않고 진행**: 새 의존성, 범위 밖 변경, 실제 사용자 상태를 되돌릴 수 없게 바꾸는 일만 묻는다.
- **지휘자 런타임**: Claude Code. 주 작업자도 Claude다. **Codex 작업자 허용**(사용자, 2026-11-06, "Codex 지금 89퍼. 써도 되긴 하는데, 링크 지휘자가 판단하도록 맡기고"): 범위는 세 링크 모두이고, 쓸지와 얼마나 쓸지는 각 링크 지휘자가 정한다. 89%는 쓴 양이다(사용자, 2026-11-06). 사용자가 이어서 "Codex 써 좀. Link 1에서라도", "주로 리뷰 시켜"라고 했다. 그래서 링크 1은 Codex 작업자를 주로 리뷰(`/code-review` 등)에 쓴다. 링크 2·3은 남은 양을 보고 정한다. 지휘자는 링크를 시작할 때와 batch를 나눌 때 Codex 주간 한도를 직접 확인한다. 가장 최근 Codex rollout의 `rate_limits` 가운데 `"window_minutes":10080` 항목을 읽는다. claude-dashboard의 Codex %는 30일 창이라 쓰지 않는다. 남은 양이 적으면 쓰지 않는다. 쓴 범위는 각 링크의 `orch.md`에 적는다. `/agent-eval`이 Claude Code와 Codex를 모두 돌리는 것은 AGENTS.md의 상시 예외다.

## 로그인

- 로그인한 provider가 필요한 확인: work-update R1 (b)(Claude Code, 가능하면 Codex의 캔버스 대화·project 대화), canvas-handoff R(다섯 provider의 핸드오프).
- probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`. 앞 체인에서 만든 것을 지우지 않고 이 체인까지 쓴다(사용자, 2026-11-06). 그 자리의 프로필을 main checkout의 Electron으로 연다(복사본은 vault를 읽지 못한다). 프로필을 망가뜨릴 수 있는 probe만 복사본으로 돌린다. 로그인을 다시 요청하기 전에 연결 상태를 먼저 확인한다. probe repo를 그 프로필의 `folders.json`에 더했다면 끝나고 되돌린다.
- 실행 방법 선례: `/Users/sinhyeok/code/doan-design/.scratch/canvas-handoff/`의 `launch.sh`(main checkout build·Electron, spawn hook, CDP)와 `drive.mjs`(preload API로 대화 시작, permission 기록). worktree 빌드는 main checkout의 Electron으로 열 수 있다(chain-261105 링크 2 인계 5).
- 로그아웃하지 않고 지우지 않는다(사용자, 2026-11-06, 시작 점검 "전부 남김"). 마지막 링크도 공용 프로필, 그 Keychain 항목, 아래 임시 Claude 로그인을 그대로 두고, 남은 것을 보고만 한다. project-skill-drawer·turn-activity PoC가 같은 프로필을 쓴다.
- 앞 체인이 남긴 임시 Claude 로그인도 이 체인이 맡는다(사용자, 2026-11-06에 남겨 두기로 함): `CLAUDE_CONFIG_DIR` `/Users/sinhyeok/code/doan-design/.scratch/prompt-suggestion/claude-config`(SDK script PoC용 `p1.mjs`가 씀)와 Keychain 항목 `Claude Code-credentials-dc1943d2`. SDK script로 돌리는 PoC가 있으면 다시 쓴다. 체인 끝에도 지우지 않는다(위 항목).
- 셸에서 `doan check`를 돌릴 때는 임시 `DOAN_RUNTIME`을 준다(ARCHITECTURE §4 'Shell check session associations').

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- **main이 체인 밖에서도 움직인다**(사용자, 2026-11-06): 체인이 도는 동안 사용자와 main checkout 세션이 project-skill-drawer·turn-activity의 `/feature-review` 반영 커밋(`docs/features/<slug>/`)과 `/design-draft` 초안(`.doan/canvases/`의 새 파일)을 main에 직접 쌓는다. 각 링크는 PR을 병합하기 전에 `feat/<slug>`를 최신 `origin/main` 위로 rebase하고, 통합 gate를 그 HEAD에서 돌린다. 겹치는 파일은 없을 것으로 보지만, 충돌이 나면 main 쪽 문서와 초안을 그대로 두고 링크 쪽만 맞춘다.

- 작업자 대기는 orchestrate의 대기 loop를 따른다. 멈춘 작업자 감지 포함(orchestrate §2).
- `/agent-eval`: 링크 1·2가 해당한다. 링크 3은 guide·CLI 출력·`doan check` 규칙·skill stub을 바꾸지 않으므로 해당하지 않는다. 로그인한 provider도 쓰지 않는다(R1은 격리 `DOAN_RUNTIME`의 작업 신호로 본다). work-update는 guide·CLI 출력·eval 시나리오(W5)를, canvas-handoff는 `doan help`·`nextSteps`·eval 시나리오(핸드오프, R8c·R9 대체)를 바꾼다.
- macOS `printenv`는 이름을 하나만 받는다. 환경 확인은 변수마다 따로 묻는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 work-update | work-update-orch | 2026-11-06 | — | 시작 점검 끝, `/feature-review` |
| 2 canvas-handoff | — | — | — | 대기 |
| 3 small-ui-tweaks | — | — | — | 대기 |

## 인계 기록

- 2026-11-06 체인 작성 세션(chain-261105 링크 3 지휘자, context-window-ring-orch): 사용자가 두 feature를 한 체인으로 묶고 순서(work-update → canvas-handoff)를 정했다. 앞 체인이 main에 들어가고 정리되면 바로 이어서 시작한다. 병합과 인계는 체인 기본이다(`/chain` §1 step 3, `103f2dee`). 이 세션은 앞 체인의 링크 3을 맡고 있으므로, 이 체인의 첫 지휘자는 새 세션이다. 앞 체인 정리 때 공용 프로필은 지우지 않고, 링크 2가 남긴 임시 `CLAUDE_CONFIG_DIR`과 그 Keychain 항목만 지운다.
- 2026-11-06 링크 추가 세션: 사용자가 `small-ui-tweaks`를 세 번째 링크로 더했다("small ui tweaks는 체인에 넣어줘. 3링크로 가자"). 순서는 work-update → canvas-handoff → small-ui-tweaks다. 시작 점검에 small-ui-tweaks의 리뷰 여부와 병합 조건(사람이 움직임을 본 뒤 병합)을 더했다.
- 2026-11-06 체인 시작 세션: 사용자가 체인 시작을 지시했다. 사용자가 더한 조건 세 가지다. (1) Codex 작업자 허용, 쓸지는 링크 지휘자가 판단(상시
권한). (2) 사용자는 링크 1 초반까지만 지원하므로, 첫 지휘자가 세 링크에서 사람이 필요한 일을 먼저 끝내거나 승인을 받아 둔다(시작
점검). (3) main checkout에서 project-skill-drawer·turn-activity의 리뷰 반영과 초안이 main에 쌓이므로 링크마다 병합 전에 rebase한다(운영
메모).
- 2026-11-06 **시작 점검 승인**(링크 1 지휘자, work-update-orch). 사용자가 질문 라운드에서 답했다. 뒤 지휘자는 이 승인만으로 진행한다.
  1. work-update `/feature-review`: 지금 돌린다. 링크 1 지휘자가 `/orchestrate` 전에 돌리고, 결정할 점은 사용자가 있는 동안 묻는다.
  2. work-update 초안 마지막 수정본(너비 규칙, 공통 앞부분, 커서 2px): 사용자가 앱에서 봤고 확정했다. design §9를 그렇게 고쳤다.
  3. work-update Z1에서 남은 링크를 찾는 명령: `rg -n "features/work-update" docs AGENTS.md README.md .agents -g '!docs/features/chain-*'`가 아무것도 찾지 않으면 통과다. 초안 이름 `work-update.html`은 남아도 된다.
  4. tasks의 "멈추고 사람에게 보고" 조건(work-update G0의 eval이 이전 round보다 나빠짐, E1에서 agent가 `update`를 거의 보내지 않거나 틀린 id를 보냄, small-ui-tweaks R1 (b)에서 16ms를 넘는 프레임이 늘어남 등): **지휘자가 판단한다**. 원인을 보고 고칠 수 있으면 고쳐 진행하고, 판단과 근거를 그 링크의 `orch.md`와 이 기록에 남긴다.
  5. 링크 1·2의 실제 HOME과 공용 프로필 probe(work-update R1 (b), canvas-handoff R1. probe repo는 `folders.json`에 잠시 더했다가 되돌린다)와 실제 Claude Code·Codex로 돌리는 `/agent-eval`(work-update G0·E1, canvas-handoff E3): 승인. 실행할 때 다시 묻지 않는다.
  6. small-ui-tweaks `/feature-review`: 생략한다.
  7. small-ui-tweaks R1 (b)의 사람 확인: 녹화와 rAF 프레임 측정으로 대신한다. 측정이 design §2.2의 성능 기준에 맞으면 링크 3 지휘자가 병합한다.
  8. 체인 끝 로그인 정리: 전부 남긴다(공용 프로필 userData와 그 Keychain 항목, `.scratch/prompt-suggestion/claude-config`, Keychain `Claude Code-credentials-dc1943d2`). 마지막 링크는 남은 것을 보고만 한다.
  9. Codex 89%는 쓴 양이다. 링크 1에서는 Codex 작업자를 주로 리뷰에 쓴다(상시 권한).
  - 참고: canvas-handoff D1은 design '초안 요청'에 사용자 확정(2026-11-05)이 있지만 tasks 체크박스가 비어 있다. 링크 2 지휘자가 체크한다.
