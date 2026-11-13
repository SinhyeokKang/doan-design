# multi-handoff — tasks

순서: 형식 → 순수 함수 → main 배선 → 렌더러 → CLI·eval → 문서. `‖`는 커밋 경계.

1. **이벤트 형식**: `types.ts`에 `handoff.resolved.canvas`, `handoff.missed` 추가. `store.ts` 검증. 경로 없는 기존 `handoff.resolved`도 통과.
   - 검증: `npm --prefix app test -- storeIndex store` 녹색(새 필드·타입·기존 줄 케이스).
   ‖ `feat(conversation): name the canvas in handoff resolutions`
2. **순수 함수**: `handoffEligibility`(경로 배열), `missedHandoffs`, `handoffQueueOutcome`, `handoffPrimary` (`handoff.ts`).
   - 검증: `npm --prefix app test -- handoff.test` 녹색(같은 경로 재요청 거절, 다른 경로 수락, 소스·기존·다른 대화 캔버스 제외, D2·D3 표).
3. **접기**: `state.ts` 경로별 핸드오프, 재시작 시 대기 요청 전부 cancelled. `summary.ts`에서 `handoff.missed` 제외.
   - 검증: `npm --prefix app test -- state.test summary.test` 녹색.
   ‖ `feat(conversation): judge handoffs per canvas`
4. **프롬프트**: `HANDOFF_GUIDANCE`를 "새 캔버스마다 한 번" 안내로 변경. Send now 프롬프트 조건 수정.
   - 검증: `npm --prefix app test -- prompt.test` 녹색. 문구는 clarify preset으로 다듬는다.
5. **main 배선**: `service.ts`의 `HandoffTurn.requests`, 요청별 판정·순차 시작·해결, 턴 단위 대기 해제, D2 큐, D3 `primary`, `stopRuns`/보관/종료 시 남은 요청 취소, `judge`의 `contested`, done 턴의 `handoff.missed` 판정.
   - 검증: `npm --prefix app test -- service.handoff service.turnEnd service.test` 녹색. 새 케이스: 두 요청 모두 시작, 하나 거절·하나 시작, 시작 사이에 소스 보관(남은 요청 취소), 요청 없는 새 캔버스 → `handoff.missed`, 요청 하나인 턴은 기존 테스트 그대로 통과.
   ‖ `feat(conversation): hand off to every new canvas of a turn`
6. **렌더러**: `threadItems.ts` 경로별 줄, `missed` 줄, `handoffView.ts` 문구와 `primary` 처리, `App.tsx` 알림 처리.
   - 검증: `npm --prefix app test -- threadItems handoffView App.handoff ConversationThread` 녹색.
   ‖ `feat(renderer): show each handoff of a turn`
7. **CLI**: `handoff_rules.go`의 `already_requested` 메시지.
   - 검증: `go test ./...` 녹색.
8. **eval**: R10 `prompt.md` 갱신, 새 시나리오 R10b(두 캔버스), fake app의 `already_requested`를 경로 기준으로.
   - 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios R10,R10b`가 `self-test PASS`.
   ‖ `feat(eval): add a two-canvas handoff scenario`
9. **게이트와 실제 앱**: `node .agents/skills/verify/scripts/verify.mjs --eval`. `/runtime-test`로 Claude Code와 Codex(Ask first) 각각 새 캔버스 두 개 핸드오프 → 대화 두 개 시작, 소스 줄 두 개, 한 번의 이동. 요청 없는 새 캔버스의 `missed` 줄.
10. **`/agent-eval`**: R10, R10b를 Claude Code·Codex로 실행하고 `docs/USABILITY-EVAL.md`에 기록.
11. **문서 승격**: PRODUCT §3 Out of scope 4, §5 item 2 'Handoff', §5 item 6를 "새 캔버스마다 하나"로 다시 쓴다. ARCHITECTURE §4 'Handoff over app-socket v5'(already_requested 의미), §7 'Handoff'(요청 배열, 큐, primary, missed, ACP edit 한계), §7 'Events'(새 필드·타입), 'Prompt'(Send now), §14 eval 서술(R10b). DESIGN.md에 새 줄이 측정 대상이면 기록. BACKLOG 'Canvas handoff surfaces not verified'에서 확인한 것 정리. 그리고 `docs/features/multi-handoff/` 삭제.
    - 검증: `git grep -n "one per turn\|one new conversation" docs/PRODUCT.md docs/ARCHITECTURE.md`가 비어 있음.
    ‖ `docs: promote multi-handoff`
