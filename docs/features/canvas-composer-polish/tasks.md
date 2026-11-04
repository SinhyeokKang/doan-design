# canvas-composer-polish — tasks

순서: 확인 → UI 초안 → 순수 함수 → 렌더러·main 배선 → 실제 앱 확인 → 문서 승격. 순수 함수(A)는 한 커밋으로 묶고, 배선(B)은 여섯 항목의 파일이 대부분 겹치지 않으므로 항목별로 커밋한다.

## T. 확인

- [ ] T1. 실제 앱에서 Presets 목록 두 개(Presets 버튼, `/`)를 열고 캔버스 iframe 안(선택 클릭, 픽 중 클릭, ⌥-클릭), 사이드바, 쓰레드를 눌렀을 때 닫히는지와 포커스가 어디로 가는지 기록한다(문제 1의 추론 확인). 결과로 design 1번의 캔버스 신호가 필요한지, 필요하면 기존 메시지로 충분한지 정하고 design 1번에 적는다.
  - 검증: `/runtime-test`의 짧은 probe(격리 userData·HOME). 결과 한 줄(한국어)을 이 파일에 적고, 스크린샷은 `.scratch/`에 둔다.

## U. UI 초안

- [ ] U0. `/design-draft`로 새 초안 `.doan/canvases/canvas-composer-polish.html`을 design '초안 요청'의 아홉 프레임대로 그린다(툴바, 보내는 중 메시지, Canvas conversations 행의 Delete, Home 이유 줄). 바뀌는 화면이 모두 main에 있고 이 feature는 redesign child가 아니므로 `/design-draft`의 범위 밖이지만, 사람이 이 feature에 한해 예외를 승인했다. 기존 초안은 고치지 않는다. 사람이 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 main과 같은 finding만 낸다, 사람의 확인.

── commit: `docs(design): draft canvas-composer-polish` ──

## A. 순수 함수

- [ ] A1. `/` 목록의 바깥 판정.
  - 검증: `npm --prefix app test` — 새 테스트 먼저 red, 구현 뒤 green(목록·필드 안 / 칩·트레이·카드 밖 바깥).
- [ ] A2. Send now 보내는 중 표시 목록(큐 줄과 쓰레드 항목).
  - 검증: `npm --prefix app test` — 누른 순간 큐에서 빠지고 쓰레드 끝에 칩·첨부와 함께 생김(열린 권한 요청 카드가 있으면 그 위), IPC 성공으로 사라짐(이벤트 먼저·응답 나중과 그 반대 순서), `not_running`·`stale`·`attachment_missing`·`bad_request`·턴 종료로 큐 원래 자리에 돌아옴, 두 줄을 연달아 Send now(누른 순서, 첫 줄 거절·둘째 줄 읽힘에서 원래 자리).
- [ ] A3. `projectBusy`(main)의 답 대기 제외, renderer의 시작 판정 술어(`holdsRoot`는 제거 확인용으로 그대로), `anotherConversation` 문구.
  - 검증: `npm --prefix app test` — `promotionTarget`이 snapshot 뒤 다른 대화에 붙은 캔버스를 빼고, 판정하지 않은 다른 턴의 snapshot에도 없는 새 캔버스면 null, 겹치지 않는 경우는 그대로, root에 live 턴이 둘 이상이면 Home이 자동 열기와 `drew`를 건너뜀, design 4번의 같은 상태 표로 두 쪽이 같은 답(답 대기만 허용, 준비·실행·10초 안 미판정·큐 전송 중은 막음), 답을 기다리는 대화만 있는 프로젝트의 `removalConfirm`은 지금처럼 멈춤 확인과 "needs your answer"를 냄, `project.test.ts`·`homeRun.test.ts`·`homeConversations.test.ts`·`homeComposer.test.ts`·`dockedRules.test.ts` 기존 기대값 갱신, `rendererImports.test.ts` 통과.
- [ ] A4. `canvasExportReason`.
  - 검증: `npm --prefix app test` — 행 읽기 오류·이 캔버스 내보내기 중·목록에 없는 페이지는 이유, 다른 캔버스 내보내기 중은 활성.
- [ ] A5. Canvas conversations 행 Delete 뒤 포커스 대상(`focusAfterLeave` 재사용, 확인 창을 열기 전에 계산).
  - 검증: `npm --prefix app test` — 다음 행, 마지막이면 앞 행, 하나뿐이면 패널 제목.

── commit: `feat: add canvas and composer polish rules` ──

## B. 배선

- [ ] B1. Presets 목록 두 곳에 바깥 닫기(T1 결과에 따라 캔버스 신호).
  - 검증: `npm --prefix app test`(`HomeComposerView.interaction.test.tsx`, `DockedComposer.interaction.test.tsx`, `ComposerParts.test.tsx`에 바깥 클릭 케이스: 필드 안은 열림 유지, 바깥 닫기 뒤 필드가 빌 때까지 다시 열리지 않음, 캔버스 신호로 닫을 때 포커스가 Presets 버튼으로 가지 않음; 새 canvas script 메시지를 더하면 `canvasMessage.test.ts`), typecheck.
- [ ] B2. Send now 쓰레드 이동(`conversationStore.ts`, `DockedComposer.tsx`, `ConversationThread.tsx`, `threadItems.ts`, `CanvasConversationPanel.tsx`·`overviewRun.ts`의 큐 항목, 첨부 표시 값이 모자라면 `conversation:queue` 응답).
  - 검증: `npm --prefix app test`(`DockedComposer.queue.test.tsx`, `ConversationThread.test.tsx`, `threadItems.test.ts`, `queueFocus.test.ts`, 새 `conversationStore.test.ts`: 칩·첨부를 가진 보내는 중 메시지, 열린 권한 요청 카드 위의 위치, 거절 문구가 계속 붙어 있는 live region으로 알려짐), typecheck.
- [ ] B3. 답 대기 admission, 겹친 턴의 promotion 제외와 Home 새 캔버스 처리(`project.ts`, `service.ts`, `homeRun.ts`, `homeConversations.ts`, `homeComposer.ts`, `dockedRules.ts`, `ProjectOverview.tsx`).
  - 검증: `npm --prefix app test`(`app/src/main/conversation/service.test.ts`: "refuses another project send while a project turn runs, waits for an answer, or just ended"와 "keeps counting a project turn that made a canvas…" 갱신, 한 턴이 권한 요청을 기다리는 동안 같은 root의 두 번째 시작·보내기가 성공, A가 답을 기다리는 동안 B가 X를 만들어 붙은 뒤 A가 끝나도 A가 X에 붙지 않고 B가 archive되지 않음, B가 X를 만들었지만 A가 먼저 판정되면 A는 project conversation으로 남고 뒤에 판정되는 B가 X에 붙음, 다른 턴이 실행 중일 때 끝난 턴의 큐가 `project_busy`로 초안에 돌아옴; `homeRun.test.ts`: live 턴이 둘 이상인 root의 새 캔버스는 열리지 않고 toast·`drew`도 없음), typecheck.
- [ ] B4. 툴바 Picker와 ⌘L(`CanvasTools.tsx`, `App.tsx`, `rightPanelOpen.ts`, `app/src/main/index.ts`, `app/src/main/menuState.ts`), Add to conversation 경로와 고아(`MenuInputs.selection`, `menuSelection`, `addReady`, `addSelection`, `focusOnOpen`, `AddTool`) 제거.
  - 검증: `npm --prefix app test`(`CanvasTools.test.tsx`, `rightPanelOpen.test.ts`, `canvasPicker.test.ts`, `App.conversationPanel.test.tsx`: 툴바·대화창 버튼이 같은 픽을 공유, 픽 중 Picker만 눌림, 픽 중 Select·Hand 클릭은 픽 취소와 도구 전환(V·H는 그대로 무시), 픽 뒤 이전 도구 복귀, 접힌 대화창 펼침 뒤 픽이 취소되지 않음, Esc 순서, 픽 뒤 포커스; `main/menuState.test.ts`: 선택 없이 캔버스에서 활성, Home·Overview·캔버스 없음에서 비활성; `main/index.test.ts`·`App.test.ts`의 메뉴 명령; 픽 중 ⌘L은 취소; 필드에 포커스가 있을 때의 ⌘L), typecheck.
- [ ] B5. 툴바 Export(`CanvasTools.tsx`, `App.tsx`, `ShellSidebar.tsx`의 이유 공유).
  - 검증: `npm --prefix app test`(`CanvasTools.test.tsx`: `aria-disabled`로 ←/→에 닿음, 저장 패널 취소 뒤 포커스가 Export로 돌아옴, 다른 캔버스 내보내기 중에는 활성, 페이지 잠금 중 아무것도 하지 않음; `App.canvasRowMenu.test.tsx`와 같은 export 경로), typecheck, `npm --prefix app run build`.
  - `docs/features/export-viewer-chrome/`의 `exportViewer.test.ts`가 `CanvasTools.tsx`의 키·순서(Select, Hand)를 비교한다. 두 feature 중 나중에 merge하는 쪽이 그 테스트를 Picker·Export에 맞춘다.
- [ ] B6. Canvas conversations 행 Delete(`CanvasConversationList.tsx`, `conversationDelete.ts`·`ConversationDeleteDialog`·`App.tsx`의 `confirmDelete` 재사용, `DeleteTarget.from`에 이 목록 추가).
  - 검증: `npm --prefix app test`(`CanvasConversationList.test.tsx`: 보임 조건, 특수 행 세 가지의 Delete, Tab으로 행과 Delete 사이 이동, working·답 대기의 이유, 확인 뒤 삭제와 목록에서 빠짐, 확인 뒤 포커스, Cancel·Esc 뒤 그 행의 Delete로 포커스; `App.conversationDelete.test.tsx`: 같은 삭제 경로, 그 사이 working이 된 대화는 toast와 함께 남음), typecheck.

── commit: 항목별 `feat: close the preset list on an outside click` / `feat: move a message sent now into the thread` / `feat: let a project conversation start while another waits for an answer` / `feat: turn the canvas toolbar's third tool into the Picker` / `feat: export from the canvas toolbar` / `feat: delete a conversation from Canvas conversations` ──

## C. 실제 앱 확인

- [ ] C1. `/design-sync`로 U0 초안의 화면(툴바, 보내는 중 메시지, Canvas conversations 행의 Delete, Home 이유 줄)을 구현과 맞추고 DESIGN.md에 측정값을 적는다. 사람이 승인한 예외(U0)라 이 초안이 merge까지 이 화면들의 기준이다. 보내는 중 메시지는 로그인한 provider가 필요하면 고정 history를 띄운 상태로 잰다.
  - 검증: `/design-sync` 보고의 측정 일치.
- [ ] C2. `/runtime-test`: 동작 확인. Presets 바깥 닫기(캔버스 클릭 포함)와 포커스, 툴바 Picker·⌘L·접힌 대화창·픽 중 Select/Hand, 툴바 Export(저장 패널 취소와 성공 toast), Home의 이유 줄, Canvas conversations 행 Delete(특수 행 포함). Send now와 답 대기 admission은 로그인한 provider가 필요하므로 provider 프로필이 있으면 함께, 없으면 unit 테스트로만 확인했다고 적는다.
  - 검증: `/runtime-test` 보고(스크린샷).
- [ ] C3. `node .agents/skills/verify/scripts/verify.mjs`.
  - 검증: exit 0.

`/agent-eval`은 생략한다. guide·CLI 출력·skill·`doan check` 규칙이 바뀌지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT: §3 In scope 8(Export를 여는 곳에 툴바), §5 item 1 'Home'·'Project conversations'(답 대기는 막지 않음, 이유 줄, 겹친 턴의 큐·promotion·Home 새 캔버스, Remove from Doan 확인은 그대로), Send now(누르면 칩·첨부와 함께 쓰레드로, 권한 요청 카드 위, 거절 때 큐로), §5 item 2 'Toolbar'(Select, Hand, Picker, Export, 픽 중에는 Picker만 눌림과 Select·Hand로 픽 취소), 'Notices and states'(Esc 순서는 그대로), 'Conversation panel' Opening(패널을 펼치는 입구의 Add to conversation), item 4의 선택 공유(Add to conversation), item 6(Picker와 ⌘L, Chips의 "Add to conversation are unavailable", Add to conversation 삭제), Presets 목록의 바깥 클릭과 Skills의 "The preset picker is on Home"(docked composer에도 있음), §5 item 3 'Project Overview'의 Canvas conversations 행 Delete(특수 행 포함).
  - ARCHITECTURE: §7 'Agent conversation runtime and IPC'의 `projectBusy` 문단(답 대기와 evidence 예외)과 promotion 문단(snapshot 뒤 다른 대화에 붙은 캔버스 제외)과 Send now 문단(줄이 쓰레드로 옮겨짐), T1 결과로 canvas script 메시지를 더했다면 §3의 메시지 설명.
  - DESIGN.md: C1 측정값과 초안 대비 차이, 'Canvas area and right panel'·'Canvas conversation panel'의 Tools row(Select, Hand, Picker, Export), 'Queued messages'의 Sending 상태 삭제와 쓰레드의 보내는 중 메시지, 상태 목록의 "blocked by another project conversation (running or waiting)", Canvas conversations 행의 Delete.
  - 그리고 `docs/features/canvas-composer-polish/`를 지운다.
  - 검증: `grep -n 'Add to conversation' docs/PRODUCT.md docs/DESIGN.md`에 줄이 없다, `grep -n 'Picker' docs/PRODUCT.md`에 툴바 규칙이 있다, `grep -n 'keeps those rows itself' docs/ARCHITECTURE.md`와 `grep -n 'running or waiting' docs/DESIGN.md`에 줄이 없다, `docs/features/canvas-composer-polish/`가 없다.

── commit: `docs(product): canvas and composer polish` / `docs(architecture): admission while waiting and Send now in the thread` / `docs(design): measure the canvas toolbar and Send now` / `docs(feature): remove canvas-composer-polish docs` ──
