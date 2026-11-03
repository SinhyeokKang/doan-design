# queue-send-now — design

## 1. 영향 범위

| 구성 요소 | 바뀌는 것 |
|---|---|
| app main `conversation/runners.ts` | `Runner`에 선택 메서드 `steer(prompt, turnId, messageId)`를 더한다. Codex는 `turn/steer`, Claude는 열린 streaming input 생성기로 메시지 하나를 더 보낸다. ACP 러너에는 없다 |
| app main `conversation/dispatcher.ts` | steer 요청은 timeout이 나도 거절만 하는 경로로 보낸다. 지금 `request`는 10초 timeout에 `this.fail()`을 불러(`dispatcher.ts:27`) `failProtocol`이 턴 전체를 `session_unavailable`로 끝낸다(`runners.ts:60-63`) |
| app main `conversation/transport.ts` | 끼워 넣은 메시지의 소비 신호를 읽고, 그 시점에 `user.message`를 낸다. Claude result가 `queued_turn_count > 0`이거나 넣은 uuid가 아직 소비되지 않았으면 턴을 끝내지 않는다(PoC 결과에 따라. §4) |
| app main `conversation/service.ts` | `sendNow(conversationId, itemId)`: 큐 항목 하나를 실행 중인 턴에 넣고, 받아들여지면 그 턴의 `turnId`로 `user.message`를 append한다 |
| app main `conversation/drafts.ts` | 항목 하나만 `sending`으로 표시하고, 거절되면 표시를 되돌리는 연산 |
| app main `conversation/ipc.ts`, `app/src/preload/index.ts` | 새 채널 `conversation:sendQueuedNow {conversationId, itemId}` → `void \| ConversationError` |
| renderer `DockedComposer.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `conversationStore.ts` | 큐 행의 Send now 버튼과 그 표시 조건, 호출, `Sending…` 상태, 거절 상태 줄, Send now·Remove 공통 포커스 규칙 |
| renderer-safe 모듈 `app/src/main/conversation/steerSupport.ts`(`permissionMode.ts`처럼 type-only import) | provider별 steer 지원 여부와 표시 조건. `rendererImports.test.ts`(`:23`)의 목록에 더한다 |
| CLI(Go)·skills·guide | 없음 |

## 2. 흐름

### 2.1 표시 조건 (renderer)

`sendNowShown({provider, phase, sending})`이 참일 때만 행에 Send now를 그린다. `provider`는 composer picker가 아니라 그 대화에 저장된 provider다.

- provider가 `STEER_PROVIDERS`(PoC로 확인된 것만. 처음 값 `claude`, `codex`)에 있다. ACP 세 provider는 넣지 않는다. 권한 picker가 provider가 없는 모드를 빼는 것과 같은 방식이다(PRODUCT §5 item 1 'Permission picker').
- 대화의 phase가 `running`이다. `waiting`(권한 응답 대기)은 T0 결과로 정한다(spec 결정 3). 준비 중, 끝난 턴의 판정·큐 전송 대기(`working`이지만 phase가 running이 아님)에서는 숨긴다. 넣을 턴이 없기 때문이다. `running`에는 fold의 `starting`도 들어가므로(`summary.ts:35`) Codex `startingTurn` 구간에도 버튼이 보일 수 있다. 그때 누르면 거절되고 상태 줄이 뜬다(spec 완료 조건 8·10).
- `sending`인 행은 버튼 대신 `Sending…`을 보인다. 눌린 직후부터 에이전트가 읽었다는 신호가 오거나 거절될 때까지다.

provider 지원 여부는 고정 표다. 실행 중에 provider에 묻지 않는다. 설치 버전마다 다를 수 있는 점은 최소 버전(`minimumVersions.ts`)에서 PoC로 확인해 덮는다.

### 2.2 main `sendNow`

1. admission을 `checkSend`와 같은 수준으로 확인한다: live 턴이 accepted이고 실행 중, `!live.terminal`, `!closed`, `!failedPersistence`, `!quitting`, 대화가 current(archived가 아님), 그 provider가 sign-out 중이 아님, 러너에 `steer`가 있음, 항목이 큐에 있고 `sending`이 아님. 아니면 `not_running` 또는 `stale`. 모든 await 뒤에 다시 확인한다(ARCHITECTURE:434 "rechecked after every asynchronous step").
2. drafts.json에서 그 항목 하나만 `sending`으로 표시한다(디스크에 먼저 쓴다. crash면 재시작 때 draft로 돌아온다. 기존 `sending` 규칙).
3. 첨부 id를 `files.reclaim`으로 다시 확인하고, `turnPrompt`로 프롬프트를 만든다. anchor·첨부 서술은 일반 send와 같고, guidance 줄도 그대로 붙인다(별도 steer용 프롬프트를 두지 않는다).
4. live 턴 identity(대화 id, live 객체, `turnId`)를 await 전후로 비교한다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
5. `runner.steer(prompt, turnId, messageId)`가 성공하면(provider가 받아들임) 항목은 `sending`으로 남는다. `messageId`는 항목마다 새로 만든 UUID로, Claude는 `SDKUserMessage.uuid`, Codex는 `clientUserMessageId`로 넘긴다. transport가 그 id의 소비 신호(Claude frame·result의 `user_message_uuid(s)`, Codex `userMessage` item의 `clientUserMessageId`)를 내면, 같은 live 턴이 아직 실행 중일 때 그 `turnId`로 `user.message`를 append·publish하고, 항목을 `drafts.sent`로 지우고 첨부를 `consume`한다(spec 결정 2). thread 위치가 '에이전트가 읽은 시점'이 되는 이유다.
6. steer가 거절되거나 그 사이 턴이 끝났으면 `sending` 표시를 되돌린다. provider가 받아들였지만 소비 신호 없이 턴이 끝난 경우도 같다. 항목은 큐에 남고, 턴의 terminal 처리(§2.3)가 원래 순서대로 처리한다. renderer에는 `not_running`을 돌려준다. renderer는 답을 받은 뒤 대화가 아직 `running`이면 그 행 아래에 상태 줄을 보이고, 턴이 끝났으면 아무것도 띄우지 않는다(spec 완료 조건 10). 새 오류 코드는 두지 않는다.

### 2.3 턴이 끝나는 경우와의 경합

- 기존 terminal 처리(`service.ts` "A turn's terminal event")는 `drafts.queued(id)`를 본다. 이 함수는 `sending` 항목을 빼므로, steer가 진행 중인 항목은 done 턴의 flush에 섞이지 않는다.
- steer 중인 항목도 holding 대상으로 센다. 지금 `ended()`는 큐에 보낼 항목이 있을 때만 holding을 만든다(`service.ts:544`). 큐에 steer 중인 항목만 있으면 holding이 생기지 않아 `working()`이 false가 되고, `release()`가 `live.project`를 지워(`service.ts:637-641`) 다른 project 대화가 root를 가져갈 수 있다. 그래서 `ended()`는 `sending` 항목이 있는 대화도 holding으로 둔다.
- done 턴의 flush는 그 대화에 진행 중인 steer promise를 await한 뒤 `markSending`한다. steer가 성공해 소비됐으면 그 항목은 이미 빠져 있고, 실패했으면 표시가 되돌아가 제자리에 남은 채 원래 순서대로 같이 나간다(spec 결정 10). 이렇게 하면 terminal 판단을 다시 부르는 분기가 필요 없다. `ended()`는 evidence의 `endedAt`과 타이머를 쓰는 부작용 함수라(`service.ts:541-551`) 다시 부르면 판정이 두 번 돈다.
- failed·stopped·archive·sign-out의 `giveBack`은 지금도 `sending` 항목까지 모두 draft로 돌려준다(`giveBackQueued`). steer 응답이 늦게 와도 live 턴 identity가 달라졌으면 append하지 않는다. 다만 provider는 이미 메시지를 받았을 수 있다. 그 경우 메시지는 draft에도 남아, 두 번 보낼 여지가 생긴다. 사람이 draft를 보고 다시 보내는 것이므로 자동 중복 전송은 아니다. 이 경계는 기존 큐의 `sending` 규칙("a crash right after acceptance returns an already sent message as a draft")과 같다.

### 2.4 Provider 러너

- **Codex**: `turn/steer {threadId: sessionId, expectedTurnId: activeTurn, input: [{type: "text", text: prompt}], clientUserMessageId: messageId}`. 요청은 timeout이 나도 거절만 하는 경로로 보낸다(§1 `dispatcher.ts`). 권한 응답 대기 중에 서버가 응답을 미뤄도 턴이 실패하지 않게 하기 위해서다. `activeTurn`이 아직 native id가 아닐 때(`startingTurn`)는 거절한다(`not_running`). `expectedTurnId`가 일치하지 않거나 실행 중인 턴이 없으면 JSON-RPC 오류 → 거절. model·effort·권한은 넘기지 않는다(steer가 override를 받지 않고, 실행 중인 턴의 모드는 바뀌지 않는다는 PRODUCT 규칙과도 맞다). steer가 만드는 `userMessage` item은 지금 무시된다(`transport.ts:167-179`). `clientUserMessageId`가 붙은 것은 소비 신호로 읽는다(PoC에서 echo를 확인). 완료 직전에 받아들여진 steer가 다른 turnId의 follow-up turn으로 돌면 그 알림은 무시되므로(`transport.ts:162-163`) 보이지 않는 턴이 생길 수 있다. PoC에서 확인하고, 그렇다면 Codex는 실패로 본다.
- **Claude**: `messages()` 생성기를 첫 메시지 뒤에도 열어 두고, `steer`가 `uuid: messageId`를 붙인 메시지를 하나 더 내보내게 한다. `priority`는 PoC 결과로 정한다(작업을 중단하지 않는 값, 예상 `next`). 생성기는 `normalizeClaude`가 terminal 이벤트(done·failed·aborted, `endTransport`, stop·close 포함)를 낸 즉시 닫는다. 하나라도 빠지면 stdin이 열린 채 CLI가 끝나지 않아 `send`가 resolve되지 않고 `previousExit`가 영구 대기한다(POSTMORTEM 2026-10-28). `finished`이거나 terminal을 이미 본 뒤의 `steer`는 거절한다.
  - **턴 끝 경합**: CLI가 `queued_turn_count: 0`인 result를 낸 직후 생성기가 steer 메시지를 내보내면, Doan은 result로 턴을 끝내고 이후 frame을 무시하는데(`transport.ts:96`, `:124-128`) CLI는 그 메시지로 숨은 턴을 돌린다. consume 루프는 CLI가 끝날 때까지 이어져(`runners.ts:163-176`) 다음 send와 flush가 막힌다(`service.ts:204`). 그래서 terminal은 "`queued_turn_count`가 0이고, 넣은 uuid가 모두 `user_message_uuids`에서 소비된 result"로 정의한다. 이것으로 막지 못하면 Claude는 PoC 실패다(spec 결정 6).
- **ACP**: `steer`가 없다. renderer는 버튼을 그리지 않고, 그래도 IPC 요청이 오면 service가 `not_running`으로 거절한다.

## 3. 순수 함수로 뺄 부분 (`/tdd` 대상)

- `sendNowShown({provider, phase, sending})` — `steerSupport.ts`. provider(claude·codex·ACP 세 provider·`STEER_PROVIDERS`에서 빠진 provider) × phase(preparing·starting·running·waiting·holding·ended) × sending 표.
- `STEER_PROVIDERS` / `canSteer(provider)` — 같은 모듈.
- `queueFocusAfter(items, index)` — Send now 성공·Remove 뒤 포커스 대상(다음 행 Send now → 다음 행 Remove → 입력란). 렌더러 순수 함수.
- `DraftStore.markOneSending(id, itemId)` / `DraftStore.unmarkSending(id, itemId)` — 하나만 표시, 거절 시 되돌림, 이미 `sending`이거나 없는 항목은 false. `queued()`가 표시된 항목을 빼는지, `giveBackQueued`가 표시된 항목도 draft로 돌려주는지.
- Claude transport `normalizeClaude`: 넣은 uuid의 소비 신호를 `user.message`로 낸다. `queued_turn_count > 0`이거나 넣은 uuid가 아직 소비되지 않은 result는 terminal이 아니고, 그 밖에는 지금처럼 terminal이다(§4 PoC가 이 경로를 확인한 경우에만).
- Codex transport: `clientUserMessageId`가 붙은 `userMessage` item을 소비 신호로 읽는다.
- Codex 러너의 steer 요청 구성(`expectedTurnId`, override 없음)은 fake app-server 테스트로 고정한다(`runners.test.ts` 기존 방식).

## 4. PoC 의존

다음 가정은 코드·문서만으로 확인되지 않았다. 첫 태스크에서 격리 프로필의 실제 provider로 확인한다.

- **Codex**: 최소 버전 0.164.0과 설치본 0.166.0에서 `turn/steer`가 존재하고, 실행 중 턴에 받아들여지며, 같은 turn의 `turn/completed` 하나로 끝나는가. 권한 응답 대기 중 steer의 응답과 그 지연 시간. 턴 완료 직후 steer의 오류 모양. 완료 직전에 받아들여진 steer가 같은 turn에 들어가는가, 다른 turnId의 follow-up turn으로 도는가. steer 응답과 `turn/completed`의 도착 순서. steer가 만드는 알림(`item/started` `userMessage` 등)과 `clientUserMessageId`의 echo.
- **Claude**: 실행 중 턴에 생성기로 두 번째 메시지를 내면 (a) 같은 턴에 접혀 result가 하나인가, (b) 다음 턴으로 따로 돌아 첫 result에 `queued_turn_count: 1`이 오는가. `priority` 없음·`next`·`later`·`now`의 차이(`now`가 도구를 중단하면 쓰지 않는다). 도구 호출 없이 답만 쓰는 중에 넣었을 때. 권한 응답 대기 중에 넣었을 때. 보낸 `uuid`가 frame과 result의 `user_message_uuid(s)`에 echo되는가. result 직전·직후에 넣었을 때 메시지가 처리되는가, 숨은 턴이 생기는가.
- **provider별 통과 기준**: Codex는 같은 turn에서 받아들여지고 `turn/completed`가 하나이며 `clientUserMessageId`가 echo된다. Claude는 fold(result 하나)이거나 `queued_turn_count` 연속이고, uuid가 echo되어 턴 끝 경합을 판정할 수 있다. 실패한 provider는 `STEER_PROVIDERS`에서 뺀다(spec 결정 6). 둘 다 실패하면 이 feature는 멈추고 사용자에게 다시 묻는다.
- **Codex 최소 버전**: 0.164.0에서 실패하고 0.166.0에서 통과하면 Codex 최소 버전(`minimumVersions.ts`)을 0.166.0으로 올린다(spec 결정 7).

PoC 코드는 `.scratch/queue-send-now/`에 두고 관찰은 이 문서와 커밋 메시지에 적는다(AGENTS.md 'Commit conventions'). 실제 provider 호출은 실제 계정 상태를 쓰므로 격리 HOME·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`으로 돌린다.

## 5. 형식 변경

- JSON Schema(`schema/`) 변경 없음. 대화 이벤트는 TS 타입(`types.ts`)이고 v1을 유지한다. `user.message` 이벤트 모양은 그대로이고, 의미만 넓어진다: 한 턴에 `user.message`가 여럿일 수 있고, 첫 번째가 그 턴을 연다. 기존 fold(`threadItems.ts`)는 `turnId`가 같은 `user.message`를 접힌 턴으로 보지 않으므로 thread에 그 자리에 보인다. `summary.ts`·`state.ts`가 턴당 `user.message` 하나를 가정하는지 `/tdd`에서 테스트로 고정한다.
- `drafts.json`: 모양 변경 없음. `sending`을 항목 단위로 쓰는 것뿐이다(`drafts.test.ts`가 schema).
- IPC: 새 채널 `conversation:sendQueuedNow`. 오류 코드는 기존 `not_running`, `stale`, `attachment_missing` 안에서 쓴다.

## 6. 규약·결정 영향

- ARCHITECTURE §1 Conventions·`doan check` 규칙: 영향 없음.
- append-only 이벤트: 지킨다. steer는 이벤트를 새로 append할 뿐이다.
- PRODUCT §3 Out of scope 4(Doan이 에이전트를 깨우지 않음): Send now는 사람이 누른 사람의 메시지다. 범위 안이다.
- PRODUCT §5 item 1의 큐 규칙과 Permission picker의 "a queued message goes out in the mode stored when it is sent"는 바뀐다: 밀어 넣은 메시지는 실행 중인 턴의 모드로 처리된다. 마지막 태스크에서 PRODUCT 문장을 고친다.
- ARCHITECTURE §7 'Queue', Claude transport의 "fresh SDK/CLI per turn"(턴 동안 생성기가 열려 있게 됨)을 고친다.

## 7. POSTMORTEM에서 가져온 함정

- **2026-10-27 'Awaited conversation work outlived its current turn'**: await 전에 확인한 admission이 await 뒤에 바뀐다. steer 전후로 live identity와 `turnId`를 다시 비교하고, 늦은 steer 응답이 다음 턴에 `user.message`를 붙이지 않게 한다.
- **2026-10-27 'Protocol readiness lagged behind process and turn ownership'**: Codex는 `turn/start` 응답으로 native turn id가 정해지기 전(`startingTurn`)의 frame을 따로 줄 세운다. 이 구간의 steer는 거절한다(`expectedTurnId`가 없다).
- **2026-10-28 'A send right after turn.done was refused as busy'**: done 직후의 큐 flush 경로와 경합한다. §2.3의 flush가 steer를 기다리는 동안 flush를 두 번 돌리거나 이미 끝난 hold를 되살리지 않는지 테스트로 고정한다. Claude 생성기를 닫지 않으면 같은 busy가 생긴다(§2.4).
- **2026-10-27 'SDK process death …'**: 실제 SDK + fake 실행 파일 회귀(exit 7·SIGKILL에서 terminal 하나)를 생성기 수명 변경 뒤에도 유지한다.

## 8. UI

기존 화면의 확장이다(design preset `shape` 'Extend an existing surface': 기존 시각 체계를 그대로 따른다). 큐 행(`queue-item`, DESIGN.md 'Queued messages')의 텍스트와 Remove(X 아이콘 버튼, `DockedComposer.tsx:331`) 사이에 xs 텍스트 버튼 `Send now`를 둔다. 아이콘 버튼 옆의 텍스트 버튼이라 동작을 처음 보는 사람도 알아볼 수 있다. tooltip은 `Add to the current turn without stopping it`이다(stop-then-send로 오해하지 않게). 행이 좁으면 텍스트가 먼저 말줄임된다.

- 진행 중: `disabled`가 아니라 `aria-disabled="true"`와 클릭 무시로 표현하고, 라벨을 `Sending…`으로 바꾼다. `disabled`로 바꾸면 Chromium focus fixup 때문에 포커스가 body로 간다(POSTMORTEM 2026-11-03 'focus dropped to the page body'와 같은 종류). jsdom이 아니라 실제 Chromium probe(T5 `/runtime-test`)로 확인한다.
- 포커스: 성공해 행이 사라지거나 Remove로 행이 사라지면 `queueFocusAfter`대로 간다(spec 완료 조건 11). 지금 Remove에는 포커스 규칙이 없어(두 host `ProjectOverview.tsx:387`, `CanvasConversationPanel.tsx:425`가 행만 지움) 포커스가 body로 떨어지므로 같이 고친다. 포커스가 있던 버튼이 phase 변화로 unmount되면 입력란으로 옮긴다. 거절되면 행과 포커스가 그대로이고 상태 줄이 뜬다.
- 접근성 이름: 모든 행이 같은 이름이 되지 않게 Send now와 Remove 모두 `aria-describedby`로 그 행의 `.queue-text`를 가리킨다. 이름은 `Send queued message now`, Remove는 지금 이름 그대로다.
- 성공 피드백은 행이 사라지고 thread에 메시지가 붙는 것이다. thread를 위로 스크롤해 둔 상태의 따라가기는 일반 send와 같은 규칙(`scrollFollow`, `threadItems.ts:181`, behind 표시 `ConversationThread.tsx:340`)을 따른다.
- 단축키는 두지 않는다(spec 비목표).
- DESIGN.md 'Queued messages'의 "xs Remove"는 실제로 X 아이콘 버튼이므로 승격 때 바로잡는다.

`/design-draft`(T0 다음, 구현 전)로 `buzz-conversation.html`의 큐 상태에 행을 더할지, 새 프레임을 둘지는 그 단계에서 정한다. 그릴 상태: 휴식·hover·focus, `Sending…`, 거절 상태 줄, 여러 행, 지원하지 않는 provider(버튼 없음).
