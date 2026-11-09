# turn-end-state — spec

일이 끝났는데 화면은 아직 바쁜 것처럼 보이는 결함 네 개를 한 번에 고친다. 출처는 `docs/BACKLOG.md` 'Known defects'의 네 항목이다(아래 '문제'에 그대로 옮겼다).

## 사용자

- **사람**(앱에서 대화를 보고 보내는 사람): 턴이 끝나면 활동 행, composer, 목록이 끝났다고 말하고, 바로 다음 메시지를 보내거나 대화를 지울 수 있다. 에이전트가 턴 중에 백그라운드로 띄운 프로세스(예: 개발 서버)는 그 턴의 프로세스가 끝날 때 함께 끝난다. 지금도 SDK loop가 끝날 때 group 전체를 끝내므로 그렇게 동작하고, 이번에 PRODUCT에 적는다(design §4.2).
- **에이전트**: CLI, skill, guide, `doan check` 규칙은 바뀌지 않는다. 턴 중에 띄운 백그라운드 프로세스가 턴 뒤까지 살아 있다고 기대할 수 없다(위와 같은 규칙).

## 문제 (관찰된 사실)

- **P1. 활동 행의 running head가 끝난 도구를 말한다.** Claude Code와 Codex는 도구가 시작될 때만 activity를 보내므로, 도구가 끝난 뒤에도 행은 다음 출력이 올 때까지 "Running a command"나 "Reading <path>"를 spinner와 함께 보인다. ACP 도구는 완료된 뒤에야 행이 생기므로, running head가 도구가 끝난 뒤에 나타난다. 지금 PRODUCT §5 item 3 'Turn indicator'는 이 행을 "unchanged"로 둔 결정이다.
  - 코드 확인(2026-11-09): Codex의 일반 명령(`commandExecution` 중 read·listFiles·search가 아닌 것)·`fileChange`·`mcpToolCall`은 끝날 때 stage를 내지 않는다(`transport.ts` `codexReadStage`가 아니면 stage 없음). 그래서 turn indicator도 event 규칙으로 돌아가 끝난 명령을 "Running a command"로 계속 말한다. Claude는 top-level tool result마다 general을 내므로, 한 메시지의 병렬 도구 중 첫 결과에서 아직 도는 도구가 있어도 general이 된다.
- **P2. Overview composer가 project 턴의 `turn.done` 뒤 10 s 동안 Stop을 보인다.** thread는 이미 턴이 끝났고 turn indicator도 없다. `BIND_GRACE_MS`(`project.ts`)가 promotion 판단을 위해 대화를 `working`으로 두고, 두 host의 `turnOf`(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)가 `summary.working`을 "running"으로 읽는다(2026-11-06 모든 Overview 턴에서 관찰. canvas panel은 바로 Send로 돌아간다).
- **P3. Claude 턴의 `turn.done`에 보낸 메시지가 약 10.8 s 기다린 뒤 턴을 시작한다.** 거절되지는 않는다. Claude CLI는 `result` 뒤 2.5–3.7 s에 끝나지만, owned group이 사라진 것은 그 뒤 약 7 s, `EXIT_WAIT_MS`(10 s)에 가깝게 관찰됐다(2026-11-06, 공유 provider profile, main `a28da4fe`와 prompt-suggestion branch 모두). CLI보다 오래 사는 프로세스가 무엇인지는 조사하지 않았다.
- **P4. persistence가 실패한 대화(`failedPersistence`)가 재시작 전까지 `working`으로 남아 지울 수 없다.** 코드 확인(2026-11-09): `receive()`의 catch는 `live.failedPersistence`만 세우고 `live.busy`는 그대로 두며, 프로세스가 끝나도 `exited()`가 보내는 `turn.failed`를 `receive()`가 무시하므로 `working()`이 계속 참이다. composer는 Stop을 보이지만 Stop도 아무것도 하지 않는다(`interrupt` → `receive`가 무시).

## 완료 조건

검증 명령과 순서는 tasks.md에 있다.

### D1. 활동 행 (P1)

1. thread의 마지막 item인 활동 행(Send now로 보내는 중인 메시지를 붙이기 전의 마지막 item)은 turn indicator가 도구를 말하는 동안에만 spinner와 running head를 보이고, 그 head는 indicator가 보이는 값(300 ms settle을 거친 값)과 글자 그대로 같다. indicator가 working·thinking·replying·waiting이 되면 행은 다음 출력을 기다리지 않고 단계 수("1 step", "3 steps")를 보인다. 빠른 도구에서 행이 깜박이지 않는 것도 settle 덕분이다.
2. Claude Code: 한 assistant 메시지의 top-level 도구가 모두 결과를 받으면 general이 된다. 병렬 도구 중 하나가 끝나도 다른 도구가 돌면 행은 계속 running이다.
3. Codex: `commandExecution`·`fileChange`·`mcpToolCall` item의 `item/completed`에서, 같은 턴의 다른 도구 item이 돌지 않으면 general이 된다. read·listFiles·search의 시작 stage는 지금과 같고, 그 행의 head는 이제 indicator와 같은 "Reading <path>"나 "Reading files"다.
4. ACP(Copilot, Antigravity, Cursor): activity는 완료된 뒤에 생기므로, 행은 tool stage가 이길 때만 running이다. 완료로 처음 생기는 행은 running head 없이 나타난다. 다른 도구가 아직 돌면 행의 running head는 indicator처럼 가장 늦게 시작한 도는 도구를 말하고, 그 도구는 아직 단계 목록에 없을 수 있다.
5. "Running a command"로 step verb를 바꾸는 것은 indicator의 도구가 그 step에서 나왔을 때만이다(다른 도구의 stage가 이기면 바꾸지 않는다).
6. 예외: 마지막 step이 문장 step(Codex MCP startup의 "Waiting for <server>" 줄)인 행은 지금 규칙을 지킨다. 턴이 끝나기 전 마지막 item이면 spinner와 그 문장을 보인다(PRODUCT §3 'MCP tools').
7. 턴 중간에 창을 다시 읽어도(`conversation:read`의 `stage`) 같은 규칙이 적용되고, 재시작으로 접힌 턴과 끝난 턴의 행은 지금처럼 단계 수만 보인다.
8. 새 UI 문구와 새 screen reader 안내는 없다. head는 행 버튼의 이름이고, thread의 sr-only status가 이미 settle된 stage를 읽는다.

### D2. 판단 창의 composer와 화면 (P2)

1. 판단 창은 마지막 턴의 terminal event(`turn.done`·`turn.failed`·`interrupted`)가 들어왔는데 main이 아직 그 대화를 `working`으로 두는 동안이다(promotion 판단, handoff 판단, 나갈 큐). Overview와 canvas panel의 docked composer는 이 동안 새 turn 값 `holding`을 쓴다.
2. `holding`에서:
   - 입력이 비면 Send(비활성)다. Stop은 보이지 않는다.
   - 텍스트가 있으면 Queue다. Enter와 Control+Enter 모두 큐에 넣는다(Send now가 없으므로).
   - queue 행이 있는 동안은 Stop이다. 큐를 보내는 중인 상태(flush)도 queue 행이 있는 것으로 센다. Stop은 지금처럼 큐를 draft로 돌려준다.
3. 판단 창에서 각 화면은 이렇게 보인다.

| 화면 | 판단 창에서 |
|---|---|
| thread | 턴이 끝난 모습. turn indicator 없음 |
| composer | 2의 `holding` 규칙 |
| queue 행 | Send now 없음, "Press Ctrl + Enter to send all now." 안내 없음(지금과 같음) |
| sidebar slot, Canvas conversations 행 | working(지금과 같음) |
| Delete | 할 수 없음. 기존 이유 문구 그대로 |
| 다음 메시지 제안 | 보이지 않음(지금과 같음) |

4. handoff 판단 창(canvas panel): 이 동안 큐에 넣은 메시지는 새 대화의 첫 턴 뒤에 나간다(PRODUCT §5 item 2 'Handoff'). source thread의 "Hands off to <file> when this turn ends" 줄이 그 표시다.
5. Stop에 focus가 있었는데 비활성 Send로 바뀌면 focus는 composer 입력란으로 간다. 사람이 다른 곳으로 옮긴 focus는 그대로 둔다.
6. 바뀌지 않는 것: 판단 중 다른 project 대화의 root hold(10 s), 판단 중 Delete 불가, Send now 불가(PRODUCT §5 item 1 'Project conversations'), 다음 메시지 제안을 숨기는 것.

### D3. 끝난 Claude 턴 뒤의 send 대기 (P3)

1. PoC가 원인을 H0–H5(design §4.1) 중 하나로 판정하거나, 다른 원인을 증거와 함께 기록한다. 판정과 증거는 design §4.1에 적는다.
2. 원인이 done 턴의 CLI leader가 끝난 뒤에도 그 group이 남는 것(H1·H2·H5)이면: done terminal 뒤 CLI leader가 끝나면 runner가 기다리는 send와 무관하게 `group.stop()`(SIGTERM, 0.5 s 뒤 SIGKILL)을 부른다.
3. 2를 적용했을 때만, canvas 대화에서 측정해 둘 다 지킨다.
   - group이 leader exit 뒤 0.6 s 안에 사라진다.
   - 다음 턴의 `turn.started`가 그 순간에서 기준선 안에 온다. 기준선은 이전 프로세스가 없는 대화에서 send부터 `turn.started`까지 걸린 시간이고, T0에서 잰다.
4. reservation은 여전히 group이 사라진 것을 관찰한 뒤에만 풀린다. 두 프로세스가 한 session을 나눠 쓰지 않는다(POSTMORTEM 2026-10-28).
5. 기다리는 동안 화면은 지금과 같다. composer Send에 spinner가 돌고(목표 시간까지), 입력은 읽기 전용이며, 턴이 수락되면 메시지 풍선이 thread에 들어온다.
6. 원인이 H0, H3, H4이거나 다른 원인이면 멈추고 사용자에게 묻는다.
7. **결과**: T0이 H0으로 판정했다(design §4.1). 사용자 결정으로 P3는 고치지 않고 원인만 기록한다. 2–3은 적용하지 않는다.

### D4. persistence가 실패한 대화 (P4)

1. 이벤트 저장이 실패한 턴의 프로세스 group이 사라지면, 그 대화는 `working`이 아니다: 목록의 `working`이 false, composer에 Stop이 없고, sidebar slot과 Canvas conversations 행이 working을 말하지 않으며, Delete와 restore(이 canvas의 archived 대화를 다시 여는 send)가 된다.
2. 그 턴의 큐는 실패한 턴 뒤처럼 draft로 돌아온다. drafts 파일 쓰기도 실패하면 로그만 남긴다.
3. 저장하지 못한 턴은 지금의 접힘 규칙대로 "Stopped · The agent stopped before it finished."로 보인다.
4. 다음 send는 새 턴을 시작한다. history가 여전히 쓰기를 받지 않으면 그 send는 지금 첫 쓰기가 실패한 send와 같은 경로로 실패한다.
5. 프로세스 group이 아직 살아 있는 동안은 `working`이고, Stop은 보통 Stop과 같은 SIGTERM→SIGKILL로 남은 group을 끝낸다. 그동안 온 send는 group이 사라지기를 기다린다(거절하지 않는다).
6. 알려진 한계: 저장 실패라는 원인은 사람에게 알리지 않는다. "The agent stopped before it finished."만 보인다.

## Non-goals

- **promotion 판단 창 자체를 줄이기.** 턴 끝에 main이 직접 folder를 다시 읽어 바로 판단하면 10 s root hold도 줄지만, 판단 시점은 PRODUCT §5 item 1 'Project conversations'의 결정이고, edit 증거(watcher가 본 `rev` 변화)가 늦게 오면 기존 canvas promotion을 놓칠 수 있다. 별도 결정이 필요하다. D2는 판단 창의 화면만 고친다.
- **ACP 도구가 시작될 때 행 만들기.** 시작 시점 activity는 이벤트를 하나 더 쓰거나 기존 activity를 바꾸는 일이라 history 형식(event JSONL v1)에 닿는다. 도는 동안은 turn indicator와 D1.4의 행이 말한다.
- **목록 preview와 Home의 conversation strip.** "working with the last activity" 같은 목록 쪽 문구는 이벤트에서 접으므로 이번 규칙(live stage)과 다른 경로다. 관찰된 결함도 없다.
- **판단 중 Delete와 Send now.** PRODUCT가 정한 규칙이다(판단을 기다리는 project 턴은 working으로 센다).
- **다른 provider의 exit 대기**(Copilot 약 0.5 s 등)와 Codex server 재사용. P3는 Claude만 관찰됐다.
- **실패한 쓰기 다시 시도, history 복구, 저장 실패를 사람에게 알리기.** D4는 남은 상태를 풀기만 한다.
- **끝내 사라지지 않는 group.** reservation 규칙은 ARCHITECTURE §7 'App-local ownership and request timing'(`ownership.ts`)에 있고 그대로 둔다. D4의 대화만 그동안 working으로 남는다. done 턴의 group은 D3 수정이 끝내고, 그래도 남으면 send는 `EXIT_WAIT_MS` 뒤 `busy`로 거절된다(지금과 같음).
- **병렬 도구의 한계(관찰된 적 없음).** Claude와 Codex 모두, 나중에 시작한 도구가 먼저 끝나고 먼저 시작한 도구가 아직 돌면 stage를 내지 않으므로, indicator와 행은 event 규칙(마지막 activity, 곧 가장 늦게 시작한 도구)을 말한다. 그 도구는 이미 끝났을 수 있다. Codex에서 read·search가 끝났는데 일반 명령이 아직 돌 때도 같다(design §2.2).
- **Cursor 두 번째 턴 `session_unavailable`**, Codex Send now 순서 등 다른 BACKLOG 결함.
