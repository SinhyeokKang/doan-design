# prototype-conversation-panel — design

동작은 spec.md에 있다. 이 문서는 구현 방법과, 사용자가 정한 점의 근거('정한 점')다.

## 링크 3과의 의존 (먼저 확인)

이 feature는 체인 261113-3이 끝난 뒤 별도의 `/orchestrate`로 돌고(체인 링크가 아니다), `prototype-conversation`(링크 3)이 develop에 넣은 배치를 바꾼다. 링크 3은 고치지 않는다. 아래 목록의 이름은 링크 3 브랜치 `origin/feat/prototype-conversation`의 a0f035773(병합 전)에서 읽었다. tasks 1에서 이 목록을 링크 3이 병합된 develop(aa22f31e1)의 코드와 승격된 PRODUCT·ARCHITECTURE·DESIGN에 대조해 아래 '대조표'를 채우고, 다른 문장을 고쳤다.

| 항목 | a0f035773에서 읽은 모양 |
|---|---|
| 오른쪽 무리 | `fit.ts` `PROTOTYPE_HEADER_RIGHT = 140`, `styles.css` `--pw-right` |
| 패널 한도 | `prototypePanelBounds(windowWidth)` → `{min 280, max max(280, min(⌊W/2⌋, W − 360)), default}`, `prototypePanelWidth(width, windowWidth)`(자르기) |
| 패널 열기 | `openPanelResize(window, workArea, remembered)` → `{bounds, panel, minimum}` |
| 패널을 연 채 Play | `prototypePanelFit(size, workArea, panel, current)`(폭 = 표시 + 16 + P, 최소 640). `prototypeWindow.ts`의 `fitted()`가 패널이 열려 있으면 이것을, 닫혀 있으면 `fitPrototypeWindow`를 고른다. 둘 다 공유 `placed()`를 쓰고, `placed()`는 `headerHeight(width)`(R 140, W 기준)로 높이를 잡는다 |
| 캡처 | `prototypeCaptureRect(content, mark, mode, sideColumn = 0)`. `controller.ts`가 `prototypePanelWidth(...)`로 자른 패널 폭을 넘기고(주석은 "conversation column's width (its handle included)"), `prototypeWindow.ts` `capture(mark, mode, sideColumn)`가 받는다. `windowState.ts`는 맞춤도 캡처도 하지 않는다 |
| 배치 | `.pw[data-panel="open"]`(두 열), `.pw-panel`의 R 0 0 R, `.pw-stage`의 아래 오른쪽 0, `.pw > .doan-conv-column`(2열, 2행), `.pw .right.doan-conv-panel`의 0 R R 0, 머리 없는 `.thread-scroll`·`.cp-scroll` 위쪽 16 |
| 대화 열 | `PrototypeWindow.tsx`가 `ConversationPanel` 셸이 아니라 `div.doan-conv-column`을 직접 그린다: `ref={conv.column}`(composer 포커스 질의, `dockedBuddy.start`, `ColumnFocusGuard`), `onBlur={conv.onFocusOut}`, 열린 동안만 `ResizeHandle` |
| 보여 주는 대화 | `prototypeShownConversation(list, target)` → `conversation` · `new` · `list_loading` · `list_error` · `blocked`(gone/duplicate) |
| 헤더 버튼 | `conversationButton(open, current, seen)`. `open`이면 "Hide conversation"을 돌려준다 |
| Tab 순서 | 헤더 → 프레임 콘텐츠 → 대화 열(링크 3 결정 16) |
| 토스트 | `.toast`가 창 오른쪽 아래 |
| 애니메이션 | 열 여닫기에 없음 |

### 대조표

develop aa22f31e1에서 대조했다. 경로는 `app/src/`를 뺀 것이다.

| 항목 | develop 파일:줄 | 같음/바뀜 |
|---|---|---|
| 오른쪽 무리 | `main/prototype/fit.ts:13` `PROTOTYPE_HEADER_RIGHT = 140`, `renderer/styles.css:1843` `:root { --pw-right: 140px; }` | 같음 |
| 패널 한도 | `main/prototype/fit.ts:53` `prototypePanelBounds`(min 280, max `max(280, min(⌊W/2⌋, W − 360))`, default `min(max, max(320, ⌊0.28W⌋))`), `fit.ts:60` `prototypePanelWidth` | 같음 |
| 패널 열기 | `main/prototype/fit.ts:76` `openPanelResize(window, workArea, remembered = null)` → `{bounds, panel, minimum}` | 같음 |
| 패널을 연 채 Play | `main/prototype/fit.ts:88` `prototypePanelFit`(표시 + 16 + P, 최소 640), `fit.ts:43` `placed()`, `fit.ts:102` `headerHeight(width)`(R 140), `main/prototypeWindow.ts:126` `fitted()` | 같음 |
| 캡처 | `main/prototype/fit.ts:142` `prototypeCaptureRect(content, mark, mode, sideColumn = 0)`, `main/prototype/controller.ts:36–37`(주석과 `capture(mark, mode, sideColumn)`), `controller.ts:116–117`(지역 이름 `column`에 `prototypePanelWidth(...)`를 담아 넘긴다), `main/prototypeWindow.ts:308,314`. `main/prototype/windowState.ts:21,115`는 `fit` effect를 내기만 하고 기하를 계산하지 않는다 | 같음 |
| 배치 | `renderer/styles.css:1895–1903`(R 0 0 R, `.pw-stage` 아래 오른쪽 0, 2열 2행, 0 R R 0, 머리 없는 위쪽 16). 닫힘의 `display: none`은 `styles.css:1899` | 같음 |
| 대화 열 | `renderer/prototype/PrototypeWindow.tsx:423–428`(`div.doan-conv-column`, `ref={conv.column}`, `onBlur={conv.onFocusOut}`, 열린 동안만 `ResizeHandle`), composer 포커스 질의 `:147`, `dockedBuddy.start` `:155`, `ColumnFocusGuard` `:95`·`:238`, `renderer/prototype/focusGuard.ts:9`. `renderer/ConversationPanel.tsx:22`의 셸에는 아직 `columnRef`·`onBlur` prop이 없다 | 같음 |
| 보여 주는 대화 | `renderer/prototype/conversation.ts:15–30` `prototypeShownConversation` → `conversation`·`new`·`list_loading`·`list_error`·`blocked`(gone/duplicate). `renderer/prototype/conversationRun.ts:172`는 view가 없거나 캔버스 행을 읽는 중이면 `list_loading` | 같음 |
| 헤더 버튼 | `renderer/prototype/conversation.ts:73–74` `conversationButton(open, current, seen)`, `open`이면 "Hide conversation" | 같음 |
| Tab 순서 | `renderer/prototype/PrototypeWindow.tsx:364`(헤더) → `:403`(`ContentPanel`) → `:423`(대화 열). PRODUCT §5 item 2 'Prototype window' 'Header'의 "Tab reaches … before the frame's content, and the conversation panel after it" | 같음 |
| 토스트 | `renderer/styles.css:388` `.toast { position: absolute; right: 16; bottom: 16 }`, `PrototypeWindow.tsx:429`(`.pw`의 자식이고 `.pw`는 `inset: 0`) | 같음 |
| 애니메이션 | `renderer/styles.css:1838–1906`의 `.pw` 규칙에 `transition`이 없다 | 같음 |
| 막힌 composer의 포커스(새로 확인) | `renderer/ComposerParts.tsx:163` `.composer-input`은 언제나 `tabIndex={0}`이고, 막히면 `renderer/DockedComposer.tsx:222,488`에서 `readOnly`(`contentEditable=false`)가 될 뿐 같은 요소로 남는다 | 포커스를 받는다 → '포커스'를 고쳤다 |
| 목록 읽는 중의 composer(새로 확인) | `renderer/CanvasConversationPanel.tsx:514`가 조기 return 없이 `DockedComposer`를 늘 그린다. 목록 읽는 중·읽기 실패에도 `readOnly`가 아니다. composer가 없는 것은 창이 첫 view를 받기 전뿐이다(`renderer/prototype/PrototypeConversation.tsx:15`, view나 target이 없으면 `null`) | 바뀜(설계 전제) → '포커스'를 고쳤다 |
| 승격된 문서의 자리 | PRODUCT §5 item 2 'Prototype window': 이름 줄 규칙과 Tab 순서는 'Header', 패널을 연 채 맞춤은 'Conversation panel'의 'Width', 머리 없는 패널은 'Content', 토스트는 'Export'. ARCHITECTURE §3 'Prototype window': 'Fit'의 "The rows depend only on the window's width and the right group's width", 'Timeout and kill'의 "less the open conversation column at its stored width cut to the window's current range". DESIGN.md 'Frame prototype'의 'Header right group', 'Frame name', 'Conversation button', 'Conversation column', 'Panel width', 'Headless panel', 'Export toasts' 행 | 바뀜(문장 위치) → '결정 영향'과 tasks 12를 고쳤다 |

## 영향 범위

- **앱(Electron + TS)만 바뀐다.** CLI(Go), 스킬, guide, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지, 대화 IPC와 범위 검사, preload는 바뀌지 않는다.
- main 쪽은 Play 맞춤의 폭·높이와 캡처의 기하만 바뀐다. 새 IPC 채널은 없다.

### 바뀌는 파일

| 파일 | 내용 |
|---|---|
| `app/src/main/prototype/fit.ts` (+ test) | 순수 함수 1, 3, 4. 열린 상태의 오른쪽 무리 폭(104)과 패널 간격(8) 상수. `prototypeHeaderRows`의 주석("from the window's content width alone")을 새 규칙(닫힘은 W, 열림은 L)으로 고친다. `prototypePanelBounds`·`openPanelResize`는 그대로다 |
| `app/src/main/prototype/controller.ts`, `app/src/main/prototypeWindow.ts` (+ test) | 이미 패널 폭(`prototypePanelWidth`)을 넘기므로 인자 이름(`sideColumn` → 패널 폭)과 주석, 테스트 기대값만 바뀐다. `fitted()`는 그대로 `prototypePanelFit`을 고른다 |
| `app/src/renderer/ConversationPanel.tsx` (+ `ConversationPanel.test.tsx`) | 선택 prop `columnRef`와 `onBlur`를 `.doan-conv-column`에 넘긴다. main 창 동작은 바뀌지 않는다 |
| `app/src/renderer/prototype/conversation.ts` (+ `conversation.test.ts`) | 순수 함수 2. `conversationButton`의 `open` 분기와 "Hide conversation" 라벨을 지워 Show 전용으로 한다(고아) |
| `app/src/renderer/prototype/PrototypeWindow.tsx`, `PrototypeConversation.tsx` | 대화 열을 `ConversationPanel` 셸(손잡이 + 머리 + 본체)로 바꾸고 `columnRef={conv.column}`, `onBlur={conv.onFocusOut}`를 넘긴다. 패널 열을 DOM에서 콘텐츠 패널 앞에 둔다. 열린 동안 R 104와 L 기준 이름 줄, 헤더 대화 버튼을 Show 전용으로 두고 열린 동안 숨김, 제목과 잘림 판정, 포커스 이동 |
| `app/src/renderer/styles.css` | `.pw[data-panel="open"]`의 규칙을 바꾼다(새 값을 만들지 않는다): 두 열과 열 간격 8, 헤더는 1열, 대화 열은 2열 `grid-row: 1 / -1`과 위 여백 8, 패널의 네 모서리 24·그림자·시작 테두리 없음, 열린 동안의 `--pw-right`. 머리 높이는 바꾸지 않는다(출시된 56). 링크 3의 R 0 0 R, `.pw-stage` 아래 오른쪽 0, 0 R R 0, 머리 없는 위쪽 16 규칙은 지운다 |
| `app/src/main/exportViewer.test.ts` | 링크 3의 "R 0 0 R 콘텐츠 패널" 선택자 테스트를, 열린 배치에서도 `.pw-panel`·`.pw-content`·`.pw-stage`가 출시된 나눈 clip이고 `.pw[data-panel="open"]`가 자르지 않는다는 테스트로 바꾼다 |
| `.doan/canvases/prototype-conversation-panel.html` | tasks 4(배너, 캡션 칩, 잘못된 x592, 새 타일) |

### 배치

- 초안의 구조를 따른다. `.pw[data-panel="open"]`이 두 열 격자다: `grid-template-columns: minmax(0, 1fr) var(--pw-panel)`, `column-gap: var(--space-2)`. 헤더(`.pw-top`)와 콘텐츠 패널(`.pw-panel`)은 1열, 대화 열(`.doan-conv-column`)은 2열에서 `grid-row: 1 / -1`, `margin-top: var(--space-2)`. `.pw`의 기존 padding(0 8 8)이 오른쪽·아래 8을 준다. `.top`은 출시 규칙에서 `grid-column: 1 / -1`이므로 열린 배치에서는 1열로 되돌린다.
- DOM 순서: 헤더 → 대화 열 → 콘텐츠 패널(결정 15). 격자 자리는 `grid-column`으로 정하므로 DOM 순서가 화면 위치를 바꾸지 않는다. 닫혀 있으면 대화 열은 링크 3처럼 DOM에 남되 `inert`이고 보이지 않으므로 Tab 순서는 헤더 → 프레임 콘텐츠다.
- 대화 열은 출시된 `ConversationPanel`(손잡이 + `aside.right.ov-right.doan-conv-panel#doan-conversation-panel` + `.doan-conv-head` + `.doan-conv-body`)을 쓴다. 링크 3의 열이 쓰던 `ref`와 `onBlur`는 새 선택 prop으로 같은 요소(`.doan-conv-column`)에 붙는다. 그래서 `ColumnFocusGuard`, composer 포커스 질의, `dockedBuddy.start`가 그대로 동작한다.
- 열린 배치에서 `.right.doan-conv-panel`은 `border-left: 0`, `border-radius: var(--radius-container)`, `box-shadow: var(--shadow-panel)`이다. 손잡이는 출시된 시작 쪽 손잡이다(끌기, 방향키, 두 번 눌러 기본 폭).
- 머리: 출시된 `.doan-conv-head`(`min-height: var(--size-chrome)`, 56)를 그대로 쓴다(spec 결정 16). 패널이 y8에 있으므로 Hide는 y20–52, 제목 가운데는 y36으로 헤더 컨트롤(y12–44)보다 8 아래다. 사용자가 줄 맞춤보다 canvas 페이지·Overview 머리와의 일관성을 골랐다. 머리 높이를 덮어쓰는 규칙을 더하지 않는다.
- 콘텐츠 패널(`.pw-panel`)은 출시된 네 모서리 24와 위·아래로 나눈 clip(`.pw-content`, `.pw-stage`)으로 돌아간다. iframe 조상에 네 모서리 같은 clip을 새로 만들지 않는다(POSTMORTEM 2026-11-11). 대화 패널은 iframe의 조상이 아니므로 네 모서리 24여도 이 불변식에 걸리지 않는다.

### 헤더와 이름 줄

- 오른쪽 무리 폭은 닫힘 140(`PROTOTYPE_HEADER_RIGHT`), 열림 104(대화 버튼 32와 간격 4를 뺀 값)다. 둘 다 `fit.ts` 상수이고 `styles.css`의 `--pw-right`(닫힘)와 열린 배치의 `--pw-right`(열림)가 미러하며, `WindowShell.test.tsx`가 둘씩 같게 묶는다(ARCHITECTURE §3 'Fit': "A feature that adds a header control changes both values"). 이름 캡슐은 `.shell-top`(position: relative) 기준으로 놓이므로 `--pw-right`만 바뀌면 오른쪽 끝(L − 128)이 따라온다.
- 이름 줄은 `prototypeHeaderRows`를 그대로 쓴다: 닫힘은 `(W, 140)`, 열림은 `(L, 104)`. L ≥ 408 ⇔ L − 224 − 104 ≥ 80이므로 초안의 경계와 같다. 렌더러는 창 폭과 보여 주는 패널 폭(손잡이를 끄는 중이면 미리보기 폭)으로 L을 계산하고, 측정값은 쓰지 않는다(출시된 "nothing measured feeds back" 규칙).
- 헤더 대화 버튼은 열린 동안 보이지 않는다. 같은 요소를 DOM에 두고 열림 상태로 숨긴다. 열린 동안 공간도 Tab 정지도 없어야 R이 104가 된다. 닫을 때는 버튼이 다시 상자를 가진 뒤(렌더가 끝난 layout effect에서) 포커스를 준다. `display: none`인 순간에 부른 `focus()`는 아무 일도 하지 않기 때문이다(POSTMORTEM 2026-11-03).
- `conversationButton`은 보이는 동안 언제나 닫힘이므로 "Show conversation"(`PanelRightOpen`, `aria-expanded=false`)과 배지만 돌려준다. `open` 분기와 "Hide conversation" 라벨은 고아가 되어 지운다.

### 머리 제목

- `PrototypeConversation.tsx`가 `h2.phead.rp-head`(tabIndex −1) 안에 글을 `span`으로 넣는다(`.ov-title span`과 같은 구조). 머리 `h2`는 `display: flex`라서 `h2` 자체로는 말줄임표와 잘림 판정이 안 되기 때문이다.
- 글은 순수 함수 2가 정한다. 새 규칙을 만들지 않고, `shown`이 `list_loading`·`list_error`·`blocked`이면 "Conversation", 아니면 `canvasConversationTitle(run.run, list).title`, 그것이 빈 문자열이면 "Conversation"이다.
- 잘림은 `FrameMenu`처럼 `scrollWidth > clientWidth`와 `ResizeObserver`로 판정하고, 잘렸을 때만 `h2`에 native `title`을 준다. 창 크기, 손잡이 끌기·방향키(패널 폭), 제목이 바뀔 때 다시 판정한다.

### 포커스

- 열 때: 패널 열을 보이게 한 뒤 composer에 포커스를 준다. composer가 포커스를 받을 수 없으면 머리 제목으로 준다(결정 11, `App.tsx`의 `focusPanel` 대상과 같다). 숨겨지는 헤더 버튼에 포커스를 남기지 않는다(POSTMORTEM 2026-11-13).
- composer가 포커스를 받을 수 없는 것은 창이 첫 view를 받기 전뿐이다. 이때 `PrototypeConversationPanel`은 아무것도 그리지 않는다(`PrototypeConversation.tsx:15`). 목록을 읽는 중과 읽기 실패에도 `CanvasConversation`이 composer를 그리고 그 composer는 포커스를 받는다('대조표').
- 첫 view 전에 열어 머리 제목으로 갔다면, composer가 생겨 포커스를 받을 수 있게 된 첫 렌더에서 포커스가 아직 머리 제목에 있을 때만 한 번 composer로 옮긴다. 그 사이 사람이 포커스를 옮겼으면 그대로 둔다.
- 열린 동안 composer가 막혀도(캔버스 사라짐·ID 겹침) 포커스를 옮기지 않는다. 막힌 composer는 같은 요소로 남아 `readOnly`가 될 뿐 포커스를 지니므로(`ComposerParts.tsx:163`, `DockedComposer.tsx:222,488`) 포커스가 `body`로 떨어지지 않는다.
- 닫을 때: 헤더 버튼이 다시 보인 뒤 포커스를 준다(위 '헤더와 이름 줄').
- 링크 3의 `ColumnFocusGuard`(다시 로드되는 프레임이 composer 포커스를 가져가지 않게 하는 장치)는 같은 `.doan-conv-column` 요소를 그대로 지킨다.

### 드래그 영역

- 창은 `titleBarStyle: "hiddenInset"`이고 드래그 영역은 `.top`의 `-webkit-app-region: drag`다. 열린 배치에서 헤더 요소가 L − 16으로 좁아지면, 닫혀 있을 때 헤더였던 오른쪽 위(패널 머리 자리)는 드래그 영역이 아니어야 한다(결정 5).
- 위험: Electron 45는 선택자로만 바뀐 드래그 영역을 갱신하지 않은 적이 있다(POSTMORTEM 2026-11-06). 여기서는 스타일이 아니라 레이아웃 폭이 바뀌지만, 확인한 적이 없다. 또 hiddenInset 창의 위쪽 28 px 안에서 손잡이를 두 번 누를 때 macOS가 창을 확대하지 않는지도 확인한 적이 없다. 'PoC 의존'에 둔다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `prototypeSideLayout(windowWidth, panel: number | null)` (`main/prototype/fit.ts`) — `{ left, right, rows }`. 닫힘: `left = W`, `right = 140`, `rows = prototypeHeaderRows(W, 140)`. 열림: `left = W − P − 8`, `right = 104`, `rows = prototypeHeaderRows(left, 104)`. 렌더러의 헤더, main의 맞춤과 캡처가 같은 값을 쓴다. 표: 1024/320 → L 696 1줄, 1024/512 → L 504 1줄, 736/320·696/280 → L 408 1줄, 695/280 → L 407 2줄, 640/280 → L 352 2줄, 600/280 → L 312 2줄(작업 영역 600의 알려진 한계), 닫힘 444 → 1줄, 443 → 2줄.
2. `prototypeHeadTitle(shown, title)` (`renderer/prototype/conversation.ts`) — `shown.kind`가 `list_loading`·`list_error`·`blocked`이거나 `title`이 빈 문자열이면 "Conversation", 아니면 `title`(호출하는 쪽이 `canvasConversationTitle(run.run, list).title`을 넘긴다).
3. `prototypePanelFit(size, workArea, panel, current)` 바꾸기 — 폭 = 표시 + 24 + P(최소 640). 작업 영역보다 넓으면 P를 280까지 먼저 줄이고 그다음 콘텐츠 패널. P는 맞춘 창의 최대로 자른다. 높이는 `placed()`가 아니라 패널 분기에서 `prototypeSideLayout(맞춘 폭, P).rows`로 잡는다: 1줄이면 표시 + 64, 2줄이면 표시 + 108(64 + 44). 예: 390 × 844·P 320 → 734 × 952, 240 × 400·P 320 → 640, P 280(콘텐츠 패널 336). `fitPrototypeWindow`(닫힘)는 그대로 `headerHeight(width)`(R 140)를 쓴다.
4. `prototypeCaptureRect(content, mark, mode, panel = 0)` — 넷째 인자는 패널 폭(0이면 닫힘, 지금 기본값과 같다). 위쪽은 `prototypeSideLayout(content.width, panel || null).rows`로, 콘텐츠 패널 폭은 `left − 16`으로 잡는다.

## 정한 점 (사용자 결정, spec 결정 7–16)

- **패널 최대폭 `min(50 % W, W − 360)`**(초안 그대로). 이 배치에서 최대일 때 L = 352, 콘텐츠 패널 336이 되어 닫힌 360 창의 344보다 8 좁다. W − 368로 바꾸면 640 창의 최댓값 272가 최솟값 280보다 작아져 640 = 360 + 280이라는 링크 3의 결정이 깨지므로, 그 8을 받아들인다. 그래서 링크 3의 `prototypePanelBounds`는 바뀌지 않는다.
- **머리 없던 상태의 제목은 "Conversation"**. 링크 3의 `list_loading`, `list_error`, `blocked`에서 main의 `canvasConversationTitle`을 그대로 쓰면 "New conversation"이 보인다. 이 상태들은 새 대화 상태가 아니므로 `ConversationPanel` 셸의 기본 제목을 쓴다.
- **패널을 연 채 Play: 폭 = 표시 + 24 + P(최소 640), 이름 줄은 맞춘 L과 R 104**. 왼쪽 8, 간격 8, 오른쪽 8이므로 콘텐츠 패널이 표시 폭과 같다(링크 3의 + 16이면 Fit 프레임이 8 줄어 보인다). 맞춘 L은 P가 잘리지 않는 한 표시 + 16이고, 표시 폭 392 이상에서 첫째 줄이다. 닫힌 창(표시 + 16, R 140)은 428 이상에서 첫째 줄이므로, 패널을 연 채 Play한 창의 이름이 닫힌 창보다 아래로 가는 일은 없다.
- **640–735 창의 둘째 줄을 받아들인다**. 기본 폭으로 열면 이 범위에서 L이 408보다 작아 이름이 둘째 줄로 가고 콘텐츠 패널이 44 내려간다(초안 프레임 02).
- **열 때 composer가 포커스를 받을 수 없으면 머리 제목으로**. develop에서 그런 때는 창이 첫 view를 받기 전뿐이다. 위 '포커스'.
- **Export 토스트는 패널이 열려 있어도 창 오른쪽 아래**. composer를 가릴 수 있다. `.toast`가 이미 창 오른쪽 아래이므로 코드는 바뀌지 않는다. 승격 때 PRODUCT의 "at the window's bottom right, over the content panel and never over the header"에서 "over the content panel"을 빼고, DESIGN.md 'Frame prototype' 'Export toasts' 행의 "over the content panel only"도 고친다.
- **작업 영역 632 미만의 헤더 겹침은 알려진 한계**. 창이 작업 영역 폭, 패널 280이면 L = W − 288이다. 오른쪽 무리(R 104)는 L − 120에서 시작하고 왼쪽 무리는 x192에서 끝나므로, 작업 영역 632 미만에서 열린 동안 두 무리가 겹친다. 280 규칙을 지키고 승격 때 BACKLOG.md에 적는다.
- **초안의 지위**: lead가 AGENTS.md와 `/design-draft`·`/design-sync` 스킬을 넓혀, develop에 이미 있는 화면을 다시 설계하는 후속 feature가 자기 새 초안을 병합 전까지 기준으로 쓰게 한다. 이 초안이 이 브랜치가 병합될 때까지 패널 배치와 머리의 `/design-sync` 기준이고, 링크 3의 초안은 고치지 않는다.
- **머리 높이 56**: 초안은 머리를 줄여 Hide와 제목을 헤더 줄에 맞췄지만, 사용자는 출시된 머리 모양(56)과의 일관성을 골랐다. Hide와 제목이 헤더 컨트롤보다 8 아래인 것을 받아들인다.
- **열린 동안의 Tab 순서**: 헤더 → 대화 패널 → 프레임 콘텐츠. 패널 DOM을 프레임 앞에 두므로 프레임의 Tab 정지나 focus trap이 패널을 막지 못한다. 링크 3 결정 16은 같은 이유로 헤더를 프레임 앞에 두었고, 이 결정은 패널에도 그 보호를 준다.

## 포맷 변경

- 없다. 공유 JSON Schema, format `v`, 이벤트 JSONL, app socket, CLI 출력이 그대로다. 새 IPC 채널도 없다.

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 프롬프트, guide, CLI 출력이 바뀌지 않으므로 `/agent-eval`이 필요 없다.

## 결정 영향

링크 3 승격 뒤의 문장을 바꾼다(마지막 task). 사용자가 이 요청, 초안 확인, 리뷰 결정으로 승인했다.

- **PRODUCT §5 item 2 'Prototype window'**: 링크 3이 적은 문장을 바꾼다. 'Header'의 오른쪽 무리 끝의 대화 버튼, 이름 줄을 "only the window's width decides"로 정하는 문장, Tab 순서("… before the frame's content, and the conversation panel after it")는 열린 동안 헤더 버튼 없음, L 기준 이름 줄, 왼쪽 헤더만 드래그, 열린 동안의 Tab 순서(헤더 → 패널 → 프레임)로. 'Conversation panel'의 Show/Hide 버튼 문장과 "Opening moves focus to the composer's field"는 머리의 Hide와 열 때 포커스의 대체 대상(첫 view 전의 머리 제목)으로. 'Width'의 "takes its width from the frame column beside the content panel … runs from under the header"와 패널을 연 채 맞춤("the shown width plus 16 px plus the panel")은 독립 패널과 표시 + 24 + P, L 기준 줄로. 'Content'의 "without its head"는 머리의 제목(머리 없던 상태의 "Conversation")과 Hide로. 'Export'의 토스트 문장에서 "over the content panel"을 뺀다.
- **ARCHITECTURE §3 'Prototype window' 'Fit'**: "The rows depend only on the window's width and the right group's width `PROTOTYPE_HEADER_RIGHT`"를 창 폭, 패널 폭, 두 R 값과 두 미러 상수로 고친다. 'Timeout and kill'의 캡처 "header rows from the window's width, … less the open conversation column at its stored width cut to the window's current range"를 L 기준 이름 줄과, 패널과 간격을 뺀 영역으로 고친다.
- **DESIGN.md 'Frame prototype'**: 링크 3의 값이 있는 'Header right group'(R 140만 있음), 'Frame name'(W 기준 줄), 'Conversation button'(열린 동안 "Hide conversation"), 'Conversation column', 'Panel width'(콘텐츠 패널 344·688·496), 'Headless panel' 행과 'Export toasts' 행의 "over the content panel only".
- **BACKLOG.md**: 작업 영역 632 미만에서 열린 헤더의 두 무리가 겹치는 한계.
- **ARCHITECTURE §3 'Canvas view'의 clip 불변식**: 바뀌지 않는다. 콘텐츠 패널은 출시된 나눈 clip으로 돌아가고, 대화 패널은 iframe 조상이 아니다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령, 대화 범위 검사, sender role은 건드리지 않는다.

## PoC 의존

- **드래그 영역이 레이아웃 폭을 따르는가**: 패널을 열고 닫을 때와 손잡이로 폭을 바꿀 때, 헤더 요소의 폭이 바뀐 만큼 Electron 45가 드래그 영역을 갱신하는지. 패널 머리(y8–48)의 Hide conversation과 제목이 네이티브 클릭을 받고 창을 끌지 않는지, 왼쪽 헤더의 빈 곳은 끌리는지.
- **위쪽 28 px 안의 손잡이**: 끌기와 두 번 누르기가 손잡이에 가고(두 번 누르면 기본 폭), macOS가 창을 확대하지 않는지.
- 방법: develop 앱(제품 코드는 바꾸지 않는다)을 격리해 띄우고, Playwright `_electron`의 evaluate로 열린 배치 CSS를 주입한다. 네이티브 입력은 computer-use로 준다. CDP 입력은 OS hit test를 지나치므로 판정에 쓰지 않는다(POSTMORTEM 2026-11-06).
- 실패하면 해결책(예: 패널 머리에 CSS 고정 `no-drag`, 헤더 요소의 inline 스타일 갱신)을 고르고 design.md를 고친 뒤 진행한다.
- 실제 턴이 필요한 확인(`/runtime-test`)은 링크 3처럼 공유 provider 프로필을 제자리에서 쓰고, 인증 파일을 뺀 상태를 백업했다가 되돌린다.

### 관찰 (2026-11-14, tasks 2)

결과: 12개 확인이 모두 통과했다. 해결책이 필요 없으므로 이 문서의 설계는 바뀌지 않는다.

방법: `.scratch/prototype-conversation-panel/poc-drag.mjs`가 develop aa22f31e1 앱 빌드를 Playwright `_electron`으로 띄웠다. 격리에는 `app/runtime/environment.ts` `isolatedEnv`(임시 userData·HOME·가짜 SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·`DOAN_RUNTIME`)와 `go build`한 임시 CLI를 썼다. 임시 저장소를 `folders.json`에 등록하고 `preferences.json`에 buddy 키를 둔 뒤, `doan open … --prototype`으로 1008 × 600 프레임을 재생해 창을 1024 × 680에 놓았다. 패널은 실제 헤더 버튼으로 열었다. 프로토타입 페이지의 CSP가 `<style>` 요소를 막으므로, 열린 배치 CSS는 constructed stylesheet(`document.adoptedStyleSheets`)로 넣었다. 머리(`.doan-conv-head` 안의 `h2.phead.rp-head`와 Hide 버튼)는 DOM에 직접 넣었고, Hide는 실제 헤더 버튼을 눌러 패널을 닫는다. 손잡이는 develop의 `ResizeHandle` 그대로다. 주입 후 기하는 헤더 x8–688(680), 오른쪽 무리 x576–680, 패널 x696 y8 320 × 664, 머리 y8–64, Hide x976–1008 y20–52, 손잡이 x692–700 y8부터다(`shots/01-open-injected.png`). 판정 입력은 모두 `orca computer click/drag … --restore-window`(앞으로 가져온 창에 주는 네이티브 포인터)이고, 창이 움직였는지는 main의 `getBounds()`로 보았다. CDP 입력은 쓰지 않았다.

| 확인 | 결과 |
|---|---|
| 머리 제목을 네이티브로 끌기와 누르기(736, 36): 창이 움직이지 않고, 클릭이 `isTrusted`로 제목에 닿음 | 통과 |
| Hide를 네이티브로 끌기(992, 36): 창이 움직이지 않음 | 통과 |
| 패널 위 8 간격(816, 4)과 패널 본체(816, 208)를 끌기: 창이 움직이지 않음 | 통과 |
| 열린 동안 왼쪽 헤더의 빈 곳(400, 50)을 끌기: 창이 움직임 | 통과 |
| 위쪽 28 px 안에서 손잡이를 끌기(696, 18에서 왼쪽으로 80): 패널 320 → 392, 창 bounds 그대로 | 통과 |
| 손잡이로 넓힌 뒤, 열 때는 헤더였다가 이제 패널이 덮은 곳(654, 50)을 끌기: 창이 움직이지 않음. 왼쪽 헤더는 여전히 끌림 | 통과 |
| 위쪽 28 px 안에서 손잡이를 두 번 누르기(624, 18): 패널이 기본 폭 320으로 돌아가고, 창 bounds가 그대로이며 `isMaximized()`가 false(macOS 확대 없음) | 통과 |
| 손잡이로 좁힌 뒤(320 → 293), 기본 폭에서는 패널이던 헤더의 새 오른쪽 끝(705, 50)을 끌기: 창이 움직임 | 통과 |
| Hide를 네이티브로 누르기(992, 36): 클릭이 `isTrusted`로 닿고 패널이 닫힘 | 통과 |
| 닫은 뒤, 열린 동안 패널 머리였던 헤더 오른쪽(756, 50)을 끌기: 창이 움직임 | 통과 |

- Electron 45는 열고 닫을 때와 손잡이로 폭을 바꿀 때, 레이아웃 폭이 바뀐 `.top`의 드래그 영역을 갱신했다. 패널은 `.top` 밖에 있어 드래그 영역이 아니므로, 패널 머리에 CSS 고정 `no-drag`를 둘 필요가 없다.
- hiddenInset 창의 위쪽 28 px 안이라도, 드래그 영역이 아닌 손잡이에서는 macOS가 두 번 누르기를 창 확대로 가로채지 않았다.
- 한계: 머리는 셸 컴포넌트가 아니라 주입한 DOM이다. `.top` 밖에 있다는 조건이 같으므로 판정은 실제 구현에도 해당하지만, 실제 구현의 확인은 tasks 10이 한다. 같은 날 앞선 두 실행은 판정에서 뺐다. 하나는 `<style>`이 CSP에 막혀 배치가 적용되지 않았고, 다른 하나는 Orca가 `window_not_focused`로 입력을 거절해 멈췄다. 스크립트는 이제 배치가 적용되지 않으면 중단하고, 그 오류에는 한 번 다시 시도한다.

## POSTMORTEM에서 가져온 함정

- **2026-11-11 'Large canvases were cut off for good under a rounded four-corner clip'(Recurrence 2026-11-14, `.pw-panel`)**: "no ancestor of a cross-origin canvas iframe clips with four equal non-zero radii … a change that adds a cross-origin iframe host, or lets an iframe grow past its panel, adds that chain to the structural test." 열린 배치는 `.pw` 격자 규칙을 바꾸므로, 콘텐츠 패널이 출시된 나눈 clip으로 돌아가는지와 `.pw[data-panel="open"]`가 자르지 않는지를 `exportViewer.test.ts`에 둔다. 대화 패널의 네 모서리 24는 iframe 조상이 아니므로 허용된다.
- **2026-11-02 'The canvas conversation panel's head was 8px shorter than the canvas header'**: "put a row height on the container that always renders, not on a child a prop can replace." 출시된 높이 56은 이미 `.doan-conv-head`에 있으므로, `title` prop으로 `.rp-head`를 넣어도 높이가 유지된다. 이 높이를 덮어쓰지 않는다.
- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: 헤더 대화 버튼은 열림 상태와 배지에 따라 다른 컴포넌트로 바뀌지 않는 한 요소다. 숨김도 같은 요소에 건다. 열 때 포커스를 숨겨지는 버튼에 남기지 않는다.
- **2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'**: "an element that receives focus programmatically … is hidden only visually …, never with `display: none` or `visibility: hidden`." 헤더 대화 버튼은 열린 동안 Tab 정지도 공간도 없어야 하므로(R 104) 시각적으로만 숨길 수는 없다. 대신 닫을 때 버튼이 상자를 되찾은 다음에 포커스를 준다. stylesheet가 없는 단위 테스트는 이것을 잡지 못하므로, 실제 앱에서 `document.activeElement`로 확인한다.
- **2026-11-06 'The Agent usage popover stayed open on a press in the app header'와 2026-11-08 'Closing one of two header popovers let the window drag under the other'**: 드래그 영역 변화는 네이티브 클릭과 드래그로만 검증한다. 헤더 위 popover의 no-drag는 `useHeaderNoDrag` 한 곳만 바꾼다. 패널 머리에 `-webkit-app-region`을 스크립트로 쓰지 않는다(필요하면 CSS의 고정 `no-drag`).

## 디자인 프리셋

목록은 설치된 `doan design-skill --json`으로 보고 `adapt`, `layout`, `harden`, `clarify`를 읽었다(이후 실행은 coordinator 지시로 멈췄다).

- adapt: 늘리지 않고 구조를 바꾼다는 원칙은 독립 패널과 L 기준 이름 줄(좁아지면 둘째 줄)과 맞는다. 640–735 창의 줄 이동과 632보다 좁은 작업 영역을 적었다(둘 다 사용자가 받아들였다).
- layout: DOM·포커스 순서가 시각 순서와 맞는지(헤더 → 패널 머리의 Hide → composer → 프레임), 열고 닫을 때 무엇이 고정되고 무엇이 옮겨 가는지(패널은 y8 고정, 콘텐츠 패널만 44 이동)를 확인했다. popover는 portal로 컨테이너를 벗어난다(프레임 메뉴는 이미 그렇다).
- harden: 긴 제목(말줄임표와 잘렸을 때만 native `title`), 머리 없던 상태의 제목, 포커스를 받지 못하는 composer와 열린 동안 막히는 composer, 좁은 작업 영역, 열린 동안의 창 크기 변경을 상태로 적었다.
- clarify: 새 문구는 없다. "Hide conversation", "Show conversation", "New conversation", "Conversation"은 모두 출시된 문구다. 머리 없던 상태는 보이지 않는 상태를 말하지 않도록 "Conversation"을 쓴다.
