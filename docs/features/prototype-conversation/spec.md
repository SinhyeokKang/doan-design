# prototype-conversation — spec

출처: docs/BACKLOG.md 'Undecided'의 "Prototype conversation" 항목. 이 문서의 동작은 모두 사용자가 정했다. 남은 미확인은 design.md 'PoC 의존'의 두 가지뿐이다.

## 사용자

- **사람**: 프로토타입 창에서 프레임을 직접 눌러 보면서, 창을 바꾸지 않고 에이전트에게 말한다.
- **에이전트**: 바뀌는 것이 없다. 메시지는 지금처럼 캔버스 대화의 한 턴으로 오고, 재생 중인 프레임이 프레임 앵커(칩) 하나로 맨 앞에 붙어 온다. 프롬프트, CLI, guide, 스킬 stub은 그대로이므로 이 feature에는 `/agent-eval`이 필요 없다.

## 문제

- 프로토타입 창(PRODUCT §5 item 2 'Prototype window')에는 대화 수단이 없다. 프레임을 눌러 보다가 "이 버튼이 눌리지 않는다"를 말하려면 main 창으로 돌아가 캔버스를 열고, 프레임을 Pick으로 다시 집어 패널에 써야 한다.
- 프로토타입 창은 지금 의도적으로 main 창과 아무것도 나누지 않는다. "Nothing in the window reaches the main window's selection, `doan active`, drafts, attachments or settings"(PRODUCT §5 item 2), "The prototype window's main frame … may call only its own requests, and the main window's guard is not widened"(ARCHITECTURE §3 'Sender role'). 대화 IPC는 main 창의 main frame만 부를 수 있고, `conversation:event`·`conversation:stage`는 main 창에만 간다(ARCHITECTURE §7 'Agent conversation runtime and IPC' 'IPC contract').

## 범위

### 헤더 버튼

- 프로토타입 창 헤더의 오른쪽 끝은 [Export] [대화 버튼] 순이다. Export는 형제 feature `prototype-cli-export`가 더하고, 대화 버튼이 맨 끝이다. 프레임 이름 버튼이 오른쪽에 비워 둘 폭은 두 feature가 함께 맞춘다.
- 대화 버튼은 패널이 닫혀 있으면 "Show conversation"(`PanelRightOpen`), 열려 있으면 "Hide conversation"(`PanelRightClose`)이다. main 창의 같은 이름 버튼과 같은 아이콘·크기·`aria-expanded`·`aria-controls`를 쓴다.
- 패널이 닫혀 있는 동안 버튼은 main 창의 Show conversation과 같은 배지를 단다: 보여 줄 대화가 답을 기다리면 점, 끝났는데 아직 보지 않았으면 말풍선. 접근 이름도 같다("Show conversation, needs your answer" 등).
- 에이전트가 시작하거나, 묻거나, 끝나도 패널은 저절로 열리지 않는다(main 패널 규칙과 같다).

### 패널 배치

- 패널은 Chrome DevTools처럼 옆에서 밀고 들어와 프레임 뷰포트의 폭을 가져간다. 프레임이 좁아 보기 어려우면 사람이 창을 직접 키운다.
- 프레임 뷰포트의 최소폭 360은 유지한다(창 최소폭 360, `PROTOTYPE_WINDOW_MIN_WIDTH`).
- 패널이 열려 있는 동안 창의 최소폭은 360 + 패널 최소폭 280 = 640이다. 창이 640보다 좁을 때(360이든 480이든) 패널을 열면 창이 정확히 640으로 넓어지고, 패널은 최소폭 280으로 열린다. 480 창은 640이 되고 프레임은 480에서 360이 된다.
- 이미 640 이상인 창은 크기를 유지한다. 패널은 canvas 패널 규칙의 기본폭(`max(320px, 28dvw)`)으로 열리되, 프레임 쪽이 360 아래로 내려가지 않게 줄어든다.
- 패널 최대폭은 canvas 패널 규칙을 따른다: 프레임 쪽이 360 아래로 내려가지 않는 폭까지다(DESIGN.md 'Panel width'의 "the width that leaves the canvas 360"에 해당). 패널은 왼쪽 가장자리의 손잡이로 폭을 조절한다(main 패널의 손잡이와 같다).
- 패널을 닫아도 창 크기는 그대로이고, 패널이 쓰던 폭이 프레임에 돌아간다. 창 최소폭은 다시 360이 된다.
- 작업 영역이 640보다 좁으면 창은 작업 영역 폭까지만 넓어지고, 프레임이 360보다 좁아지는 것을 받아들인다.
- 패널이 열린 채 새로 Play하면(main 창의 Play, 드로어, Back/Forward) 창을 마크한 크기 + 패널 폭(그리고 chrome)으로 맞춘다. 프레임은 마크한 폭으로 보이고, 창 최소폭 640은 그대로 지킨다.
- 패널의 열림 상태와 폭은 앱이 도는 동안 main 메모리에 남는다. 프로토타입 창을 닫았다 다시 열어도 유지되고, 앱을 다시 시작하면 닫힌 상태로 돌아간다. 기기에 저장하지 않는다.

### 패널 내용

- main 창의 캔버스 대화 패널을 머리(head) 없이 다시 쓴다: thread와 docked composer(docked buddy 포함), 그리고 composer 위에 고정된 재생 프레임 칩. 제목 메뉴, New conversation 버튼, Hide conversation 버튼(헤더의 버튼이 대신한다)은 없다. 그래서 프로토타입 창에서는 대화를 바꾸거나 지우거나, 현재 대화가 있을 때 새 대화를 만들 수 없다.
- **보여 주는 대화**: 재생 중인 프레임이 속한 캔버스의 현재 대화(current conversation)다. main 창 패널이 메뉴로 고른 보관된 대화를 보여 주고 있어도 프로토타입 창은 현재 대화를 보여 준다. 현재 대화가 바뀌면(main에서 새 대화를 시작해 앞의 것이 보관되면) 프로토타입 창도 새 현재 대화로 바뀐다.
- **현재 대화가 없으면** main 패널과 같은 새 대화 상태다: Home 규칙의 제안 프롬프트, 그리고 그 캔버스에 이어 갈 수 있는 터미널 세션이 있으면 그 세션 이어 가기(기본)와 새 대화 사이의 선택(PRODUCT §5 item 2 'Conversation panel' 'Terminal session'). 첫 전송은 그 캔버스에 묶인 새 캔버스 대화를 시작하거나 터미널 세션을 이어 가고, 그 대화가 캔버스의 현재 대화가 되므로 main 창 패널에도 스트리밍된다.
- **같은 대화를 두 창이 함께 보여 준다.** thread, 턴 표시줄, 큐, context ring, 백그라운드 작업 줄, 다음 메시지 제안은 대화마다 하나이므로 두 창에 같은 것이 보인다.
- **재생 프레임 칩**: composer 위에 재생 중인 프레임을 프레임 칩 모양으로 고정해 보여 준다. 칩은 지울 수 없고, 프레임이 바뀌면(드로어, Back/Forward, main 창의 Play) 따라 바뀐다. 칩의 툴팁과 접근 설명은 이 칩이 모든 메시지에 함께 간다는 것을 말한다(문구 초안: "Sent with each message"; 정확한 문구는 `/design-draft`에서 clarify 기준으로 정한다).
- **모든 전송이 재생 프레임을 앵커로 싣는다.** 보낼 때 그 프레임의 프레임 앵커(`{frame: {id, title}}`)를 메시지 맨 앞의 칩으로 넣는다. 큐에 들어가는 메시지와 Send now도 같다. 이 칩도 32개 장소 한도에 들어간다. thread와 main 창 패널에는 보통의 사람 칩으로 보인다. 대화 제목과 미리보기는 칩 이름을 읽으므로 프레임 이름으로 시작한다(받아들인 결과다).
- **composer 초안**: 프로토타입 창은 main 창과 따로 자기 초안을 가진다. 같은 대화라도 main 창에서 쓰던 글은 프로토타입 창에 보이지 않고, 그 반대도 같다. 초안은 앱이 도는 동안만 유지된다(main 창 초안과 같다).
- **큐에서 돌아온 초안**: 실패하거나 멈춘 턴 뒤에 돌아온 큐는 그 대화를 먼저 보여 준 창의 초안으로 들어간다.
- **권한 요청과 질문 카드**: 두 창 모두에서 답할 수 있고, 먼저 도착한 답이 이긴다. 늦은 쪽은 실패 문구 없이 카드가 접힌다. 질문에서 고르던 중인 선택은 창마다 따로다.
- **첨부**: Attach, 붙여넣기, 드롭은 main 패널과 같다. Pick from canvas와 Capture area는 보드가 없으므로 없다.
- **thread의 칩**: 프로토타입 창 thread의 칩(사람의 프레임·요소·지점 칩, 에이전트 답의 프레임·요소 칩)을 누르면 main 창을 앞으로 가져와 그 대상으로 옮긴다.
  - main 창이 그 캔버스를 보여 주고 있으면, main 창의 sent chip이나 답 칩처럼 locate한다. 선택, `doan active`, 패널은 바뀌지 않는다.
  - 아니면 deep link처럼 그 캔버스를 연다(선택이 지워지고, 패널이 그 캔버스의 대화로 바뀌고, Back용 방문 하나가 남는다). 그다음 대상으로 옮긴다.
  - 대상이 없거나 캔버스를 찾을 수 없을 때는 main 창의 기존 규칙을 따른다: "No longer in the canvas" 또는 토스트 한 줄. 메시지는 main 창에 보인다.
  - 숨긴 main 창도 보이게 하고, 첫 실행이나 페이지 잠금처럼 main 창이 옮길 수 없는 상태에서는 main 창 deep link의 기존 규칙을 따른다.
- **composer 막힘**: 캔버스가 목록에서 사라졌거나 ID가 겹치면 main 패널처럼 초안을 지키고 입력을 받지 않으며 이유를 말한다. 프레임이 사라졌거나("Frame unavailable") 마크가 사라졌거나 로드에 실패한 상태에서도 패널은 쓸 수 있다. 사람이 "프로토타입이 안 열린다"를 에이전트에게 말할 수 있어야 하기 때문이다. 이때 칩은 그 프레임의 마지막 id와 제목을 싣는다.
- **seen과 알림**: 프로토타입 창이 포커스를 가졌고, 패널이 열려 그 대화를 보여 주면 그 대화를 본 것으로 기록하고 그 대화의 데스크톱 알림을 보내지 않는다. 다른 대화의 알림은 지금 규칙 그대로다.
- **텍스트 편집 메뉴**: 프로토타입 창의 composer와 패널 글에서 main 창과 같은 텍스트 편집 메뉴가 열린다. 프레임 콘텐츠(캔버스 iframe)에는 지금처럼 메뉴가 없다.
- **포커스**: 패널을 열면 composer 필드로 간다. 닫으면 헤더의 버튼으로 돌아온다. Esc는 패널을 닫지 않는다. Tab 순서는 헤더 → 프레임 콘텐츠 → 패널이다.

### 변하지 않는 것

- 프로토타입 창의 프레임은 새 Play(main 창의 Play, 창의 드로어, Back/Forward)로만 바뀐다. main 창 이동·숨김은 프로토타입 창을 바꾸지 않는다.
- main 창 쪽으로는 위의 thread 칩 클릭만 닿는다. 프로토타입 창의 전송, 답, 초안, 패널 열기는 main 창의 선택, `doan active`, 보기, 패널 접힘 상태를 바꾸지 않는다.
- 프로토타입 창이 포커스를 가졌을 때 main 창의 대화 관련 메뉴(New Conversation, Pick from Canvas)는 꺼져 있다. Edit 메뉴와 Undo/Redo는 포커스된 창의 composer에 작동한다(이미 그렇다: `editHistory`는 포커스된 창의 webContents에 보낸다).
- 프롬프트, 앵커 형식, 대화 이벤트 형식, `doan` CLI.

## 완료 조건

- 헤더의 Show conversation을 누르면 패널이 열리고, 그 캔버스의 현재 대화가 thread와 composer로 보인다. 현재 대화가 없으면 제안 프롬프트와, 있으면 터미널 세션 선택이 있는 새 대화 상태가 보인다(단위 테스트와 실제 앱 확인).
- 프로토타입 창에서 보낸 메시지가 같은 대화로 들어가고, main 창의 그 캔버스 패널에도 같은 메시지와 응답이 스트리밍된다. 현재 대화가 없을 때 보낸 첫 메시지는 그 캔버스의 새 현재 대화를 만든다(실제 앱 확인).
- 보낸 메시지는 매번 재생 중인 프레임의 프레임 앵커를 맨 앞 칩으로 싣고, 드로어나 Back/Forward로 프레임을 바꾸면 고정 칩과 다음 전송의 앵커가 새 프레임을 따른다(단위 테스트와 실제 앱 확인).
- 640보다 좁은 창(360, 480)에서 패널을 열면 창이 640이 되고 패널이 280으로 열린다. 640 이상 창은 크기를 유지하고, 패널을 넓혀도 프레임 쪽은 360 아래로 내려가지 않는다. 패널을 닫아도 창 크기는 그대로다. 패널이 열린 채 새로 Play하면 창이 마크 크기 + 패널 폭이 된다(단위 테스트와 실제 앱 확인).
- 프로토타입 창의 composer 초안은 main 창 초안과 섞이지 않는다(단위 테스트).
- 권한 요청과 질문을 두 창 중 어느 쪽에서 답해도 턴이 이어지고, 다른 창의 카드는 실패 문구 없이 접힌다(단위 테스트와 실제 앱 확인).
- 프로토타입 창 thread의 칩을 누르면 main 창이 앞으로 오고, 같은 캔버스면 그 대상으로 locate하며, 다른 캔버스면 그 캔버스를 열고 대상으로 옮긴다(단위 테스트와 실제 앱 확인).
- 포커스된 프로토타입 창이 열린 패널에 보여 주는 대화는 끝나면 본 것으로 기록되고 알림이 오지 않는다(단위 테스트).
- 프로토타입 창은 재생 중인 캔버스에 묶이지 않은 대화를 읽거나, 보내거나, 답하거나, 시작할 수 없다. main이 거절한다(단위 테스트).
- 패널이 닫혀 있는 동안 버튼이 답 대기 점과 안 읽은 말풍선 배지를 단다(단위 테스트).
- composer에서 우클릭하면 텍스트 편집 메뉴가 열리고, 프레임 콘텐츠에서는 열리지 않는다(실제 앱 확인).
- PRODUCT(§3 In scope의 buddy 위치 문장, §5 item 0 'Notifications', item 2 'Prototype window'·'Conversation panel', 'Text edit menu'), ARCHITECTURE(§3 'Prototype window', §7 'Prototype window IPC'·'IPC contract'·'Renderer primitives'·'App menu'의 편집 메뉴 항목), DESIGN.md 'Frame prototype'이 새 동작으로 고쳐져 있고, BACKLOG.md의 "Prototype conversation" 항목이 지워져 있다. 프로토타입 창 텍스트 편집 메뉴 항목에서는 이 feature가 푼 헤더·패널 부분이 빠져 있다.

## 범위 밖

- 프로토타입 창에서 대화를 고르기, 지우기, 보관된 대화 보기, 현재 대화가 있을 때 새 대화 만들기(제목 메뉴와 New conversation이 없다).
- 프로토타입 창의 Pick from canvas, Capture area, 프레임 안 요소나 지점을 칩으로 집기. 사람이 붙이는 앵커는 재생 프레임 하나뿐이다.
- 프로젝트 대화와 다른 캔버스의 대화를 프로토타입 창에 보이기.
- 에이전트에게 "프로토타입 창에서 보냈다"는 별도 문맥을 알리기(프롬프트 변경).
- 프로토타입 창의 agent indicator(글로, 점 필드, 작업 알림).
- 프레임 콘텐츠(캔버스 iframe)의 텍스트 편집 메뉴.
- Export 버튼 설계(`prototype-cli-export`의 범위).
