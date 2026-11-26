# 서브에이전트 진행 — design

## 영향 범위

- **app (main)**:
  - `conversation/transport.ts`(Claude):
    - `system/task_started`, `task_progress`, `task_notification`, `task_updated`를 읽는 순수 함수를 더한다. 지금은 `backgroundTasks`가 `background_tasks_changed`의 `task_id`만 읽는다.
    - `claudeActivity`: Agent 도구의 `tool_use`는 활동 단계 대신 작업으로 넘긴다. 작업과 도구 호출은 `tool_use_id`로 잇는다.
    - `parent_tool_use_id`가 있는 프레임은 지금처럼 버린다. 서브에이전트 안의 단계는 보이지 않는다(비목표).
  - `conversation/runners.ts`: 턴 안에서는 작업 상태를 이벤트로 보내고, 터미널 뒤에는 지금처럼 계속 읽는다. `background_tasks_changed`는 레벨 신호이므로 `task_*`와 짝짓지 않는다(SDK 주석, ARCHITECTURE §7 'Background work after a done turn'). 행의 목록은 레벨 신호가 정하고, 숫자와 끝난 상태는 `task_*`가 채운다.
  - `conversation/service.ts`: 살아 있는 항목의 `background`에 작업 목록(설명, 종류, 숫자)을 더한다. 메모리에만 있다.
  - `conversation/store.ts` `parse`: 끝난 작업 이벤트를 검증한다.
  - `conversation/types.ts`: 새 이벤트 종류와 IPC 요약의 작업 필드.
  - Codex(`dispatcher.ts`, transport의 Codex 부분): T1 PoC 결과에 따라 정한다.
- **app (renderer)**:
  - `threadItems.ts`: 작업 행 항목을 만든다. 턴 안의 작업은 그 턴의 활동 줄 자리에, 턴 뒤 작업은 지금 백그라운드 줄 자리에 놓인다.
  - `ConversationThread.tsx`: 작업 행과, 작업 행을 가진 백그라운드 줄. 경과 시간은 renderer가 시작 시각에서 센다(초마다 다시 그리기). 숫자는 main이 보낸 마지막 값이다.
  - `turnStatus.ts`: 작업이 시작하거나 끝날 때 스크린 리더 상태 문구.
  - `styles.css`: 작업 행.
- **CLI, 스킬, 가이드**: 바뀌지 않는다.

## 이벤트와 기록

- **진행 중**: IPC 요약(`conversation:list`의 항목, 스레드 구독)에만 있다. 이벤트 파일에 쓰지 않는다. `task_progress`는 자주 오므로 디스크에 쓰지 않는다.
- **끝남**: `task_notification`을 받으면 대화 이벤트 하나를 쓴다. 이름은 `task.done`을 제안한다.
  - 필드: `taskId`, `turnId`, `description`, `kind`(`agent`·`command`), `subagentType?`, `status`(`completed`·`failed`·`stopped`), `toolUses?`, `durationMs?`
  - `summary`, `output_file`, 토큰 수는 저장하지 않는다. `summary`는 서브에이전트가 쓴 결과 글이라 길고, 신뢰하지 않는 텍스트다.
  - 턴 뒤에 끝난 작업도 그 작업을 띄운 턴의 `turnId`로 쓴다.
  - Doan이 작업이 끝날 때 프로세스를 끊으므로(PRODUCT §5 item 3 'Background work line', Out of scope 4), 마지막 작업의 `task_notification`이 프로세스가 끊기기 전에 오는지 T1에서 확인한다. 오지 않으면 레벨 신호에서 빠진 것을 `completed`로 쓸지 정한다.
- **되돌림 비용**: 이전 빌드의 `store.ts` `parse`는 모르는 이벤트 종류에서 "Invalid conversation event"를 내고 그 대화를 읽지 못한다. ARCHITECTURE §7이 `activity.result`, `canvas.drawn`에서 이미 받아들인 비용과 같다. 승격 때 그 문단에 더한다.

## 종류와 표시

- `task_type`(`background_tasks_changed`)와 `subagent_type`(`task_started`)로 나눈다. `local_agent`는 서브에이전트, `local_bash`는 명령이다. 그 밖의 값(`monitor`, `mcp_task`, workflow 등)은 T1에서 실제로 오는 것을 보고 정하고, 정하지 않은 값은 보이지 않는다.
- 명령 작업의 설명은 에이전트가 쓴 `description`이다. 명령 텍스트는 보여 주지 않는다. 지금 활동 규칙("a shell command's text, description or arguments never go in it", `transport.ts` `claudeActivity` 주석)과 맞춰야 하므로, 명령 작업의 설명을 보여 줄지는 아래 '열린 질문'에 둔다.
- `parent_task_id`가 있는 작업(서브에이전트가 띄운 작업)은 부모 행 아래에 들여 놓을지, 평평하게 둘지 드래프트에서 정한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- Claude 작업 프레임 리듀서: `task_started`, `task_progress`, `task_notification`, `task_updated`, `background_tasks_changed`를 차례로 받아 작업 목록을 만든다.
  - 레벨 신호와 `task_*`의 순서가 뒤바뀌어도 같은 목록이 된다.
  - `run_id`가 지금 보이는 것보다 앞서는 프레임은 늦은 프레임으로 버린다(SDK 주석).
  - `ambient`는 보이지 않는다.
  - 병렬 시작과 순서가 다른 끝남(postmortem 2026-11 "turn indicator said working for the 6 s").
- Agent 도구의 `tool_use`와 작업의 연결: `tool_use_id`로 활동 단계를 작업 행으로 바꾼다. 작업 프레임이 오지 않으면 지금처럼 단계로 남는다.
- `task.done` 이벤트 검증(`store.ts`)과 `threadItems.ts`의 작업 행 만들기(진행 중 요약과 기록된 끝남의 합치기, 재시작 뒤 모습).
- 스크린 리더 상태 문구(`turnStatus.ts`).
- Codex: T1 결과에 따라 같은 리듀서 모양.

## 형식, 규약, 결정에 미치는 영향

- **형식**: 앱 로컬 대화 이벤트에 `task.done`이 는다(위 '되돌림 비용'). 공유 JSON Schema, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`은 바뀌지 않는다.
- **규약(ARCHITECTURE §1)**: 없다.
- **결정**:
  - PRODUCT §5 item 3 'Background work line'의 "No sweep, spinner or output of the work shows"가 바뀐다. 사용자가 이 feature에서 정했다.
  - Out of scope 4: Doan은 요청을 보내지 않는다. 모델 요약을 켜지 않는다. 작업이 끝날 때 프로세스를 끊는 규칙은 그대로다.
  - 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다.
- **보안**: `description`과 `subagent_type`은 에이전트가 쓴 신뢰하지 않는 텍스트다. 텍스트로만 그리고, 길이를 자른다(`storableText`, 512).

## PoC (T1)

격리된 실제 앱이나 `.scratch/`의 짧은 probe에서 다음을 확인한다. 실제 에이전트 로그인 사용은 AGENTS.md 'Real agent sign-ins'를 따른다.

- Claude Code(최소 2.1.284와 지금 설치된 버전): 턴 안 Agent 호출과 `run_in_background` 서브에이전트, 백그라운드 명령 각각에서 오는 `task_*`와 `background_tasks_changed`의 순서와 필드. 특히 `task_progress`가 얼마나 자주 오는지, `tool_uses`와 `last_tool_name`이 실제로 채워지는지.
- 마지막 작업이 끝날 때 Doan이 프로세스를 끊기 전에 `task_notification`이 오는지.
- Codex 앱 서버(최소 0.158.0과 지금 설치된 버전): 서브에이전트(또는 그에 해당하는 항목)의 시작, 진행, 끝남을 알리는 알림이 있는지와 그 필드. 없으면 Codex는 이번 범위에서 빠지고 BACKLOG에 적는다.
- 결과를 이 문서의 'PoC 결과'에 적는다. 쓸 만한 프레임은 `app/src/main/conversation/fixtures/`의 fixture로 남긴다.

## postmortem에서 가져온 주의점

- 2026-11 "Copilot started search, glob and `sleep 6` together … the turn indicator said working": 호출마다 상태를 따로 두면 병렬과 순서가 다른 끝남에서 틀린다. 아직 도는 작업의 집합을 두고, 모든 끝남 경로가 그 집합에서 뺀다. 병렬 시작과 순서가 다른 끝남을 테스트한다.
- 2026-11-06 "the turn indicator told a Codex listing from a file read by `summary === "Reading files"`": 작업의 종류를 표시 문구로 가리지 않는다. 종류 필드로 가린다.

## 열린 질문 (`/feature-review` 또는 드래프트에서)

- 명령 작업의 행에 에이전트가 쓴 `description`을 보여 줄지. 지금 활동 규칙은 명령의 설명을 저장하지도 보여 주지도 않는다.
- `parent_task_id`가 있는 작업의 배치(들여쓰기 또는 평평하게).

## 드래프트 요청

`/design-draft subagent-progress`로 새 드래프트를 그린다. Claude 데스크톱 앱과 Codex 데스크톱 앱의 서브에이전트 표시를 참고한다. 두 앱의 화면은 기억으로 그리지 않는다. 드래프트를 그릴 때 실제 화면이나 문서를 확인하고, 그 출처와 확인 여부를 드래프트 머리말에 적는다(AGENTS.md 'Leave evidence for references').

- **프레임**:
  - `in-turn`: 턴 안의 서브에이전트 하나, 여럿이 함께 도는 경우, 끝남, 실패, 멈춤
  - `background`: 턴 뒤의 백그라운드 줄과 작업 행들(서브에이전트와 명령), 작업 하나가 먼저 끝난 경우, Stopping
  - `history`: 재시작 뒤의 끝난 행, 진행 중에 앱이 끝나 기록이 없는 경우
  - `widths`: 캔버스 패널 280·기본, 프로토타입 창, Overview 720
  - `copy`: 문구와 스크린 리더 상태
- 문구는 `clarify` 프리셋으로 정한다.

## 읽은 design preset

- `shape`: 기존 화면을 넓히는 경우. 스레드의 시각 체계(활동 줄, 백그라운드 줄)를 이어받고, 새로 정할 것은 작업 행과 그 상태다.
