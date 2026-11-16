# UX 감사 보고서 — ux-audit-261117

- 실행일: 2026-11-17 (한 세션, 리뷰어 2차 보강 포함)
- 검토 기준: `develop` HEAD `366993b72f3ea847e5416c5a7bade2fac2d1e208`. 작업 트리에는 추적하지 않는 `.doan/seen/doan-landing.json` 하나만 있었다.
- 완료 상태: **소스 검토 완료, 실제 앱 관찰 없음.** 화면 20개와 관점 4개의 칸을 모두 소스로 검토했다(해당 없는 칸은 이유를 적었다). 실제 앱은 띄우지 않았다. 그래서 포커스 이동, 시각 결과, 지속 시간에 관한 주장은 모두 정적 추적이며 실제 앱에서 확인하지 않았다.
- 방식: Claude 리뷰어 4명(문구, 동작·복구, 상태 전환, 표현)이 같은 화면·상태 목록을 받아 화면끼리 비교했다. 리드는 지적을 양쪽 근거와 대조하고, 중복을 합치고, 판정이 갈린 건을 정리했다. 리뷰어는 체크리스트로 Doan 프리셋 `clarify`·`critique`·`harden`·`onboard`·`audit`를 읽었다.
- 원자료: `.scratch/ux-audit/261117/`의 `inventory.md`, `wording.md`(W*), `actions.md`(A*), `states.md`(S*), `presentation.md`(P*). 이 보고서만으로 읽을 수 있게 근거를 옮겨 적었다.

## 1. 확인하지 못한 것 (먼저)

- **실제 앱 관찰 없음.** 짧은 `/runtime-test`로 확정하거나 기각해야 할 지적은 다음과 같다.
  - 포커스가 `<body>`로 떨어진다는 전제에 기대는 지적: U4, U5, U9, U10, U11. Chromium은 포커스된 요소가 사라지거나 `disabled`가 되면 포커스를 옮기는데, 이를 관찰하지 않았다.
  - U3에서 `working`과 `phase`가 어긋나는 시간이 얼마나 되는지 재지 않았다.
  - 계산값이나 소스로만 판단한 시각 지적: U2(대기열 위에 Edit and resend), U13, U14, U15, U16, U28(스피너 트랙), U33(긴 프로젝트 이름), U38, U39, U41.
- **소스로도 판단할 수 없는 것:**
  - 네이티브 열기·저장 시트를 닫은 뒤 포커스가 원래 버튼으로 돌아오는지(Attach, Choose folder, Locate, Export, token CSS). macOS가 직접 돌려주기 때문에 실제 시트에서만 볼 수 있다.
  - forced colors에서 `box-shadow`로 그린 포커스 링 두 개(`styles.css:1687`, `:1054`, `:1096`)가 사라지는지.
  - DESIGN에 기록된 값 밖의 대비 비율. U41만 계산했다.
- **덜 읽은 코드:**
  - `cli/internal/export/viewer/prototype.js`(내보낸 프로토타입 페이지의 동작)
  - `CanvasController.ts` 중 선택·인스펙터 경로. 인스펙터는 그려지지 않는다(PRODUCT 401).
  - 사이드바 크기 조절 핸들 코드
  - `editMenuTemplate`의 항목 규칙(PRODUCT 114)은 라벨만 확인했다.
- **문자열 추출 한계:** 리뷰어가 줄 단위 정규식으로 문자열을 뽑았다. 여러 조각을 이어 붙인 문장은 해당 모듈을 끝까지 읽은 곳에서만 잡혔다.

## 2. 요약

P1(주 작업이나 복구가 막힘)은 없다. 리드가 합친 지적은 아래와 같다.

| 등급 | 수 | 성격 |
|---|---|---|
| P2 확정 불일치 | 5 | 복구 경로 누락 1, 상태 판정 불일치 1, 키보드 포커스 2, 기존 BACKLOG 1 |
| P2 제품 결정 미정 | 1 | Edit and resend가 초안을 묻지 않고 덮어씀 |
| P3 확정 불일치 | 35 | 동작·상태 10, 문구 11, 표현 14 |
| 제품·디자인 결정 필요 | 20 | 규칙이 없거나 PRODUCT와 DESIGN이 서로 다른 지점 |

화면 사이 판정이 갈리는 가장 큰 원인은 두 가지다.

- **같은 상태를 두 가지로 해석한다.** `working` 판정(U3), 모델 목록 실패의 재시도(U1)가 여기에 해당한다.
- **사용할 수 없는 컨트롤을 표현하는 방식이 둘이다.** 툴바는 `aria-disabled`를 쓰고, 그 밖의 여러 곳은 native `disabled`를 쓴다(U5, U9, U10, U11).

## 3. 발견 사항

표기: 각 항목 끝 괄호는 원 리뷰어 ID다. "근거 A / B"는 비교한 두 쪽이다. 줄 번호는 위 HEAD 기준이다.

### 3.1 P2

**U1. 컴포저 모델 피커는 목록 읽기에 실패하면 다시 읽지 않는다. Settings › Agents에는 Retry가 있다** — 확정 불일치 (S-F10, 리드 확인)
- 영향 화면: Home 컴포저, Overview 도킹 컴포저, 캔버스 패널, 프로토타입 창(같은 패널).
- 근거 A: `homeComposer.ts:306`은 실패한 목록에 "Models unavailable"와 Default만 주고 `read: false`로 둔다. `dockedSupport.ts:53`은 키에 값이 있으면 바로 돌아간다. 다시 읽는 때는 로그인 세대가 바뀔 때뿐이다(`modelsKey(root, provider, generation)`).
- 근거 B: `SettingsAgents.tsx:206,262-263`은 "Couldn't load the models for <project>."와 Retry를 보여 준다. 같은 컴포저의 프리셋은 popover를 열 때 다시 읽는다(`dockedSupport.ts:43-51`). PRODUCT 242는 스킬 읽기 실패를 "다음 요청 때 다시 시도"한다고 정한다.
- 영향: CLI가 한 번 실패하면 앱을 다시 켜거나 다시 로그인할 때까지 모든 컴포저가 Default만 보여 준다. Effort, Fast, ACP 모드도 함께 사라진다(`permissionPicker.ts:31`).
- 가장 작은 수정: 오류 상태인 그룹은 `read: true`로 두고, `readModels`가 `{ error }` 값을 다시 읽게 한다.

**U2. Edit and resend는 컴포저 초안을 묻지 않고 덮어쓴다. Home의 Edit는 먼저 묻는다** — 제품 결정 미정 (A-F2, 리드 확인)
- 영향 화면: Overview, 캔버스 패널, 프로토타입 창에서 실패하거나 중단된 턴의 Edit and resend.
- 근거 A: `conversationStore.ts:290-302`는 파일을 다시 붙이는 동안 초안이 바뀐 경우에만 거절한다. 그 밖에는 `dropHeld(this.calls, before)` 뒤에 마지막 요청으로 덮어쓴다.
- 근거 B: `homeConversations.ts:86`은 다른 초안이 있으면 "Replace your draft?"(Keep Draft / Replace)를 띄운다(PRODUCT 249).
- 영향: 턴이 실패하면 대기열이 초안으로 돌아오는데(PRODUCT 260), 그 위에서 Edit and resend를 누르면 대기 메시지가 확인도 되돌리기도 없이 사라진다.
- 결정할 것: 도킹 컴포저에도 Home의 확인을 적용할지. 결정하면 PRODUCT item 3에 적는다.

**U3. "작업 중"을 두 가지로 판정해, 같은 대화가 "끝남·안 읽음"으로 보이면서 Delete는 "작업 중"이라며 막힌다** — 확정 불일치 (S-F1, 리드 확인)
- 근거 A (`phase`만 본다): `conversationList.ts:18-25` `conversationWork`. 사이드바 슬롯·대화 행, 제목 메뉴와 Canvas conversations 행 표시(`overviewConversation.ts:40-44`), Home strip이 이 값을 쓴다.
- 근거 B (`phase` 또는 main의 `working`): Delete 가능 여부 `conversationDelete.ts:14`(주석에 "목록 상태 표시와 같은 상태"라고 적혀 있다), 보드 표시기 `agentPresence.ts:30-34`, Show conversation 배지 `rightPanelOpen.ts:65`, 컴포저 `dockedRules.ts:73-75`.
- 기대 규칙: PRODUCT 336은 승격 판정을 기다리는 턴과 곧 나갈 대기열을 working에 넣는다. `main/conversation/summary.ts:16-19`도 같다. PRODUCT 250과 283은 같은 단어를 더 좁게 정의하지 않는다.
- 재현: `phase: "ended"`, `working: true`, `unseen: true`인 요약에서 행은 "Conversation finished — unread"를 보이고 Delete는 "The agent is working on this conversation."이라고 한다. 대기열의 턴 사이에서는 사이드바 스피너가 잠깐 꺼지지만 보드 표시기는 그대로다.
- 가장 작은 수정: `conversationWork`에서 `waiting`이 아닐 때 `c.working`을 running처럼 다룬다. 단위 테스트를 하나 더한다.

**U4. Home의 초안 교체 확인에서 Esc는 포커스를 돌려주지 않고 Cancel은 돌려준다** — 확정 불일치 (S-F2, 리드 확인)
- 근거 A: `HomeComposerView.tsx:594` `onCancel`(Esc)은 `setConfirm(null)`만 한다.
- 근거 B: 같은 대화상자의 Cancel(`:596`)은 `queueMicrotask(focusEnd)`를 부른다. 다른 모달은 모두 Esc와 Cancel이 같은 처리기를 탄다(`ConversationDeleteDialog.tsx:56,60`, `CanvasTrashDialog.tsx:25`, `App.tsx:2486-2488`, `SettingsDialog.tsx:19-22`).
- 덧붙임: 이 확인만 `role="alertdialog"`와 `aria-describedby`가 없다.
- 가장 작은 수정: `onCancel`이 Cancel과 같은 처리를 하게 한다.

**U5. 줌과 Back/Forward는 자기 동작 때문에 native `disabled`가 되어 포커스를 잃을 수 있다** — 확정 불일치, 런타임 미확인 (S-F4, S-F8)
- 근거 A:
  - `CanvasHeader.tsx:161,179`: Zoom out/in이 `disabled={view.zoomOut.disabled}`이고, 한계는 `zoomControl.ts:41-42`가 정한다.
  - `App.tsx:2537`: 메인 창 Back/Forward.
  - `prototype/PrototypeWindow.tsx:489-490`: 프로토타입 창 Back/Forward.
  - 내보내기 뷰어 `viewer/shell.js:243-245`와 `lib.js:392-393`.
- 근거 B: 툴바는 "`aria-disabled` (never `disabled`)"를 따른다(`docs/design/canvas.md:121`, `canvas-conversation.md:140`). POSTMORTEM 2026-11-13 'A toolbar control that turned unavailable while focused…'도 같은 문제를 다뤘다.
- 재현: 키보드로 Zoom out을 끝까지 누르거나, Back을 첫 방문까지 누르면 포커스가 `<body>`로 갈 것으로 보인다(미관찰).
- 가장 작은 수정: 툴바처럼 `aria-disabled`와 클릭 가드를 쓴다. 캔버스가 없어서 헤더 전체가 쓸 수 없을 때는 지금처럼 `disabled`를 유지한다.

**U6. 문제 오버레이의 Remove from Doan은 워크트리 하나만 지운다** — 확정 불일치, **이미 `docs/BACKLOG.md:164`에 있다** (A-F4)
- 근거: `App.tsx:1865-1870`(오버레이, `remove([root])`)과 `ShellSidebar.tsx:477-480`·`App.tsx:2434`(그룹 전체)를 비교했다. PRODUCT 221은 그룹 전체를 지운다고 정한다. `docs/design/onboarding.md:195`는 워크트리 하나 라벨을 적고 있어 PRODUCT와도 어긋난다. 새 지적으로 세지 않았다.

### 3.2 P3 — 동작·상태 확정 불일치

**U7. Overview 본문은 대화 목록 첫 읽기 실패를 알리지 않는다** (A-F1, S-F3)
- 근거 A: `ProjectOverview.tsx:122,321`은 실패한 목록을 새 대화 상태로 그린다. 실패 문구는 닫힌 제목 메뉴 안(`:378-379`)에만 있다.
- 근거 B: 캔버스 패널(`CanvasConversationPanel.tsx:492-493`)과 프로토타입 창(`docs/design/prototype.md:98`, PRODUCT 321)은 본문에 "Couldn’t read conversations"와 Retry를 보인다.
- 판정 정리: 두 리뷰어가 처음에는 P2로 봤다. 리드가 확인해 보니 Overview 오른쪽 Canvas conversations 패널은 같은 프로젝트 목록 상태(`App.tsx:2299-2301` `run.listState`)를 읽는다. 그래서 실패하면 "Couldn’t read conversations"와 Retry를 이미 보여 준다(`CanvasConversationList.tsx:102-103`). 실패와 Retry가 화면에 보이므로 P3로 낮췄다. 남은 문제는 본문이 "대화가 없는 프로젝트"처럼 보이고, Retry가 "Canvas conversations" 제목 아래에만 있다는 점이다.
- 가장 작은 수정: 캔버스 패널의 `thread-notice`를 Overview `.ov-new` 열에도 그린다.

**U8. Overview에서 새 대화 시작이 거부되면 Retry 버튼이 없다** (A-F3)
- 근거 A: `ProjectOverview.tsx:427-450`은 `refuse`를 넘기지 않는다. `dockedRules.ts:146`의 `new` 분기는 `startErrorView(...).text`만 가져가고 `retry`를 버린다.
- 근거 B: Home(`HomeComposerView.tsx:588`)과 캔버스 패널(`canvasConversation.ts:186-200`)은 Retry를 보인다.
- 영향: 초안이 남아 있고 Send를 누를 수 있어 영향은 작다. 다만 "Try again."이라고 쓰고 버튼은 없다.

**U9. 처리 중인 확인 버튼과 복구 버튼: 포커스를 지키는 곳과 잃는 곳, 진행 표시가 있는 곳과 없는 곳이 섞여 있다** (S-F6, S-F12, P-F2)
- 근거 A (native `disabled`, 또는 버튼이 사라짐):
  - Set Up 대화상자 `ProjectSetupDialog.tsx:103-104`. 라벨이 "Setting Up"으로 바뀌고 스피너는 없다.
  - MCP Add `SettingsMcpConnectors.tsx:249`.
  - 첫 실행 paste 대화상자 `Onboarding.tsx:134,137`. 스피너와 `aria-busy`가 없다.
  - 정정: Stop 대화상자(`Onboarding.tsx:150`)도 처음에는 여기에 넣었지만 빼야 한다. 두 호출부가 모두 `busy={false}`를 넘기고(`Onboarding.tsx:229`, `SettingsAgents.tsx:159`), `confirmStop`은 요청을 보내기 전에 대화상자를 닫는다(`agentStep.ts:157-161`). 그래서 처리 중 상태가 없다.
  - Project Settings Retry `ProjectSettingsPage.tsx:257,381`.
  - About Check for Updates `SettingsAbout.tsx:24-34`. 버튼이 스피너로 바뀐다.
  - 대화 Delete `ConversationDeleteDialog.tsx:51-66`. 포커스는 지키지만 `data-disabled`라 "쓸 수 없음"처럼 보이고 스피너가 없다.
- 근거 B (`aria-disabled`와 스피너): `SettingsDialog.tsx:25-26`(이유는 `docs/design/shell.md:203` "Focus must not fall out of a modal alert"), 문제 오버레이 `ProblemOverlay.tsx:34-40`, Retry 토스트 `Toast.tsx:104-106`.
- 가장 작은 수정: `SettingsDialog`의 패턴(`aria-disabled`, `aria-busy`, 버튼 안의 스피너)으로 맞춘다. 대화 Delete의 표시를 어떻게 할지는 3.5의 D1에서 결정한다.

**U10. 대화 제목 트리거가 메인 창에서는 native `disabled`, 프로토타입 창에서는 겉보기만 활성이다** (S-F5, P-F24)
- 근거 A: `CanvasConversationPanel.tsx:181`과 `ProjectOverview.tsx:367`은 `disabled={list === "loading"}`이다. 비활성 잉크가 나오고 포커스를 잃을 수 있다.
- 근거 B: `prototype/PrototypeConversation.tsx:70,94-95`는 `aria-disabled`라 포커스를 지킨다. 그런데 `.ov-title[aria-disabled]` 스타일이 없어 보통 잉크와 hover가 그대로 나온다.
- 기대 규칙: PRODUCT 320 "unavailable (still focusable)", `prototype.md:74`, DESIGN 68.
- 가장 작은 수정: 세 곳 모두 `aria-disabled`로 맞추고 비활성 스타일을 더한다. `canvas-conversation.md:13`도 함께 고친다.

**U11. Home의 프로젝트·워크트리 피커는 사용할 수 없는 항목을 건너뛴다** (S-F13)
- 근거 A: `HomeComposerView.tsx:529-536,574-578`은 `RadioItem/Item disabled`라 화살표 키가 건너뛴다. 이유 문구는 `aria-describedby`로 연결되지 않은 형제 `<p>`다.
- 근거 B: 캔버스 행 메뉴(PRODUCT 212 "stays reachable by the arrow keys and reads its reason line", `canvas.md:236`)와 Overview 워크트리 메뉴(`ProjectOverview.tsx:338-350`)는 항목에 닿을 수 있다.

**U12. 프로토타입 창의 토스트는 삭제 확인 모달 뒤에서도 시간이 흐른다** (S-F11, 리드 확인)
- 근거 A: `prototype/PrototypeWindow.tsx:83`은 `useToast`를 쓰지만 `setModal`을 부르지 않는다(grep 결과 없음).
- 근거 B: 메인 창 `App.tsx:1024`은 `toast.setModal(toastHeld)`를 부른다. ARCHITECTURE.md:455 'Toasts'는 모달이 시계를 멈춘다고 정한다.
- 가장 작은 수정: `useLayoutEffect(() => toast.setModal(deleting !== null), [deleting])`.

**U13. 썸네일 요청이 reject되면 스크린 리더에 "Preview loading"이 계속 남는다** (S-F9)
- 근거 A: `thumbnails.ts:73-87`은 reject를 로그만 남기고 상태를 두지 않는다. 그래서 `CanvasConversationList.tsx:125-128`이 pending으로 읽는다.
- 근거 B: 대화 목록, 모델, 프리셋, 사용량 읽기는 모두 reject를 실패 상태로 바꾼다(`homeRun.ts:496`, `dockedSupport.ts:47,57`).
- 시각 차이는 없다.

**U14. 스레드의 Copy는 실패해도 아무 표시가 없다** (A-F9)
- 근거: `ConversationThread.tsx:796-802`와 Project Settings "Couldn’t copy the command. Select it and copy it yourself."(`ProjectSettingsPage.tsx:232,344`), About "Couldn’t copy the details. Try again."(`SettingsAbout.tsx:194-198`)를 비교했다.

**U15. MCP 연결 중 Open again이 실패해도 표시가 없다** (A-F10)
- 근거: `SettingsMcpConnectors.tsx:116`은 `openMcpLink`의 응답(`open_failed`, `main/mcpConnectors/service.ts:241-245`)을 버린다. 같은 동작인 Agents 로그인의 Open again은 "Couldn’t open your browser. Try again."을 보인다(`agentAuthView.ts:152`).

**U16. 첨부 거부 문구가 Home에서는 컴포저 아래에, 도킹 컴포저에서는 토스트로 나온다** (A-F13)
- 근거: Home `HomeComposerView.tsx:350-353,376-383,588`와 `ProjectOverview.tsx:207,216,245`, `CanvasConversationPanel.tsx:388` → `App.tsx:2462,2476` 토스트를 비교했다. `docs/design/home.md:71`은 Home만 정한다.
- 영향: 캔버스에서는 다른 토스트에 밀려 사라질 수 있다(D6).

### 3.3 P3 — 문구 확정 불일치

**U17. 읽을 수 없는 캔버스 문구와 따옴표·축약이 화면마다 다르다** (W1, W15)
- 사이드바와 Canvas conversations 행은 `"Can't read this canvas — run doan check"`다(`canvasTree.ts:61`). 곧은 따옴표, 마침표 없음, 소문자 명령이다. 같은 형태가 `canvasConversationRows.ts:75`에도 있다.
- PRODUCT 270과 310이 정한 문장은 `"Can’t read this canvas."`이고, `canvasRowMenu.ts:38`과 `prototype/view.ts:87`은 이를 따른다.
- 보드와 인스펙터는 "Could not…"을 쓴다(`CanvasController.ts:833,1010,1021`, `App.tsx:2580`). `inspector.ts:9`에는 곧은 따옴표가 있다.
- 그 밖에 곧은 따옴표나 "could not"이 있는 곳: Remove from Doan 본문 `homeConversations.ts:42`, main의 `projectAdder.ts:76-77`과 `projects.ts:55-56`(클론 화면 알림으로 나온다).
- 가장 작은 수정: `"Can’t read this canvas. Run doan check in a terminal."`로 바꾸고, 곧은 따옴표를 `’`로, "could not"을 "couldn’t"로 바꾼다.

**U18. 사람이 멈춘 턴을 스레드는 "You stopped the agent.", Home strip은 "You stopped this conversation."이라고 한다** (W2, 리드 확인)
- 근거: `ConversationThread.tsx:139`와 `conversationStrip.ts:110`. strip의 다른 실패 문장은 스레드 문장을 그대로 쓴다(`conversationStrip.ts:104`).

**U19. "Try Open again shortly."가 Open 컨트롤이 없는 곳에 나온다** (W3, 리드 확인)
- 근거: `quickOpen.ts:360`이 사이드바 행, Overview 카드, Quick Open 선택에서 쓰인다(`App.tsx:789,808`). 같은 상태의 답장 칩은 "Try again shortly."다(`App.tsx:190`).

**U20. 접근성 이름에 보이는 라벨이 들어 있지 않다** (W4)
- 보이는 라벨 "Retry"의 이름이 다음과 같다.
  - "Check <provider> again"(`agentAuthView.ts:110`)
  - "Check <server> for <agent> again"(`mcpConnectorsView.ts:105`). 같은 페이지의 다른 Retry는 `Retry <server>…`(`:120`)다.
  - "Check for updates again" / "Download Doan <v> again"(`main/update/view.ts:100-101`)
- 보이는 라벨 "Send now"의 이름은 "Send queued message now"다(`DockedComposer.tsx:660`).
- 기대 규칙: `clarify` 프리셋의 "screen-reader names aligned with visible labels"와 WCAG 2.5.3.
- 음성 제어로 누를 수 있는지는 확인하지 않았다.

**U21. 너무 오래된 에이전트 CLI를 About은 "Update needed", Home 피커는 "Needs an update"라고 한다** (W5)
- 근거: `main/aboutView.ts:39`와 `agentAuthView.ts:203`, `dockedRules.ts:113`.

**U22. Home 피커가 읽는 중인 프로젝트에도 "Fix it from its menu in the sidebar."라고 한다** (W10)
- 근거: `HomeComposerView.tsx:530-537`, `homeComposer.ts:88,136`. 읽는 중인 행의 메뉴에는 고칠 동작이 없다(`homeCards.ts:69`). Quick Open은 두 상태를 나눈다(`quickOpen.ts:268,360-361`, `docs/design/shell.md:122`).

**U23. 업데이트 popover 제목 중 "Couldn’t restart Doan."만 마침표가 있다** (W11)
- 근거: `main/update/view.ts:36-40`. 마침표는 About 줄에 이어 붙이려고 넣은 것이다(`:41`).

**U24. 버디 단계와 버디 화면은 "You can change it anytime in Settings."라고 하지만, Settings에서 바꾸면 24시간 잠긴다** (W12, 리드 확인)
- 근거: `Onboarding.tsx:718`과 `SettingsGeneral.tsx:110,115`, PRODUCT 140-143. PRODUCT는 이 문장을 정하지 않았다.
- 덧붙임: 첫 실행을 마친 사람에게 보이는 버디 화면의 대화상자 이름이 "Set up Doan"이다(`Onboarding.tsx:761`).

**U25. "대상이 캔버스에 더는 없음"을 세 가지로 말한다** (W13)
- `"This frame is not in the rendered canvas"`(`App.tsx:1633`, 마침표 없음, "is not")
- 답장 아래에 쓰라고 정한 줄 "No longer in the canvas"를 토스트로 다시 쓴 것(`App.tsx:1676`, PRODUCT 415)
- `"The selection is no longer in the canvas."`(`selection.ts:10`)

**U26. 로그인·로그아웃 전 Stop 확인: 제목은 복수, 본문은 단수이고, 버튼에서 "again"이 빠졌다** (W14)
- 근거: `agentAuthView.ts:284-287`의 "Stop <provider> conversations?"와 "…is running a conversation". 버튼은 "Stop and sign in"인데, 대화상자를 연 버튼은 "Sign in again"(`:75`)이다.

**U27. 같은 하위 프로세스를 "the doan command"와 "the doan CLI"로 부른다** (W16)
- "the doan command": 문제 오버레이, Details, About(`problemView.ts:52`, `main/folderState.ts:49-55`, PRODUCT 169)
- "the doan CLI": Home 프리셋 서랍(`homeComposer.ts:530-541`)
- 설정 실패 이유 `main/folderState.ts:126`은 "timed out after 10 s"와 "Invalid response from doan CLI."를 쓴다.

### 3.4 P3 — 표현 확정 불일치

**U28. 버튼 안 처리 중 스피너를 세 가지로 그리고, Send의 스피너 잉크 규칙은 효과가 없다** (P-F1, 리드 확인)
- 공용 `.doan-spinner`(`ds/controls.css:304-313`)는 테두리 색을 토큰으로 직접 정하고 `color`를 읽지 않는다. 그래서 `.composer-send .doan-spinner { color: … }`(`styles.css:794`)는 아무것도 바꾸지 않는다. `docs/design/home.md:29`의 "spinner in `--text-on-accent`"와 어긋난다.
- 비활성 채움 `--affordance-disabled`와 트랙 `--border-standard`가 둘 다 #e8e8e8이다(`tokens.css:245,267`). 그래서 Send, Retry 토스트, 배경 Stop에서는 어두운 4분의 1 호만 보인다.
- 대화상자 동작(`styles.css:390`), 문제 오버레이(`:1936`), 질문 Send(`:1668`)는 `currentColor` 30% 트랙을 쓴다.
- 가장 작은 수정: `:is(.doan-button, .doan-icon-button) > .doan-spinner` 규칙 하나로 합친다.

**U29. Set Up 대화상자의 Doan files 선택지는 쓰는 동안에도 활성처럼 보인다** (P-F3)
- 근거: `.storage-option`(`styles.css:1852-1860`)은 `cursor`만 바꾼다. 같은 선택이 다른 곳에서는 비활성 역할을 쓴다: `.storage-row`(`:1877-1881`), `.storage-pref[data-disabled]`(`:1889-1892`). DESIGN 68.

**U30. Details 펼침 버튼에 ▸/▾가 세 곳에는 있고 Project Settings에는 없다** (P-F4)
- 근거: `ErrorDetails.tsx:9`, `ProblemOverlay.tsx:42`, `PrototypeWindow.tsx:543`와 `ProjectSettingsPage.tsx:379-381`(`homeCards.ts:37` "Details").

**U31. 아이콘이 없는 오류 줄이 있고, 이웃한 대화상자의 필드 오류 스타일이 둘이다** (P-F5)
- 아이콘 없음: `.ask-error`(`styles.css:1641`), `.ob-field-error`(`:254`)
- 아이콘 있음: MCP 추가 대화상자 `settings-msg error`와 `AlertIcon`(`SettingsMcpConnectors.tsx:245`). `styles.css:1114`의 주석은 paste 대화상자와 같다고 하지만 실제로는 다르다.
- 기대 규칙: DESIGN 104-106. `.pj-msg`(`:400,402`)는 쓰는 곳이 없다.

**U32. 버디 행의 "newer settings" 상태를 첫 실행은 opacity로, Settings는 역할 색으로 그린다** (P-F7, 리드 확인)
- 근거: `.buddy-flow[aria-disabled="true"] { opacity: .55 }`(`styles.css:360`)와 `.buddy-row[data-disabled]`(`:374-377`). DESIGN 68 "never `opacity`"이며, Intended exceptions에 없다.

**U33. 긴 프로젝트 이름이 Overview 헤더와 Home 프로젝트 피커에서 잘리지 않는다** (P-F8, 시각 미확인)
- 근거: `.ov-project`는 `flex: none`이고 말줄임이 없다(`styles.css:1316-1317`, 리드 확인). 이름이 길면 New conversation 버튼이 패널 밖으로 밀릴 수 있다. Home 트리거 `HomeComposerView.tsx:523`과 메뉴 행 `.model-name`(`styles.css:883`)도 같다.
- 비교: 캔버스 헤더 `.doan-canvas-name`은 `max-width: 40%`에 말줄임이다(`:1455-1457`, `canvas.md:15` 측정).

**U34. 코드 블록과 표의 스크롤바는 조용한 thumb 색을 잃고, 두 스크롤러는 `.doan-scroll`을 다시 선언한다** (P-F14)
- 근거: `styles.css:1207,1213`과 `:1169,758`. DESIGN 85 "the one class".

**U35. 타입 역할을 쓰면서 자간을 빠뜨린 규칙이 있다. 공용 `.doan-notice`도 그렇다** (P-F15)
- 근거: `ds/surfaces.css:189-200` 외 약 15개 규칙. DESIGN 36, 65 "applied whole".
- 정정: Settings 패널의 자간 상속은 `docs/design/shell.md:302`에 적혀 있다. 그러니 모르고 생긴 차이가 아니라, 기록된 예외가 DESIGN 규칙과 부딪히는 경우다.

**U36. 모션 리터럴과 빠진 전환** (P-F16)
- 스레드 화살표는 `transition: transform 120ms`(`styles.css:1226`)이고, 사이드바 화살표는 토큰을 쓴다(`:596,642`).
- `.fast-switch::before`(`:837-839`)에는 공용 스위치(`controls.css:230`)에 있는 thumb 전환이 없다.

**U37. 디자인 문서 drift 두 곳** (P-F18, P-F12)
- `docs/design/onboarding.md:115`은 드롭 윤곽선을 `--affordance-accent`라고 적었지만, 코드는 `--text-accent`다(`styles.css:904`, DESIGN 101).
- DESIGN 73에 적힌 `PathTip`은 `app/src`에 없다.

**U38. Settings › General에서 버디 전환 실패의 Retry가 회색 알림 위의 `subtle`이라 채움이 보이지 않는다** (P-F19)
- 근거: `BuddyPicker.tsx:162-166`, `SettingsGeneral.tsx:101`. 같은 컴포넌트가 첫 실행에서는 `doan-panel` 위에 놓인다(`Onboarding.tsx:721`). 다른 inset 알림은 모두 `panel`을 쓴다. DESIGN 83, 170.

**U39. 흰 바탕의 알림이 아닌 곳에 `panel` 버튼을 써서 ghost처럼 보인다** (P-F20)
- 근거: 도킹 컴포저 사유 줄 `DockedComposer.tsx:527,533,534`, Overview 오른쪽 패널 Retry `CanvasConversationList.tsx:102`. Home의 같은 Open은 `subtle`이다(`HomeComposerView.tsx:591`, `home.md`).

**U40. 동작 줄이기 설정에서도 사이드바 화살표가 회전한다** (P-F21, 리드 확인)
- 근거: `.shell-disclosure svg`(`styles.css:596`)와 `.shell-group-head svg`(`:642`)에는 reduce 예외가 없다. 스레드 화살표는 멈춘다(`:1293`). DESIGN 70.
- 나머지 모션은 CSS와 JS 모두 reduce를 따른다.

**U41. 캔버스 에이전트 알림의 Open은 어두운 캡슐 위에 검은 포커스 링을 그린다** (P-F23, 계산값만 있음)
- 근거: `.doan-agent`(`styles.css:1728`)와 전역 링(`:36`, `controls.css:126`)을 비교했다. 흰 캔버스 위에서 약 3.7:1이고, 어두운 캔버스에서는 1:1에 가까워진다. 크기 버블 버튼은 링 색을 바꾼다(`:120`). `canvas.md:195`에도 미측정으로 적혀 있다.

### 3.5 제품·디자인 결정이 필요한 지점

코드만 고쳐서는 맞출 수 없는 지점이다. 규칙이 없거나, 두 기준 문서가 서로 다르다.

| ID | 무엇을 정할지 | 근거 |
|---|---|---|
| D1 | 처리 중인 확인 버튼 표시(스피너와 `aria-busy` 대 비활성 모양)를 하나로 정할지 (U9와 이어짐) | P-F2, `shell.md:203` |
| D2 | Settings로 이동하는 명령에 말줄임표를 붙일지. "Open Agents settings…"와 "Open Agents settings", "Sign in again…"와 "Sign in again"이 섞여 있다 | W6, A-F5, DESIGN 69 |
| D3 | 진행 라벨의 말줄임표: DESIGN 69는 붙이지 않는다고 하지만 PRODUCT는 "Reading usage…", "Sending…" 등을 정했다. 같은 화면에 "Sending"과 "Sending…"이 함께 나온다 | W7 |
| D4 | 버튼 대소문자 규칙(앱 안은 sentence case, macOS 명령은 title case 등). "Keep Draft"와 "Setting Up"은 근거가 없다 | W8 |
| D5 | 권한 요청 데스크톱 알림의 "needs your approval"과 앱 안의 "needs your answer" | W9, PRODUCT 166 |
| D6 | 토스트 칸이 하나뿐이라 Retry 토스트가 다음 토스트에 밀린다. 동작이 붙은 토스트를 다르게 다룰지 | A-F7 |
| D7 | `folders.json` 저장 실패가 로그로만 남는다(Remove, Add, Locate가 성공처럼 보인다). 실패를 보여 줄지 | A-F6, ARCHITECTURE §7 |
| D8 | 에이전트 답장 링크가 브라우저에서 안 열릴 때: 스타 카드처럼 알릴지, Home 크레딧처럼 조용히 둘지 | A-F8, PRODUCT 116, 222 |
| D9 | 설치 페이지 열기 실패 알림에 재시도와 주소를 둘지 | A-F11, PRODUCT 128 |
| D10 | 스레드 질문 카드에서 Skip 실패 문구를 strip처럼 구분할지 | A-F12, PRODUCT 249, 378 |
| D11 | 대화 목록 Retry의 진행 표시와 다시 실패했을 때의 표시 | S-F7 |
| D12 | 첫 로딩 줄을 300 ms 늦출지. 캔버스 페이지만 바로 보인다 | S-F14 |
| D13 | 알림 보조 줄의 잉크(onboarding은 metadata, Project Settings는 subtle). DESIGN 167 "no ink of their own"과 어긋난다 | P-F6 |
| D14 | 크기 체계 밖의 보조 줄 크기(11/14, 12/18) | P-F9, DESIGN 36, 218 |
| D15 | 사용할 수 없는 컨트롤의 커서: `not-allowed`와 `default` | P-F10 |
| D16 | 아이콘만 있는 버튼에 모두 툴팁을 줄지. Back/Forward가 가장 눈에 띈다 | P-F11, W 2차 메모 |
| D17 | 잘린 이름을 보여 주는 방식: native `title`, 공용 툴팁, 없음 | P-F12 |
| D18 | New conversation 아이콘(헤더 `SquarePen`과 메뉴 `Plus`), Stop 아이콘(`Square`와 `CircleStop`) | P-F13 |
| D19 | 툴팁 단축키 표기(본문 텍스트와 키 칩) | P-F22, DESIGN 138 |
| D20 | 알림 동작 위치: 알림 아래(Agent 단계, Settings)와 알림 안(DESIGN 'Notices'). 그 밖에 radius 토큰(P-F17), 내보내기 뷰어 "Viewing"과 Eye 표시(P-F26) | P-F25 |

## 4. 의도된 차이로 판정한 것 (결함 아님)

PRODUCT나 디자인 문서가 정한 차이다.

- **삭제·제거 계열:** Remove from Doan, Delete, Move to Trash, Remove(MCP) 동사 구분. 확인 뒤 흐름이 서로 다른 것도 PRODUCT 214, 221, 337, 159가 정했다.
- **캔버스 실패 복구:** 캔버스 실패는 Reload, 프로토타입 실패는 Retry/Close/Details다(PRODUCT 270, 317).
- **연결 확인 버튼:** Settings는 Check, 첫 실행은 Retry다(PRODUCT 146).
- **Show conversation 배지 범위:** 메인 창은 캔버스 전체, 프로토타입 창은 보이는 대화만 본다(PRODUCT 283, 318).
- **Quick Open:** 대화 목록 실패를 표시하지 않는다(PRODUCT 393). ↑/↓가 끝에서 처음으로 돌아가는데, combobox 관례를 따른 것이고 정한 문서가 없어 지적하지 않았다.
- **알림 클릭:** 잠금이나 모달 중에는 창만 앞으로 가져온다(PRODUCT 167).
- **네이티브 메뉴:** title case를 쓰고, 활성 조건은 앱 안의 같은 기능과 일치한다(`main/menuState.ts:34-48`).
- **도킹 컴포저 세 곳**(Overview, 캔버스 패널, 프로토타입)은 같은 `DockedComposer`를 쓴다. 그래서 Send, Queue, Stop, Send now, 사용량 한도 대기열이 같은 경로를 탄다.
- **Agents 화면 공유:** 첫 실행 Agent 단계와 Settings › Agents는 같은 `agentAuthView`를 쓴다.
- **파괴적 확인 다섯 종**은 Cancel이 먼저 있고 처음 포커스를 받으며, 확인 버튼은 prominent로 마지막에 있다.
- **2026-11-09 포스트모템 점검을 다시 돌렸다.** 알림 class가 자기 폰트나 패딩을 갖는지 확인했고, 통과했다.

## 5. 화면·상태 커버리지

표기:
- `소스` = 소스 검토 완료
- `—` = 해당 없음
- 런타임 관찰은 모든 칸에서 **하지 않았다**.

| 화면 | 문구 | 동작·복구 | 상태 전환 | 표현 |
|---|---|---|---|---|
| S1 첫 실행 onboarding | 소스 | 소스 | 소스 | 소스 |
| S2 버디 화면 | 소스 | 소스 | 소스 | 소스 |
| S3 Settings | 소스 | 소스 | 소스 | 소스 |
| S4 앱 shell·사이드바 | 소스 | 소스 | 소스 | 소스 |
| S5 Agent usage | 소스 | 소스 | 소스 | 소스 |
| S6 앱 업데이트 | 소스 | 소스 | 소스 | 소스 |
| S7 GitHub 스타 카드 | 소스 | 소스 | 소스 | 소스 |
| S8 Add Projects | 소스 | 소스 | 소스 | 소스 |
| S9 Project Settings·Set Up | 소스 | 소스 | 소스 | 소스 |
| S10 문제 오버레이·strip | 소스 | 소스 | 소스 | 소스 |
| S11 Home | 소스 | 소스 | 소스 | 소스 |
| S12 Project Overview | 소스 | 소스 | 소스 | 소스 |
| S13 캔버스 페이지 | 소스 | 소스 | 소스 | 소스 |
| S14 캔버스 대화 패널 | 소스 | 소스 | 소스 | 소스 |
| S15 프로토타입 창 | 소스 | 소스 | 소스 | 소스 |
| S16 Quick Open | 소스 | 소스 | 소스 | 소스 |
| S17 대화상자·확인 | 소스 | 소스 | 소스 | 소스 |
| S18 토스트·알림 | 소스 | 소스 | 소스 | 소스 |
| S19 네이티브 메뉴·알림·패널 | 소스 | 소스 | — (renderer 상태 없음, 포커스 복귀는 런타임에서만 보인다) | — (renderer CSS 없음) |
| S20 내보내기 뷰어 | 소스 | — (탐색 동작만 있다) | 소스 (`prototype.js` 제외) | 소스 |

공유 개념(C1 프로젝트 상태, C2 에이전트 연결, C3 선택·포커스, C4 로딩·작업 중, C5 오류·복구, C6 컴포저, C7 파괴적 동작)은 모두 위 칸 안에서 화면끼리 비교했다.

## 6. 사용자 결정 (2026-11-17)

U2와 D1–D20에 대해 같은 날 사용자가 정했다. 아직 구현하지 않았으며, PRODUCT, ARCHITECTURE, DESIGN에도 반영하지 않았다. 문서는 구현을 마친 뒤 그 결과에 맞춰 고친다.

| ID | 결정 |
|---|---|
| U2 | 도킹 컴포저(Overview, 캔버스 패널, 프로토타입 창)의 Edit and resend도 다른 초안이 있으면 Home처럼 "Replace your draft?"로 먼저 묻는다. 실패 뒤 돌아온 대기열도 이 확인으로 보호된다. |
| D1 | 처리 중인 확인 버튼은 `SettingsDialog` 방식으로 통일한다. 채움을 유지하고, 스피너와 `aria-busy`를 붙이고, `aria-disabled`로 둔다. 대화 Delete, Set Up, MCP Add, paste 대화상자, Project Settings Retry, About Check for Updates에 적용한다(U9). 첫 실행 Stop은 처리 중 상태가 없어서 대상이 아니다(U9 정정). |
| D2 | Settings 섹션으로 이동하는 명령에는 말줄임표를 붙이지 않는다. 피커와 도킹 컴포저의 "Open Agents settings…"에서 "…"를 뺀다. |
| D3 | 진행 라벨은 DESIGN 69를 따라 말줄임표를 붙이지 않는다. PRODUCT의 "Reading usage…", "Updating…", "Sending…", "Still reading N projects…"와 해당 코드를 고친다. |
| D4 | 앱 안 버튼은 sentence case로 쓴다. 네이티브 메뉴와 macOS식 명령(Show in Finder, Check for Updates 등)은 예외로 DESIGN에 적는다. "Keep Draft"는 "Keep draft"로, "Setting Up"은 "Setting up"으로 바꾼다. |
| D5 | 권한 요청 데스크톱 알림도 "<Provider> needs your answer"로 바꾼다. Settings의 스위치 이름 "Approval requests"는 그대로 둔다. |
| D6 | 토스트는 지금처럼 새 토스트가 이전 토스트를 바꾼다. 이 규칙을 DESIGN 'Notices'에 적는다. |
| D7 | `folders.json` 저장이 실패하면 Retry 토스트로 알린다. ARCHITECTURE §7에 적는다. |
| D8 | 에이전트 답장 링크가 브라우저에서 열리지 않으면 실패 토스트로 알린다. |
| D9 | 설치 페이지 열기 실패 알림은 지금처럼 둔다. 재시도 버튼과 주소를 더하지 않는다. |
| D10 | 스레드 질문 카드의 Skip 실패는 strip처럼 "Couldn’t skip the question. Try again."으로 나눠 쓴다. |
| D11 | 대화 목록 Retry는 읽는 동안 공용 진행 중 Retry(스피너, `aria-disabled`)로 보이고, 다시 실패하면 줄을 다시 알린다. |
| D12 | 캔버스 페이지의 첫 로딩 줄도 300 ms 늦게 보인다. |
| D13 | 알림의 이유 줄은 caption 크기 보조 줄로 DESIGN 167의 예외로 인정한다. 잉크는 metadata 하나로 맞추고, `ds/controls.test.ts`의 목록에도 넣는다. |
| D14 | 체계 밖 보조 줄 크기(11/14, 12/18)를 caption 12/16으로 옮기고, 측정값 문서를 고친다. |
| D15 | 사용할 수 없는 컨트롤의 커서는 `default`로 통일한다. |
| D16 | 아이콘만 있는 버튼에는 모두 공용 툴팁을 단다. 이 규칙을 DESIGN에 적는다. 툴팁 문구는 Back, Forward, Project menu, Canvas menu, Server menu, Copy code, Remove attachment, Remove preset, Remove queued message로 정했다. `aria-disabled`인 컨트롤에서는 툴팁이 이유를 보여 준다. 사이드바 행의 펼침 화살표(`shell-disclosure`)는 예외다. 트리 행의 일부일 뿐 따로 실행하는 명령이 아니기 때문이다. |
| D17 | renderer의 native `title`을 모두 공용 툴팁으로 바꾼다. iframe과 그려지지 않는 RightPanel은 뺀다. 이름은 잘렸을 때만 보이고, 정보성 내용은 항상 보인다. 정보성 내용은 캔버스 헤더의 경로, 앵커 칩 상세, Send를 쓸 수 없는 이유, 프리셋 설명, 프레임 행, Eye/Play 표시를 말한다. DESIGN 73의 PathTip 문장도 이에 맞게 고친다. 모달 dialog 안의 툴팁은 Portal `container`를 그 dialog로 지정해야 보인다. 내보내기 뷰어는 대상이 아니다. |
| D18 | New conversation 메뉴 행도 `SquarePen`으로 바꾼다. Stop 아이콘은 그대로 둔다(컴포저 Send 자리의 관례다). |
| D19 | 툴팁의 단축키는 키 칩(`doan-kbd`)으로 통일하고, 캔버스 헤더 툴팁을 바꾼다. |
| D20 | 알림의 동작 버튼은 알림 안(`.stacked`)으로 통일한다. 모서리 반경에는 작은 `--radius-*` 단계를 더한다: `--radius-inline` 4px, `--radius-word` 6px, `--radius-thumbnail` 25%. 내보내기 뷰어도 보고 있는 프레임을 Eye로 표시한다. |
| U35 범위 | 감사 목록만 고치지 않고, 타입 역할의 크기를 쓰면서 자간을 빠뜨린 규칙을 모두 고친다(약 55개). ds 테스트에 이를 잡는 검사를 더한다. |
| 제안 문구 | B1 캔버스의 U2, U14, D7, D8 문구를 그대로 승인했다. |
| 리드 정리 | 리드가 정리한 공통 규칙은 다음과 같다. 진행 중인 Retry는 알림·페이지 안에서는 채움과 "Retry" 라벨을 유지하고 스피너를 넣는다. 토스트에서만 "Retrying"을 쓴다. 쓸 수 없는 컨트롤의 커서는 `[aria-disabled="true"]` → `default` 규칙 하나로 처리하며, 질문 Send의 `progress`도 여기에 포함한다. |

## 7. 구현 배치

배치 하나를 컨덕터 하나가 맡는다. 리드 세션이 각 PR을 develop에 머지한다. 배치는 서로 고치는 파일이 되도록 겹치지 않게 나눴다. 다만 `styles.css`는 B2, B3, B5, B6이 함께 고친다. 그러니 이 넷을 동시에 돌리면 리드가 머지할 때 충돌을 풀어야 한다.

스타일이 바뀌는 항목은 배치별 캔버스에 as is / to be로 그렸다. 컨덕터는 이 캔버스를 to be의 기준으로 쓰고, `/runtime-test`나 `/design-sync`로 결과를 확인할 때 대조한다. B4는 문구만 바뀌므로 캔버스 없이 아래 항목을 기준으로 삼는다.

| 배치 | 브랜치 예 | 항목 | 캔버스 |
|---|---|---|---|
| B1 상태 판정·복구 | `fix/ux-state-recovery` | U1, U2, U3, U6(BACKLOG:164 제거), U8, U12, U13, U14, U15, D7, D8, D10 | `.doan/canvases/ux-audit-261117-b1.html` (U2, U14, U15, D7, D8, D10) |
| B2 포커스·처리 중 컨트롤 | `fix/ux-focus-busy` | U4, U5(내보내기 뷰어 포함), U9·D1, U10, U11, U28(버튼 안 스피너), D15 | `.doan/canvases/ux-audit-261117-b2.html` (D1·U9, U10, U11, U28, D15) |
| B3 알림·복구 표시 | `fix/ux-notices` | U7, U16, U30, U31, U38, U39, D11, D12, D13, D20(알림 동작 위치) | `.doan/canvases/ux-audit-261117-b3.html` (전 항목) |
| B4 문구 | `fix/ux-wording` | U17–U27, D2, D3(PRODUCT 문구 포함), D4, D5 | 없음 (문구만 바뀐다) |
| B5 컴포넌트 표현 | `fix/ux-components` | U29, U32, U33, U36, U40, U41, D18, D20(뷰어 Eye) | `.doan/canvases/ux-audit-261117-b5.html` (전 항목) |
| B6 툴팁·타입·토큰 | `fix/ux-tokens` | U34, U35, U37, D14, D16, D17, D19, D20(radius 토큰) | `.doan/canvases/ux-audit-261117-b6.html` (전 항목) |

- 각 배치는 마지막에 PRODUCT, ARCHITECTURE, DESIGN과 `docs/design/*.md`를 고쳐 지금 상태를 적는다(6절 결정 포함).
- 확인할 것:
  - 모든 배치: `/verify`.
  - 1절에 런타임 미확인으로 적힌 항목: 그 배치의 `/runtime-test`로 확인한다.
  - B4: 문구를 바꾼 뒤 `/agent-eval` 대상인지 확인한다. 대상은 CLI 출력이나 가이드가 바뀐 경우다.
- 권장 순서: B1과 B4를 먼저 진행한다. 이 둘은 `styles.css`를 거의 고치지 않아 다른 배치와 겹치지 않는다. 그다음 B2 → B3 → B5 → B6 순으로 진행한다. B2를 먼저 하는 이유는 B2의 스피너 규칙(U28)과 처리 중 패턴(D1)이 B3 알림 버튼의 기준이 되기 때문이다.

## 8. 범위 밖 관찰

UX 불일치는 아니지만 검토하다 본 것이다.

- `projectRow()`(`projectRow.ts:12-27`)에 옛 상태 이름("Not initialized", "Not found")이 남아 있다. 테스트에서만 호출한다.
- `folders:open` IPC와 그 네이티브 패널 제목 "Open Project…"(`main/index.ts:771`)는 renderer에서 부르는 곳이 없다.
- 그려지지 않는 Inspector의 CSS(`styles.css:134-175`, `.canvas-notice` 포함)와 `.pj-msg`, `.wt-actions`, `.glyph`가 남아 있다.
- `agentSetup/notice.ts:35-36`의 "Open the Doan in Applications…"는 문장이 어색하다. 비교할 대상이 없어 지적으로 세지 않았다.
