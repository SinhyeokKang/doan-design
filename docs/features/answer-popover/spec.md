# 답 팝오버 — spec

에이전트의 권한 요청과 질문을 스레드 항목이 아니라 스레드 영역 바닥, composer 바로 위에 뜨는 팝오버로 보여 준다. 질문이 여러 개면 하나씩 차례로 답하고, 마지막에 한 번에 보낸다. 모습(크기, 바탕, 그림자, 접힌 막대, 등장 모션)은 드래프트에서 정한다.

## 사용자

- **사람**: 캔버스 패널, Overview의 프로젝트 대화, 프로토타입 창의 대화 패널에서 에이전트와 대화하는 사람이다. 스레드를 어디까지 스크롤했든 답을 기다리는 요청을 바로 보고 답한다.
- **에이전트**: 바뀌는 것이 없다. 권한 요청과 질문의 내용, 답의 형식, 대화 이벤트는 그대로다.

## 문제

- 권한 요청과 질문은 지금 스레드의 마지막 항목으로 들어간다(PRODUCT §5 item 3 'Questions', 권한 notice). 사람이 위쪽을 읽고 있으면 요청은 화면 밖에 있다. 상태 표시("<Provider> needs your answer")는 있지만, 답하려면 스레드 끝까지 스크롤해야 한다.
- 그래서 진입점마다 요청으로 스크롤하고 포커스를 옮기는 규칙이 필요했고, 그 규칙에서 결함이 났다(postmortem 2026-11-23 "An Overview row waiting for a permission answer scrolled to the request but left focus on the row"). 스레드 모션에도 "기다리는 카드로 스크롤했으면 따라가기를 멈춘다"는 예외 규칙이 따로 있다.
- 질문이 여러 개면 한 카드에 모든 질문과 선택지가 펼쳐진다. 카드가 길어서 스레드를 많이 차지하고, 어디까지 답했는지 한눈에 보이지 않는다.

## 확정한 결정 (사용자)

- 권한 요청과 질문 모두 팝오버로 옮긴다.
- 팝오버는 스레드 영역 바닥, composer 바로 위에 겹쳐 뜬다. 스레드 스크롤과 관계없이 늘 보인다.
- composer는 팝오버가 떠 있어도 지금 규칙대로 쓴다. 큐에 넣기와 Send now도 그대로이고, 그렇게 보낸 메시지는 지금처럼 답이 아니다. composer의 플레이스홀더는 바꾸지 않는다.
- 팝오버는 접을 수 있다. 접으면 한 줄 막대가 남고, 누르면 다시 펼친다. 접힘 상태는 대화마다 하나다.
- 끝난 요청은 스레드에 지금과 같은 접힌 줄로 남는다.
- 질문이 여러 개면 한 번에 하나씩 보여 준다. Next와 Back으로 오가고, 마지막 질문에서는 Next 자리가 Send가 된다. 모든 답을 한 번에 보낸다. 질문이 여러 개인 요청의 Skip은 "Skip all"이다.
- 답을 기다리는 요청이 여럿이면 한 번에 하나씩, 먼저 온 것부터 보여 주고 순서를 표시한다.
- 진입점은 팝오버가 보여 주는 요청(가장 먼저 온 것)으로 간다.
- 적용하는 곳은 대화를 보여 주는 모든 곳이다: 캔버스 패널, Overview의 프로젝트 대화, 프로토타입 창의 대화 패널.
- 모습은 드래프트(`/design-draft`)에서 보고 정한다.

## 완료 조건

1. **자리**:
   - 답을 기다리는 요청이 있으면 팝오버가 그 대화의 스레드 영역 바닥에 뜬다. 쌓이는 순서는 아래에서 위로 composer, 큐 줄과 예약 줄, 팝오버, Jump to latest다.
   - 스레드를 맨 위로 스크롤해도, 스레드가 짧아도 같은 자리에 있다. 세 화면 모두에서 팝오버 아래 가장자리가 스레드 영역 바닥과 같다(T5에서 잰다).
   - composer의 `/` 목록과 피커들은 팝오버 위에 그린다.
2. **크기**:
   - 폭은 스레드 열과 같다. Overview에서는 720 열에 맞춘다.
   - 높이 상한은 스레드 영역에 대한 상대값이다. 그래서 짧은 창에서도 스레드의 일부가 보인다. 상한을 넘으면 본문만 스크롤하고, 머리줄과 버튼 줄은 늘 보인다.
   - 지원하는 범위는 캔버스 패널(280에서 창 폭의 절반까지), 프로토타입 창(최소 높이 360, 패널 280부터), Overview다.
3. **스레드**:
   - 기다리는 동안 스레드에는 그 요청의 카드가 없다.
   - 요청이 끝나면 스레드의 이벤트 순서 자리에 지금과 같은 접힌 줄이 생긴다. 질문은 "Answered · …", "Skipped · …", "Expired without an answer · …"이고, 권한은 "Allowed once · …", "Always allowed · …", "Denied · …", "Expired without an answer · …"다.
   - 기다리는 동안 Send now로 보낸 메시지도 이벤트 순서대로 놓인다. 접힌 줄은 그 메시지보다 위에 있을 수 있다.
4. **권한 요청**:
   - 팝오버는 지금 권한 notice와 같은 내용을 같은 순서로 보여 준다: 제공자 로고, "<Provider> needs your answer", 실행할 것의 요약, 에이전트의 이유, 저장되는 선택의 설명. 같은 선택 버튼과 Stop도 있다.
   - 버튼을 누르면 응답이 올 때까지 다른 버튼은 잠기고, Stop만 살아 있다.
   - 보내지 못하면 "Couldn’t send your answer. Choose again."이 팝오버 안에 보인다.
5. **질문 하나**: 지금 질문 카드의 규칙이 팝오버 안에서 그대로다: 선택지, Other, 비밀 답 가림, Send·Skip·Stop, 보내는 중, 실패 문구, Send가 꺼진 이유 tooltip("Choose or type an answer first.").
6. **질문 여럿**:
   - 한 번에 한 질문을 보여 주고, 단계를 "Question 2 of 3"처럼 표시한다.
   - Next는 지금 질문에 답이 있어야 켜진다. 꺼져 있을 때 이유는 "Choose or type an answer first."다.
   - Back은 첫 질문이 아니면 있다. 앞의 답은 그대로 남는다.
   - 마지막 질문에서는 Next 자리에 Send가 온다. Send는 지금 질문에 답이 있으면 켜지고(앞 질문은 Next를 거쳤으므로 답이 있다), 모든 답을 한 번에 보낸다. "Answer each question first."는 쓰지 않는다.
   - Next와 Send는 모든 단계에서 같은 x 위치에 있다.
   - "Skip all"과 Stop은 어느 단계에서나 요청 전체에 대해 동작한다.
   - 보내지 못하면 모든 답과 지금 단계가 그대로 남고, 팝오버가 접혀 있었으면 펼친다.
7. **여러 요청**:
   - 기다리는 요청이 둘 이상이면 먼저 온 것 하나만 보이고, 머리줄에 "1 of 2 requests"처럼 순서가 보인다. 접힌 막대도 같은 수를 보여 준다.
   - 그 요청이 끝나면 다음 요청으로 바뀐다. 권한 요청과 질문이 섞여도 같다.
8. **접기**:
   - 팝오버에는 접기 버튼("Collapse")이 있다.
   - 접힌 막대는 제공자 로고와 "<Provider> needs your answer"를 보여 준다. 막대를 누르면(Return, Space 포함) 팝오버가 펼쳐지고 포커스가 첫 선택지로 간다.
   - 접힘 상태는 대화마다 하나다. 새 요청이 오거나 보내기가 실패하면 펼친다. 기다리는 요청이 없어지면 지운다. 다른 대화나 캔버스에 다녀와도 남고, 창을 다시 불러오면 없어진다. 질문 단계와 고르던 답도 같다.
9. **키보드**:
   - 방향키, Space, Other를 고르면 칸으로 포커스가 가는 규칙은 그대로다.
   - Other 칸의 Return은 마지막 단계에서는 Send, 그 전 단계에서는 Next다. 둘 다 켜져 있을 때만 동작하고, IME 조합 중에는 동작하지 않는다.
   - Esc는 포커스가 팝오버 안에 있을 때 동작한다. 열린 tooltip이 있으면 그것을 먼저 닫고, 없으면 팝오버를 접고 포커스를 composer로 보낸다. IME 조합을 끝내는 Esc는 접지 않는다. 막대에서의 Esc는 아무것도 하지 않는다. 어느 경우든 Esc는 팝오버 바깥(캔버스 도구 등)으로 가지 않는다.
   - 펼치면서 포커스를 받은 버튼은 키 자동 반복으로 눌리지 않는다. Return을 누르고 있어 권한이 허용되는 일이 없다.
10. **포커스와 알림**:
    - 새 요청은 포커스를 옮기지 않는다. 보이는 요청이 바뀔 때마다 그 요청의 제목을 한 번 읽어 준다.
    - 보이는 요청이 끝나거나 바뀔 때 포커스가 팝오버 안에 있었으면, 포커스는 다음 요청의 첫 선택지로, 없으면 composer로 간다. 이 요청이 끝나는 경우는 답, Skip, Stop, 다른 창의 답, 만료, 턴 종료, CLI 취소 모두다. 다른 창이 답해서 닫힐 때는 실패 줄이 없다.
    - 단계를 옮기거나 Back하면 그 질문의 고른 선택지에 포커스가 간다. 고른 것이 없으면 첫 선택지, 선택지가 없으면 답 칸이다.
    - 팝오버는 modal이 아니다. 포커스를 가두지 않고, 바깥 클릭이나 바깥 포커스로 닫히지 않는다. Tab 순서는 스레드 → 팝오버 → composer다.
    - 팝오버는 `role="region"`이고 이름은 "<Provider> needs your answer"다. 질문 그룹의 이름에 단계("Question 2 of 3")가 들어간다. 접기 버튼과 막대는 `aria-expanded`를 가진다.
11. **진입점**: 요청으로 스크롤하고 포커스를 옮기던 진입점은 이제 스크롤하지 않는다. 팝오버를 펼치고, 보이는 요청(가장 먼저 온 것)의 첫 선택지에 포커스를 둔다. 질문은 지금 단계의 고른 선택지나 첫 선택지, 선택지가 없으면 답 칸이고, 권한은 첫 버튼이다. 진입점은 다음과 같다.
    - 토스트와 알림의 Open
    - 보드 agent notice의 Open
    - 사이드바 슬롯
    - Overview의 대화 행(이미 보이는 대화의 행 포함)
    - 캔버스 패널의 Show conversation 배지
    - 캔버스 패널의 제목 메뉴
    - 프로토타입 창의 Show conversation 배지
12. **스레드 모션**:
    - "기다리는 카드로 스크롤하면 그 카드가 끝날 때까지 따라가기를 멈춘다"는 규칙은 없어진다.
    - 스레드 아래쪽이 팝오버에 가리지 않도록, 팝오버나 막대의 높이만큼 스레드 끝에 여백이 생긴다. 바닥에 붙어 있으면 여백이 바뀌어도 바닥을 유지한다. 여백이 바뀌는 것은 새 내용이 아니므로 Jump to latest를 띄우지 않는다.
    - 요청이 오면 펼쳐지던 답은 지금처럼 곧바로 끝까지 보여 준다.
    - 팝오버의 등장, 접기, 펼치기 모션은 드래프트에서 정하고, reduced motion에서는 없다.
13. **다른 규칙은 그대로다**: 상태 표시, 사이드바 슬롯의 점, 토스트, 알림, Delete, Stop, 재시작 뒤 만료, turn indicator가 기다리는 동안 없는 것, docked buddy가 비켜서는 것(접혀 있어도 비켜선다), 문제 workspace strip, 문제 overlay 아래에서 덮인 내용이 inert인 것(팝오버 포함).
14. **화면이 없을 때**: 패널이 접혀 있거나 프로토타입 창이 닫혀 있으면 팝오버도 없고, 지금의 배지 규칙을 따른다.
15. 모습은 사용자가 앱에서 확정한 드래프트와 같다(`/design-sync`로 잰다).

## 바뀌는 PRODUCT와 ARCHITECTURE 문장 (T6)

- PRODUCT §5 item 3 'Questions': "waits in the thread as a card", 키보드 "Return on a choice and Esc do nothing", Send의 이유 문구("Answer each question first."), Skip의 이름, 진입점의 "scrolls to and focuses its newest request"
- 권한 요청 문단(notice의 자리)
- item 2 'Conversation panel' 'Opening'의 "scrolls to the newest unanswered request"와 Overview 'Conversations' Opening의 "scrolls to its latest unanswered request"
- item 2 'Prototype window'의 배지("a permission request scrolled to as from the main window")
- 'Send now'의 "an open permission request or question card stays last, below it"
- 'Canvas cards' 'Place'의 "a waiting permission or question card"
- 'Thread motion'의 카드 목록과 hold 문장, 'End of a reply'의 "any item that comes after the reply (a permission or question card …)"
- item 1 'Docked buddy'의 "waits on a permission or question card"
- ARCHITECTURE §7 'Renderer primitives' 'Thread focus'(카드가 접힐 때의 포커스)와 프로토타입 창 store가 가진 상태 목록

## 비목표

- 권한 요청과 질문의 내용, 선택지, 답의 형식, 대화 이벤트와 저장 형식 변경.
- composer 플레이스홀더나 composer 규칙 변경.
- 팝오버를 대화 패널 밖(창 전체)이나 다른 대화로 띄우는 것.
- 단일 선택을 고르면 다음 질문으로 저절로 넘어가는 것.
- 여러 요청을 팝오버에 한꺼번에 쌓아 보여 주는 것.
- Home의 docked composer. Home에는 대화 스레드가 없다.
