# canvas-composer-polish — orch

- 원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md), 초안 `.doan/canvases/canvas-composer-polish.html`(design '사용자 확정').
- 체인: [chain-261104](../chain-261104/chain.md) 링크 2. 상시 권한(자기 PR 병합, Codex 작업자 허용, 멈추지 않고 진행)은 그 파일을 따른다.
- 시작 hash: `d4971759`(main). 통합 브랜치: `feat/canvas-composer-polish`.

## 결정 기록

- 열린 결정 없음. feature 문서가 모든 점을 정했다(design '사용자 확정', 각 항목의 '사용자 결정').
- 작업자 모델: Claude만 쓴다(지휘자 판단). `~/.codex/models_cache.json`에 orchestrate §0의 Astra·Sol id가 없고(gpt-6-luna, gpt-5.6-terra, gpt-5.6-luna), 링크 1도 리뷰를 Claude에 맡겼다. Codex 사용 범위: 없음.
- A의 순수 함수를 한 커밋으로 묶는 tasks의 커밋 단위 대신, 배치마다 자기 순수 함수와 배선을 커밋한다(지휘자 판단 — 배치를 나눠 병렬로 돌리기 때문).
- T1 probe는 PRE 배치가 먼저 하고 결과를 tasks.md T1과 design 1번에 적는다.
- C1 `/design-sync`는 모든 배치를 통합한 뒤 별도 작업자(SYNC)가 한다. C2 `/runtime-test`(공용 로그인 프로필을 그 자리에서 사용)·C3 `/verify`·Z1 승격은 지휘자가 통합 HEAD에서 한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| ADM | A3, B3 | `main/conversation/project.ts`·`service.ts`(+테스트), `renderer/homeRun.ts`·`homeConversations.ts`·`homeComposer.ts`·`dockedRules.ts`·`ProjectOverview.tsx`(+테스트) | 없음 | Opus high — admission·promotion은 겹친 턴의 동시성 판단이 많고 틀리면 대화를 잘못 archive한다 | `npm --prefix app test`, typecheck | 리뷰 |
| SEND | A2, B2 | `renderer/conversationStore.ts`·`ConversationThread.tsx`·`threadItems.ts`·`queueFocus.ts`·`CanvasConversationPanel.tsx`·`overviewRun.ts`·`DockedComposer.tsx`(+테스트), `conversation:queue` 응답(main IPC·preload) | 없음 | Opus high — 이벤트·IPC 응답 도착 순서와 큐 복귀 규칙이 까다롭다 | `npm --prefix app test`, typecheck | 통합(Overview 배선 남음) |
| TOOL | B4, A4, B5, A5, B6 | `renderer/CanvasTools.tsx`·`App.tsx`·`rightPanelOpen.ts`·`canvasPicker.ts`·`CanvasController.ts`·`ShellSidebar.tsx`·`CanvasConversationList.tsx`·`RightPanel.tsx`·`conversationDelete.ts`·`ConversationDeleteDialog.tsx`·`listKeyboard.ts`, `main/index.ts`·`menuState.ts`(+테스트) | 없음 | Opus high — 픽 상태·포커스 복귀·메뉴 고아 정리가 여러 경로에 걸친다. App.tsx를 공유해 Picker·Export·Delete를 한 작업자가 순서대로 한다 | `npm --prefix app test`, typecheck, build | 리뷰 |
| PRE | T1, A1, B1 | `renderer/ComposerParts.tsx`·`HomeComposerView.tsx`, 새 순수 함수 파일(+테스트), tasks.md T1 줄·design 1번. 미룸: `DockedComposer.tsx` 배선(SEND 뒤), 캔버스 신호의 `App.tsx`·`CanvasController.ts`·`canvasScript.ts`/`canvasMessage.ts` 배선(TOOL 뒤) | T1 probe | Opus medium — Radix 포커스와 iframe 신호 판단이 있지만 범위가 좁다 | `/runtime-test` probe(T1), `npm --prefix app test`, typecheck | 리뷰 |
| SYNC | C1 | 초안 대비 구현 수정(통합 뒤 해당 화면 파일), `docs/DESIGN.md` 측정값 | 모든 배치 통합 | Opus medium — 측정·수정 반복이고 판단은 초안이 정한다 | `/design-sync` 보고 | 대기 |
| 리뷰 | 배치마다 | 보고만 | 해당 배치 완료 | Sonnet high(SEND·ADM·TOOL은 Opus medium) — diff 난도에 맞춤 | `/code-review` 보고 | 대기 |

## 겹침과 순서

- 1차 병렬: ADM, SEND, TOOL, PRE(미룸 항목 제외). 네 배치의 파일 소유는 겹치지 않는다. `ProjectOverview.tsx`는 ADM 소유이고 SEND는 고치지 않는다(필요하면 미룸으로 보고).
- PRE의 미룸 항목: SEND 통합 뒤 `DockedComposer.tsx`, TOOL 통합 뒤 캔버스 신호 배선을 새 Task로 보낸다.
- GUI probe: 1차에서는 PRE의 T1만 앱을 띄운다. 통합 뒤 SYNC와 지휘자 C2는 겹치지 않게 차례로 한다.
- 통합 뒤 C3 `/verify`, Z1 승격, PR, 병합.

## 진행 기록
- 2026-11-05 intake: tasks의 체크 항목은 모두 한 배치에 속한다(T1·A1·B1 PRE, A2·B2 SEND, A3·B3 ADM, A4·A5·B4·B5·B6 TOOL, C1 SYNC, C2·C3·Z1 지휘자, U0 완료). B5의 `exportViewer.test.ts` 맞춤은 링크 3(export-viewer-chrome)이 나중에 병합하므로 링크 3이 한다(지금 main의 그 테스트는 `CanvasTools.tsx`를 비교하지 않는다).
- 2026-11-05 1차 작업자 시작(run `run_68d01329ddce`): ADM `ctx_e9673691b34a`(worktree `ccp-adm`, Opus high), SEND `ctx_add66f8fcabc`(`ccp-send`, Opus high), TOOL `ctx_22a367818af5`(`ccp-tool`, Opus high), PRE `ctx_48ef61ef934b`(`ccp-pre`, Opus medium). 브리프는 `.scratch/briefs/`.
- ADM 질문 1(지휘자 판단): design 4번의 두 규칙을 글자대로 적용하면 tasks B3의 정방향 기대값(A가 답 대기 중 B가 X를 만듦 → 뒤에 판정되는 A가 X에 붙지 않음)이 성립하지 않는다. B를 먼저 판정할 때 A가 미판정이고 A의 snapshot에도 X가 없어 B는 promotion되지 않고, 그러면 규칙 1도 걸리지 않는다. spec 완료 조건 4의 문장(앞 대화를 archive하지 않음, 미판정 다른 턴이 가질 수 있으면 promotion 없음)과 design의 역방향 기대값을 지키는 (a)를 골랐다: 정방향은 B가 project conversation으로 남고 A가 X에 붙으며 아무것도 archive되지 않는다. 규칙 1은 기존 캔버스(edits) 경로와 다른 턴 snapshot에 이미 있던 새 캔버스로 고정한다. ADM이 tasks B3 줄을 고친다.
- ADM 질문 2(지휘자 판단): `HomeComposerView.tsx:90`의 running prop 타입 한 줄만 ADM이 고친다. PRE에 그 줄을 건드리지 말라고 알렸다.
- ADM 질문 3(지휘자 판단): `DockedBusy.waiting` 삭제로 깨지는 SEND 소유 테스트 세 줄(`DockedComposer.interaction.test.tsx:168`, `:270`, `DockedComposer.test.tsx:93`)의 `waiting` 속성만 ADM이 지운다. SEND에 알렸다.
- TOOL 질문(지휘자 판단): 프로젝트 문제로 열린 캔버스가 없을 때 툴바 Export의 이유는 Picker와 같은 꼴의 "Export isn’t available while the canvas can’t be shown."로 한다(문서에 문구가 없던 경우).
- SEND 완료(`11c6b4db` test, `693f88a3` feat, `2dbf3809` refactor; typecheck·`npm test` 7102 통과). `conversation:queue` 응답은 바꾸지 않았다(표시 값이 `DockedRequest.files`로 온다). 미룸: `ProjectOverview.tsx` 배선(ADM 소유, 패치는 ccp-send `.scratch/SEND-ProjectOverview-deferred.md`). 리뷰 `ctx_78f06f554d28`(Opus medium) 시작. 포스트모템 후보: Send now 중에 읽은 큐 목록이 거절로 돌아온 줄을 지우던 문제(main에도 있던 것).
- PRE 완료(`61a154d1` T1 기록·design 1번 확정, `df9243eb` test, `24f93d62` feat; typecheck·`npm test` 7085 통과). T1: Presets 버튼 목록은 부모 문서 클릭과 캔버스 선택 클릭에는 닫히지만 ⌥-클릭·픽 중 클릭에는 남고, `/` 목록은 어디를 눌러도 닫히지 않았다. design 1번: 새 canvas script 메시지 없이 `select`·`clear`·`picked` 처리와 ⌥-클릭의 iframe 포커스(window blur)에서 렌더러 신호를 낸다. probe는 합성 클릭에 맞춰 `screen.getCursorScreenPoint`를 고쳐 썼다. 미룸: `DockedComposer.tsx` 배선(SEND 뒤), `CanvasController`·`App.tsx` 신호(TOOL 뒤). PRE는 `/code-review`를 돌리지 않아 독립 리뷰가 그 몫을 한다. 리뷰 `ctx_7c52e5c4732b`(Sonnet high) 시작.
- ADM 완료(`68e9b13a` test, `92a0c413` feat, `f0f88889` tasks B3 문구, `d04f4aa2` 리뷰 test; typecheck·`npm test` 7097 통과, 변이 검사로 새 규칙이 고정됨을 확인). 계획과 다른 점: `projectBusy`가 busy 항목의 지난 `endedAt`을 보지 않는다, Home의 live 턴 수를 `holdsRoot`로 센다(큐 전송 직전·이전 프로세스 대기 포함). 리뷰 `ctx_0a6a4f356c23`(Opus medium) 시작.
- SEND 리뷰: 🔴 0, 🟡 1(거절 줄·알림을 마지막 렌더의 `sendNow`로 판정해, 턴이 끝난 뒤의 거절에도 "Couldn’t send now"를 보일 수 있음), ⚪ 4. 수정 라운드 `ctx_98ca0bb3b4c4`: 🟡1, ⚪2(비행 중인 줄의 두 번째 Send now 무시), ⚪1 테스트, 거절된 줄 버그의 `/postmortem`. ⚪3·⚪4는 범위 밖·문제 없음으로 둔다.
- TOOL 완료(`7663a5af`..`befea57e` 6커밋; typecheck·`npm test` 7107·build 통과, 자체 리뷰 🔴0 🟡0). 계획과 다른 점: Delete가 자기 Tab stop을 가짐(초안 마크업은 tabindex=-1, spec 6 문장을 따름), 대화창 Pick도 Esc 취소 때 픽 전 위치로 포커스, `canvasRowMenu.ts`·`canvasConversationRows.ts`·`CanvasAgent.test.tsx` 수정. 미룸: 대화창 Pick tooltip의 ⌘L, `DockedComposer.tsx` 주석과 고아 `"end"` 모드, `CanvasConversationPanel.tsx:80` 주석. 리뷰 `ctx_e2ead013efc3`(Opus medium) 시작.
- PRE 리뷰: 🔴 0, 🟡 4, ⚪ 5. 🟡는 모두 미룬 캔버스 신호에 관한 것이다. 지휘자 판단: 완료 조건 1이 "캔버스 iframe 안의 pointerdown도 바깥"이라 정했고, 기존 select·clear·picked와 blur 신호로는 오른쪽·Ctrl 누름, 클릭이 되지 않는 누름, `describe` null 대상을 덮지 못하고 Frames 드로어의 command reply를 걸러야 하므로, design 1번의 대안(새 canvas script 메시지)을 택했다. 모든 pointerdown에서 보내고 `parseCanvasMessage`를 거친다. blur 경로는 두지 않는다(리뷰의 사용자 결정 2는 이로써 필요 없음). PRE 후속 `ctx_e92621d18593`: design 1번 다시 쓰기, `canvasScript.ts`·`canvasMessage.ts`와 테스트, ⚪1 테스트, ⚪5 주석. `CanvasController.ts`·`App.tsx`·`DockedComposer.tsx` 배선은 TOOL·SEND 통합 뒤 새 Task로 보낸다.
- PRE 질문(지휘자 판단): press 메시지를 union에 더하면 `CanvasController.receive`가 선택 경로로 넘기므로, PRE가 그 함수에 press를 무시하는 한 줄만 더한다(배선은 후속 Task).
- ADM 리뷰: 🔴 0, 🟡 2, ⚪ 4. 지휘자 판단: (1) 🟡1 — 결정 (a)로는 답을 기다리던 A가 Deny·Stop으로 끝나면 B가 그린 캔버스에 A가 붙는다. spec 완료 조건 4의 "어느 턴이 그렸는지 알 수 없으므로 promotion하지 않음"을 따라 다툰 새 캔버스는 양쪽 모두 붙지 않게 바꾼다(먼저 판정한 쪽이 막은 캔버스를 다투던 다른 evidence의 제외 집합에 넣음). 역방향(B가 나중 판정)도 X에 붙지 않는다. design 4번과 tasks B3를 ADM이 고친다. (2) 🟡2 — "열린 요청이 하나라도 있으면 답 대기" 정의는 유지하고 한계를 Z1에서 ARCHITECTURE §7에 적는다. ADM 수정 라운드 `ctx_dccd31e9ff1c`.
- SEND 수정 라운드 완료(`31329c74` 🟡1·⚪1·⚪2, `f9bff5ca` POSTMORTEM; typecheck·`npm test` 7105 통과). SEND를 통합했다: `2f82c155`..`830ccf16`. 남은 것: `ProjectOverview.tsx` 배선(ADM 통합 뒤 SEND 작업자에게 보냄).
- TOOL 리뷰: 🔴 0, 🟡 2, ⚪ 5. 지휘자 판단: 🟡1 — Esc 등 취소 뒤 포커스는 아직 픽이 둔 곳(body, 캔버스 영역, 픽 전 요소)에 있을 때만 픽 전 위치로 돌리고, 사람이 필드로 옮겼으면 그대로 둔다(spec 3의 목적은 "body로 떨어지지 않음"). 🟡2(대화창 Pick tooltip의 ⌘L, "Add to conversation" 주석 두 곳, 고아 `"end"` 모드)는 `DockedComposer.tsx`를 배선하는 PRE 후속 Task에 넣는다. ⚪4 테스트 둘을 더한다. TOOL 수정 라운드 `ctx_eeb9fab11570`. SYNC에 알릴 것: Delete의 `tabIndex=0`은 spec 6을 따른 것이라 초안의 `tabindex=-1`로 되돌리지 않는다.
- PRE 후속 완료(`9f8d81a3` design 1번을 press 메시지로, `bb7fbdf4` press 메시지, `373736e1` ⚪1·⚪5; typecheck·`npm test` 7087 통과, 앱 probe는 아직 없음). PRE를 통합했다: `9594cf79`..`40786f24`. 배선 1부(`DockedComposer.tsx`·`CanvasConversationPanel.tsx`의 `/` 목록 바깥 닫기, `canvasPress` prop, TOOL 🟡2 정리) `ctx_8ed00b2f3906`. 2부(`App.tsx`·`CanvasController.ts` 신호와 캔버스로 가는 포커스)는 TOOL 통합 뒤 보낸다.
