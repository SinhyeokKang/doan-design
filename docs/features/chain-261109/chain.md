# chain-261109

## 규칙

- 진행 방식: [`/chain` skill](../../../.agents/skills/chain/SKILL.md), AGENTS.md 'Workflow' Chains.
- 이 파일은 lead만 쓴다. conductor는 시작할 때 읽기만 한다.

## 순서

체인은 직렬이다. 두 링크가 모두 `cli/internal/repo`를 고친다(config-error-source는 `find.go`와 envelope, export-hardening은 `resolve.go`의 `diskSpelling`과 새 `Resolver`). 공유 문서는 겹침에 넣지 않았다.

1. **config-error-source** — [spec](../config-error-source/spec.md) · [design](../config-error-source/design.md) · [tasks](../config-error-source/tasks.md)
   - `/feature-review`: 했다(`ffb565f3`). 남은 확인 필요는 없다.
   - 초안: T0에서 첫 실행 `project_unreadable` 상태를 새로 그린다. 사람의 앱 확인 대신 독립 reviewer 확인으로 진행한다(시작 점검 2).
   - 순서 이유: 사람이 정한 병합 순서(config-error-source가 monorepo-services보다 먼저)가 있고, 알려진 결함 수정이라 먼저 간다. 변경도 더 작다.
2. **export-hardening** — [spec](../export-hardening/spec.md) · [design](../export-hardening/design.md) · [tasks](../export-hardening/tasks.md)
   - `/feature-review`: 했다(`9c251c43`). 남은 확인 필요는 없다.
   - 초안: 없다(UI 변경 없음).
   - 순서 이유: `cli/internal/repo`를 크게 고치므로 링크 1이 병합된 뒤 그 위에서 시작한다. 링크 중 가장 크다.

## 시작 점검

사용자가 2026-11-09에 한 번에 승인했다("코덱스 워커 허가, 모두 승인"). 기록은 `인계 기록`에 있다.

1. 두 링크의 결정과 리뷰 반영은 끝났다. 남은 확인 필요는 없다.
2. config-error-source T0 초안은 사람이 앱에서 확인하지 않는다. 사용자 지시대로 `project_unreadable` 상태를 기존 `doan-onboarding.html`이 아니라 `.doan/canvases/`의 새 캔버스에 그린다. 독립 reviewer(다른 subagent)가 그 캔버스를 feature 문서와 기존 첫 실행 장면을 기준으로 리뷰하고 conductor가 지적을 고친다. 사용자가 구현 뒤에 확인할 수 있도록 PR 본문에 새 캔버스 경로, frame id와 `doan open` 명령, reviewer 결과, 구현한 상태의 격리 앱 스크린샷(못 찍었으면 미검증)을 적는다. 사용자가 돌아와 보고 다르면 후속으로 고친다.
3. export-hardening 리뷰 반영 중 문서 작성자가 정한 세부(결과에서 base `href`만 지우고 `target`만 남은 base는 둔다, 움직이는 base 아래 로컬 iframe은 `ReasonFrame`, scope 밖·없는 참조는 `ReasonBase` 하나, 쓰지 않는 custom property `url()`은 그대로, 측정 기준 빌드와 생성기 T0)는 "모두 승인"으로 받아들였다.
4. 실제 앱 확인(`/runtime-test`)은 provider 로그인 없이 격리 앱으로 한다. 사용자는 자리에 없고 화면이 꺼져 있다. 화면이 잠겨 probe가 화면 캡처나 창 표시를 못 하면 그 항목은 미검증으로 PR 본문에 적고 진행한다. 실제 HID 입력이나 사용자 화면 조작은 쓰지 않는다.
5. 두 링크 모두 `/agent-eval`을 돈다(CLI 출력·메시지가 바뀐다). packaged CLI로 실제 Claude Code와 Codex를 돌리는 것까지 승인했다.

승인 뒤 conductor는 일상적인 결정을 스스로 내리고, 새 제품·범위 결정이나 실제 사용자 상태에 닿는 결정만 묻는다. 사용자가 없으므로 그런 질문이 생기면 그 지점에서 멈추고 PR 본문이나 터미널에 남긴다.

## 상시 권한

- lead는 각 링크의 PR을 리뷰와 gate가 통과하면 링크 순서대로 develop에 merge하고 다음 링크를 시작한다.
- conductor runtime: Claude Code(lead와 같은 family).
- 모델 경계: 사용자가 두 링크 모두에서 Codex worker를 허가했다(2026-11-09, "코덱스 워커 허가"). conductor는 링크 시작과 batch를 나눌 때 Codex 남은 사용량을 확인하고, 각 링크의 `orch.md`에 쓴 범위를 적는다.
- 그 밖의 승인: 사용자가 "모두 승인"으로 이 체인 안의 일상 승인(worker 실행, `/agent-eval`, 격리 앱 probe)을 미리 주었다. 실제 HOME, 실제 Keychain, 실제 provider 로그인을 바꾸는 일은 여기에 들지 않는다.

## 진행 규칙

[`/chain` §3](../../../.agents/skills/chain/SKILL.md#3-running-the-links)을 따른다.

## 운영 메모

- worker 대기: worker가 `worker_done` 없이 멈출 수 있다. 대기 loop는 idle prompt나 working이 아닌 활동에서 깨운다.
- `/agent-eval`: 두 링크 모두 해당한다(config-error-source T7, export-hardening T13). Orca worker 안에서 eval이 거짓 stop escalation을 낼 수 있고, 실제 `/Applications/Doan.app`이 eval real-state를 건드릴 수 있다.

## 링크 상태

| 링크 | session·worktree | 시작 | PR·merge | 상태 |
|---|---|---|---|---|
| config-error-source | Claude Code · `~/orca/workspaces/doan-design/config-error-source-orch` (`feat/config-error-source`) | 2026-11-09 | — | 진행 중 |
| export-hardening | — | — | — | 대기 |

## 인계 기록

- 2026-11-09 lead(develop checkout): 체인 파일을 썼다. 사용자가 두 링크의 체인 진행, Codex worker, 모든 승인을 한 번에 허가했고, config-error-source 초안 확인은 독립 reviewer로 대신하기로 했다. 링크 1을 시작한다.
