# multi-handoff — tasks

순서: 형식 → 순수 함수 → main 배선 → 렌더러 → CLI·eval → 확인 → 문서. `‖`는 커밋 경계이고, 경계마다 `npm --prefix app run typecheck`가 통과해야 한다.

1. **이벤트 형식**: `types.ts`에 `handoff.resolved.canvas`와 `handoff.missed { canvas: Canvas }`를 추가하고, `store.ts`에서 검증한다. 경로 없는 기존 `handoff.resolved`도 통과해야 한다.
   - 검증: `npm --prefix app test -- conversation/storeIndex conversation/storeRecovery` 녹색. 새 필드, 새 타입, 경로 없는 기존 줄, 잘못된 `handoff.missed`(canvas 없음) 거절을 확인한다. typecheck도 통과해야 한다.
2. **순수 함수**: `handoff.ts`의 `handoffEligibility`(경로 배열), `missedHandoffs`, `handoffQueueOutcome`, `handoffNoticeKind`.
   - `service.ts:562`의 호출부만 최소한으로 맞춘다: `requested: turn?.request ? [turn.request.path] : []`.
   - 검증: `npm --prefix app test -- conversation/handoff.test`와 typecheck 녹색. 확인할 경우:
     - 같은 경로 재요청은 거절, 다른 경로는 수락, 소스 경로는 `same_canvas`.
     - `missedHandoffs`는 소스, 기존 캔버스, 목록에 두 번 있는 id, 현재 대화가 있는 캔버스, 요청한 캔버스, 캔버스가 아닌 파일을 제외하고, 편집한 새 캔버스만 낸다.
     - D2 표: 단일(시작·거절·취소), 다중(취소 섞임 → draft, 그 외 → source).
     - D3: 0개, 1개, 2개 이상.
   ‖ `feat(conversation): judge handoffs per canvas`
3. **접기**: `state.ts`에서 경로별로 핸드오프를 접는다. `summary.ts`는 `handoff.missed`를 unseen 계산에서 뺀다.
   - 검증: `npm --prefix app test -- conversation/state.test conversation/summary.test`와 typecheck 녹색. 확인할 경우:
     - 재시작 때 일부는 해결, 일부는 대기 → 대기한 것만 cancelled.
     - 경로 없는 기존 `handoff.resolved` → 그 턴의 유일한 요청.
     - `handoff.missed`만 늦게 온 대화는 다시 unseen이 되지 않는다.
4. **프롬프트와 eval 프롬프트**: `HANDOFF_GUIDANCE`를 spec 완료 조건 6대로 바꾼다. 문구는 clarify preset으로 다듬는다. R8d·R9b·R10의 `prompt.md`와 R10 `rubric.md`도 같은 커밋에서 갱신한다.
   - 검증: `npm --prefix app test -- conversation/prompt.test`, `node --test 'eval/scenarios/*/prompt.test.ts'` 녹색.
   ‖ `feat(conversation): ask for a handoff to every new canvas`
5. **main 배선**: `service.ts`에서 아래를 구현한다(design '앱 main').
   - `HandoffTurn.requests`, `guided`, `edits`
   - 요청별 판정, 모두 결정된 뒤 순차 시작, 요청별 `handoff.resolved`
   - 마지막 해결 때 큐 처리 한 번, `start()`에서 `moveQueue` 분리
   - 턴마다 알림 한 번, `judge`의 `contested`
   - 취소 경로, Send now 조건 제거
   - `missedWaits`와 그 수명 관리
   - 그 밖에 `project.ts`의 `canvasesAt` export, `runtime.ts`의 `already_requested` 메시지, `index.ts`의 다중 알림 전달.
   - 검증: `npm --prefix app test -- conversation/service.handoff conversation/service.turnEnd main/runtime.handoff`와 typecheck 녹색. 요청이 하나인 턴의 기존 테스트는 바꾸지 않고 통과해야 한다. 새 경우는 다음과 같다.
     - 두 요청 모두 시작: 요청 순서대로, 알림 한 번, 큐는 소스로.
     - 한 요청은 `has_conversation`, 다른 요청은 시작.
     - 판정 전에 대상 파일이 지워져 `not_listed`가 되고, 나머지는 시작.
     - 새 캔버스 두 개가 같은 id라서 둘 다 `not_listed`.
     - 요청 하나는 목록에 있고 하나는 아직 없을 때 → 둘 다 결정될 때까지 시작하지 않는다. 새로고침이 다시 와도 두 번 시작하지 않는다.
     - 첫 시작과 둘째 시작 사이에 소스 보관, Stop, sign-out, 앱 종료 → 남은 요청 cancelled, 큐는 초안, 종료 때는 쓰기 없음.
     - Send now 뒤에도 안내가 유지되고, 다른 경로 요청이 수락된다.
     - `judge`의 `contested`에 모든 요청 경로가 들어간다.
     - 누락: 편집한 새 캔버스에 요청이 없으면 `handoff.missed`가 생기고, 요청 하나와 누락 하나가 섞인 턴도 맞게 나온다.
     - 누락 음성 사례: Plan 턴, 핸드오프로 시작된 턴, 프로젝트 턴(승격 포함), failed·stopped 턴, 기존 캔버스만 편집, 캔버스가 아닌 파일만 편집, edit 활동이 없는 경우(셸 생성), 마감 전에 보관·삭제된 경우(history가 다시 생기지 않는다), 판정 때 다른 대화가 붙은 캔버스.
     - 누락 대기 중 큐가 바로 나가고 `working`이 false다. 그 사이에 다음 send가 와도 누락 판정은 남는다.
     - `already_requested` 응답 메시지.
   ‖ `feat(conversation): hand off to every new canvas of a turn`
6. **렌더러**: `threadItems.ts`, `handoffView.ts`, `ConversationThread.tsx`, `App.tsx`를 고친다(design '렌더러').
   - 검증: `npm --prefix app test -- renderer/threadItems renderer/handoffView renderer/App.handoff renderer/ConversationThread.test`와 typecheck 녹색. 확인할 경우:
     - 같은 턴의 요청 두 개 → 줄 두 개(경로별 키).
     - 경로 없는 기존 `handoff.resolved` → 유일한 줄.
     - 섞인 결과(started·refused·cancelled·missed)의 문구.
     - `missed` 줄이 다음 사용자 메시지 뒤에 도착해도 그 턴 위치에 그려진다.
     - `missed` Open이 캔버스를 연다. 캔버스가 사라졌으면 Open을 숨기고 “ · No longer in <project>”를 붙인다.
     - Open의 접근 이름은 “Open <file>”.
     - 다중 알림: 소스 페이지면 이동도 토스트도 없다. 다른 곳이면 요약 토스트 하나이고, 그 Open은 소스로 간다.
     - 단일 알림은 지금과 같다.
   ‖ `feat(renderer): show each handoff of a turn`
7. **CLI**: `handoff_rules.go`의 `already_requested` next step(`:90`)과 메시지(`:136`), 그리고 `handoff_rules_test.go`의 기대 문구를 고친다.
   - 검증: `go test ./...`, `go vet ./...` 녹색.
8. **eval**: 새 시나리오 R11(`scenario.json`, `prompt.md`, `checks.ts`, fixtures, `rubric.md`)을 만들고, `eval/lib/handoff.ts`에 헬퍼를 둔다. fake app의 `already_requested`를 경로 기준으로 바꾸고, `eval/lib/handoff.test.ts`의 순서 전제를 고친다(다른 경로 수락, 같은 경로 거절, 소스 경로 `same_canvas`).
   - 검증: `node --test 'eval/**/*.test.ts'` 녹색, `node eval/run.ts --self-test --scenarios R10,R11`이 `self-test PASS`이고 exit 0.
   ‖ `feat(eval): add a two-canvas handoff scenario`
9. **게이트와 실제 앱**: `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과해야 한다. 이어서 `/runtime-test`로 Claude Code와 Codex(Ask first) 각각 확인한다.
   - 메시지 예: "새 캔버스 a, b를 만들고 각각 이어서 작업해".
   - 확인할 것: 대화 두 개 시작, 소스 줄 두 개, 화면 이동 없음, 다른 페이지에서는 요약 토스트 하나.
   - Codex Ask first는 승인 두 번이 정상이다.
   - 셸이 아닌 편집으로 만든 요청 없는 새 캔버스에는 `missed` 줄이 나와야 한다.
   - Cursor·Antigravity·Copilot은 확인하지 못하므로 BACKLOG에 남긴다(task 11).
10. **`/agent-eval`**: `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios R10,R11 --agents claude,codex`를 실행한다.
    - 검증: 결과 행과 이슈(fail이면 U-번호)가 `docs/USABILITY-EVAL.md`에 기록되어 있다. R8d·R9b·R10 프롬프트를 같은 id 안에서 갱신했다는 사실도 그 회차에 적는다.
11. **문서 승격과 삭제**: 다음 문서를 현재 규칙으로 다시 쓰고, `docs/features/multi-handoff/`를 삭제한다.
    - PRODUCT: §3 Out of scope 4, §3 In scope 6 'Conversation', §5 item 1 승격 규칙의 핸드오프 문장, §5 item 2 'Handoff'(요청별 판정, 큐, 화면, 누락 줄과 그 한계).
    - ARCHITECTURE:
      - §4 'Handoff over app-socket v5'(`already_requested`의 뜻)
      - §7 'Handoff'(요청 배열, 순차 시작, 큐, 알림, `missedWaits`, edit 한계)
      - §7 'Project conversations and promotion'(`contested`)
      - §7 'Events'(새 필드와 타입, 이전 빌드가 손상으로 읽는 결과)
      - 프롬프트 문단(Send now)
      - §14(R10·R11 체크 계약, "a refusal does not spend the turn's one handoff")
    - DESIGN.md 'Canvas handoff': 누락 줄과 요약 토스트 문구.
    - BACKLOG: 'Canvas handoff surfaces not verified'에서 확인한 것을 정리하고, 다른 공급자의 누락 줄을 새 줄로 남긴다.
    - 검증: `git grep -n "Doan accepts one per turn\|start one new conversation\|turn's one handoff\|This turn already handed off\|a new conversation on a new canvas it" docs/PRODUCT.md docs/ARCHITECTURE.md`가 빈 결과이고, `docs/features/multi-handoff/`가 없다.
    ‖ `docs: promote multi-handoff`
