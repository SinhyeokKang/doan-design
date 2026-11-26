# canvas-message — 작업

시작 조건: check-scope(체인 링크 1)와 thread-polish가 develop에 머지됐다(`git log origin/develop`에 두 PR의 머지 커밋, 두 `docs/features/` 디렉터리 없음).

`/agent-eval` 해당: 가이드, CLI 명령, 스킬 stub이 바뀐다.

1. `/design-draft canvas-message`: design '드래프트 요청'의 네 프레임. 사용자가 앱에서 확정한다.
   - 확인: `doan check --json --repo .` 새 error 없음, `doan ls --json --repo .`의 frame id가 `source-cards`, `received`, `queue`, `toasts`.
   - 커밋 경계: `docs(design): canvas-message draft`.
2. 스키마와 fixtures: `schema/app-socket.v8.schema.json`, `schema/fixtures/app-socket-v8/`, v5 거절 코드(`/feature-review`에서 정한 방식).
   - 확인: `go test ./...`과 `npm --prefix app test`의 스키마 fixture 테스트 green.
   - 커밋 경계.
3. `/tdd`: design '순수 함수'의 테스트를 쓰고 red를 본다(TS와 Go).
   - 확인: `npm --prefix app test`, `go test ./...`에서 새 테스트 red.
4. 순수 규칙: `handoff.ts`(`handoffEligibility`, `handoffDecision`, `latestConversation`, `handoffQueueOutcome`), `origin` 읽기, Go `send_rules.go`.
   - 다시 쓸 기존 테스트: `handoff.test.ts`의 "새 캔버스만"과 `handoff_turn` 경우, `handoff_rules_test.go`.
   - 확인: `npm --prefix app test`, `go test ./...` green, `npm --prefix app run typecheck`, `go vet ./...`.
   - 커밋 경계.
5. shell
   - CLI: `doan send`, `help`, 스킬 stub과 가이드.
   - main: `runtime.ts` v8, `service.ts` `requestSend`, 받는 대화 시작과 큐, `prompt.ts` 가이드, 프로토타입 창 알림.
   - 다시 쓸 기존 테스트: `service.handoff.test.ts`, `prompt.test.ts`, `runtime` 소켓 테스트.
   - 확인: `npm --prefix app test`, `go test ./...` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계.
6. renderer: canvas 카드 문구, 대화 중간 받은 버블, 큐 줄 표시, 토스트.
   - 다시 쓸 기존 테스트: `threadItems.test.ts`, `canvasCardText.test.ts`, `ConversationThread.test.tsx`, 큐 관련 테스트.
   - 확인: `npm --prefix app test` green, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
   - 커밋 경계.
7. `/design-sync`: 프레임 `source-cards`, `received`, `queue`, `toasts`를 캔버스 패널과 Overview에서 잰다.
   - 확인: `node .scratch/design-sync/<screen>/measure.mjs`의 측정이 드래프트와 맞는다. 다른 점은 `docs/design/conversation.md`에 남는다.
8. `/runtime-test`: 격리된 실제 앱에서 짧게 확인한다. 실제 provider 턴이 필요하면 AGENTS.md 'Real agent sign-ins'대로 한다.
   - 기존 캔버스 `handoff`
   - 쉬는 대화와 도는 대화로의 `send`, 대화 없는 캔버스로의 `send`
   - 되돌아가기 거절
   - 받은 턴의 두 번째 요청 거절
   - 5단계 거절
   - 보낸 턴의 멈춤으로 인한 취소
   - 재시작 뒤 큐에 든 에이전트 메시지
   - 확인: 각 항목의 결과와 스크린샷이 `.scratch/runtime-test/canvas-message/`에 있다.
9. `/agent-eval`: 새 시나리오(지시가 있을 때만 기존 캔버스로 보냄, `handoff`/`send` 선택, 되돌려 보내지 않음)를 `eval/`에 더하고 한 회차를 돌린다.
   - 확인: `node eval/run.ts --self-test` PASS, 회차 결과가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 있다.
10. `/verify --eval`.
    - 확인: `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.
11. 결론을 현재 규칙으로 옮기고 `docs/features/canvas-message/`를 지운다.
    - PRODUCT: §3 Out of scope 4, In scope 6, §5 item 2 'Handoff', item 10, 'Canvas cards'
    - ARCHITECTURE: §4 'Send over app-socket v8', §7 'Handoff', `prompt.ts`
    - `docs/design/conversation.md`
    - 확인: `test ! -d docs/features/canvas-message`, `grep -rn "docs/features/canvas-message" docs/ app/src cli .agents` 결과 없음, `grep -n "did not exist when the turn was accepted\|cannot hand off again" docs/PRODUCT.md` 결과 없음.
