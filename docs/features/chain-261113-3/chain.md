# 체인 261113-3

## 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md)과 AGENTS.md 'Workflow'의 Chains를 따른다. 이 파일은 lead만 쓴다. conductor는 intake에서 읽기만 한다.

**시작 조건**: 사용자 지시로, 이 체인은 체인 261113-2를 마무리하고 릴리스한 뒤에 시작한다.

## 순서

링크 1은 두 feature를 병렬로 돌리고, 링크 2와 3은 그 뒤에 직렬로 돌린다.

| 링크 | 문서 | 검토·초안 | 순서 이유 |
|---|---|---|---|
| 1a. `prototype-responsive` | 문서는 승격 뒤 삭제(PR #189) | `/feature-review` 완료(`0c4f109e`). 초안 `.doan/canvases/prototype-responsive.html` 사용자 확인 완료(`98cc10e5`, tasks 2 완료) | 프로토타입 창 헤더(세 무리, 이름의 둘째 줄, 모드 토글 프리미티브)를 만든다. 형제 둘이 이 헤더 위에 올라간다 |
| 1b. `multi-handoff` | 문서는 승격 뒤 삭제(PR #190) | `/feature-review` 완료(`7ed0b6fb`). 초안 `.doan/canvases/multi-handoff.html`(`ce926002`, `1c54f75a`) 사용자 확인 완료 | 대화 handoff의 main·renderer·CLI를 바꾼다. `prototype-conversation`이 그 대화 코드 위에 올라가므로 먼저 둔다 |
| 2. `prototype-cli-export` | 문서는 승격 뒤 삭제(PR #191) | `/feature-review` 완료(`5a4d72f7`). 초안 `.doan/canvases/prototype-cli-export.html` 사용자 확인 완료(`be6b3230`, tasks 2 완료) | responsive의 헤더에 Export를 넣고, CLI 열기와 내보내기를 더한다 |
| 3. `prototype-conversation` | [spec](../prototype-conversation/spec.md) · [design](../prototype-conversation/design.md) · [tasks](../prototype-conversation/tasks.md) | `/feature-review` 완료(`50c9512a`). 초안 `.doan/canvases/prototype-conversation.html` 사용자 확인 완료(`b2dc7e7a`, tasks 2 완료) | 가장 큰 링크다. 헤더, Export 자리, 대화 코드가 모두 들어온 뒤에 둔다 |

**병렬 판단(링크 1)**: 두 design의 영향 파일을 대조했다. responsive는 `main/prototype/*`, `prototypeWindow.ts`, `preload/prototype.ts`, `renderer/prototype/*`, `CanvasTools.tsx`, `toolbarKeys.ts`, `styles.css`, `ds/controls.css`를 바꾸고, `senderAllowed.ts`·`index.ts`는 바꾸지 않는다고 적는다(design.md 35행). multi-handoff는 `main/conversation/*`(`handoff.ts`, `prompt.ts`, `service.ts`, `store.ts`, `types.ts`), `index.ts`, `project.ts`, `runtime.ts`, `App.tsx`, `ConversationThread.tsx`, `threadItems.ts`, `tokens.css`, `cli/internal/cli/handoff_rules.go`, `eval/lib/*`를 바꾼다. 겹치는 코드·테스트·초안이 없다.

**직렬 판단(링크 2, 3)**: cli-export는 responsive와 프로토타입 창 파일(`controller.ts`, `ipc.ts`, `requests.ts`, `prototypeWindow.ts`, `PrototypeWindow.tsx`)이 겹치고, multi-handoff와 `index.ts`, `runtime.ts`, `tokens.css`, `eval/lib/socket.ts`가 겹친다. conversation은 cli-export와 프로토타입 창 파일이, multi-handoff와 대화 코드(`ConversationThread.tsx`, 대화 IPC·store)가 겹친다.

## 시작 점검

lead는 링크 1 시작 전에 아래를 사용자에게 한 번에 묻고, 승인을 '인계 기록'에 남긴다. 승인 뒤 conductor는 일상적인 판단을 스스로 하고, 새 제품·범위 결정이나 실제 사용자 상태를 건드리는 결정만 묻는다.

1. **실제 앱 확인 창**: 모든 링크가 PoC, `/design-sync`, `/runtime-test`에서 격리된 dev 앱 창을 띄운다(`app/runtime/` 격리, 임시 HOME·userData·SHELL·DOAN_RUNTIME). 링크 1은 두 conductor가 동시에 창을 띄울 수 있다.
2. **`prototype-conversation` PoC 검증 명령**: tasks 1의 검증이 "명령 미정 — 사용자 확인 필요"다(안: `node .scratch/prototype-conversation/probe.mjs`, 스크린샷 포함).
3. **`/agent-eval`**: `multi-handoff`(R10·R11, tasks 10)와 `prototype-cli-export`(guide 변경, X2·W8, tasks 11)는 패키지한 CLI로 실제 Claude Code와 Codex를 돌린다. 실제 에이전트 상태를 건드리고 `python3.12`가 필요하다. 다른 계열이 각 실행을 판정하는 것은 AGENTS.md의 상시 예외다.
4. **로그인**: 네 feature의 tasks에 provider 로그인이 필요한 확인은 없지만, 사용자는 Claude Code와 Codex 로그인을 미리 준비하기로 했다('로그인').

## 상시 권한

- lead는 각 링크의 PR을 검토와 게이트 통과 뒤 링크 순서대로 develop에 병합하고, 다음 링크를 시작한다. 링크 1은 1a, 1b 순으로 병합하고, 둘 다 병합한 뒤 링크 2를 시작한다.
- conductor 런타임은 Claude Code다. 사용자가 모든 링크에 Codex 워커를 허용했다(Claude 워커와 함께 쓴다). conductor는 링크를 시작할 때와 배치를 나눌 때 Codex의 남은 사용량을 확인하고, 각 링크의 `orch.md`에 실제로 쓴 범위를 적는다. `/agent-eval`의 상시 예외는 이와 별개다.

## 로그인

- probe는 실제 HOME의 provider 로그인(Keychain)을 쓴다. 임시 HOME에서는 로그인이 실패한다.
- lead가 시작 점검에서 Claude Code와 Codex 로그인을 만든다. 승인은 사용자가 자기 브라우저에서 한다.
- 로그인한 userData는 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 둔다. 링크마다 worktree가 따로 있으므로 이 절대 경로를 쓴다.
- 링크는 이 프로필을 재사용한다. 망가질 수 있는 probe는 복사본을 쓴다. 새 로그인을 묻기 전에 아직 연결되어 있는지 확인한다. 링크마다 로그아웃하지 않는다.
- 마지막 링크의 PR이 오면 lead가 앱에서 로그아웃하고, Keychain 항목이 사라졌는지 확인한 뒤 userData를 지우고 나서 병합한다.

## 진행 규칙

[`/chain`](../../../.agents/skills/chain/SKILL.md) §3을 따른다.

## 운영 메모

- 워커 대기는 `/orchestrate` §2의 백그라운드 감시 루프를 쓴다. 메일함을 소비하지 않는다.
- GUI probe는 짧게 돌린다. 사용자에게 화면이 필요한 동안과 끝난 때를 lead에게 알린다(`[conductor <slug>] GUI done` / `GUI again`). 링크 1의 두 conductor는 서로 GUI 시간을 lead를 거쳐 맞춘다.
- `/agent-eval`: 링크 1b(`multi-handoff`)와 링크 2(`prototype-cli-export`)에 해당한다. 링크 1a와 3은 프롬프트, guide, CLI 출력을 바꾸지 않아 해당하지 않는다.

## 링크 상태

| 링크 | 세션·worktree | 시작 | PR·병합 | 상태 |
|---|---|---|---|---|
| 1a. `prototype-responsive` | Claude Code · `prototype-responsive-orch` (`feat/prototype-responsive`) | 2026-11-13, `808252b4` | PR #189, 병합 `00fb6387` | 완료 |
| 1b. `multi-handoff` | Claude Code · `multi-handoff-orch` (`feat/multi-handoff`) | 2026-11-13, `808252b4` | PR #190, 병합 `a359ed91` | 완료 |
| 2. `prototype-cli-export` | Claude Code · `prototype-cli-export-orch` (`feat/prototype-cli-export`) | 2026-11-14, `a359ed91` | PR #191, 병합 `10d6ed84` | 완료 |
| 3. `prototype-conversation` | Claude Code · `prototype-conversation-orch` (`feat/prototype-conversation`) | 2026-11-14, `10d6ed84` | | 진행 중 |

## 인계 기록

- 2026-11-13 lead(develop checkout): 사용자 요청으로 체인 파일을 미리 썼다. 체인 261113-2를 마무리하고 릴리스한 뒤 시작한다. 시작할 때 시작 점검을 한 번에 묻는다.
- 2026-11-13 lead(develop checkout): 사용자가 시작 점검을 승인했다. 1) 격리 앱 창 승인, 2) `prototype-conversation` PoC 검증 명령은 `node .scratch/prototype-conversation/probe.mjs`(스크린샷 포함), 3) `/agent-eval` 승인, 4) Claude Code와 Codex 로그인을 lead가 미리 준비한다. 0.1.11 릴리스는 main 병합과 태그를 마쳤고 release run이 진행 중이다. 체인은 그와 무관하게 시작한다.
- 2026-11-13 lead(develop checkout): Claude Code와 Codex 로그인을 `.scratch/provider-profile/userData`에 만들었다(사용자 승인). 링크 1의 두 conductor를 병렬로 시작했다. 브리프에는 `rm` 금지, 로그인 프로필 경로, Codex 워커 허용, `/ship`의 하위 스킬 로드 규칙, GUI 시간을 lead와 맞추는 규칙을 넣었다.
- 2026-11-14 lead(develop checkout): 링크 1a를 병합했다(PR #189, `00fb6387`). worktree는 지웠고 브랜치는 남겼다. 형제 문서(cli-export, conversation)에서 지워진 responsive 문서를 가리키던 참조를 승격된 PRODUCT·ARCHITECTURE·DESIGN 절로 고쳤다. 다음 링크가 알아야 할 것(PR 본문 'For later links'): 오른쪽 무리 폭 R은 `fit.ts`의 `PROTOTYPE_HEADER_RIGHT`와 `styles.css`의 `--pw-right` 두 곳에 있고 테스트가 둘을 같게 묶는다. `.pw-right`에는 아직 토글만 있다. `prototypeCaptureRect`의 `sideColumn`은 지금 0이다. 새 iframe host나 패널 옆 열은 네 모서리를 같은 radius로 자르지 않는 불변식을 지키고 `exportViewer.test.ts`의 프로토타입 체인을 늘린다. 헤더 컨트롤은 주 버튼 `mousedown`에서 `preventDefault()`한다. 링크 1a 미확인: 실제 OS 입력·창 포커스, DPR 1, 패키지 앱, 390×844의 창 맞춤 908/952.
- 2026-11-14 lead(develop checkout): 사용자 지시로 `rm` 금지 규칙을 없앴다. 다음 링크의 브리프에도 넣지 않는다.
- 2026-11-14 lead(develop checkout): 링크 1b를 병합했다(PR #190, `a359ed91`). 게이트의 shard 3이 runner 문제로 로그 없이 15분 뒤 취소되어 다시 돌렸고 통과했다. worktree는 지웠고 브랜치는 남겼다. 공유 로그인 프로필은 그대로 연결되어 있다(task 9가 제자리에서 쓰고 상태 파일을 되돌렸다. 복사본은 프로필 경로에 묶인 Keychain 로그인을 잃는다). 링크 3이 알 것: `ConversationThread.tsx`(`HandoffLine` Open, missed), `threadItems.ts`(handoff key `h${turnId}:${path}`), `service.ts`(`HandoffTurn.requests`, `missedWaits`, 큐 settle·flush fence), `preload/index.ts`(`onConversationHandoff`가 `ConversationHandoffNotice`를 받음)가 바뀌었다. 링크 1b 미확인: Cursor·Antigravity·Copilot handoff, Codex의 `&&` 연결, runtime-test `codex-stay` 첫 턴 완료(probe 버그 수정 뒤 다른 두 시나리오에서만 통과), 새 Open 버튼의 hover·다크 모드. 링크 2를 시작했다.
- 2026-11-14 lead(develop checkout): 링크 2를 병합했다(PR #191, `10d6ed84`). worktree는 지웠고 브랜치는 남겼다. 승격되어 지워진 1a·1b·2 문서를 가리키던 순서 표의 링크를 PR 번호로 바꿨다. conversation 문서에는 cli-export의 절이나 결정 번호를 가리키는 참조가 없었다. 링크 2 미확인: 406 × 952 창 맞춤, DPR 1, 네이티브 저장 시트로 실제 저장, 다크 모드, 오류 코드별 `nextSteps`(eval에서 실행되지 않음). 링크 2 도중 사용자 승인으로 `/Applications/Doan.app`을 종료했고 다시 켜지 않았다. 링크 3을 시작했다.
