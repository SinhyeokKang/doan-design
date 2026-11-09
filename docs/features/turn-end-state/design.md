# turn-end-state — design

spec의 P1–P4를 각각 고친다. 넷 다 "턴은 끝났는데 main이나 renderer가 아직 일하는 쪽으로 읽는" 문제지만, 원인이 서로 다른 층에 있어 고치는 곳도 다르다.

## 0. 결정 요약

| | 고치는 곳 | 결정 |
|---|---|---|
| P1 | main normalizer(Claude·Codex의 도구 종료 stage) + renderer(행의 running 판단) | 행의 running head를 turn indicator의 settle된 값에서 낸다 |
| P2 | renderer(composer turn 판단과 그 소비자) | 네 번째 turn 값 `holding`. 빈 입력은 비활성 Send, 텍스트는 Queue, queue 행이 있을 때만 Stop |
| P3 | 먼저 PoC, 그 결과에 따라 `runners.ts`(`process.ts`) | done terminal 뒤 CLI leader가 끝나면 runner가 `group.stop()`을 부른다(원인이 H1·H2·H5일 때). 목표는 leader exit 뒤 0.6 s 안에 group이 사라지고, `turn.started`가 그 순간 + 기준선 안에 오는 것 |
| P4 | main(`service.ts`) | 프로세스가 사라지면 working에서 빼고, 큐를 돌려주고, 다음 send를 받는다 |

## 1. 영향 범위

- **app main** (`app/src/main/conversation/`):
  - `types.ts`: `TransportState`에 `running?: string[]`(지금 ACP의 `AcpTransport`에만 있는 필드를 공유. 비면 생략).
  - `transport.ts`: Claude·Codex normalizer의 `running`, `finish()`에서 비우기.
  - `runners.ts`, `runners.test.ts`: P3의 child `exit` trigger.
  - `process.ts`: P3의 `observe()` 순서(§4.3).
  - `service.ts`: P4(`exited()`, `receive()` catch, `send`, `previousExit`, `interrupt`).
- **app renderer** (`app/src/renderer/`):
  - `turnStatus.ts`: `activityRun`, 주석 고침.
  - `threadItems.ts`: 행의 running·head·verb 판단(:279–283)을 뺀다.
  - `ConversationThread.tsx`: settle된 status로 `activityRun`을 적용한다.
  - `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`: 두 벌의 `turnOf`를 `composerTurn`으로.
  - `DockedComposer.tsx`, `dockedRules.ts`, `composerRules.ts`, `useProjectSkills.ts`: `holding`을 받는 turn 소비자.
- **CLI(Go), skill, guide**: 바뀌지 않는다.
- **형식**: 바뀌지 않는다(§7).

## 2. P1 — 활동 행과 도구 종료

### 2.1 renderer 규칙

행의 running 여부와 head를 threadItems가 정하지 않는다. `threadItems.ts`:279–283의 running·head·verb 판단을 빼고, threadItems는 모든 activity group을 단계 수(`stepCount`)로 낸다. 그 위에 순수 함수 `activityRun(items, status, stepKey)`가 마지막 item만 고친다.

- 입력 `items`는 `withSending`을 적용하기 전의 목록이다. 판단 대상은 그 목록의 마지막 item이다(Send now 메시지가 그 아래에 붙어도 행 판단은 같다).
- 입력 `status`는 turn indicator가 지금 보이는 값, 곧 `ConversationThread`의 `settled.shown`이다. 그래서 행과 indicator가 글자 그대로 같고, 빠른 도구에서 행이 깜박이지 않는다.
- 마지막 item이 살아 있는 턴의 activity group이고 `status`가 `tool`이면: `running = true`, `head = status.text`.
  - "Running a command"로 마지막 step의 verb를 바꾸는 것은 status가 그 step에서 나왔을 때만이다. 곧 이기는 stage가 없어 event 규칙이 그 step을 고른 경우다. 다른 도구의 stage가 이기면 step은 그대로 둔다.
  - ACP는 activity가 완료된 뒤에 생기므로 event 규칙으로는 running이 되지 않고, tool stage가 이길 때만 running이다. activity는 `conversation:event`로, stage는 `conversation:stage`로 따로 오므로, event만 들어온 render에서 행이 한 번 도는 것을 이 규칙이 막는다. 이때 head가 말하는 도구는 아직 단계 목록에 없을 수 있다.
- 그 밖(`general`, `thinking`, `reply`, `waiting`, `none`)이면 단계 수 그대로다.
- 예외: 마지막 step이 문장 step(`sentence`, Codex MCP startup 줄)이면 지금 규칙을 지킨다. 턴이 끝나지 않았고 마지막 item이면 running, head는 그 문장이다.
- `turnStatus` 자체는 그대로다. 이기는 stage가 이 턴 것이고 `stage.seq >= turn.lastSeq`이면 stage가, 아니면 event 규칙(마지막 activity, Allow로 접힌 permission 앞의 도구)이 정한다. Claude 도구가 도는 동안은 event 규칙으로 행이 running이고, 결과가 오면 general stage(같은 seq)가 이겨 행이 멈춘다.
- Codex read·listFiles·search 행의 head는 이제 indicator와 같은 "Reading <path>"나 "Reading files"다(지금은 threadItems의 `runningHead`가 summary를 썼다).
- `turnStatus.ts`의 주석 "A tool activity row may still spin while this says general"은 사실이 아니게 되므로 고친다.
- screen reader: 새 안내는 없다. head는 행 버튼의 이름이고, thread의 sr-only status가 settle된 stage를 이미 읽는다.

### 2.2 main: 도구가 끝났다는 stage

renderer 규칙이 맞으려면 main이 "도구가 모두 끝났다"를 stage로 알려야 한다. ACP는 이미 그렇다(`acp.ts` `running`, POSTMORTEM 2026-11-06). Claude와 Codex를 같은 모양으로 맞춘다.

- `types.ts` `TransportState`에 `running?: string[]`을 둔다. ACP의 같은 필드를 이것으로 옮기고, 비면 생략한다. `transport.ts` `finish()`가 비운다.
- **Claude**: activity를 만든 top-level `tool_use` id를 `running`에 넣는다(`AskUserQuestion`은 activity가 아니므로 넣지 않는다). top-level `user` frame의 `tool_result`는 `tool_use_id`를 뺀다. 결과를 받은 뒤 `running`이 비었으면 general을 내고, 남았으면 stage를 내지 않는다. `running`에 없는 id의 결과(`AskUserQuestion` 등)는 집합이 비어 있으면 지금처럼 general이다. `system/status` `requesting`의 general은 그대로고, `parent_tool_use_id` frame은 지금처럼 무시한다. 이 frame은 이벤트를 내지 않으므로 general의 seq는 마지막 activity의 seq와 같고 renderer에서 이긴다.
- **Codex**: `commandExecution`·`fileChange`·`mcpToolCall` item의 `item/started`는 id를 `running`에 넣고 `item/completed`는 뺀다. read·listFiles·search 명령의 시작 stage는 그대로다. `item/completed`에서 `running`이 비면 general을 내고, 남았으면 stage를 내지 않는다(Codex 일반 도구는 자기 tool stage가 없어 ACP의 "가장 늦게 시작한 도구"를 쓸 수 없다).
- 한계(spec Non-goals): Claude와 Codex 모두, 나중에 시작한 도구가 먼저 끝나면 stage가 없으므로 event 규칙이 가장 늦게 시작한 도구(이미 끝났을 수 있음)를 말한다.
- 모든 terminal·aborted·failed 반환 경로에서 `running`을 비운다. "호출을 끝내는 모든 반환 경로가 모든 per-call 집합에서 그 호출을 뺀다"(POSTMORTEM 2026-11-06 prevention). steer를 읽지 못해 기다리는 result(`awaitingRead`)도 집합을 남기지 않는다. 재사용하는 Codex server의 다음 턴은 빈 집합으로 시작한다.
- service의 stage 전달과 dedupe(같은 turnId·seq·stage는 다시 보내지 않음)는 바뀌지 않는다.

### 2.3 바뀌는 문서 문장 (승격 때)

- PRODUCT §5 item 3 'Turn indicator'의 "The activity rows are unchanged: … after a Claude Code or Codex tool ends its row keeps its running head until the next output …" → 행의 running head는 indicator가 도구를 말하는 동안만 보이고 같은 문구다. 문장 step 예외.
- PRODUCT §3 'Turn stages': Codex는 도구 item이 모두 끝나면 working을 말한다(지금은 read·list·search만).
- ARCHITECTURE §7 'Turn stages' Sources: Claude "general on … a top-level tool result" → 그 메시지의 top-level 도구가 모두 결과를 받았을 때. Codex "other Codex tools give no stage" → 시작 stage는 없고, 끝날 때 running이 비면 general. Renderer 항목에 행의 running 판단 추가.
- DESIGN.md 'Turn indicator': Place 행의 "next to a still-spinning activity row…"와 "The activity rows' shipped values were unchanged" 문장.

## 3. P2 — 판단 창의 composer

### 3.1 지금

두 host의 `turnOf`(같은 코드가 두 벌)는 merged events의 `stripState` 다음에 `summary.working`을 읽는다. main의 `working()`은 판단을 기다리는 턴(`evidence.endedAt`), 나갈 큐(`holding`), 이전 프로세스를 기다리는 send(`waits`), 판단을 기다리는 send(`judging`), handoff 판단을 모두 센다. `composerAction(turn !== "idle", text)`는 running이고 입력이 비면 Stop을 낸다.

### 3.2 규칙

turn 값을 `"idle" | "running" | "waiting" | "holding"`으로 넓힌다.

- **`composerTurn(events, summary, live)`**(공유 순수 함수, 두 `turnOf`를 대체):
  1. merged events의 `stripState` kind가 permission·question이면 `waiting`, starting·working이고 live면 `running`(지금과 같음).
  2. kind가 terminal(done·failed·interrupted)이면: `summary.working`이면 `holding`, 아니면 `idle`. 목록이 아직 running이어도 events의 끝이 이긴다(`steerPhaseOf`와 같은 순서).
  3. events가 없으면 지금처럼 `summary.phase`와 `summary.working`.
- **`composerAction(turn, request, queueRows)`**: `holding`이면 queue 행이 있을 때 `stop`, 없고 입력이 비면 `send`, 텍스트가 있으면 `queue`. `running`은 지금과 같다. queue 행은 renderer가 그리는 queue 행(보내는 중인 항목 포함)을 센다. `summary.queued`는 `sending` 항목을 빼므로(`drafts.ts`:114) 큐를 보내는 중(flush)에 0이 되어 쓸 수 없다.
- **키**: `holding`에서 Enter와 Control+Enter 모두 큐에 넣는다. Send now가 없으므로 Control+Enter는 지금 규칙대로 Enter처럼 동작한다.
- **`dockedRules.ts`** `dockedAvailability`(:79 `input.busy && input.turn === "idle"`): `holding`은 `running`처럼 다룬다. 메시지가 큐로 가므로 턴 시작 제한(project busy, restore busy)을 아직 적용하지 않는다.
- **`useProjectSkills.ts`**: project skill 목록은 turn이 idle로 바뀔 때 다시 읽는다. `holding`은 idle 쪽으로 센다. 그래서 `running → holding`에서 한 번 읽고 `holding → idle`에서는 다시 읽지 않는다. 턴이 끝난 순간 에이전트가 만든 skill을 바로 보여 주기 위해서다. 테스트로 고정한다.
- **`DockedComposer.tsx`**: props의 `turn` 타입을 넓히고, Stop에 focus가 있었는데 비활성 Send로 바뀌면 focus를 입력란으로 옮긴다. 사람이 다른 곳으로 옮긴 focus는 그대로 둔다(POSTMORTEM 2026-10-24).

이 규칙의 결과:

- 판단 창에서 입력한 텍스트는 Queue로 들어가고(`conversation:queue`는 `working` 동안 받는다, ARCHITECTURE §7 IPC) 판단 뒤 나간다. queue 행이 생기면 Stop이 보이고, Stop은 지금처럼 큐를 draft로 돌려준다(`interrupt`의 `holding` 분기). Send로 보내 main이 판단을 기다리게 하지 않는 이유: composer가 최대 10 s spinner를 보여 P3와 같은 종류의 대기가 생긴다.
- 이 composer에서 보낸 send가 판단이나 이전 프로세스를 기다리는 동안은 composer가 자기 `sending` 상태를 보이므로 Stop이 필요 없다. 한 host의 send가 이미 판단을 기다리는 동안 다른 host에서 같은 대화로 보낸 Send는 `busy`로 거절된다(`awaitJudged`는 기다리는 send가 이미 있으면 거절한다). 이 동작을 테스트로 고정한다.
- canvas panel의 handoff 판단 창도 같은 규칙이다. 이 동안 큐에 넣은 메시지는 새 대화의 첫 턴 뒤에 나가고(PRODUCT §5 item 2 'Handoff'), source thread의 "Hands off to <file> when this turn ends" 줄이 그 표시다.

### 3.3 판단 창의 화면 (spec D2.3)

| 화면 | 판단 창에서 | 근거 |
|---|---|---|
| thread | 턴이 끝난 모습, indicator 없음 | 지금과 같음 |
| composer | `holding` 규칙 | §3.2 |
| queue 행 | Send now 없음, Ctrl+Enter 안내 없음 | PRODUCT §5 item 1 'Send now'(being judged) |
| sidebar slot, Canvas conversations 행 | working | 목록 `working`, 지금과 같음 |
| Delete | 불가, 기존 이유 문구 | `conversationDelete.ts`, 지금과 같음 |
| 다음 메시지 제안 | 숨김 | `conversationSummary`(not working일 때만), 지금과 같음 |

### 3.4 바뀌지 않는 것과 문서

`working()`과 목록의 `working`, root hold, Delete 불가, Send now 불가, Home의 `homeRun` 판단 창, `canvasConversation.ts`의 restore busy는 그대로다. PRODUCT 문장은 바뀌지 않는다. ARCHITECTURE §7에 composer의 `holding` 판단(terminal 뒤 main이 working인 동안, Stop은 queue 행이 있을 때만) 한 줄을 더한다.

## 4. P3 — 끝난 Claude 턴 뒤의 send 대기

### 4.1 PoC (원인 미조사, 첫 작업)

지금 아는 것:

- send가 `turn.done`에 오면 `previousExit`가 `live.done`이고 suggestion이 아직 없으므로 `endSuggestion`(SIGTERM, 0.5 s 뒤 SIGKILL)을 부르고, usage read 중이면 그 read가 입력을 닫은 뒤(최대 `TURN_USAGE_MS` 3 s) 끝낸다.
- 그 뒤 `exitOf`가 `process_exited`를 `EXIT_WAIT_MS`(10 s)까지 기다린다. `process_exited`는 owned group이 사라진 관찰이다. `OwnedGroup`이 100 ms마다 `kill(-pgid, 0)`이 `ESRCH`인지 본다.
- `runners.ts`의 SDK loop는 `finally`에서 `group.stop()`을 부른다(:440). loop가 끝나지 않으면 group도 끝내지 않는다.
- 관찰은 CLI가 2.5–3.7 s에 끝나고 group은 약 7 s 더 산다는 것이다.

가설(어느 것도 확인되지 않았다):

- **H0.** project 대화였다면 send는 `previousExit` 전에 promotion 판단(`BIND_GRACE_MS` 10 s)을 기다린다. 관찰이 판단 대기였을 수 있다.
- **H1.** CLI의 후손 프로세스가 같은 group에 남는다(예: hook, plugin MCP server, Bash 도구가 띄운 프로세스).
- **H2.** suggestion이 send 전에 와서 `endSuggestion`을 건너뛰고, CLI와 후손이 스스로 끝나기를 기다린다.
- **H3.** group에 zombie만 남아 `kill(-pgid, 0)`이 성공한다(관찰 방식의 문제).
- **H4.** Doan이 SDK를 거쳐 띄운 wrapper 프로세스가 leader이고, 실제 CLI가 그 자식이다.
- **H5.** SDK read loop가 끝나지 않는다. 예: 후손이 CLI의 stdout·stderr를 쥐고 있어 stream이 닫히지 않으면 loop의 `finally`가 늦게 돈다.

PoC(`.scratch/turn-end-state/`):

1. **packaged app**에서 잰다(POSTMORTEM 2026-10-28: dev run은 다르다). main 쪽 시각은 commit하지 않는 임시 계측 patch로 남긴다(PoC 허용).
2. canvas 대화와 project 대화를 따로 잰다. 두 번째 send는 첫 턴의 `turn.done`이 온 순간 보낸다(POSTMORTEM 2026-10-28). 실제 Claude sign-in이 필요하다(사용자가 브라우저에서 승인, probe 동안 같은 profile을 다시 쓰고, 끝나면 sign-out과 profile 삭제).
3. 남길 것:
   - 환경: 대화 종류, profile 설정(hooks, MCP, plugins), `claude --version`, 턴 내용(도구 없음 / Bash 도구 사용).
   - main 시각: SDK loop `finished`, child `exit`·`close`, `stop()` 호출과 그 시각, SIGKILL escalation, `judging`·`waits` 시작과 끝, `usageAtTurnEnd` 길이, `endSuggestion` 호출, `prompt_suggestion` 도착, `process_exited`, 다음 턴 `turn.started`.
   - 프로세스: `turn.done`부터 group이 사라질 때까지 100 ms마다 `ps -axo pid,ppid,pgid,stat,etime,command`를 그 pgid로 거른 목록.
   - 기준선: 이전 프로세스가 없는 대화에서 send부터 `turn.started`까지(spec D3.3).
4. suggestion이 오기 전 send와 온 뒤 send를 각각 세 번.
5. 통과 기준: H0–H5 중 하나로 판정하거나, 다른 원인을 증거와 함께 기록한다. 결과를 이 절에 적는다.

#### 결과 (2026-11-09 측정)

**판정: H0.** 관찰된 "약 7 s"는 project 대화의 send가 promotion 판단(`BIND_GRACE_MS` 10 s)을 기다린 시간이다. group은 CLI보다 오래 살지 않았다. H1·H3·H4·H5는 이번 환경에서 기각했고, H2는 경로로는 일어나지만 대기는 0.55 s 이하였다.

환경:

- packaged app(`npm --prefix app run package`, 서명 없는 로컬 `app/dist/mac-arm64/Doan.app`)에 임시 계측 patch를 얹었다. patch는 commit하지 않고 `.scratch/turn-end-state/instrumentation.patch`에 두었다.
- Claude Code 2.1.319(`~/.local/bin/claude` → native Mach-O arm64). 공용 provider-profile userData를 그대로 썼다. userData를 복사하면 Claude가 sign-out 상태가 된다(Keychain 항목이 `CLAUDE_CONFIG_DIR` 경로에 묶임). 그래서 conductor 승인을 받아 원본을 쓰고, 끝난 뒤 `folders.json`·`ui-state.json`·`canvas-seen.json`·`conversations/`를 되돌렸다.
- Doan Claude profile: `settings.json`에는 doan 명령 허용 규칙만 있고 hooks는 없다. 로컬 MCP server는 없다(claude.ai 원격 connector 3개만 있다). plugin은 내장 `cc-plugin-agents-md`뿐이다.
- `doan init`한 임시 repo와 canvas 하나. 턴 내용은 세 가지였다: 도구 없음("ok" 한 단어), Bash 도구(`sleep 2; echo ready`, bypass mode), 대화형(한 문장 답, suggestion을 받으려고 썼다).
- send는 renderer에서 `window.doan` API로 보냈다. `turn.done` 직후 send는 그 event listener의 같은 tick에서 보냈다. 모든 시각은 A 턴의 main `turn.done`(service가 terminal을 받은 시각) 기준이다.

측정한 쌍(A 턴 → B send):

| 대화 | B send 시점 | 턴 내용 | 횟수 |
|---|---|---|---|
| canvas | 기준선(이전 프로세스 없음) | 도구 없음 | 3 |
| canvas | `turn.done` 순간(suggestion 전) | 도구 없음 / Bash / 대화형 | 3 / 3 / 3 |
| canvas | suggestion이 목록에 보인 뒤 | 대화형 | 3 |
| canvas | suggestion을 45 s 기다림(오지 않음) | 도구 없음 / Bash | 3 / 3 |
| project | `turn.done` 순간 | 도구 없음 / Bash | 3 / 3 |
| project | suggestion이 목록에 보인 뒤 | 대화형 | 3 |

공통으로 본 것(30쌍 전부):

- **group 구성**: `turn.done`부터 group이 사라질 때까지 100 ms마다 찍은 `ps`에서 그 pgid에는 CLI 하나만 있었다. pid = pgid이고 부모는 app main이었다. 후손 프로세스는 없었고(Bash 도구가 띄운 프로세스는 `turn.done` 전에 끝남), stat은 `Ss`·`Rs`뿐이라 zombie도 없었다.
- **leader exit → group 사라짐**: `group.gone`이 child `exit` 뒤 6–15 ms에 왔다. `process_exited`는 exit 뒤 13–29 ms, SDK loop의 `finally`는 exit 뒤 21–48 ms였다.
- **턴 끝 정리**: result frame 뒤 6–20 ms에 `closeInput`이 불렸다. `usageAtTurnEnd`는 2–8 ms 걸렸다.
- **send가 없을 때 CLI exit**: `turn.done` 뒤 1.55–3.83 s에 스스로 끝났다(code 0, 21회).

경우별 수치:

- **canvas, `turn.done` 순간 send(9회)**: `endSuggestion`이 +25–55 ms에 불렸고 SIGTERM이 +23–49 ms에 갔다. CLI는 SIGTERM으로 끝나지 않았다. +531–559 ms의 SIGKILL로 끝났고(exit +546–574 ms), group은 +553–581 ms에 사라졌다. B의 exit 대기(`waits`)는 0.53–0.55 s였고 `EXIT_WAIT_MS` timeout은 한 번도 없었다. B send→`turn.started`는 1.86–3.82 s였다.
- **canvas, suggestion 뒤 send(3회)**: `prompt_suggestion`이 +1.01–2.34 s에 왔고 B는 그 직후 보냈다. suggestion이 있으므로 `endSuggestion`은 건너뛰었다(H2 경로). CLI는 suggestion 뒤 0.54–0.55 s에 스스로 끝났고(code 0), B의 `waits`는 0.53–0.55 s였다. B send→`turn.started`는 1.80–3.03 s였다.
- **canvas, suggestion이 오지 않은 턴(6회)**: CLI는 +1.68–2.75 s에 스스로 끝났다. 도구 없음·Bash 턴 A에서는 suggestion이 거의 오지 않았다. r1 run의 턴 28개 중 한 번(B 턴)뿐이었다.
- **project, `turn.done` 순간 send(6회)**: B는 판단(`judging`)을 +25–35 ms부터 +10.007–10.025 s까지 기다렸다. 그동안 CLI는 +1.65–3.26 s에 스스로 끝났고 group도 7–9 ms 뒤 사라졌다. 판단 뒤 exit 대기는 없었다. B의 `turn.started`는 `turn.done` 뒤 11.6–15.5 s였다. CLI exit과 B 시작 사이 약 7–8 s는 판단 대기다. 이것이 "CLI가 2.5–3.7 s에 끝나고 group은 약 7 s 더 산다"는 관찰과 맞는다.
- **project, suggestion 뒤 send(3회)**: `prompt_suggestion`과 `svc.suggested`는 +1.1–1.8 s에 왔다. 그러나 대화 목록의 `suggestion`은 +10.01–10.05 s, 즉 판단 창이 끝난 뒤에야 보였다. 그때 보낸 B는 대기 없이 send→`turn.started` 1.3–4.4 s였다.
- **기준선**: 이전 프로세스가 없는 canvas send→`turn.started`는 명시적 기준선 3회가 3.28·1.58·1.92 s였다. 같은 조건의 canvas A send 21회는 1.40–8.49 s(중앙값 1.99 s)였다. 이 시간은 send→spawn(준비: 셸 probe, CLI 버전, 계정) 0.6–5.3 s와 spawn→`turn.started` 0.65–3.19 s로 나뉜다.

가설별 판정:

- **H0 확인.** project 대화의 send는 판단 창 10 s를 기다린다. 그 사이 CLI와 group은 이미 끝나 있다.
- **H1 기각.** 후손 프로세스가 group에 남은 적이 없다(Bash 턴 포함). 단, hooks·로컬 MCP server·plugin MCP server가 있는 profile은 재지 않았다.
- **H2 경로는 있으나 원인 아님.** suggestion이 send 전에 오면 `endSuggestion`을 건너뛰지만, CLI는 suggestion 뒤 약 0.55 s에 스스로 끝났다.
- **H3 기각.** zombie(`Z`)가 없었고, `group.gone`이 exit 뒤 6–15 ms에 관찰됐다.
- **H4 기각.** leader가 native CLI 바이너리 자체다(pid = pgid, 부모는 app main, `ps` command가 `~/.local/bin/claude …`).
- **H5 기각.** loop `finally`가 exit 뒤 21–48 ms에 돌았다. CLI stdout은 exit 8 ms 전에서 52 ms 뒤 사이에 닫혔다.

그 밖의 관찰:

- canvas에서 `turn.done` 순간 보낸 send의 대기는 대부분 SIGKILL escalation 0.5 s다. 입력을 닫은 CLI가 SIGTERM에 끝나지 않았다(9/9).
- smoke run에서 한 번, send가 약 5 s 뒤 `cli_missing`으로 거절됐다(계정 lease의 CLI 위치 확인이 실패). 재현하지 않았고 P3와는 관계없다.
- 원자료와 script: `.scratch/turn-end-state/`(`probe.mjs`, `sampler.mjs`, `analyze.py`, `runs/r1`·`runs/r2`의 `main.jsonl`·`ps.jsonl`·`renderer.json`·`analysis.txt`).

### 4.2 수정 방향

- **H1·H2·H5(done 턴의 group이 leader보다 오래 삶)**: done terminal 뒤 CLI leader가 끝나면(child `exit`) runner가 기다리는 send와 무관하게 `group.stop()`을 부른다. 지금도 SDK loop의 `finally`가 group을 끝내므로 "턴의 프로세스가 끝나면 그 group의 백그라운드 프로세스도 끝난다"는 새 동작이 아니다. 바뀌는 것은 시점이다: loop가 끝나기를 기다리지 않고 leader exit에서 끝낸다. 이 규칙을 PRODUCT §3 'Events and ownership'에 적는다(T7).
- **H0, H3, H4, 다른 원인**: 멈추고 사용자에게 묻는다(spec D3.6).

### 4.3 group을 끝낼 때의 불변식

- 새 프로세스는 reservation이 풀린 뒤에만 띄운다. reservation은 group이 사라진 관찰로만 풀린다(`ownership.ts`, POSTMORTEM 2026-10-28).
- 새 턴은 새 `OwnedGroup`이다. 이전 group의 stop이 다음 턴의 group에 닿지 않는다.
- trigger는 그때 잡은 `Live`로만, `this.live.get(id) === live && live.turnId === turnId && live.done`일 때만 부른다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn'). runner 안에서는 그 run의 done terminal과 child `exit`이 같은 run에 속할 때만이다.
- `observe()`는 group이 사라진 것을 보면 escalation timer를 지운다.
- SIGKILL 직전에 `observe()`를 한 번 더 불러 pid 재사용 창을 닫는다(group이 이미 사라졌으면 SIGKILL을 보내지 않는다).
- 테스트는 SIGTERM을 무시하는 같은 group 후손을 둔 fake 실행 파일로 한다.

### 4.4 목표 (spec D3.3)

canvas 대화에서(H0을 빼기 위해): (1) group이 leader exit 뒤 0.6 s 안에 사라진다(SIGTERM, 0.5 s 뒤 SIGKILL, 100 ms 관찰 주기). (2) 다음 턴의 `turn.started`가 그 순간에서 T0 기준선 안에 온다. suggestion 전·후 각각 세 번.

### 4.5 바뀌는 문서 문장 (승격 때)

- PRODUCT §3 'Events and ownership': 에이전트가 턴 중에 백그라운드로 띄운 프로세스(예: 개발 서버)는 그 턴의 프로세스가 끝날 때 함께 끝난다.
- ARCHITECTURE §7 'App-local ownership and request timing'과 'Send after a finished turn': T0이 찾은 원인과 leader exit trigger. T0이 exit 사실을 바꾸면 `EXIT_WAIT_MS`의 근거("twice the slowest exit observed")를 다시 본다. 'Next-message suggestions'의 "still alive and has not sent a suggestion" 조건 줄을 trigger에 맞춘다.

## 5. P4 — persistence가 실패한 대화

### 5.1 지금

`receive()` catch: `failedPersistence = true`, stage 지움, runner close, work 끝, steer 내림, evidence·handoff 버림. `busy`는 그대로라 `working()`이 참이다. 프로세스가 끝나면 `exited()`가 reservation을 풀고 `exited = true`로 두며 `turn.failed`를 `receive()`에 보내지만, `failedPersistence`라서 무시된다. `ran()`은 `failedPersistence && exited`에서 false라, 목록 phase는 이미 ended이고 thread는 마지막 턴을 crashed로 접는다. 남는 것은 `working`뿐이다: composer Stop(눌러도 `interrupt` → `receive` 무시), Delete 불가, canvas restore busy.

### 5.2 규칙

- **해제 helper**: `failedPersistence && exited`인 live 항목을 푸는 helper를 둔다. 하는 일: `busy = false`, 큐를 `giveBack(id, "turn_failed")`로 draft로, 목록 변경 알림. 두 곳에서 부른다.
  - `exited()`가 `turn.failed`를 `receive()`에 보낸 뒤. 프로세스가 먼저 끝나고 그 `turn.failed` append가 실패한 경우도 여기서 덮인다.
  - `receive()` catch에서 `live.exited`일 때. 프로세스가 이미 끝난 뒤의 쓰기(`transportFailed` 등)가 실패한 경우다.
  - `exited()`는 `OwnedGroup`의 interval callback 안에서 돌므로, helper 안의 `giveBack`은 try/catch로 감싼다. drafts 파일 쓰기가 실패하면 로그만 남긴다.
- **Stop**: 프로세스가 아직 살아 있으면 보통 Stop과 같은 SIGTERM→SIGKILL 경로로 남은 group을 끝낸다(지금은 `receive`가 무시해 아무것도 하지 않는다).
- **`previousExit`**: `failedPersistence`여도 group을 기다린다. 지금은 `live.failedPersistence`면 바로 돌아와 `send`의 `busy` 거절로 가므로, runner close 뒤 group이 사라지기까지(최대 약 0.5 s) send가 거절되는 창이 있다.
- **`send`**: `existing.failedPersistence && existing.exited`이면 그 live 항목을 버리고 새 항목으로 시작한다. 새 턴의 `user.message`가 들어오면 thread와 main fold는 이전의 끝나지 않은 턴을 지금 규칙대로 crashed("Stopped · The agent stopped before it finished.")로 접는다(`threadItems.ts` `foldCrashed`, ARCHITECTURE §7 `conversation:list`). history가 여전히 쓰기를 받지 않으면 `appendAll`이 실패하고, send는 지금 첫 쓰기가 실패한 send와 같은 경로로 거절된다.
- **확인할 소비자**: `conversation:list` summary의 `working`·`phase`, `canvasConversation.ts`의 restore busy, `conversationDelete.ts`.
- 다음 send를 받는 이유: 새 문구 없이 기존 접힘을 쓰고, 일시적인 쓰기 실패(디스크가 찼다가 비워짐 등)에서 재시작 없이 이어 갈 수 있다. 재시작 전까지 거절하려면 새 거절 코드와 문구가 필요하고, 지금의 `busy` 거절("<Provider> is finishing a previous run. Try again in a moment.")은 사실과 다르다.
- 알려진 한계: 저장 실패라는 원인은 사람에게 알리지 않는다.

### 5.3 바뀌는 ARCHITECTURE 문장 (승격 때)

§7 'Deletion'의 "A conversation whose persistence failed stays `working` until restart, so it cannot be deleted until then (BACKLOG)." → 그 프로세스 group이 사라지면 working이 아니고, 큐는 돌아오고, 다음 send는 새 턴을 연다. "(BACKLOG)" 참조도 지운다.

## 6. 순수 함수 (`/tdd` 대상)

| 함수 | 위치 | 사례 |
|---|---|---|
| Claude normalizer의 `running` | `transport.ts` | 단일 도구 결과 → general. 한 메시지의 병렬 두 도구에서 첫 결과 → stage 없음, 둘째 → general. 결과가 다른 frame에 따로 옴/한 frame에 같이 옴. 첫 `tool_result`가 둘째 `tool_use` frame보다 먼저 옴. `AskUserQuestion` 결과: 빈 집합이면 general. `parent_tool_use_id` frame 무시. terminal·aborted·`finish()`에서 비워짐. `awaitingRead` result가 집합을 남기지 않음. 다음 턴이 물려받지 않음 |
| Codex normalizer의 `running` | `transport.ts` | 일반 `commandExecution` 시작 → stage 없음, 완료 → general. read 시작 → read stage(지금과 같음), 완료 → general. 두 item 병렬에서 첫 완료 → stage 없음, 둘째 → general. 일반 명령이 도는 동안 read 완료 → stage 없음. `fileChange`·`mcpToolCall`. 시작 없이 온 완료. 재사용 server의 다음 턴은 빈 집합. terminal에서 비워짐 |
| `activityRun(items, status, stepKey)` (가칭) | `turnStatus.ts` | 마지막 activity + event 규칙 tool → running, head = status.text, command verb 바꿈. 같은 seq의 general → 단계 수. 다른 도구의 stage가 이김 → running, head = 그 도구, verb 안 바꿈. ACP 완료 activity만 있고 stage 없음 → 단계 수. ACP 완료 + 다른 도구 tool stage → running. thinking·reply·waiting·none → 단계 수. 끝난 턴·접힌 턴 → 단계 수. 마지막 step이 문장 step → 지금 규칙(running, 그 문장). 마지막이 activity가 아니면 그대로. Send now 메시지가 붙기 전 목록 기준 |
| `composerTurn(events, summary, live)` | `dockedRules.ts` 또는 `composerRules.ts` | terminal + `working` → holding. terminal + not working → idle. terminal인데 목록은 아직 running → holding 또는 idle(목록의 working에 따라). permission·question → waiting. starting·working + live → running. events 없음 → phase·working |
| `composerTurn` × `composerAction` | 같음 | holding + 빈 입력 + queue 행 없음 → 비활성 send. holding + 텍스트 → queue. holding + queue 행 → stop. holding + flush 중(행이 모두 sending) → stop. running은 지금과 같음 |
| `dockedAvailability` | `dockedRules.ts` | holding + `busy` → 막지 않음(큐로 감) |
| P3 trigger 판단 | `runners.ts`·`process.ts` | §4.3 불변식 |

service 쪽 P4는 순수 함수가 아니라 `service.test.ts`의 사례로 고정한다(tasks T3).

## 7. 형식 변경

없다. stage는 이벤트가 아니고(ARCHITECTURE §7 'Turn stages'), `StageSignal`·`TurnStage` 모양도 그대로다. `TransportState.running`은 메모리 상태다. event JSONL v1, 목록 summary, IPC 채널, `runtime.json`, app socket 메시지, `.doan/config.json`, CLI 응답, JSON Schema 모두 바뀌지 않는다. P4는 새 거절 코드를 쓰지 않는다.

## 8. Conventions 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙에 닿지 않는다.

## 9. 결정 영향

- PRODUCT §5 item 3 'Turn indicator'의 "activity rows are unchanged" 결정을 바꾼다(P1). 사용자가 승인했다.
- PRODUCT §3 'Turn stages'의 Codex 문장을 넓힌다(P1). "provider가 이미 보내는 것만 읽고, 요청을 보내지 않는다"는 원칙은 그대로다: `item/completed`와 `tool_result`는 이미 받는 frame이다.
- PRODUCT §3 'Events and ownership'에 백그라운드 프로세스 문장을 더한다(P3). 지금 동작을 적는 것이고, 바뀌는 것은 시점이다.
- ARCHITECTURE §7의 reservation 불변식("two processes never share a session", "release follows liveness alone")은 P3·P4 수정에서도 그대로다(§4.3).
- PRODUCT §3 'Live terminal policy'의 "Doan never kills the user's Codex daemon"과는 겹치지 않는다. P3는 Doan이 띄운 Claude group만 다룬다.
- PRODUCT §3 Out of scope와 겹치는 항목은 없다.

## 10. PoC 의존

P3는 원인이 확인되지 않았다(BACKLOG: "Which process outlives the CLI was not investigated"). T0 PoC가 먼저이고, §4.2의 수정은 원인이 H1·H2·H5일 때만 한다. P1의 Claude 병렬 tool_result가 한 `user` frame에 같이 오는지 따로 오는지도 확인되지 않았으므로 두 모양을 모두 시험하고, T6에서 실제 frame을 남긴다(§6). P1·P2·P4는 PoC에 기대지 않는다.

## 11. POSTMORTEM에서 가져온 함정

- **2026-11-06 — A sibling ACP tool's completion hid a command still running.** "a per-call status mapping keeps the set of calls still running and derives the stage from it; every return path that ends a call removes it from every per-call set. Test parallel starts with out-of-order completion." → §2.2의 `running`과 §6 병렬 사례.
- **2026-11-06 — The next turn's indicator came a render after the person's message.** "UI that must appear 'with' an accepted message reads the turn from the message (`turnOf`), not from a later event." → `composerTurn`은 merged events를 목록보다 먼저 읽는다. 행은 indicator와 같은 render의 settle된 값을 쓴다. event와 stage가 따로 오는 render 사이도 host 테스트로 본다.
- **2026-10-28 — A send right after turn.done was refused as busy until the previous process group was gone.** "any path that replaces `this.live` for an id whose process is still alive must refuse before replacing it. Real-app checks of consecutive turns must send on `turn.done` itself." → P4의 send는 `exited`일 때만 live 항목을 바꾼다. P3 PoC와 확인은 packaged app에서 `turn.done`에 보낸다.
- **2026-10-27 — Awaited conversation work outlived its current turn.** "recheck current metadata and live execution identity after preparation and opening, before acceptance; fence transport rejection by live identity and turn ID." → §4.3의 trigger 울타리(`live`·`turnId`·`done`).
- **2026-10-26 (ordering)** — 같은 턴의 stage는 `rev`가 높은 쪽이 이긴다(ARCHITECTURE §7 'Turn stages'). §2의 renderer 규칙은 store가 고른 stage를 그대로 쓴다.
- **2026-10-24 — Focus did not return to the row when Set Up… closed from outside.** 컨트롤이 바뀌거나 사라질 때 focus가 갈 곳을 정해야 한다. → Stop이 비활성 Send로 바뀔 때 focus를 입력란으로(§3.2).

## 12. 디자인 preset

`doan design-skill --json`으로 목록을 보고 `clarify`, `harden`을 읽었다.

- `clarify`: 새 문구는 없다. 행은 기존 `runningHead`·`stepCount`, composer는 기존 Send·Queue·Stop 라벨, P4는 기존 "Stopped · The agent stopped before it finished."를 쓴다. P4에서 지금의 `busy` 문구("<Provider> is finishing a previous run. Try again in a moment.")를 남기지 않은 것도 이 preset 기준이다. 사실이 아닌 원인을 말하고 동작하지 않는 복구를 권한다.
- `harden`: "Disable or mark a submit action while it is in flight"와 상태 구분 원칙에 따라, 판단 창의 composer는 Stop이 아니라 비활성 Send(빈 입력) 또는 Queue로 지금 할 수 있는 일만 보인다.
- 레이아웃과 새 상태 화면이 없으므로 `/design-draft`는 하지 않는다.

## 13. 결정

- §2, spec D1: 활동 행의 running head는 turn indicator의 settle된 값을 따른다. 문장 step은 예외.
- §3, spec D2: 네 번째 turn 값 `holding`. 빈 입력은 비활성 Send, 텍스트는 Queue, queue 행이 있을 때만 Stop.
- §4.2, spec D3: 원인이 H1·H2·H5면 done terminal 뒤 leader exit에서 runner가 `group.stop()`을 부른다. 다른 원인이면 멈추고 묻는다.
- §4.4, spec D3.3: group은 leader exit 뒤 0.6 s 안에 사라지고, `turn.started`는 그 순간 + 기준선 안에 온다(canvas 대화).
- §4.5, T7: PRODUCT §3 'Events and ownership'에 백그라운드 프로세스 문장.
- §5.2, spec D4: persistence 실패 뒤 프로세스가 사라지면 다음 send로 새 턴을 받는다.
- §12, tasks T5: `/design-draft`는 하지 않는다.
