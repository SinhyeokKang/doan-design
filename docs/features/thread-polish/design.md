# thread-polish — 설계

## 순서 제약

- chain-261126-1의 answer-popover가 머지된 뒤에 시작한다. answer-popover가 `ConversationThread.tsx`, `threadMotion.ts`의 따라가기(`scrollToItemHolds`, `heldKey`, `release` 제거, 끝 여백), `styles.css`의 Jump to latest 자리, `CanvasConversationPanel.tsx`의 handoff 카드 포커스를 바꾼다.
- 시작할 때 머지된 코드에서 이 문서의 '따라가기'와 '받은 handoff 버블'에 적은 줄 번호와 이름을 다시 확인한다(tasks 2).
- figma-shortcuts는 develop에 머지됐다(`b2f9c1513`). 겹치는 파일이 없다.

## 영향 받는 부분

- 앱(renderer)만 바뀐다. CLI, 스킬, 형식(대화 기록 `origin` 포함)은 그대로다. `/agent-eval`은 해당하지 않는다.

### 캔버스 카드 Open

- `ConversationThread.tsx` 캔버스 카드 `cc-open`: `data-ui-variant="trigger"` → `"subtle"`. `styles.css`의 `.card-head .cc-open { color }`를 `subtle` 규칙에 맞게 정리한다.

### Copy code 토스트

- 호스트의 `onCopy`(`CanvasConversationPanel.tsx`, `ProjectOverview.tsx`의 `text => Promise.resolve(copyText(text))`)가 성공하면 `onNotice("Copied code")`를 부른다. 프로토타입 창은 같은 `CanvasConversation`을 쓰고 `onNotice`가 `PrototypeWindow`의 토스트로 이어지므로 따로 손대지 않는다. `ThreadActions`와 스레드 props는 바꾸지 않는다.
- 스레드의 sr-only `role="status"` "Copied"(`copied`, `COPIED_MS`, `copiedTimer`)를 지운다. 토스트도 `role="status"`라 두 번 읽힌다.

### 받은 handoff 버블

- `ThreadItem`의 종류는 `handoffCard` 그대로 둔다. `threadItems.ts`, `lastEnd`(resend 판정), `entering`, 제목 규칙은 이 종류에 기대고 있으므로 렌더만 바꾼다.
- `ConversationThread.tsx`의 `HandoffCard`를 버블로 바꾼다.
  - 구조: `msg-user` 안 `.bubble`에 handoff 표시 클래스(예: `.bubble.handoff`)를 둔다. 안에 메타 줄과 `.md` 본문을 둔다.
  - 본문은 `white-space: normal`이다. `.bubble`의 `pre-wrap`이 Markdown에 상속되지 않게 한다. 글자는 패널의 `.md` 규칙(body-sm)을 따른다.
  - 그룹: `role="group"`, 이름 "Handoff from <name>"(없어졌으면 " · <reason>"), 시각은 `aria-describedby`로 늘 읽힌다. 화면의 `<time>`은 `aria-hidden`이다.
  - 이름 자르기: 지금 `CardName`의 가운데 자르기(`fitKeep`)에 최소 3em 하한을 둔다. 시각이 숨은 동안 이름의 tooltip은 잘리지 않아도 늘 열리고, 이름과 절대 시각을 보인다.
  - 시각 숨김: `.thread`를 inline-size container로 두고 `@container (max-width: 275px)`에서 시각과 그 앞 구분점을 숨긴다(draft와 같다).
  - Copy 실패 안내와 `chip-missing` 안내는 버블 아래(`.msg-user` 안, 오른쪽 정렬)에 둔다. 지금 카드용 위치 규칙(`styles.css`의 `.handoff-card .card-layout > :is(.chip-missing, .copy-failed)`)을 옮긴다.
- 선택자를 옮긴다. 지금 `.handoff-card`에 묶인 곳은 다음과 같다.
  - `ENTRY_FOCUS`(`ConversationThread.tsx`, `:is([data-entry], .ap-bar, .handoff-card)`): 옮겨 온 직후 포커스 대상.
  - `ConversationThread`의 imperative `scrollToItem`(`node.querySelector(".handoff-card") ? "start" : "center"`): 버블 위끝이 보이게. `CanvasConversationPanel.tsx`가 옮겨 온 직후 이것을 부른다.
  - `styles.css`의 `.handoff-card:focus-visible`: `.msg-user:focus-visible > .bubble`로 쓴다.
  - 셋 모두 실제로 실행되는 테스트로 고정한다.
- `cardBanners`에서 handoff를 빼서 썸네일을 더 요청하지 않는다.
- `handoffView.ts`: 카드 뷰(`handoffCardView`)를 메타 뷰로 바꾼다. 이름, 종류 아이콘, 시각, 사라진 이유, Open 이름을 내고 배너와 프레임 수는 내지 않는다. 프로토타입 창에서 `conversationListed`가 null이면 "있음"으로 읽는 규칙(ARCHITECTURE)을 그대로 지킨다.
- forced colors: 버블은 같은 `.bubble`이라 기존 가장자리 규칙을 받는다. 메타 구분선과 Open 캡슐(`panel`)이 보이는지 에뮬레이션으로 확인한다.

### 따라가기

- 지금 24px(`FOLLOW_DISTANCE`, `threadItems.ts`)을 쓰는 곳은 세 군데다(answer-popover 머지 뒤 `69e7d71df` 기준).
  - `threadMotion.ts`의 `nextFollow` `frame`: 붙지 않은 상태에서 `distance <= 24`이면 다시 붙는다.
  - `threadMotion.ts`의 `followResize`의 `behind`: 내용이 자랐고 바뀌기 전과 뒤 거리 중 큰 쪽이 24보다 크면 켠다. `ConversationThread.tsx`의 `resized`는 이 결과(`change.behind`)를 그대로 `setBehind`에 넘긴다.
  - `ConversationThread.tsx`의 `onScroll`의 `scrollFollow(false, distance)`: `behind`를 끈다.
- 끝 여백은 `ThreadSize.inset`(`resized`의 `inset.current`, CSS `--ap-inset`)이다. 여백이 바뀌면 붙은 상태에서 `snap`한다.
- 새 규칙은 세 값으로 나눈다.
  - `BOTTOM = 24`: 바닥에 있다고 보는 거리. 여기로 돌아오면 언제든 붙는다. 지금 규칙 그대로다.
  - `NUDGE = 48`: 입력이 끝났을 때 사람이 직접 움직인 양이 이 이하이면 다시 붙는다.
  - `band(height) = max(120, height / 3)`: `behind`를 켜고 끄는 거리. `height`는 `.thread-scroll`의 clientHeight에서 끝 여백(`inset.current`)을 뺀 값(사람에게 보이는 높이)이다.
- `FollowState`
  - `wheelAt`을 `inputAt`으로 바꾸고 키 입력에도 같은 대기(`WHEEL_HOLD_MS`)를 둔다. 키 스크롤 애니메이션이 끝나기 전에 다시 붙지 않게 하기 위해서다. 대기 길이가 Chromium 키 스크롤 애니메이션을 덮는지는 runtime-test에서 본다.
  - `pressed`(포인터 눌림)를 둔다.
  - `origin`: 입력을 시작한 시점의 바닥까지 거리를 기억한다.
- `FollowEvent`
  - `{ type: "pointer"; down: boolean }`를 더한다. 놓음은 `window`의 `pointerup`, `pointercancel`, `blur`에서 받는다. 스크롤바 드래그는 스크롤러 밖에서 끝나는 일이 많기 때문이다. 놓을 때 루프를 다시 돌린다.
  - `frame` 이벤트에 `distance`와 `band`를 넣어 `nextFollow`를 순수 함수로 유지한다. `band`는 호출하는 쪽이 계산한다.
- 다시 붙는 판정: 붙지 않은 상태에서 다음 셋을 모두 만족하면 붙는다.
  - `selecting`이 아니다.
  - `pressed`가 아니다.
  - 입력 대기가 지났다.
  
  그리고 `distance <= BOTTOM`이거나, `distance - origin <= NUDGE`이면 붙는다. 그사이 자란 높이는 `distance`와 `origin`에 함께 들어가므로 빼진다.
- 다시 붙을 때 거리가 `BOTTOM`보다 크면 답이 드러나는 중이어도 `snap`하지 않고 `ease`로 바닥까지 간다. 그 동안 드러남으로 자란 높이는 `easeTo`의 목표만 바꾼다(`followStep`은 움직이는 목표를 받는다).
- `behind`: 붙지 않았고 `distance > band`일 때 새 내용이 생기면 켠다. `distance <= band`가 되면 끈다. 세 곳(`followResize`, `resized`, `onScroll`)이 같은 `band`와 같은 판정 시점(바뀐 뒤 거리)을 쓴다. `scrollFollow`는 이 판정으로 바꾸고 테스트를 고친다.
- answer-popover의 끝 여백 규칙(여백 변화는 `behind`가 아님)은 그대로 둔다.

## 순수 함수 (`/tdd` 대상)

- `followBand(height)`: 120 미만 높이, 360, 900에서의 값.
- `nextFollow`
  - `frame`: `BOTTOM` 안, `NUDGE` 안팎(자란 높이를 뺀 경우 포함), 입력 대기 안팎(휠과 키), `pressed` 중, `selecting` 중.
  - `pointer` down/up.
- `followResize`
  - 붙지 않은 동안 `band` 안에서 자라면 `behind`가 생기지 않고, 밖에서 자라면 생긴다.
  - 다시 붙을 때 `BOTTOM` 밖이면 드러나는 중에도 `ease`다.
- `scrollFollow`: `band` 안으로 돌아오면 `behind`가 꺼진다.
- `handoffView` 메타 뷰: 캔버스 출처, Overview 출처, 사라진 캔버스, 지운 대화(프로토타입 창의 null 포함)에서 이름, 아이콘, 시각, 이유, Open 이름, 그룹 이름.

## 형식, 규약, 결정 영향

- 형식 변경 없음. `threadItems.ts`가 `user.message`의 `origin`을 그대로 `handoffCard`로 읽고, `messageCommand`는 `origin`이 있는 메시지를 명령으로 보지 않는다.
- 규약(ARCHITECTURE §1)과 `doan check` 영향 없음.
- PRODUCT 결정 변경은 spec '확정한 결정'에 적었다.

## PoC

- 별도 PoC는 없다. 다음 두 가지는 runtime-test에서 실제 앱으로 확인하고, 맞지 않으면 멈추고 묻는다.
  - 스크롤바 썸을 창 밖에서 놓았을 때 `pointerup`/`pointercancel`/`blur` 중 하나가 오는가.
  - 키 스크롤 애니메이션이 입력 대기 안에 끝나는가.

## postmortem에서 가져온 주의

- 2026-11-25 "In forced colours the thread's sent bubble read as plain text": 받은 handoff 버블은 같은 `.bubble`이라 기존 가장자리 규칙을 받는지 확인한다. 메타 구분선과 Open 캡슐도 본다.
- 2026-11-25 "A canvas card's meta line wrapped": 메타 줄은 `nowrap`이다. 이름이 먼저 잘리는 순서를 CSS 규칙 테스트로 고정하고, 시각이 바뀌기 전후 높이를 잰다.
- 2026-11-25 "Chromium scroll anchoring moved the followed thread": `.thread-scroll`의 `overflow-anchor: none`을 지킨다. 따라가기 변경은 실제 앱에서 내용이 위에서 자랄 때도 확인한다.
- 2026-11-18 "A handoff's first message that starts with a command name was drawn as a command turn": 받은 handoff 버블도 `origin`이 있는 메시지를 명령으로 읽지 않는다(`messageCommand`).

## 드래프트 요청

- 경로 `.doan/canvases/thread-polish.html`, canvas id `thread-polish`, 폭 1440.
- 프레임
  - `card-open`: 캔버스 카드의 Open이 `subtle`인 상태들.
  - `copy-toast`: 창 오른쪽 아래의 "Copied code" 토스트, 실패 안내(지금 그대로).
  - `agent-bubble`: 캔버스 출처, 뒤에 오는 사람 버블, 사라진 캔버스, 지운 대화, 280 폭(이름 잘림, 시각 숨김), 옮겨 온 직후 포커스.
  - `follow`: 따라가기 거리를 그림으로 설명한다. 측정 대상이 아니다.
- 드래프트의 그룹 이름은 "Handoff from <name>"이다. 사라진 출처에서는 시각 대신 이유를 둔다.

## 드래프트 확정

- 2026-11-26 사용자가 `.doan/canvases/thread-polish.html`(`cf3be347c`)의 네 프레임을 확정했다. 메타의 "From" 숨김, 이름 3em까지 자름, 스레드 275px 미만에서 시각 숨김도 포함한다.
