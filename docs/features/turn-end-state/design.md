# turn-end-state — design

spec의 P1–P4를 각각 고친다. 넷 다 "턴은 끝났는데 main이나 renderer가 아직 일하는 쪽으로 읽는" 문제지만, 원인이 서로 다른 층에 있어 고치는 곳도 다르다.

## 0. 결정 요약

| | 고치는 곳 | 결정 |
|---|---|---|
| P1 | main normalizer(Claude·Codex의 도구 종료 stage) + renderer(행의 running 판단) | 행의 running head를 turn indicator와 같은 규칙에서 낸다 |
| P2 | renderer(두 host의 composer turn 판단) | terminal event 뒤에는 큐가 있을 때만 running. 판단 창에서 입력한 텍스트는 Queue |
| P3 | 먼저 PoC, 그 결과에 따라 main(`process.ts`·`service.ts`) | 끝난 CLI의 남은 group을 기다리던 send가 SIGTERM→SIGKILL로 끝낸다(PoC가 후손 프로세스를 지목할 때). 목표는 `turn.done` 뒤 4 s 안의 `turn.started` |
| P4 | main(`service.ts`) | 프로세스가 사라지면 working에서 빼고, 큐를 돌려주고, 다음 send를 받는다 |

## 1. 영향 범위

- **app main** (`app/src/main/conversation/`): `transport.ts`(Claude·Codex normalizer의 도구 running 집합), `service.ts`(`working()`, `send`, persistence 실패 경로, P3 수정), `process.ts`(P3 수정 후보).
- **app renderer** (`app/src/renderer/`): `turnStatus.ts`(행 running 판단), `ConversationThread.tsx`(그 결과로 행 그리기), `ProjectOverview.tsx`·`CanvasConversationPanel.tsx`(중복된 `turnOf`를 공유 함수로), `dockedRules.ts` 또는 `composerRules.ts`(composer turn 판단).
- **CLI(Go), skill, guide**: 바뀌지 않는다.
- **형식**: 바뀌지 않는다(§7).

## 2. P1 — 활동 행과 도구 종료

### 2.1 규칙

행의 running 여부와 head를 threadItems가 혼자 정하지 않고, turn indicator가 쓰는 `turnStatus`의 결과(settle 전)에서 낸다.

- 마지막 thread item이 살아 있는 턴의 activity group이고 `turnStatus`가 `tool`이면: `running = true`, `head = status.text`. 마지막 step이 command이고 status의 activity도 command면 그 step의 verb를 "Running a command"로 바꾸는 지금 규칙도 유지한다.
- 그 밖(`general`, `thinking`, `reply`, `waiting`, `none`)이면: `running = false`, `head = stepCount(steps.length)`.
- `turnStatus`는 지금 그대로다. stage가 이 턴 것이고 `stage.seq >= turn.lastSeq`이면 stage가 이기고, 아니면 event 규칙(마지막 activity, Allow로 접힌 permission 앞의 도구)이 정한다. 그래서 Claude 도구가 도는 동안은 event 규칙으로 행이 running이고, 결과가 오면 general stage(같은 seq)가 이겨 행이 멈춘다.
- 이 판단은 settle(300 ms) 전 값을 쓴다. 행은 지금도 다음 출력에서 바로 바뀌므로, 행이 settle을 기다리면 지금보다 늦어진다.

ACP는 이 규칙만으로 고쳐진다. 도구가 끝나면 runner가 activity와 `endedStage`를 같은 frame에서 내므로, 다른 도구가 돌지 않으면 general(같은 seq)이 이기고, 돌면 그 도구의 tool stage가 이겨 head가 그 도구를 말한다.

### 2.2 main: 도구가 끝났다는 stage

renderer 규칙이 맞으려면 main이 "도구가 모두 끝났다"를 stage로 알려야 한다. ACP는 이미 그렇다(`acp.ts` `running` 목록, POSTMORTEM 2026-11-06). Claude와 Codex를 같은 모양으로 맞춘다.

- **Claude** (`transport.ts` Claude normalizer): activity를 만든 top-level `tool_use` id를 `running` 집합에도 넣는다(`AskUserQuestion`은 activity가 아니므로 넣지 않는다). top-level `user` frame의 `tool_result`는 `tool_use_id`를 집합에서 빼고, 집합이 비었을 때만 general을 낸다. `system/status` `requesting`의 general은 그대로다. `parent_tool_use_id` frame은 지금처럼 무시한다. 이 frame은 이벤트를 내지 않으므로 general의 seq는 마지막 activity의 seq와 같고, renderer에서 이긴다.
- **Codex** (`transport.ts` Codex normalizer): `commandExecution`·`fileChange`·`mcpToolCall` item의 `item/started`는 id를 `running`에 넣고, `item/completed`는 뺀다. read·listFiles·search 명령의 시작 stage는 그대로다. `item/completed`에서 `running`이 비면 general을 내고, 남아 있으면 stage를 내지 않는다(Codex의 일반 도구는 자기 tool stage가 없어 ACP의 "가장 늦게 시작한 도구"를 쓸 수 없다. spec Non-goals의 한계).
- 두 normalizer 모두, 턴의 terminal과 `aborted`·`failed` 반환 경로에서 `running`을 비운다. "호출을 끝내는 모든 반환 경로가 모든 per-call 집합에서 그 호출을 뺀다"(POSTMORTEM 2026-11-06 prevention).
- service의 stage 전달·dedupe(같은 turnId·seq·stage는 다시 보내지 않음)는 바뀌지 않는다.

### 2.3 바뀌는 PRODUCT·ARCHITECTURE 문장 (승격 때)

- PRODUCT §5 item 3 'Turn indicator'의 "The activity rows are unchanged: … after a Claude Code or Codex tool ends its row keeps its running head until the next output …" → 행의 running head는 indicator가 도구를 말하는 동안만 보이고 같은 문구다.
- PRODUCT §3 'Turn stages': Codex는 도구 item이 모두 끝나면 working을 말한다(지금은 read·list·search만).
- ARCHITECTURE §7 'Turn stages' Sources: Claude "general on … a top-level tool result" → 그 메시지의 top-level 도구가 모두 결과를 받았을 때. Codex "other Codex tools give no stage" → 시작 stage는 없고, 끝날 때 running이 비면 general. Renderer 항목에 행의 running 판단 추가.

## 3. P2 — 끝난 턴의 composer

### 3.1 지금

두 host의 `turnOf`(같은 코드가 두 벌)는 merged events의 `stripState` 다음에 `summary.working`을 읽는다. main의 `working()`은 판단을 기다리는 턴(`evidence.endedAt`), 나갈 큐(`holding`), 이전 프로세스를 기다리는 send(`waits`), 판단을 기다리는 send(`judging`), handoff 판단을 모두 센다. `composerAction(turn !== "idle", text)`는 running이고 입력이 비면 Stop을 낸다.

### 3.2 규칙

공유 순수 함수 `composerTurn(events, summary, live)`(두 `turnOf`를 대체)를 둔다.

1. merged events의 `stripState` kind가 permission·question이면 `waiting`, starting·working이고 live면 `running`(지금과 같음).
2. kind가 terminal(done·failed·interrupted)이면: `summary.queued > 0 && summary.working`일 때만 `running`, 아니면 `idle`. 목록이 아직 따라오지 못했어도 events의 끝이 이긴다(`steerPhaseOf`와 같은 순서).
3. 그 밖(events 없음)은 지금처럼 `summary.phase`와 `summary.working`.

이 규칙의 결과:

- 판단 창(최대 10 s) 동안 빈 composer는 Send(비활성)다. 입력하면 `composerAction`은 지금처럼 Queue를 낸다. 이때 `conversation:queue`는 `working` 동안 받으므로(ARCHITECTURE §7 IPC) 큐에 들어가고, 판단 뒤 나간다. 큐가 생기면 2에 따라 Stop이 다시 보이고, Stop은 지금처럼 큐를 draft로 돌려준다(`interrupt`의 `holding` 분기).
- 이 composer에서 보낸 send가 판단이나 이전 프로세스를 기다리는 동안은 composer가 자기 `sending` 상태(spinner)를 보이므로 Stop이 필요 없다.
- canvas panel의 handoff 판단 창도 같은 규칙을 따른다. 판단 중 send는 main이 해결을 기다렸다가 source로 보낸다(ARCHITECTURE §7 'Handoff').
- 판단 창에서 입력한 텍스트는 지금처럼 Queue로 들어간다. 메시지가 큐 행으로 바로 보이기 때문이다. Send로 보내 main이 판단을 기다리게 하면 composer가 최대 10 s spinner를 보여 P3와 같은 종류의 대기가 생긴다.

### 3.3 바뀌지 않는 것

`working()`과 목록의 `working`, root hold, Delete 불가(`conversationDelete.ts`), Send now 불가, Home의 `homeRun` 판단 창, `canvasConversation.ts`의 restore busy는 그대로다. 그래서 PRODUCT 문장은 바뀌지 않고, ARCHITECTURE §7에 composer가 terminal 뒤 큐가 있을 때만 running으로 읽는다는 한 줄을 더한다.

## 4. P3 — 끝난 Claude 턴 뒤의 send 대기

### 4.1 PoC (원인 미조사, 첫 작업)

지금 아는 것: send가 `turn.done`에 오면 `previousExit`가 `live.done`이고 suggestion이 아직 없으므로 `endSuggestion`(SIGTERM, 0.5 s 뒤 SIGKILL)을 부르고, usage read 중이면 그 read가 입력을 닫은 뒤(최대 `TURN_USAGE_MS` 3 s) 끝낸다. 그 뒤 `exitOf`가 `process_exited`(owned group이 사라짐: `OwnedGroup`이 100 ms마다 `kill(-pgid, 0)`이 `ESRCH`인지 본다)를 `EXIT_WAIT_MS`(10 s)까지 기다린다. 관찰은 CLI가 2.5–3.7 s에 끝나고 group은 약 7 s 더 산다는 것이다.

확인할 가설(어느 것도 확인되지 않았다):

- H1. CLI의 후손 프로세스가 같은 group에 남는다(예: hook, plugin MCP server, Bash 도구가 띄운 프로세스). 그렇다면 SIGKILL이 group 전체에 가므로, 이 경로에서는 `endSuggestion`이 불리지 않았을 수 있다(suggestion이 이미 왔거나, send가 다른 분기를 탔다).
- H2. suggestion이 send 전에 와서 `endSuggestion`을 건너뛰고, CLI와 후손이 스스로 끝나기를 기다린다.
- H3. group에 zombie만 남아 `kill(-pgid, 0)`이 성공한다(관찰 방식의 문제).
- H4. Doan이 SDK를 거쳐 띄운 wrapper 프로세스가 leader이고, 실제 CLI가 그 자식이다.

PoC(`.scratch/turn-end-state/`):

1. 격리된 앱에서 Doan 연결 Claude 대화로 두 턴을 보낸다. 두 번째는 첫 턴의 `turn.done`이 온 순간 보낸다(POSTMORTEM 2026-10-28: "Real-app checks of consecutive turns must send on `turn.done` itself"). 공유 provider profile은 실제 sign-in이 필요하다(사용자가 브라우저에서 승인하고, 끝나면 sign-out과 profile 삭제).
2. `turn.done`부터 group이 사라질 때까지 100 ms마다 그 pgid의 프로세스 목록(pid, ppid, pgid, stat, 경과, command)을 남긴다. `endSuggestion` 호출 여부와 시각, `prompt_suggestion` 도착 시각, CLI leader의 exit 시각도 남긴다.
3. suggestion이 오기 전 send와 온 뒤 send 두 경우를 각각 세 번.
4. 결과(어떤 프로세스, 부모, 상태, 신호가 닿는지, 가설 판정)를 이 절에 적는다.

### 4.2 수정 방향 (PoC 결과에 따라)

- **H1·H2(후손이 남음), 결정된 방향**: 끝난(done) 턴의 CLI leader가 이미 끝났고 send가 그 group을 기다리면, 그 send가 남은 group을 끝낸다(SIGTERM, 0.5 s 뒤 SIGKILL; `OwnedGroup.stop`과 같은 순서). 지금 `endSuggestion`은 "CLI가 아직 살아 있고 suggestion이 없을 때"만 끝내는데, 이 조건을 "leader가 끝난 뒤 남은 group"까지 넓힌다. reservation은 여전히 group이 사라진 관찰로만 풀린다. 위험: 에이전트가 이 턴에서 백그라운드로 띄운 프로세스(예: 개발 서버)도 끝난다. Stop이 이미 group 전체를 끝내므로 새 위험은 아니지만, done 턴 뒤에 그렇게 되는 것은 새로운 동작이다.
- **H3·H4 또는 Doan 밖의 원인**: 결정된 방향이 맞지 않는다. spec D3.5대로 원인을 기록하고 멈춰서 사용자에게 묻는다. 그때 낼 후보: H3이면 liveness 관찰을 고친다(예: zombie는 산 것으로 세지 않음), H4면 leader 판단을 실제 CLI 쪽으로 맞춘다.

순수 함수로 뺄 부분은 PoC 뒤에 정한다. 후보는 "send가 기다리는 group을 끝낼지"를 정하는 판단(`done`, leader exit 여부, suggestion 도착 여부, quitting)과 `OwnedGroup`의 leader exit 뒤 동작(주입된 `signal`·`alive`로 시험 가능).

### 4.3 목표 시간

`turn.done` 뒤 4 s 안에 다음 턴의 `turn.started`. 근거: usage read 상한 `TURN_USAGE_MS` 3 s + SIGKILL까지 0.5 s + 여유 0.5 s.

## 5. P4 — persistence가 실패한 대화

### 5.1 지금

`receive()` catch: `failedPersistence = true`, stage 지움, runner close, work 끝, steer 내림, evidence·handoff 버림. `busy`는 그대로라 `working()`이 참이다. 프로세스가 끝나면 `exited()`가 reservation을 풀고 `exited = true`로 두며, `turn.failed`를 `receive()`에 보내지만 `failedPersistence`라서 무시된다. `ran()`은 `failedPersistence && exited`에서 false라, 목록 phase는 이미 ended이고 thread는 마지막 턴을 crashed로 접는다. 남는 것은 `working`뿐이다: composer Stop(눌러도 `interrupt` → `receive` 무시), Delete 불가, canvas restore busy.

### 5.2 규칙

- `exited()`에서 `failedPersistence`인 live 항목은 `busy = false`로 둔다. `working()`이 거짓이 되고, Delete·restore가 풀리며, composer는 `idle`이 된다.
- 그 턴의 큐는 실패한 턴처럼 `giveBack(id, "turn_failed")`로 draft가 된다(drafts 파일은 history와 다른 파일이다. 그 쓰기도 실패하면 로그만 남긴다).
- `send`: `existing.failedPersistence && existing.exited`이면 그 live 항목을 버리고 새 항목으로 시작한다. 기존 `busy` 거절은 프로세스가 아직 살아 있을 때만 남긴다. 새 턴의 `user.message`가 들어오면 thread와 main fold는 이전의 끝나지 않은 턴을 지금 규칙대로 crashed("Stopped · The agent stopped before it finished.")로 접는다(`threadItems.ts` `foldCrashed`, ARCHITECTURE §7 `conversation:list`). history가 여전히 쓰기를 받지 않으면 `appendAll`이 실패하고, send는 지금 첫 쓰기가 실패한 send와 같은 경로로 거절된다.
- 다음 send를 받는 이유: 새 문구 없이 기존 접힘을 쓰고, 일시적인 쓰기 실패(디스크가 찼다가 비워짐 등)에서 재시작 없이 이어 갈 수 있다. 재시작 전까지 거절하려면 새 거절 코드와 문구가 필요하고, 지금의 `busy` 거절("<Provider> is finishing a previous run. Try again in a moment.")은 사실과 다르다.

### 5.3 바뀌는 ARCHITECTURE 문장 (승격 때)

§7 'Deletion'의 "A conversation whose persistence failed stays `working` until restart, so it cannot be deleted until then (BACKLOG)." → 그 프로세스 group이 사라지면 working이 아니고, 큐는 돌아오고, 다음 send는 새 턴을 연다.

## 6. 순수 함수 (`/tdd` 대상)

| 함수 | 위치 | 사례 |
|---|---|---|
| Claude normalizer의 도구 `running` 집합 | `transport.ts` | 단일 도구 결과 → general. 한 메시지의 병렬 두 도구에서 첫 결과 → stage 없음, 둘째 → general. 결과가 다른 frame에 따로 옴/한 frame에 같이 옴. `AskUserQuestion` 결과는 집합을 바꾸지 않음. `parent_tool_use_id` frame 무시. terminal·aborted에서 집합이 비워짐. 다음 턴이 이전 턴의 집합을 물려받지 않음 |
| Codex normalizer의 도구 `running` 집합 | `transport.ts` | 일반 `commandExecution` 시작 → stage 없음, 완료 → general. read 시작 → read stage(지금과 같음), 완료 → general. 두 item 병렬에서 첫 완료 → stage 없음, 둘째 → general. `fileChange`·`mcpToolCall`. 시작 없이 온 완료. terminal에서 비워짐 |
| `activityRun(items, status)` (가칭) | `turnStatus.ts` | 마지막 activity + event 규칙 tool → running, head = status.text. 같은 seq의 general → 멈춤, `stepCount`. ACP 완료 + 다른 도구 tool stage → running, head = 그 도구. thinking·reply·waiting·none → 멈춤. 끝난 턴·접힌 턴 → 멈춤. 마지막이 activity가 아니면 그대로. command verb 바꾸기는 running일 때만 |
| `composerTurn(events, summary, live)` | `dockedRules.ts` 또는 `composerRules.ts` | terminal 뒤 `working`·`queued` 0 → idle. terminal 뒤 `queued` > 0 → running. terminal인데 목록은 아직 running → idle. permission·question → waiting. starting·working + live → running. events 없음 → phase·working |
| P3 판단 (PoC 뒤 확정) | `service.ts` 또는 `process.ts` | §4.2 |

service 쪽 P4는 순수 함수가 아니라 `service.test.ts`의 사례로 고정한다: 저장 실패 → 프로세스 exit 전 working, exit 뒤 not working·큐 draft·delete 성공·새 send 수락, history가 여전히 실패하면 send 거절.

## 7. 형식 변경

없다. stage는 이벤트가 아니고(ARCHITECTURE §7 'Turn stages'), `StageSignal`·`TurnStage` 모양도 그대로다. event JSONL v1, 목록 summary, IPC 채널, `runtime.json`, app socket 메시지, `.doan/config.json`, CLI 응답, JSON Schema 모두 바뀌지 않는다. P4는 새 거절 코드를 쓰지 않는다.

## 8. Conventions 영향

없다. ARCHITECTURE §1 'Conventions'와 `doan check` 규칙에 닿지 않는다.

## 9. 결정 영향

- PRODUCT §5 item 3 'Turn indicator'의 "activity rows are unchanged" 결정을 바꾼다(P1). 사용자가 이 변경을 승인했다.
- PRODUCT §3 'Turn stages'의 Codex 문장을 넓힌다(P1). "provider가 이미 보내는 것만 읽고, 요청을 보내지 않는다"는 원칙은 그대로다: `item/completed`와 `tool_result`는 이미 받는 frame이다.
- ARCHITECTURE §7의 reservation 불변식("two processes never share a session", "release follows liveness alone")은 P3 수정에서도 그대로다(§4.2). done 턴 뒤에 남은 group을 끝내는 새 동작은 사용자가 승인했다(후손 프로세스가 원인일 때).
- PRODUCT §3 'Live terminal policy'의 "Doan never kills the user's Codex daemon"과는 겹치지 않는다. P3는 Doan이 띄운 Claude group만 다룬다.
- PRODUCT §3 Out of scope와 겹치는 항목은 없다.

## 10. PoC 의존

P3는 원인이 확인되지 않았다(BACKLOG: "Which process outlives the CLI was not investigated"). T0 PoC가 먼저이고, §4.2의 수정 방향은 그 결과로 정한다. P1의 Claude 병렬 도구 결과가 한 `user` frame에 같이 오는지 따로 오는지도 확인되지 않았으므로, 두 모양을 모두 시험한다(§6). P1·P2·P4는 PoC에 기대지 않는다.

## 11. POSTMORTEM에서 가져온 함정

- **2026-11-06 — A sibling ACP tool's completion hid a command still running.** "a per-call status mapping keeps the set of calls still running and derives the stage from it; every return path that ends a call removes it from every per-call set. Test parallel starts with out-of-order completion." → §2.2의 Claude·Codex `running` 집합과 §6 병렬 사례.
- **2026-11-06 — The next turn's indicator came a render after the person's message.** "UI that must appear 'with' an accepted message reads the turn from the message (`turnOf`), not from a later event." → `composerTurn`은 merged events를 목록보다 먼저 읽고, 행 판단은 indicator와 같은 render의 값을 쓴다.
- **2026-10-28 — A send right after turn.done was refused as busy until the previous process group was gone.** "any path that replaces `this.live` for an id whose process is still alive must refuse before replacing it. Real-app checks of consecutive turns must send on `turn.done` itself." → P4의 send는 `exited`일 때만 live 항목을 바꾸고, P3 PoC와 확인은 `turn.done`에 보낸다.
- **2026-10-27 — Awaited conversation work outlived its current turn.** "recheck current metadata and live execution identity after preparation and opening, before acceptance." → P3에서 group을 끝내는 판단은 기다리는 send의 live identity와 turnId로 울타리를 친다.
- **2026-10-26 (ordering)** — 같은 턴의 stage는 `rev`가 높은 쪽이 이긴다(ARCHITECTURE §7 'Turn stages'). §2의 renderer 규칙은 store가 고른 stage를 그대로 쓴다.

## 12. 디자인 preset

`doan design-skill --json`으로 목록을 보고 `clarify`, `harden`을 읽었다.

- `clarify`: 새 문구는 없다. 행은 기존 `runningHead`·`stepCount`, composer는 기존 Send·Queue·Stop 라벨, P4는 기존 "Stopped · The agent stopped before it finished."를 쓴다. P4에서 지금의 `busy` 문구("<Provider> is finishing a previous run. Try again in a moment.")를 남기지 않은 것도 이 preset 기준이다. 사실이 아닌 원인을 말하고 동작하지 않는 복구를 권한다.
- `harden`: "Disable or mark a submit action while it is in flight"와 상태 구분 원칙에 따라, 판단 창의 composer는 Stop이 아니라 비활성 Send(빈 입력) 또는 Queue로 지금 할 수 있는 일만 보인다.
- 레이아웃과 새 상태 화면이 없으므로 `/design-draft`는 하지 않는다.

## 13. 결정

- §2, spec D1: 활동 행의 running head는 turn indicator와 같은 규칙을 따른다.
- §3.2, spec D2: 판단 창에서 입력한 텍스트는 Queue로 들어간다.
- §4.2, spec D3: PoC가 후손 프로세스를 지목하면, 기다리던 send가 남은 group을 SIGTERM→SIGKILL로 끝낸다. 다른 원인이면 멈추고 묻는다.
- §5.2, spec D4: persistence 실패 뒤 프로세스가 사라지면 다음 send로 새 턴을 받는다.
- §4.3, spec D3.3: 목표는 `turn.done` 뒤 4 s 안의 `turn.started`.
- §12, tasks T5: `/design-draft`는 하지 않는다.
