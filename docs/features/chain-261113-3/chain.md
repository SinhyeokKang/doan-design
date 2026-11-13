# 체인 261113-3

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

**시작 조건**: 사용자 지시로, 이 체인은 체인 261113-2를 마무리하고 릴리스한 뒤에 시작한다.

## 순서

링크 1은 두 feature를 병렬로 돌리고, 링크 2와 3은 그 뒤에 직렬로 돌린다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1a. `prototype-responsive` | [spec](../prototype-responsive/spec.md) · [design](../prototype-responsive/design.md) · [tasks](../prototype-responsive/tasks.md) | `/feature-review` 완료(`0c4f109e`). 초안 `.doan/canvases/prototype-responsive.html` 사용자 확인 완료(`98cc10e5`, tasks 2 완료) | 프로토타입 창 헤더(세 무리, 이름의 둘째 줄, 모드 토글 프리미티브)를 만든다. 형제 둘이 이 헤더 위에 올라간다 |
| 1b. `multi-handoff` | [spec](../multi-handoff/spec.md) · [design](../multi-handoff/design.md) · [tasks](../multi-handoff/tasks.md) | `/feature-review` 완료(`7ed0b6fb`). 초안 `.doan/canvases/multi-handoff.html`(`ce926002`, `1c54f75a`) 사용자 확인 완료 | 대화 handoff의 main·renderer·CLI를 바꾼다. `prototype-conversation`이 그 대화 코드 위에 올라가므로 먼저 둔다 |
| 2. `prototype-cli-export` | [spec](../prototype-cli-export/spec.md) · [design](../prototype-cli-export/design.md) · [tasks](../prototype-cli-export/tasks.md) | `/feature-review` 완료(`5a4d72f7`). 초안 `.doan/canvases/prototype-cli-export.html` 사용자 확인 완료(`be6b3230`, tasks 2 완료) | responsive의 헤더에 Export를 넣고, CLI 열기와 내보내기를 더한다 |
| 3. `prototype-conversation` | [spec](../prototype-conversation/spec.md) · [design](../prototype-conversation/design.md) · [tasks](../prototype-conversation/tasks.md) | `/feature-review` 완료(`50c9512a`). 초안 `.doan/canvases/prototype-conversation.html` 사용자 확인 완료(`b2dc7e7a`, tasks 2 완료) | 가장 큰 링크다. 헤더, Export 자리, 대화 코드가 모두 들어온 뒤에 둔다 |

**병렬 판단(링크 1)**: 두 design의 영향 파일을 대조했다. responsive는 `main/prototype/*`, `prototypeWindow.ts`, `preload/prototype.ts`, `renderer/prototype/*`, `CanvasTools.tsx`, `toolbarKeys.ts`, `styles.css`, `ds/controls.css`를 바꾸고, `senderAllowed.ts`·`index.ts`는 바꾸지 않는다고 적는다(design.md 35행). multi-handoff는 `main/conversation/*`(`handoff.ts`, `prompt.ts`, `service.ts`, `store.ts`, `types.ts`), `index.ts`, `project.ts`, `runtime.ts`, `App.tsx`, `ConversationThread.tsx`, `threadItems.ts`, `tokens.css`, `cli/internal/cli/handoff_rules.go`, `eval/lib/*`를 바꾼다. 겹치는 코드·테스트·초안이 없다.

**직렬 판단(링크 2, 3)**: cli-export는 responsive와 프로토타입 창 파일(`controller.ts`, `ipc.ts`, `requests.ts`, `prototypeWindow.ts`, `PrototypeWindow.tsx`)이 겹치고, multi-handoff와 `index.ts`, `runtime.ts`, `tokens.css`, `eval/lib/socket.ts`가 겹친다. conversation은 cli-export와 프로토타입 창 파일이, multi-handoff와 대화 코드(`ConversationThread.tsx`, 대화 IPC·store)가 겹친다.

## 시작 점검

lead는 링크 1 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **실제 앱 확인 창**: 모든 링크가 PoC, `/design-sync`, `/runtime-test`에서 격리된 dev 앱 창을 띄운다(`app/runtime/` 격리, 임시 HOME·userData·SHELL·DOAN_RUNTIME). 링크 1은 두 conductor가 동시에 창을 띄울 수 있다.
2. **`prototype-conversation` PoC 검증 명령**: tasks 1의 검증이 "명령 미정 — 사용자 확인 필요"다(안: `node .scratch/prototype-conversation/probe.mjs`, 스크린샷 포함).
3. **`/agent-eval`**: `multi-handoff`(R10·R11, tasks 10)와 `prototype-cli-export`(guide 변경, X2·W8, tasks 11)는 패키지한 CLI로 실제 Claude Code와 Codex를 돌린다. 실제 에이전트 상태를 건드리고 `python3.12`가 필요하다. 다른 계열이 각 실행을 판정하는 것은 AGENTS.md의 상시 예외다.
4. **로그인**: 네 feature의 tasks에 provider 로그인이 필요한 확인은 없다. conductor가 필요하다고 판단하면 그때 묻는다.

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합하고, 다음 링크를 시작한다. 링크 1은 1a, 1b 순으로 병합하고, 둘 다 병합한 뒤 링크 2를 시작한다.
- conductor 런타임은 Claude Code다. 모델 계열을 넘는 워커는 허가되지 않았다(`/agent-eval`의 상시 예외는 별개다).

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- GUI probe는 짧게 돌린다. 사용자에게 화면이 필요한 동안과 끝난 때를 lead에게 알린다(`[conductor <slug>] GUI done` / `GUI again`). 링크 1의 두 conductor는 서로 GUI 시간을 lead를 거쳐 맞춘다.
- `/agent-eval`: 링크 1b(`multi-handoff`)와 링크 2(`prototype-cli-export`)에 해당한다. 링크 1a와 3은 프롬프트, guide, CLI 출력을 바꾸지 않아 해당하지 않는다.
- subagent와 워커는 `rm` 같은 삭제 명령을 쓰지 않는다. 사용자 터미널에 경고가 뜬다. 스크래치 파일은 `.scratch/`에 그대로 둔다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1a. `prototype-responsive` | | | | 대기 |
| 1b. `multi-handoff` | | | | 대기 |
| 2. `prototype-cli-export` | | | | 대기 |
| 3. `prototype-conversation` | | | | 대기 |

## 인계 기록

- 2026-11-13 lead(develop checkout): 사용자 요청으로 체인 파일을 미리 썼다. 체인 261113-2를 마무리하고 릴리스한 뒤 시작한다. 시작할 때 시작 점검을 한 번에 묻는다.
