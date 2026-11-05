# turn-activity — spec

사람의 요청(원문): "에이전트가 작업 중이라는 표현을 대화 쓰레드에서 더 잘 보여주기. 가끔 에이전트가 내 말을 듣고 씹은건지, 뭐 작업 중인건지, 생각 중인건지 모르겠음. 아무것도 안나오니."

사람이 더한 말(원문, 2026-11-06):

- "사실 작업 중인거는 캔버스 작업 안내로 나타나는데, 문제는 생각 중일 때나 코드 읽을 때일듯" — 캔버스를 고치는 일은 보드의 작업 notice(`app/src/renderer/CanvasAgent.tsx`)가 이미 보인다. 빈 곳은 생각하는 동안, 코드를 읽는 동안, 캔버스가 아닌 도구를 돌리는 동안, 첫 출력을 기다리는 동안이다.
- "쨋든 에이전트 턴일 때, 캔버스 수준으로 로딩 표현을 잘하는게 목표. 스레드에서" / "시각적인걸 말한건 아니였어" — 모양을 캔버스 notice와 맞추라는 뜻이 아니다. 캔버스 notice가 캔버스 작업을 분명히 보이듯, thread도 턴 동안 에이전트의 상태를 분명히 보여야 한다는 뜻이다.
- "CC CLI마냥 이런 느낌이어도 괜찮아" / "토큰 수나 보조 줄은 지원하기 힘들겠지." — Claude Code CLI의 작업 줄 같은 한 줄(움직이는 글리프, 동사, 경과 시간)도 괜찮다. 토큰 수와 둘째 줄은 넣지 않는다.

**목표**: 에이전트의 턴 동안 대화 thread가, 캔버스 작업 notice가 캔버스 작업을 보이는 만큼 분명하게, 에이전트가 메시지를 받았고 지금 무엇을 하는지(생각, 코드 읽기, 명령 실행, 답 쓰기) 보인다. 사람이 "씹혔나?"를 묻게 되는 빈 화면이 턴 안에 없다.

## 범위 확인(scope gate)

- **통과.** PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다. 표시는 대화가 이미 받는 provider 출력에서 읽고, 새 모델 요청이나 agent 작업을 시작하지 않는다(Out of scope 4). 서버도 없다(5).
- In scope 6 'Conversation'의 대화 화면(PRODUCT §5 items 2 'Conversation panel', 3 'Project Overview')에서 일어난다.
- PRODUCT·ARCHITECTURE에는 턴 동안 thread가 무엇을 보이는지에 대한 규칙이 activity 요약(ARCHITECTURE §7 'Summaries')과 Codex MCP 대기 줄(PRODUCT §3 'MCP tools')밖에 없다. 그래서 표시의 형태, 보이는 범위, 데이터 경로, 생각 내용을 보일지는 사람이 정했다(design '결정', 2026-11-06).

## 사용자

- **사람(앱 사용자)**: Overview나 캔버스 conversation panel에서 메시지를 보낸 뒤, thread 끝에서 에이전트가 메시지를 받았는지, 지금 생각하는지, 무엇을 읽거나 실행하는지, 얼마나 오래 걸리고 있는지 본다. 그 정보로 기다릴지, Stop할지, 메시지를 queue에 넣을지 정한다.
- **에이전트**: 바뀌지 않는다. CLI, guide, skill stub, `doan check`, 턴 prompt는 그대로다.

## 문제(관찰한 사실)

1. **메시지가 thread에 들어간 뒤 첫 출력까지 thread에 아무것도 없다.** main은 턴을 받아들일 때 `user.message`와 `turn.started`를 함께 쓴다(`app/src/main/conversation/service.ts:216`, `:311`, `:320`). thread는 `turn.started`로 항목을 만들지 않는다(`app/src/renderer/threadItems.ts:163-167`). 그래서 첫 `message.delta`, `activity`, permission·question 요청이 올 때까지 사람의 bubble 아래가 비어 있다. 화면 읽기 프로그램용 상태 글도 이때 빈 문자열이다(`app/src/renderer/ConversationThread.tsx:407-414`, `:594`). 이 동안 보이는 표시는 composer의 Send 자리가 Stop으로 바뀐 것(`composerRules.ts:27-30`), 사이드바 slot의 spinner, 캔버스 페이지라면 보드의 작업 notice뿐이다. Overview에는 보드 notice가 없다(PRODUCT §5 item 2 'Terminal work' 끝 문장).
2. **그 빈 시간은 provider에 따라 수 초다.** 기록된 실제 frame에서 잰 값(design '조사 결과' 표): Claude Code 1.5–3.0초(7턴), Codex 2.3–11.2초(14턴), Antigravity 2.3–7.1초(6턴), Copilot 5.1–9.4초(6턴), Cursor 1.1초(1턴). 모두 짧은 probe 턴이다.
3. **턴 중간에도 빈 시간이 있다.**
   - 답 글이 끝난 뒤(`message.done`) 다음 출력까지 caret도 spinner도 없다(`threadItems.ts:172-188`).
   - permission에 답하면 그 카드는 한 줄로 접히고, 그 줄에는 spinner가 없다. 도구가 돌고 다음 모델 호출이 끝날 때까지 thread가 멈춘 것처럼 보인다(`threadItems.ts:202-211`, `:239-245`). permission 요청이 있던 Claude 턴 5개에서 빈 시간의 합이 턴 길이의 44–92%였다(design '조사 결과'; probe가 permission에 0.1–0.5초 안에 자동으로 답한 턴이다).
   - Claude가 마지막 답을 쓰기 전에 생각하는 시간(3.2–5.2초)이 턴에서 가장 긴 빈 시간이었다.
4. **도는 표시가 실제 일과 다르다.** activity 묶음은 thread의 마지막 항목인 동안 spinner와 진행형 머리("Running a command", "Reading <path>")를 보인다(`threadItems.ts:239-245`). Claude와 Codex는 도구가 시작할 때만 activity를 내고 끝났다는 event가 없으므로, 도구가 끝난 뒤 에이전트가 생각하는 동안에도 "Running a command"가 돈다. ACP는 반대로 도구가 끝났을 때만 activity를 낸다(`app/src/main/conversation/acp.ts:154-155`). 그래서 ACP 도구가 도는 동안은 아무것도 없고, 끝난 뒤에 진행형 머리가 나온다. 이 feature는 activity 행을 바꾸지 않고(결정 4), 턴 표시가 단계 신호로 지금의 일을 따로 말한다.
5. **"코드 읽기"가 Codex에서는 보이지 않는다.** Codex는 파일을 셸 명령으로 읽고, 그 명령에 `commandActions`(`read`·`listFiles`·`search`·`unknown`)를 붙여 보낸다. Doan은 모든 `commandExecution`을 "Running a command"로 보인다(`app/src/main/conversation/transport.ts:110`).
6. **provider가 보내는 "생각 중"과 단계 신호를 Doan이 버린다.** Claude의 thinking block 시작(`content_block_start` `thinking`)과 `system/status` `requesting`, Copilot의 `agent_thought_chunk`, ACP의 진행 중 `tool_call`을 읽지 않는다(`transport.ts:128-170`, `acp.ts:138-160`). 자세한 것은 design '조사 결과'.

## 완료 조건

용어: **턴 표시**는 이 feature가 thread 끝에 더하는 표시다. 형태는 `/design-draft`의 변형 캔버스에서 사람이 고른다. 기본 후보는 움직이는 글리프 + 단계 동사 + 경과 시간의 한 줄이다(design 결정 1). **단계**는 턴 표시가 이름으로 말하는 지금의 일이다. "(결정 N)"은 design '결정'의 번호다.

1. **보이는 때.** 보이는 대화(Overview나 캔버스 conversation panel)의 마지막 턴이 `turn.started` 뒤 terminal event 전이고 main이 그 턴을 들고 있는 동안, thread 끝에 턴 표시가 있다. 사람의 메시지가 thread에 들어간 그 렌더부터 있다. permission 카드나 question 카드가 답을 기다리는 동안에는 없다(결정 3). terminal event(`turn.done`, `turn.failed`, `interrupted`)가 오면 사라지고, 다시 읽기나 재시작으로 접힌 턴에도 없다.
2. **단계.** 턴 표시는 Doan이 아는 만큼만 단계를 말하고, 모르는 것을 지어내지 않는다(clarify preset "never invent progress").
   - 출력이 아직 없거나 모델 응답을 기다리는 동안: 일반 단계.
   - 생각 중: provider가 그 신호를 보내는 동안(Claude thinking block, Copilot thought chunk; 결정 2). 신호가 없는 provider(Codex, Antigravity, Cursor)는 일반 단계다.
   - 도구: 읽는 경로가 있으면 경로, 명령이면 명령을 실행한다는 사실만(명령 글은 보이지 않는다, ARCHITECTURE §7 'Summaries'와 `transport.ts:97-98`의 2026-10-30 사람의 결정), 그 밖의 도구는 지금의 activity 요약.
   - 도구가 끝난 뒤 다음 출력 전: 턴 표시는 다시 일반 단계나 생각 중이다(결정 2). activity 행은 이와 따로 지금처럼 돈다(완료 조건 4).
   - 답 글이 흐르는 동안: 답을 쓰는 단계.
3. **경과 시간.** 턴 표시는 그 턴의 `turn.started` 시각부터 지난 시간을 1초 단위로 보인다(결정 7). 단계가 바뀌어도 처음부터 세지 않는다. 다시 읽기 뒤에도 기록된 시각으로 이어서 센다.
4. **activity 행은 그대로.** activity 행은 지금처럼 thread의 마지막 항목인 동안 spinner와 진행형 머리를 보이고, 턴 표시도 함께 보인다(결정 4). 그래서 진행 표시가 두 개 함께 보일 수 있고, Claude·Codex 도구가 끝난 뒤에도 activity 행은 다음 출력까지 "Running a command" 같은 진행형 머리로 돈다. 그동안 턴 표시는 일반 단계나 생각 중을 말한다. 펼친 단계 목록, 접힌 permission·question 줄도 그대로다.
5. **Codex 읽기.** Codex `commandExecution`의 `commandActions`가 하나이고 그 type이 `read`이면 그 경로를 읽는 activity(`kind: "read"`, `path`)로, `listFiles`·`search`이면 읽기 activity로 기록한다. 명령 글은 기록하지 않는다. `unknown`과 여러 action은 지금처럼 명령이다(결정 6).
6. **두 화면이 같다.** Overview와 캔버스 conversation panel의 thread가 같은 규칙을 따른다(`ConversationThread`를 같이 쓴다). 캔버스 페이지에서 보드의 작업 notice는 바뀌지 않는다.
7. **접근성과 움직임.** 단계가 바뀔 때 화면 읽기 프로그램에 한 번 알린다. 경과 시간의 매초 변화는 알리지 않는다. `prefers-reduced-motion`에서는 움직이는 부분이 멈추고 글은 그대로 바뀐다.
8. **다른 동작은 그대로.** 대화 기록의 event 종류와 턴마다 terminal 하나라는 규칙(결정 2로 기록 형식은 바뀌지 않는다), activity 행, Send·Queue·Stop·Send now, unseen, 대화 목록 요약, 알림, toast, 사이드바 slot, conversation strip, 보드 작업 notice(결정 8), promotion 판정(편집 activity와 파일 변경)은 바뀌지 않는다. Codex 읽기 activity는 `edit`가 아니므로 promotion 증거가 아니다.
9. **실제 앱.** 격리된 실제 앱에서 provider마다 한 턴씩(로그인한 provider만) 메시지가 thread에 들어간 순간부터 턴 표시가 있고, 단계가 frame과 맞게 바뀌고(Claude 생각, Codex 읽기, ACP 도구 진행), permission을 기다리는 동안 없고, 턴이 끝나면 사라진다(`/runtime-test`, 스크린샷 기록).

## 비목표

- **생각 내용 보이기.** thinking·thought 글이나 Codex reasoning 요약을 thread에 보이지 않는다(결정 5).
- **토큰 수와 둘째 줄.** 턴 중간 토큰 값이 provider마다 고르지 않다(design '조사 결과'). 팁 같은 둘째 줄도 없다(사람의 말).
- **진행률과 남은 시간.** provider가 보내지 않으므로 지어내지 않는다.
- **보내는 중(acceptance 전)의 표시.** 그때 메시지는 아직 composer에 있고 Send가 spinner를 보인다(`DockedComposer.tsx:390`, `:402`). 시작이 거절되면 draft가 그대로 남는 규칙(PRODUCT §5 item 1)이 이 상태에 기대므로 바꾸지 않는다(결정 9).
- **캔버스 작업 notice, conversation strip, 사이드바 slot, Home의 변경.** 그대로다.
- **Claude subagent(Task) 안의 단계.** `parent_tool_use_id`가 있는 frame은 지금처럼 읽지 않는다(`transport.ts:122`). subagent가 도는 동안은 그 Task 도구의 단계로 보인다.
- **work-update의 note를 thread에 보이기.** 그 note는 보드의 작업 notice 글이다(work-update spec 완료 조건 5). thread에 옮기지 않는다.
