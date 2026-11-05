# queue-steer-shortcut — spec

사람의 요청: "메시지 큐 단축키 제공 … 단축키 입력 시 큐의 모든 메시지 steer 시도." 단축키는 Control+Enter로 정했다(사람). 턴이 도는 동안 큐에 메시지가 있으면, Control+Enter 한 번으로 큐의 행마다 Send now를 위에서부터 차례로 누른 것과 같게 한다.

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다. 큐에 넣은 메시지는 사람의 메시지이고(In scope 6), 단축키도 사람이 누르므로 Doan이 agent를 깨우지 않는다(Out of scope 4).
- PRODUCT §5 'Project conversations'의 큐와 Send now 규칙 위에 키 하나를 더한다. Send now의 대상(Claude Code·Codex), 순서, 거절 처리는 그대로 쓴다. PRODUCT가 정하지 않은 점(입력란에 글이 있을 때, Send now를 쓸 수 없을 때, 화면 표시, 키가 듣는 곳)은 사람이 정했다(design '결정').

## 사용자

- **사람(앱 사용자)**: 캔버스 대화 패널이나 프로젝트 Overview의 docked composer에서, 큐에 쌓인 메시지를 행마다 Send now를 누르지 않고 키 하나로 진행 중인 턴에 넣는다.
- **에이전트**: 바뀌지 않는다. 받는 메시지는 Send now로 받던 것과 같다.

## 문제(관찰한 사실)

1. 큐의 메시지를 지금 턴에 넣으려면 행마다 Send now를 눌러야 한다(`DockedComposer.tsx` `QueueRows`). 행이 여럿이면 여러 번 누르고, 키보드로는 Tab으로 행마다 옮겨 가야 한다.
2. 지금 composer 입력란에서 Control+Enter는 Enter와 같다. `isSubmitKey`(`homeComposer.ts`)가 Control·Command·Option을 보지 않으므로, 턴이 도는 동안 글이 있으면 큐에 넣고, 턴이 없으면 보낸다. Control+Enter에 따로 묶인 동작은 앱 메뉴(`app/src/main/index.ts`의 accelerator는 모두 `CmdOrCtrl`, macOS에서는 Command)와 renderer의 전역 keydown(`App.tsx`, `CanvasController.ts`, `ConversationPanel.tsx`)에 없다.

## 완료 조건

1. **키.** docked composer(캔버스 대화 패널, 프로젝트 Overview)의 입력란에서 Control+Enter(Shift·Option·Command 없이)를 누르면, 그 대화가 Send now를 보일 때(Claude Code·Codex 대화의 턴이 돌거나 권한 요청·질문의 답을 기다릴 때, `sendNowShown`) 큐의 모든 행에 위에서부터 차례로 Send now를 시도한다.
2. **Send now와 같음.** 각 행은 Send now를 누른 것과 똑같이 움직인다. 누르는 순간 큐에서 빠져 thread 끝에 "Sending"으로 보이고, 이어서 보낸 행들은 큐 순서를 지킨다. provider가 거절하면 그 행만 큐의 원래 자리로 돌아가 그 아래에 "Couldn’t send now. It stays queued."를 보이고, 나머지 행은 계속 간다. 턴이 먼저 끝나면 큐 규칙(PRODUCT §5 'Project conversations')을 따른다. 이미 보내는 중인 행은 다시 보내지 않는다.
3. **입력란의 글.** 입력란에 보낼 것이 있으면 그 글을 큐 끝에 넣고(입력란이 빔), 기존 행 다음에 그것까지 Send now를 시도한다. 큐에 넣기 전에 턴이 끝나면 지금의 Enter처럼 보내고 steer하지 않는다. 입력란과 큐가 모두 비면 아무 일도 없다(Stop을 부르지 않는다)(design 결정 1).
4. **Send now를 쓸 수 없을 때.** 턴이 없거나, ACP provider 대화이거나, 턴이 준비 중·판정 대기·큐 전송 직전이면 Control+Enter는 Enter와 같다(design 결정 2).
5. **IME와 다른 키.** IME 조합 중의 Control+Enter는 Enter와 같은 규칙으로 조합을 먼저 끝내고, 글자를 잃거나 두 번 넣지 않는다. Enter, Shift+Enter, Command+Enter, Option+Enter의 동작과 Home composer의 키 규칙은 바뀌지 않는다. `/` preset 목록이 열려 있으면 목록의 키 처리가 먼저다(지금 Enter와 같다).
6. **듣는 곳과 포커스.** 단축키는 docked composer의 입력란에 포커스가 있을 때만 듣는다(큐 행의 버튼에서는 듣지 않는다). 누른 뒤 포커스는 입력란에 남는다(design 결정 4).
7. **표시.** 각 행의 Send now 툴팁이 "Add to the current turn without stopping it"과 키 "⌃↩"를 보인다(design 결정 3).

## 비목표

- Command+Enter 같은 다른 키, 키 바꾸기 설정.
- 큐 위의 "모두 보내기" 버튼 같은 새 컨트롤.
- ACP provider의 Send now(PRODUCT §5: ACP provider에는 Send now가 없다).
- Home composer(큐가 없다), 질문 카드의 Other 입력란.
- main의 Send now 경로(`ConversationService.sendNow`, IPC `conversation:sendQueuedNow`) 변경. 다만 design 'PoC 의존'의 순서 확인이 실패하면 다시 설계한다.
