# 답 팝오버 — design

## 영향 범위

- **app (renderer)**:
  - `ConversationThread.tsx`:
    - 기다리는 `permission`·`question` 항목을 그리는 단계에서 뺀다. `items` 자체에서는 빼지 않는다. `turnStatus`, `phaseText`, `withSending`/`placeCards`, composer의 `waiting`이 그대로 읽어야 하기 때문이다.
    - 끝난 항목의 접힌 줄은 그대로 그린다.
    - `QuestionCard`와 권한 notice의 몸체를 팝오버로 옮긴다.
    - 팝오버는 `ConversationThread` 안, `.conversation-thread` 아래에서 `.thread-scroll`의 형제로 그린다. 답, Stop, `unanswered`, 포커스 이동 로직이 이미 `ThreadBody`에 있기 때문이다.
  - `conversationStore.ts`: 접힘 상태(대화당 하나)를 `questions` 옆에 둔다. `permission.resolved`/`question.resolved`(지금 질문 초안을 지우는 곳)와 Delete에서 지운다.
  - `questionDraft.ts`: 질문 단계를 초안에 더한다.
  - 진입점:
    - `overviewRun.ts`의 `scrollTarget`: 지금은 가장 최근 요청을 고른다. 가장 먼저 온 요청을 고르게 바꾸고, 기다림 표시가 이벤트보다 먼저 올 때의 `wait` 분기는 그대로 둔다.
    - `CanvasConversationPanel.tsx`의 스크롤 요청(배지, 사이드바)과 arrival 포커스
    - `ProjectOverview.tsx`
    - `prototype/conversationRun.ts`의 `unfoldTarget`(프로토타입 창 배지)
    - 이 진입점들은 모두 "팝오버를 펼치고 포커스"가 된다.
    - 핸드오프 카드의 `scrollToItem` + `focusItem`(`CanvasConversationPanel.tsx`)은 그대로 둔다.
  - `threadMotion.ts`와 `ThreadBody`의 따라가기: `scrollToItemHolds`, `heldKey`, `release` 효과를 지운다. 끝 여백을 따라가기에 넣는다.
  - `styles.css`: 팝오버, 접힌 막대, 끝 여백, Jump to latest의 위치.
- **app (main)**: 바뀌지 않는다. 요청과 답의 IPC, 만료, 알림은 그대로다.
- **CLI, 스킬, 포맷**: 바뀌지 않는다. 대화 이벤트와 히스토리 형식은 그대로다.

## 자리, 쌓임, 크기

- **붙는 곳**: 팝오버는 스레드 영역(`.cp-foot`/`.ov-foot`의 위쪽 가장자리)의 바닥에 붙는다. composer 카드의 가장자리가 아니다. 큐 줄과 예약 줄(`DockedComposer.tsx`)은 composer 카드 위에 있으므로 팝오버는 그보다 위다.
- **z-order**:
  - `/` 목록(`.slash-popover`, z 2)은 composer에서 위로 열리므로 팝오버를 덮어야 한다. 그래서 팝오버의 z-index는 2 이하다. `.cp-scroll`이 DOM에서 `.cp-foot`보다 앞이므로 z가 같으면 composer 쪽이 위다.
  - Radix 피커, context drawer, tooltip은 portal이라 영향이 없다.
  - Jump to latest(`.jump-latest`)는 팝오버 위로 옮긴다. `bottom`이 팝오버 높이를 더한 값이 된다.
- **폭**: 스레드 열과 같다. Overview에서는 열의 `max-width: 720px`에 맞춘다.
- **높이**:
  - 상한은 스레드 영역에 대한 상대값이다(`calc(100% - X)` 또는 container 단위). 머리줄(로고, 요청 순서, 접기)과 버튼 줄은 고정하고 본문만 스크롤한다.
  - 단계를 옮기면 본문 스크롤을 맨 위로 돌린다. 포커스가 간 선택지는 보이게 스크롤한다.
  - 버튼 줄은 팝오버 아래 가장자리에 붙인다. 단계마다 높이가 달라도 위쪽 가장자리만 움직인다.
  - 프로토타입 창의 최소 크기(높이 360, 패널 280, `main/prototype/fit.ts`)에서는 스레드 영역이 약 150 px이다. 드래프트와 PoC가 이 크기를 다룬다.

## 끝 여백과 따라가기

- 따라가기의 ResizeObserver는 `.thread`와 스크롤러를 content-box로 본다. `.thread`의 `padding-bottom`을 바꿔도 둘 다 바뀌지 않으므로 알림이 오지 않는다. 그래서 다음 중 하나로 한다(T2 PoC에서 고른다).
  - **A. overlay + 여백**: 팝오버를 같은 observer로 보고(`observer.observe(popover)`), 그 콜백에서 끝 여백을 CSS 변수로 쓴다. 여백은 `.thread` 안의 spacer나 `.thread-scroll`의 padding에 둔다. 기존 `var(--space-8)` 끝 padding에 더하고, 대신하지 않는다.
  - **B. sticky 마지막 자식**: 팝오버를 `.thread`의 마지막 자식으로 `position: sticky; bottom: 0`, `margin-top: auto`, `.thread { min-height: 100% }`로 둔다. 흐름 안의 높이가 그대로 여백이 되고, 기존 observer가 본다. 대신 팝오버 위의 휠이 따라가기 리스너로 가고, 높이 상한에 container 단위가 필요하다.
- 따라가기 규칙(`followStep`/`nextFollow`): 끝 여백의 변화는 바닥을 유지하는 성장으로 본다. 다만 `behind`(새 내용이 생겼다)에는 넣지 않는다. 그래서 팝오버가 펼쳐지거나 단계가 바뀌어도 Jump to latest가 뜨지 않는다. 여백 변화는 ease가 아니라 바로 맞춘다. 팝오버는 한 번에 나타나므로, ease하면 마지막 항목이 잠시 가린다.

## 상태

- **기다리는 요청**: 기존 `pendingAsks`(`threadItems.ts`, 도착 순서, 테스트 있음)를 쓴다. resolved가 request보다 먼저 오는 경우는 이벤트가 seq로 합쳐지므로 없다.
- **접힘(`ConversationStore`)**: 대화마다 `{ collapsed, covers: Set<requestId> }`.
  - 펼침 여부는 기다리는 요청 가운데 `covers`에 없는 것이 있는지로 정한다. 접을 때 그 시점의 기다리는 id를 `covers`에 담으므로, 새 요청이 오면 펼쳐진다.
  - 보내기가 실패하면 펼친다. 기다리는 요청이 없으면 지운다.
  - 진입점은 store를 통해 펼친다.
  - `ThreadBody`는 `conversationId`마다 새로 만들어지므로 접힘 상태를 그 안에 두면 대화를 바꿀 때 사라진다. 그래서 store에 둔다.
- **단계(`QuestionDraft`)**: 지금 질문 번호. 질문 초안과 함께 store에 있고, `question.resolved`에서 지워진다.
- **창마다**: 프로토타입 창은 자기 store를 가지므로 접힘, 단계, 초안이 창마다 따로다. 한 창에서 답하면 다른 창은 resolved 이벤트로 팝오버를 닫고, 실패 줄은 없다.

## 포커스, 키보드, 알림

- **Thread focus를 잇는다**: 지금 포커스 코드(`focusedItem`, `focusIn`, `ENTRY_FOCUS`, 사라짐 감지)는 스크롤러 안의 `[data-item]`만 찾는다. 팝오버에도 `data-item={요청 키}`를 달고, 찾는 범위를 `.conversation-thread` 루트로 넓힌다. 그래야 CLI 취소나 만료로 요청이 끝날 때도 포커스가 다음 요청이나 composer로 간다(ARCHITECTURE §7 'Thread focus').
- **Esc**: `StarPrompt.tsx`의 선례를 따른다. `defaultPrevented`, `isComposing`, keyCode 229이면 건너뛰고, 아니면 접은 뒤 `preventDefault`와 `stopPropagation`을 한다. 꺼진 이유 tooltip(Radix)이 열려 있으면 Radix가 먼저 닫고 `preventDefault`하므로 접히지 않는다. `CanvasController`와 App의 Escape는 이미 `defaultPrevented`를 건너뛴다. Radix Popover는 쓰지 않는다. portal과 바깥 포커스 닫힘이 맞지 않는다(postmortem 2026-11-09).
- **키 자동 반복**: 펼치면서 포커스를 옮긴 직후, 그 버튼은 `event.repeat`인 키 입력을 무시한다.
- **단계 이동의 포커스**: 고른 라디오, 없으면 첫 선택지, 선택지가 없으면 답 칸이다. 고르지 않은 라디오에 포커스를 두면 다음 방향키가 답을 바꾸기 때문이다. Next와 Send는 같은 요소로 두어 바뀌어도 포커스가 떨어지지 않게 한다(postmortem 2026-11-13).
- **Next의 가능 여부**: `questionAnswer([q], questionInput([q], draft))`로 질문 하나씩 판정한다. `main/conversation/questionAnswer.ts`는 바뀌지 않는다.
- **알림**: 지금은 `seq > liveAfter`일 때 `role="alert"`다. 그러면 A가 보이는 동안 온 B는 B가 보이게 되어도 읽히지 않는다. 그래서 보이는 요청의 `requestId`가 바뀔 때마다 한 번 읽어 준다.
- **접근성**: `role="region"`이고 이름은 "<Provider> needs your answer"다. 질문 그룹의 이름은 "Question 2 of 3, <header>: <question>"이다. 접기 버튼과 막대는 `aria-expanded`와 `aria-controls`를 가진다. DOM 순서는 스크롤러 → 팝오버 → composer다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- **질문 단계 리듀서**(`questionDraft.ts`):
  - `next`는 지금 질문에 답이 있을 때만 움직이고, `back`은 첫 질문이 아닐 때만 움직인다. 마지막 단계를 판정한다.
  - 단계를 옮겨도 각 답이 남는다. 실패한 send 뒤에도 단계와 답이 남는다.
  - 여러 선택은 하나 이상이면 답이다. Other에 공백만 있으면 답이 아니다. 비밀 답은 Back으로 돌아가도 가려진 채 남는다.
  - Other 칸의 Return은 마지막 단계에서는 Send이고 그 전에는 Next다.
- **접힘 상태**: `covers` 모델. 다음 경우를 표로 고정한다.
  - 접기
  - 새 요청이 와서 펼치기
  - 실패해서 펼치기
  - 진입점에서 펼치기
  - 요청이 모두 끝나서 지우기
  - 대화를 바꿔도 유지
- **진입 대상**: 가장 먼저 온 기다리는 요청의 키. `overviewRun.ts` `scrollTarget`의 `wait` 분기를 포함한다.
- **끝 여백과 따라가기**: `followStep`/`nextFollow`의 표 테스트.
  - 여백이 바뀔 때 바닥을 유지한다. 그때 `behind`는 생기지 않는다.
  - 여백이 바뀌어도 새 내용이 있으면 `behind`가 생긴다.
  - hold 관련 경우는 지운다.

## 형식, 규약, 결정에 미치는 영향

- **형식**: 없다. JSON Schema, 이벤트, 히스토리를 바꾸지 않는다.
- **규약(ARCHITECTURE §1)**: 없다.
- **결정**:
  - 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다.
  - PRODUCT의 여러 문장(spec '바뀌는 PRODUCT와 ARCHITECTURE 문장')이 바뀐다. 모두 사용자가 이 feature에서 정했다.
  - ARCHITECTURE §7 'Thread focus'와 프로토타입 창 store의 상태 목록이 바뀐다. 요청과 답의 IPC 계약은 그대로다.

## PoC (T2)

- 구현 전에 `.scratch/`의 짧은 probe로 끝 여백 방식 A와 B를 격리된 실제 앱에서 비교한다. 크기는 280×360(프로토타입 창 최소)과 캔버스 패널 기본이다.
- 비교 항목:
  - 바닥에 붙은 채 성장할 때
  - 접을 때의 clamp
  - Jump to latest의 자리와 거짓 표시 여부
  - 팝오버 위에서 휠을 굴릴 때
  - 펼친 직후 마지막 항목이 가리는지
- 결과와 고른 방식을 design.md 'PoC 결과'에 적는다.

## postmortem에서 가져온 주의점

- 2026-11-23 "An Overview row waiting for a permission answer scrolled to the request but left focus on the row": 진입점마다 권한과 질문 둘 다, 효과가 실행되는 테스트로 포커스를 확인한다. 스크롤은 없어지지만 포커스 이동은 남는다.
- 2026-11-18 "The permission approval card showed the agent's own description of a request instead of what it would run": 팝오버도 `summary`를 앞에, `reason`을 뒤에 둔다.
- 2026-11-13 "A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page": Next와 Send를 같은 요소로 두어 포커스가 떨어지지 않게 한다.
- 2026-11-09 "A quietly opened update popover closed when Agent usage moved focus between two places outside it": 팝오버는 바깥 포커스에 닫히지 않는다. Radix Popover를 쓰지 않는다.

## 드래프트 요청

`/design-draft answer-popover`로 새 드래프트를 그린다. 기존 드래프트 `.doan/canvases/agent-questions.html`은 고치지 않는다(AGENTS.md 'Workflow' `/design-draft` 예외).

- **프레임**:
  - `question-one`
  - `question-steps`: 1, 2, 마지막 단계와 "Question 2 of 3"
  - `permission`
  - `queue`: "1 of 2 requests", 단계 표시와 함께 보이는 경우 포함
  - `collapsed`
  - `stack`: 큐 줄, 예약 줄, Jump to latest, `/` 목록과 겹칠 때
  - `states`: 보내는 중, 실패, 끝난 뒤 스레드의 접힌 줄
  - `widths`: 캔버스 패널 280, 기본, 최대, 프로토타입 창 280×360과 347, Overview 720
  - `motion`: 등장, 접기, 펼치기, reduced motion
  - `copy`
- **스타일 후보**: 바탕과 그림자, 패널 폭 전체인지 안쪽 여백이 있는지, 스레드 영역 바닥에 붙는지 떠 있는지, 접힌 막대의 모양. 후보를 그려 두고 사용자가 앱에서 고른다.
- **문구**: 단계 표시, 요청 순서, 접기 버튼과 막대의 이름, "Skip all". `clarify` 프리셋으로 정한다.

## 드래프트에서 정한 것 (사용자)

- **바탕**: A. 흰 바탕에 떠 있는 그림자(`--shadow-floating`)다.
- **접힌 막대**: A. 펼친 팝오버의 머리줄만 남긴다.
- **높이 상한**: 모든 크기에서 `min(70%, 100% − 40px)`이다. 프로토타입 창 280×360에서 본문이 보이지 않아도 상한을 풀지 않는다.
- **버튼 줄**: 좁은 폭(248–315)에서만 Back과 Next가 둘째 줄로 내려간다. Next의 세로 위치가 단계마다 바뀌는 것은 받아들인다.
- **"Skip all" 실패 문구**: 출시된 "Couldn't skip the question. Try again."을 다시 쓴다.
- **접힌 막대의 제목**: 좁은 폭에서 제목이 말줄임표로 잘리는 것을 받아들인다. 요청 순서는 끝까지 보인다.
- **모션**: 등장, 접기, 펼치기는 모두 `--time-thread-enter`(400ms)다. 등장은 `--ease-enter`, 접기와 펼치기는 `--ease-settle`을 쓴다. 본문은 `--time-fast`로 접을 때 먼저 사라지고 펼칠 때 마지막에 나타난다. 스레드 끝 여백은 ease 없이 바로 맞춘다. reduced motion에서는 모두 바로 바뀐다.
- **스크롤바**: 본문은 출시된 `.doan-scroll`을 쓴다.
- **확정**: 사용자가 `.doan/canvases/answer-popover.html`을 확정했다. 초안의 변경 요청(권한 명령의 mono 인셋 블록, 질문 머리의 "<Provider> needs your answer", 흰 바탕의 `subtle` 보조 버튼, 버튼 순서, 권한 보내는 중의 스피너와 잠금)도 초안대로 따른다.

## 읽은 design preset

- `shape`: 기존 화면을 넓히는 경우의 규칙. 시각 체계는 지금 앱의 것을 이어받고, 새로 정할 것은 자리, 단계, 접기, 상태다.
