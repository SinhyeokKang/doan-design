# canvas-message — 작업

시작 조건: `git fetch && git ls-tree origin/develop docs/features/check-scope docs/features/answer-popover docs/features/thread-polish`의 출력이 비어 있다(세 기능이 머지되고 디렉터리가 지워졌다). canvas-chip과의 순서는 사용자가 정한다(design '순서 제약').

`/agent-eval` 해당: 가이드, CLI 명령, 스킬 stub이 바뀐다. 실제 회차는 사용량 한도가 넉넉한 계정으로 돌린다(사용자 지정).

1. (완료, 2026-11-26 확정, design '드래프트 확정') `/design-draft canvas-message`: design '드래프트 요청'의 네 프레임.
   - 확인: `doan check --json --repo .` 새 error 없음, `doan ls --json --repo .`의 frame id가 `source-cards`, `received`, `queue`, `toasts`. `source-cards`에 send 상태 넷과 연쇄 거절 셋(handoff·send)이 모두 그려졌다.
   - 커밋 경계: `docs(design): canvas-message draft`.
2. 스키마와 fixtures: `schema/app-socket.v8.schema.json`, `schema/fixtures/app-socket-v8/`, v5 `errorCode`에 `chain_one`·`chain_limit`, `formats/validate.go`, `schema/embed.go`.
   - 확인: `go test ./...`과 `npm --prefix app test`에서 v8 pass/fail fixture가 Go와 TS 검증기에서 같은 결과다. 이전 v5 스키마로 새 거절 코드 응답을 검사하면 실패한다는 Go 테스트가 있다.
   - 커밋 경계.
3. `/tdd`: design '순수 함수'의 경우를 TS와 Go 테스트로 쓰고 red를 본다.
   - 확인: `npm --prefix app test`, `go test ./...`에서 새 테스트 red.
4. 순수 규칙
   - 대상: `handoff.ts`(`handoffEligibility`, `handoffDecision`, `latestConversation`, `handoffGuidanceFor`, `missedHandoffs`, `handoffQueueOutcome`, `handoffNoticeKind`), `origin` 읽기, 큐 규칙(`queue.ts`, `drafts.ts`), Go `send_rules.go`
   - 다시 쓸 기존 테스트
     - `handoff.test.ts`의 "새 캔버스만"과 `handoff_turn` 경우
     - `HandoffAsker.startedBy`를 쓰는 곳(`service.ts`)
     - `queue.test.ts`, `drafts` 테스트
     - `handoff_rules_test.go`
   - 확인: `npm --prefix app test`, `go test ./...` green, `npm --prefix app run typecheck`, `go vet ./...`.
   - 커밋 경계.
5. shell
   - CLI: `doan send`, `run.go` help, `envelope.go` exit 코드, `skill.md`
   - main: `runtime.ts` v8과 토큰, `service.ts`(`requestSend`, send 전달, 큐 경로, 한도), `prompt.ts` 가이드, 프로토타입 창 알림
   - eval 프롬프트 fixture: `eval/scenarios/{R8d,R9b,R10,R11,R12}/prompt.md`를 앱의 `turnPrompt` 출력으로 다시 만든다.
   - 다시 쓸·더할 테스트
     - `service.handoff.test.ts`, `runtime.handoff.test.ts`(또는 새 `runtime.send.test.ts`), `prompt.test.ts`
     - `prototype/conversationScope.test.ts`, `preload/prototype.test.ts`
     - `send_test.go`, `skill_test.go`, `canvas_path_test.go`
   - 서비스 경우(`service.handoff.test.ts`)
     - 판정과 시작 사이에 대상 대화가 지워짐, 큐에 든 뒤 지워짐
     - 대상이 권한·질문의 답을 기다림
     - 대상이 사용량 한도 상태(예약하지 않고 실패)
     - 두 보낸 쪽이 같은 순간 같은 쉬는 대상에 보냄(하나는 시작, 하나는 큐)
     - 두 보낸 쪽이 대화 없는 같은 캔버스에 `send`
     - 사람 행과 에이전트 행이 섞인 큐
     - 재시작 뒤 큐의 에이전트 행과 drafts
     - 받는 대화가 다른 캔버스로 handoff할 때 에이전트 행이 남음
     - 보낸 쪽이 프로젝트 대화
     - 판정 전에 보낸 대화가 지워짐
     - 1단계 이상 턴의 Missed 없음
   - 확인: `npm --prefix app test`, `go test ./...` green, `node --test 'eval/**/*.test.ts'` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계.
6. renderer
   - 대상: canvas 카드 문구와 아이콘, 받은 버블의 `via`별 메타, 큐 줄 에이전트 행, Edit and resend 없음, 토스트
   - 다시 쓸·더할 테스트
     - `threadItems.test.ts`, `canvasCardText.test.ts`(기존 `not_new`·`handoff_turn` 문구 유지 포함)
     - `ConversationThread.test.tsx`(대화 중간 받은 버블, 보낸 곳 삭제, 명령 이름으로 시작하는 `send`)
     - 큐 줄 테스트
     - 보고 있는 대화에 unseen이 남지 않는 경우
   - 확인: `npm --prefix app test` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계.
7. `/design-sync`: 프레임 `source-cards`, `received`, `queue`, `toasts`를 캔버스 패널과 Overview에서 잰다.
   - 확인: `node .scratch/design-sync/canvas-message-panel/measure.mjs`와 `node .scratch/design-sync/canvas-message-overview/measure.mjs`의 측정이 드래프트와 맞는다. 다른 점은 `docs/design/conversation.md`에 남는다.
8. `/runtime-test`: 격리된 실제 앱에서 짧게 확인한다. 실제 provider 턴이 필요하면 AGENTS.md 'Real agent sign-ins'대로 한다.
   - 기존 캔버스 `handoff`
   - 쉬는 대화와 도는 대화로의 `send`, 대화 없는 캔버스로의 `send`
   - 보고 있는 대화로의 `send`(초안과 포커스 유지, unseen 없음)
   - 1단계 고리가 화면을 옮기지 않음: `origin`을 심은 기록으로 1단계 턴 하나를 띄워 확인한다.
   - 보낸 턴의 멈춤으로 인한 취소
   - 재시작 뒤 큐에 남은 에이전트 행
   - 판정 전에 대상 캔버스 이름 바꿈
   - 연쇄 거절 셋(`chain_return`, `chain_one`, `chain_limit`)은 runtime이 아니라 tasks 4·5의 단위·서비스 테스트로 판정한다.
   - 확인: 각 항목의 결과와 스크린샷이 `.scratch/runtime-test/canvas-message/`에 있다.
9. `/agent-eval`
   - 9a. eval 하네스
     - `eval/lib/socket.ts`에 v8과 연쇄 거절을 더한다.
     - `eval/lib/scenario.ts`의 `scenario.json`에 받은 턴 설정(`chain`, 이미 있는 대상 캔버스와 그 대화)을 더한다.
     - `eval/lib/handoff.ts`에 `sendCommands`를 더한다. `noHandoff`가 `send`도 센다.
     - 확인: `node --test 'eval/**/*.test.ts'` green.
   - 9b. 시나리오
     - R13: 지시한 기존 캔버스로 `handoff`
     - R14: 전하라고 하면 `send`
     - R15: 지시가 없으면 기존 캔버스로 보내지 않음
     - R16: 받은 턴이 되돌려 보내지 않음
     - 각각 `turn.json`, `prompt.md`, `prompt.test.ts`, `checks.ts`, `checks.test.ts`, `fixtures/pass*`, `fail*`를 둔다.
     - 확인: `node eval/run.ts --self-test --scenarios R13,R14,R15,R16` PASS.
   - 9c. 회차: `npm --prefix app run package` 뒤 한도가 넉넉한 계정으로 전체 회차를 돌린다.
     - 확인: R13–R16과 R10, R11, R12가 Claude Code와 Codex 모두에서 pass다. 결과가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 있다.
10. `/verify --eval`.
    - 확인: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.
11. 결론을 현재 규칙으로 옮기고 `docs/features/canvas-message/`를 지운다.
    - PRODUCT
      - §3 Out of scope 4, In scope 6
      - §4 Loop
      - §5 item 1 큐, item 2 'Handoff', item 10, 'Canvas cards'
      - 판정에서 막지 않고 가이드와 eval로 지킨다는 문장
      - 기존 문장 "an old handoff refused because the canvas already had a conversation" 확인
    - ARCHITECTURE: §4 'Send over app-socket v8'과 v5 예외, §7 'Handoff'와 하위 호환 문단, §11 토큰 목록, §12 `doan send`
    - `docs/design/conversation.md`
    - `docs/BACKLOG.md`의 handoff 미확인 화면 목록
    - README의 `doan handoff` 설명과 `doan send` 줄: develop에서만 고치고, main에는 `/publish`로 간다.
    - 확인: `test ! -d docs/features/canvas-message`, `grep -rn "docs/features/canvas-message" docs/ app/src cli .agents eval` 결과 없음, `grep -n "did not exist when the turn was accepted\|from a turn a handoff started" docs/PRODUCT.md` 결과 없음.
