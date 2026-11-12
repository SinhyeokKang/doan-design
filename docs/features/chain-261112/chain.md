# 체인 261112

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

## 순서

두 링크는 병렬 그룹 하나다. 둘 다 PR #177(`claude-resume-registry`)이 develop에 병합된 뒤, 그 develop에서 함께 시작한다(사용자 요청, 2026-11-12). PR은 링크 순서대로 병합한다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1. `canvas-svg-sprites` | [spec](../canvas-svg-sprites/spec.md) · [design](../canvas-svg-sprites/design.md) · [tasks](../canvas-svg-sprites/tasks.md) | `/feature-review` 완료(`1e323ccf`). 앱 코드 변경이 없어 초안 없음 | CLI(check 규칙, export)와 가이드만 바꾸는 작은 링크라 먼저 병합한다 |
| 2. `claude-turn-end` | [spec](../claude-turn-end/spec.md) · [design](../claude-turn-end/design.md) · [tasks](../claude-turn-end/tasks.md) | `/feature-review` 완료(`8f8b03dc`). 초안 `.doan/canvases/claude-turn-end.html` 사용자 확인 완료(`8de3b646`, tasks 2 완료 `6b7faccf`) | 앱 main·renderer의 대화 실행을 크게 바꾸는 링크라 나중에 병합한다 |

**병렬 판단**: 두 design의 '영향 받는 구성요소'를 비교했다.
- 링크 1은 `cli/internal/check/`, `cli/internal/export/`(`exporttest` seed 포함), `cli/internal/canvas/`, `cli/internal/cli/`(`check.go`, `skill.md`), `cli/internal/designskill/presets/document.md`, `eval/scenarios/`와 `eval/` 테스트를 바꾼다. 앱 코드는 바꾸지 않는다.
- 링크 2는 `app/src/main/conversation/`(`runners.ts`, `transport.ts`, `process.ts`, `service.ts`, `summary.ts`, `project.ts`, `io.ts`, `types.ts`, `store.ts`), preload·renderer의 스레드 UI(`turnStatus.ts`, `homeRun.ts`, `threadItems.ts`, `ConversationThread.tsx`, `conversationStrip.ts`, 노티스 공통 규칙), `.doan/canvases/claude-turn-end.html`을 바꾼다. CLI·스킬·가이드는 바꾸지 않는다.
- 겹치는 코드·테스트·schema·스킬·초안 파일이 없다. 공유 문서(PRODUCT, ARCHITECTURE, DESIGN, BACKLOG, POSTMORTEM, USABILITY-EVAL)는 셈하지 않는다.
- 링크 2의 `io.ts`는 PR #177도 바꿨다. 링크 2는 #177이 병합된 develop에서 시작하므로 충돌하지 않는다.

## 시작 점검

lead는 링크 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **링크 1 Safari 확인**: tasks 1은 export 파일을 사용자가 Safari에서 직접 열고 스크린숏을 남기게 한다. 사용자가 이 조작을 할 수 있는지, 못 하면 확인하지 못한 것으로 남길지.
2. **링크 1 `/agent-eval`**: check 규칙과 가이드가 바뀌므로 마지막 통합 전에 전체 시나리오 라운드를 돈다. 실제 Claude Code와 Codex가 `/tmp`의 임시 repo에서 돌고, 다른 계열이 판정한다(AGENTS.md 'Runtime differences'의 상시 예외). 사용량을 쓴다.
3. **링크 2 PoC의 실제 상태**: tasks 1은 설치된 Claude CLI의 기존 로그인으로 돌고, 세션 기록이 실제 `~/.claude/projects/` 아래 임시 cwd 이름의 디렉터리에 남는다. PoC는 자기가 만든 세션만 읽고 resume한다. 2.1.284는 `.scratch/claude-turn-end/cli-284/`에 따로 설치한다.
4. **링크 2 `/runtime-test` 로그인 방식**: tasks 9와 design '실제 앱 확인의 로그인'은 격리 HOME의 패키지 앱에서 사용자가 Doan Claude 연결에 한 번 로그인한다고 적었다. 이전 실행에서는 임시 HOME에서 Claude 로그인이 `storage_failed`(로그인 Keychain 없음)로 실패했다. 실제 HOME과 임시 `DOAN_RUNTIME`·repo, 계속 쓰는 userData로 바꿀지 사용자가 정한다. 바꾸면 '로그인' 절을 따른다.
5. **링크 2 최소 버전**: PoC에서 Claude 2.1.284가 첫 프롬프트 uuid를 echo하지 않거나 `background_tasks_changed`를 보내지 않으면 conductor가 최소 버전을 올릴지 사용자에게 묻는다(design.md). 시작 점검에서 미리 정하지 않는다.
6. **GUI probe 겹침**: 두 링크가 동시에 격리 앱 창을 띄울 수 있다(링크 1 PoC, 링크 2 `/design-sync`·`/runtime-test`). 사용자가 이 머신에서 일하는 중에 창이 뜨는 것을 받아들이는지.

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합한다.
- conductor 런타임은 Claude Code다. 모델 계열을 넘는 워커는 허가되지 않았다(`/agent-eval`의 다른 계열 판정은 AGENTS.md의 상시 예외다).

## 로그인

시작 점검 4에서 실제 HOME 방식으로 정하면 적용한다.
- probe는 실제 HOME의 Claude 로그인을 쓴다. 로그인은 사용자가 자기 브라우저에서 승인한다.
- 로그인한 userData는 main checkout의 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 따로라서 절대 경로를 쓴다.
- 링크 2는 이 userData를 다시 쓴다. 망가뜨릴 수 있는 probe에는 복사본을 쓰고, 새 로그인을 묻기 전에 연결이 살아 있는지 먼저 본다.
- 링크 2의 PR이 도착하면 lead가 병합 전에 앱에서 로그아웃하고, Keychain 항목이 사라졌는지 확인한 뒤 userData를 지운다.

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- `/agent-eval`: 링크 1은 해당한다(`doan check` 규칙, 가이드, preset). tasks 6이 시나리오를 더하고, 마지막 통합 전에 패키지 CLI로 전체 라운드를 돈다. 링크 2는 해당하지 않는다(CLI 출력, 가이드, `doan check`, 스킬 stub을 바꾸지 않는다).
- 두 링크 모두 `npm --prefix app run package`를 자기 worktree에서 돈다. 서로의 `app/dist`를 쓰지 않는다.
- GUI probe는 짧게 돌리고, 두 conductor는 같은 순간에 실제 앱 창을 띄우는 일이 겹치면 PR 본문에 남긴다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1. `canvas-svg-sprites` | | | | 대기 |
| 2. `claude-turn-end` | | | | 대기 |

## 인계 기록

- 2026-11-12 lead(develop checkout): 사용자 요청으로 체인 파일을 작성했다. PR #177 병합과 시작 점검 승인 뒤 두 링크를 함께 시작한다.
