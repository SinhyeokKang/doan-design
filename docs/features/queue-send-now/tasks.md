# queue-send-now — tasks

순서: PoC → 초안 → 순수 함수 → shell(I/O) → UI → 문서 승격. `── commit ──`은 `/ship`이 따르는 커밋 경계다.

## T0. PoC: 실행 중 턴에 메시지 넣기 (Claude Code, Codex)

- `.scratch/queue-send-now/`에 격리 HOME·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`으로 실제 provider를 돌리는 스크립트를 두고 design.md §4의 질문을 하나씩 확인한다. Codex는 최소 버전 0.164.0과 설치본에서, Claude는 최소 2.1.312와 설치본에서 본다.
- 결과를 design.md §4에 표로 적고, `STEER_PROVIDERS`의 처음 값과 Claude `priority`, `queued_turn_count`·uuid 소비 처리, 권한 대기 중 표시(spec 결정 3·4), Codex 최소 버전(spec 결정 7)을 확정한다. provider별 통과 기준은 design §4대로다. 한 provider만 실패하면 그 provider를 빼고 진행하고(spec 결정 6), 둘 다 실패하면 여기서 멈추고 사용자에게 묻는다. 확정한 결과로 spec 완료 조건 1과 결정 3의 문장을 고친다.
- 검증: command undecided — needs user confirmation (실제 계정으로 모델을 호출하는 PoC라 AGENTS.md 'Commands'에 해당 명령이 없다). 판정할 산출물: design §4 표에 질문마다 버전·관찰·통과/실패가 있고, 사용자가 확인한다.

── commit (docs: PoC 관찰을 feature 문서에 반영) ──

## T0.5. 초안

- `/design-draft`로 큐 행 상태를 그리고 사용자가 앱에서 확인한다(design §8의 상태 목록). AGENTS.md 'Workflow'대로 `/tdd` 앞이다.
- 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`가 오류 없이 그 캔버스를 보인다. 사용자가 앱에서 확인한다.

── commit (docs(canvas): queue row Send now draft) ──

## T1. 순수 함수와 drafts 단일 항목 표시

- `app/src/main/conversation/steerSupport.ts`에 `STEER_PROVIDERS`·`canSteer`·`sendNowShown({provider, phase, sending})`. `rendererImports.test.ts` 목록에 더한다. 표 케이스: provider(claude·codex·ACP 세 provider·`STEER_PROVIDERS`에서 빠진 provider) × phase(preparing·starting·running·waiting·holding·ended) × sending. provider는 대화에 저장된 값이다.
- `queueFocusAfter(items, index)`: 다음 행 Send now → 다음 행 Remove → 입력란.
- `DraftStore.markOneSending` / `unmarkSending`. `queued()`가 표시된 항목을 빼고, `giveBackQueued`가 표시된 항목까지 draft로 돌려주는지.
- 한 턴에 `user.message`가 둘인 이벤트열에서 `threadItems`·`state.ts` fold·`summary.ts`(title·preview·unseen)가 턴을 하나로 보는지 고정한다.
- 검증: `npm --prefix app test` green (새 케이스는 먼저 red 확인).

── commit ──

## T2. transport의 소비 신호와 Claude 연속 result

- `normalizeClaude`: 넣은 uuid의 echo를 소비 신호(`user.message`)로 낸다. `queued_turn_count > 0`이거나 넣은 uuid가 아직 소비되지 않은 result는 terminal이 아니고 다음 result를 기다린다(연속 result 처리는 T0에서 필요하다고 확인된 경우만). stop·appQuit 중이면 지금처럼 interrupted로 끝난다. result 뒤에 들어온 steer는 거절된다.
- Codex transport: `clientUserMessageId`가 붙은 `userMessage` item을 소비 신호로 읽는다.
- 검증: `npm --prefix app test` (`transport.test.ts`) green.

── commit ──

## T3. 러너 `steer`

- Codex: `turn/steer` (`expectedTurnId` = native turn id, `clientUserMessageId`, override 없음). `startingTurn`·`dead`·완료 뒤에는 거절. steer는 timeout이 나도 거절만 하는 dispatcher 경로로 보낸다. fake app-server 테스트로 요청 모양, 오류 시 거절, 응답이 10초 넘게 없어도 턴이 실패하지 않음을 고정한다.
- Claude: 생성기를 열어 두고 `steer`로 `uuid`가 붙은 메시지를 더 낸다. terminal 뒤·`finished` 뒤 거절. 생성기는 terminal 이벤트 즉시 닫힌다(done·failed·aborted·`endTransport`·stop·close). 테스트(기존 `runners.test.ts` 실제 SDK + fake 실행 파일 방식): 마지막 result 뒤 생성기가 닫히고 `process_exited`가 옴, `turn.done` 시점(exit 콜백 전)의 send가 busy가 아님, failed·aborted 경로에서도 닫힘, 일반 한 메시지 턴의 종료가 바뀌지 않음, POSTMORTEM 2026-10-27 'SDK process death' 회귀(exit 7·SIGKILL에서 terminal 하나) 유지.
- ACP 러너에는 `steer`를 두지 않는다.
- 검증: `npm --prefix app test` (`runners.test.ts`) green, `npm --prefix app run typecheck` 통과.

── commit ──

## T4. service `sendNow`와 IPC

- design.md §2.2·§2.3. `checkSend` 수준의 admission을 await 전후로 확인, 단일 항목 `sending`, 첨부 reclaim·consume, 소비 신호가 오면 실행 중 `turnId`로 `user.message` append, 거절·경합 시 표시를 되돌림. `ended()`가 `sending` 항목이 있는 대화도 holding으로 두고, done flush는 진행 중인 steer를 기다린 뒤 원래 순서대로 내보낸다.
- 테스트: 성공, 턴이 steer 중에 done/failed/stopped로 끝남, 받아들여졌지만 소비 전에 턴이 끝남(큐에 남아 원래 순서대로 나감), archive·sign-out 경합, 늦은 steer 응답이 다음 턴에 붙지 않음, crash 재시작 뒤 draft, steer 없는 러너의 `not_running`, flush가 두 번 돌지 않음(POSTMORTEM 2026-10-28), steer 중인 항목만 남아도 holding이 유지돼 다른 project 대화가 root를 가져가지 않음. 추가: (a) provider가 steer를 거절(JSON-RPC 오류)하면 항목이 큐에 남고 이어지는 done·failed에서 규칙대로 처리됨, (b) 같은 항목을 두 번 연속 요청하면 두 번째가 `stale`, (c) 서로 다른 두 행을 빠르게 연속 요청하면 append 순서대로 둘 다 반영됨, (d) steer 중인 행의 Remove가 false를 돌려주고(`drafts.ts:130`) renderer가 행을 지우지 않음.
- `ipc.ts`의 `conversation:sendQueuedNow` 검증과 preload 노출.
- 검증: `npm --prefix app test` (`service.test.ts`, `drafts.test.ts`, `ipc.test.ts`) green, `npm --prefix app run typecheck` 통과.

── commit ──

## T5. UI: 큐 행의 Send now

- `DockedComposer` 큐 행에 Send now(표시 조건 `sendNowShown`, tooltip, 진행 중 `aria-disabled`와 `Sending…`, 거절 상태 줄, `aria-describedby`), Send now·Remove 공통 포커스 규칙(`queueFocusAfter`, 버튼 unmount 때 입력란), 두 host(`ProjectOverview`, `CanvasConversationPanel`)와 `conversationStore` 연결.
- 검증: `npm --prefix app run typecheck`·`npm --prefix app test` green, `npm --prefix app run build` 성공. `/runtime-test`로 격리 실제 앱에서 Claude와 Codex(T0에서 통과한 provider) 각각: 실행 중 턴에 Send now → 에이전트가 읽은 시점에 같은 턴에 메시지가 보이고 턴이 이어짐, 큐 둘 중 하나만 들어감, 진행 중 버튼이 포커스를 잃지 않음(실제 Chromium), Remove·Send now 뒤 포커스 이동, 턴이 끝나는 순간의 거절(큐에 남아 원래 순서대로 나감), T0 결과에 따라 권한 응답 대기 중 버튼 표시·주입 또는 버튼 없음. ACP 대화에 버튼 없음은 T1 단위 표로 고정하고, 격리 환경에 ACP 계정이 있을 때만 실제 앱으로 본다. 스크린샷을 남긴다.

── commit ──

## T6. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md` §5 item 1: 'Project conversations'의 큐 규칙에 Send now(지원 provider, 실행 중 턴, 한 행, 실패 시 큐 규칙), 'Permission picker'의 큐 메시지 모드 문장(밀어 넣은 메시지는 실행 중인 턴의 모드).
- `docs/ARCHITECTURE.md` §7: 'Queue'에 단일 항목 `sending`, steer 중 holding, flush가 steer를 기다리는 순서 규칙, 'Transport and environment'의 Claude 턴 생성기 수명(terminal 즉시 닫음)과 uuid 소비 신호, Codex `turn/steer`·`clientUserMessageId`·timeout 경로, 'Events'에 한 턴의 여러 `user.message`(소비 시점에 append), `STEER_PROVIDERS` 파일 경로(`steerSupport.ts`)를 가리키는 한 줄. Codex 최소 버전을 올렸으면 그 문장.
- `docs/DESIGN.md` 'Queued messages' 행에 Send now(측정했으면 값, 아니면 미측정이라고)와, "xs Remove"를 실제 X 아이콘 버튼으로 바로잡기.
- `docs/features/queue-send-now/` 삭제.
- 검증: docs-only라 targeted check다. `grep -rn "docs/features/queue-send-now" docs/ AGENTS.md`가 비어 있다(DESIGN이 초안 `.doan/canvases/*.html`을 인용하는 것은 허용).

── commit (문서별로 나눈다. 마지막에 `docs(feature): remove queue-send-now documents`) ──
