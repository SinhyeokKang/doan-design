# turn-end-state — spec

일이 끝났는데 화면은 아직 바쁜 것처럼 보이는 결함 네 개를 한 번에 고친다. 출처는 `docs/BACKLOG.md` 'Known defects'의 네 항목이다(아래 '문제'에 그대로 옮겼다).

## 사용자

- **사람**(앱에서 대화를 보고 보내는 사람): 턴이 끝나면 활동 행, composer, 목록이 끝났다고 말하고, 바로 다음 메시지를 보내거나 대화를 지울 수 있다.
- **에이전트**: 바뀌는 것이 없다. CLI, skill, guide, `doan check` 규칙은 그대로다.

## 문제 (관찰된 사실)

- **P1. 활동 행의 running head가 끝난 도구를 말한다.** Claude Code와 Codex는 도구가 시작될 때만 activity를 보내므로, 도구가 끝난 뒤에도 행은 다음 출력이 올 때까지 "Running a command"나 "Reading <path>"를 spinner와 함께 보인다. ACP 도구는 완료된 뒤에야 행이 생기므로, running head가 도구가 끝난 뒤에 나타난다. 지금 PRODUCT §5 item 3 'Turn indicator'는 이 행을 "unchanged"로 둔 결정이다.
  - 코드 확인(2026-11-09): Codex의 일반 명령(`commandExecution` 중 read·listFiles·search가 아닌 것)·`fileChange`·`mcpToolCall`은 끝날 때 stage를 내지 않는다(`transport.ts` `codexReadStage`가 아니면 stage 없음). 그래서 turn indicator도 event 규칙으로 돌아가 끝난 명령을 "Running a command"로 계속 말한다. Claude는 top-level tool result마다 general을 내므로, 한 메시지의 병렬 도구 중 첫 결과에서 아직 도는 도구가 있어도 general이 된다.
- **P2. Overview composer가 project 턴의 `turn.done` 뒤 10 s 동안 Stop을 보인다.** thread는 이미 턴이 끝났고 turn indicator도 없다. `BIND_GRACE_MS`(`project.ts`)가 promotion 판단을 위해 대화를 `working`으로 두고, 두 host의 `turnOf`(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)가 `summary.working`을 "running"으로 읽는다(2026-11-06 모든 Overview 턴에서 관찰. canvas panel은 바로 Send로 돌아간다).
- **P3. Claude 턴의 `turn.done`에 보낸 메시지가 약 10.8 s 기다린 뒤 턴을 시작한다.** 거절되지는 않는다. Claude CLI는 `result` 뒤 2.5–3.7 s에 끝나지만, owned group이 사라진 것은 그 뒤 약 7 s, `EXIT_WAIT_MS`(10 s)에 가깝게 관찰됐다(2026-11-06, 공유 provider profile, main `a28da4fe`와 prompt-suggestion branch 모두). CLI보다 오래 사는 프로세스가 무엇인지는 조사하지 않았다.
- **P4. persistence가 실패한 대화(`failedPersistence`)가 재시작 전까지 `working`으로 남아 지울 수 없다.** 코드 확인(2026-11-09): `receive()`의 catch는 `live.failedPersistence`만 세우고 `live.busy`는 그대로 두며, 프로세스가 끝나도 `exited()`가 보내는 `turn.failed`를 `receive()`가 무시하므로 `working()`이 계속 참이다. composer는 Stop을 보이지만 Stop도 아무것도 하지 않는다(`interrupt` → `receive`가 무시).

## 완료 조건

검증 명령과 순서는 tasks.md에 있다.

### D1. 활동 행 (P1)

1. 활동 행은 turn indicator가 도구를 말하는 동안에만 spinner와 running head를 보이고, 그 head는 indicator의 도구 문구(300 ms settle 전 값)와 같다. indicator가 working·thinking·replying이 되면 행은 다음 출력을 기다리지 않고 단계 수("1 step", "3 steps")를 보인다.
2. Claude Code: 한 assistant 메시지의 top-level 도구가 모두 결과를 받으면 general이 된다. 병렬 도구 중 하나가 끝나도 다른 도구가 돌면 행은 계속 running이다.
3. Codex: `commandExecution`·`fileChange`·`mcpToolCall` item의 `item/completed`에서, 같은 턴의 다른 도구 item이 돌지 않으면 general이 된다. read·listFiles·search의 시작 stage는 지금과 같다.
4. ACP(Copilot, Antigravity, Cursor): 완료로 처음 생기는 행은 running head 없이 나타난다. 다른 도구가 아직 돌면 행의 running head는 indicator처럼 가장 늦게 시작한 도는 도구를 말한다.
5. 턴 중간에 창을 다시 읽어도(`conversation:read`의 `stage`) 같은 규칙이 적용되고, 재시작으로 접힌 턴과 끝난 턴의 행은 지금처럼 단계 수만 보인다.
6. 새 UI 문구는 없다. 쓰는 문구는 지금의 `runningHead`, `stepCount`, indicator 문구뿐이다.

### D2. 끝난 턴의 composer (P2)

1. Overview와 canvas panel의 docked composer는 마지막 턴의 terminal event(`turn.done`·`turn.failed`·`interrupted`)가 thread에 들어온 render부터, 빈 입력에서 Stop 대신 Send(비활성)를 보인다. promotion 판단이나 handoff 판단을 기다리는 동안도 같다.
2. 그 사이 입력한 텍스트는 지금처럼 Queue로 큐에 들어가고, 판단이 끝난 뒤 나간다. 큐가 있는 동안(나갈 큐가 기다리는 동안)은 지금처럼 Stop이 보이고, 누르면 큐가 draft로 돌아온다.
3. 바뀌지 않는 것: 판단 중 다른 project 대화의 root hold(10 s), 판단 중 Delete 불가, Send now 불가(PRODUCT §5 item 1 'Project conversations').

### D3. 끝난 Claude 턴 뒤의 send 대기 (P3)

1. PoC가 CLI가 끝난 뒤에도 owned group을 살려 두는 프로세스를 지목하고, 그 command·부모·상태와 Doan의 SIGTERM·SIGKILL이 닿는지를 design §4.1에 기록한다.
2. PoC가 CLI의 후손 프로세스를 원인으로 지목하면, 그 group을 기다리던 send가 남은 group을 SIGTERM, 0.5 s 뒤 SIGKILL로 끝낸다(design §4.2).
3. 수정한 뒤, Doan 연결 Claude 대화에서 `turn.done`이 온 순간 보낸 메시지의 `turn.started`가 그 `turn.done` 뒤 4 s 안에 온다(세 번 반복, 모두 통과).
4. reservation은 여전히 group이 사라진 것을 관찰한 뒤에만 풀린다. 두 프로세스가 한 session을 나눠 쓰지 않는다(POSTMORTEM 2026-10-28).
5. PoC 결과 원인이 후손 프로세스가 아니거나, Doan이 손댈 수 없는 곳이거나, 고치면 4를 깨는 경우: 이번 라운드는 원인을 ARCHITECTURE §7과 BACKLOG에 기록하는 것으로 끝내고, 그 결정은 사용자에게 묻는다.

### D4. persistence가 실패한 대화 (P4)

1. 이벤트 저장이 실패한 턴의 프로세스 group이 사라지면, 그 대화는 `working`이 아니다: 목록의 `working`이 false, composer에 Stop이 없고, sidebar slot과 Canvas conversations 행이 working을 말하지 않으며, Delete가 된다.
2. 그 턴의 큐는 실패한 턴 뒤처럼 draft로 돌아온다.
3. 저장하지 못한 턴은 지금의 접힘 규칙대로 "Stopped · The agent stopped before it finished."로 보인다.
4. 다음 send는 새 턴을 시작한다. history가 여전히 쓰기를 받지 않으면 그 send는 지금 첫 쓰기가 실패한 send와 같은 경로로 실패한다.
5. 프로세스 group이 아직 살아 있는 동안은 지금처럼 `working`이다.

## Non-goals

- **promotion 판단 창 자체를 줄이기.** 턴 끝에 main이 직접 folder를 다시 읽어 바로 판단하면 10 s root hold도 줄지만, 판단 시점은 PRODUCT §5 item 1 'Project conversations'의 결정이고, edit 증거(watcher가 본 `rev` 변화)가 늦게 오면 기존 canvas promotion을 놓칠 수 있다. 별도 결정이 필요하다. D2는 composer가 바쁘게 보이는 것만 고친다.
- **ACP 도구가 시작될 때 행 만들기.** 시작 시점 activity는 이벤트를 하나 더 쓰거나 기존 activity를 바꾸는 일이라 history 형식(event JSONL v1)에 닿는다. 도는 동안은 turn indicator가 말한다.
- **목록 preview와 Home의 conversation strip.** "working with the last activity" 같은 목록 쪽 문구는 이벤트에서 접으므로 이번 규칙(live stage)과 다른 경로다. 관찰된 결함도 없다.
- **판단 중 Delete와 Send now.** PRODUCT가 정한 규칙이다(판단을 기다리는 project 턴은 working으로 센다).
- **다른 provider의 exit 대기**(Copilot 약 0.5 s 등)와 Codex server 재사용. P3는 Claude만 관찰됐다.
- **실패한 쓰기 다시 시도, history 복구.** D4는 남은 상태를 풀기만 한다.
- **group이 끝내 사라지지 않는 프로세스.** reservation 규칙(ARCHITECTURE §7 'Identity and admission')대로 계속 working이다.
- **Codex 병렬 도구의 한계.** read·search가 끝났는데 일반 명령이 아직 돌면 stage를 내지 않으므로, indicator와 행은 event 규칙(마지막 activity)으로 돌아가 끝난 read를 말할 수 있다. 관찰된 적은 없다(design §2.2).
- **Cursor 두 번째 턴 `session_unavailable`**, Codex Send now 순서 등 다른 BACKLOG 결함.
