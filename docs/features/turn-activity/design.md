# turn-activity — design

## 조사 결과

2026-11-06에 코드와 이미 기록된 provider frame을 읽어 확인했다. 새 provider 턴은 돌리지 않았다.

### 지금 thread가 턴 동안 보이는 것(코드로 확인)

| 턴의 순간 | thread | 근거 |
|---|---|---|
| Send를 누른 뒤 acceptance 전 | 메시지는 아직 composer에 있다. 카드가 읽기 전용이 되고 Send가 spinner를 보인다. runner는 이 사이에 열린다(새 대화의 `openRunner`). | `DockedComposer.tsx:390`, `:402`; `service.ts:185`, `:277` |
| acceptance(`user.message` + `turn.started`) 뒤 첫 출력 전 | 사람의 bubble만 있다. `turn.started`는 항목을 만들지 않는다. 화면 읽기용 상태 글은 빈 문자열이다. | `service.ts:216`, `:320`; `threadItems.ts:163-167`; `ConversationThread.tsx:407-414`, `:594` |
| 도구 시작(`activity`) | activity 묶음 행. 묶음이 thread의 마지막 항목이고 턴이 안 끝났으면 14px spinner와 진행형 머리("Reading <path>", "Running a command", 그 밖은 요약). | `threadItems.ts:189-201`, `:119-122`, `:239-245`; `ConversationThread.tsx:539-546` |
| 도구가 끝난 뒤 다음 출력 전 | 끝났다는 event가 없으므로 위 행이 그대로 돈다. | `transport.ts:150-157`, `:289-294` |
| 답 글이 흐르는 동안 | agent 메시지 끝의 깜빡이는 caret. | `ConversationThread.tsx:233-240`; `styles.css:888-889` |
| 답 글 하나가 끝난 뒤(`message.done`) | caret이 사라지고 아무 표시 없음. | `threadItems.ts:172-188` |
| permission·question 대기 | 카드("<Provider> needs your answer"). | `ConversationThread.tsx:547-567` |
| 답한 뒤 | 카드가 접힌 한 줄("Allowed once · …")이 마지막 항목이 되어, 그 위 activity 행의 spinner도 꺼진다. | `threadItems.ts:202-211`, `:239-245` |
| terminal | 답, "No reply.", 끝 notice. | `threadItems.ts:224-235` |

턴 동안 thread 밖에서 보이는 것: composer의 Stop(`composerRules.ts:27-30`), 사이드바 slot spinner, 캔버스 페이지의 보드 작업 notice("Agent is working", `agentIndicator.ts:77-83`). Overview에는 보드 notice가 없다. 문제 workspace의 conversation strip은 "Starting <Provider>"와 "<Provider> is working"을 보이지만(`conversationStrip.ts:93-94`) Overview와 캔버스 페이지에는 strip이 없다(PRODUCT §5 item 1).

Codex MCP 대기 줄("Waiting for <Notion>")은 runner가 턴 전에 내는 `activity`다(`mcpStartup.ts:81`). 턴 안에서 thread가 단계를 문장으로 말하는 유일한 선례다.

### provider가 보내는 것과 Doan이 버리는 것(기록된 frame으로 확인)

frame 출처: `.scratch/canvas-handoff/out/frames/`(2026-11-05, canvas-handoff P1·P2, provider × permission mode, probe가 permission에 allow-once로 자동 답함)와 `.scratch/context-window-ring/out/frames/`(2026-11-05, context-window-ring P2–P5). 한 줄이 stdout·stdin chunk 하나다(`{t, d: spawn|in|out, s}`, hook은 `.scratch/context-window-ring/hook.cjs`). 버전: Claude Code 2.1.318(모델 `claude-opus-5-5`), Codex 0.166.0, Copilot 1.0.105, Antigravity ACP 1.3.0, Cursor 2026.10.22-27dcf5f(canvas-handoff P 결과).

| provider | 턴 동안 오는 신호 | Doan이 읽는 것 | 버리는 것 |
|---|---|---|---|
| Claude Code | prompt 뒤 46–85ms에 `system/status` `"requesting"`, 도구 결과 뒤마다 다시 `requesting`. `stream_event` `content_block_start`(`thinking`·`tool_use`·`text`), `thinking_delta`(글은 대개 빈 문자열, `thinking_display: "updates"`; 한 턴에서는 짧은 글이 왔다), `system/thinking_tokens`(추정 토큰), 도구 결과 `user` frame, `session_state_changed`. | `text_delta` → `message.delta`; 완성된 `assistant` frame의 `tool_use` → `activity`; `result` → terminal(`transport.ts:128-170`). `system/status`는 permission mode 읽기에만 쓴다(`transport.ts:116-119`). | thinking 시작·끝, `requesting`, `tool_use` block 시작(완성 frame보다 0.4–2.6초 빠름), 도구 결과(도구 끝), `parent_tool_use_id` frame 전부(`transport.ts:122`). |
| Codex | `turn/started`(turn/start 뒤 13–128ms), `item/started`·`item/completed`(`userMessage`, `reasoning`, `commandExecution`, `agentMessage`), `item/agentMessage/delta`, `thread/tokenUsage/updated`. `reasoning` item은 시작과 끝이 같은 ms(0–2ms 차)이고 `summary`·`content`가 빈 배열이었다. reasoning delta 알림은 한 번도 없었다. `commandExecution`의 `commandActions` type은 `read`(경로 포함), `listFiles`, `unknown`이 보였다. | `agentMessage` delta·completed, `commandExecution`·`fileChange`·`mcpToolCall`의 `item/started` → `activity`(`transport.ts:273-298`). | `commandActions`의 type과 경로, `item/completed`(도구 끝), `reasoning`. |
| Copilot | `tool_call`(pending, `kind`·`title`), `tool_call_update`(in_progress, completed), `agent_thought_chunk`(두 턴에서 76–88개, 약 1.2초 동안), `plan`, `usage_update`. | `agent_message_chunk` → `message.delta`; `tool_call(_update)`이 `completed`일 때만 `activity`(`acp.ts:138-160`). | thought chunk, plan, pending·in_progress 도구. |
| Antigravity | `tool_call` pending + `session/request_permission`, `tool_call_update` in_progress·completed, `usage_update`. thought chunk는 없었다. 도구 사이에 3.0–4.8초 동안 아무 frame도 없었다. | Copilot과 같다. | pending·in_progress 도구. |
| Cursor | `available_commands_update`와 `agent_message_chunk`뿐(context-window-ring P5와 같다). | `agent_message_chunk`. | 없음. |

"생각 중"을 Doan이 실제로 알 수 있는 provider는 Claude(thinking block의 시작과 끝)와 Copilot(thought chunk가 오는 동안)뿐이다. Codex는 reasoning을 시작·끝이 같은 순간의 item으로만 알리므로, 그 앞의 수 초는 frame이 하나도 없다(예: `2026-11-05T15-55-57-004Z-codex-87743.jsonl`에서 `userMessage` 뒤 9.6초 동안 frame 없음). Antigravity·Cursor도 신호가 없다.

### 잰 빈 시간

방법: `.scratch/turn-activity/gaps.py`가 위 두 폴더의 frame을 턴별로 읽어, "thread에 처음 보이는 출력"(`message.delta`, `activity`, permission 요청)까지의 시간과, thread에 spinner·caret·카드가 없는 구간을 지금의 `threadItems` 규칙대로 계산했다(결과 `.scratch/turn-activity/gaps.txt`, Claude 단계 내역 `claude_phases.txt`). 기준 시각은 provider stdin에 prompt를 쓴 순간이다. Doan의 `turn.started`는 그 직전 acceptance에서 쓰인다. 모두 probe 턴(짧은 명령 몇 개, 짧은 답)이고, permission은 probe가 0.1–0.5초 안에 답했다.

| provider(턴 수) | prompt → 첫 출력 | 턴 안에서 가장 긴 빈 구간 | 내역 |
|---|---|---|---|
| Claude Code(7) | 1.5–3.0초 | 1.9–6.2초 | `requesting` → 모델 첫 byte 0.5–1.1초(한 번 4.8초), `tool_use` 입력 생성 0.4–2.6초. 가장 긴 구간은 마지막 답 전의 thinking 3.2–5.2초. permission이 있던 5턴은 빈 구간 합이 턴 길이의 44–92%(답한 카드가 접히면 spinner가 꺼지므로). permission이 없던 2턴은 첫 출력 뒤 빈 구간이 없지만, 마지막 thinking 3.5·4.7초 동안 activity 행이 "Running a command"로 돌았다. |
| Codex(14) | 2.3–11.2초 | 2.3–11.2초 | 대부분 첫 출력 전 구간이 가장 길다. frame이 없는 구간이다. |
| Antigravity(6) | 2.3–7.1초 | 2.3–7.1초 | 첫 신호가 곧 첫 `tool_call`이나 답 글이다. 도구 사이 3.0–4.8초 frame 없음. |
| Copilot(6) | 5.1–9.4초 | 5.1–9.4초 | 첫 2.5초 근처에 `usage_update`, 두 턴에서 thought chunk. |
| Cursor(1) | 1.1초 | 1.1초 | 답 글만 온다. canvas-handoff의 Cursor 턴은 계정 한도로 시작하지 않아 셈에서 뺐다. |

가정: 실제 디자인 작업 턴(파일을 많이 읽고 오래 생각하는 턴)에서는 빈 구간이 이보다 길다. 기록된 긴 턴이 없어 확인하지 않았다(PoC 의존 P4).

### 턴 중간 토큰 값(넣지 않는 이유)

턴 중간 토큰 값은 Codex(`thread/tokenUsage/updated`), Copilot·Antigravity(ACP `usage_update`), Claude(frame마다의 `usage`)에는 있고 Cursor에는 없다(context-window-ring tasks 'P 결과' P2–P5). provider마다 고르지 않으므로 턴 표시에 토큰 수를 넣지 않는다(사람의 말, spec 비목표).

### 참고: Claude Code CLI의 작업 줄

사람이 2026-11-06에 본 Claude Code CLI의 작업 줄: 움직이는 글리프, 동명사 동사("Mulling…"), 괄호 안 경과 시간과 토큰 수("(5m 7s · ↓ 11.2k tokens)"), 그 아래 들여 쓴 둘째 줄(팁). 사람은 이런 형태도 괜찮다고 했고, 토큰 수와 둘째 줄은 뺐다. Doan이 채울 수 있는 부분:

- 경과 시간: 모든 provider. `turn.started`의 `at`과 지금 시각으로 renderer가 센다. provider에 기대지 않는다.
- 단계 동사: "생각 중"은 Claude·Copilot만, 도구 단계는 모든 provider(Claude·Codex는 activity로, ACP는 진행 중 `tool_call`을 읽으면), 답 쓰기는 모든 provider, 그 밖은 일반 단계(§2).
- 토큰 수: 위 이유로 넣지 않는다.
- 움직이는 글리프: 데이터가 필요 없다. 형태는 결정 1.

## 1. 턴 상태(순수 함수)

renderer의 순수 함수 `turnStatus(events, live, phase, now)`가 thread 끝의 턴 표시를 정한다. `events`는 병합된 대화 event(`mergeConversationEvents`), `live`는 지금 thread가 받는 그 값, `phase`는 §2의 단계 신호(없으면 null)다.

| 상태 | 조건 | 턴 표시 |
|---|---|---|
| 없음 | 마지막 턴에 terminal이 있다, 또는 `live`가 아니다(접힌 턴), 또는 `turn.started`가 없다 | 없다 |
| 답 기다림 | 답하지 않은 permission·question이 있다 | 없다(결정 3). 카드가 대신한다 |
| 답 쓰기 | 마지막 항목이 흐르는 agent 메시지다 | 답 쓰기 단계 |
| 도구 | 이 턴의 최신 단계 신호가 도구다. 단계 신호가 없으면 마지막 항목이 이 턴의 activity이고 그 뒤 신호가 없다 | 그 도구의 단계(읽기와 경로, 명령 실행, 편집과 경로, 그 밖은 요약) |
| 생각 | 이 턴의 최신 단계 신호가 생각이다 | 생각 단계 |
| 일반 | 위가 아닌 모든 live 턴(첫 출력 전, 도구가 끝난 뒤, 답 글 하나가 끝난 뒤, 접힌 permission 뒤) | 일반 단계 |

- 경과 시간은 그 턴의 `turn.started.at`부터다. 상태가 바뀌어도 다시 세지 않는다. 시각이 읽히지 않거나 미래면 0초로 둔다.
- 화면 읽기용 상태 글(`phaseText`, `ConversationThread.tsx:407-414`)도 이 함수로 바꾼다. "needs your answer"는 그대로이고, 단계 이름이 바뀔 때만 글이 바뀐다. 경과 시간은 넣지 않는다.
- `context.usage`(context-window-ring)처럼 이 함수가 모르는 event type은 출력으로 세지 않고 건너뛴다.
- Send now로 보내는 중인 메시지(`withSending`)는 thread 끝에 붙는다. 턴 표시는 그 뒤, thread의 맨 끝이다.
- Stop을 누른 뒤 terminal이 올 때까지는 live 턴이므로 표시가 남는다. 따로 "Stopping" 상태를 두지 않는다.

activity 행(결정 4): `threadItems`와 activity 행은 바뀌지 않는다. 행은 지금처럼 thread의 마지막 항목이고 턴이 안 끝났으면 spinner와 진행형 머리를 보인다(`threadItems.ts:239-245`). 그래서 다음이 그대로 남는다.

- 턴 표시와 activity 행의 spinner, 두 진행 표시가 함께 보일 수 있다.
- Claude·Codex 도구가 끝난 뒤 다음 출력까지 activity 행은 계속 "Running a command"·"Reading <path>"로 돈다. 그동안 턴 표시는 단계 신호에 따라 일반 단계나 생각 중을 말하므로, 두 표시가 다른 일을 말할 수 있다.
- ACP 도구가 도는 동안 activity 행은 없고(완료 때 생기므로) 턴 표시만 도구 단계를 말한다. 끝난 뒤에 생긴 activity 행이 진행형 머리로 돈다.
- `turnStatus`의 도구 상태는 단계 신호가 없을 때만 마지막 activity로 정한다. activity 행의 `running`을 읽지 않는다.

## 2. 단계 신호(결정 2: 기록하지 않는 live 신호)

main의 normalizer가 provider frame을 읽는 같은 자리에서 단계를 함께 낸다. 단계는 턴 동안만 뜻이 있으므로 대화 기록에 쓰지 않고, main window에만 보낸다.

| provider | 생각 | 도구 | 일반(도구 끝, 모델 요청) |
|---|---|---|---|
| Claude | `content_block_start` `thinking`부터 그 block의 `content_block_stop`까지 | 완성된 `assistant`의 `tool_use`(지금 `activity`를 내는 자리; activity와 같은 요약) | 도구 결과 `user` frame, `system/status` `requesting`, `content_block_stop` |
| Codex | 없음 | `item/started`의 `commandExecution`·`fileChange`·`mcpToolCall`(activity와 같은 요약, §3의 읽기 포함) | 같은 item의 `item/completed` |
| ACP | Copilot `agent_thought_chunk`가 오는 동안(다음 다른 update까지) | `tool_call` pending·in_progress(kind와 `locations`의 경로; `execute`는 명령이라는 사실만, title을 쓰지 않는다) | `tool_call_update` completed·failed |

- 모양: `{conversationId, turnId, seq, phase}`. `phase`는 `{kind: "thinking"} | {kind: "tool", activity: "read" | "edit" | "command" | "other", path?: string, summary: string} | {kind: "general"}`. `summary`·`path`는 activity와 같은 길이 제한(512)과 같은 규칙(명령 글 없음, Doan connector 도구의 입력 없음, `transport.ts:85-103`)을 따른다. `seq`는 main이 그 신호를 낼 때까지 그 대화에 쓴 마지막 seq다.
- main은 live entry마다 마지막 단계를 하나 기억한다. 턴의 terminal, Stop, archive, 삭제, 앱 종료가 지운다. terminal 뒤에는 내지 않는다(normalizer의 `state.terminal` 검사와 같은 자리).
- IPC: 새 main→renderer 채널 `conversation:phase`(main window의 main frame에만, `conversation:event`와 같은 대상 규칙). `conversation:event`는 seq가 있는 기록만 실으므로(ARCHITECTURE §7 'List and seen' 끝 문장) 그 채널에 섞지 않는다. 다시 읽기를 위해 `conversation:read`의 답에 live 턴의 마지막 단계를 더한다.
- renderer(`ConversationStore`)는 대화마다 마지막 단계를 기억하고, 그 단계의 `turnId`가 지금 턴과 다르거나 `seq`보다 큰 event가 그 뒤에 왔으면 단계를 쓰지 않고 event로 정한다(§1). 그래서 늦게 온 신호가 새 event를 덮지 않는다.
- 다시 읽기 뒤 단계가 아직 없으면 §1의 event 규칙으로 정한다(일반이나 도구).

고르지 않은 안: (A) renderer만 바꾸기 — 기존 event와 경과 시간만 쓴다. main과 IPC가 바뀌지 않지만 "생각 중"을 말할 수 없고, 도구가 끝났는지 모른다. (C) 단계를 대화 기록의 새 event type으로 쓰기 — 다시 읽기와 재시작에도 남지만, 이 type을 모르는 옛 build는 기록을 손상으로 읽는다(ARCHITECTURE §7 'Events' 끝 문장). 턴이 끝나면 아무도 읽지 않는 줄이 기록에 쌓인다.

## 3. Codex 읽기 activity(결정 6)

`codexActivities`(`transport.ts:104-113`)에서 `commandExecution`의 `commandActions`가 하나이고:

- `read`이고 `path`가 있으면 `activity("read", path, displayPath(path, root), root)`.
- `listFiles`나 `search`이면 `activity("read", path ?? "", GENERIC_SUMMARY.read, root)`.
- 그 밖(`unknown`, action이 없거나 여럿)은 지금처럼 명령이다.

명령 글(`command`)은 어디에도 쓰지 않는다. permission 요약 경로(`codexPermission`)는 바뀌지 않는다. 경로는 Claude `Read`처럼 root 밖이면 절대 경로로 보인다(`rootRelative`, `threadItems.ts:49-62`).

## 4. renderer

- `ConversationThread`가 thread 끝에 턴 표시를 그린다. 두 호스트(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)는 `ConversationStore`의 단계를 prop으로 넘긴다. thread는 지금처럼 props만 받고 preload를 부르지 않는다(ARCHITECTURE §7 'Renderer primitives').
- 경과 시간은 턴 표시가 있는 동안에만 1초 timer로 다시 그린다. thread 높이가 바뀌지 않는 다시 그리기는 스크롤을 따라가지 않는다(`threadScroll`, `threadItems.ts:294-297`). 턴 표시가 처음 나타나 높이가 바뀌면 지금 규칙대로 바닥 24px 안에서만 따라간다.
- 움직임은 `prefers-reduced-motion`에서 멈춘다. 숨겨진 window에서는 timer를 돌리지 않는다(보드의 점 무늬가 `window:visible`을 따르는 것과 같은 이유, `CanvasAgent.tsx:120-127`).
- 형태, 글, 크기, 색은 `/design-draft`의 변형 중 사람이 고른 것을 따른다(결정 1). 글은 `clarify` preset(`doan design-skill clarify --json`)을 거쳐 정한다.

## 초안 요청

`/design-draft turn-activity`로 새 파일 `.doan/canvases/turn-activity.html`에 **턴 표시의 변형 여러 개**를 그린다. 한 형태로 좁히지 말고 서로 다른 표현을 펼친다(사람의 요청: "디자인 드래프트에서 제한을 두지 말고 다양하게 표현해보라고 해"). 사람은 앱에서 그중 하나를 고르고, 그 선택이 결정 1의 형태가 된다. 기본 후보 (a)를 반드시 변형 하나로 그린다.

- 변형마다 같은 상태 묶음을 그린다. 변형 하나가 frame 하나이거나, 상태 하나가 frame 하나이고 그 안에 변형을 나란히 둔다(그리는 쪽이 고른다).
- 변형의 출발점(이것으로 제한하지 않는다): (a) Claude Code CLI 작업 줄 같은 한 줄 — 움직이는 글리프, 단계 동사, 경과 시간, 토큰 수와 둘째 줄 없음. (b) 그리는 쪽이 제안하는 다른 형태들. 예를 들어 agent 답 자리의 자리표시, 사람 bubble에 붙는 받음 표시와 단계, thread 끝의 작은 카드, activity 행과 한 몸인 줄. 같은 thread 안에서 읽히는 위계와 소란스러움이 서로 다른 변형을 고른다.
- 상태: (1) 메시지가 막 들어가 첫 출력 전(일반), (2) 생각 중(Claude·Copilot), (3) 파일 읽기(짧은 경로, panel 폭에서 말줄임표가 생기는 긴 경로), (4) 명령 실행, (5) 도구가 끝나고 다음 출력 전(턴 표시는 일반으로 돌아가고, activity 행은 지금처럼 진행형 머리와 spinner로 돈다: 두 진행 표시가 함께 보이는 모습, 결정 4), (6) 답 글이 흐르는 중, (7) permission 카드 대기(턴 표시 없음, 결정 3), (8) 답한 뒤 접힌 줄 아래, (9) Codex MCP "Waiting for <Notion>" 줄과 함께, (10) Send now 메시지가 보내지는 중일 때, (11) 경과 시간이 짧을 때와 1시간을 넘을 때.
- 폭: Overview thread 열(최대 720, DESIGN.md 'Project Overview')과 캔버스 conversation panel의 기본 `max(320px, 28dvw)`·최소 280(DESIGN.md 'Canvas area and right panel'의 'Panel width').
- reduced motion에서 멈춘 모습을 따로 하나.
- 기존 thread의 시각 체계(activity 행, notice, caret, spinner)를 읽고 그리되, 보드 작업 notice의 모양을 따를 필요는 없다(사람: "시각적인걸 말한건 아니였어").
- 글은 `clarify` preset을 읽고 쓴다. 상태마다 지금 필요한 사실 하나, 같은 개념에 같은 말, 모르는 진행을 지어내지 않기.
- 기존 초안 파일은 고치지 않는다.

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. renderer `turnStatus(events, live, phase, now)` — §1의 상태 표 전체: terminal·접힌 턴·답 기다림에서 없음, 답 쓰기, 단계 신호의 `turnId`·`seq` 비교, 신호가 없을 때 event 규칙, `context.usage` 같은 모르는 type 무시, Send now 메시지와 함께, 경과 시간 계산(미래·잘못된 시각은 0).
2. renderer 경과 시간 글 `elapsedText(ms)` — 글 모양은 초안과 clarify 뒤에 고정한다.
3. main `normalizeClaude`, `normalizeCodex`, `normalizeAcp`의 단계 출력 — 표 §2의 각 칸, terminal 뒤 없음, 다른 `threadId`·`turnId`의 Codex 알림 무시, `parent_tool_use_id` frame 무시, Doan connector 도구 입력 없음, ACP `execute`의 title을 쓰지 않음. 기존 event 출력은 그대로(같은 fixture에서 events가 바뀌지 않음).
4. main `codexActivities`의 `commandActions` 읽기(§3).

## 포맷 변경

- 대화 기록(event JSONL v1)은 바뀌지 않는다(결정 2). Codex 읽기 activity는 이미 있는 `activity` 모양이다.
- 새 IPC 채널 `conversation:phase`와 `conversation:read` 답의 필드가 생긴다. TypeScript 안의 계약이고 공유 JSON Schema(ARCHITECTURE §11)가 아니다.
- fixture: `app/src/main/conversation/fixtures/`의 `claude.json`, `codex.json`, `acp-copilot.json`에 thinking block, `commandActions` `read`, `agent_thought_chunk`·진행 중 `tool_call`이 없다면 기록된 frame에서 개인 정보를 지우고 더한다. 기존 기대 event는 바뀌지 않아야 한다.

## 관례 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙, guide, skill stub이 바뀌지 않는다.

## 결정 영향

- append-only event, 턴마다 terminal 하나: 단계 신호는 event가 아니므로 기록과 terminal 수를 바꾸지 않는다.
- 명령 글을 activity에 쓰지 않는 2026-10-30 결정(`transport.ts:97-98`): 단계 신호와 Codex 읽기 activity도 따른다. 경로만 쓴다.
- MCP 도구 입력을 요약에 넣지 않는 규칙(PRODUCT §3 'MCP tools'): 단계 신호의 도구 요약도 activity와 같은 함수(`claudePermissionSummary`, `codexActivities`)로 만든다.
- Renderer 경계(ARCHITECTURE §7 'Settings IPC'의 'Renderer import boundary', §7 'Renderer primitives'): 단계 type은 type만 import하는 파일에 둔다.
- PRODUCT §5 items 2·3의 thread 규칙이 늘어난다(마지막 task).

## PoC 의존

결정 2는 기록된 frame에서 본 신호에 기댄다. 아래가 다르면 그 provider의 단계가 "일반"으로 떨어질 뿐, 턴 표시와 경과 시간은 남는다.

- **P1 Claude**: Doan이 고를 수 있는 다른 모델(Sonnet, Haiku)과 effort, 최소 버전 2.1.284에서도 thinking block과 `requesting`이 오는가. 기록은 2.1.318·`claude-opus-5-5`뿐이다. Doan이 `system/status`와 `stream_event`를 SDK에서 이미 받는다는 것은 코드로 확인했다(`transport.ts:116-119`, `:129-137`).
- **P2 Codex**: 0.158.0에서도 reasoning이 순간 item이고, 생각 동안 알림이 없는가. `commandActions`의 `search` 모양(본 적 없음)과 `listFiles`의 `path`.
- **P3 ACP**: Copilot thought chunk가 다른 턴·모델에서도 오는가. 오래 걸리는 도구(수 초)에서 `tool_call` pending → in_progress → completed가 그 시간만큼 벌어지는가(기록은 모두 50ms 안에 끝났다).
- **P4 긴 턴**: 실제 디자인 작업 턴 하나의 빈 구간(가정 확인용, 설계를 바꾸지 않는다).

모두 로그인한 provider와 공용 프로필(chain-261106 '로그인')이 필요하므로 사람의 승인 뒤에 돌린다.

## 겹치는 feature와 순서

- **context-window-ring**(진행 중, chain-261105 링크 3): `context.usage` event를 terminal 바로 앞에 더하고, Claude 스트림·Codex `thread/tokenUsage/updated`·ACP `usage_update`를 normalizer에서 읽는다(그 design §1). 이 feature도 같은 normalizer(`transport.ts`, `acp.ts`)를 고친다. thread는 `context.usage`를 그리지 않으므로 `turnStatus`도 그 type을 출력으로 세지 않는다. 링은 composer tray에 있고 턴 표시와 자리가 겹치지 않는다. 이 feature는 그 병합 뒤에 시작한다.
- **work-update**(chain-261106 링크 1): 앱 대화의 `doan work update` note를 보드 작업 notice의 글로 보인다. note는 메모리에만 있고 대화 기록과 thread에 쓰지 않는다(그 spec 완료 조건 4·5). 캔버스 페이지에서는 보드 notice가 note를, panel thread의 턴 표시가 단계를 보인다. 두 출처가 다르므로 충돌하지 않는다. 그 feature는 앱 대화 환경에 대화 id를 넣느라 `service.ts`·`environment.ts`를 고친다. 이 feature의 `service.ts` 단계 기억과 겹칠 수 있다.
- **canvas-handoff**(chain-261106 링크 2): thread에 핸드오프 줄과 인계 카드를 더하고(`threadItems.ts`, `ConversationThread.tsx`; 그 tasks B5·U1), 원래 턴이 끝나면 이어받는 대화의 턴을 자동으로 시작한다. 이어받는 대화의 첫 턴도 보통 턴(`turn.started`)이므로 턴 표시가 나온다. 원래 대화의 "Hands off to <canvas> when this turn ends" 줄은 턴 안의 항목이고 턴 표시는 그 아래 thread 끝이다. 같은 파일을 고치므로 그 병합 뒤에 시작한다.
- **chain-261106**의 순서는 work-update → canvas-handoff이고 이 feature는 들어 있지 않다. 이 feature는 그 체인이 끝난 뒤에 시작하거나, 사람이 정하면 그 체인의 셋째 링크로 둔다.

## POSTMORTEM에서 가져온 함정

- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: `turnStatus`와 단계 type을 renderer가 값으로 가져오면 그 파일은 type만 import해야 한다. `rendererImports.test.ts`가 지키고, 값 import를 더한 batch 뒤에는 build한 앱을 한 번 띄운다.
- **2026-10-27 'Codex ingress confused unowned requests and notification errors'**: Codex 단계는 `threadId`·`turnId`가 지금 턴인 알림에서만 낸다(`normalizeCodex`의 기존 검사 뒤, `transport.ts:270-272`).
- **2026-10-27 'Protocol readiness lagged behind process and turn ownership'**: 한 chunk에 reply와 알림이 함께 오면 순서가 어긋날 수 있었다. 단계는 같은 normalize 단계에서 events와 함께 계산하고, 그 frame의 events 다음에 보낸다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: 단계 신호는 live 턴의 id로 막는다. 끝난 턴의 늦은 신호가 다음 턴에 나오지 않는다(renderer의 `turnId`·`seq` 비교도 같은 목적).
- **2026-10-27 'Filtering error replies hid duplicate native settlement'**: 테스트는 턴마다 terminal event가 여전히 하나인지 모든 terminal 종류를 세어 확인한다. 단계 신호는 그 수에 들지 않는다.
- **2026-10-30 'Timing tests failed under machine load …'**: 경과 시간 timer 테스트는 fake timer로 쓰고, 기다림보다 test 한도를 넉넉히 둔다.

## 읽은 design preset

`doan design-skill --json`으로 목록을 보고 `shape`(기존 화면 확장은 그 화면의 시각 체계를 물려받는다, Operate 화면은 분명한 상태)와 `clarify`(상태마다 지금 필요한 사실 하나, "Loading text names the real operation … never invent progress", 같은 개념에 같은 말)를 읽었다. UI 글은 이 문서에서 정하지 않고 `/design-draft`에서 `clarify`를 거쳐 정한다.

## 결정

사람이 2026-11-06에 정했다. spec 완료 조건은 이 결정을 따른다.

1. **턴 표시의 형태.** `/design-draft` 변형 캔버스에서 사람이 고른다. 기본 후보는 (a) Claude Code CLI 작업 줄 같은 한 줄: 움직이는 글리프 + 단계 동사 + 경과 시간, 토큰 수와 둘째 줄 없음. 초안은 이것으로 좁히지 않고 여러 형태를 그린다. 이유: 사람이 초안에서 여러 표현을 보고 고르겠다고 했다.
2. **단계를 아는 경로.** (B) main이 provider frame에서 단계를 읽어 기록하지 않는 live 신호(`conversation:phase`)로 보낸다(§2). 이유: "생각 중"과 "도구 끝"은 provider frame에만 있고, 턴이 끝나면 뜻이 없는 단계를 기록에 쓰면 옛 build가 그 기록을 손상으로 읽는다.
3. **턴 표시가 보이는 범위.** live 턴 내내 보이고, permission·question 카드가 답을 기다리는 동안만 없다. 이유: 볼 곳이 thread 끝 한 곳으로 고정되고, 대기 중에는 카드가 이미 "needs your answer"를 말한다.
4. **activity 행과의 관계.** 둘 다 진행을 보인다. activity 행은 지금처럼 spinner와 진행형 머리를 유지하고, 턴 표시도 함께 보인다(§1 'activity 행'). 이유: 사람이 권장안(행을 기록만으로 바꾸기) 대신 고른 것이다. 결과로 두 진행 표시가 함께 보일 수 있고, Claude·Codex 도구가 끝난 뒤에도 activity 행의 spinner가 다음 출력까지 돈다.
5. **생각 내용.** 보이지 않는다. 단계만 보인다. 이유: Claude는 대개 빈 thinking 글을, Codex는 빈 reasoning 요약을 보내고 Antigravity·Cursor는 보내지 않아 provider마다 고르지 않다.
6. **Codex 읽기 명령.** `commandActions`가 `read`·`listFiles`·`search` 하나이면 경로만 쓴 읽기 activity로 기록하고, 명령 글은 쓰지 않는다(§3). 이유: "코드 읽을 때"가 Codex에서 보이게 되고, 2026-10-30의 명령 글 규칙을 지킨다.
7. **경과 시간.** `turn.started`부터 턴 끝까지 이어서 센다. 이유: "보낸 지 얼마나 됐나"에 답하고, 기록된 `at`으로 다시 읽기 뒤에도 같은 값이 나온다.
8. **다른 화면.** thread만 바꾼다. conversation strip, 사이드바 slot, 보드 작업 notice는 그대로다. 이유: 사람이 말한 곳은 thread다.
9. **보내는 중(acceptance 전).** 그대로다. 메시지는 composer에 남고 Send가 spinner를 보인다. 이유: 시작이 거절되면 draft가 composer에 남는 규칙이 이 상태에 기댄다.
