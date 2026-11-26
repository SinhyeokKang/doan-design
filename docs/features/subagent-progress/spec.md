# 서브에이전트 진행 — spec

에이전트가 서브에이전트나 백그라운드 명령을 돌리면, 스레드가 작업마다 무엇을 하고 있는지와 어디까지 왔는지를 보여 준다.

## 사용자

- **사람**: 캔버스 패널, Overview, 프로토타입 창에서 대화하는 사람이다. 에이전트가 서브에이전트를 여러 개 띄운 동안 지금 무엇이 몇 개 돌고 있고, 각각 얼마나 진행했고, 끝났는지 실패했는지를 스레드에서 본다.
- **에이전트**: 바뀌지 않는다. CLI, 스킬, 가이드는 그대로다.

## 문제

- 턴이 끝난 뒤 백그라운드 작업이 남으면, 스레드에는 터미널 아이콘과 "Background work is still running. It stops when you send your next message or press Stop." 한 줄, Stop 버튼만 보인다(PRODUCT §5 item 3 'Background work line': "No sweep, spinner or output of the work shows"). 몇 개가 돌고 있는지, 무엇을 하는지, 얼마나 남았는지 알 수 없다(사용자 스크린샷, 2026-11-26).
- 턴 안에서 도는 서브에이전트(Claude Code의 Agent 도구)는 활동 줄의 한 단계로, 에이전트가 쓴 설명 한 줄만 보인다(`transport.ts` `claudeActivity`가 `kind: "other"`로 만든다). 서브에이전트 안의 프레임(`parent_tool_use_id`가 있는 것)은 모두 버린다.
- Claude Code는 이미 작업마다 다음을 스트림으로 보낸다(`@anthropic-ai/claude-agent-sdk` 0.3.312 `sdk.d.ts`에서 확인):
  - `system/task_started`: `task_id`, `description`, `subagent_type`, 백그라운드 여부
  - `system/task_progress`: `usage`(`total_tokens`, `tool_uses`, `duration_ms`), `last_tool_name`
  - `system/task_notification`: `status`(`completed`·`failed`·`stopped`), `usage`, `summary`
  - `system/background_tasks_changed`: 살아 있는 작업 전체(`task_type`, `subagent_type`, `description`, `parent_task_id`, `ambient`)
- 지금 Doan은 이 가운데 `background_tasks_changed`의 `task_id`만 읽는다(`backgroundTasks`).

## 확정한 결정 (사용자)

- 턴 안의 서브에이전트와 턴이 끝난 뒤의 백그라운드 작업을 모두 보여 준다. 같은 작업 행 모양을 쓴다.
- 행에는 제공자가 주는 사실만 보여 준다: 설명, 종류(서브에이전트, 명령), 도구 사용 수, 경과 시간, 지금 쓰는 도구, 끝난 상태(끝남, 실패, 멈춤). 모델이 만드는 진행 요약(Claude Code의 `agentProgressSummaries`)은 켜지 않는다. 사람 계정에 모델 호출이 더 나가기 때문이다.
- Stop은 지금처럼 하나다. 턴의 Stop과 백그라운드 줄의 Stop은 지금 규칙 그대로이고, 작업별 Stop은 없다.
- Claude Code와 Codex를 모두 다룬다. Codex는 앱 서버가 서브에이전트 진행을 주는지 PoC로 먼저 확인하고, 주는 만큼만 보여 준다.
- 진행 중인 숫자는 메모리에만 둔다. 작업이 끝나면 그 결과(상태, 도구 사용 수, 시간)를 대화 이벤트로 한 번 기록한다. 그래서 재시작 뒤에도 무엇이 돌았고 어떻게 끝났는지 남는다.
- 드래프트는 Claude 데스크톱 앱과 Codex 데스크톱 앱의 서브에이전트 표시를 참고해 그린다.

## 완료 조건

1. **턴 안의 서브에이전트**: Claude Code의 Agent 도구 호출은 활동 줄의 단계 대신 작업 행으로 보인다.
   - 행은 설명, 서브에이전트 종류, 도구 사용 수, 경과 시간, 지금 쓰는 도구를 보여 준다. 숫자는 `task_progress`가 올 때 바뀐다.
   - 끝나면 상태(끝남, 실패, 멈춤)와 최종 도구 사용 수, 시간을 보여 준다.
   - 여러 서브에이전트가 함께 돌면 행이 각각 있고, 시작 순서대로 놓인다.
2. **턴 뒤의 백그라운드 작업**: 지금의 백그라운드 줄은 남은 작업마다 행을 가진다.
   - 서브에이전트와 백그라운드 명령을 모두 보여 준다. `ambient` 작업은 보여 주지 않는다(지금 규칙과 같다).
   - 작업이 끝나면 그 행은 끝난 상태로 바뀐다. 줄은 지금처럼 마지막 작업의 프로세스가 사라질 때 간다.
   - Stop, "Stopping", 실패 토스트, 접근성 이름은 지금 규칙 그대로다.
3. **Codex**: T1 PoC에서 확인한 이벤트가 있으면 같은 행 모양으로 보여 준다. 없으면 Codex는 지금처럼 두고 BACKLOG에 적는다.
4. **기록**: 끝난 작업의 결과(설명, 종류, 상태, 도구 사용 수, 시간)는 대화 이벤트로 남는다. 재시작 뒤 스레드에는 끝난 행이 그대로 보인다. 진행 중에 앱이 끝나면 그 작업은 기록 없이 사라지고, 재시작 뒤에는 지금처럼 활동 단계 한 줄만 남는다.
5. **모델 호출**: Doan은 진행 표시를 위해 아무 요청도 보내지 않는다. 제공자가 이미 보내는 프레임만 읽는다(PRODUCT §3 'Turn stages'와 같다).
6. **접근성**: 작업 행은 live region이 아니다. 작업이 시작하거나 끝날 때 스레드의 스크린 리더 상태가 한 번 말한다. 문구는 드래프트의 `copy` 프레임에서 정한다.
7. **모습**: 사용자가 앱에서 확정한 드래프트와 같다(`/design-sync`로 잰다).

## 바뀌는 PRODUCT와 ARCHITECTURE 문장 (승격 때)

- PRODUCT §5 item 3 'Background work line': "No sweep, spinner or output of the work shows"와 줄의 모양
- PRODUCT §5 item 3의 활동 줄 규칙(서브에이전트 단계)
- PRODUCT §3 'Turn stages'(작업 프레임을 읽는 범위)
- ARCHITECTURE §7 'Background work after a done turn'(작업 정보를 메모리에 둠), 대화 이벤트 종류와 되돌림 비용 문단, Claude와 Codex transport가 읽는 프레임

## 비목표

- 작업별 Stop. `stop_task`를 쓴다고 알리면 턴 Stop의 의미가 바뀐다(`sdk.d.ts` `SDKControlInitializeRequest`의 per-task stop 선언). BACKLOG에 적는다.
- 서브에이전트 안의 도구 단계, 답글, 출력 전체를 스레드에 펼쳐 보이기
- 모델이 만드는 진행 요약
- Cursor, Antigravity, GitHub Copilot의 서브에이전트
- 터미널 세션(legacy external)의 작업 표시
