# queue-send-now — tasks

순서: PoC → 순수 함수 → shell(I/O) → UI → 문서 승격. `── commit ──`은 `/ship`이 따르는 커밋 경계다.

## T0. PoC: 실행 중 턴에 메시지 넣기 (Claude Code, Codex)

- `.scratch/queue-send-now/`에 격리 HOME·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`으로 실제 provider를 돌리는 스크립트를 두고 design.md §4의 질문을 하나씩 확인한다. Codex는 최소 버전 0.164.0과 설치본에서, Claude는 최소 2.1.312와 설치본에서 본다.
- 결과를 design.md §4에 표로 적고, `STEER_PROVIDERS`의 처음 값과 Claude `priority`, `queued_turn_count` 처리 여부, 권한 대기 중 표시(spec 결정 3·4)를 확정한다. 둘 다 실패하면 여기서 멈추고 사용자에게 묻는다.
- 검증: command undecided — needs user confirmation (실제 계정으로 모델을 호출하는 PoC라 AGENTS.md 'Commands'에 해당 명령이 없다. 관찰 기록을 사용자가 확인한다).

── commit (docs: PoC 관찰을 feature 문서에 반영) ──

## T1. 순수 함수와 drafts 단일 항목 표시

- renderer-safe 모듈에 `STEER_PROVIDERS`·`canSteer`·`sendNowShown`.
- `DraftStore.markOneSending` / `unmarkSending`. `queued()`가 표시된 항목을 빼고, `giveBackQueued`가 표시된 항목까지 draft로 돌려주는지.
- 한 턴에 `user.message`가 둘인 이벤트열에서 `threadItems`·`state.ts` fold·`summary.ts`(title·preview·unseen)가 턴을 하나로 보는지 고정한다.
- 검증: `npm --prefix app test` green (새 케이스는 먼저 red 확인).

── commit ──

## T2. Claude transport의 연속 result (T0에서 필요하다고 확인된 경우만)

- `normalizeClaude`: `queued_turn_count > 0`인 result는 terminal이 아니고 다음 result를 기다린다. stop·appQuit 중이면 지금처럼 interrupted로 끝난다.
- 검증: `npm --prefix app test` (`transport.test.ts`) green.

── commit ──

## T3. 러너 `steer`

- Codex: `turn/steer` (`expectedTurnId` = native turn id, override 없음). `startingTurn`·`dead`·완료 뒤에는 거절. fake app-server 테스트로 요청 모양과 오류 시 거절을 고정한다.
- Claude: 생성기를 terminal까지 열어 두고 `steer`로 메시지를 더 낸다. terminal 뒤·`finished` 뒤 거절. stop·close가 생성기를 닫는지, 일반 한 메시지 턴의 종료가 바뀌지 않는지(기존 `runners.test.ts` 실제 SDK + fake 실행 파일 방식).
- ACP 러너에는 `steer`를 두지 않는다.
- 검증: `npm --prefix app test` (`runners.test.ts`) green, `npm --prefix app run typecheck` 통과.

── commit ──

## T4. service `sendNow`와 IPC

- design.md §2.2·§2.3. live identity 재확인, 단일 항목 `sending`, 첨부 reclaim·consume, 받아들여지면 실행 중 `turnId`로 `user.message` append, 거절·경합 시 큐로 되돌리고 terminal 규칙으로 재판단.
- 테스트: 성공, 턴이 steer 중에 done/failed/stopped로 끝남, archive·sign-out 경합, 늦은 steer 응답이 다음 턴에 붙지 않음, crash 재시작 뒤 draft, steer 없는 러너의 `not_running`, flush가 두 번 돌지 않음(POSTMORTEM 2026-10-28).
- `ipc.ts`의 `conversation:sendQueuedNow` 검증과 preload 노출.
- 검증: `npm --prefix app test` (`service.test.ts`, `drafts.test.ts`, `ipc.test.ts`) green, `npm --prefix app run typecheck` 통과.

── commit ──

## T5. UI: 큐 행의 Send now

- `/design-draft`로 큐 행 상태를 먼저 그리고 사용자가 앱에서 확인한다.
- `DockedComposer` 큐 행에 Send now(표시 조건 `sendNowShown`, 누른 뒤 비활성, 포커스 규칙), 두 host(`ProjectOverview`, `CanvasConversationPanel`)와 `conversationStore` 연결.
- 검증: `npm --prefix app run typecheck`·`npm --prefix app test` green, `npm --prefix app run build` 성공. `/runtime-test`로 격리 실제 앱에서 Claude와 Codex 각각: 실행 중 턴에 Send now → 같은 턴에 메시지가 보이고 턴이 이어짐, 큐 둘 중 하나만 들어감, ACP 대화에 버튼 없음. 스크린샷을 남긴다.

── commit ──

## T6. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md` §5 item 1: 'Project conversations'의 큐 규칙에 Send now(지원 provider, 실행 중 턴, 한 행, 실패 시 큐 규칙), 'Permission picker'의 큐 메시지 모드 문장(밀어 넣은 메시지는 실행 중인 턴의 모드).
- `docs/ARCHITECTURE.md` §7: 'Queue'에 단일 항목 `sending`과 steer 경합, 'Transport and environment'의 Claude 턴 생성기 수명, Codex `turn/steer`, 'Events'에 한 턴의 여러 `user.message`, provider 지원 표의 위치.
- `docs/DESIGN.md` 'Queued messages' 행에 Send now(측정했으면 값, 아니면 미측정이라고).
- `docs/features/queue-send-now/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, `grep -rn "queue-send-now" docs/`가 비어 있다.

── commit (문서별로 나눈다) ──
