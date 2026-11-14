# canvas-concurrent-conversations — tasks

`/orchestrate`로 돈다. 저장·런타임·렌더러가 함께 바뀌어 크다. 작업 1·2는 컨덕터가 브랜치에서 하거나(PoC), 대화 안에서 한다(`/design-draft`, 사용자가 앱에서 초안 확인). 작업 3–8은 배치이고, 워커마다 `/ship bypass`로 `test:` 커밋 하나와 구현 커밋 하나를 만든다. `/agent-eval`은 하지 않는다(spec 정한 점 16). 상위 `canvas-multi-conversation/tasks.md`의 체크는 리드가 develop에서 한다. 이 feature는 상위 문서를 고치지 않는다.

- [ ] 1. **PoC**(컨덕터, `.scratch/canvas-concurrent-conversations/`, design.md 'PoC 의존'): 다섯 프로바이더 모두 같은 계정으로 한 캔버스에서 턴 둘셋을 겹쳐 돌린다. 앱 밖에서 `providers.ts:136-155`·`environment.ts:13-36`대로 CLI를 띄우고, 프로바이더마다 전용 scratch HOME에서 로그인한다(사용자가 브라우저에서 승인). 안전 조치(설치된 `doan`을 `PATH`에서 뺌, `/Applications/Doan.app` 감시, 임시 `DOAN_RUNTIME`과 저장소)를 실행 내내 지킨다.
  - 검증: 명령 미정 — 사용자 확인 필요(`node .scratch/canvas-concurrent-conversations/poc.mjs`를 제안한다). 다섯 프로바이더가 모두 겹친 턴을 끝까지 돌렸을 때만 exit 0이다. 관찰(통과·실패·날짜)과 probe가 건너뛴 것이 design.md에 있다. 실패한 프로바이더가 있으면 관찰을 커밋하고 사용자에게 범위를 묻고 멈춘다.
  - 커밋 경계: 관찰을 적은 design.md 문서 커밋.
- [ ] 2. **`/design-draft`**: design.md '초안 요청'. 검증: `doan check --repo . --json`이 오류 0, `doan ls --repo . --json`이 `canvas-concurrent-conversations`의 일곱 프레임 ID(`board-notice`, `board-stop`, `title-menu`, `badge`, `overview-rows`, `prototype-head-menu`, `delete-shown`)를 보인다. 사용자의 앱 확인이 design.md에 적혀 있다.
  - 커밋 경계: 초안.
- [ ] 3. **배치 S — 저장과 접기**(`state` 필드는 남긴다).
  - 테스트(`storeIndex.test.ts`, `storeRecovery.test.ts`, `storeDelete.test.ts`, `state.test.ts`, `summary.test.ts`, fixtures)
    - v1→v3, v2(보관 대화 포함)→v3, `index-v2-home.json`, 모르는 `state`의 v2는 손상.
    - 보관 대화의 `seenSeq`가 마지막 턴 seq가 되어 안 본 종료가 아니다.
    - 첫 `save`가 v3를 쓰고, 그 전에 실패해도 v2가 남는다. 이전 판독기 규칙으로 v3가 `unknown_version`이다.
    - 저널: 이전 전의 종류마다 커밋됨·안 됨, v3에서 쓴 저널(`replaced: []`), v3 색인 옆의 v2 의미 저널은 손상, rename 뒤 저널 삭제 전에 멈춘 경우.
    - 접기: `archived` 뒤 같은 턴의 늦은 이벤트가 접힌다, 대기 권한은 만료된다.
    - 스레드: 'archived'·'restored' 표시가 없다(`threadItems.ts`, `ConversationThread.tsx`). `has_conversation` 이유의 옛 handoff 줄 문구가 그대로다(`handoffView.ts`).
    - 보관을 고정하던 기존 테스트를 고치거나 지운다. 목록은 `/tdd` 보고서에 적는다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`. `/tdd` 보고서가 새로 실패해야 할 테스트 이름을 적고, `/implement` 뒤 모두 green이다.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 4. **배치 R — 런타임**(S 뒤).
  - 테스트(`service*.test.ts`, `handoff.test.ts`, `project.test.ts`, `canvasTrash.test.ts`, `ipc.test.ts`, `conversationScope.test.ts`, `showing.test.ts`, preload 테스트)
    - A 작업 중에 B 시작, 터미널 세션 이어받기, 프로토타입 창의 시작이 A를 끊거나 보관하지 않는다.
    - handoff가 대화가 있거나 작업 중인 새 캔버스에 대화를 더한다. 두 턴이 같은 새 캔버스로 handoff한다. 승격이 작업 중인 대상에 더해진다.
    - design.md '살아 있는 대화'의 울타리마다 "삭제되지 않음"으로 동작한다. 삭제·`stopRuns`를 끼운 지연 콜백(POSTMORTEM 2026-11-14).
    - 로그아웃·종료·업데이트 재시작이 한 캔버스의 동시 턴을 모두 멈춘다. 한 대화를 삭제해도 다른 대화의 턴은 돈다.
    - Move to Trash가 작업 중·준비 중·답 대기 대화 하나에도 막힌다.
    - `forCanvas`가 IPC·스코프·preload에서 없다.
    - 프로토타입 창 알림 억제가 그 창이 보여 주는 대화를 따른다.
    - 대화 요약에 시작 출처(사람·handoff·승격)가 있다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 5. **배치 F — 렌더러 순수 함수**(R 뒤, P·O 전).
  - 테스트: design.md '순수 함수' 1–5, 7, 10–12.
    - `pickShownConversation`: 요청, 답 대기 여럿, `remembered`, 최근 활동, 새 대화. 읽는 중·실패. 다시 읽을 때 `shown` 유지. 캔버스가 프로젝트를 떠남. 두 루트가 같은 캔버스 ID. 사이드바 행 클릭의 슬롯 대화.
    - `boardPresence`: 순위 유지, 같은 순위의 먼저 시작한 대화, `working` 플래그로 깜빡임 없음, N=0, 답 대기 포함, 실패한 읽기 동안 유지, 루트 정체성.
    - `pickWork`(따르는 대화만), `canvasStrongestSignal`(작업 중 포함, `scheduled` 없음, 대상 대화), `titleMenuOrder`(열린 동안 고정, 새 대화는 끝), `canvasConversationRows`, 새 대화 따라가기(사람·handoff·승격, 동시에 둘), Stop 대상 전환(시계 주입), Move to Trash 집합(렌더러와 main이 같다).
    - `dockedAvailability`에 `restore` 문구가 없다. `DockedMode`에 `archived`가 없다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 6. **배치 P — 캔버스 패널·보드·배지·사이드바 클릭·ui-state**(F 뒤, O와 병렬).
  - 테스트(`CanvasConversationPanel.test.tsx`, `canvasRun.test.ts`, `CanvasAgent.test.tsx`, `agentIndicator.test.ts`, `App.*.test.tsx`의 해당 파일, `uiState.test.ts`, `DockedComposer.test.tsx`)
    - 보관 보기·복원이 없다. 목록을 읽는 동안에도 새 대화를 보낸다. 삭제 뒤 다음 대화와 제목 메뉴 버튼 포커스.
    - "+N" 버튼(Tab, 이름, 툴팁, 누를 때 대상, 순환, 접힌 패널 펼침, 같은 요소, 사라질 때 Stop으로 포커스). Stop 이름과 잠깐 비활성. 대기 알림 Open.
    - 배지(작업 중 포함)와 배지로 펼치면 그 대화. 사이드바 캔버스 행 클릭.
    - `conversationByCanvas`: 검증, `renameUiRoots`, 첫 읽기 전 저장 없음과 병합, 'Seen'에서만 씀, 옮긴 캔버스.
    - 터미널 세션 이어받기 제안이 그 세션을 쥔 대화가 있으면 숨는다.
    - 제목 메뉴가 열린 동안 삭제.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 7. **배치 O — Overview·프로토타입 창·프로젝트 대화**(F 뒤, P와 병렬).
  - 테스트(`ProjectOverview.test.tsx`, `CanvasConversationList.test.tsx`, `overviewRun.test.ts`, `overviewConversation.test.ts`, `homeRun.test.ts`, `renderer/prototype/*.test.ts(x)`)
    - Overview가 대화당 한 행, 제목, 빈 제목, 정렬.
    - 프로토타입 창: 머리 메뉴(New conversation, 대화 행, Delete), `aria-disabled` 트리거와 포커스, 목록 읽기 실패의 Retry와 보내기 허용, 로그인 불일치 거부의 "Start a new conversation", `defaultNew`에서만 새 대화 따라가기, 보내는 중인 초안을 옮기지 않음, main 창과 다른 대화.
    - `holdsRoot`가 그대로 프로젝트 대화만 센다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 8. **배치 C — `state` 정리**(P·O 뒤, 직렬). `ConversationMetadata.state`·`ConversationSummary.state`를 타입에서 빼고, 남은 읽기와 약 60개 테스트 파일의 `state: "current"`를 정리한다.
  - 검증: `rg -n 'state: "current"|state === "current"|state !== "current"|"archived"' app/src -g '!*.md'`가 옛 이벤트 이름(`conversation.archived`)과 v1·v2 판독기 외에는 없다. `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: `refactor:` 하나.
- [ ] 9. **`/design-sync`**(워커, C 뒤): 초안의 일곱 프레임과 실제 앱. 고칠 코드는 P·O 배치의 렌더러 파일이고, 이 워커가 그 파일을 넘겨받는다. DESIGN.md의 캔버스 페이지·패널·Overview·Frame prototype 절에 잰 값을 적는다.
  - 검증: `node .scratch/design-sync/canvas-concurrent-conversations/measure.mjs`의 모든 행이 차이 0이거나 문서화된 차이다.
  - 커밋 경계: `/design-sync` 수정과 DESIGN.md.
- [ ] 10. **`/runtime-test`**(컨덕터): 격리 앱(임시 userData·HOME·SHELL·`DOAN_RUNTIME`)에서 확인한다. 실제 턴은 작업 1의 프로바이더 로그인을 앱이 쓰는 프로필로 다시 만들어야 한다. 그 프로필의 절대 경로를 orch.md에 적고 실행 내내 재사용한다. 설치된 앱 안전 조치는 작업 1과 같다.
  - 한 캔버스에서 A 작업 중에 B를 보내면 둘 다 끝까지 돈다(Claude Code와 Codex. 나머지 셋은 PoC 근거이고 BACKLOG에 적는다).
  - 보드: 따르는 대화, "+N"(답 대기 포함)을 누르면 그 대화, Stop 한 대화만과 잠깐 비활성, 작업 메모와 Following.
  - 접힌 패널 배지와 배지로 펼치기. 제목 메뉴(눌린 행, 열린 동안 고정). Overview 행. 사이드바 캔버스 행 클릭.
  - 프로토타입 창 대화 메뉴, 새 대화, Retry. 보던 대화 삭제 뒤.
  - 업데이트 전 v2 색인(보관 대화 포함)을 둔 userData로 시작하면 보관 대화가 본 것인 보통 대화로 보이고, 첫 저장 뒤 v3다.
  - handoff가 대화가 있는 새 캔버스에 대화를 더하고 패널을 움직이지 않는다.
  - 검증: `node .scratch/runtime-test/canvas-concurrent-conversations/probe.mjs`가 완료 줄을 찍고 exit 0이다(스크린샷 포함).
- [ ] 11. **로그인 정리**(컨덕터, PR 전): 작업 1과 10에서 만든 모든 프로바이더 로그인을 로그아웃하고, 프로필과 scratch HOME을 지운다.
  - 검증: 명령 미정 — 사용자 확인 필요. 프로필·scratch HOME 디렉터리가 없고, 프로바이더 Keychain 항목이 남지 않았다(`security find-generic-password`로 확인하는 방법을 제안한다).
- [ ] 12. **`/code-review` → `/refactor`**: 리뷰는 독립 워커, 고침은 그 파일을 가진 배치의 워커. `/refactor`가 앱 코드를 고치면 10번의 영향받은 항목을 다시 확인한다. 검증: `/code-review` 보고서에 🔴가 없다.
  - 커밋 경계: `/refactor` 수정.
- [ ] 13. **승격**(컨덕터): 결론을 승격하고 `docs/features/canvas-concurrent-conversations/`를 삭제한다. 문서마다 커밋한다. 대상은 design.md '결정 영향'의 PRODUCT·ARCHITECTURE·DESIGN·BACKLOG 줄 전부와 `app/src/main/conversation/fixtures/README.md`. PoC 관찰은 승격 커밋 메시지에도 적는다.
  - 검증
    - `test ! -d docs/features/canvas-concurrent-conversations`.
    - `grep -n -i 'current conversation\|archiv\|restor' docs/PRODUCT.md docs/ARCHITECTURE.md docs/DESIGN.md`의 남은 줄마다 이유가 있다(옛 이벤트 이름, Antigravity 다운로드 "archive" 등).
    - ARCHITECTURE의 `index.json` 문장이 v3와 이전, 되돌림 한계를 말한다.
  - 커밋 경계: 문서 승격.
- [ ] 14. **`/verify`**(컨덕터, 승격 뒤 마지막 HEAD). 검증: `node .agents/skills/verify/scripts/verify.mjs`가 PASS다.

## 배치(`/orchestrate`)

파일 소유로 나눈다. 같은 파일을 두 배치가 고치지 않는다. 표에 없는 파일이 필요해지면 그 파일을 쓰는 가장 가까운 배치가 갖고, orch.md에 적는다. 테스트 파일은 그 소스 파일을 가진 배치의 것이고, C만 예외로 모든 테스트의 `state` 줄을 정리한다.

| 배치 | 작업 | 파일 | 선행 | 병렬 |
|---|---|---|---|---|
| S | 3 | `main/conversation/store.ts`, `state.ts`, `summary.ts`, `types.ts`, `fixtures/*`, `renderer/threadItems.ts`, `renderer/ConversationThread.tsx`, `renderer/handoffView.ts` | — | — |
| R | 4 | `main/conversation/service.ts`, `handoff.ts`, `project.ts`, `ipc.ts`, `prompt.ts`(주석만, 필요할 때), `main/canvasTrash.ts`, `main/index.ts`, `main/prototype/conversationScope.ts`, `main/prototype/showing.ts`, `preload/index.ts`, `preload/prototype.ts` | S | — |
| F | 5 | `renderer/canvasConversation.ts`, `agentPresence.ts`, `rightPanelOpen.ts`, `canvasRowMenu.ts`, `dockedRules.ts`, `canvasConversationRows.ts`, 새 순수 모듈(따라가기, Stop 전환) | R | — |
| P | 6 | `renderer/canvasRun.ts`, `CanvasConversationPanel.tsx`, `DockedComposer.tsx`, `agentIndicator.ts`, `CanvasAgent.tsx`, `App.tsx`, `restore/uiState.ts` | F | O |
| O | 7 | `renderer/ProjectOverview.tsx`, `CanvasConversationList.tsx`, `RightPanel.tsx`, `overviewRun.ts`, `overviewConversation.ts`, `homeRun.ts`, `renderer/prototype/*` | F | P |
| C | 8 | 모든 `state` 읽기와 테스트 | P, O | — |

`/design-sync`(9)는 C 뒤 워커가 P·O의 렌더러 파일을 넘겨받아 한다. 10·11·13·14는 컨덕터, 12의 리뷰는 독립 워커다.
