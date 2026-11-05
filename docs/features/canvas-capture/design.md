# canvas-capture — design

용어는 spec과 같다: **캡처 도구**(도구모음 버튼), **캡처 모드**(그 버튼이 눌린 상태), **캡처 영역**(드래그한 사각형). 여기에 **캡처 레이어**(캡처 모드 동안 보드를 덮어 포인터를 받는 투명 요소)와 **스냅숏**(포인터를 놓은 뒤 픽셀을 읽는 짧은 순간)을 더한다.

사람이 정한 점은 맨 끝 '결정'에 있다.

## 영향받는 구성 요소

app(Electron + TS)만 바뀐다. CLI(Go), skills, 공유 포맷(comment event, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지)은 바뀌지 않는다.

### 1. main: 캡처 IPC와 저장

- **채널.** `attachments:capture`를 `app/src/main/index.ts`에 `handle`로 더하고 `fromWindow(event)`로 막는다. `app/src/main/senderAllowed.ts`의 허용 목록에 넣어 main window의 main frame만 부를 수 있게 한다(ARCHITECTURE §7 'Settings IPC' 'Boundary'). preload에 `captureCanvas(rect)`를 더한다.
- **요청.** `{ rect: { x, y, width, height } }`, main window content 기준 CSS px. main은 키가 정확히 이것뿐인지, 모두 유한한 수인지, 너비·높이가 최소 크기 이상인지, `win.getContentSize()` 안에 있는지 확인하고 정수로 맞춘다(`captureRequest`, 순수 함수). 어긋나면 `null`을 돌려준다(다른 `attachments:*` 채널의 잘못된 요청과 같다).
- **캡처.** `win.webContents.capturePage(rect)`. 화면 배율(Retina 2배)의 이미지를 그대로 쓰고 줄이지 않는다. 빈 이미지(`isEmpty()`)는 `capture_failed`다. `AttachmentError`에 `capture_failed`를 더한다.
  - 보드 iframe은 cross-site sandbox iframe(OOPIF)이다. `capturePage`가 이런 iframe을 포함한다는 것은 Overview 썸네일이 이미 보인다(숨은 창의 `data:` host 안 `127.0.0.1` iframe, ARCHITECTURE §3 'Capture document'). 보이는 main window에서 같은지는 PoC C1에서 확인한다.
- **저장.** `AttachmentStore.addCaptured(png)`. `addPasted`의 저장 부분(디렉터리 `0o700`, 파일 `0o600`·`wx`, 실패 시 디렉터리 삭제, `realpath`, `lstat`)을 private 함수 하나로 빼서 둘이 같이 쓴다. `capturePage`가 이미 PNG를 주므로 signature 검사와 재인코딩은 하지 않고, 50 MB 상한(`MAX_IMAGE_BYTES`)만 검사한다. 파일 이름은 `canvas-capture-<ISO 시각>.png`(`capturedName`, `pastedName`과 같은 모양)다. entry는 `pasted: true`(main이 쓴 사본이라 보내기 전 칩을 지우면 파일도 지운다, 실행 시작 때 `sent` 표시 없는 디렉터리를 지운다)다. `AttachmentInfo`와 `AttachmentRecord`에는 필드를 더하지 않는다. renderer는 `pasted`와 파일 이름으로 캡처 칩을 알아본다(§3 '칩'). 새 필드는 칩까지 가지 못한다: `settleAttachments`(`conversationStore.ts`)는 답의 일부만 draft에 옮기고, `AttachmentDraft`(`homeComposer.ts`)에는 그 자리가 없으며, `recheck`는 `info()`를 Entry에서 다시 만든다(`attachments.ts`).
- **신뢰 경계.** 사각형은 renderer가 자기 캡처 레이어에서 받은 포인터 이벤트로만 만든다. canvas 메시지(`parseCanvasMessage`)는 캡처를 시작하거나 사각형을 정할 수 없다(ARCHITECTURE §3 'Untrusted messages'). main은 사각형이 보드 안인지 모르므로 창 안인지만 확인한다. renderer는 main window main frame이고 이미 다른 첨부 경로를 정한다.

### 2. renderer: 캡처 모드(`CanvasController`)

- **상태.** `CanvasState`에 `capturing: boolean`을 더하고 `picking`처럼 `publish()`한다. `startCapture()`, `cancelCapture()`를 둔다. pick과 캡처 모드는 동시에 켜지지 않는다. 하나를 시작하면 다른 하나를 취소한다.
- **캡처 레이어.** `section.area` 안 `.drag-layer` 바로 뒤에 `.capture-layer`를 둔다. 자리는 drag layer와 같다: 보드와 iframe 위, agent notice·`.canvas-status`·도구모음 아래(DESIGN 'Drag layer'). 그래서 Stop, Open, Reload, 도구모음은 캡처 모드에서도 눌린다. 레이어는 `.area`의 DOM 자식이라 휠이 `wheelOnMargin`에 닿는다. 일반 휠은 보드를 패닝하고 ⌘·Ctrl 휠은 확대한다.
  - 레이어가 올라오면 hover를 지우고 `hover-leave`를 보낸다. drag layer와 같은 이유다(POSTMORTEM 2026-10-23).
  - 레이어는 컨트롤러가 직접 다룬다(drag layer처럼 키·포인터마다 React를 다시 그리지 않는다).
- **드래그.** 주 버튼 `pointerdown`에서 pointer capture를 잡고, `pointermove`마다 `.area` 기준 사각형(`captureRect`)으로 표시 사각형(marquee)을 그린다. 사각형은 `.area` 경계 안으로 잘린다. 드래그 중의 휠 패닝은 화면 좌표의 사각형을 바꾸지 않는다. 놓는 순간 그 아래 보이는 것을 찍는다.
- **놓을 때.** `pointerup`에서 `captureRect`가 `null`이면(최소 크기 미만, 클릭) 아무것도 하지 않고 캡처 모드를 유지한다. reload가 진행 중일 때(`state.reloading`, `CanvasController.ts`: reload는 iframe을 새 것으로 바꾸고 새 문서가 layout되기 전이다)도 같다. 아니면 캡처 모드를 바로 끝내 그 전 도구로 돌리고(결정 2) 스냅숏을 찍는다. 그 뒤의 진행은 composer의 "Checking" 칩이, 실패는 toast가 보인다(§3). 레이어는 `pointerup`을 처리한 뒤에 내린다. 먼저 내리면 `pointerup`이 iframe에 떨어져 선택 클릭이 된다(ARCHITECTURE §3 'Input').
- **드래그만 버림.** `pointercancel`, `lostpointercapture`, 앱의 blur(`appBlur` → `releaseInput`, 앱 전체가 포커스를 잃을 때)는 진행 중인 드래그와 marquee만 버리고 캡처 모드를 유지한다.
- **스냅숏.** 문서 루트에 `data-capture-snapshot`을 달면 CSS가 앱 표시를 숨긴다: `.overlay`(선택·hover·점프 하이라이트·dimension), marquee, `.doan-canvas-top`, `.doan-canvas-bottom`(도구모음과 캡처 안내 줄을 함께 담는다, `App.tsx`), agent glow와 점, toast 영역, 열린 portal 표면 전체(`[data-radix-popper-content-wrapper]`: tooltip, 메뉴, 헤더의 usage popover). 숨김은 `opacity: 0`이라 레이아웃이 움직이지 않고, 포커스를 가진 요소(예: 도구모음의 캡처 버튼)도 포커스를 잃지 않는다. `visibility: hidden`은 포커스를 떨어뜨린다(POSTMORTEM 2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'). 두 번의 `requestAnimationFrame` 뒤 `captureCanvas`를 부르고, 답이 오면(성공·실패·throw 모두) 속성을 지운다. 답은 main이 PNG를 저장하고 `codec.thumbnail`로 썸네일을 만든 뒤에 온다(`attachments.ts`의 `info`). 그래서 숨김은 `capturePage`보다 길게 이어진다. 사각형은 `.area`의 `getBoundingClientRect()`를 더해 창 좌표로 바꾼다. 숨김이 눈에 띄게 깜빡이는지는 PoC C1에서 잰다.
- **끝나는 때.** 캡처 버튼을 다시 누름, Esc, 도구모음의 Select·Hand(그 도구로 바뀜), pick 시작, 보드가 더 그려지지 않음(status가 생김, 목록에 없는 페이지, 프로젝트 문제), 캔버스 전환이나 닫힘, 캔버스 페이지를 떠남(Home, Overview, Settings, modal: 지금 pick을 취소하는 `setWorkspaceActive`와 같은 자리), 캡처할 영역으로 포인터를 놓음. 같은 canvas ID의 reload와 이동은 캡처 모드를 유지하고, 진행 중인 드래그도 그대로다(레이어가 앱 것이므로). 끝나면 그 전 도구가 다시 눌린다(`tool`은 캡처 모드 동안 바뀌지 않는다).
- **drag layer.** `boardDrawn()`에 pick처럼 `!capturing`을 더한다. 지금 drag layer는 `tool === "hand"`이면 늘 올라오므로(`syncLayer`), 이것이 없으면 Hand에서 시작한 캡처 모드에서 두 레이어가 함께 올라온다.
- **안내 줄.** 캡처 모드 동안 `.doan-canvas-bottom` 안 도구모음 위에 Picker 안내(`doan-picking`)처럼 `role="status"` 한 줄을 둔다. Esc 표시(`doan-kbd`)와 `sr-only` "Press Escape to cancel"을 갖는다. spec 완료 조건 2가 요구하고, 모양과 문구만 `/design-draft`가 정한다.
- **키.** Esc는 `escapeStep`에서 pick과 같은 단계에서 캡처 모드를 끝낸다. 포커스가 어디 있든(composer, 캔버스, 패널) 끝난다. 드래그 중의 Esc는 드래그와 캡처 모드를 함께 끝낸다. V·H와 Space는 캡처 모드에서 무시된다. 포커스가 iframe 안에 있을 때의 Esc는 주입 스크립트가 이미 `key` 메시지로 보낸다(`canvasScript.ts`).
- **선택.** 캡처 모드는 선택을 지우지 않는다. 레이어가 클릭을 막으므로 선택이 바뀌지 않고, 선택 테두리는 스냅숏에서만 숨는다. `doan active`는 그대로다.

### 3. renderer: 도구모음과 composer

- **`CanvasTools.tsx`.** `CaptureTool { enabled: boolean; reason: string | null; onToggle(): void }` prop을 더한다. 버튼은 Picker 다음, 구분선 앞이다(결정 9). `aria-label`과 tooltip은 "Capture area", `aria-pressed={capturing}`, 쓸 수 없으면 `aria-disabled`와 Export처럼 `sr-only` 이유와 `aria-describedby`를 둔다. pressed 규칙은 "pick이나 캡처 모드가 아니고 그 도구일 때"로 넓힌다. 캡처 모드 동안 캡처 버튼이 Tab 자리를 갖는다. 아이콘은 `/design-draft`에서 정한다(lucide 안에서).
- **쓸 수 있는지(`captureAvailability`).** 우선순위: 캔버스를 보일 수 없음(App이 패널의 composer를 모를 때, 곧 `panelTarget`이나 `composerKey`가 `null`일 때를 포함한다. Picker는 이때 `PICKER_UNAVAILABLE`을 쓴다) → composer가 입력을 받지 않음(그 이유 문구, App의 `panelBlocked`) → composer가 Attach를 막는 상태(`fixed`) → 첨부 10개. 문구 제안(최종은 `/design-draft`):
  - "Capture isn’t available while the canvas can’t be shown."
  - 터미널 세션: 지금 Attach 버튼의 "Files can’t be attached to a terminal session"을 그대로 쓴다(`DockedComposer.tsx`).
  - 첨부 10개: "Only 10 files can be attached. Remove one to add another."
- **App 연결.** App이 `pickerAvailability` 옆에서 `captureAvailability`를 계산한다. 입력은 `panelTarget`·`composerKey`가 있는지, `panelBlocked`, `canvasLoad`, `composerKey`의 draft 첨부 수, 패널의 `fixed`다. `fixed`는 지금 `CanvasConversationPanel` 안의 `const fixed = mode.kind === "resume" || summary?.owner === "legacy-external"`이고, 같은 값이 Attach 버튼을 막고(`DockedComposer.tsx`의 `props.fixed`) `addFiles`를 멈춘다(`if (fixed) return`). App이 같은 값을 읽을 수 있게 꺼낸다(방법은 구현 때 정한다). 이유 문구는 바뀌지 않는다. page lock 동안 버튼은 포커스를 받되 아무것도 하지 않는다(Export와 같음).
- **composer에 넣기.** 스냅숏을 시작할 때 App이 첨부 상한을 다시 확인한다. 쓸 수 있는지는 render 때 정해지고, 그 뒤 첨부가 늘었을 수 있다(main의 `resolve`는 10개를 넘으면 `bad_request`를 돌려준다). `attachmentLimit`(`homeComposer.ts`)이 받지 않으면 스냅숏을 찍지 않고 그 notice를 toast로 보인다. 받으면 `composerKey`의 draft(`overviewRun.current.store`, 패널과 같은 store)에 "checking" 첨부 칩을 key 하나로 넣고(`pasted: true`, 이름은 `canvas-capture-`로 시작해 checking 동안에도 "Canvas capture"로 보인다), 답이 오면 `settleAttachments`로 칩을 확정한다(`CanvasConversationPanel`의 `addFiles`와 같은 길, "each answer lands on its chip wherever the draft is now"). 그 뒤 패널을 펼치고 composer에 포커스를 준다(`panelArrivals`, Picker의 진입과 같은 길). 펼침은 칩을 넣을 때 한다(결정 10).
- **칩.** `attachmentChipView`와 `movedNotice`(`homeComposer.ts`)는 `pasted`이고 이름이 `canvas-capture-`로 시작하면 "Pasted image" 대신 "Canvas capture"를 쓴다. 지우기 이름은 "Remove canvas capture"다(결정 8). 형식 표시는 붙여 넣은 이미지처럼 "PNG · <크기>"다. draft의 칩은 `name`과 `pasted`를 이미 갖고 있으므로 큐에 넣었다가 돌아온 칩도 같은 이름을 보인다. 보낸 메시지의 칩과 Edit on Home으로 다시 받은 칩은 기록의 파일 이름(`canvas-capture-….png`)을 보인다.
- **실패.** `conversationStore.ts`의 `ATTACH_ERRORS`에 `capture_failed: () => "Couldn’t capture the canvas. Try again."`을 더한다. 없으면 `settleAttachments`가 `unreadable` 문구로 떨어진다. 답이 `capture_failed`·`too_large`·`unreadable`이면 칩을 지우고, `settleAttachments`가 돌려준 notice를 패널의 알림으로 보인다. 패널의 `onNotice`는 App에서 `toast.show`로 가므로 한 줄 toast다: "Couldn’t capture the canvas. Try again." / 지금의 50 MB 문구 / 지금의 저장 실패 문구. 보드 notice로 보이지 않는다. 캡처 모드는 이미 `pointerup`에서 끝났다(결정 2).
- **CSS(`styles.css`).** `.capture-layer`(crosshair), marquee, `[data-capture-snapshot]` 숨김 규칙. 모양은 `/design-draft`가 정한다. `.area`의 `overflow: clip`은 그대로다.

### 4. UI 상태(`/design-draft` 입력)

도구모음: 기본, 캡처 모드(캡처 버튼만 pressed), 쓸 수 없음(이유 셋), Hand에서 시작한 캡처 모드. 보드: 캡처 모드 대기(crosshair, 안내 줄. 안내 줄은 있어야 하고 draft는 모양과 문구만 정한다, §2 '안내 줄'), 드래그 중(marquee, 크기 표시를 둘지는 draft가 정한다), 접힌 패널에서의 캡처. composer: 캡처 칩 checking·ready, 첨부 10개. 실패 toast.

정하지 않은 점: 캡처에 앱 메뉴 막대 항목(Edit > Pick from Canvas 같은 것)을 둘지는 `/design-draft`에서 정한다(결정 5). 비목표가 아니다.

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. `captureRect(start, end, bounds)` → `Rect | null`(renderer, 새 `app/src/renderer/canvasCapture.ts`). 방향을 정규화하고, `bounds` 안으로 자르고, 정수로 맞추고, 자른 뒤 너비나 높이가 최소 크기(8 CSS px, 결정 6) 미만이면 `null`.
2. `captureAvailability({ canvas, composer, fixed, attachments })` → `{ enabled, reason }`(같은 파일). 위 우선순위와 문구. App이 패널의 composer를 모를 때는 `canvas`가 보일 수 없음과 같은 값으로 들어온다.
3. `escapeStep`(`canvasTool.ts`)에 `capturing`을 더한다. `capturing`이면 `cancelCapture`, pick과 같이 편집 필드 여부와 관계없다.
4. 도구모음 pressed 규칙(`CanvasTools.test.tsx`에서 정적 markup으로): pick·캡처 모드일 때 Select·Hand는 눌리지 않는다.
5. `captureRequest(value, contentSize)` → 정수 `Rect | null`(main, `app/src/main/attachments.ts`). 정확한 키, 유한성, 최소 크기, 창 안.
6. `capturedName(date)`(main, `pastedName` 옆).
7. `AttachmentStore.addCaptured(png)`: 임시 디렉터리와 가짜 codec으로 `attachments.test.ts`에서. 상한, 저장 실패 시 정리, `remove`가 파일을 지움, `markSent` 뒤 `cleanup`이 남김.
8. `attachmentChipView`와 `movedNotice`의 캡처 이름(`homeComposer.ts`): `pasted`이고 이름이 `canvas-capture-`로 시작하면 "Canvas capture". 같은 이름의 경로 첨부(`pasted: false`)는 파일 이름을 그대로 보인다.

`CanvasController`의 캡처 모드 생명 주기(시작, Esc, Select·Hand, V·H·Space 무시, Hand에서 시작할 때 drag layer가 내려감, pick과의 배타, 캔버스 전환, 캔버스 페이지를 떠남, reload 유지, reload 중의 `pointerup`, `pointercancel`·`lostpointercapture`·앱 blur는 드래그만 버림, `pointerup`에서 캡처 모드가 바로 끝남, 레이어가 올라올 때 `hover-leave`, `pointerup` 뒤에 레이어 내림)는 순수 함수가 아니지만 `CanvasController.test.ts`의 기존 방식으로 고정한다.

## 포맷 변경

없다. JSON Schema(ARCHITECTURE §11)를 바꾸지 않고 `v`도 그대로다. `AttachmentRecord`, event JSONL v1, `drafts.json`, `ui-state.json`(캡처 모드는 저장하지 않는다)은 바뀌지 않는다. `attachments:capture`는 앱 내부 IPC 채널이고 공유 포맷이 아니다. `AttachmentInfo`에 필드를 더하지 않는다(§1 '저장').

## 관례 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 에이전트가 받는 첨부는 지금과 같은 descriptor이고, `turnPrompt`의 "attachments lists local files the person chose" 문장도 캡처에 맞는다.

## 결정 영향

- **sandbox iframe(§3).** 그대로다. `allow-same-origin`을 더하지 않고, 주입 스크립트도 바꾸지 않는다. 캡처는 main이 합성된 창 픽셀을 읽는 것이고 canvas 문서에 닿지 않는다.
- **신뢰할 수 없는 canvas 메시지(§3 'Untrusted messages').** 그대로다. canvas는 캡처를 시작하거나 영역을 정할 수 없다. canvas가 자기 픽셀을 어떻게 그리든 그것은 사람이 본 것이다.
- **IPC 경계(§7).** 새 채널은 main window main frame만 받는다. main은 사각형 모양과 창 범위를 다시 확인한다.
- **첨부 규칙(PRODUCT §5 item 1 'Attachments', ARCHITECTURE §7 'Attachments').** "only a pasted image without a path is saved"가 "a pasted image or a canvas capture"로 넓어진다. 저장 위치, 상한, 지우는 규칙은 붙여 넣은 이미지와 같다. 마지막 task에서 두 문서를 고친다.
- **drag layer 자리(DESIGN 'Drag layer', ARCHITECTURE §3 'Input').** 같은 자리에 레이어가 하나 더 생긴다. 두 레이어는 동시에 올라오지 않는다: `boardDrawn()`이 캡처 모드에서 거짓이 되어 drag layer가 내려가고, Space와 H는 무시된다(§2 'drag layer').
- **git, repo 쓰기, 서버.** 없다. 이미지는 userData에만 있다.
- **썸네일 창.** 바뀌지 않는다(결정 1).

## PoC 의존

- **C1. 보이는 main window의 `capturePage(rect)`.** 확인할 것: (a) 보드 iframe(OOPIF)의 캔버스 픽셀이 들어간다. (b) `data-capture-snapshot` + 두 번의 rAF 뒤의 이미지에 숨긴 앱 표시(선택 테두리, 점프 하이라이트, agent glow와 점, 도구모음, notice, toast, marquee)가 없다. (c) 이미지 크기가 사각형 × `devicePixelRatio`이다. (d) 걸리는 시간과 사람이 보는 깜빡임(숨김 시작부터 복원까지의 ms). 속성은 답이 올 때 지우므로 `capturePage`만이 아니라 main의 PNG 저장과 `codec.thumbnail`까지 포함한 왕복 전체를 잰다. (e) 창이 다른 배율의 모니터에 있거나 일부가 화면 밖일 때. 증거: 썸네일이 숨은 창에서 cross-site sandbox iframe을 찍는다는 것(ARCHITECTURE §3)뿐이고, 보이는 창, 숨김 타이밍, 배율은 아직 아무도 확인하지 않았다. 그래서 tasks의 첫 task로 둔다.
- C1이 (a)나 (b)에서 실패하면 결정 1을 사람에게 다시 묻는다. 다른 안(숨은 창에서 다시 그리기)으로 바뀌면 이 문서와 tasks를 다시 쓴다.

## POSTMORTEM에서 가져온 함정

- **2026-10-23 'Hover stayed hidden across direct reentry and Alt focus transfer'**: "invalidating a consumer's cached display must also invalidate the producer's deduplication cache. The app now sends a sequenced hover-leave command without changing selection". → 캡처 레이어가 올라올 때 drag layer처럼 hover를 지우고 `hover-leave`를 보낸다.
- **2026-11-02 'Every Overview menu opened under the Overview itself'**: "give any new stacking layer (a positioned element with a z-index) a check against portalled menus, and open at least one portalled menu on that screen in its runtime probe, judged by screenshot." → 캡처 레이어와 marquee에 z-index를 주면 `ds/controls.test.ts`의 층 검사에 넣고, runtime probe에서 캡처 모드 중에 portalled 메뉴(zoom 메뉴)를 하나 열어 스크린샷으로 판정한다.
- **2026-11-02 'Tab walked into the draft, drew its focus rings and scrolled the floating tools away'**: "a box that holds a transformed board and floating overlays clips; it never relies on `overflow: hidden`." → 캡처 레이어와 marquee는 `.area` 안에 absolute로 두고 `.area`의 `overflow: clip`을 바꾸지 않는다.
- **2026-11-02 'The selection-lost line never left the board'**: "a message that reports something that happened is a toast; a board notice is only for a condition that is still true". → 캡처 실패는 사건이므로 toast로 보이고 보드 notice로 보이지 않는다. 캔버스 대화 패널의 `onNotice`가 이미 `toast.show`로 간다(`App.tsx`).
- **2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'**: "an element that receives focus programmatically … is hidden only visually …, never with `display: none` or `visibility: hidden`". → 스냅숏 숨김은 `opacity: 0`이다. 포커스를 가진 캡처 버튼이 숨김 동안 포커스를 잃지 않는다.
- ARCHITECTURE §3 'Input'(POSTMORTEM이 아님): "lowering the layer first would drop the `pointerup` on the iframe as a selecting click". → 캡처 레이어도 `pointerup`을 처리한 뒤 내린다.
- C1 실패로 결정 1이 다시 그리기로 바뀌면 함께 볼 것: 2026-10-25 'A failed embedded frame suppressed a healthy outer thumbnail'(job별 frame 식별)과 2026-10-25 'A crash during quit teardown lost the debounced ui-state'(quit 중 캡처 창 생성자).
- 클립보드는 쓰지 않으므로 2026-10-27 'Runtime clipboard capture constructed an item with no MIME types'는 해당하지 않는다.

## 읽은 design preset

설치된 `doan design-skill --json`(0.1.0)에서 두 개를 읽었다.

- `shape`: 기존 화면을 넓히는 일("Extend an existing surface")로 보고 캔버스 도구모음의 시각 언어를 이어받는다. 화면 성격은 Operate다. 해석이 갈린 점은 사람이 정했다('결정').
- `harden`: 쓸 수 없는 상태 셋, 실패, 첨부 상한, 캡처 모드가 끝나는 조건을 상태로 나열했다(§4).

## 결정

1. **이미지는 화면에 보이는 픽셀이다**(사람). main window의 `capturePage`로 캡처 영역을 찍고, 앱 표시는 스냅숏 동안 숨긴다. 해상도는 그 순간의 확대율 × 화면 배율이다. 사람이 본 것과 같은 이미지가 가고, 썸네일 창과 quit 처리에 손대지 않는다. 숨은 창에서 `doan:width`로 다시 그리는 안은 사람이 조작한 캔버스 상태(열린 탭, 입력값, 스크롤)를 잃어 고르지 않았다. PoC C1이 (a)나 (b)에서 실패하면 이 결정을 사람에게 다시 묻는다.
2. **한 번 찍으면 캡처 모드가 끝난다**(사람). 캡처할 영역으로 포인터를 놓으면 캡처 모드가 바로 끝나고 그 전 도구로 돌아간다. 그 뒤의 진행은 composer의 "Checking" 칩이, 실패는 toast가 보인다. Picker와 같은 규칙이다.
3. **이미지에는 캔버스만 담는다**(사람). 선택·hover 테두리, 점프 하이라이트, agent glow와 점, marquee, 도구모음, notice, toast를 숨긴다. 앱 표시가 캔버스의 일부로 오해되지 않게 한다.
4. **터미널 세션을 이어 가는 상태에서는 캡처를 쓸 수 없다**(사람). 이유는 Attach 버튼과 같은 "Files can’t be attached to a terminal session"이다. 사람이 고른 이어 가기를 앱이 새 대화로 바꾸지 않는다.
5. **키보드 단축키는 두지 않는다**(사람). 앱 메뉴 막대 항목(Edit > Pick from Canvas 같은 것)을 둘지는 아직 정하지 않았고 `/design-draft`에서 정한다(사람).
6. **클릭이나 8 CSS px 미만의 드래그는 아무것도 넣지 않고 캡처 모드를 유지한다**(사람). Picker의 "a click outside every frame adds nothing and the pick goes on"과 같다.
7. **에이전트에게는 이미지만 준다**(사람). 영역이 걸친 프레임 id나 문서 좌표는 보내지 않는다. 위치가 필요하면 사람이 같은 메시지에 칩을 더한다. 프롬프트와 anchor 형식은 바뀌지 않는다.
8. **composer 칩 이름은 "Canvas capture"다**(사람). 파일 이름은 `canvas-capture-<ISO 시각>.png`다. 한 메시지에 붙여 넣은 이미지와 섞여도 구별된다.
9. **도구모음 자리는 Picker 다음, 구분선 앞이다**(사람): Select, Hand, Picker, Capture | Export. 구분선 뒤는 캔버스 전체에 대한 동작(Export) 자리로 둔다.
10. **접힌 패널은 이미지가 composer에 들어갈 때 펼친다**(사람). 영역을 고르는 동안 보드 폭이 바뀌어 화면이 움직이지 않게 한다. 캡처 모드를 시작할 때 펼치는 Picker와 다르다.
