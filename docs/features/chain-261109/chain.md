# chain-261109

## 규칙

- 진행 규칙은 [`/chain` skill](../../../.agents/skills/chain/SKILL.md)과 [AGENTS.md 'Workflow'](../../../AGENTS.md#workflow-skill-lineup)의 Chains를 따른다.
- 이 파일은 lead만 고치고 develop에 commit·push한다. conductor는 intake 때 읽기만 한다.

## 순서

체인은 직렬이다. 두 링크가 같은 코드 파일을 고치므로 병렬 그룹이 없다.

- 겹치는 파일: `app/src/main/conversation/runners.ts`(turn-end-state는 P3의 child `exit` trigger, provider-profile-isolation은 Codex·Claude spawn을 fence로 감쌈), `app/src/main/conversation/service.ts`(turn-end-state는 P4의 `exited()`·`send`·`interrupt`, provider-profile-isolation은 `Prepared.fence` 필드), 그리고 `runners.test.ts`.

1. **turn-end-state** — [spec](../turn-end-state/spec.md) · [design](../turn-end-state/design.md) · [tasks](../turn-end-state/tasks.md)
   - 상태: `/feature-review`를 반영했다(`fd730664`). 초안 없음(`/design-draft` 하지 않음, design §12).
   - 이유: 알려진 버그(P1–P4) 수정이라 먼저 한다. 범위도 작다. provider-profile-isolation이 같은 spawn·service 코드에 fence를 얹으므로, 턴 종료 경로를 먼저 고친 위에서 시작하게 한다.
2. **provider-profile-isolation** — [spec](../provider-profile-isolation/spec.md) · [design](../provider-profile-isolation/design.md) · [tasks](../provider-profile-isolation/tasks.md)
   - 상태: `/feature-review`를 반영했다(`14a6d96b`). 초안 없음. 예외: T0 결과가 결정 Q6의 'Antigravity를 막는' 분기면 T2a에서 초안을 그리고 사용자가 앱에서 확인한다.
   - 이유: PoC 네 개(P0–P3)와 다섯 provider 실제 로그인이 필요한 가장 큰 링크라 마지막에 둔다.

## 시작 점검

링크 1을 시작하기 전에 lead가 아래를 사용자에게 한 번에 묻고, 승인을 `인계 기록`에 적는다. 승인 뒤 conductor는 일상적인 것은 스스로 정하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **로그인**: 공유 userData(`로그인` 절)에 다섯 provider 로그인이 살아 있는지 lead가 확인하고, 없는 provider는 시작 점검에서 사용자가 브라우저로 승인해 만든다. turn-end-state는 Claude·Codex·ACP(Copilot 포함), provider-profile-isolation T1·T5는 다섯 provider 전부가 필요하다.
2. **turn-end-state 정지 지점**: T0 PoC가 원인을 H0·H3·H4나 다른 원인으로 판정하면 conductor가 멈추고 사용자에게 묻는다(design §4.2, §13). 미리 정할지, 그때 물을지.
3. **provider-profile-isolation의 그때 승인 항목**: 문서가 "그때 사용자 승인"으로 남긴 것들이다. 미리 승인할지, 그때 conductor가 물을지 정한다.
   - T0: 격리 HOME의 `Library/Keychains`를 실제 폴더에 링크하고 Antigravity 실제 로그인. 사람의 `agy` 로그인이 초기화될 수 있다.
   - T5: 실제 HOME에서 Antigravity 로그인·연결 확인·한 턴·로그아웃(결정 C).
4. **provider-profile-isolation의 남은 확인 필요**(design §10): P0가 실패할 때의 방향, P2에서 실패한 provider의 처리(§8 P2의 (가)·(나)·(다)). PoC 결과가 있어야 정할 수 있으므로 그때 conductor가 추천과 함께 묻는다.
5. **provider-profile-isolation T2a 초안**: Q6의 막는 분기로 가면 사용자가 앱에서 초안을 확인한다. 그때 묻는다.

## 상시 권한

- lead는 각 링크의 PR을 review와 gate가 통과하면 링크 순서대로 develop에 merge하고 다음 링크를 시작한다(chain 기본값).
- conductor runtime: Claude Code(lead와 같은 model family).
- model 경계: 사용자가 "Codex 사용 가능"이라고 허락했다. 범위는 두 링크 전부이고, 사용자가 말한 한도는 없다. conductor는 Codex worker나 subagent를 쓸 수 있다.
  - conductor는 링크를 시작할 때와 batch를 나눌 때 Codex의 남은 사용량을 확인한다.
  - 각 링크의 `orch.md`에 실제로 쓴 범위(어느 batch·역할에 Codex를 썼는지)를 적는다.

## 로그인

- probe는 실제 HOME의 provider 로그인을 쓴다. 링크마다 worktree가 다르므로 로그인된 userData는 main checkout의 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`에 둔다.
- 이 userData는 이전 체인에서 남은 것이다(profile: antigravity, claude, codex, copilot, cursor). 로그인이 살아 있는지는 확인하지 않았다. lead가 시작 점검에서 확인한다.
- 링크는 이 userData를 다시 쓴다. 망가뜨릴 수 있는 probe에는 사본을 쓴다. 새 로그인을 청하기 전에 먼저 이 userData를 확인한다. 링크마다 sign-out하지 않는다. turn-end-state tasks의 "끝나면 sign-out과 profile 삭제"는 이 규칙이 대신한다.
- 예외: provider-profile-isolation의 Antigravity Keychain 링크 PoC(T0)와 실제 HOME 확인(T5)은 그 문서의 격리 HOME·Keychain 정리 절차(design §8)를 따른다. 이 공유 userData로 대신하지 않는다.
- 마지막 링크의 PR이 오면 lead가 merge 전에 sign-out하고, Keychain 항목이 사라졌는지 확인하고, userData를 지운다.

## 진행 규칙

[`/chain` skill §3](../../../.agents/skills/chain/SKILL.md#3-running-the-links)을 따른다.

## 운영 메모

- worker 대기는 `/orchestrate`의 대기 loop를 따른다. P3·P2 측정처럼 오래 걸리는 PoC 동안 conductor는 짧은 간격의 polling을 하지 않는다.
- `/agent-eval`: 두 링크 모두 guide, CLI 출력·메시지, `doan check` 규칙, skill stub을 바꾸지 않는다(turn-end-state design §1, provider-profile-isolation design §1). 해당하지 않는다. 다만 provider-profile-isolation이 fence 안 `doan check`의 `sessions.jsonl` 쓰기를 막으므로(결정 B), conductor가 agent 동작에 영향이 있다고 보면 lead에게 알린다.

## 링크 상태

| 링크 | session·worktree | 시작 | PR·merge | 상태 |
|---|---|---|---|---|
| 1. turn-end-state | | | | 대기 |
| 2. provider-profile-isolation | | | | 대기 |

## 인계 기록

- **2026-11-09 lead**: 체인 파일을 썼다. 사용자가 Codex 사용을 허락했다(두 링크 전부, 한도 없음).
- **2026-11-09 lead, 시작 점검 승인**:
  1. 로그인: lead가 링크 1 전에 공유 userData에 다섯 provider 로그인을 만든다. 시작 시점 기록은 Claude·Codex 연결만 있었다(유효성 미확인). Cursor·Copilot·Antigravity는 없었다.
  2. turn-end-state 정지 지점: 문서 결정(design §13)대로 H0·H3·H4나 다른 원인이면 conductor가 멈추고 묻는다.
  3. provider-profile-isolation T0(격리 HOME의 `Library/Keychains` 링크와 Antigravity 실제 로그인)과 T5(실제 HOME Antigravity 확인)를 사용자가 미리 승인했다. 사람의 `agy` 로그인이 초기화될 수 있다는 점을 알고 승인했다. conductor는 다시 묻지 않고 design §8의 Keychain 정리 절차를 따른다.
  4. P0·P2 실패 시 방향과 T2a 초안 확인은 PoC 결과가 나온 뒤 conductor가 추천과 함께 묻는다.
- **2026-11-09 lead, 로그인 완료**: 공유 userData에 다섯 provider가 모두 연결됐다(Settings > Agents에서 확인). Claude Code(b2b_product_group@day1company.co.kr)와 Codex(ox501501@gmail.com)는 기존 연결이 살아 있었다. Cursor(ox501501@gmail.com), Antigravity(Google, ox501501@gmail.com), GitHub Copilot(SinhyeokKang)은 새로 연결했다. 앱은 develop `9f53d0a9`을 `npm --prefix app ci` 뒤에 빌드해 실제 HOME으로 띄웠다. develop이 `electron-updater`·`oxlint`를 더했으므로 각 worktree도 `npm --prefix app ci`가 필요하다.
