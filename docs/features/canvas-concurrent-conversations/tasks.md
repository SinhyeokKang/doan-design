# canvas-concurrent-conversations — tasks

`/orchestrate`로 돈다(저장·런타임·렌더러가 함께 바뀌어 크다). 작업 1·2는 대화 안에서 한다(PoC, `/design-draft`, 사용자가 앱에서 초안 확인). `/agent-eval`은 하지 않는다(design.md '에이전트 쪽'). 배치를 나누는 제안은 맨 아래에 있다.

- [ ] 1. PoC(`.scratch/canvas-concurrent-conversations/`, design.md 'PoC 의존'): 다섯 프로바이더 모두 같은 계정으로 한 캔버스에서 턴 둘셋을 겹쳐 돌린다. develop 앱은 동시 실행을 막으므로, 앱 대신 각 프로바이더의 Doan 실행 경로(Claude Code SDK 턴, Codex `app-server`, ACP 서버)를 `.scratch`의 probe에서 직접 겹쳐 띄운다. provider 로그인 probe 관행(실제 HOME, 사용자가 브라우저에서 승인, 로그인된 프로필을 실행 내내 재사용, 병합 전에 로그아웃하고 지운다)을 따른다.
  - 검증: `node .scratch/canvas-concurrent-conversations/poc.mjs`가 프로바이더마다 관찰을 한 줄씩 찍고 완료 줄과 exit 0으로 끝난다. 관찰(통과·실패·날짜)이 design.md에 있다.
  - 커밋 경계: 관찰을 적은 design.md 문서 커밋. 실패한 프로바이더가 있으면 사용자에게 묻고 멈춘다.
- [ ] 2. `/design-draft`: design.md '초안 요청'. 검증: `doan check --repo . --json`, `doan ls --repo . --json`, 사용자의 앱 확인이 design.md에 적혀 있다.
  - 커밋 경계: 초안.
- [ ] 3. `/tdd`: design.md '순수 함수' 1–9와 저장 형식을 고정하고 red를 확인한다.
  - 저장: `index-v3.json` fixture, v2(보관 대화 포함) → v3 이전, 저널이 남은 v2의 복구 뒤 이전, 이전 실패 시 v2 유지, v3를 이전 빌드 판독기(`parseIndex`의 v2 규칙)가 `unknown_version`으로 거부.
  - 접기: `conversation.archived` 뒤 이벤트가 접힌다, 대기 권한은 만료된다, `restored` 표시 없음.
  - 런타임: A가 작업 중일 때 B 시작이 A를 끊거나 보관하지 않는다, 터미널 세션 이어받기도 같다, handoff·승격이 대화가 있는 캔버스에 더해진다, 울타리 목록(design.md '살아 있는 대화')마다 "삭제되지 않음"으로 동작, Move to Trash가 작업 중인 대화 하나에도 막힌다, 삭제·`stopRuns`를 끼운 지연 콜백(POSTMORTEM 2026-11-14).
  - 렌더러: `pickShownConversation`, `boardPresence`(두 루트가 같은 캔버스 ID를 가진 경우 포함), `canvasStrongestSignal`, `titleMenuOrder`(열린 동안 고정), `canvasConversationRows`, `dockedAvailability`에 `restore` 문구가 없다, 새 대화로 넘어가기(`defaultNew`일 때만), 프로토타입 창의 대화 전환과 초안 옮기기(보내는 중인 초안은 옮기지 않음), `conversationByCanvas` 검증과 다시 키 매기기.
  - 검증: `npm --prefix app test`가 새 테스트와 그 파일에서만 실패한다.
  - 커밋 경계: `test:`.
- [ ] 4. `/implement` — 저장과 접기(`store.ts`, `state.ts`, `summary.ts`, `threadItems.ts`, fixtures). 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
- [ ] 5. `/implement` — 런타임(`service.ts`, `handoff.ts`, `project.ts`, `canvasTrash.ts`, `types.ts`, `index.ts:1197`, preload `forCanvas`). 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
- [ ] 6. `/implement` — 렌더러(캔버스 패널, 보드, 배지, Overview 행, 프로토타입 창, ui-state, `homeRun.ts` `holdsRoot`, `handoffView.ts`). 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: 구현(4–6을 한 `feat:` 커밋 또는 배치마다 하나).
- [ ] 7. `/design-sync`: 초안의 일곱 프레임과 실제 앱. DESIGN.md의 캔버스 페이지·패널·Overview·Frame prototype 절에 잰 값을 적는다. 검증: `node .scratch/design-sync/canvas-concurrent-conversations/measure.mjs`의 모든 행이 차이 0이거나 문서화된 차이다.
  - 커밋 경계: `/design-sync` 수정과 DESIGN.md.
- [ ] 8. `/runtime-test`(작업 1의 로그인된 프로필 재사용): 격리 앱에서 확인한다. 검증: `node .scratch/runtime-test/canvas-concurrent-conversations/probe.mjs`가 완료 줄을 찍고 exit 0이다(스크린샷 포함).
  - 한 캔버스에서 대화 A 작업 중에 B를 보내면 둘 다 끝까지 돈다(Claude Code와 Codex, 나머지 셋은 PoC 근거).
  - 보드 알림이 보이는 대화를 따르고 "+N working"을 누르면 그 대화로 간다. Stop은 한 대화만 멈춘다. 작업 메모와 Following은 따르는 대화만.
  - 접힌 패널 배지, 제목 메뉴(체크, 열린 동안 고정), Overview 행, 프로토타입 창 대화 메뉴와 새 대화, 보던 대화 삭제 뒤.
  - 업데이트 전 v2 색인(보관 대화 포함)을 둔 userData로 시작하면 v3로 바뀌고 보관 대화가 보통 대화로 보인다.
  - handoff가 대화가 있는 새 캔버스에 대화를 더한다.
- [ ] 9. `/code-review` → `/refactor`. `/refactor`가 앱 코드를 고치면 8번의 영향받은 항목을 다시 확인한다. 검증: `/code-review` 보고서에 🔴가 없다.
  - 커밋 경계: `/refactor` 수정.
- [ ] 10. 결론을 승격하고 `docs/features/canvas-concurrent-conversations/`를 삭제한다. 문서마다 커밋한다.
  - PRODUCT §5 item 2 'Canvas conversation'(현재·보관·보류·복원 문장을 상위 결정 1–8과 정한 점 1–6으로), 보드 알림·Stop·작업 메모·Following, 배지, 'Prototype window' 대화 패널, 'Handoff', item 3 Overview Canvas conversations·승격·Quick Open 기본 대화, item 1 Move to Trash, §3 Out of scope 7의 에이전트끼리 동시 편집 문장.
  - ARCHITECTURE §7 'Agent conversation runtime and IPC'(저장 형식 v3와 이전, 저널, 접기, 울타리, `forCanvas`, 목록 읽는 동안 보내기 대기 제거), 'Canvas conversation panel', 'Preferences/ui-state'의 `conversationByCanvas`.
  - 상위 `docs/features/canvas-multi-conversation/tasks.md`의 작업 1–3에 체크한다(상위 문서는 지우지 않는다).
  - 검증: `test ! -d docs/features/canvas-concurrent-conversations`, `grep -c "one current conversation" docs/PRODUCT.md`가 0, `grep -c "index.json" docs/ARCHITECTURE.md`가 1 이상이고 그 문장이 v3를 말한다.
  - 커밋 경계: 문서 승격.
- [ ] 11. `/verify`(승격 뒤 마지막 HEAD). 검증: `node .agents/skills/verify/scripts/verify.mjs`가 PASS다.

## 배치 제안(`/orchestrate`)

파일 소유로 나눈다. 저장 형식과 타입이 먼저다.

| 배치 | 작업 | 파일 | 선행 | 병렬 |
|---|---|---|---|---|
| S | 3의 저장·접기 테스트, 4 | `conversation/store.ts`, `state.ts`, `summary.ts`, fixtures, `renderer/threadItems.ts` | — | — |
| R | 3의 런타임 테스트, 5 | `conversation/service.ts`, `handoff.ts`, `project.ts`, `types.ts`, `canvasTrash.ts`, `main/index.ts`, preload | S | — |
| P | 3의 패널·보드 테스트, 6의 패널·보드·배지·ui-state·`homeRun`·`handoffView` | `canvasConversation.ts`, `canvasRun.ts`, `CanvasConversationPanel.tsx`, `dockedRules.ts`, `agentPresence.ts`, `agentIndicator.ts`, `CanvasAgent.tsx`, `rightPanelOpen.ts`, `App.tsx`, `restore/uiState.ts`, `homeRun.ts`, `handoffView.ts` | R(IPC 모양) | O와 병렬 |
| O | 3의 Overview·프로토타입 테스트, 6의 Overview·프로토타입 창 | `canvasConversationRows.ts`, `ProjectOverview.tsx`, `renderer/prototype/*`, `main/prototype/showing.ts`, `preload/prototype.ts` | R | P와 병렬 |

`pickShownConversation`은 P가 만들고 O가 가져다 쓴다. O가 먼저 끝나면 P의 그 함수가 통합된 뒤 맞춘다(지연 항목).
