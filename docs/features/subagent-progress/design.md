# 서브에이전트 진행 — design

## 영향 범위

- **app (main)**:
  - `conversation/transport.ts`(Claude):
    - `system/task_started`, `task_progress`, `task_updated`, `task_notification`을 읽는 순수 함수를 더한다. 지금은 `backgroundTasks`가 `background_tasks_changed`의 `task_id`만 읽는다.
    - Agent 도구의 `activity`에 `callId`를 붙인다. 지금 `callIdOf`는 edit에만 붙는다(`claudeActivity`). 알 수 없는 키는 이전 빌드가 거부하지 않으므로 되돌림 비용이 없다(ARCHITECTURE §7 대화 이벤트 문단).
    - Agent의 `activity`는 assistant 프레임에서 먼저 저장되고 `task_started`는 그 뒤에 온다(`fixtures/claude-thinking.json` 'task'). 그래서 단계를 작업으로 "넘기지" 않는다. 활동 이벤트는 지금처럼 저장하고, renderer가 같은 `callId`·`toolUseId`로 단계를 작업 행으로 합친다.
    - `parent_tool_use_id`가 있는 프레임은 지금처럼 버린다(`normalizeClaude`, `runners.ts`). 서브에이전트 안의 단계는 보이지 않는다(비목표).
  - `conversation/runners.ts`:
    - 턴 안과 터미널 뒤의 작업 프레임을 리듀서로 넘긴다. 지금 `normalizeClaude`는 터미널 뒤 프레임을 버린다(`state.terminal`). 작업 프레임은 그 앞에서 따로 읽는다.
    - **보고 턴**: 빈 집합이 된 tick에 프로세스를 끊는 규칙을 없앤다. 대신 CLI가 스스로 여는 턴(프롬프트를 읽지 않은 채 오는 프레임, 지금 `promptTransport`가 "a background task's notice"로 다루는 것)을 사람 메시지 없는 새 턴으로 받는다. 이를 위해 턴이 끝나도 입력을 닫지 않고 프로세스를 유지해야 한다. 지금은 "closes the moment the turn ends"(`runners.ts` 입력 주석)이고, 2.1.284는 입력을 닫은 뒤 약 5초에 백그라운드 명령을 끊었다(PoC 결과 3). 그래서 입력을 열어 둔 채 기다리는 방식과, 그때의 프로세스 수명은 T1b PoC로 정한다.
    - **다음 send**: 백그라운드 작업이 도는 동안의 send는 `endAfterTurn`으로 프로세스를 끊지 않고, 살아 있는 프로세스의 입력에 넣는다(`enqueue`, steer와 같은 길). 보고 턴이 이미 도는 중이면 그 턴에 steer할지 큐에 둘지는 T1b에서 정한다.
    - 최소 버전에서 마지막 `task_notification`이 빈 집합보다 늦게 오는 경우(PoC 결과 5)는 기다리지 않는다. 그 작업은 기록하지 않는다. 보고 턴을 허용하므로 프로세스는 그 순간 끊기지 않고, 늦은 알림도 대개 받게 된다.
  - `conversation/service.ts`:
    - 진행 중 작업 목록은 `StageSignal`(`types.ts`)과 같은 메모리 전용 push로 보낸다. `conversation:list`(`changedOf`)로 보내면 `task_progress`가 올 때마다 root의 기록 전체를 다시 접는다(ARCHITECTURE §7 "no cache; a known cost").
    - 턴 뒤 `task.done`은 `receive`로 쓰지 않는다. `receive`는 `live.terminal`이면 이벤트를 버리고, 다음 send가 같은 `live`를 쓰면 새 턴의 id로 쓰기 때문이다. `canvas.drawn`처럼 따로 울타리를 친 쓰기로 쓴다: 띄운 턴의 id로 쓰고, 그 대화가 지워지거나 앱이 끝나는 중이거나 기록이 쓰기를 받지 않으면 그 작업만 버린다. 실패해도 runner를 닫지 않는다.
  - `conversation/store.ts` `parse`: `task.done`을 검증한다.
  - `conversation/seenEvents.ts` `toSee`: `task.done`을 뺀다. 턴 뒤에 쓴 기록이 본 대화를 다시 안 본 대화로 만들지 않게 하기 위해서다.
  - `conversation/types.ts`: 새 이벤트 종류와 진행 push 타입.
  - Codex(`transport.ts`의 Codex 부분, `dispatcher.ts`): `collabAgentToolCall`, `subAgentActivity`, `subagentStart`/`subagentStop` 가운데 T1에서 실제로 오는 것을 읽는다. 지금 Doan은 다른 `threadId`의 알림을 버리고 collab 항목을 활동으로도 만들지 않는다.
- **app (renderer)**:
  - `threadItems.ts`: 작업 행 항목을 만든다. 같은 `callId`의 Agent 활동 단계를 작업 행으로 바꾸고, 그 자리에서 활동 그룹을 끊는다. 진행 push, 기록된 `task.done`, 활동 단계를 합친다.
  - `ConversationThread.tsx`: 펼칠 수 있는 작업 행(활동 줄과 같은 펼침 버튼). 백그라운드 줄은 안내 문장과 Stop만 그대로 둔다. 경과 시간은 renderer가 시작 시각에서 센다.
  - `turnStatus.ts`: `lastSeq`에서 `task.done`을 뺀다(`canvas.drawn`, `activity.result`와 같은 이유: 턴 안의 기록이 다른 도구의 running stage를 가리지 않게). 작업이 끝날 때의 스크린 리더 문구.
  - `styles.css`: 작업 행.
- **CLI, 스킬, 가이드**: 바뀌지 않는다.

## 작업 목록 규칙 (리듀서)

- 행은 `task_started`나 레벨 신호(`background_tasks_changed`)에 처음 나올 때 생긴다. foreground Agent(`is_backgrounded: false`)는 레벨 신호에 없으므로 `task_started`로만 생긴다.
- 숫자는 `task_progress`가 채운다. `is_backgrounded`는 `task_updated`의 patch로 바뀔 수 있다.
- 끝남은 `task_notification`이 정한다. 레벨 신호에서 빠졌다는 것만으로는 끝남을 기록하지 않는다. 레벨 신호는 아직 도는지와 백그라운드 줄의 수명에만 쓴다.
- `run_id`가 지금 보이는 것보다 앞서는 프레임은 늦은 프레임으로 버린다(SDK 주석). 같은 `taskId`의 끝남은 한 번만 기록한다.
- `ambient`는 보이지 않는다.
- `local_bash`는 `is_backgrounded: true`일 때만 행이 된다(`task_updated` patch로 바뀌면 그때부터). 서브에이전트 안의 작업(`owned_by_subagent: true` 또는 `parent_task_id`)은 행이 되지 않지만, 레벨 신호에 있으면 백그라운드 줄의 수명에는 센다.
- 설명은 `task_started`의 `description`에서만 읽는다. `task_progress.description`은 지금 단계 문구다(PoC 결과 4).
- `run_id`가 없는 버전(2.1.284)에서는 늦은 프레임을 거르지 않는다.
- 끝남 알림이 없는 경로(spec '끝남 알림이 없는 경로'):
  - Doan이 멈춘 경우(턴 Stop, 줄의 Stop)는 프로세스가 사라질 때 아직 열린 작업을 `stopped`로 기록한다. 멈춤을 Doan이 시작했다는 사실은 service가 안다(`stopping`).
  - 그 밖의 경우(크래시, 로그아웃, Restart to Update, 앱 종료)는 열린 작업을 기록 없이 지운다.

## 이벤트와 기록

- **진행 중**: 메모리 전용 push에만 있다. 이벤트 파일에 쓰지 않는다.
- **끝남**: 대화 이벤트 `task.done` 하나를 쓴다. envelope가 이미 `turnId`를 가지므로 필드에 넣지 않는다.
  - 필드: `taskId`, `toolUseId?`(Agent 활동의 `callId`와 잇는다), `description`, `kind`(`agent`·`command`), `subagentType?`, `status`(`completed`·`failed`·`stopped`), `toolUses?`, `durationMs?`
  - `summary`, `output_file`, 토큰 수는 저장하지 않는다.
  - 턴 뒤에 끝난 작업도 띄운 턴의 id로 쓴다(위 service의 따로 울타리를 친 쓰기).
- **되돌림 비용**: 이전 빌드의 `store.ts` `parse`는 모르는 이벤트 종류에서 "Invalid conversation event"를 내고 그 대화를 읽지 못한다. ARCHITECTURE §7이 `activity.result`, `canvas.drawn`에서 이미 받아들인 비용과 같다. 승격 때 그 문단에 더한다.

## 종류와 표시

- `task_type`(`background_tasks_changed`)와 `subagent_type`(`task_started`)로 나눈다. `local_agent`는 서브에이전트, `local_bash`는 명령이다. 그 밖의 값(`monitor`, `mcp_task`, workflow 등)은 T1에서 실제로 오는 것을 보고 정하고, 정하지 않은 값은 보이지 않는다.
- 종류는 표시 문구가 아니라 종류 필드로 가른다(postmortem 2026-11-06).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- Claude 작업 리듀서: `task_started`, `task_progress`, `task_updated`, `task_notification`, `background_tasks_changed`를 받아 작업 목록과 기록할 끝남을 만든다(위 '작업 목록 규칙').
  - 레벨 신호와 `task_*`의 순서가 뒤바뀌어도 같은 목록이 된다.
  - 병렬 시작과 순서가 다른 끝남(postmortem 2026-11 "turn indicator said working for the 6 s")
  - 늦은 `run_id`, 중복 끝남, `ambient`, 모르는 `task_type`, `parent_task_id`
  - Doan이 멈춘 경우와 그 밖의 경우의 열린 작업 처리
- `threadItems.ts`의 작업 행: Agent 활동 단계와의 합치기(`callId`·`toolUseId`), 활동 그룹 끊기, 진행 push와 기록된 끝남의 합치기, 작업 프레임 없는 Agent 호출(단계로 남음), 재시작 뒤 모습(기록 있음, 기록 없음)
- `task.done` 검증(`store.ts`)과 `toSee`·`lastSeq`에서의 제외
- 스크린 리더 문구와 묶기(`turnStatus.ts`)
- Codex 항목 리듀서(T1에서 확인한 만큼)

## 형식, 규약, 결정에 미치는 영향

- **형식**: 앱 로컬 대화 이벤트에 `task.done`이 하나 늘고, Agent `activity`에 `callId`가 붙는다(위 '되돌림 비용'). 공유 JSON Schema, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`은 바뀌지 않는다.
- **규약(ARCHITECTURE §1)**: 없다.
- **결정**:
  - PRODUCT §5 item 3의 진행 표시 금지 문장들이 바뀐다(spec '바뀌는 PRODUCT와 ARCHITECTURE 문장'). 사용자가 이 feature에서 정했다.
  - Out of scope 4: Doan은 요청을 보내지 않는다. 모델 요약을 켜지 않는다. 다만 작업이 끝날 때 프로세스를 끊는 규칙을 없애고, Claude Code가 여는 보고 턴을 새 좁은 예외로 둔다(사용자가 이 feature에서 정했다). 보고 턴은 사람 메시지로 시작한 턴의 백그라운드 작업에서만 열리고, 보고 턴이 다시 띄운 백그라운드 작업은 또 보고 턴을 열 수 있는지 T1b에서 확인하고 정한다.
  - ARCHITECTURE §7 'Background work after a done turn'의 끊기 규칙, 'Ending a finished turn's process'의 다음 send 처리, 대화가 실행 중이 아닌 것으로 보는 규칙(slots, 사이드바, Delete, Restart to Update)이 바뀐다. 보고 턴이 열리면 대화는 실행 중이다.
  - 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다.
- **보안**: `description`과 `subagent_type`은 에이전트가 쓴 신뢰하지 않는 텍스트다. 텍스트로만 그리고, `storableText`로 정리한 뒤 512자로 자른다(`claudeToolSummary`와 같다).

## PoC (T1)

격리된 실제 앱이나 `.scratch/`의 짧은 probe에서 다음을 확인한다. 실제 에이전트 로그인은 AGENTS.md 'Real agent sign-ins'대로 복사본으로 쓰고, 끝나면 임시 홈과 복사한 인증, 임시 Keychain 항목을 지운다.

- Claude Code(최소 2.1.284와 지금 설치된 버전):
  - 턴 안 Agent 호출, `run_in_background` 서브에이전트, 백그라운드 명령 각각에서 오는 `task_*`와 `background_tasks_changed`의 순서와 필드
  - `task_progress`의 빈도, `tool_uses`와 `last_tool_name`이 실제로 채워지는지, 명령 작업에 `usage`가 있는지
  - 마지막 작업이 끝날 때 프로세스를 끊기 전에 `task_notification`이 오는지
  - Doan이 끊는 세 경로(턴 Stop, 줄의 Stop, 다음 send)에서 `stopped` 알림이 오는지
  - `task_type`의 실제 값
- Codex 앱 서버(최소 0.158.0과 지금 설치된 버전):
  - `collabAgentToolCall`, `subAgentActivity`, `subagentStart`/`subagentStop`이 0.158.0에도 있는지
  - 실제 서브에이전트 턴에서 어느 것이 오고, 설명과 상태를 어디서 읽는지
- 결과를 이 문서의 'PoC 결과'에 적는다. 쓸 만한 프레임은 `app/src/main/conversation/fixtures/`의 fixture로 남긴다.

## PoC (T1b): 보고 턴과 살려 둔 send

T1 뒤 사용자가 보고 턴 허용과, 작업을 살려 둔 send를 정했다. 구현 전에 같은 방식(`.scratch/subagent-progress/`, 복사한 로그인)으로 Claude Code 2.1.332와 2.1.284에서 다음을 확인한다.

- 턴의 `result` 뒤 입력을 열어 둔 채 기다리면, 마지막 백그라운드 작업이 끝날 때 CLI가 스스로 보고 턴을 여는지. 그 턴의 프레임(`init`, 사람 프롬프트 echo 유무, `result`)과, Doan이 그것을 사람 메시지 없는 턴으로 가려낼 표식
- 입력을 열어 둔 동안 프로세스가 스스로 끝나는지, 다음 메시지 제안(suggestion) 대기와 어떻게 겹치는지
- 백그라운드 작업이 도는 중에 사람 메시지를 입력에 넣으면: 새 턴으로 읽히는지, 작업이 계속 도는지, 작업이 그 턴 중에 끝나면 알림이 그 턴 안으로 들어가는지 따로 보고 턴이 열리는지
- 보고 턴이 도는 중에 사람 메시지를 넣으면 steer가 되는지 다음 턴이 되는지
- 보고 턴이 권한이나 질문을 요청할 수 있는지, 보고 턴이 다시 백그라운드 작업을 띄우면 또 보고 턴이 열리는지
- 결과를 이 문서의 'PoC 결과 (T1b)'에 적는다.

## postmortem에서 가져온 주의점

- 2026-11 "Copilot started search, glob and `sleep 6` together … the turn indicator said working": 호출마다 상태를 따로 두면 병렬과 순서가 다른 끝남에서 틀린다. 아직 도는 작업의 집합을 두고, 모든 끝남 경로가 그 집합에서 뺀다. 병렬 시작과 순서가 다른 끝남을 테스트한다.
- 2026-11-06 "the turn indicator told a Codex listing from a file read by `summary === "Reading files"`": 작업의 종류를 표시 문구로 가리지 않는다. 종류 필드로 가린다.

## 열린 질문 (드래프트에서)

- 명령 작업의 행에 에이전트가 쓴 `description`을 보여 줄지. 지금 활동 규칙은 명령의 설명을 저장하지도 보여 주지도 않는다(`claudeActivity` 주석).

## 드래프트 요청

- Claude Code 2.1.332는 Agent를 기본으로 백그라운드로 띄우므로(PoC 결과 1), `background` 프레임과 보고 턴이 주 경우다.
- Codex 행은 설명 대신 이름(`agentPath` 마지막 이름)과 상태만 있다.

`/design-draft subagent-progress`로 새 드래프트를 그린다. Claude 데스크톱 앱과 Codex 데스크톱 앱의 서브에이전트 표시를 참고한다. 두 앱의 화면은 기억으로 그리지 않는다. 드래프트를 그릴 때 실제 화면이나 문서를 확인하고, 그 출처와 확인 여부를 드래프트 머리말에 적는다(AGENTS.md 'Leave evidence for references').

- **프레임**:
  - `in-turn`: 턴 안의 서브에이전트 하나, 여럿이 함께 도는 경우, 끝남, 실패, 멈춤, 인디케이터와 함께 보이는 모습, 활동 그룹이 끊긴 모습
  - `expanded`: 펼친 행(서브에이전트, 명령, Codex의 상태만 있는 행)
  - `background`: 턴이 끝난 뒤 행들이 계속 도는 모습과 백그라운드 줄, 작업 하나가 먼저 끝난 경우, Stopping, 작업이 도는 중에 보낸 사람 메시지, 모든 작업이 끝난 뒤 열린 보고 턴
  - `history`: 재시작 뒤 기록이 있는 행과 기록이 없어 활동 단계로 남은 경우
  - `widths`: 캔버스 패널 280·기본, 프로토타입 창, Overview 720. 280에서 무엇이 먼저 잘리는지
  - `copy`: 문구와 스크린 리더 상태
- **정할 것**: 행 높이(한 줄 고정), 작업이 많을 때(예: 10개 병렬)의 상한이나 접기, 행이 생기거나 끝날 때 따라가기와 Jump to latest가 지금 규칙을 따르는지, 위 '열린 질문'.
- 문구는 `clarify` 프리셋으로 정한다.

## 읽은 design preset

- `shape`: 기존 화면을 넓히는 경우. 스레드의 시각 체계(활동 줄, 백그라운드 줄)를 이어받고, 새로 정할 것은 작업 행과 그 상태다.

## PoC 결과

T1 뒤 사용자 결정(2026-11-26): 최소 버전의 늦은 마지막 알림은 기다리지 않고 기록하지 않는다. 명령은 백그라운드 명령만 행이 된다. Codex는 이름과 상태로 보인다. 보고 턴을 허용하고, 작업이 도는 중의 send는 작업을 살려 둔다(spec '확정한 결정'). 아래 '설계에 미치는 영향'의 결정 필요 항목은 이것으로 정해졌다.

2026-11-26에 `.scratch/subagent-progress/`의 probe로 확인했다.

- **버전**: Claude Code 2.1.332(설치본)와 2.1.284(최소, `.scratch/provider-usage/clis/`), Agent SDK 0.3.312(`app/node_modules`). Codex 0.171.0(설치본)과 0.158.0(최소, 같은 곳).
- **실행 방식**: `claude-probe.mjs`는 `runners.ts` `openClaude`처럼 SDK `query`를 열린 입력으로 돌린다. 결과가 오면 입력을 닫고, 결과 뒤 레벨 신호가 비는 tick에 그룹을 SIGKILL한다. stdout 원문도 따로 기록해, SDK가 넘긴 프레임과 비교했다. `codex-probe.mjs`는 `openCodex`처럼 `codex app-server`를 띄우고 `initialize`(experimentalApi)와 `thread/start`를 보낸다. 모델은 Claude `haiku`, Codex 기본 모델(effort low)이다.
- **기록 파일**:
  - Claude: `claude/<버전>-<경우>.json`. 버전은 `332`·`284`이고, 경우는 `fg`, `fgexplicit`(332만), `bgagent`, `bgbash`, `parallel`, `bgparallel`, `fgbash`, `stopturn`, `interrupt`, `linestop`, `nextsend`다. 실행 로그는 `claude/332-run1.log`, `332-run2.log`, `284-run.log`에 있다.
  - Codex: `codex/171-subagent.json`, `codex/158-subagent.json`, 생성한 스키마는 `codex/schema-0.171.0/`, `codex/schema-0.158.0/`에 있다.
  - 줄인 fixture 후보는 `fixture-candidates/claude-tasks.json`, `codex-subagent.json`이다(`make-fixtures.mjs`로 만들었고, `app/`에는 아직 넣지 않았다).
- 모든 경우에 stdout 원문과 SDK가 넘긴 `system` 프레임이 같았다. SDK가 abort 뒤에 버린 프레임은 없었다.

### Claude Code

1. **턴 안 Agent**(`332-fgexplicit`, `284-fg`): `task_started`(`is_backgrounded: false`, `task_type: local_agent`, `subagent_type`, `spawn_depth: 1`, `tool_use_id`) → 서브에이전트 도구마다 `task_progress` → `task_updated`(`patch.status: completed`, `end_time`) → `task_notification`(`completed`, `usage`) 순서로 왔다. 레벨 신호에는 나오지 않았다. 턴의 `result`는 끝남 알림 뒤에 왔다.
   - **2.1.332에서는 `run_in_background`를 빼면 Agent가 백그라운드로 뜬다**(`332-fg`: 입력에 `run_in_background`가 없고 `is_backgrounded: true`). 레벨 신호에 들어가고, 턴은 "알림이 오면 답하겠다"는 말로 끝난다. 서브에이전트가 끝나 집합이 비면 Doan이 그룹을 끊으므로, 에이전트는 그 결과를 사람에게 전하지 못한다. 2.1.284에서는 모델이 `run_in_background: false`를 넣어 빠진 경우를 재현하지 못했다(미확인).
2. **백그라운드 서브에이전트**(`332-bgagent`, `284-bgagent`): 레벨 신호(`task_type: local_agent`)가 `task_started`(`is_backgrounded: true`)보다 먼저 온다. `result` 뒤에도 `task_progress`가 이어지고, 끝에 `task_updated` → `task_notification`(`completed`)이 온다.
3. **백그라운드 명령**(`332-bgbash`, `284-bgbash`): 레벨 신호(`local_bash`) → `task_started`(`is_backgrounded: true`) → 끝에 `task_updated` → `task_notification`이 온다. **`task_progress`는 한 번도 오지 않았고, 끝남 알림에도 `usage`가 없다.** `summary`는 CLI가 만든 문장이다(예: `Background command "…" completed (exit code 0)`). 2.1.284는 입력을 닫은 뒤 약 5.2초에 이 명령을 `killed`/`stopped`로 끝냈다(8초 명령, 실행 1회).
4. **필드와 빈도**:
   - `task_progress`는 서브에이전트가 도구를 하나 시작할 때마다 한 번 온다. `usage.tool_uses`는 1씩 늘어나는 누적값이고, `last_tool_name`은 매번 채워졌다(`Read`, `Bash`, `ToolSearch`). `summary`는 오지 않았다(`agentProgressSummaries`를 켜지 않았다).
   - **`task_progress.description`은 작업 설명이 아니라 지금 단계의 문구다**(`Reading a.txt`, `Running Wait 6 seconds`). 작업 설명은 `task_started`의 `description`이다.
   - `tool_use_id`는 모든 `task_*`에서 Agent `tool_use`의 `id`와 같다(`task_updated`에는 없다). 레벨 신호 항목에는 `tool_use_id`가 없다.
   - 실제로 본 `task_type`은 `local_agent`, `local_bash` 두 가지다. `ambient`는 한 번도 오지 않았다.
   - 2.1.284에는 `run_id`와 `parent_task_id`가 없고, 레벨 신호 항목에 `subagent_type`도 없다.
   - **서브에이전트 안의 명령도 맨 위 `task_*`로 온다**: `owned_by_subagent: true`, `task_type: local_bash`, 332에서는 `parent_task_id`가 붙는다. 서브에이전트가 백그라운드로 돌린 명령은 레벨 신호에도 들어간다(332는 `parent_task_id`가 붙는다). `owned_by_subagent`와 `summary_is_report`는 SDK 0.3.312 타입에 없다.
   - **턴 안에서 약 3초를 넘긴 foreground 명령도 작업이 된다**(`332-fgbash`, `284-fgbash`): 명령 시작 약 3초 뒤 `task_started`(`local_bash`, `is_backgrounded: false`)가 오고, 끝나면 `task_notification`만 온다. 레벨 신호와 `task_updated`는 없다. 서브에이전트 안의 긴 foreground 명령도 같다.
   - **병렬 둘**(`332-parallel`, `284-parallel`, `332-bgparallel`, `284-bgparallel`): `task_started`가 시작 순서대로 오고, 끝남은 늦게 시작한 쪽이 먼저 왔다. 작업마다 `task_updated` → `task_notification` 쌍으로 따로 끝난다.
5. **턴 뒤 마지막 작업의 끝남과 끊기의 순서**:
   - 2.1.332: 매번 `task_updated` → `task_notification` → 빈 레벨 신호가 1 ms 안에 이 순서로 왔다(`332-bgagent`, `332-bgbash`, `332-bgparallel`). 알림은 Doan이 끊기 전에 처리된다.
   - **2.1.284: 순서가 반대다.** 빈 레벨 신호가 먼저 오고 `task_updated`와 `task_notification`이 2-3 ms 뒤에 왔다(`284-bgagent`, `284-bgbash`, `284-bgparallel`, `284-nextsend`의 Agent). 이번 실행에서는 CLI가 이미 파이프에 써 둔 덕에 SIGKILL 뒤에도 알림이 도착했지만, 보장된 순서가 아니다.
6. **Doan이 끊는 경로**:
   - **턴 Stop**(`runners.ts` `stop()`: abort, 입력 닫기, SIGTERM, 0.5초 뒤 SIGKILL; `332-stopturn`, `284-stopturn`): 서브에이전트 안의 백그라운드 명령은 `stopped` 알림과 `task_updated`(`killed`)를 받았다(332). foreground 서브에이전트 자신은 332에서 끝남 알림이 없었고, 284에서는 SIGTERM 0.1초 뒤 `completed`로 끝났다.
   - **SDK `interrupt()`**(`332-interrupt`, `284-interrupt`; Doan은 턴 Stop에 쓰지 않는다): 서브에이전트와 그 명령 모두 `task_updated`(`killed`) → `task_notification`(`stopped`)을 받았고, `result`는 `error_during_execution`이다.
   - **줄의 Stop**(abort와 SIGTERM, 0.5초 뒤 SIGKILL; `332-linestop`, `284-linestop`): 백그라운드 명령(메인과 서브에이전트 것)은 `stopped` 알림을 받았다. **백그라운드 서브에이전트는 두 버전 모두 끝남 알림이 없었다.**
   - **다음 send**(SIGTERM만, 0.5초 뒤 SIGKILL; `332-nextsend`, `284-nextsend`): 명령은 `stopped` 알림을 받았다. 백그라운드 서브에이전트는 명령이 죽은 뒤 스스로 마무리해 **`completed`로** 끝났다(SIGTERM 뒤 0.26초와 0.36초).

### Codex

- 0.171.0과 0.158.0의 동작이 같았다(`codex/171-subagent.json`, `codex/158-subagent.json`).
- **스폰은 `collabAgentToolCall`이 아니라 `subAgentActivity`로 온다.** 메인 `threadId`의 `item/started`·`item/completed`에 `kind: started`, `agentThreadId`, `agentPath`(모델이 붙인 이름, 예: `/root/colors`)가 담겨 온다. 끝나면 같은 메인 스레드에 `kind: completed`(id `subagent-completed-…`)가 온다. 0.171.0은 `model`, `reasoningEffort`, `startedAtMs`, `completedAtMs`도 준다.
- `collabAgentToolCall`은 메인 에이전트의 `wait`에만 왔다(`tool: wait`, `status: inProgress` → `completed`, `receiverThreadIds: []`, `agentsStates: {}`). `spawnAgent` 항목은 오지 않았다.
- 서브에이전트 자신의 `turn/started`, 항목, `turn/completed`, `thread/status/changed`는 `agentThreadId`로 온다. 지금 Doan은 이를 버린다.
- **설명과 프롬프트는 어디에도 없다.** 읽을 수 있는 것은 `agentPath`의 마지막 이름과 `kind`(스키마 값: `started`·`interacted`·`interrupted`·`completed`)뿐이다.
- **`subagentStart`/`subagentStop`은 서브에이전트 알림이 아니라 훅 이벤트 이름(`HookEventName`)이다.** 두 버전의 스키마에 모두 있지만, 훅을 설정하지 않은 턴에서는 오지 않았다.
- `codex app-server generate-json-schema`: 0.158.0에도 `collabAgentToolCall`, `subAgentActivity`(`kind`, `agentThreadId`, `agentPath`), `CollabAgentTool`·`CollabAgentStatus` 값이 0.171.0과 같게 있다. 0.158.0의 `subAgentActivity`에는 `model`과 `reasoningEffort`가 없다.
- 확인하지 않은 경우: Codex 서브에이전트의 중단·실패, 병렬 둘, `wait` 없이 턴이 끝나는 경우.

### 설계에 미치는 영향 (틀린 가정)

- **틀림: "끝나는 작업은 `task_notification` 뒤에 레벨 신호에서 빠지므로, 마지막 알림은 끊기 전에 처리된다"**('영향 범위' runners.ts). 2.1.332에서는 맞지만 2.1.284에서는 빈 레벨 신호가 먼저 온다. 최소 버전에서 알림을 받으려면 빈 집합에서 바로 끊지 말고, 열린 작업의 알림을 짧게 기다린 뒤 끊어야 한다. 그러면 CLI가 16-119 ms 뒤에 부르는 모델 호출과 겹치므로 결정이 필요하다. 다른 길은 284에서 알림 없이 끊긴 작업을 `completed`로 볼 수 없으니 기록 없이 지우는 것이다.
- **틀림: 작업 종류 `local_bash`는 백그라운드 명령뿐이라는 전제.** 턴 안에서 3초를 넘긴 foreground 명령과 서브에이전트 안의 명령도 `local_bash` 작업으로 온다. foreground 명령은 이미 활동 줄의 Bash 단계로 보이므로, 행을 만들지(`is_backgrounded: false`인 `local_bash`) 정해야 한다.
- **보완: 서브에이전트 안의 작업.** 332는 `parent_task_id`, 284는 `owned_by_subagent: true`로만 구별된다(SDK 타입에 없는 필드). 사용자 결정: 이 작업은 행이 되지 않는다(위 '작업 목록 규칙'). 백그라운드로 돈 것은 레벨 신호에도 들어가 백그라운드 줄을 유지한다.
- **보완: `task_progress.description`으로 작업 설명을 덮어쓰지 않는다.** 이 값은 단계 문구다. 리듀서는 설명을 `task_started`에서만 읽는다. 단계 문구를 행에 보일지는 드래프트에서 정한다.
- **보완: 명령 작업에는 숫자가 없다.** `task_progress`도 `usage`도 오지 않으므로 명령 행에는 도구 수가 없고, 경과 시간만 화면 시계로 센다.
- **맞음, 꼭 필요함: Doan이 멈춘 경우 열린 작업을 `stopped`로 기록하는 규칙.** 턴 Stop과 줄의 Stop에서 서브에이전트는 끝남 알림을 받지 못했다. 다음 send에서는 서브에이전트가 `completed`로 끝날 수 있으므로, 먼저 온 끝남만 기록하는 규칙('같은 `taskId`의 끝남은 한 번만')을 그대로 둔다.
- **새 사실: 2.1.332는 `run_in_background`가 없는 Agent 호출을 백그라운드로 띄운다.** 턴 안 서브에이전트로 그린 화면이 실제로는 턴 뒤 행과 백그라운드 줄로 나타나는 일이 잦을 것이다. 이때 에이전트는 결과를 전하지 못한 채 끊긴다(지금 규칙 그대로). 드래프트의 `background` 프레임을 주 경우로 다뤄야 한다.
- **틀림: Codex 항목 가정.** `collabAgentToolCall`의 스폰과 `subagentStart`/`subagentStop`은 오지 않는다. Codex 행은 메인 스레드의 `subAgentActivity`(`started`→`completed`)로 만들 수 있지만, 설명 대신 `agentPath` 이름만 있다. spec '확정한 결정'의 Codex 항목("설명과 상태")은 "이름과 상태"로 고치거나 Codex를 빼야 한다. 사용자 결정이 필요하다.
- **2.1.284에는 `run_id`가 없다.** 늦은 프레임을 `run_id`로 거르는 규칙은 332에서만 동작한다. 없으면 거르지 않는다.
