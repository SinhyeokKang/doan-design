# turn-activity — design

## 조사 결과

2026-11-06에 코드와 이미 기록된 provider frame을 읽어 확인했다. 새 provider 턴은 돌리지 않았다. 이 절의 줄 번호는 context-window-ring 병합 전 코드 기준이라 지금과 어긋난다. 구현 때는 함수 이름(`normalizeClaude`, `claudeActivity`, `codexActivities`, `normalizeCodex`, `normalizeAcp`, `phaseText`, `SendButton`)으로 찾는다. 아래 §1부터는 함수 이름으로 적는다.

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

renderer의 순수 함수 `turnStatus(items, turn, stage)`가 턴 표시의 상태를 정한다. `items`는 `threadItems`가 이미 만든 결과(`withSending` 적용 뒤)다. 흐르는 메시지, 대기 중인 카드, 도는 activity, 끝 뒤 event 무시, done 뒤 delta 무시, crash 접기는 `threadItems`의 fold가 이미 정하므로 다시 구현하지 않는다. `turn`은 `{turnId, at, lastSeq, live}`(마지막 턴의 id, `turn.started.at`, 그 턴의 마지막 event seq, main이 그 턴을 들고 있는지), `stage`는 §2의 단계 신호(없으면 null)다. 단계 신호가 유효한지는 이 함수 한 곳에서 정한다. 경과 시간은 따로 `elapsedText(now - at)`로 센다.

| 상태 | 조건 | 턴 표시 |
|---|---|---|
| 없음 | 마지막 턴에 terminal이 있다, 또는 `live`가 아니다(재시작으로 접힌 턴), 또는 `turn.started`가 없다 | 없다 |
| 답 기다림 | 답하지 않은 permission·question이 있다 | 없다(결정 3). 카드가 대신한다 |
| 답 쓰기 | 마지막 항목이 흐르는 agent 메시지다 | 답 쓰기 단계 |
| 단계 신호 | 유효한 단계 신호가 있다: `stage.turnId`가 이 턴이고 `stage.seq >= turn.lastSeq`(그 뒤 새 event가 없다) | 그 단계(생각, 도구, 일반) |
| 도구(event) | 단계 신호가 없거나 무효이고, 마지막 항목이 이 턴의 activity이거나, Allow로 답해 접힌 permission 줄이고 그 앞 항목이 activity다 | 그 activity의 단계(읽기와 경로, 명령 실행, 편집과 경로, 그 밖은 요약) |
| 일반 | 위가 아닌 모든 live 턴(첫 출력 전, 답 글 하나가 끝난 뒤, 거절로 접힌 permission 뒤, MCP 대기 줄과 not-ready 줄 뒤) | 일반 단계 |

- Codex MCP 대기 줄과 not-ready 줄은 `activity` `kind: "other"`이지만 도구가 아니다. `threadItems`의 `startupServers`가 이미 이 줄을 가려내므로, 그 항목은 도구(event) 상태가 되지 않는다.
- 경과 시간은 그 턴의 `turn.started.at`부터다. 상태가 바뀌어도 다시 세지 않는다. 시각이 읽히지 않거나 미래면 0초로 둔다.
- 화면 읽기용 상태 글(`ConversationThread.tsx`의 `phaseText`)도 이 상태로 바꾼다. "needs your answer"는 그대로다. 글에는 단계의 종류만 넣고(예: "<Provider> is reading files"), 경로와 경과 시간은 넣지 않는다. 종류가 바뀔 때만 글이 바뀐다.
- `context.usage` 같은 event는 `threadItems`가 항목으로 만들지 않으므로 따로 예외가 필요 없다.
- Send now로 보내는 중인 메시지(`withSending`)는 thread 끝에 붙는다. 턴 표시가 thread 끝에 있는 변형이면 그 뒤다.
- Stop을 누르면 main이 `interrupted`를 바로 쓰므로(`service.ts`) 표시가 바로 사라진다. 따로 "Stopping" 상태를 두지 않는다.
- **settle(300ms)**: 새 단계는 300ms 이어진 뒤에 보인다. 그 전에 다른 단계가 오면 앞 단계는 보이지 않는다. 답 쓰기로 바뀔 때와 답 기다림·없음으로 바뀔 때는 바로 바뀐다. Claude 기록에서 일반(requesting 약 0.6–0.8초)과 짧은 도구가 번갈아 와서, 이 규칙이 없으면 "Reading <path>"가 깜빡이고 사라진다(`.scratch/turn-activity/claude_phases.txt`). 짧은 도구는 activity 행이 이미 보이므로 잃는 정보가 없다. settle은 renderer의 표시 쪽에서 하고, `turnStatus`는 순간의 상태만 돌려준다.

activity 행(결정 4): `threadItems`와 activity 행은 바뀌지 않는다. 행은 지금처럼 thread의 마지막 항목이고 턴이 안 끝났으면 spinner와 진행형 머리를 보인다. 그래서 다음이 그대로 남는다.

- 턴 표시와 activity 행의 spinner, 두 진행 표시가 함께 보일 수 있다.
- Claude·Codex 도구가 끝난 뒤 다음 출력까지 activity 행은 계속 "Running a command"·"Reading <path>"로 돈다. 그동안 턴 표시는 단계 신호에 따라 일반 단계나 생각 중을 말하므로, 두 표시가 다른 일을 말할 수 있다.
- ACP 도구가 도는 동안 activity 행은 없고(완료 때 생기므로) 턴 표시만 도구 단계를 말한다. 끝난 뒤에 생긴 activity 행이 진행형 머리로 돈다.
- `turnStatus`는 activity 행의 `running`을 읽지 않는다.

## 2. 단계 신호(결정 2: 기록하지 않는 live 신호)

main의 normalizer가 provider frame을 읽는 같은 자리에서 단계를 함께 낸다. 단계는 턴 동안만 뜻이 있으므로 대화 기록에 쓰지 않고, main window에만 보낸다.

이름: 단계 신호는 `stage`라 부른다. `phase`는 이미 `ConversationSummary.phase`(`summary.ts`), `steerPhaseOf`(`conversationStore.ts`), `phaseText`(`ConversationThread.tsx`), ARCHITECTURE의 "counts `working`, not `phase`"에서 다른 뜻으로 쓰인다.

| provider | 생각 | 도구 | 일반(도구 끝, 모델 요청) |
|---|---|---|---|
| Claude | `content_block_start` `thinking`부터 그 block의 `content_block_stop`까지 | 내지 않는다(activity event가 같은 정보를 이미 같은 seq로 낸다, §1 도구(event)) | 도구 결과 `user` frame, `system/status` `requesting`, `content_block_stop` |
| Codex | 없음 | `item/started`의 `commandExecution` 가운데 `commandActions`가 `read`·`listFiles`·`search` 하나인 것만(결정 6, §3). 다른 도구는 activity event로 충분하므로 내지 않는다 | 같은 item의 `item/completed` |
| ACP | Copilot `agent_thought_chunk`가 오는 동안. 끝나는 때: `agent_message_chunk`, `tool_call`, status가 있는 `tool_call_update`, terminal. `usage_update`·`plan`·`available_commands_update`·status 없는 `tool_call_update`는 생각을 끝내지 않는다(Copilot은 턴 시작 2.5초쯤 `usage_update`를 보낸다) | `tool_call` pending·in_progress(kind와 `locations`의 경로; `execute`는 명령이라는 사실만, title을 쓰지 않는다). 요약은 completed 때의 activity 요약 코드(`normalizeAcp`)를 함수로 빼서 같은 규칙을 쓴다 | `tool_call_update` completed·failed |

- 모양: `{conversationId, turnId, seq, rev, stage}`. `stage`는 `{kind: "thinking"} | {kind: "tool", activity: "read" | "edit" | "command" | "other", path?: string, summary: string} | {kind: "general"}`. `summary`·`path`는 activity와 같은 길이 제한(512)과 같은 규칙(명령 글 없음, Doan connector 도구의 입력 없음)을 따른다. 도구 요약에는 `claudePermissionSummary`를 쓰지 않는다. 그 함수는 Bash에 `input.command`를 돌려준다. type은 type만 import하는 `app/src/main/conversation/types.ts`에 둔다.
- `seq`는 main이 그 신호를 낼 때까지 그 대화에 쓴 마지막 seq다. 같은 seq를 가진 단계가 여럿 생긴다(Claude thinking 뒤 `content_block_stop`의 일반, Codex 도구 뒤 `item/completed`의 일반). 그래서 `rev`를 붙인다: live entry마다 단조 증가하는 번호다. renderer는 같은 `turnId` 안에서 `rev`가 큰 단계만 남기고, `seq`는 event와의 순서(§1 유효성)에만 쓴다. Electron 45는 `ipcMain.handle` 답과 그보다 먼저 보낸 `webContents.send`의 순서를 보장하지 않는다(POSTMORTEM 2026-10-26 'The invalidation read overtook the reply'). `conversation:read` 답에 실린 옛 단계가 그 사이 push된 새 단계를 덮지 않게 하기 위해서다.
- main은 live entry마다 마지막 단계를 하나 기억한다. 턴의 terminal, Stop, archive, 삭제, 앱 종료, 프로세스 종료(`turn.failed process_exited`, normalizer 밖에서 나온다)가 지운다. 단계 callback은 `receive()`와 같은 검사(`this.live.get(id) === live && live.accepted && !live.terminal`)를 거친다. Stop을 누르면 service가 `interrupted`를 바로 쓰지만 normalizer는 provider의 result까지 `terminal: false`이므로, normalizer의 `state.terminal`만으로는 그 사이의 단계를 막지 못한다. 같은 단계가 연달아 오면 보내지 않는다(Copilot thought chunk는 턴당 76–88개다).
- 재사용한 Codex app-server는 처음 열 때의 callback을 계속 쓴다(`runners.ts`, `service.ts`의 주석). 단계 callback은 턴 id를 잡아 두지 않고, 알림의 `turnId`와 그때의 live entry로 정한다.
- IPC: 새 main→renderer 채널 `conversation:stage`(main window의 main frame에만, `conversation:event`와 같은 대상 규칙; 보내는 자리는 `app/src/main/index.ts`의 `send("conversation:event", …)` 옆). `conversation:event`는 seq가 있는 기록만 실으므로(ARCHITECTURE §7 'List and seen' 끝 문장) 그 채널에 섞지 않는다. 다시 읽기를 위해 `conversation:read`의 답에 live 턴의 마지막 단계를 더한다. renderer의 구독은 `App.tsx`의 event 구독과 같은 자리에서 store로 넘긴다. preload에 `onConversationStage`.
- Codex의 normalize와 emit은 `dispatcher.ts`에서 일어난다. 단계 callback도 그 자리를 거친다.
- 다시 읽기 뒤 단계가 아직 없으면 §1의 event 규칙으로 정한다(일반이나 도구).
- terminal session(legacy external) 대화도 같은 runner 경로를 쓰는지 C1에서 확인하고, 같으면 같은 규칙이다(spec 완료 조건 1).

고르지 않은 안: (A) renderer만 바꾸기 — 기존 event와 경과 시간만 쓴다. main과 IPC가 바뀌지 않지만 "생각 중"을 말할 수 없고, 도구가 끝났는지 모른다. (C) 단계를 대화 기록의 새 event type으로 쓰기 — 다시 읽기와 재시작에도 남지만, 이 type을 모르는 옛 build는 기록을 손상으로 읽는다(ARCHITECTURE §7 'Events' 끝 문장). 턴이 끝나면 아무도 읽지 않는 줄이 기록에 쌓인다.

## 3. Codex 읽기 단계(결정 6)

activity 기록은 바뀌지 않는다. `codexActivities`는 지금처럼 모든 `commandExecution`을 명령 activity로 쓴다. 그래서 activity 행, 대화 목록 preview(`summary.ts`), conversation strip(`conversationStrip.ts`), thread step의 글은 그대로다(사람, 2026-11-06: "턴 표시에만 쓴다").

`normalizeCodex`가 `commandExecution`의 `item/started`에서 `commandActions`가 하나이면 단계 신호를 낸다:

- `read`이고 `path`가 있으면 `{kind: "tool", activity: "read", path, summary: displayPath(path, root)}`.
- `listFiles`나 `search`이면 `{kind: "tool", activity: "read", summary: GENERIC_SUMMARY.read}`(경로가 있으면 함께).
- 그 밖(`unknown`, action이 없거나 여럿)은 단계를 내지 않는다. 턴 표시는 §1의 도구(event) 상태로 명령 실행을 말한다.

명령 글(`command`)은 어디에도 쓰지 않는다. permission 요약 경로(`codexPermission`)는 바뀌지 않는다. 경로는 Claude `Read`처럼 root 밖이면 절대 경로로 보인다(`threadItems.ts`의 `rootRelative`).

## 4. renderer

- `ConversationThread`가 턴 표시를 그린다. 두 호스트(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)는 `ConversationStore`의 단계를 prop으로 넘긴다. thread는 지금처럼 props만 받고 preload를 부르지 않는다(ARCHITECTURE §7 'Renderer primitives').
- **위치**(결정 10): thread 끝의 내용 안(마지막 항목)인지, thread 영역 아래 가장자리에 고정된 줄(composer 위, Claude Code CLI 작업 줄처럼)인지는 초안에서 사람이 고른다. 고정 줄이면 사람이 위로 스크롤해 읽는 동안에도 보이고, tick과 단계 변화가 스크롤에 닿지 않는다. 대신 "Jump to latest"(`styles.css`, 영역 아래 12px 가운데)와 자리가 겹치므로 쌓임 규칙을 초안에서 함께 정한다.
- **한 줄 고정 높이**: 턴 표시는 한 줄이고 긴 경로는 말줄임표로 끝난다. 스크롤 layout effect는 `[items]`에만 걸려 있어(`ConversationThread.tsx`) 단계 변화로는 돌지 않는다. 그래서 단계가 바뀌어 높이가 바뀌면 바닥을 따라가지 못하므로, 높이가 바뀌지 않게 한다. 턴 표시가 처음 나타나 높이가 바뀌면(내용 안 변형) items가 바뀌는 렌더와 같으므로 지금 규칙대로 바닥 24px 안에서만 따라간다.
- **timer**: 경과 시간은 매 렌더에 `turn.started.at`으로 계산한다. 1초 timer는 턴 표시만 그리는 작은 자식 컴포넌트에 둬서, 매초 `threadItems`와 스크롤 effect가 다시 돌지 않게 한다. 숨겨진 window에서는 timer를 멈추고 `document.hidden`만 본다(thread는 preload를 부르지 않으므로 `window:visible`을 직접 쓰지 않는다). 다시 보이면 `at` 기준으로 바로 다시 계산한다. 대화를 바꾸거나 panel을 접거나 terminal이 오면 timer가 정리된다.
- **접근성**: 턴 표시는 live region이 아니다. 경과 시간은 `aria-hidden`이다. 알림은 기존 sr-only status(`ConversationThread.tsx`) 하나만 하고, 단계의 종류만 settle 뒤에 알린다(§1). 표시는 조작할 수 없고 Tab 순서에 없다. Stop은 composer에만 있으므로 표시가 사라져도 focus가 떨어지지 않는다.
- 움직임은 `prefers-reduced-motion`에서 멈춘다.
- 형태, 위치, 글, 크기, 색은 `/design-draft`의 변형 중 사람이 고른 것을 따른다(결정 1, 10). 글은 `clarify` preset(`doan design-skill clarify --json`)을 거쳐 정한다. 일반 단계의 동사는 앱이 이미 쓰는 "working"이다("<Provider> is working", `ConversationThread.tsx`, `conversationStrip.ts`). 나중에 보드 notice나 strip이 단계를 보이게 될 때도 단어를 바꾸지 않아도 된다.

## 초안 요청

`/design-draft turn-activity`로 새 파일 `.doan/canvases/turn-activity.html`에 **턴 표시의 변형 여러 개**를 그린다. 한 형태로 좁히지 말고 서로 다른 표현을 펼친다(사람의 요청: "디자인 드래프트에서 제한을 두지 말고 다양하게 표현해보라고 해"). 사람은 앱에서 그중 하나를 고르고, 그 선택이 결정 1의 형태가 된다. 기본 후보 (a)를 반드시 변형 하나로 그린다.

- 변형마다 같은 상태 묶음을 그린다. 변형 하나가 frame 하나이거나, 상태 하나가 frame 하나이고 그 안에 변형을 나란히 둔다(그리는 쪽이 고른다).
- 변형의 출발점(이것으로 제한하지 않는다): (a) Claude Code CLI 작업 줄 같은 한 줄 — 움직이는 글리프, 단계 동사, 경과 시간, 토큰 수와 둘째 줄 없음. (b) 그리는 쪽이 제안하는 다른 형태들. 예를 들어 agent 답 자리의 자리표시, thread 끝의 작은 카드. 같은 thread 안에서 읽히는 위계와 소란스러움이 서로 다른 변형을 고른다.
- **위치 변형 두 가지를 반드시 그린다**(결정 10): thread 끝의 내용 안(마지막 항목)과, thread 영역 아래 가장자리에 고정된 줄(composer 위). 고정 줄 변형에는 "Jump to latest"가 함께 보일 때의 쌓임을 그린다.
- 확정된 조건을 깨는 변형(사람 bubble에 붙어 thread 끝을 벗어나는 표시, activity 행과 합쳐 행을 바꾸는 줄)은 그려도 되지만, 캔버스에 "고르면 spec 완료 조건 1·4와 결정 4를 다시 연다"고 표시한다.
- 글의 제약: 일반 단계의 동사는 "working"(앱이 이미 쓰는 말). 경과 시간의 글 모양(0초, 59초, 60초, 1시간 이상)을 정해 그린다. 오래 조용할 때 따로 문구("Still working…" 같은)를 만들지 않는다. 턴 표시는 한 줄이고 긴 경로는 말줄임표다.
- 상태: (1) 메시지가 막 들어가 첫 출력 전(일반), (2) 생각 중(Claude·Copilot), (3) 파일 읽기(짧은 경로, panel 폭에서 말줄임표가 생기는 긴 경로), (4) 명령 실행, (5) 도구가 끝나고 다음 출력 전(턴 표시는 일반으로 돌아가고, activity 행은 지금처럼 진행형 머리와 spinner로 돈다: 두 진행 표시가 함께 보이는 모습, 결정 4), (6) 답 글이 흐르는 중, (7) permission 카드 대기(턴 표시 없음, 결정 3), (8) Allow로 답한 뒤 접힌 줄 아래(앞 도구의 단계가 이어짐), (9) Codex MCP "Waiting for <Notion>" 줄과 함께(턴 표시는 일반), (10) Send now 메시지가 보내지는 중일 때, (11) 경과 시간이 짧을 때와 1시간을 넘을 때, (12) canvas-handoff의 "Hands off to <canvas> when this turn ends" 줄 아래.
- 폭: Overview thread 열(최대 720, DESIGN.md 'Project Overview')과 캔버스 conversation panel의 기본 `max(320px, 28dvw)`·최소 280(DESIGN.md 'Canvas area and right panel'의 'Panel width').
- reduced motion에서 멈춘 모습을 따로 하나.
- 기존 thread의 시각 체계(activity 행, notice, caret, spinner)를 읽고 그리되, 보드 작업 notice의 모양을 따를 필요는 없다(사람: "시각적인걸 말한건 아니였어").
- 글은 `clarify` preset을 읽고 쓴다. 상태마다 지금 필요한 사실 하나, 같은 개념에 같은 말, 모르는 진행을 지어내지 않기.
- 기존 초안 파일은 고치지 않는다.

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. renderer `turnStatus(items, turn, stage)` — §1의 상태 표 전체: terminal 세 종류·접힌 턴·답 기다림에서 없음, 답 쓰기, 단계 신호의 `turnId`·`seq` 유효성, 신호가 없거나 무효일 때 event 규칙, Allow로 접힌 permission 뒤 앞 도구, MCP 대기 줄은 일반, Send now 메시지와 함께, steer로 들어온 턴 중간 `user.message`(경과 시간은 첫 `turn.started`부터, 단계는 event 규칙으로), queue가 다음 턴을 바로 시작할 때 이전 턴 `turnId`의 단계 무시.
2. renderer 단계 저장의 `rev` 비교 — 같은 `turnId` 안에서 `rev`가 큰 것만 남김, read 답이 그 사이 push된 단계보다 늦게 와도 덮지 않음.
3. renderer settle 규칙 — 300ms 전에 바뀐 단계는 보이지 않음, 답 쓰기·없음·답 기다림은 바로.
4. renderer 경과 시간 글 `elapsedText(ms)` — 0초, 59초, 60초, 3599초, 3600초 이상, NaN·음수(0으로). 글 모양은 초안(D1)에서 정한 값이다.
5. main `normalizeClaude`, `normalizeCodex`, `normalizeAcp`의 단계 출력 — 표 §2의 각 칸, terminal 뒤 없음, 다른 `threadId`·`turnId`의 Codex 알림 무시, `parent_tool_use_id` frame 무시, Doan connector 도구 입력 없음, ACP `execute`의 title을 쓰지 않음, Codex 읽기 단계(§3), ACP 생각이 끝나는 update와 끝나지 않는 update. 기존 event 출력은 그대로.

## 포맷 변경

- 대화 기록(event JSONL v1)은 바뀌지 않는다(결정 2). Codex activity도 바뀌지 않는다(결정 6).
- 새 IPC 채널 `conversation:stage`와 `conversation:read` 답의 필드가 생긴다. TypeScript 안의 계약이고 공유 JSON Schema(ARCHITECTURE §11)가 아니다.
- fixture: 기존 파일은 고치지 않는다. `acp-copilot.json`은 `fake-acp-server.cjs`가 그대로 재생해 `acpRunner.test.ts`·`contextUsageRunners.test.ts`의 입력이 되고, 기존 fixture 테스트는 `some(...)`과 terminal 수만 보므로 줄을 더해도 바뀐 것을 잡지 못한다. 새 기록은 새 파일(예: `claude-thinking.json`, `codex-read.json`, `acp-copilot-thought.json`)에 두고, 기록된 frame에서 개인 정보를 지운다. A1에서 그 파일의 지금 events 전체를 `toEqual`로 고정해 B의 "events는 그대로" 기준으로 삼는다. Copilot fixture에는 pending `tool_call`과 `failed`가, `acp-cursor.json`에는 in_progress가 이미 있으므로 새로 필요한 것은 thought chunk다.

## 관례 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙, guide, skill stub이 바뀌지 않는다.

## 결정 영향

- append-only event, 턴마다 terminal 하나: 단계 신호는 event가 아니므로 기록과 terminal 수를 바꾸지 않는다.
- 명령 글을 activity에 쓰지 않는 2026-10-30 결정(`transport.ts`의 `claudeActivity` 주석): 단계 신호도 따른다. 경로만 쓴다. 이 규칙은 지금 코드 주석에만 있으므로 Z2에서 ARCHITECTURE §7 'Summaries'에 "activity와 단계 요약에는 셸 명령 글을 쓰지 않는다"를 더한다.
- MCP 도구 입력을 요약에 넣지 않는 규칙(PRODUCT §3 'MCP tools'): ACP 단계 요약은 completed activity와 같은 함수로 만든다. Claude·Codex는 도구 단계를 내지 않으므로(§2) 해당하지 않는다.
- Renderer 경계(ARCHITECTURE §7 'Settings IPC'의 'Renderer import boundary', §7 'Renderer primitives'): 단계 type은 type만 import하는 `app/src/main/conversation/types.ts`에 둔다.
- PRODUCT §5 items 2·3의 thread 규칙이 늘어난다(마지막 task).

## PoC 의존

결정 2는 기록된 frame에서 본 신호에 기댄다. 아래가 다르면 그 provider의 단계가 "일반"으로 떨어질 뿐, 턴 표시와 경과 시간은 남는다.

- **P1 Claude**: Doan이 고를 수 있는 다른 모델(Sonnet, Haiku)과 effort, 최소 버전 2.1.284에서도 thinking block과 `requesting`이 오는가. 기록은 2.1.318·`claude-opus-5-5`뿐이다. Doan이 `system/status`와 `stream_event`를 SDK에서 이미 받는다는 것은 코드로 확인했다(`normalizeClaude`). subagent(Task)가 도는 동안 상위 frame으로 `requesting`이 오는지도 Task 턴 하나로 본다. 오면 그동안 턴 표시는 일반이다.
- **P2 Codex**: 0.158.0에서도 reasoning이 순간 item이고, 생각 동안 알림이 없는가. `commandActions`의 `search` 모양(본 적 없음)과 `listFiles`의 `path`.
- P1·P2의 옛 버전은 임시 prefix에 설치하고, 사람의 전역 설치와 공용 프로필의 설치본은 건드리지 않는다.
- **P3 ACP**: Copilot thought chunk가 다른 턴·모델에서도 오는가. 오래 걸리는 도구(수 초)에서 `tool_call` pending → in_progress → completed가 그 시간만큼 벌어지는가(기록은 모두 50ms 안에 끝났다).
- **P4 긴 턴**: 실제 디자인 작업 턴 하나의 빈 구간(가정 확인용, 설계를 바꾸지 않는다).

모두 로그인한 provider와 공용 프로필(chain-261106 '로그인')이 필요하므로 사람의 승인 뒤에 돌린다.

## 겹치는 feature와 순서

- **context-window-ring**(병합됨, PR #103): `context.usage` event를 terminal 바로 앞에 더하고, Claude 스트림·Codex `thread/tokenUsage/updated`·ACP `usage_update`를 normalizer에서 읽는다. 이 feature는 그 모양 위에서 시작한다. thread는 `context.usage`를 그리지 않는다. 링은 composer tray에 있다. 턴 표시의 고정 줄 변형(결정 10)은 composer 위이므로 링과 자리가 겹치지 않는지 초안에서 본다.
- **project-skill-drawer**(구현 전): 사람 메시지 말풍선(`ConversationThread.tsx`)과 composer를 고친다. 두 feature 모두 chain-261106 뒤에 시작하고, 둘 사이의 순서는 그때 정한다.
- **work-update**(chain-261106 링크 1): 앱 대화의 `doan work update` note를 보드 작업 notice의 글로 보인다. note는 메모리에만 있고 대화 기록과 thread에 쓰지 않는다(그 spec 완료 조건 4·5). 캔버스 페이지에서는 보드 notice가 note를, panel thread의 턴 표시가 단계를 보인다. 두 출처가 다르므로 충돌하지 않는다. 그 feature는 앱 대화 환경에 대화 id를 넣느라 `service.ts`·`environment.ts`를 고친다. 이 feature의 `service.ts` 단계 기억과 겹칠 수 있다.
- **canvas-handoff**(chain-261106 링크 2): thread에 핸드오프 줄과 인계 카드를 더하고(`threadItems.ts`, `ConversationThread.tsx`; 그 tasks B5·U1), 원래 턴이 끝나면 이어받는 대화의 턴을 자동으로 시작한다. 이어받는 대화의 첫 턴도 보통 턴(`turn.started`)이므로 턴 표시가 나온다. 원래 대화의 "Hands off to <canvas> when this turn ends" 줄은 턴 안의 항목이고 턴 표시는 그 아래 thread 끝이다. 같은 파일을 고치므로 그 병합 뒤에 시작한다.
- **chain-261106**의 순서는 work-update → canvas-handoff → small-ui-tweaks이고 이 feature는 들어 있지 않다. 이 feature는 그 체인의 세 링크가 병합된 뒤에 시작한다.

## POSTMORTEM에서 가져온 함정

- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: `turnStatus`와 단계 type을 renderer가 값으로 가져오면 그 파일은 type만 import해야 한다. `rendererImports.test.ts`가 지키고, 값 import를 더한 batch 뒤에는 build한 앱을 한 번 띄운다.
- **2026-10-26 'The invalidation read overtook the reply'**: reply와 main이 보낸 event 사이의 순서는 보장되지 않는다. 단계는 `rev`로 순서를 정한다(§2).
- **2026-10-25 'Native hiding bypassed renderer-only lifetime checks'**: timer는 숨김에서 멈추고 다시 보이면 `at` 기준으로 바로 다시 계산한다(§4).
- **2026-10-27 'Codex ingress confused unowned requests and notification errors'**: Codex 단계는 `threadId`·`turnId`가 지금 턴인 알림에서만 낸다(`normalizeCodex`의 기존 검사 뒤).
- **2026-10-27 'Protocol readiness lagged behind process and turn ownership'**: 한 chunk에 reply와 알림이 함께 오면 순서가 어긋날 수 있었다. 단계는 같은 normalize 단계에서 events와 함께 계산하고, 그 frame의 events 다음에 보낸다.
- **2026-10-27 'Awaited conversation work outlived its current turn'**: 단계 신호는 live 턴의 id와 `receive()`와 같은 검사로 막는다. 끝난 턴의 늦은 신호가 다음 턴에 나오지 않는다(renderer의 `turnId`·`seq` 비교도 같은 목적).
- **2026-10-27 'Filtering error replies hid duplicate native settlement'**: 테스트는 턴마다 terminal event가 여전히 하나인지 모든 terminal 종류를 세어 확인한다. 단계 신호는 그 수에 들지 않는다.
- **2026-10-30 'Timing tests failed under machine load …'**: 경과 시간 timer 테스트는 fake timer로 쓰고, 기다림보다 test 한도를 넉넉히 둔다.

## 읽은 design preset

`doan design-skill --json`으로 목록을 보고 `shape`(기존 화면 확장은 그 화면의 시각 체계를 물려받는다, Operate 화면은 분명한 상태)와 `clarify`(상태마다 지금 필요한 사실 하나, "Loading text names the real operation … never invent progress", 같은 개념에 같은 말)를 읽었다. UI 글은 이 문서에서 정하지 않고 `/design-draft`에서 `clarify`를 거쳐 정한다.

## 결정

사람이 2026-11-06에 정했다. spec 완료 조건은 이 결정을 따른다.

1. **턴 표시의 형태.** `/design-draft` 변형 캔버스에서 사람이 고른다. 기본 후보는 (a) Claude Code CLI 작업 줄 같은 한 줄: 움직이는 글리프 + 단계 동사 + 경과 시간, 토큰 수와 둘째 줄 없음. 초안은 이것으로 좁히지 않고 여러 형태를 그린다. 이유: 사람이 초안에서 여러 표현을 보고 고르겠다고 했다.
2. **단계를 아는 경로.** (B) main이 provider frame에서 단계를 읽어 기록하지 않는 live 신호(`conversation:stage`)로 보낸다(§2). Claude·Codex는 생각과 일반(Codex는 읽기 명령의 도구 단계도)만 내고, 그 밖의 도구 상태는 activity event로 정한다. 이유: "생각 중"과 "도구 끝"은 provider frame에만 있고, 턴이 끝나면 뜻이 없는 단계를 기록에 쓰면 옛 build가 그 기록을 손상으로 읽는다.
3. **턴 표시가 보이는 범위.** live 턴 내내 보이고, permission·question 카드가 답을 기다리는 동안만 없다. 이유: 볼 곳이 thread 끝 한 곳으로 고정되고, 대기 중에는 카드가 이미 "needs your answer"를 말한다.
4. **activity 행과의 관계.** 둘 다 진행을 보인다. activity 행은 지금처럼 spinner와 진행형 머리를 유지하고, 턴 표시도 함께 보인다(§1 'activity 행'). 이유: 사람이 권장안(행을 기록만으로 바꾸기) 대신 고른 것이다. 결과로 두 진행 표시가 함께 보일 수 있고, Claude·Codex 도구가 끝난 뒤에도 activity 행의 spinner가 다음 출력까지 돈다.
5. **생각 내용.** 보이지 않는다. 단계만 보인다. 이유: Claude는 대개 빈 thinking 글을, Codex는 빈 reasoning 요약을 보내고 Antigravity·Cursor는 보내지 않아 provider마다 고르지 않다.
6. **Codex 읽기 명령은 턴 표시에만 쓴다.** `commandActions`가 `read`·`listFiles`·`search` 하나이면 턴 표시가 경로만 쓴 읽기 단계를 말한다. activity 기록은 지금처럼 명령이고, 명령 글은 쓰지 않는다(§3). 사람이 권장안(activity를 읽기로 기록)이 아니라 이것을 골랐다. 이유: "코드 읽을 때"가 Codex에서 보이게 되면서, 대화 목록 preview·conversation strip·thread step의 글은 바뀌지 않는다(spec 완료 조건 8).
7. **경과 시간.** `turn.started`부터 턴 끝까지 이어서 센다. 이유: "보낸 지 얼마나 됐나"에 답하고, 기록된 `at`으로 다시 읽기 뒤에도 같은 값이 나온다.
8. **다른 화면.** thread만 바꾼다. conversation strip, 사이드바 slot, 보드 작업 notice는 그대로다. 이유: 사람이 말한 곳은 thread다.
9. **보내는 중(acceptance 전).** 그대로다. 메시지는 composer에 남고 Send가 spinner를 보인다. 이유: 시작이 거절되면 draft가 composer에 남는 규칙이 이 상태에 기댄다.
10. **턴 표시의 위치.** thread 끝의 내용 안과 composer 위 고정 줄을 둘 다 초안에 그리고, 사람이 고른다. 고른 쪽을 이 항목에 적는다. 이유: 나중에 바꾸기 비싼 선택이라 두 모양을 보고 고른다.
11. **리뷰 반영(2026-11-06, 사람이 일괄 승인).** 단계 순서는 `rev`로 정한다. 새 단계는 300ms 이어진 뒤 보인다. 알림은 단계의 종류만 한다. 턴 표시는 live region이 아니고 한 줄 고정 높이다. 오래 조용할 때 따로 상태를 두지 않는다. MCP 대기 줄 동안은 일반 단계다. Allow로 답한 뒤에는 앞 도구의 단계가 이어진다. 일반 단계의 동사는 "working"이다.
