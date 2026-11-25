# 답 팝오버 — design

## 영향 범위

- **app (renderer)**:
  - `ConversationThread.tsx`: 기다리는 `permission`·`question` 항목을 스레드에서 그리지 않는다. 끝난 항목의 접힌 줄은 그대로 그린다. `QuestionCard`와 권한 notice의 몸체를 팝오버로 옮긴다.
  - 새 컴포넌트(팝오버와 접힌 막대): 스레드와 composer 사이, 대화 패널 안에 겹쳐 그린다.
  - `questionDraft.ts`: 질문 단계(지금 몇 번째 질문인지)를 초안 상태에 더한다.
  - 진입점: `CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, 프로토타입 창의 대화 패널. 지금 `scrollToItem`/`focusItem`으로 요청으로 스크롤하던 곳이 "팝오버를 펼치고 포커스"로 바뀐다.
  - `threadMotion.ts`와 `ThreadBody`의 따라가기: 기다리는 카드로 스크롤했을 때의 멈춤(hold) 규칙을 지우고, 팝오버 높이만큼의 끝 여백을 다룬다.
  - `styles.css`: 팝오버, 접힌 막대, 스레드 끝 여백.
- **app (main)**: 바뀌지 않는다. 요청과 답의 IPC, 만료, 알림은 그대로다.
- **CLI, 스킬, 포맷**: 바뀌지 않는다. 대화 이벤트(`permission.request`, `question.request` 등)와 히스토리 형식은 그대로다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- **`waitingRequests(items)`**: 스레드 항목에서 기다리는 권한 요청과 질문을 먼저 온 순서로 돌려준다. 팝오버는 첫 번째를 보여 주고, 그 길이로 "1 of N"을 만든다.
  - 권한과 질문이 섞인 경우
  - 끝난 요청이 빠지는 경우
  - 같은 요청의 resolved 이벤트가 먼저 온 경우(다른 창이 먼저 답했다)
- **질문 단계 리듀서**(`questionDraft.ts`에 더한다):
  - `next`는 지금 질문에 답이 있을 때만 움직인다. `back`은 첫 질문이 아닐 때만 움직인다.
  - 마지막 단계인지 판정한다(Next 자리에 Send).
  - Send 가능 여부는 지금처럼 모든 질문에 답이 있을 때다.
  - 단계를 옮겨도 각 질문의 답은 남는다.
  - 실패한 send 뒤에도 단계와 답이 남는다.
  - 답의 기준(하나 고름, 여러 선택은 하나 이상, Other는 공백이 아닌 글)은 지금 함수를 그대로 쓴다.
- **팝오버 표시 상태**: 요청 id별 접힘 여부.
  - 새 요청은 펼친 상태로 시작한다.
  - 접힌 동안 새 요청이 오면 펼친다.
  - 접힘 상태는 다른 대화에 다녀와도 남고, 요청이 끝나면 지운다.
- **Next·Send가 꺼진 이유 문구**: 지금 질문에 답이 없을 때와 마지막 단계에서 답하지 않은 질문이 남았을 때의 tooltip 문구. 문구는 드래프트의 `copy` 프레임에서 `clarify` 프리셋으로 정한다.
- **스레드 끝 여백**: 팝오버나 막대의 높이에서 스레드 끝 여백을 구한다. 따라가기가 그 여백의 변화를 성장으로 보고 바닥을 유지하는지는 `followStep`/`nextFollow` 표 테스트로 고정한다.

## 동작 세부

- **자리와 크기**:
  - 팝오버는 대화 패널의 스레드 영역 위에 겹치고, composer 위쪽 가장자리에 붙는다. 폭은 스레드 열과 같다. 캔버스 패널 280~356, 프로토타입 창 347, Overview의 넓은 열을 모두 다룬다.
  - 최대 높이를 넘으면 팝오버 안에서 스크롤하고, 버튼 줄은 늘 보인다.
  - 높이 상한, 바탕, 그림자, 모서리, 접힌 막대의 모습은 드래프트가 정한다.
- **여백**: 스레드 끝에 팝오버(또는 막대) 높이만큼 여백을 둔다. 그래서 바닥까지 스크롤하면 마지막 항목이 팝오버 위에 보인다. 높이는 ResizeObserver로 잰다.
- **포커스**:
  - 팝오버는 modal이 아니다. focus trap이 없고, 바깥 클릭에 닫히지 않는다.
  - Esc는 포커스가 팝오버 안에 있을 때만 접는다. Esc 핸들러는 팝오버 안에서 멈춰서 바깥(캔버스 도구의 Esc 등)으로 가지 않는다.
  - 펼칠 때 포커스를 옮기는 것은 진입점과 막대 누르기뿐이다. 새 요청이 와도 포커스는 그대로다.
  - 단계를 옮기면 포커스는 그 질문의 첫 선택지로 간다. 마지막 단계로 오면 Send가 Next와 같은 자리에 있으므로, 버튼이 바뀌어도 포커스가 문서로 떨어지지 않게 같은 요소를 유지한다(postmortem 2026-11-13).
- **알림**: 새 요청은 지금처럼 `role="alert"` 한 번이다. 다음 요청으로 바뀔 때도 그 요청의 제목을 한 번 읽어 준다.
- **세 화면**: 같은 컴포넌트를 쓴다. 진입점의 "펼치고 포커스"는 화면마다 테스트한다(postmortem 2026-11-23의 예방 규칙: 화면마다 권한과 질문 둘 다).
- **다른 창**: 같은 대화가 메인 창과 프로토타입 창에 함께 보이면, 각 창이 자기 팝오버와 접힘 상태와 초안을 가진다(지금 초안 규칙과 같다). 한 창에서 답하면 다른 창의 팝오버는 resolved 이벤트로 닫힌다.

## 형식, 규약, 결정에 미치는 영향

- **형식**: 없다. JSON Schema와 이벤트, 히스토리를 바꾸지 않는다.
- **규약(ARCHITECTURE §1)**: 없다. `doan check` 규칙도 그대로다.
- **결정**:
  - 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다.
  - PRODUCT의 '§5 item 3 Questions', 권한 notice, 진입점의 스크롤 규칙('Opening'), 'Thread motion'의 hold 규칙이 바뀐다. 모두 사용자가 이 feature에서 정한 것이다.
  - ARCHITECTURE §7 'Agent conversation runtime and IPC'의 요청과 답 계약은 그대로다.

## PoC 의존

- 없다. 오버레이와 ResizeObserver, 기존 초안 상태로 만든다. 프로토타입 창 패널(347)에서 팝오버가 composer와 스레드를 함께 덮는 높이는 드래프트에서 확인한다.

## postmortem에서 가져온 주의점

- 2026-11-23 "An Overview row waiting for a permission answer scrolled to the request but left focus on the row": 진입점마다 권한과 질문 둘 다, 효과가 실행되는 테스트로 포커스를 확인한다. 이 feature로 스크롤은 없어지지만 포커스 이동은 남는다.
- 2026-11-18 "The permission approval card showed the agent's own description of a request instead of what it would run": 팝오버도 `summary`(실행할 것)를 앞에, `reason`(에이전트의 말)을 뒤에 둔다. 내용 규칙은 바꾸지 않는다.
- 2026-11-13 "A toolbar control that turned unavailable while focused was mounted anew and focus fell to the page": Next와 Send를 같은 자리에서 바꿀 때 컴포넌트 트리를 유지해 포커스가 떨어지지 않게 한다.
- 2026-11-09 "A quietly opened update popover closed when Agent usage moved focus between two places outside it": 이 팝오버는 Radix popover처럼 바깥 포커스에 닫히지 않아야 한다. 포커스 없이 열리고, 바깥 포커스에 닫히지 않는다.

## 드래프트 요청

`/design-draft answer-popover`로 새 드래프트를 그린다. 질문 카드의 기존 드래프트 `.doan/canvases/agent-questions.html`은 고치지 않는다(AGENTS.md 'Workflow' `/design-draft` 예외: 이미 develop에 있는 화면의 새 모습).

- **프레임**:
  - `question-one`: 질문 하나
  - `question-steps`: 여러 질문의 1, 2, 마지막 단계(Next, Back, Send, "2 of 3")
  - `permission`: 권한 요청
  - `queue`: "1 of 2"
  - `collapsed`: 접힌 막대
  - `states`: 보내는 중, 실패, 끝난 뒤 스레드의 접힌 줄
  - `widths`: 280, 347, Overview 넓은 열
  - `copy`: 문구
- **스타일 후보**: 바탕과 그림자, 패널 폭 전체인지 안쪽 여백이 있는지, composer와 붙는지 띄우는지, 접힌 막대의 모양. 후보를 그려 두고 사용자가 앱에서 고른다.
- **문구**: Next와 Send가 꺼진 이유, 단계 표시("2 of 3"), 접기 버튼과 막대의 이름. `clarify` 프리셋으로 정한다.

## 읽은 design preset

- `shape`: 기존 화면을 넓히는 경우의 규칙. 시각 체계는 지금 앱의 것을 이어받고, 새로 정할 것은 자리, 단계, 접기, 상태다.
