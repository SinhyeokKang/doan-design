# canvas-capture — tasks

순서: PoC → UI 초안 → 순수 함수 → main IPC → 캡처 모드(컨트롤러) → 도구모음·composer UI → 실제 앱 확인 → 문서 승격. 결정은 design '결정'에 있다.

## P. PoC

- [ ] C1. 보이는 main window의 `capturePage(rect)`(design 'PoC 의존' C1 (a)–(e)). 격리된 실제 앱(임시 userData·HOME·SHELL·CLI·`DOAN_RUNTIME`, `app/runtime/` 지원)에서 일회성 스크립트 `.scratch/canvas-capture/`로 확인한다. 앱 코드는 바꾸지 않고, 숨김은 스크립트가 renderer에 속성과 CSS(`opacity: 0`)를 넣어 흉내 낸다. (d)의 깜빡임은 `capturePage`만이 아니라 PNG 저장과 `codec.thumbnail`까지 흉내 낸 왕복 전체로 잰다. 결과(Electron 버전, 이미지 크기, 배율, 걸린 시간, 깜빡임 ms, 앱 표시가 빠진 스크린샷, 날짜)는 이 파일 아래 'P 결과'에 적는다.
  - 검증: `/runtime-test` 방식의 격리 probe. 'P 결과'에 (a)–(e)의 판정과 스크린샷 경로가 있다. (a)나 (b)가 실패하면 여기서 멈추고 design 결정 1(화면 픽셀)을 사람에게 다시 묻는다. 결정이 바뀌면 design과 이 파일을 다시 쓴 뒤 D1로 간다.

## D. UI 초안

- [ ] D1. `/design-draft canvas-capture`: design §4의 상태를 `.doan/canvases/canvas-capture.html`에 그린다(도구모음 상태, 캡처 모드 대기·드래그, 접힌 패널, composer 칩·실패·상한). 아이콘, marquee 모양, 안내 줄의 모양과 문구(줄 자체는 있어야 한다, spec 완료 조건 2), 크기 표시 여부, 쓸 수 없을 때의 문구를 여기서 정한다. 캡처에 앱 메뉴 막대 항목(Edit > Pick from Canvas 같은 것)을 둘지도 여기서 사람에게 묻고 정한다(design 결정 5). 사람이 앱에서 초안을 확인한다.
  - 검증: `doan check`와 `doan ls`가 초안을 오류 없이 보이고, 사람이 확인했다. 메뉴 막대 항목을 둘지에 대한 사람의 답이 design 결정 5에 적혀 있다.

커밋 경계: D1(초안 캔버스).

## A. 순수 함수(`/tdd` → `/implement`)

- [ ] A1. `captureRect`, `captureAvailability`(새 `app/src/renderer/canvasCapture.ts`)와 `escapeStep`의 `capturing`(`canvasTool.ts`). design '순수 함수' 1–3.
  - 검증: `npm --prefix app test`에서 `canvasCapture.test.ts`, `canvasTool.test.ts`가 통과한다(새 테스트가 구현 전에 red였음을 기록).
- [ ] A2. `attachmentChipView`와 `movedNotice`의 "Canvas capture" 이름(`homeComposer.ts`, `pasted`이고 이름이 `canvas-capture-`로 시작할 때). design '순수 함수' 8.
  - 검증: `npm --prefix app test`에서 `homeComposer.test.ts`가 통과한다. `canvas-capture-`로 시작하는 붙여 넣은 칩, 같은 이름의 경로 첨부(`pasted: false`, 파일 이름 그대로), 다른 붙여 넣은 이미지("Pasted image")를 모두 다룬다.
- [ ] A3. main의 `captureRequest`, `capturedName`, `AttachmentStore.addCaptured`(`attachments.ts`, `addPasted`와 저장 부분 공유). design '순수 함수' 5–7.
  - 검증: `npm --prefix app test`에서 `attachments.test.ts`가 통과하고, 기존 `addPasted` 테스트도 그대로 통과한다.

커밋 경계: A1·A2(renderer 순수 함수), A3(main 저장).

## B. main IPC

- [ ] B1. `attachments:capture` handle(`index.ts`, `fromWindow`), `senderAllowed.ts` 허용 목록, preload `captureCanvas`, `AttachmentError`의 `capture_failed`. design §1.
  - 검증: `npm --prefix app test`에서 `attachments.test.ts`의 `senderAllowed("attachments:capture", "main")`이 true, 다른 창 종류가 false이고(`WindowKind`는 `"main"`뿐이므로 기존 테스트처럼 `"settings"` 문자열로 확인한다), `npm --prefix app run typecheck`가 통과한다.

커밋 경계: B1.

## C. 캡처 모드

- [ ] C2. `CanvasController`의 `capturing` 상태, `.capture-layer`, 드래그와 marquee, 스냅숏 속성(`opacity: 0`)과 두 번의 rAF, `pointerup`에서 캡처 모드를 바로 끝냄, 끝나는 조건(캔버스 페이지를 떠남 포함), pick과의 배타, Esc, V·H·Space 무시, `boardDrawn()`의 `!capturing`(Hand drag layer 내림), reload 중의 `pointerup`, `pointercancel`·`lostpointercapture`·앱 blur는 드래그만 버림, `hover-leave`, `pointerup` 뒤에 레이어 내림. design §2.
  - 검증: `npm --prefix app test`에서 `CanvasController.test.ts`의 새 'capture' 묶음이 통과한다. 다음 변형이 red다: 레이어를 `pointerup` 전에 내림, `hover-leave`를 뺌, V·H·Space를 받음, `boardDrawn()`에서 `!capturing`을 뺌(Hand에서 drag layer가 올라옴), reload 중의 `pointerup`이 스냅숏을 찍음, `pointercancel`이나 blur가 캡처 모드를 끝냄, 캔버스 페이지를 떠나도 캡처 모드가 남음.

커밋 경계: C2.

## E. 도구모음·composer UI

- [ ] E1. `CanvasTools.tsx`의 캡처 버튼(자리, pressed, `aria-disabled`, 이유 `sr-only`), App의 `captureAvailability` 연결과 터미널 세션 상태 꺼내기, page lock 처리. design §3.
  - 검증: `npm --prefix app test`에서 `CanvasTools.test.tsx`(순서, 이름, pressed 규칙, 이유)와 App 테스트가 통과한다.
- [ ] E2. 스냅숏 시작 때 `attachmentLimit`으로 첨부 상한 다시 확인(쓸 수 있는지는 render 때 정해지고 main `resolve`는 10개를 넘으면 `bad_request`), 캡처 결과를 `composerKey`의 draft에 넣기(checking 칩 → `settleAttachments`), 패널 펼침과 composer 포커스, `ATTACH_ERRORS.capture_failed`(`conversationStore.ts`)와 실패 toast, `styles.css`의 레이어·marquee·`[data-capture-snapshot]` 규칙. 새 z-index가 있으면 `ds/controls.test.ts`에 넣는다(POSTMORTEM 2026-11-02 'Every Overview menu opened under the Overview itself').
  - 검증: `npm --prefix app test`에서 `App.conversationPanel.test.tsx`의 캡처 칩 경우(성공, `capture_failed`가 "Couldn’t capture the canvas. Try again." toast를 보임, 상한, render 뒤 첨부가 10개가 된 경쟁에서 스냅숏을 찍지 않음, 터미널 세션과 레거시 외부 대화의 `fixed`)와 `ds/controls.test.ts`가 통과한다. `npm --prefix app run typecheck`와 `npm --prefix app run build`가 통과한다.

커밋 경계: E1, E2.

## F. 실제 앱 확인

- [ ] F1. `/runtime-test`: 격리된 실제 앱에서 Select와 Hand 각각에서 캡처 모드 → 드래그 → composer 칩(썸네일) → 보내기(Hand에서 시작하면 Hand로 돌아감), Esc 취소, 작은 드래그, reload 중 캡처, 접힌 패널, 선택이 있는 상태와 점프 하이라이트 직후, 캡처 모드 중 zoom 메뉴 열기(portalled 메뉴), 터미널 세션·레거시 외부 대화에서 쓸 수 없음, 캡처 모드 중 Overview로 이동(캡처 모드가 끝남)을 확인한다. 이미지에 앱 표시가 없음을 스크린샷 비교로 판정한다. 보낸 첨부는 대화 기록의 attachment descriptor로 확인한다(provider sign-in 없이 main IPC를 바꾼 fixture로 해도 된다).
  - 검증: `/runtime-test` 보고서에 각 경우의 통과·실패와 `.scratch/runtime-test/` 증거 경로가 있다.
- [ ] F2. `/design-sync`: 구현을 D1 초안과 computed style로 비교하고 맞춘다. 측정값을 `docs/DESIGN.md`에 기록한다.
  - 검증: `/design-sync` 보고서에 차이 0 또는 문서화한 차이만 있고, DESIGN.md 'Canvas area and right panel'(또는 새 절)에 측정값이 있다.
- [ ] F3. 공유 gate.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.

커밋 경계: F2(design-sync 수정과 DESIGN.md).

## Z. 문서 승격(마지막)

- [ ] Z1. 결론을 현재 규칙으로 영문 승격하고(근거는 커밋 메시지) `docs/features/canvas-capture/`를 지운다.
  - `docs/PRODUCT.md`: §3 In scope 2 'Let humans point'(지금은 칩만 적혀 있다. 캔버스 캡처 이미지를 더한다), §5 item 2 'Opening' 목록(캡처는 이미지가 composer에 들어갈 때 접힌 패널을 펼친다), §5 item 2 'Toolbar'(구성, 캡처 모드 규칙, pick과의 관계), 'Notices and states'(Esc 순서에 캡처 모드), item 1 'Attachments'(캡처 이미지 저장 규칙), 필요하면 item 6 'Point in a conversation'(칩 밖의 가리키기 수단). §5 'Deferred'의 "Screenshots"가 에이전트 쪽 기능임을 한 구절로 밝힌다.
  - `docs/ARCHITECTURE.md`: §3 'Canvas view' 'Input'(캡처 레이어 자리, 스냅숏 숨김, `pointerup` 순서), §7 'Attachments'(`attachments:capture`, `addCaptured`, 신뢰 경계).
  - `docs/BACKLOG.md`: 확인하지 못한 표면(예: 다른 배율 모니터, 실제 provider로 보낸 캡처를 Claude Code·Cursor가 읽는지)이 있으면 적는다.
  - 검증: `/doc-check`로 PRODUCT·ARCHITECTURE·BACKLOG를 확인해 승격한 문장과 코드가 맞고, 지운 `docs/features/canvas-capture/`를 가리키는 링크가 남지 않았다.

커밋 경계: 문서마다 하나(AGENTS.md 'Split commits per document').

## P 결과

(C1 뒤에 적는다.)
