# prototype-conversation — spec

출처: docs/BACKLOG.md 'Undecided'의 "Prototype conversation" 항목, 진행 중 사용자 결정, `/feature-review` 결과. 아래 동작은 모두 사용자가 정했다('결정'). 남은 미확인은 design.md 'PoC 의존'뿐이다.

용어는 형제 feature `prototype-responsive`를 따른다. **Fit 모드**(기본)와 **Responsive 모드**는 프레임 viewport의 크기 규칙이고, **창 맞춤**은 Play가 창 크기를 표시 크기에 맞추는 일(`fitPrototypeWindow`)이다. **프레임 열**은 창에서 대화 열을 뺀 부분(콘텐츠 패널)이고, **콘텐츠 패널**은 프레임이 그려지는 상자다(창 폭 360일 때 344).

## 결정 (사용자 확인)

1. **composer 초안**: 창마다 따로다. 프로토타입 창을 닫으면 그 창의 초안은 버린다.
2. **권한 요청·질문 카드**: 두 창 모두에서 답하고, 먼저 도착한 답이 이긴다.
3. **재생 프레임 칩**: composer 위에 고정되고 지울 수 없으며 프레임 전환을 따른다. 보낼 때 메시지 맨 앞에 넣는다. 그래서 대화 제목과 미리보기가 프레임 이름으로 시작하는 것을 받아들인다. 필드가 이미 같은 재생 프레임 칩으로 시작하면 다시 넣지 않는다.
4. **패널 배치**: Chrome DevTools처럼 패널이 프레임 열의 폭을 가져간다. 창 폭이 640보다 좁을 때 열면 창을 640으로 넓히고 패널은 280으로 연다. 640 이상이면 창 크기를 유지한다. 닫아도 창 크기를 유지한다. 작업 영역이 640보다 좁으면 작업 영역 폭까지만 넓힌다.
5. **패널 최대폭**: canvas 패널 규칙 `min(50dvw, 프레임 열을 360 남기는 폭)`.
6. **패널을 연 채 Play**: 창을 표시 크기 + 패널 폭으로 맞춘다. 작업 영역보다 넓으면 패널을 먼저 280까지 줄이고, 그다음 프레임 열을 줄인다. 패널을 열어 640이 된 창(프레임 열이 좁아짐)과 패널을 연 채 Play한 창(표시 폭 유지)이 다르게 보이는 것은 그대로 둔다.
7. **thread 칩과 main 창 전용 버튼**: 프로토타입 창 thread의 칩, 그리고 Sign in, 그리기 중인 프로젝트 대화의 Open, handoff 줄·카드의 Open, 승격 알림의 Open은 main 창을 앞으로 가져와 거기서 처리한다. main 창에 dialog나 페이지 잠금이 있으면 취소하지 않고, main 창을 앞으로 가져와 "Couldn’t show <칩 이름>."과 이유를 토스트로 보인다.
8. **패널 부품**: main 창 패널과 같다. 제안 프롬프트, 터미널 세션 이어 가기, docked buddy, 텍스트 편집 메뉴, 첨부가 모두 있다. 머리(제목 메뉴, New conversation, Hide)만 없다.
9. **패널 상태**: 열림과 폭은 앱이 도는 동안 main 메모리에 둔다.
10. **헤더**: 툴바 줄은 없고 컨트롤은 모두 헤더에 있다. 왼쪽 [Back, Forward, Reload prototype], 가운데 프레임 이름, 오른쪽 [Fit·Responsive 토글, Export prototype, 대화 버튼]이고, 이 feature는 오른쪽 무리 끝에 대화 버튼을 더한다(`prototype-responsive`, `prototype-cli-export`의 결정). 너비가 모자라면 프레임 이름 캡슐이 헤더 둘째 줄로 내려가고 헤더가 그만큼 두꺼워진다.
11. **에이전트 문맥**: 프레임 앵커만 싣고 프롬프트는 바꾸지 않는다. `/agent-eval`은 하지 않는다.
12. **큐에서 돌아온 초안**: 그 대화를 먼저 보여 준 창이 가져간다. 단, 프로토타입 창이 닫혀 있으면 main 창 store만 가져가므로 잃지 않는다.
13. **목록 읽기 실패**: thread 자리에 오류 한 줄과 Retry를 둔다. composer는 초안을 지키고 보내지 못한다.
14. **main에서 새 대화가 시작될 때**: 프로토타입 창이 앞 대화에 쓰던 초안은, 새 현재 대화에 초안이 없으면 그쪽으로 옮긴다.
15. **작업 중 배지**: 패널이 닫혀 있는 동안 대화가 일하면 대화 버튼에 작업 중 배지를 단다.
16. **Tab 순서**: 헤더(Back, Forward, Reload, 프레임 이름, 모드 토글, Export, 대화 버튼) → 프레임 콘텐츠 → 대화 패널(`prototype-responsive`와 같다). 헤더가 DOM에서 프레임 앞에 있어서, 프레임의 Tab 정지나 focus trap이 헤더 컨트롤을 막지 못한다.
17. **포커스 지키기**: 캔버스가 다시 로드되어도 composer의 포커스(IME 조합 포함)를 빼앗기지 않는다.
18. **구현·병합 순서**: `prototype-responsive` → `prototype-cli-export` → `prototype-conversation`(직렬 체인).

## 사용자

- **사람**: 프로토타입 창에서 프레임을 직접 눌러 보면서, 창을 바꾸지 않고 에이전트에게 말한다.
- **에이전트**: 바뀌는 것이 없다. 메시지는 지금처럼 캔버스 대화의 한 턴으로 오고, 재생 중인 프레임이 프레임 앵커(칩) 하나로 맨 앞에 붙어 온다. 프롬프트, CLI, guide, 스킬 stub은 그대로다.

## 문제

- 프로토타입 창(PRODUCT §5 item 2 'Prototype window')에는 대화 수단이 없다. 프레임을 눌러 보다가 "이 버튼이 눌리지 않는다"를 말하려면 main 창으로 돌아가 캔버스를 열고, 프레임을 Pick으로 다시 집어 패널에 써야 한다.
- 프로토타입 창은 지금 의도적으로 main 창과 아무것도 나누지 않는다. "Nothing in the window reaches the main window's selection, `doan active`, drafts, attachments or settings"(PRODUCT §5 item 2), "The prototype window's main frame … may call only its own requests, and the main window's guard is not widened"(ARCHITECTURE §3 'Sender role'). 대화 IPC는 main 창의 main frame만 부를 수 있고, `conversation:event`·`conversation:stage`는 main 창에만 간다(ARCHITECTURE §7 'Agent conversation runtime and IPC' 'IPC contract').

## 범위

### 헤더 버튼

- 프로토타입 창 헤더는 왼쪽 [Back, Forward, Reload prototype], 가운데 프레임 이름, 오른쪽 [Fit·Responsive 토글, Export prototype]이고, 이 feature가 오른쪽 무리 끝(Export 뒤 4, 창 오른쪽 끝 16 안쪽)에 대화 버튼을 더한다. 그래서 오른쪽 무리 폭은 140이다.
- 프레임 이름은 두 무리 사이를 양옆 8씩 남기고 채운다(`prototype-responsive` spec '헤더'). 캡슐의 가장 좁은 폭은 80이다. 대화 버튼까지 있으면 캡슐은 창 폭 444부터 첫째 줄에 있고, 443 이하에서는 헤더 둘째 줄(높이 44, x16부터 창 폭 − 16까지, 헤더 100)로 간다. traffic light와 두 무리는 첫째 줄에 남고, 콘텐츠 패널과 대화 열은 y100에서 시작한다. 이름은 언제나 보이고 프레임 메뉴는 언제나 열 수 있다. 예: 640 창 캡슐 276, 480 창 116, 444 창 80, 360 창 둘째 줄 328.
- 창 폭이 경계를 지나면(사람이 끌 때, 패널을 열어 360 창이 640이 될 때) 같은 캡슐이 줄을 옮기고, 콘텐츠 패널과 대화 열이 애니메이션 없이 44 움직인다. 포커스와 열린 메뉴는 캡슐에 남는다.
- 대화 버튼은 패널이 닫혀 있으면 "Show conversation"(`PanelRightOpen`), 열려 있으면 "Hide conversation"(`PanelRightClose`)이다. main 창의 같은 이름 버튼과 같은 아이콘·크기·`aria-expanded`·`aria-controls`를 쓴다. 상태가 바뀌어도 같은 버튼 요소다.
- 대화 버튼은 첫 view 전에도 쓸 수 있다. 패널은 재생 중인 프레임에 기대지 않는다.
- 패널이 닫혀 있는 동안 버튼은 배지를 단다.
  - 보여 줄 대화가 답을 기다리면 점: "Show conversation, needs your answer".
  - 끝났는데 아직 보지 않았으면 말풍선: "Show conversation, conversation finished unread".
  - 일하는 중이면 작업 중 배지: "Show conversation, agent is working". main 창에는 보드 글로가 있지만 프로토타입 창에는 agent indicator가 없어서, 에이전트가 고치는 동안 프레임이 이유 표시 없이 다시 로드되기 때문이다. 모양은 사이드바의 working 표시를 옮긴다: unread bubble 자리의 14px 중립 스피너(`.doan-spinner`)다.
  - 둘 이상이면 답 대기 > 작업 중 > 안 읽음 순으로 하나만 보인다.
- 에이전트가 시작하거나, 묻거나, 끝나도 패널은 저절로 열리지 않는다(main 패널 규칙과 같다).

### 패널 배치

- 패널은 Chrome DevTools처럼 옆에서 밀고 들어와 프레임 열의 폭을 가져간다. 창은 넓어지지 않는다(아래 640 규칙만 예외). 프레임이 좁아 보기 어려우면 사람이 창을 직접 키운다.
  - Responsive 모드에서는 콘텐츠 패널이 좁아지는 만큼 `innerWidth`와 media query가 줄어든다.
  - Fit 모드에서는 viewport가 표시 크기를 지키고, 콘텐츠 패널이 표시 크기보다 좁아지면 비율을 지켜 줄여 보인다(`prototype-responsive` 결정 1).
- 툴바 줄은 없다. 대화 열은 콘텐츠 패널 옆에서 헤더 아래부터 창 아래 8까지 내려가 콘텐츠 패널과 높이가 같다.
- 프레임 열의 최소폭은 360이다(창 최소폭 360, `PROTOTYPE_WINDOW_MIN_WIDTH`와 같다). 즉 창 폭 − 패널 폭 ≥ 360이다.
- 패널이 열려 있는 동안 창의 최소폭은 360 + 패널 최소폭 280 = 640이다. 창이 640보다 좁을 때(360이든 480이든) 패널을 열면 창이 정확히 640으로 넓어지고, 패널은 최소폭 280으로 열린다. 480 창은 640이 되고 콘텐츠 패널은 464에서 344가 된다. 창은 작업 영역 안에 머물도록 옮긴다(기존 `fitPrototypeWindow` 규칙. PoC로 확정한다).
- 이미 640 이상인 창은 크기를 유지한다. 패널은 canvas 패널 규칙의 기본폭(`max(320px, 28dvw)`)으로 열리되, 최대폭으로 자른다.
- 패널 최대폭은 canvas 패널 규칙 `min(50dvw, 프레임 열을 360 남기는 폭)`이다(DESIGN.md 'Panel width'). 패널은 왼쪽 가장자리의 손잡이로 폭을 조절한다(main 패널의 손잡이와 같다).
- 패널을 닫아도 창 크기는 그대로이고, 패널이 쓰던 폭이 프레임 열에 돌아간다. 창 최소폭은 다시 360이 된다.
- 작업 영역이 640보다 좁으면 창은 작업 영역 폭까지만 넓어지고, 패널은 280으로 열리며, 프레임 열이 360보다 좁아지는 것을 받아들인다.
- 패널이 열린 채 새로 Play하면(main 창의 Play, 드로어, Back/Forward, `doan open --prototype`) 창 콘텐츠를 폭 = 표시 폭 + 16 + 패널 폭(최소 640), 높이 = 표시 높이 + 64(헤더 56 + 아래 여백 8)로 맞추고, 맞춘 폭에서 이름이 둘째 줄이면 + 108로 맞춘다. 폭이 작업 영역보다 넓으면 패널을 먼저 280까지 줄이고, 그다음 프레임 열을 줄인다. 높이는 작업 영역 높이까지다.
- 패널의 열림 상태와 폭은 앱이 도는 동안 main 메모리에 남는다. 프로토타입 창을 닫았다 다시 열어도 유지되고, 앱을 다시 시작하면 닫힌 상태로 돌아간다. 기기에 저장하지 않는다.

### 패널 내용

- main 창의 캔버스 대화 패널을 머리(head) 없이 다시 쓴다: thread와 docked composer(docked buddy 포함), 그리고 composer 위에 고정된 재생 프레임 칩. 제목 메뉴, New conversation 버튼, Hide conversation 버튼(헤더의 버튼이 대신한다)은 없다. 그래서 프로토타입 창에서는 대화를 바꾸거나 지우거나, 현재 대화가 있을 때 새 대화를 만들 수 없다.
- **보여 주는 대화**: 재생 중인 프레임이 속한 캔버스의 현재 대화(current conversation)다. main 창 패널이 메뉴로 고른 보관된 대화를 보여 주고 있어도 프로토타입 창은 현재 대화를 보여 준다. 현재 대화가 바뀌면(main에서 새 대화를 시작해 앞의 것이 보관되면) 프로토타입 창도 새 현재 대화로 바뀌고, 앞 대화에 쓰던 프로토타입 창 초안은 새 현재 대화에 초안이 없을 때 그쪽으로 옮긴다.
- **현재 대화가 없으면** main 패널과 같은 새 대화 상태가 보인다: Home 규칙의 제안 프롬프트, 그리고 그 캔버스에 이어 갈 터미널 세션이 있으면 그 세션 이어 가기(기본)와 새 대화 사이의 선택(PRODUCT §5 item 2 'Conversation panel' 'Terminal session'). 첫 전송은 그 캔버스에 묶인 새 캔버스 대화를 시작하거나 터미널 세션을 이어 가고, 그 대화가 캔버스의 현재 대화가 되므로 main 창 패널에도 스트리밍된다.
- **목록 읽기 실패**: thread 자리에 오류 한 줄과 Retry를 둔다. composer는 초안을 지키지만 보내지 못하고 이유를 말한다. 보내면 현재 대화가 보관될 수 있기 때문이다(main 패널은 이때 새 대화로 보내게 둔다).
- **같은 대화를 두 창이 함께 보여 준다.** thread, 턴 표시줄, 큐, context ring, 백그라운드 작업 줄, 다음 메시지 제안은 대화마다 하나이므로 두 창에 같은 것이 보인다.
- **재생 프레임 칩**: composer 위에 재생 중인 프레임을 프레임 칩 모양으로 고정해 보여 준다. 칩은 지울 수 없고, 프레임이 바뀌면(드로어, Back/Forward, main 창의 Play, `doan open --prototype`) 따라 바뀐다. 이름은 프레임의 원래 제목(없으면 id)이다. 칩의 툴팁과 접근 설명은 이 칩이 모든 메시지에 함께 간다는 것을 말한다(문구 초안: "Sent with each message"; 정확한 문구는 `/design-draft`에서 clarify 기준으로 정한다).
- **모든 전송이 재생 프레임을 앵커로 싣는다.**
  - 보낼 때 그 프레임의 프레임 앵커(`{frame: {id, title}}`)를 메시지 맨 앞의 칩으로 넣는다. 필드가 이미 같은 재생 프레임 칩으로 시작하면(큐에서 돌아온 초안, Edit and resend, 붙여 넣은 칩) 다시 넣지 않는다.
  - 큐에 들어가는 메시지는 큐에 넣는 순간의 재생 프레임을 싣는다. Send now도 같다.
  - 터미널 세션 이어 가기(resume)와 legacy external 대화로 보낼 때도 싣는다.
  - 이 칩도 32개 장소 한도에 들어간다. 필드의 한도 계산도 재생 프레임을 센다.
  - thread와 main 창 패널에는 보통의 사람 칩으로 보인다. 대화 제목과 미리보기는 칩 이름을 읽으므로 프레임 이름으로 시작한다.
- **composer 초안**: 프로토타입 창은 main 창과 따로 자기 초안을 가진다. 첨부 칩도 창마다 따로다. 같은 대화라도 main 창에서 쓰던 글은 프로토타입 창에 보이지 않고, 그 반대도 같다. 초안은 앱이 도는 동안, 프로토타입 창이 열려 있는 동안만 유지된다. 창을 닫으면 그 창의 초안과 첨부 칩을 버리고, main이 그 창이 쥐고 있던 첨부를 해제한다.
- **큐에서 돌아온 초안**: 실패하거나 멈춘 턴 뒤에 돌아온 큐는 그 대화를 먼저 보여 준 창의 초안으로 들어간다. 프로토타입 창이 닫혀 있으면 main 창 store만 가져간다.
- **권한 요청과 질문 카드**: 두 창 모두에서 답할 수 있고, 먼저 도착한 답이 이긴다. 늦은 쪽은 실패 문구 없이 카드가 접힌다. 질문에서 고르던 중인 선택은 창마다 따로다.
- **첨부**: Attach, 붙여넣기, 드롭은 main 패널과 같다. Attach 대화상자는 프로토타입 창 위에 뜬다. Pick from canvas와 Capture area는 보드가 없으므로 없다.
- **thread 칩과 main 창 전용 버튼**: 다음은 main 창을 앞으로 가져와(숨겨져 있으면 보이게 하고) 거기서 처리한다.
  - 프로토타입 창 thread의 칩(사람의 프레임·요소·지점 칩, 에이전트 답의 프레임·요소 칩). main 창이 그 캔버스를 보여 주고 있으면 main 창의 sent chip이나 답 칩처럼 locate한다. 선택, `doan active`, 패널은 바뀌지 않는다. 아니면 deep link처럼 그 캔버스를 열고(선택이 지워지고, 패널이 그 캔버스의 대화로 바뀌고, Back용 방문 하나가 남는다) 대상으로 옮긴다. 대상이 없으면 "No longer in the canvas"가, 캔버스를 찾을 수 없으면 기존 토스트가 main 창에 보인다.
  - Sign in(Settings > Agents), 그리기 중인 프로젝트 대화의 Open, handoff 줄과 카드의 Open, 승격 알림의 Open. main 창에서 같은 버튼을 누른 것과 같다.
  - main 창에 dialog나 페이지 잠금이 있거나 첫 실행 중이면 그것을 취소하지 않는다. main 창을 앞으로 가져오고, "Couldn’t show <칩 또는 대상 이름>."과 이유를 토스트로 보인다. 예: “Couldn’t show Checkout. A dialog is open. Finish or cancel it, then try again.” 이유 문장은 출시된 deep link의 페이지 잠금·첫 실행 문장에서 “Couldn’t open the link.”를 뺀 것이다(링크를 연 것이 아니므로).
- **composer 막힘**: 캔버스가 목록에서 사라졌거나 ID가 겹치면 main 패널처럼 초안을 지키고 입력을 받지 않으며 이유를 말한다. 프레임이 사라졌거나("Frame unavailable") 마크가 사라졌거나 로드에 실패한 상태에서도 패널은 쓸 수 있다. 사람이 "프로토타입이 안 열린다"를 에이전트에게 말할 수 있어야 하기 때문이다. 이때 칩은 그 프레임의 마지막 id와 제목을 싣는다.
- **seen과 알림**: 프로토타입 창이 포커스를 가졌고, 패널이 열려 그 대화를 보여 주면 그 대화를 본 것으로 기록하고 그 대화의 데스크톱 알림을 보내지 않는다. 다른 대화의 알림은 지금 규칙 그대로다.
- **텍스트 편집 메뉴**: 프로토타입 창의 composer와 패널 글에서 main 창과 같은 텍스트 편집 메뉴가 열린다. 프레임 콘텐츠(캔버스 iframe)에는 지금처럼 메뉴가 없다.
- **포커스**: 패널을 열면 composer 필드로 간다. 닫으면 헤더의 대화 버튼으로 돌아온다. Esc는 패널을 닫지 않는다. Tab 순서는 헤더(Back, Forward, Reload prototype, 프레임 이름, 모드 토글(Tab 정지 하나, 안에서는 ←/→), Export prototype, 대화 버튼) → 프레임 콘텐츠 → 대화 패널이다. 캔버스가 다시 로드되어도(에이전트의 수정, Reload prototype) composer의 포커스와 IME 조합을 프레임 문서가 가져가지 않는다.

### 변하지 않는 것

- 프로토타입 창의 프레임은 새 Play(main 창의 Play, 창의 드로어, Back/Forward, `doan open --prototype`)로만 바뀐다. main 창 이동·숨김은 프로토타입 창을 바꾸지 않는다.
- main 창 쪽으로는 위의 칩과 main 창 전용 버튼만 닿는다. 프로토타입 창의 전송, 답, 초안, 패널 열기는 main 창의 선택, `doan active`, 보기, 패널 접힘 상태를 바꾸지 않는다.
- 캔버스 seen: 캔버스를 프로토타입 창에서만 보면 seen이 아니라는 규칙(PRODUCT §5 item 2 "viewing a canvas only there does not mark it seen")은 그대로다. 바뀌는 것은 대화의 seen뿐이다.
- 프로토타입 창이 포커스를 가졌을 때 main 창의 대화 관련 메뉴(New Conversation, Pick from Canvas)는 꺼져 있다. Edit 메뉴와 Undo/Redo는 포커스된 창의 composer에 작동한다(이미 그렇다: `editHistory`는 포커스된 창의 webContents에 보낸다).
- Last used: 프로토타입 composer의 pick도 "any composer"(PRODUCT §5 item 0 'New conversations')에 들어간다. 저장된 provider가 하나일 때 pick이 provider를 바꾸는 규칙도 같다. 이 밖의 설정은 프로토타입 창에서 바뀌지 않는다.
- 프롬프트, 앵커 형식, 대화 이벤트 형식, `doan` CLI.

## 완료 조건

- 헤더의 Show conversation을 누르면 패널이 열리고, 그 캔버스의 현재 대화가 thread와 composer로 보인다. 현재 대화가 없으면 새 대화 상태(제안 프롬프트, 그리고 이어 갈 터미널 세션이 있으면 그 선택)가 보인다(단위 테스트와 실제 앱 확인).
- main 창이 보관된 대화를 보여 줘도 프로토타입 창은 현재 대화를 보여 주고, main에서 새 대화를 시작하면 그 대화로 바뀌며, 쓰던 초안이 새 대화에 초안이 없을 때 옮겨 간다(단위 테스트).
- 프로토타입 창에서 보낸 메시지가 같은 대화로 들어가고, main 창의 그 캔버스 패널에도 같은 메시지와 응답이 스트리밍된다. 현재 대화가 없을 때 보낸 첫 메시지는 그 캔버스의 새 현재 대화를 만든다(실제 앱 확인).
- 보낸 메시지는 매번 재생 중인 프레임의 프레임 앵커를 맨 앞 칩으로 싣는다. 드로어나 Back/Forward로 프레임을 바꾸면 고정 칩과 다음 전송의 앵커가 새 프레임을 따른다. 큐 메시지는 넣은 순간의 프레임을, 터미널 세션 resume도 앵커를 싣는다. 필드가 같은 칩으로 시작하면 칩이 두 번 들어가지 않는다. 재생 프레임까지 32개를 넘으면 기존 한도 문구로 거절한다(단위 테스트와 실제 앱 확인).
- Responsive 모드에서 360·480 창에 패널을 열면 창이 640, 패널이 280이 되고 프레임 문서의 `innerWidth`가 344가 된다. 640 이상 창은 크기를 유지하고, 패널을 넓혀도 프레임 열은 360 아래로 내려가지 않으며 패널은 `50dvw`를 넘지 않는다. 패널을 닫아도 창 크기는 그대로다. 작업 영역이 640보다 좁으면 창이 작업 영역 폭이 된다. 패널이 열린 채 390×844를 새로 Play하면 창 콘텐츠가 폭 406 + 패널 폭, 높이 908이고, 작업 영역보다 넓으면 패널이 먼저 280으로 준다(단위 테스트와 실제 앱 확인).
- 패널 열림과 폭이 프로토타입 창을 닫았다 열어도 남고, 앱을 다시 시작하면 닫힌 상태다(단위 테스트).
- 패널을 열면 포커스가 composer에, 닫으면 대화 버튼에 있고, Esc는 패널을 닫지 않는다. Tab이 Back, Forward, Reload, 프레임 이름, 모드 토글, Export, 대화 버튼 → 프레임 콘텐츠 → 패널 순으로 간다. 대화 버튼이 오른쪽 무리 끝에 있고, 이름 캡슐은 640 창에서 첫째 줄 276, 480 창에서 첫째 줄 116, 360 창에서 둘째 줄 328(헤더 100)이다(단위 테스트와 실제 앱 확인).
- composer에 포커스가 있는 동안(IME 조합 중 포함) 캔버스가 다시 로드되어도 포커스와 입력 중인 글이 composer에 남는다(PoC에서 먼저 확인, 실제 앱 확인).
- 프로토타입 창의 composer 초안과 첨부 칩은 main 창 것과 섞이지 않는다. 프로토타입 창을 닫으면 그 초안이 사라지고 main이 그 첨부를 해제한다. 프로토타입 창이 닫힌 동안 돌아온 큐는 main 창 composer로 간다(단위 테스트).
- 권한 요청과 질문을 두 창 중 어느 쪽에서 답해도 턴이 이어지고, 다른 창의 카드는 실패 문구 없이 접힌다. 응답과 `permission.resolved`가 어느 순서로 와도 같다(단위 테스트와 실제 앱 확인).
- 프로토타입 창 thread의 칩을 누르면 main 창이 앞으로 오고(숨겨져 있었으면 보이고), 같은 캔버스면 그 대상으로 locate하며, 다른 캔버스면 그 캔버스를 열고 대상으로 옮긴다. 대상이 없거나 캔버스를 찾지 못하면 main 창에 기존 문구가 보인다. main 창에 dialog나 페이지 잠금이 있으면 그것이 남고 "Couldn’t show …" 토스트가 보인다. Sign in과 Open 버튼도 같은 길로 main 창에서 처리된다(단위 테스트와 실제 앱 확인).
- 목록 읽기가 실패하면 thread 자리에 오류 줄과 Retry가 보이고, composer는 초안을 지키며 보내지 못한다. 캔버스가 사라지거나 ID가 겹치면 composer가 막히고, Frame unavailable 상태에서는 보낼 수 있다(단위 테스트).
- 포커스된 프로토타입 창이 열린 패널에 보여 주는 대화는 끝나면 본 것으로 기록되고 알림이 오지 않는다(단위 테스트).
- 프로토타입 창은 재생 중인 캔버스에 묶이지 않은 대화를 읽거나, 보내거나, 답하거나, 시작할 수 없고, `list`에는 그 캔버스의 대화만 온다. `delete`, `newDesign`, `attachments:capture`, `preferences:write`는 main이 거절한다(단위 테스트).
- 패널이 닫혀 있는 동안 대화 버튼이 답 대기 점, 작업 중 배지, 안 읽은 말풍선을 달고 접근 이름이 각각 맞다(단위 테스트).
- composer에서 우클릭하면 텍스트 편집 메뉴가 열리고, 프레임 콘텐츠에서는 열리지 않는다. Pick from canvas와 Capture area는 프로토타입 창에 없다(실제 앱 확인).
- 프로토타입 창의 대화 동작 뒤에도 main 창의 선택, `doan active`, 보기, 패널 접힘 상태가 그대로다(칩과 main 창 전용 버튼을 누른 경우는 빼고, 단위 테스트).
- PRODUCT(§3 In scope의 buddy 위치 문장, §5 item 0 'Notifications', item 2 'Prototype window'·'Conversation panel', 'Text edit menu'), ARCHITECTURE(§3 'Prototype window', §7 'Prototype window IPC'·'IPC contract'·'Renderer primitives'·'App menu'의 편집 메뉴 항목), DESIGN.md 'Frame prototype'이 새 동작으로 고쳐져 있다. BACKLOG.md의 "Prototype conversation" 항목이 지워져 있고, "The prototype window has no context menu" 항목에는 프레임 콘텐츠 부분만 남아 있다.

## 범위 밖

- 프로토타입 창에서 대화를 고르기, 지우기, 보관된 대화 보기, 현재 대화가 있을 때 새 대화 만들기(제목 메뉴와 New conversation이 없다).
- 프로토타입 창의 Pick from canvas, Capture area, 프레임 안 요소나 지점을 칩으로 집기. 사람이 붙이는 앵커는 재생 프레임 하나뿐이다.
- 프로토타입 창을 닫았다 열 때 초안 되살리기.
- 프로젝트 대화와 다른 캔버스의 대화를 프로토타입 창에 보이기.
- 에이전트에게 "프로토타입 창에서 보냈다"는 별도 문맥을 알리기(프롬프트 변경).
- 프로토타입 창의 agent indicator(글로, 점 필드, 작업 알림). 작업 중 배지만 둔다.
- 프레임 콘텐츠(캔버스 iframe)의 텍스트 편집 메뉴.
- 헤더의 Reload prototype, Fit·Responsive 토글, Export prototype, 프레임 이름의 줄 규칙과 토스트 호스트 설계(`prototype-responsive`, `prototype-cli-export`의 범위).
