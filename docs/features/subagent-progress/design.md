# 서브에이전트 진행 — design

## 영향 범위

- **app (main)**:
  - `conversation/transport.ts`(Claude):
    - `system/task_started`, `task_progress`, `task_updated`, `task_notification`을 읽는 순수 함수를 더한다. 지금은 `backgroundTasks`가 `background_tasks_changed`의 `task_id`만 읽는다.
    - Agent 도구의 `activity`에 `callId`를 붙인다. 지금 `callIdOf`는 edit에만 붙는다(`claudeActivity`). 알 수 없는 키는 이전 빌드가 거부하지 않으므로 되돌림 비용이 없다(ARCHITECTURE §7 대화 이벤트 문단).
    - Agent의 `activity`는 assistant 프레임에서 먼저 저장되고 `task_started`는 그 뒤에 온다(`fixtures/claude-thinking.json` 'task'). 그래서 단계를 작업으로 "넘기지" 않는다. 활동 이벤트는 지금처럼 저장하고, renderer가 같은 `callId`·`toolUseId`로 단계를 작업 행으로 합친다.
    - `parent_tool_use_id`가 있는 프레임은 지금처럼 버린다(`normalizeClaude`, `runners.ts`). 서브에이전트 안의 단계는 보이지 않는다(비목표).
  - `conversation/runners.ts`: 턴 안과 터미널 뒤의 작업 프레임을 리듀서로 넘긴다. 지금 `normalizeClaude`는 터미널 뒤 프레임을 버린다(`state.terminal`). 작업 프레임은 그 앞에서 따로 읽는다. 빈 집합이 된 tick에 프로세스를 끊는 규칙은 그대로다. SDK는 끝나는 작업이 `task_notification` 뒤에 레벨 신호에서 빠진다고 적으므로, 마지막 알림은 끊기 전에 처리된다(T1에서 확인).
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
- 끝남 알림이 없는 경로(spec '끝남 알림이 없는 경로'):
  - Doan이 멈춘 경우(턴 Stop, 줄의 Stop, 다음 send)는 프로세스가 사라질 때 아직 열린 작업을 `stopped`로 기록한다. 멈춤을 Doan이 시작했다는 사실은 service가 안다(`stopping`, `endAfterTurn`).
  - 그 밖의 경우(크래시, 로그아웃, Restart to Update, 앱 종료)는 열린 작업을 기록 없이 지운다.

## 이벤트와 기록

- **진행 중**: 메모리 전용 push에만 있다. 이벤트 파일에 쓰지 않는다.
- **끝남**: 대화 이벤트 `task.done` 하나를 쓴다. envelope가 이미 `turnId`를 가지므로 필드에 넣지 않는다.
  - 필드: `taskId`, `toolUseId?`(Agent 활동의 `callId`와 잇는다), `parentTaskId?`, `description`, `kind`(`agent`·`command`), `subagentType?`, `status`(`completed`·`failed`·`stopped`), `toolUses?`, `durationMs?`
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
  - Out of scope 4: Doan은 요청을 보내지 않는다. 모델 요약을 켜지 않는다. 작업이 끝날 때 프로세스를 끊는 규칙은 그대로다.
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

## postmortem에서 가져온 주의점

- 2026-11 "Copilot started search, glob and `sleep 6` together … the turn indicator said working": 호출마다 상태를 따로 두면 병렬과 순서가 다른 끝남에서 틀린다. 아직 도는 작업의 집합을 두고, 모든 끝남 경로가 그 집합에서 뺀다. 병렬 시작과 순서가 다른 끝남을 테스트한다.
- 2026-11-06 "the turn indicator told a Codex listing from a file read by `summary === "Reading files"`": 작업의 종류를 표시 문구로 가리지 않는다. 종류 필드로 가린다.

## 열린 질문 (드래프트에서)

- 명령 작업의 행에 에이전트가 쓴 `description`을 보여 줄지. 지금 활동 규칙은 명령의 설명을 저장하지도 보여 주지도 않는다(`claudeActivity` 주석).
- `parentTaskId`가 있는 작업의 배치(부모 아래 들여쓰기 또는 평평하게).

## 드래프트 요청

`/design-draft subagent-progress`로 새 드래프트를 그린다. Claude 데스크톱 앱과 Codex 데스크톱 앱의 서브에이전트 표시를 참고한다. 두 앱의 화면은 기억으로 그리지 않는다. 드래프트를 그릴 때 실제 화면이나 문서를 확인하고, 그 출처와 확인 여부를 드래프트 머리말에 적는다(AGENTS.md 'Leave evidence for references').

- **프레임**:
  - `in-turn`: 턴 안의 서브에이전트 하나, 여럿이 함께 도는 경우, 끝남, 실패, 멈춤, 인디케이터와 함께 보이는 모습, 활동 그룹이 끊긴 모습
  - `expanded`: 펼친 행(서브에이전트, 명령, Codex의 상태만 있는 행)
  - `background`: 턴이 끝난 뒤 행들이 계속 도는 모습과 백그라운드 줄, 작업 하나가 먼저 끝난 경우, Stopping, 줄이 사라진 뒤
  - `history`: 재시작 뒤 기록이 있는 행과 기록이 없어 활동 단계로 남은 경우
  - `widths`: 캔버스 패널 280·기본, 프로토타입 창, Overview 720. 280에서 무엇이 먼저 잘리는지
  - `copy`: 문구와 스크린 리더 상태
- **정할 것**: 행 높이(한 줄 고정), 작업이 많을 때(예: 10개 병렬)의 상한이나 접기, 행이 생기거나 끝날 때 따라가기와 Jump to latest가 지금 규칙을 따르는지, 위 '열린 질문'.
- 문구는 `clarify` 프리셋으로 정한다.

## 읽은 design preset

- `shape`: 기존 화면을 넓히는 경우. 스레드의 시각 체계(활동 줄, 백그라운드 줄)를 이어받고, 새로 정할 것은 작업 행과 그 상태다.
