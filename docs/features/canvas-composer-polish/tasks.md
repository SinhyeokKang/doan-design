# canvas-composer-polish — tasks

순서: 확인 → UI 초안 → 순수 함수 → 렌더러·main 배선 → 실제 앱 확인 → 문서 승격. 다섯 항목은 파일이 대부분 겹치지 않으므로 커밋 경계를 항목별로 둔다.

## T. 확인

- [ ] T1. 실제 앱에서 Presets 목록 두 개(Presets 버튼, `/`)를 열고 캔버스 iframe 안, 사이드바, 쓰레드를 눌렀을 때 닫히는지 기록한다(문제 1의 추론 확인). 결과로 design 1번의 캔버스 신호가 필요한지 정한다.
  - 검증: `/runtime-test`의 짧은 probe(격리 userData·HOME), 스크린샷과 결과 한 줄을 이 파일에 적는다.

## U. UI 초안

- [ ] U0. `/design-draft`로 새 초안 `.doan/canvases/canvas-composer-polish.html`을 그린다: 툴바(Select, Hand, Picker, 구분선, Export)의 기본·픽 중·비활성 상태, Send now 뒤 쓰레드 끝의 보내는 중 메시지와 거절로 큐에 돌아온 줄, Home의 이유 줄, Overview Canvas conversations 행의 Delete(보임·비활성 이유). 기존 캔버스 초안은 고치지 않는다. 사람이 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 base와 같은 finding만 낸다, 사람의 확인.

── commit: `docs(design): draft canvas-composer-polish` ──

## A. 순수 함수

- [ ] A1. Presets 바깥 판정과 `/` 목록 dismissed 갱신.
  - 검증: `npm --prefix app test` — 새 테스트 먼저 red, 구현 뒤 green(목록·트리거·portal 안 / 바깥 / 캔버스 신호, 바깥 닫기 뒤 필드가 빌 때까지 다시 열리지 않음).
- [ ] A2. Send now 보내는 중 표시 목록(큐 줄과 쓰레드 항목).
  - 검증: `npm --prefix app test` — 누른 순간 큐에서 빠지고 쓰레드 끝에 생김, 같은 id `user.message`로 사라짐, 거절·`not_running`·`stale`·턴 종료로 큐 원래 자리에 돌아옴, 두 줄을 연달아 Send now.
- [ ] A3. `projectBusy`(main)와 `holdsRoot`(renderer)의 답 대기 제외, `anotherConversation` 문구.
  - 검증: `npm --prefix app test` — 같은 상태 표로 두 함수가 같은 답(답 대기만 허용, 준비·실행·10초 안 미판정·큐 전송 중은 막음), `project.test.ts`·`homeRun.test.ts`·`homeConversations.test.ts`·`homeComposer.test.ts` 기존 기대값 갱신, `rendererImports.test.ts` 통과.
- [ ] A4. `toolbarPicker`와 `canvasExportReason`.
  - 검증: `npm --prefix app test` — 접힌 대화창은 활성, `pickerAvailability`의 비활성 이유 전달, 행 읽기 오류·내보내기 중·목록에 없는 페이지.

- [ ] A5. Canvas conversations 행 Delete 뒤 포커스 대상.
  - 검증: `npm --prefix app test` — 다음 행, 마지막이면 앞 행, 하나뿐이면 목록 머리.

── commit: `feat: add canvas and composer polish rules` ──

## B. 배선

- [ ] B1. Presets 목록 두 곳에 바깥 닫기(필요하면 캔버스 pointerdown 신호).
  - 검증: `npm --prefix app test`(`HomeComposerView.interaction.test.tsx`, `DockedComposer.interaction.test.tsx`, `ComposerParts.test.tsx`에 바깥 클릭 케이스), typecheck.
- [ ] B2. Send now 쓰레드 이동(`conversationStore.ts`, `DockedComposer.tsx`, `ConversationThread.tsx`, `threadItems.ts`).
  - 검증: `npm --prefix app test`(`DockedComposer.queue.test.tsx`, 쓰레드 테스트, `queueFocus.test.ts`), typecheck.
- [ ] B3. 답 대기 admission(`project.ts`, `service.ts`, `homeRun.ts`, `homeConversations.ts`).
  - 검증: `npm --prefix app test`(`service.test.ts`의 "refuses another project send while a project turn runs, waits for an answer, or just ended" 갱신, 답을 받은 뒤 겹친 두 턴의 promotion 케이스), typecheck.
- [ ] B4. 툴바 Picker와 ⌘L(`CanvasTools.tsx`, `App.tsx`, `rightPanelOpen.ts`, 메뉴 명령), Add to conversation 경로 제거.
  - 검증: `npm --prefix app test`(`CanvasTools.test.tsx`, `rightPanelOpen.test.ts`, pick 테스트: 툴바·대화창 버튼이 같은 픽을 공유, 접힌 대화창 펼침, Esc 순서), typecheck.
- [ ] B5. 툴바 Export(`CanvasTools.tsx`, `App.tsx`, `ShellSidebar.tsx`의 이유 공유).
  - 검증: `npm --prefix app test`(`CanvasTools.test.tsx`, `App.canvasRowMenu.test.tsx`와 같은 export 경로), typecheck, `npm --prefix app run build`.

- [ ] B6. Canvas conversations 행 Delete(`CanvasConversationList.tsx`, 제목 메뉴의 Delete·확인·삭제 경로 재사용).
  - 검증: `npm --prefix app test`(`CanvasConversationList.test.tsx`: 보임 조건, working·답 대기의 이유, 확인 뒤 삭제와 목록에서 빠짐, 포커스), typecheck.

── commit: 항목별 `feat: close the preset list on an outside click` / `feat: move a message sent now into the thread` / `feat: let a project conversation start while another waits for an answer` / `feat: turn the canvas toolbar's third tool into the Picker` / `feat: export from the canvas toolbar` / `feat: delete a conversation from Canvas conversations` ──

## C. 실제 앱 확인

- [ ] C1. `/design-sync`로 툴바와 쓰레드의 보내는 중 메시지를 초안과 맞추고 DESIGN.md에 측정값을 적는다.
  - 검증: `/design-sync` 보고의 측정 일치.
- [ ] C2. `/runtime-test`: Presets 바깥 닫기(캔버스 클릭 포함), 툴바 Picker·⌘L·접힌 대화창, 툴바 Export(저장 패널 취소와 성공 toast), Home의 이유 줄, Canvas conversations 행 Delete. Send now와 답 대기 admission은 로그인한 provider가 필요하므로 provider 프로필이 있으면 함께, 없으면 unit 테스트로만 확인했다고 적는다.
  - 검증: `/runtime-test` 보고(스크린샷).
- [ ] C3. `node .agents/skills/verify/scripts/verify.mjs`.
  - 검증: exit 0.

`/agent-eval`은 생략한다. guide·CLI 출력·skill·`doan check` 규칙이 바뀌지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT: §3 In scope 8(Export를 여는 곳에 툴바), §5 item 1 'Home'·'Project conversations'(답 대기는 막지 않음, 이유 줄, 겹친 턴), Send now(누르면 쓰레드로, 거절 때 큐로), §5 item 2 'Toolbar'(Select, Hand, Picker, Export), 'Notices and states'(Esc 순서는 그대로), item 6(Picker와 ⌘L, Add to conversation 삭제), Presets 목록의 바깥 클릭, §5 item 3 'Project Overview'의 Canvas conversations 행 Delete.
  - DESIGN.md: C1 측정값, 툴바와 쓰레드 항목.
  - 그리고 `docs/features/canvas-composer-polish/`를 지운다.
  - 검증: `grep -n 'Add to conversation' docs/PRODUCT.md docs/DESIGN.md`에 줄이 없다, `grep -n 'Picker' docs/PRODUCT.md`에 툴바 규칙이 있다, `docs/features/canvas-composer-polish/`가 없다.

── commit: `docs(product): canvas and composer polish` / `docs(design): measure the canvas toolbar and Send now` / `docs(feature): remove canvas-composer-polish docs` ──
