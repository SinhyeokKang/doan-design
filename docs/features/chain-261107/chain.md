# 체인 2026-11-07

규칙: [`/chain`](../../../.agents/skills/chain/SKILL.md) §3, AGENTS.md 'Workflow'의 Chains 항목. 이 파일은 이 체인의 순서·상시 권한·상태·인계 기록의 정본이다. 마지막으로 병합하는 링크가 병합한 뒤 이 디렉터리를 지운다.

## 순서

세 링크는 직렬이다. 병렬 조건(`/chain` §1 step 2)에 맞는 짝이 없다.
- 링크 1과 2는 `app/src/renderer/SettingsMcpConnectors.tsx`(1: A6 RowButton의 툴팁 설명, 2: URL 칸 `spellCheck={false}`)와 `app/src/renderer/styles.css`(1: Quick Open 읽는 중 행·strip 오류 줄, 2: 앱 크롬 `user-select`)를 함께 고친다.
- 링크 3은 `app/src/main/index.ts`(2: context-menu, 3: 종료 경로), `Onboarding.tsx`, `SettingsAgents.tsx`(1: Esc·Effort 값, 3: `run` helper)를 함께 고치고, exhaustive-deps 경고 수 N이 앞 두 링크가 바꾸는 renderer 파일에 따라 달라진다.

1. `defect-sweep` — spec·design·tasks·orch는 링크 1이 승격한 뒤 지웠다(`70c29395`). `/feature-review` 반영(`06191f45`), BACKLOG 결정(`a75964d0`, `d75f21ec`). 시안 없음(문구·상태 수정이라 DESIGN 측정값만 고친다). 버그 고침이라 먼저 둔다. 다섯 batch 가운데 C(CLI)와 T(테스트·eval)는 링크 안에서 병렬로 시작할 수 있다(design §5).
2. `text-edit-menu` — [spec](../text-edit-menu/spec.md)·[design](../text-edit-menu/design.md)·[tasks](../text-edit-menu/tasks.md). `/feature-review` 반영(`f66c2bf5`). 시안 없음(macOS가 그리는 메뉴, 사용자 결정). 링크 1이 고친 renderer와 `styles.css` 위에서 시작한다.
3. `ts-lint-gate` — [spec](../ts-lint-gate/spec.md)·[design](../ts-lint-gate/design.md)·[tasks](../ts-lint-gate/tasks.md). `/feature-review` 반영(`58d67bc5`). 앞 두 링크가 병합된 뒤 경고 수 N을 한 번만 정확히 세도록 마지막에 둔다(tasks T4의 rebase 뒤 재측정).

## 시작 점검 (첫 지휘자)

사용자가 아래 항목을 미리 모두 승인했다(인계 기록 '시작 점검 승인'). 첫 지휘자는 다시 묻지 않고 바로 시작한다. 처음 쓰던 지시: 첫 지휘자(링크 1)는 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 적는다. 승인 뒤 각 지휘자는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

- defect-sweep R-6·M-4: 공용 프로필(아래 '로그인')로 실제 Codex(필요하면 Claude) 턴을 돌리는 probe를 승인받는다. probe repo는 `folders.json`에 잠시 더했다가 되돌린다. 승인이 없으면 이벤트 주입으로 보고 미검증으로 남긴다.
- text-edit-menu T4: native 메뉴를 실제 오른쪽 클릭으로 열고, OS 수준 스크린샷(`screencapture`)과 native Esc로 확인한다. 화면과 포인터를 직접 움직이는 일(예: `orca computer`)이라 사람이 자리를 비운 시간에 해도 되는지, 몇 분 동안 화면을 쓰는지 승인받는다. clipboard는 probe가 저장했다가 되돌린다.
- ts-lint-gate: 새 명령 `npm --prefix app run lint`를 검증에 쓰는 것(T3에서 AGENTS.md 'Commands'에 올라가기 전까지 "command undecided"로 적혀 있다)을 승인받는다.
- 체인 끝 로그인 정리: 공용 프로필 userData와 그 Keychain 항목을 남길지 지울지 받는다. 앞 체인들의 답을 이 체인에 옮기지 않는다.

## 상시 권한

- **main 병합과 인계**(체인 기본): 각 링크가 통합 gate(최신 `origin/main` 위로 rebase한 HEAD에서 `/verify`, 영향받은 앱 동작 `/runtime-test`, 해당하면 `/agent-eval`)와 문서 승격·feature 디렉터리 삭제를 마친 뒤 자기 PR을 main에 병합하고 다음 링크에 인계한다.
- **지휘자 런타임**: Claude Code. 주 작업자도 Claude다.
- **Codex 작업자 허용**(사용자, 2026-11-07, "코덱스 허가"): 범위는 세 링크 모두이고, 쓸지와 얼마나 쓸지는 각 링크 지휘자가 정한다. 지휘자는 링크를 시작할 때와 batch를 나눌 때 Codex 주간 한도를 직접 확인한다. 가장 최근 Codex rollout의 `rate_limits` 가운데 `"window_minutes":10080` 항목을 읽는다. 남은 양이 적으면 쓰지 않는다. 쓴 범위는 각 링크의 `orch.md`에 적는다.

## 로그인

- 로그인한 provider가 필요한 확인: defect-sweep R-6(Codex 만료 permission)과 M-4(symlink 경로 프로젝트의 Codex·Claude 시작). 시작 점검에서 승인받은 경우에만 쓴다.
- probe는 실제 HOME(Keychain)의 로그인을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- 공용 프로필: main checkout의 절대 경로 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`. 링크마다 worktree가 따로라서 이 자리를 함께 쓴다. 그 자리의 프로필을 main checkout의 Electron으로 연다(복사본은 vault를 읽지 못한다). 프로필을 망가뜨릴 수 있는 probe만 복사본으로 돌린다. 로그인을 다시 요청하기 전에 연결 상태를 먼저 확인한다. 링크마다 로그아웃하지 않는다. 체인 끝 정리는 시작 점검의 답을 따른다.
- 실행 방법 선례: `/Users/sinhyeok/code/doan-design/.scratch/project-skill-drawer/`의 `launch.sh`, `drive.mjs`.
- 셸에서 `doan check`를 돌릴 때는 임시 `DOAN_RUNTIME`을 준다(ARCHITECTURE §4 'Shell check session associations').

## 인계와 물러나기

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- **main이 체인 밖에서도 움직인다**: local-doan-files가 자기 worktree(`local-doan-files-orch`)에서 진행 중이고, 그 뒤 overview-tabs가 이어진다. thread 답 caret 수정(`reply-caret-orch`)도 따로 PR을 낸다. 각 링크는 PR을 병합하기 전에 `feat/<slug>`를 최신 `origin/main` 위로 rebase하고, 통합 gate를 그 HEAD에서 돌린다. 충돌이 나면 main 쪽을 그대로 두고 링크 쪽만 맞춘다. local-doan-files는 `Onboarding.tsx`·`ProjectSettingsPage.tsx`·CLI·`skill.md`를 고치므로 링크 1·3과 겹칠 수 있다.
- 작업자 대기는 orchestrate의 대기 loop를 따른다. 멈춘 작업자 감지 포함(orchestrate §2).
- `/agent-eval`: 세 링크 모두 guide, skill stub, `doan check` 규칙을 바꾸지 않는다. 링크 1의 D1(`doan active`·`doan onboarding`이 64 KiB를 넘는 응답 줄을 거절)은 CLI 출력의 경계만 바꾸므로 지휘자가 해당 여부를 판단한다. 링크 1의 E3는 eval 판정을 고치므로 `/verify --eval`과 필터 없는 `node eval/run.ts --self-test`를 돌린다.
- 링크 3의 N은 링크 1·2 병합 뒤의 main에서 센다. 링크 3 지휘자가 시작할 때 다시 센다.
- macOS `printenv`는 이름을 하나만 받는다. 환경 확인은 변수마다 따로 묻는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1 defect-sweep | — | — | — | 대기 |
| 2 text-edit-menu | — | — | — | 대기 |
| 3 ts-lint-gate | — | — | — | 대기 |

## 인계 기록

- 2026-11-07 체인 작성 세션(main checkout, 세 feature의 `/feature`·`/feature-review`를 진행한 세션): 사용자가 defect-sweep, text-edit-menu, ts-lint-gate를 한 체인으로 묶었다("세개 묶어서 체인가자"). 순서는 이 세션이 겹치는 파일과 lint 경고 수 측정 시점으로 정했다. 병합과 인계는 체인 기본이다. 첫 지휘자는 사용자가 시작을 지시하면 띄운다.
- 2026-11-07 **시작 점검 승인**(체인 작성 세션). 사용자가 "코덱스 허가, 미리 전부승인"이라고 했다. 뒤 지휘자는 이 승인만으로 진행한다.
  1. defect-sweep R-6·M-4의 공용 프로필 실제 턴 probe: 승인. 실행할 때 다시 묻지 않는다.
  2. text-edit-menu T4의 실제 오른쪽 클릭·OS 스크린샷·native Esc(화면과 포인터 사용): 승인.
  3. ts-lint-gate의 새 명령 `npm --prefix app run lint`를 검증에 쓰는 것: 승인.
  4. 체인 끝 로그인 정리: "전부 승인"은 지우는 쪽을 고른 말이 아니므로, 되돌릴 수 없는 삭제를 하지 않고 공용 프로필 userData와 그 Keychain 항목을 남긴다. 마지막 링크는 남은 것을 보고만 한다.
  5. Codex 작업자 허용(상시 권한).
