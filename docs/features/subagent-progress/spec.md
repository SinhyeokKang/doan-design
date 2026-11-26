# 서브에이전트 진행 — spec

에이전트가 서브에이전트나 백그라운드 명령을 돌리면, 스레드가 작업마다 무엇을 하고 있는지와 어디까지 왔는지를 보여 준다.

## 사용자

- **사람**: 캔버스 패널, Overview, 프로토타입 창에서 대화하는 사람이다. 에이전트가 서브에이전트를 여러 개 띄운 동안 지금 무엇이 몇 개 돌고 있고, 각각 얼마나 진행했고, 끝났는지 실패했는지를 스레드에서 본다.
- **에이전트**: 바뀌지 않는다. CLI, 스킬, 가이드는 그대로다.

## 문제

- 턴이 끝난 뒤 백그라운드 작업이 남으면, 스레드에는 터미널 아이콘과 "Background work is still running. It stops when you send your next message or press Stop." 한 줄, Stop 버튼만 보인다(PRODUCT §5 item 3 'Background work line': "No sweep, spinner or output of the work shows"). 몇 개가 돌고 있는지, 무엇을 하는지, 얼마나 남았는지 알 수 없다(사용자가 대화에서 보여 준 스크린샷).
- 턴 안에서 도는 서브에이전트(Claude Code의 Agent 도구)는 활동 줄의 한 단계로, 에이전트가 쓴 설명 한 줄만 보인다(`transport.ts` `claudeKind`가 Agent를 `"other"`로 만든다). 서브에이전트 안의 프레임(`parent_tool_use_id`가 있는 것)은 모두 버린다.
- Claude Code는 이미 작업마다 다음을 스트림으로 보낸다(`@anthropic-ai/claude-agent-sdk` 0.3.312 `sdk.d.ts`에서 확인):
  - `system/task_started`: `task_id`, `tool_use_id`, `description`, `subagent_type`, `is_backgrounded`
  - `system/task_progress`: `usage`(`total_tokens`, `tool_uses`, `duration_ms`), `last_tool_name`
  - `system/task_notification`: `status`(`completed`·`failed`·`stopped`), `usage`, `summary`
  - `system/background_tasks_changed`: 살아 있는 백그라운드 작업 전체(`task_type`, `subagent_type`, `description`, `parent_task_id`, `ambient`)
- 지금 Doan은 이 가운데 `background_tasks_changed`의 `task_id`만 읽는다(`backgroundTasks`).
- Codex 앱 서버(설치된 0.171.0의 `app-server generate-json-schema`)에는 `collabAgentToolCall`, `subAgentActivity`, `subagentStart`/`subagentStop`이 있다. 도구 사용 수와 시간 필드는 없다. Doan은 지금 이것들을 읽지 않는다.

## 확정한 결정 (사용자)

- **범위**: 턴 안의 서브에이전트와 턴이 끝난 뒤의 백그라운드 작업을 모두 보여 준다. 같은 작업 행 모양을 쓴다. 캔버스 패널, Overview, 프로토타입 창이 같은 규칙을 따른다.
- **사실만**: 행에는 제공자가 주는 사실만 보여 준다: 설명, 종류(서브에이전트, 명령), 도구 사용 수, 경과 시간, 지금 쓰는 도구, 끝난 상태(끝남, 실패, 멈춤). 모델이 만드는 진행 요약(Claude Code의 `agentProgressSummaries`)은 켜지 않는다. 사람 계정에 모델 호출이 더 나가기 때문이다. 서브에이전트의 결과 글(`summary`)도 보여 주지 않는다.
- **모르는 값**: 제공자가 주지 않은 숫자는 칸을 숨긴다. 모름과 0을 구분한다(편집 줄 수 규칙과 같다). 경과 시간은 진행 중에는 화면 시계로 세고, 끝나면 제공자가 준 값이 있으면 그 값으로 바꾼다. 형식은 턴 인디케이터와 같다(`1m 0s`).
- **자리**: 행은 그 작업을 띄운 턴의 활동 자리에 있다. 턴이 끝나 백그라운드 줄이 생겨도 옮겨 가지 않는다. 백그라운드 줄은 안내 문장과 Stop만 가진다. 줄이 사라져도, 재시작해도 행은 같은 자리에 있다.
- **활동 줄과의 관계**: 작업 행은 활동 줄 그룹("N steps")을 끊고 자기 행으로 놓인다. 앞뒤 단계는 각각 따로 접힌다.
- **펼치기**: 행은 펼칠 수 있다. 접힌 행은 한 줄이고, 펼치면 설명 전문, 종류, 도구 사용 수, 시간, 마지막 도구, 상태를 보인다. 조작과 포커스는 활동 줄의 펼침 버튼과 같다.
- **턴 인디케이터**: 지금 그대로다. 서브에이전트만 도는 동안에도 인디케이터는 지금처럼 Agent 도구의 요약을 말한다. 작업 행은 인디케이터의 말을 따라 돌지 않고 자기 값만 보인다.
- **끝남 알림이 없는 경로**:
  - 제공자가 `stopped`를 보내면 그대로 기록한다.
  - Doan이 멈춘 경우(턴 Stop, 줄의 Stop)에 제공자 알림이 오지 않으면, 행을 "멈춤"으로 바꾸고 그대로 기록한다.
  - 그 밖의 경우(크래시, 로그아웃, Restart to Update, 앱 종료, 최소 버전에서 늦은 마지막 알림)는 행이 진행 중 상태로 남지 않고 사라지며, 기록하지 않는다. "끝남"을 지어내지 않는다.
- **Stop**: 지금처럼 하나다. 턴의 Stop과 백그라운드 줄의 Stop은 지금 규칙 그대로이고, 작업별 Stop은 없다.
- **보고 턴**: 사람 메시지로 시작한 턴의 백그라운드 작업이 모두 끝나면, Claude Code가 스스로 여는 보고 턴을 끊지 않고 스레드에 보인다. 에이전트가 작업 결과를 사람에게 전하게 하기 위해서다. Claude Code 2.1.332는 `run_in_background` 없는 Agent 호출도 백그라운드로 띄우고 턴을 "알림이 오면 답하겠다"로 끝내므로(PoC 결과 1), 지금처럼 끊으면 결과가 전해지지 않는다. 이것은 Out of scope 4의 새 좁은 예외다(Handoff, 사용 한도와 같은 자리). 보고 턴은 사람의 메시지가 없는 에이전트 턴이고, 그 밖에는 보통 턴과 같다: 실행 중 표시, 권한·질문 요청, Stop, 알림, 안 본 표시, 사용 한도.
- **다음 send**: 백그라운드 작업이 도는 중에 사람이 메시지를 보내면, 작업을 끝내지 않고 살려 둔 채 보낸다. 지금은 다음 send가 작업을 먼저 끝낸다.
- **보고 턴의 반복**: 보고 턴은 맨 위 작업 하나가 끝날 때마다 하나씩 열리고, 보고 턴이 띄운 작업이 끝나면 다시 열린다(PoC 결과 T1b). 사람의 턴이 도는 중에 끝난 작업은 그 턴에 접히고 보고 턴을 열지 않는다. 모델이 그 결과를 말하지 않을 수 있지만, 행이 끝남을 보이므로 받아들인다.
- **보고 턴 중의 send**: 보통 도는 턴과 같다. 큐에 들어가 보고 턴이 끝나면 나가고, Send now는 끼어든다.
- **프로세스 수명**: 백그라운드 작업이 남은 동안과 보고 턴이 끝날 때까지만 입력을 열어 둔다. 그 뒤에는 지금처럼 프로세스를 끝낸다. 작업이 없는 턴 뒤에도 프로세스를 대화 수명 동안 유지하는 것은 사용자가 정했지만 별도 feature로 나눴다(`docs/BACKLOG.md`).
- **최소 버전의 마지막 알림**: Claude Code 2.1.284는 마지막 작업의 끝남 알림이 빈 작업 집합보다 늦게 올 수 있다(PoC 결과 5). Doan은 알림을 기다리지 않는다. 받지 못한 작업은 기록 없이 사라진다.
- **명령 행**: 백그라운드 명령(`is_backgrounded: true`)만 행이 된다. 3초를 넘긴 foreground 명령은 지금처럼 활동 단계와 인디케이터가 보인다. 서브에이전트 안에서 도는 작업(`owned_by_subagent`, `parent_task_id`)은 행을 만들지 않는다. 그 서브에이전트 행의 일부이기 때문이다.
- **기록**: 진행 중인 숫자는 메모리에만 둔다. 작업이 끝나면 그 결과를 대화 이벤트로 한 번 기록한다. 그래서 재시작 뒤에도 무엇이 돌았고 어떻게 끝났는지 남는다. Agent 도구 호출의 활동 이벤트는 지금처럼 저장하고, 표시만 작업 행으로 바뀐다.
- **스크린 리더**: 작업이 끝날 때만 알린다. 같은 render에 여러 작업이 끝나면 하나로 묶는다. 인디케이터 변경이나 백그라운드 줄 알림이 같은 render에 오면 그쪽이 이긴다. 시작은 인디케이터가 이미 말하므로 알리지 않는다.
- **Codex**: 같은 작업 행에 이름과 상태만 보인다. Codex는 설명을 주지 않으므로, 설명 자리에 `subAgentActivity`의 `agentPath` 마지막 이름(예: `colors`)을 보인다. 상태는 `kind`(`started`→도는 중, `completed`→끝남, `interrupted`→멈춤)에서 읽는다. 도구 사용 수는 숨기고, 경과 시간은 화면 시계로 세되 기록하지 않는다. 0.158.0과 0.171.0에서 같게 온다(PoC 결과 Codex). 보고 턴과 다음 send 규칙은 Claude Code만 해당한다.
- **참고**: 드래프트는 Claude 데스크톱 앱과 Codex 데스크톱 앱의 서브에이전트 표시를 참고해 그린다.

## 완료 조건

1. **턴 안의 서브에이전트**: Claude Code의 Agent 도구 호출은 활동 단계 대신 작업 행으로 보인다.
   - 접힌 행은 설명, 서브에이전트 종류, 도구 사용 수, 경과 시간, 지금 쓰는 도구를 한 줄에 보인다. 숫자는 `task_progress`가 올 때 바뀌고, 숫자가 바뀌어도 행 높이는 그대로다.
   - 끝나면 상태(끝남, 실패, 멈춤)와 최종 도구 사용 수, 시간을 보인다.
   - 여러 서브에이전트가 함께 돌면 행이 각각 있고, 시작 순서대로 놓인다. 순서가 다르게 끝나도 각 행이 맞는 상태를 보인다.
   - 작업 프레임이 오지 않는 Agent 호출은 지금처럼 활동 단계로 남는다.
2. **턴 뒤의 백그라운드 작업**: 턴 안에서 띄운 백그라운드 서브에이전트와 백그라운드 명령도 그 턴의 활동 자리에 작업 행으로 있다. `ambient` 작업은 보이지 않는다.
   - 턴이 끝난 뒤에도 행은 계속 진행을 보이고, 끝나면 끝난 상태로 바뀐다.
   - 백그라운드 줄은 안내 문장과 Stop을 보이고, 마지막 작업이 끝나거나 멈출 때 간다. 그때 행은 그대로 남는다. 안내 문장은 "다음 메시지를 보내면 멈춘다"를 더 이상 말하지 않는다(문구는 드래프트에서).
   - Stop, "Stopping", 실패 토스트, 접근성 이름은 지금 규칙 그대로다. 줄의 Stop을 누르면 도는 행들이 "멈춤"이 되고, 보고 턴은 열리지 않는다.
   - 백그라운드 작업이 모두 끝나면 보고 턴이 열리고, 스레드는 보통 턴처럼 인디케이터와 에이전트의 답을 보인다.
   - 작업이 도는 중에 사람이 메시지를 보내면 작업은 계속 돌고, 행도 계속 진행을 보인다.
3. **Codex**: 메인 스레드의 `subAgentActivity`로 같은 행 모양에 이름과 상태를 보인다.
4. **기록**: 끝난 작업의 결과(설명, 종류, 상태, 도구 사용 수, 시간)는 대화 이벤트로 남는다. 재시작 뒤 스레드에는 끝난 행이 같은 자리에 보인다. 진행 중에 앱이 끝나면 그 작업은 기록 없이 사라지고, 재시작 뒤에는 지금처럼 활동 단계 한 줄만 남는다.
   - 턴 뒤에 쓴 기록은 본 대화를 다시 안 본 대화로 바꾸지 않는다.
5. **모델 호출**: Doan은 진행 표시를 위해 아무 요청도 보내지 않는다. 제공자가 이미 보내는 프레임만 읽는다(PRODUCT §3 'Turn stages'와 같다). 사람 메시지 없이 나가는 모델 호출은 보고 턴 하나뿐이고, 그것도 Doan이 아니라 Claude Code가 연다.
6. **펼치기와 키보드**: 행의 펼침은 활동 줄과 같은 버튼이다(`aria-expanded`, Tab으로 닿고 Space·Return으로 펼친다). 접힌 행에서 잘린 설명의 전문은 펼친 행과 스크린 리더 텍스트에 있다.
7. **스크린 리더**: 위 '스크린 리더' 결정대로 알린다. 행 자체는 live region이 아니다. 문구는 드래프트의 `copy` 프레임에서 정한다.
8. **모습**: 사용자가 앱에서 확정한 드래프트와 같다(`/design-sync`로 잰다).

## 바뀌는 PRODUCT와 ARCHITECTURE 문장 (승격 때)

- PRODUCT §3 Out of scope 4: 보고 턴을 Handoff, 사용 한도 옆의 새 예외로 더한다.
- PRODUCT §5 item 3: 보고 턴의 모습과 큐 규칙
- ARCHITECTURE §7: 'Ending a finished turn's process'(작업이 남은 동안 입력을 열어 둠), 보고 턴을 가려내는 규칙
- PRODUCT §5 item 3 'Background work line': "No model request goes out without a person's message … Doan ends the process at that moment", "the next send ended it first", 안내 문장 "It stops when you send your next message or press Stop."

- PRODUCT §5 item 3 'Background work line': "No sweep, spinner or output of the work shows", 줄의 모양, 프로토타입 창을 따르는 화면에 더함, 줄의 Stop 뒤 행의 상태
- PRODUCT §5 item 3 'Turn indicator': "While the turn runs, no command text, thinking text, token count, progress or 'still working' line is shown"(작업 행은 예외)
- PRODUCT §5 item 3: "The thread's last activity row follows the indicator"(작업 행은 따르지 않음)
- PRODUCT §5 item 3 'Thread motion': 활동 줄처럼 작업 행도 움직이지 않는다는 문장
- PRODUCT §5 item 3: 작업 행 규칙. 지금 PRODUCT에 서브에이전트 단계 규칙이 없으므로 새로 쓴다.
- PRODUCT §3 'Turn stages'(작업 프레임을 읽는 범위)
- ARCHITECTURE §7 'Background work after a done turn'(작업 정보를 메모리에 둠), 대화 이벤트의 되돌림 비용 문단(`activity.result`, `canvas.drawn`과 같은 곳), Claude와 Codex transport가 읽는 프레임, 턴 뒤 기록의 쓰기 경로

## 비목표

- 작업이 없는 턴 뒤에도 프로세스를 유지하기(별도 feature)

- 작업별 Stop. `stop_task`를 쓴다고 알리면 턴 Stop의 의미가 바뀐다(`sdk.d.ts` `perTaskStopAffordance` 선언). BACKLOG에 적는다.
- 서브에이전트 안의 도구 단계, 답글, 결과 글(`summary`)을 스레드에 보이기
- 모델이 만드는 진행 요약
- Cursor, Antigravity, GitHub Copilot의 서브에이전트
- 터미널 세션(legacy external)의 작업 표시
