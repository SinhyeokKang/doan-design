# thread-polish — 설계

## 순서 제약

- chain-261126-1의 answer-popover가 머지된 뒤에 시작한다. answer-popover가 `ConversationThread.tsx`, `threadMotion.ts`의 따라가기(`scrollToItemHolds`, `heldKey`, `release` 제거, 끝 여백), `styles.css`의 Jump to latest 자리, `CanvasConversationPanel.tsx`의 handoff 카드 포커스를 바꾼다. 이 기능은 그 결과 위에서 설계를 다시 확인한다.
- figma-shortcuts(`feat/figma-shortcuts`)와는 파일이 겹치지 않는다.

## 영향 받는 부분

- 앱(renderer)만 바뀐다. CLI, 스킬, 형식(대화 기록 `origin` 포함)은 그대로다.
- `ConversationThread.tsx`
  - 캔버스 카드 `cc-open`: `data-ui-variant="trigger"` → `"subtle"`.
  - `HandoffCard` → 에이전트 입력 버블. `msg-user` 안에 `bubble` 작성자 타입(`data-author="agent"` 같은 속성)을 두고, 메타 줄과 `.md` 본문을 그린다. 그룹 이름은 지금 카드처럼 "<name>, <status>"로 둔다(옮겨 온 직후 포커스 대상).
  - `ThreadActions.copy`: 성공도 알린다. 토스트는 스레드 밖(호스트)이 띄운다.
- `handoffView.ts`: 카드 뷰에서 메타 뷰로 바꾼다. 배너와 프레임 수는 쓰지 않는다.
- `CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, `prototype/PrototypeConversation.tsx`: Copy 성공을 각 창의 공용 토스트(`onNotice`)로 보낸다. 프로토타입 창의 토스트 경로는 구현 때 확인한다.
- `threadMotion.ts`: `FOLLOW_DISTANCE`(24) 고정값 대신 높이에 따른 따라가기 거리를 쓴다.
- `styles.css`: 에이전트 입력 버블(채움, 전체 폭, 메타 줄, 구분선, forced colors 가장자리), 캔버스 카드 Open의 색 규칙(`.card-head .cc-open { color }`)을 `subtle`에 맞게 정리.

## 따라가기 규칙

- 따라가기 거리 `band(height) = max(120, height / 3)`. `height`는 `.thread-scroll`의 clientHeight다.
- 사람의 입력(휠, 스크롤러 위 포인터, 스크롤 키)은 지금처럼 따라가기를 멈춘다. 다만 다시 붙는 조건이 `distance <= band`로 넓어진다.
  - 휠: 마지막 휠에서 100ms(`WHEEL_HOLD_MS`) 뒤, 거리 안이면 다시 붙는다(지금과 같은 대기, 거리만 넓다).
  - 포인터: 포인터가 눌려 있는 동안은 다시 붙지 않는다. 지금은 포인터 입력이 한 번 끊고 나면 바닥 24px 규칙으로만 붙으므로, 넓어진 거리에서 스크롤바를 끌고 있는 동안 끌려 내려가지 않도록 `pointerup` 전까지 붙지 않게 한다.
  - 키: 키 입력 뒤 프레임에서 거리 안이면 붙는다.
- `behind`(Jump to latest 표시)는 따라가기가 끊겼고 거리가 `band`보다 클 때 새 내용이 생기면 켠다.
- answer-popover의 끝 여백 규칙(여백 변화는 `behind`가 아님)은 그대로 둔다.

## 순수 함수 (`/tdd` 대상)

- `followBand(height)`: 120 미만 높이, 360, 900에서의 값.
- `nextFollow`의 `frame` 이벤트: 거리 `band` 안팎, 휠 대기 안팎, 포인터 눌림 중에 붙는지.
- `followResize`: 끊긴 동안 거리 `band` 안에서 자라면 `behind`가 생기지 않고, 밖에서 자라면 생긴다.
- `handoffView` → 에이전트 입력 메타 뷰: 캔버스 출처, Overview 출처, 사라진 캔버스, 지운 대화에서 이름·아이콘·상태·Open 유무.

## 형식, 규약, 결정 영향

- 형식 변경 없음. 대화 기록의 handoff 메시지(`origin`)를 그대로 읽는다.
- 규약(ARCHITECTURE §1)과 `doan check` 영향 없음.
- 구조 결정 영향 없음.

## PoC

- 없음. 다만 따라가기는 실제 앱에서 확인한다(트랙패드 관성, 스크롤바 드래그, 답이 드러나는 중).

## postmortem에서 가져온 주의

- 2026-11-25 "In forced colours the thread's sent bubble read as plain text": 채움만으로 그리는 모양은 `@media (forced-colors: active)` 가장자리를 둔다. 에이전트 입력 버블도 같다.
- 2026-11-25 "A canvas card's meta line wrapped": 시각처럼 저절로 바뀌는 글이 있는 줄은 줄바꿈하지 않는다. 메타 줄은 `nowrap`, 출처 이름이 먼저 잘리고, CSS 규칙 테스트로 고정한다.
- 2026-11-25 "Chromium scroll anchoring moved the followed thread": `.thread-scroll`의 `overflow-anchor: none`을 지킨다. 따라가기 변경은 실제 앱에서 내용이 위에서 자랄 때도 확인한다.
- 2026-11-18 "A handoff's first message that starts with a command name was drawn as a command turn": 에이전트 입력 버블도 `origin`이 있는 메시지를 명령으로 읽지 않는다(`messageCommand`).

## 드래프트 요청

- 경로 `.doan/canvases/thread-polish.html`, canvas id `thread-polish`, 폭 1440. `handoff-received.html`(탐색 드래프트)은 이 드래프트로 옮기고 지운다.
- 프레임
  - `card-open`: 캔버스 카드의 Open이 `subtle`인 상태들(그리는 중, 그림, 넘김, 넘긴 뒤 열기), 347과 280.
  - `copy-toast`: 코드 블록과 "Copied code" 토스트, 실패 안내(지금 그대로).
  - `agent-bubble`: 캔버스 출처, Overview 출처, 사라진 캔버스, 지운 대화, 280 폭에서 이름 잘림, 옮겨 온 직후 포커스, 뒤에 오는 사람 버블과의 대비.
  - `follow`: 따라가기 거리를 그림으로 설명(거리 안 스크롤 → 버튼 없음, 거리 밖 → Jump to latest).
