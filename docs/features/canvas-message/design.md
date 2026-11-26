# canvas-message — 설계

## 순서 제약

- thread-polish가 머지된 뒤에 구현한다. 받은 쪽 버블(사람 버블과 같은 모양, 안쪽 위 메타 줄)과 그 메타 뷰(`handoffView.ts`)를 그대로 쓴다.
- check-scope가 `app/src/main/conversation/prompt.ts`를 바꾸므로 그 뒤에 시작한다(체인 링크 1).

## 영향 받는 부분

### CLI (Go)

- `cli/internal/cli/handoff.go`, `handoff_rules.go`: 그대로 쓴다. 판정은 앱에 있으므로 "새 캔버스" 조건은 CLI에 없다. 새 거절 코드를 읽고 exit 5로 낸다.
- 새 `cli/internal/cli/send.go`, `send_rules.go`
  - `doan send <canvas> --message <text|->`. 인자, `--message`, 표준 입력, 글자 규칙, 줄 한도, 경로 좁히기(`.doan/canvases/*.html`), `canvas_not_found`, `DOAN_HANDOFF` 키, 앱을 띄우지 않음까지 `doan handoff`와 같은 규칙이다.
  - 같은 부분은 `handoff_rules.go`의 함수를 함께 쓴다.
- `doan help`와 스킬 stub, 가이드에 `send`를 더한다. Codex 규칙(`codexRuleText`)은 `handoff`처럼 `send`도 sandbox 밖 허용 목록에 넣지 않는다. `handoff`가 지금 어떻게 다뤄지는지 따른다.

### 형식

- app-socket v8(`schema/app-socket.v8.schema.json`, fixtures `schema/fixtures/app-socket-v8/`): `send` 요청과 응답. 모양은 v5와 같고 `kind`나 버전으로 구분한다. 응답은 `{sent, canvas}`다.
- v5 응답의 거절 코드 enum에 연쇄 코드 셋을 더한다: `chain_return`, `chain_one`, `chain_limit`.
  - v5 enum 확장으로 둘지, v5를 바꾸지 않고 연쇄 거절을 v8에만 둘지는 `/feature-review` tech에서 정한다.
  - 이전 CLI가 모르는 코드를 받으면 지금 generic 처리로 `bad_request`처럼 보이는지 확인한다.
- 대화 기록의 `origin`(`HandoffOrigin`, `app/src/main/conversation/types.ts`)에 필드를 더한다.
  - `via: "handoff" | "send"`
  - `depth: number`(1부터)
  - `chain: string[]`: 연쇄에 있던 대화 ID, 0단계 대화부터 보낸 대화까지
  - 기존 기록에는 이 필드가 없다. 없으면 `via: "handoff"`, `depth: 1`, `chain: [conversationId]`로 읽는다.
- 대화 기록 이벤트
  - `handoff.requested`/`handoff.resolved`에 `via`를 더한다.
  - `send`의 결과는 `{outcome: "sent", target: {conversationId, canvas}, queued: boolean}`이다.

### 앱 main

- `conversation/handoff.ts`(순수 규칙)
  - `handoffEligibility`
    - 연쇄 판정을 더한다: 보내는 턴의 단계와 연쇄 목록, 이번 턴의 요청 수를 본다. 순서는 지금 판정 뒤에 `chain_one` → `chain_limit` 순이다.
    - `chain_return`은 판정 시점에 대상 대화가 정해져야 알 수 있다. 그래서 `send`는 `handoffDecision`에서 보고, `handoff`는 늘 새 대화라 걸리지 않는다.
    - 지금의 `handoff_turn`(handoff로 시작한 턴의 거절)은 지운다. enum에는 남겨, 이전 앱을 상대하는 CLI가 읽을 수 있게 한다.
  - `handoffDecision`: "턴 시작 때의 스냅샷에 없던 캔버스" 조건을 지운다. 정확히 하나로 나열, 자기 캔버스 아님만 남는다. `send`는 대상 대화를 정하고, 그 대화가 연쇄 목록에 있으면 `chain_return`으로 거절한다.
  - 새 `latestConversation(canvas, conversations)`: 그 캔버스 대화 가운데 마지막 활동이 가장 최근인 것. 같은 시각이면 먼저 만든 대화다.
  - `handoffQueueOutcome`: `sent` 결과는 보낸 쪽 큐를 지금 `refused`처럼 보낸 쪽으로 보낸다. 큐는 받는 쪽으로 옮기지 않는다. 받는 대화는 이미 다른 대화이기 때문이다.
- `conversation/service.ts`
  - `requestSend`를 `requestHandoff` 옆에 둔다. `HandoffTurn`의 요청에 `via`를 넣고, 같은 판정 시점과 정착 기한, 취소 규칙을 쓴다.
  - 판정이 `sent`이면 받는 대화에 메시지를 넣는다.
    - 쉬고 있으면 `send`를 시작한다.
    - 돌거나 답을 기다리면 큐 끝에 넣는다.
    - 메시지에는 `origin`이 붙는다. 앵커는 없고, `{{n}}` 마커로 읽지 않는다.
  - 큐에 든 에이전트 메시지는 사람 메시지와 섞여 하나의 메시지로 나갈 수 있다. 섞일 때도 `origin`을 잃지 않도록, 큐 규칙에서 에이전트 메시지는 따로 한 턴으로 나간다. 이 처리는 `/feature-review` tech에서 확인한다.
  - 받는 대화의 provider, model, effort, Fast, permission mode는 그대로 쓴다. 사용량 한도가 걸려 있으면 지금 한도 대기 규칙(사람 메시지와 같다)을 따른다.
- `conversation/prompt.ts`
  - `HANDOFF_GUIDANCE`를 고친다. 새 캔버스는 지금처럼 넘긴다. 기존 캔버스는 사람이 지시했을 때만 `handoff`나 `send`를 쓴다.
  - 받은 메시지로 시작한 턴에도 가이드를 준다. 지금은 주지 않는다(`No HANDOFF_GUIDANCE: no second hop`). 그 턴에는 "받은 메시지가 명시적으로 요청할 때만 다시 보내고, 보낸 곳으로 되돌려 보내지 않는다"는 문장을 더한다.
- `runtime.ts` `answerLine`: `v: 8` 분기를 더한다.
- 프로토타입 창 알림(`conversation:handoff`)에 `send` 결과를 더한다.

### 앱 renderer

- canvas 카드(`threadItems.ts`, `canvasCardText.ts`): `send`의 상태와 연쇄 거절 이유의 문구. 모양은 그대로다.
- 받은 쪽: thread-polish의 받은 handoff 버블을 대화 중간의 `user.message`에도 쓴다. 지금 `handoffCard`는 첫 메시지만 가정하므로, `origin`이 있는 모든 `user.message`를 그 버블로 그린다.
- 큐 줄: 에이전트 메시지에 보낸 곳 표시를 더한다(드래프트).
- 알림 토스트: `send` 문구(드래프트).
- 받는 쪽의 unseen 표시와 사이드바 표시는 지금 handoff로 시작한 대화의 규칙을 따른다.

## 순수 함수 (`/tdd` 대상)

- `handoffEligibility`: 단계 0과 1 이상, 요청 수 0과 1, 5단계, Plan 모드, 자기 캔버스, 같은 캔버스 중복(`handoff`와 `send`를 섞은 경우 포함).
- `handoffDecision`
  - 기존 캔버스가 시작되는 경우
  - 나열 안 됨, 둘로 나열됨, 자기 캔버스
  - `send`의 대상 대화 선택과 `chain_return`
- `latestConversation`: 대화 없음, 하나, 여럿, 같은 시각.
- `origin` 읽기: 필드가 없는 기존 기록의 기본값, 다음 단계의 `depth`와 `chain` 만들기.
- `handoffQueueOutcome`: `sent`가 섞인 결과.
- Go `send_rules.go`: 인자와 글자 규칙, 응답 읽기, 새 거절 코드의 exit 코드.

## 결정 영향

- PRODUCT §3 Out of scope 4의 handoff 예외, In scope 6, §5 item 2 'Handoff', item 10(CLI 명령 목록), 'Canvas cards'를 바꾼다(tasks 마지막).
- ARCHITECTURE §4에 'Send over app-socket v8'을 더한다. §7 'Handoff'의 판정, 키, 큐 규칙과 `prompt.ts` 설명을 고친다.
- 규약(ARCHITECTURE §1)과 `doan check` 영향은 없다. 스킬 stub과 가이드는 바뀐다.

## PoC

- 따로 없다. 다음은 `/agent-eval` 시나리오로 확인한다.
  - 에이전트가 가이드대로 지시가 있을 때만 기존 캔버스로 보내는가.
  - `handoff`와 `send`를 사람 말대로 고르는가.
  - 받은 턴이 되돌려 보내지 않는가.

## postmortem에서 가져온 주의

- 2026-11-18 "A handoff's first message that starts with a command name was drawn as a command turn": `send`로 온 메시지도 `origin`이 있으니 `messageCommand`가 명령으로 읽지 않는다. 큐를 거쳐 나갈 때도 같다.
- 2026-11-18 "A handoff line after a turn's end kept the unseen dot on the conversation the person was looking at": 받는 대화를 사람이 보고 있을 때 unseen 표시를 남기지 않는다.
- 2026-11-26 "A message queued behind a held send made the conversation's drafts unreadable two starts later", 2026-11-05 "A Send now row refused back into the queue could vanish while main still held it": 받는 대화의 큐에 에이전트 메시지를 넣는 경로는 사람의 큐 행과 같은 저장·복원 규칙을 지킨다. 재시작, 삭제, 거절 뒤에도 사라지거나 초안을 깨뜨리지 않는지 테스트한다.
- 2026-10-28 "A send right after turn.done was refused as busy until the previous process group was gone": 받는 대화가 방금 끝난 경우의 시작은 지금 send의 바쁨 판정을 그대로 쓴다.
- 2026-11-13 "One missing handoff in an eval run was reported as three failed checks": 새 eval 시나리오의 판정은 요청 하나당 한 번만 센다.

## 드래프트 요청

- 경로 `.doan/canvases/canvas-message.html`, canvas id `canvas-message`, 폭 1440. 새 스타일 없이 기존 부품의 상태와 문구만 그린다.
- 프레임
  - `source-cards`: 보낸 쪽 canvas 카드의 `send` 상태들과 연쇄 거절 이유 셋.
  - `received`: 대화 중간에 들어온 `send` 메시지 버블(thread-polish 버블 그대로).
  - `queue`: 큐에 든 에이전트 메시지 줄.
  - `toasts`: `send` 알림.
