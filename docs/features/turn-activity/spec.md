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
- PRODUCT·ARCHITECTURE에서 턴 동안 thread가 무엇을 보이는지 정한 규칙은 activity 요약(ARCHITECTURE §7 'Summaries'), Codex MCP 대기 줄(PRODUCT §3 'MCP tools'), Send now의 "Sending" 표시와 열린 카드의 자리(PRODUCT §5 item 1 'Send now'), question 카드(§5 item 3 'Questions')뿐이다. 그래서 표시의 형태, 보이는 범위, 데이터 경로, 생각 내용을 보일지는 사람이 정했다(design '결정', 2026-11-06).

## 사용자

- **사람(앱 사용자)**: Overview나 캔버스 conversation panel에서 메시지를 보낸 뒤, 턴 표시에서 에이전트가 메시지를 받았는지, 지금 생각하는지, 무엇을 읽거나 실행하는지, 얼마나 오래 걸리고 있는지 본다. 그 정보로 기다릴지, Stop할지, 메시지를 queue에 넣을지 정한다.
- **에이전트**: 바뀌지 않는다. CLI, guide, skill stub, `doan check`, 턴 prompt는 그대로다.

## 문제(관찰한 사실)

1. **메시지가 thread에 들어간 뒤 첫 출력까지 thread에 아무것도 없다.** main은 턴을 받아들일 때 `user.message`와 `turn.started`를 함께 쓴다(`app/src/main/conversation/service.ts`). thread는 `turn.started`로 항목을 만들지 않는다(`app/src/renderer/threadItems.ts`). 그래서 첫 `message.delta`, `activity`, permission·question 요청이 올 때까지 사람의 bubble 아래가 비어 있다. 화면 읽기 프로그램용 상태 글(`ConversationThread.tsx`의 `phaseText`)도 이때 빈 문자열이다. 이 동안 보이는 표시는 composer의 Send 자리가 Stop으로 바뀐 것(`composerRules.ts`), 사이드바 slot의 spinner, 캔버스 페이지라면 보드의 작업 notice뿐이다. Overview에는 보드 notice가 없다(PRODUCT §5 item 2 'Agent indicator': 보드에만 보인다).
2. **그 빈 시간은 provider에 따라 수 초다.** 기록된 실제 frame에서 잰 값(design '조사 결과' 표): Claude Code 1.5–3.0초(7턴), Codex 2.3–11.2초(14턴), Antigravity 2.3–7.1초(6턴), Copilot 5.1–9.4초(6턴), Cursor 1.1초(1턴). 모두 짧은 probe 턴이다.
3. **턴 중간에도 빈 시간이 있다.**
   - 답 글이 끝난 뒤(`message.done`) 다음 출력까지 caret도 spinner도 없다(`threadItems.ts`).
   - permission에 답하면 그 카드는 한 줄로 접히고, 그 줄에는 spinner가 없다. 도구가 돌고 다음 모델 호출이 끝날 때까지 thread가 멈춘 것처럼 보인다. permission 요청이 있던 Claude 턴 5개에서 빈 시간의 합이 턴 길이의 44–92%였다(design '조사 결과'; probe가 permission에 0.1–0.5초 안에 자동으로 답한 턴이다).
   - Claude가 마지막 답을 쓰기 전에 생각하는 시간(3.2–5.2초)이 턴에서 가장 긴 빈 시간이었다.
4. **도는 표시가 실제 일과 다르다.** activity 묶음은 thread의 마지막 항목인 동안 spinner와 진행형 머리("Running a command", "Reading <path>")를 보인다. Claude와 Codex는 도구가 시작할 때만 activity를 내고 끝났다는 event가 없으므로, 도구가 끝난 뒤 에이전트가 생각하는 동안에도 "Running a command"가 돈다. ACP는 반대로 도구가 끝났을 때만 activity를 낸다(`acp.ts`의 `normalizeAcp`, `status !== "completed"` 검사). 그래서 ACP 도구가 도는 동안은 아무것도 없고, 끝난 뒤에 진행형 머리가 나온다. 이 feature는 activity 행을 바꾸지 않고(결정 4), 턴 표시가 단계 신호로 지금의 일을 따로 말한다. activity 행의 어긋남은 남는다(비목표).
5. **"코드 읽기"가 Codex에서는 보이지 않는다.** Codex는 파일을 셸 명령으로 읽고, 그 명령에 `commandActions`(`read`·`listFiles`·`search`·`unknown`)를 붙여 보낸다. Doan은 모든 `commandExecution`을 "Running a command"로 보인다(`transport.ts`의 `codexActivities`).
6. **provider가 보내는 "생각 중"과 단계 신호를 Doan이 버린다.** Claude의 thinking block 시작(`content_block_start` `thinking`)과 `system/status` `requesting`, Copilot의 `agent_thought_chunk`, ACP의 진행 중 `tool_call`을 읽지 않는다(`transport.ts`의 `normalizeClaude`, `acp.ts`의 `normalizeAcp`). 자세한 것은 design '조사 결과'.

## 완료 조건

용어: **턴 표시**는 이 feature가 thread에 더하는 표시다. 형태와 위치(thread 끝의 내용 안, 또는 composer 위 고정)는 `/design-draft`의 변형 캔버스에서 사람이 고른다. 기본 후보는 움직이는 글리프 + 단계 동사 + 경과 시간의 한 줄이다(design 결정 1). **단계**는 턴 표시가 이름으로 말하는 지금의 일이다. "(결정 N)"은 design '결정'의 번호다.

1. **보이는 때.** 보이는 대화(Overview나 캔버스 conversation panel)의 마지막 턴이 `turn.started` 뒤 terminal event 전이고 main이 그 턴을 들고 있는 동안 턴 표시가 있다. 사람의 메시지가 thread에 들어간 그 렌더부터 있다. permission 카드나 question 카드가 답을 기다리는 동안에는 없다(결정 3). terminal event(`turn.done`, `turn.failed`, `interrupted`)가 오면 사라지고, 재시작으로 접힌 턴(main이 들고 있지 않은 턴)에도 없다. 같은 규칙이 terminal session(legacy external) 대화에도 적용된다.
2. **단계.** 턴 표시는 Doan이 아는 만큼만 단계를 말하고, 모르는 것을 지어내지 않는다(clarify preset "never invent progress").
   - 출력이 아직 없거나 모델 응답을 기다리는 동안: 일반 단계. 일반 단계의 동사는 앱이 이미 쓰는 "working"이다("<Provider> is working").
   - 생각 중: provider가 그 신호를 보내는 동안(Claude thinking block, Copilot thought chunk; 결정 2). 신호가 없는 provider(Codex, Antigravity, Cursor)는 일반 단계다.
   - 도구: 읽는 경로가 있으면 경로, 명령이면 명령을 실행한다는 사실만(명령 글은 보이지 않는다, `transport.ts`의 `claudeActivity` 주석에 있는 2026-10-30 사람의 결정), 그 밖의 도구는 지금의 activity 요약.
   - 도구가 끝난 뒤 다음 출력 전: 턴 표시는 다시 일반 단계나 생각 중이다(결정 2). activity 행은 이와 따로 지금처럼 돈다(완료 조건 4).
   - permission에 Allow로 답한 뒤: 그 앞 도구의 단계가 이어진다(도구가 이제 돈다).
   - 답 글이 흐르는 동안: 답을 쓰는 단계.
   - Codex MCP 대기 줄("Waiting for <Notion>")과 not-ready 줄은 도구 단계가 아니다. 그동안 턴 표시는 일반 단계다.
   - 오래 조용할 때(provider가 수 초 동안 frame을 보내지 않을 때) 따로 보이는 상태는 없다. 경과 시간이 늘고 composer의 Stop이 있다.
   - 새 단계는 짧게 깜빡이지 않도록 일정 시간(300ms) 이어진 뒤에 보인다. 답 쓰기로 바뀔 때와 카드 때문에 숨을 때는 바로 바뀐다.
3. **경과 시간.** 턴 표시는 그 턴의 `turn.started` 시각부터 지난 시간을 1초 단위로 보인다(결정 7). 단계가 바뀌어도 처음부터 세지 않는다. 다시 읽기 뒤에도 기록된 시각으로 이어서 센다.
4. **activity 행은 그대로.** activity 행은 지금처럼 thread의 마지막 항목인 동안 spinner와 진행형 머리를 보이고, 턴 표시도 함께 보인다(결정 4). 그래서 진행 표시가 두 개 함께 보일 수 있고, Claude·Codex 도구가 끝난 뒤에도 activity 행은 다음 출력까지 "Running a command" 같은 진행형 머리로 돈다. 그동안 턴 표시는 일반 단계나 생각 중을 말한다. 펼친 단계 목록, 접힌 permission·question 줄도 그대로다.
5. **Codex 읽기.** Codex `commandExecution`의 `commandActions`가 하나이고 그 type이 `read`이면 턴 표시는 그 경로를 읽는 단계를, `listFiles`·`search`이면 파일을 읽는 단계를 말한다. 명령 글은 보이지 않는다. activity 기록은 지금처럼 명령이고, activity 행, 대화 목록 preview, conversation strip, thread step의 글은 바뀌지 않는다(결정 6).
6. **두 화면이 같다.** Overview와 캔버스 conversation panel의 thread가 같은 규칙을 따른다(`ConversationThread`를 같이 쓴다). 캔버스 페이지에서 보드의 작업 notice는 바뀌지 않는다.
7. **접근성과 움직임.** 단계의 종류가 바뀔 때 화면 읽기 프로그램에 한 번 알린다(기존 sr-only status 하나로, 경로와 경과 시간 없이, 300ms 규칙을 거친 뒤). 경과 시간의 매초 변화는 알리지 않는다. 턴 표시는 live region이 아니고, 경과 시간은 화면 읽기에서 숨기며, 조작할 수 없고 Tab 순서에 없다. Stop은 composer에만 있다. 턴 표시는 한 줄 고정 높이이고 긴 경로는 말줄임표로 끝나므로, 단계가 바뀌어도 thread 높이가 바뀌지 않는다. `prefers-reduced-motion`에서는 움직이는 부분이 멈추고 글은 그대로 바뀐다.
8. **다른 동작은 그대로.** 대화 기록의 event 종류와 턴마다 terminal 하나라는 규칙(결정 2로 기록 형식은 바뀌지 않는다), activity 행, Send·Queue·Stop·Send now, unseen, 대화 목록 요약, 알림, toast, 사이드바 slot, conversation strip, 보드 작업 notice(결정 8), promotion 판정(편집 activity와 파일 변경)은 바뀌지 않는다.
9. **실제 앱.** build한 격리 앱에서 Overview와 캔버스 panel 각각에서 확인한다. Claude Code와 Codex는 반드시, ACP provider는 로그인한 것만 본다. provider마다 볼 단계: Claude는 생각, Codex는 읽기와 경로, Copilot·Antigravity는 진행 중 도구. 메시지가 thread에 들어간 순간부터 턴 표시가 있고, permission을 기다리는 동안 없고, Stop과 턴 끝에 사라진다(`/runtime-test`, 스크린샷 기록). 보지 못한 provider와 표면은 BACKLOG에 적는다.

## 비목표

- **생각 내용 보이기.** thinking·thought 글이나 Codex reasoning 요약을 thread에 보이지 않는다(결정 5).
- **토큰 수와 둘째 줄.** 턴 중간 토큰 값이 provider마다 고르지 않다(design '조사 결과'). 팁 같은 둘째 줄도 없다(사람의 말).
- **진행률과 남은 시간.** provider가 보내지 않으므로 지어내지 않는다.
- **보내는 중(acceptance 전)의 표시.** 그때 메시지는 아직 composer에 있고 Send가 spinner를 보인다(`DockedComposer.tsx`의 `SendButton`). 시작이 거절되면 draft가 그대로 남는 규칙(PRODUCT §5 item 1)이 이 상태에 기대므로 바꾸지 않는다(결정 9).
- **queue에 있던 메시지가 이전 턴 뒤 자동으로 나가기까지의 빈 시간.** 그 메시지는 queue 행에 있고 아직 턴이 없다. Claude `turn.done` 직후 보낸 메시지가 약 10.8초 뒤에 턴을 시작하는 결함(BACKLOG 'Known defects')과 함께 이 feature가 다루지 않는다.
- **activity 행의 진행형 머리가 실제 일과 다른 것(문제 4).** 결정 4로 고치지 않는다. BACKLOG 'Known defects'에 적는다(Z2).
- **캔버스 작업 notice, conversation strip, 사이드바 slot, Home의 변경.** 그대로다.
- **Claude subagent(Task) 안의 단계.** `parent_tool_use_id`가 있는 frame은 지금처럼 읽지 않는다(`normalizeClaude`). subagent가 도는 동안 상위 frame이 무엇을 보내는지는 P1에서 본다.
- **work-update의 note를 thread에 보이기.** 그 note는 보드의 작업 notice 글이다(work-update spec 완료 조건 5). thread에 옮기지 않는다.
