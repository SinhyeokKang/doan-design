# prototype-conversation-panel — design

동작은 spec.md에 있다. 이 문서는 구현 방법과, 사용자가 정한 점의 근거('정한 점')다.

## 링크 3과의 의존 (먼저 확인)

이 feature는 `prototype-conversation`(체인 261113-3 링크 3)이 develop에 병합된 뒤 시작하고, 그 링크가 만든 배치를 바꾼다. 아래에서 링크 3의 내부(파일 이름, 함수 이름과 시그니처, CSS 클래스, 상태 이름)를 가리키는 문장은 모두 `docs/features/prototype-conversation/`의 계획을 근거로 썼다. 링크 3이 병합되면 그 문서는 PRODUCT·ARCHITECTURE·DESIGN으로 승격되고 지워지므로, **`/tdd` 전에 이 문서의 해당 문장을 develop의 코드와 승격된 문서에 맞춰 확인하고, 다르면 고친다**(tasks 1).

링크 3 계획에서 이 feature가 기대는 것:

- 헤더 오른쪽 무리 끝의 대화 버튼(32, Export 뒤 4). 그래서 `PROTOTYPE_HEADER_RIGHT`와 `--pw-right`가 140이다.
- `prototypePanelBounds(windowWidth)`: 최소 280, 최대 `min(50 % W, W − 360)`, 기본 `max(320, 28 % W)`를 최대로 자름. 작업 영역이 640보다 좁으면 최소와 최대가 모두 280.
- `openPanelResize(window, workArea)`: 640보다 좁으면 640·280, 그 이상은 그대로·기본폭, 작업 영역 안으로 옮김.
- `fitPrototypeWindow` 확장: 패널이 열려 있으면 폭 = 표시 + 16 + P(최소 640), 높이 = 표시 + 64(맞춘 폭에서 이름이 둘째 줄이면 + 108), 넓으면 패널을 먼저 280까지.
- `prototypeCaptureRect(content, mark, mode, sideColumn)`의 `sideColumn` = 대화 열 폭(손잡이 포함).
- main `PrototypeState`의 패널 열림과 폭(`CLOSED`에도 남음), `prototype:panel` 요청.
- `PrototypeConversation.tsx`(host), `renderer/prototype/conversation.ts`의 `prototypeShownConversation(list, target)`(현재 대화, 새 대화, `list_loading`, `list_error`, 막힘), `CanvasConversationPanel`에서 꺼낸 머리 없는 본체.
- 헤더 대화 버튼 하나가 Show/Hide 라벨, 아이콘, `aria-expanded`, 배지를 바꾸는 방식. 패널을 열면 composer로, 닫으면 그 버튼으로 포커스.
- 대화 열의 1 px 시작 테두리, 모서리 R 0 0 R / 0 R R 0, 머리 없는 패널의 thread 위쪽 여백 16.
- 토스트 호스트(`prototype-cli-export`의 것)의 자리.

## 영향 범위

- **앱(Electron + TS)만 바뀐다.** CLI(Go), 스킬, guide, `.doan/config.json`, CLI 응답, `runtime.json`, app socket 메시지, 대화 IPC와 범위 검사는 바뀌지 않는다.
- main 쪽은 창 맞춤과 캡처의 기하만 바뀐다. 새 IPC 채널은 없다(패널 열림·폭은 링크 3의 `prototype:panel`과 view가 이미 나른다).

### 바뀌는 파일

| 파일 | 내용 |
|---|---|
| `app/src/main/prototype/fit.ts` (+ test) | 순수 함수 1, 3, 4. 열린 상태의 오른쪽 무리 폭(104)과 패널 간격(8) 상수. `prototypePanelBounds`는 링크 3 그대로다 |
| `app/src/main/prototype/windowState.ts`, `controller.ts` | Play 맞춤과 캡처에 대화 열 폭 대신 패널 폭을 넘긴다(순수 함수가 간격과 헤더 줄을 계산) |
| `app/src/main/prototypeWindow.ts` | 캡처 호출 인자. 최소폭 640/360과 640으로 넓히기는 링크 3 그대로 |
| `app/src/renderer/prototype/conversation.ts` (+ test) | 순수 함수 2 |
| `app/src/renderer/prototype/PrototypeWindow.tsx`, `WindowShell`, `PrototypeConversation.tsx` | 독립 패널 배치(`data-panel="side"`), 헤더를 왼쪽 열에, 열린 동안 R 104와 L 기준의 이름 줄, 헤더 대화 버튼을 Show 전용으로 두고 열린 동안 숨김, `ConversationPanel` 셸(머리 + Hide + 본체 + 손잡이)로 패널 감싸기, 제목과 잘림 판정, 포커스 이동 |
| `app/src/renderer/styles.css` | `.pw[data-panel="side"]` 격자(두 열, 열 간격 8), 패널 열의 `grid-row: 1 / -1`과 위 여백 8, 패널의 네 모서리 24·그림자·시작 테두리 없음, 머리 높이 40, 열린 동안의 `--pw-right`. 링크 3의 R 0 0 R / 0 R R 0, 1 px 경계, 머리 없는 위쪽 여백 규칙은 지운다 |
| `app/src/main/exportViewer.test.ts` | 프로토타입 체인에 `data-panel="side"` 배치의 조상(`.pw` 격자)이 자르지 않는지 더한다 |
| `.doan/canvases/prototype-conversation-panel.html` | 배너("EXPERIMENT DRAFT · NOT IN CODE · no feature documents", "No /design-sync applies until a feature adopts this draft")를 이 feature가 채택한 초안으로 고치고, `panel-titles` 프레임에 머리 없던 상태의 "Conversation" 제목을 더한다(`/design-draft`, tasks 4) |

### 배치

- 초안의 구조를 따른다. `.pw`가 두 열 격자가 된다: `grid-template-columns: minmax(0, 1fr) var(--pw-panel)`, `column-gap: var(--space-2)`. 헤더(`.pw-top`)와 프레임 패널(`.pw-panel`)은 1열, 대화 열(`.doan-conv-column`)은 2열에서 `grid-row: 1 / -1`, `margin-top: var(--space-2)`. `.pw`의 기존 padding(0 8 8)이 오른쪽·아래 8을 준다.
- `.top`은 출시 규칙에서 `grid-column: 1 / -1`이므로, 옆 배치에서는 1열로 되돌린다.
- 패널 열은 출시된 `ConversationPanel`(손잡이 + `aside.right.ov-right.doan-conv-panel#doan-conversation-panel` + `.doan-conv-head` + `.doan-conv-body`)을 쓴다. 옆 배치에서 `.right.doan-conv-panel`은 `border-left: 0`, `border-radius: var(--radius-container)`, `box-shadow: var(--shadow-panel)`이다. 손잡이는 출시된 시작 쪽 손잡이다.
- 머리: `.doan-conv-head`와 `.rp-head`의 `min-height`를 옆 배치에서 `calc(var(--size-chrome) - 2 * var(--space-2))`(40)로 둔다. POSTMORTEM 2026-11-02에 따라 높이는 언제나 그려지는 컨테이너(`.doan-conv-head`)에도 둔다.
- `ConversationPanel`의 `title` prop에 `h2.phead.rp-head`(tabIndex −1)를 넘긴다. 제목 메뉴(`CanvasConversationTitle`)는 쓰지 않는다. `title` prop이 없을 때 셸이 보이는 기본 제목은 "Conversation"이고, 머리 없던 상태에서는 이 제목을 쓴다('정한 점').
- 프레임 패널(`.pw-panel`)은 출시된 네 모서리 24와 위·아래로 나눈 clip(`.pw-content`, `.pw-stage`)으로 돌아간다. iframe 조상에 네 모서리 같은 clip을 새로 만들지 않는다(POSTMORTEM 2026-11-11). 대화 패널은 iframe의 조상이 아니므로 네 모서리 24여도 이 불변식에 걸리지 않는다.

### 헤더와 이름 줄

- 오른쪽 무리 폭은 닫힘 140(`PROTOTYPE_HEADER_RIGHT`), 열림 104(대화 버튼 32와 간격 4를 뺀 값)다. 둘 다 `fit.ts` 상수이고 `styles.css`의 `--pw-right`(닫힘)와 옆 배치의 `--pw-right`(열림)가 미러하며, 테스트가 둘씩 같게 묶는다(ARCHITECTURE §3 'Fit': "A feature that adds a header control changes both values").
- 이름 줄은 `prototypeHeaderRows`를 그대로 쓴다: 닫힘은 `(W, 140)`, 열림은 `(L, 104)`. L ≥ 408 ⇔ L − 224 − 104 ≥ 80이므로 초안의 경계와 같다. 렌더러는 창 폭과 보여 주는 패널 폭(손잡이를 끄는 중이면 미리보기 폭)으로 L을 계산하고, 측정값은 쓰지 않는다(출시된 "nothing measured feeds back" 규칙).
- 이름 캡슐(`.pw-name`)은 절대 위치이므로, 옆 배치에서 오른쪽 끝을 헤더 요소 기준(L − 128)으로 다시 잡는다. 둘째 줄은 x16부터 L − 16이다.
- 헤더 대화 버튼은 열린 동안 보이지 않는다. 같은 요소를 DOM에 두고 열림 상태로 숨긴다. 닫을 때는 버튼이 다시 상자를 가진 뒤(렌더가 끝난 layout effect에서) 포커스를 준다. `display: none`인 순간에 부른 `focus()`는 아무 일도 하지 않기 때문이다(POSTMORTEM 2026-11-03).
- 링크 3에서 이 버튼은 열림에 따라 "Hide conversation"(`PanelRightClose`)으로 바뀌었지만, 이제 보이는 동안은 언제나 닫힘이므로 "Show conversation"(`PanelRightOpen`, `aria-expanded=false`)과 배지만 남는다. Hide 쪽 분기는 고아가 되므로 지운다.

### 드래그 영역

- 창은 `titleBarStyle: "hiddenInset"`이고 드래그 영역은 `.top`의 `-webkit-app-region: drag`다. 옆 배치에서 헤더 요소가 L − 16으로 좁아지면, 닫혀 있을 때 헤더였던 오른쪽 위(패널 머리 자리)는 드래그 영역이 아니어야 한다(결정 5).
- 위험: Electron 45는 선택자로만 바뀐 드래그 영역을 갱신하지 않은 적이 있다(POSTMORTEM 2026-11-06). 여기서는 스타일이 아니라 레이아웃 폭이 바뀌지만, 확인한 적이 없다. 또 hiddenInset 창에서 위쪽 28 px 안의 콘텐츠(Hide y12–44)가 네이티브 클릭을 받는지도 이 창에서 확인한 적이 없다. 'PoC 의존'에 둔다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `prototypeSideLayout(windowWidth, panel: number | null)` (`main/prototype/fit.ts`) — `{ left, right, rows }`. 닫힘: `left = W`, `right = 140`, `rows = prototypeHeaderRows(W, 140)`. 열림: `left = W − P − 8`, `right = 104`, `rows = prototypeHeaderRows(left, 104)`. 렌더러의 헤더, main의 맞춤과 캡처가 같은 값을 쓴다. 표: 1024/320 → L 696 1줄, 1024/512 → L 504 1줄, 736/320·696/280 → L 408 1줄, 695/280 → L 407 2줄, 640/280 → L 352 2줄, 닫힘 444 → 1줄, 443 → 2줄.
2. `prototypePanelTitle(shown, list, thread)` (`renderer/prototype/conversation.ts`) — 머리 제목. 현재 대화가 있으면 목록의 요약 제목, 없으면 첫 `user.message`의 `messageLine(requestTitleText(text), anchors)`(main의 `canvasConversationTitle`과 같은 규칙), 새 대화 상태는 "New conversation", 목록 읽는 중·목록 읽기 실패·캔버스 사라짐·ID 겹침은 "Conversation".
3. `fitPrototypeWindow` 패널 분기 — 폭 = 표시 + 24 + P(최소 640), 높이 = 표시 + 56 + 8, `prototypeSideLayout(맞춘 폭, P).rows`가 2면 + 44. 작업 영역보다 넓으면 P를 280까지 먼저 줄이고 그다음 프레임 패널. 조정된 P를 함께 돌려준다. 예: 390 × 844, P 320 → 734 × 952.
4. `prototypeCaptureRect(content, mark, mode, panel: number | null)` — 위쪽은 `prototypeSideLayout(content.width, panel).rows`로, 프레임 패널 폭은 `left − 16`으로 잡는다. 링크 3의 `sideColumn`(대화 열 폭)을 패널 폭으로 바꾼다. 닫힘(`null`)은 지금과 같다.

## 정한 점 (사용자 결정, spec 결정 7–14)

- **패널 최대폭 `min(50 % W, W − 360)`**(초안 그대로). 이 배치에서 최대일 때 L = 352, 프레임 패널 336이 되어 닫힌 360 창의 344보다 8 좁다. W − 368로 바꾸면 640 창의 최댓값 272가 최솟값 280보다 작아져 640 = 360 + 280이라는 링크 3의 결정이 깨지므로, 그 8을 받아들인다. 그래서 링크 3의 `prototypePanelBounds`는 바뀌지 않는다.
- **머리 없던 상태의 제목은 "Conversation"**. 링크 3의 목록 읽는 중, 목록 읽기 실패(오류 줄과 Retry), 캔버스 사라짐·ID 겹침(composer 막힘)에서 main의 `canvasConversationTitle`을 그대로 쓰면 "New conversation"이 보인다. 이 상태들은 새 대화 상태가 아니므로 `ConversationPanel` 셸의 기본 제목을 쓴다.
- **패널을 연 채 Play: 폭 = 표시 + 24 + P(최소 640), 이름 줄은 맞춘 L(= 표시 + 16)과 R 104**. 왼쪽 8, 간격 8, 오른쪽 8이므로 프레임 패널이 표시 폭과 같다(링크 3의 + 16이면 Fit 프레임이 8 줄어 보인다). 표시 폭 392 이상에서 첫째 줄이고, 닫힌 창(표시 + 16, R 140)은 428 이상에서 첫째 줄이므로, 패널을 연 채 Play한 창의 이름이 닫힌 창보다 아래로 가는 일은 없다. 예: 390 × 844, P 320 → 734 × 952.
- **640–735 창의 둘째 줄을 받아들인다**. 기본 폭(max(320, 28 %)을 최대로 자름)으로 열면 이 범위에서 L이 408보다 작아 이름이 둘째 줄로 가고 프레임 패널이 44 내려간다(초안 프레임 02). 링크 3 계획에서는 R 140과 W로 정해 첫째 줄에 남았다.
- **열 때 composer가 포커스를 받을 수 없으면 머리 제목 `h2.rp-head`(tabIndex −1)로**. 헤더 버튼이 포커스를 가진 채 숨겨지므로, 옮기지 못하면 `body`로 떨어진다(POSTMORTEM 2026-11-13). main 창이 패널로 포커스를 보낼 때의 대상(`App.tsx`의 `focusPanel`)과 같다. 링크 3의 막힌 composer 가운데 어느 것이 포커스를 받는지는 tasks 1에서 develop으로 확인한다.
- **Export 토스트는 패널이 열려 있어도 창 오른쪽 아래**. composer를 가릴 수 있다. 토스트 호스트의 자리는 바꾸지 않는다(링크 3이 다르게 병합했으면 이 규칙으로 맞춘다). PRODUCT의 "at the window's bottom right, over the content panel and never over the header"는 승격 때 "over the content panel"을 빼고 창 오른쪽 아래로 고친다.
- **작업 영역 632 미만의 헤더 겹침은 알려진 한계**. 링크 3 규칙대로 창이 작업 영역 폭, 패널 280이면 L = W − 288이다. 오른쪽 무리(R 104)는 L − 120에서 시작하고 왼쪽 무리는 x192에서 끝나므로, 작업 영역 632 미만에서 열린 동안 두 무리가 겹친다. 280 규칙을 지키고 승격 때 BACKLOG.md에 적는다.
- **redesign child처럼 다룬다**. AGENTS.md의 예외는 부모 feature의 redesign child에 대한 것이지만, 이 feature도 같은 방식으로 다룬다. 이 초안이 이 브랜치가 병합될 때까지 패널 배치와 머리의 `/design-sync` 기준이고, 링크 3의 초안 `.doan/canvases/prototype-conversation.html`은 고치지 않는다.
- **PoC와 `/runtime-test`의 검증 명령은 `node .scratch/prototype-conversation-panel/probe.mjs`**(스크린샷과 네이티브 입력 포함).

## 포맷 변경

- 없다. 공유 JSON Schema, format `v`, 이벤트 JSONL, app socket, CLI 출력이 그대로다. 새 IPC 채널도 없다.

## 규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. 프롬프트, guide, CLI 출력이 바뀌지 않으므로 `/agent-eval`이 필요 없다.

## 결정 영향

링크 3 승격 뒤의 문장을 바꾼다(마지막 task). 사용자가 이 요청과 초안 확인으로 승인했다.

- **PRODUCT §5 item 2 'Prototype window'**: 링크 3이 적은 패널 배치(프레임 열 옆, 헤더 아래), 헤더 대화 버튼의 Show/Hide, 머리 없는 패널 문장을 독립 패널, 머리의 제목과 Hide, 열린 동안 헤더 버튼 없음, L 기준 이름 줄, 왼쪽 헤더만 드래그, 열 때 포커스의 대체 대상(머리 제목)으로 바꾼다. 'One window'의 패널을 연 채 맞춤(표시 + 24 + P, L 기준 줄). 'Export'의 토스트 문장에서 "over the content panel"을 빼고 창 오른쪽 아래로 고친다.
- **BACKLOG.md**: 작업 영역 632 미만에서 열린 헤더의 두 무리가 겹치는 한계.
- **ARCHITECTURE §3 'Prototype window' 'Fit'**: "The rows depend only on the window's width and the right group's width"를 창 폭, 패널 폭, 두 R 값으로 고친다. 'Timeout and kill'의 캡처 "less any side column"을 패널과 간격으로 고친다.
- **ARCHITECTURE §3 'Canvas view'의 clip 불변식**: 바뀌지 않는다. 프레임 패널은 출시된 나눈 clip으로 돌아가고, 대화 패널은 iframe 조상이 아니다.
- 서빙 범위, sandbox iframe, GitHub 토큰, git 명령, 대화 범위 검사, sender role은 건드리지 않는다.

## PoC 의존

- **드래그 영역과 위쪽 클릭**: hiddenInset 창에서 패널 머리(y8–48)의 Hide conversation과 제목이 네이티브 클릭을 받고 창을 끌지 않는지. 패널을 연 뒤 헤더였던 오른쪽 위가 드래그 영역에서 빠지고, 닫은 뒤 다시 들어오는지(레이아웃 폭 변화로 Electron 45가 드래그 영역을 갱신하는지). 왼쪽 헤더의 빈 곳은 계속 끌리는지. 네이티브 클릭과 드래그로만 판정한다(POSTMORTEM 2026-11-06: CDP 입력은 OS hit test를 지나친다).
- 실패하면 해결책(예: 패널 머리에 명시적 `no-drag`, 헤더 요소의 inline 스타일 갱신)을 고르고 design.md를 고친 뒤 진행한다.

## POSTMORTEM에서 가져온 함정

- **2026-11-11 'Large canvases were cut off for good under a rounded four-corner clip'(Recurrence 2026-11-14, `.pw-panel`)**: "no ancestor of a cross-origin canvas iframe clips with four equal non-zero radii … a change that adds a cross-origin iframe host, or lets an iframe grow past its panel, adds that chain to the structural test." 옆 배치는 `.pw` 격자와 열 규칙을 더하므로, 프레임 패널이 출시된 나눈 clip으로 돌아가는지와 새 조상이 자르지 않는지를 `exportViewer.test.ts`에 더한다. 대화 패널의 네 모서리 24는 iframe 조상이 아니므로 허용된다.
- **2026-11-02 'The canvas conversation panel's head was 8px shorter than the canvas header'**: "put a row height on the container that always renders, not on a child a prop can replace." 머리 40은 `.doan-conv-head`에 둔다. `title` prop이 `.rp-head`를 바꿔 넣어도 높이가 유지된다.
- **2026-11-13 'A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page'**: 헤더 대화 버튼은 열림 상태와 배지에 따라 다른 컴포넌트로 바뀌지 않는 한 요소다. 숨김도 같은 요소에 건다.
- **2026-11-03 'A canvas row menu closed by Esc dropped focus to the page body'**: "an element that receives focus programmatically … is hidden only visually …, never with `display: none` or `visibility: hidden`." 헤더 대화 버튼은 열린 동안 Tab 정지도 공간도 없어야 하므로(R 104) 시각적으로만 숨길 수는 없다. 대신 닫을 때 버튼이 상자를 되찾은 다음에 포커스를 준다. stylesheet가 없는 단위 테스트는 이것을 잡지 못하므로, 실제 앱에서 `document.activeElement`로 확인한다.
- **2026-11-06 'The Agent usage popover stayed open on a press in the app header'와 2026-11-08 'Closing one of two header popovers let the window drag under the other'**: 드래그 영역 변화는 네이티브 클릭과 드래그로만 검증한다. 헤더 위 popover의 no-drag는 `useHeaderNoDrag` 한 곳만 바꾼다. 패널 머리에 `-webkit-app-region`을 스크립트로 쓰지 않는다(필요하면 CSS의 고정 `no-drag`).

## 디자인 프리셋

목록은 설치된 `doan design-skill --json`으로 보고 `adapt`, `layout`, `harden`, `clarify`를 읽었다(이후 실행은 coordinator 지시로 멈췄다).

- adapt: 늘리지 않고 구조를 바꾼다는 원칙은 독립 패널과 L 기준 이름 줄(좁아지면 둘째 줄)과 맞는다. 640–735 창의 줄 이동과 632보다 좁은 작업 영역을 적었다(둘 다 사용자가 받아들였다).
- layout: DOM·포커스 순서가 시각 순서와 맞는지(헤더 → 프레임 → 패널 머리의 Hide), 열고 닫을 때 무엇이 고정되고 무엇이 옮겨 가는지(패널은 y8 고정, 프레임 패널만 44 이동)를 확인했다. popover는 portal로 컨테이너를 벗어난다(프레임 메뉴는 이미 그렇다).
- harden: 긴 제목(말줄임표와 잘렸을 때만 native `title`), 머리 없던 상태의 제목, 포커스를 받지 못하는 composer, 좁은 작업 영역을 상태로 적었다.
- clarify: 새 문구는 없다. "Hide conversation", "Show conversation", "New conversation", "Conversation"은 모두 출시된 문구다. 머리 없던 상태는 보이지 않는 상태를 말하지 않도록 "Conversation"을 쓴다.
