# queue-send-now — design

## 1. 영향 범위

| 구성 요소 | 바뀌는 것 |
|---|---|
| app main `conversation/runners.ts` | `Runner`에 선택 메서드 `steer(prompt, turnId)`를 더한다. Codex는 `turn/steer`, Claude는 열린 streaming input 생성기로 메시지 하나를 더 보낸다. ACP 러너에는 없다 |
| app main `conversation/transport.ts` | Claude result가 `queued_turn_count > 0`이면 턴을 끝내지 않는다(PoC 결과에 따라. §4) |
| app main `conversation/service.ts` | `sendNow(conversationId, itemId)`: 큐 항목 하나를 실행 중인 턴에 넣고, 받아들여지면 그 턴의 `turnId`로 `user.message`를 append한다 |
| app main `conversation/drafts.ts` | 항목 하나만 `sending`으로 표시하고, 거절되면 표시를 되돌리는 연산 |
| app main `conversation/ipc.ts`, `app/src/preload/index.ts` | 새 채널 `conversation:sendQueuedNow {conversationId, itemId}` → `void \| ConversationError` |
| renderer `DockedComposer.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `conversationStore.ts` | 큐 행의 Send now 버튼과 그 표시 조건, 호출 |
| renderer-safe 모듈(`conversation/permissionMode.ts`처럼 type-only import) | provider별 steer 지원 여부 |
| CLI(Go)·skills·guide | 없음 |

## 2. 흐름

### 2.1 표시 조건 (renderer)

`sendNowShown({provider, phase, item})`이 참일 때만 행에 Send now를 그린다.

- provider가 `STEER_PROVIDERS`(PoC로 확인된 것만. 처음 값 `claude`, `codex`)에 있다. ACP 세 provider는 넣지 않는다. 권한 picker가 provider가 없는 모드를 빼는 것과 같은 방식이다(PRODUCT §5 item 1 'Permission picker').
- 대화의 phase가 `running` 또는 `waiting`이다(spec 결정 3). 준비 중, 끝난 턴의 판정·큐 전송 대기(`working`이지만 phase가 running이 아님)에서는 숨긴다. 넣을 턴이 없기 때문이다.
- 그 행이 이미 밀어 넣는 중이 아니다(눌린 행은 응답이 올 때까지 버튼을 비활성화한다).

provider 지원 여부는 고정 표다. 실행 중에 provider에 묻지 않는다. 설치 버전마다 다를 수 있는 점은 최소 버전(`minimumVersions.ts`)에서 PoC로 확인해 덮는다.

### 2.2 main `sendNow`

1. 대화의 live 턴이 accepted이고 실행 중인지, 러너에 `steer`가 있는지, 항목이 큐에 있고 `sending`이 아닌지 확인한다. 아니면 `not_running` 또는 `stale`.
2. drafts.json에서 그 항목 하나만 `sending`으로 표시한다(디스크에 먼저 쓴다. crash면 재시작 때 draft로 돌아온다. 기존 `sending` 규칙).
3. 첨부 id를 `files.reclaim`으로 다시 확인하고, `turnPrompt`로 프롬프트를 만든다. anchor·첨부 서술은 일반 send와 같고, guidance 줄도 그대로 붙인다(별도 steer용 프롬프트를 두지 않는다).
4. live 턴 identity(대화 id, live 객체, `turnId`)를 await 전후로 비교한다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
5. `runner.steer(prompt, turnId)`가 성공하면, 같은 live 턴이 아직 실행 중일 때 그 `turnId`로 `user.message`를 append·publish하고, 항목을 `drafts.sent`로 지우고 첨부를 `consume`한다.
6. steer가 거절되거나 그 사이 턴이 끝났으면 `sending` 표시를 되돌린다. 항목은 큐에 남고, 턴의 terminal 처리(§2.3)가 나머지를 맡는다. renderer에는 `not_running`을 돌려주고, renderer는 아무것도 띄우지 않는다(메시지는 큐에 그대로 보인다).

### 2.3 턴이 끝나는 경우와의 경합

- 기존 terminal 처리(`service.ts` "A turn's terminal event")는 `drafts.queued(id)`를 본다. 이 함수는 `sending` 항목을 빼므로, steer가 진행 중인 항목은 done 턴의 flush에 섞이지 않는다.
- steer가 끝나기 전에 done 턴의 flush가 시작되면, steer 응답 뒤 그 항목은 §2.2-6에서 큐로 돌아오고 이미 시작된 flush에는 들어가지 않는다. 그래서 그 항목만 큐에 남는다. 처리: 표시를 되돌린 뒤 대화가 여전히 `holding`(큐 전송 대기)이 아니고 큐에 그 항목만 남았으면, terminal 처리와 같은 규칙으로 다시 판단한다(done이면 다음 flush, failed·stopped면 draft로). 구현은 terminal 처리에서 쓰는 판단 함수를 그대로 부른다.
- failed·stopped·archive·sign-out의 `giveBack`은 지금도 `sending` 항목까지 모두 draft로 돌려준다(`giveBackQueued`). steer 응답이 늦게 와도 live 턴 identity가 달라졌으면 append하지 않는다. 다만 provider는 이미 메시지를 받았을 수 있다. 그 경우 메시지는 draft에도 남아, 두 번 보낼 여지가 생긴다. 사람이 draft를 보고 다시 보내는 것이므로 자동 중복 전송은 아니다. 이 경계는 기존 큐의 `sending` 규칙("a crash right after acceptance returns an already sent message as a draft")과 같다.

### 2.4 Provider 러너

- **Codex**: `turn/steer {threadId: sessionId, expectedTurnId: activeTurn, input: [{type: "text", text: prompt}]}`. `activeTurn`이 아직 native id가 아닐 때(`startingTurn`)는 거절한다(`not_running`). `expectedTurnId`가 일치하지 않거나 실행 중인 턴이 없으면 JSON-RPC 오류 → 거절. model·effort·권한은 넘기지 않는다(steer가 override를 받지 않고, 실행 중인 턴의 모드는 바뀌지 않는다는 PRODUCT 규칙과도 맞다). steer가 만드는 `userMessage` item 알림은 dispatcher가 지금처럼 무시하는지 PoC에서 확인한다.
- **Claude**: `messages()` 생성기를 첫 메시지 뒤에도 열어 두고, `steer`가 메시지를 하나 더 내보내게 한다. `priority`는 PoC 결과로 정한다(작업을 중단하지 않는 값, 예상 `next`). 생성기는 terminal(마지막 result) 뒤 닫는다. 지금은 첫 메시지 뒤 생성기가 끝나 stdin이 닫히고 CLI가 첫 result 뒤 끝나므로, 닫는 시점이 바뀌는 것이 이 변경의 위험이다. `finished`이거나 terminal을 이미 본 뒤의 `steer`는 거절한다.
- **ACP**: `steer`가 없다. renderer는 버튼을 그리지 않고, 그래도 IPC 요청이 오면 service가 `not_running`으로 거절한다.

## 3. 순수 함수로 뺄 부분 (`/tdd` 대상)

- `sendNowShown({provider, phase, sending})` — renderer-safe 모듈. provider×phase 표.
- `STEER_PROVIDERS` / `canSteer(provider)` — 같은 모듈.
- `DraftStore.markOneSending(id, itemId)` / `DraftStore.unmarkSending(id, itemId)` — 하나만 표시, 거절 시 되돌림, 이미 `sending`이거나 없는 항목은 false. `queued()`가 표시된 항목을 빼는지, `giveBackQueued`가 표시된 항목도 draft로 돌려주는지.
- Claude transport `normalizeClaude`: `queued_turn_count > 0`인 result는 terminal이 아니고, `0`이거나 없으면 지금처럼 terminal이다(§4 PoC가 이 경로를 확인한 경우에만).
- Codex 러너의 steer 요청 구성(`expectedTurnId`, override 없음)은 fake app-server 테스트로 고정한다(`runners.test.ts` 기존 방식).

## 4. PoC 의존

다음 가정은 코드·문서만으로 확인되지 않았다. 첫 태스크에서 격리 프로필의 실제 provider로 확인한다.

- **Codex**: 최소 버전 0.164.0과 설치본 0.166.0에서 `turn/steer`가 존재하고, 실행 중 턴에 받아들여지며, 같은 turn의 `turn/completed` 하나로 끝나는가. 권한 응답 대기 중 steer의 응답. 턴 완료 직후 steer의 오류 모양. steer가 만드는 알림(`item/started` `userMessage` 등).
- **Claude**: 실행 중 턴에 생성기로 두 번째 메시지를 내면 (a) 같은 턴에 접혀 result가 하나인가, (b) 다음 턴으로 따로 돌아 첫 result에 `queued_turn_count: 1`이 오는가. `priority` 없음·`next`·`later`·`now`의 차이(`now`가 도구를 중단하면 쓰지 않는다). 도구 호출 없이 답만 쓰는 중에 넣었을 때. 권한 응답 대기 중에 넣었을 때.
- PoC가 실패한 provider는 `STEER_PROVIDERS`에서 뺀다. 둘 다 실패하면 이 feature는 멈추고 사용자에게 다시 묻는다.

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
- **2026-10-28 'A send right after turn.done was refused as busy'**: done 직후의 큐 flush 경로와 경합한다. §2.3의 재판단이 flush를 두 번 돌리거나 이미 끝난 hold를 되살리지 않는지 테스트로 고정한다.

## 8. UI

기존 화면의 확장이다(design preset `shape` 'Extend an existing surface': 기존 시각 체계를 그대로 따른다). 큐 행(`queue-item`, DESIGN.md 'Queued messages')의 텍스트와 Remove 사이에 xs 텍스트 버튼 `Send now`를 둔다. 아이콘 버튼이 아니라 라벨을 둔다(Remove와 구분되고, 동작을 처음 보는 사람이 알아볼 수 있게). 행이 좁으면 텍스트가 먼저 말줄임된다. 누른 뒤 응답까지 버튼은 비활성화되고, 성공하면 행이 사라지며 포커스는 다음 행의 Send now, 없으면 입력란으로 간다(Remove의 포커스 규칙과 같다). 실패하면 행이 그대로 있고 포커스도 그대로다. 접근성 이름은 `Send queued message now`.

`/design-draft`로 `buzz-conversation.html`의 큐 상태에 행을 더할지, 새 프레임을 둘지는 그 단계에서 정한다.
