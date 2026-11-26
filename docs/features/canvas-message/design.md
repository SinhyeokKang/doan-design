# canvas-message — 설계

## 순서 제약

- 시작 조건: check-scope(체인 링크 1), answer-popover(체인 링크 2), thread-polish가 develop에 머지됐다.
  - check-scope는 `prompt.ts`를 바꾼다.
  - answer-popover는 `ConversationThread`, `conversationStore`, `CanvasConversationPanel`, `styles.css`를 바꾼다.
  - thread-polish는 받은 handoff 버블과 메타 뷰(`handoffView.ts`)를 만든다.
- canvas-chip도 `prompt.ts`와 `ConversationThread`를 바꾼다. canvas-chip이 먼저 머지되면 시작할 때 `prompt.ts`와 `eval/` 프롬프트 fixture를 다시 맞춘다. 순서는 사용자가 정한다.

## 영향 받는 부분

### CLI (Go)

- `handoff.go`, `handoff_rules.go`
  - 판정은 앱에 있으므로 "새 캔버스" 조건은 CLI에 없다.
  - v5 거절 코드 `chain_one`, `chain_limit`을 읽고 exit 5로 낸다: `handoffFailure`, `handoffReply` 맵, `envelope.go`의 `ExitCode` 5 목록.
- 새 `send.go`, `send_rules.go`, `send_test.go`
  - `doan send <canvas> --message <text|->`
  - 인자, `--message`, 표준 입력, 글자 규칙, 줄 한도, 경로 좁히기(`.doan/canvases/*.html`), `canvas_not_found`, `DOAN_HANDOFF` 키, 앱을 띄우지 않음은 `doan handoff`와 같다.
  - 같은 부분은 `handoff_rules.go`의 함수를 함께 쓴다.
  - CLI result는 `{requested: true, canvas}`이고, 출력 문구는 "Doan sends it when this turn ends"다.
- `run.go`: help와 `ctx.Handoff` 분기.
- `formats/validate.go`, `schema/embed.go`: v8.
- `skill.md`, `skill_test.go`, 가이드.
- Codex 규칙(`codexRuleText`, `plan.ts`)에는 `handoff`처럼 `send`도 넣지 않는다.

### 형식

- app-socket v8
  - 파일: `schema/app-socket.v8.schema.json`. fixtures: `schema/fixtures/app-socket-v8/{request,response}/{valid,invalid}`
  - 요청 모양은 v5와 같다. ok 응답은 `{v: 8, ok: true, requested: true}`다.
  - `errorCode`는 v5와 같은 집합이다. 버전마다 독립이라 `$ref`로 공유하지 않는다.
  - v8도 대화 토큰을 받는다. ARCHITECTURE §11의 토큰 허용 목록("v1 and v3–v6")과 "v2 through v7"을 고친다.
  - 이전 앱은 v8에 v1 `bad_request`로 답한다. CLI는 이것을 `app_protocol_mismatch`로 읽는다. 이 경우를 fixture로 고정한다.
  - v5에 `kind` 필드를 더하는 방식은 쓰지 않는다. 이전 앱이 `additionalProperties: false`로 거절하기 때문이다.
- v5 `errorCode`에 `chain_one`, `chain_limit`을 더한다. `$comment`의 판정 순서 설명도 고친다.
  - 이전 CLI는 이 두 코드를 스키마 검사 실패로 보고 `internal_error`(exit 1)로 읽는다. 이전 CLI와 새 앱 조합에서, 새 앱에만 있는 1단계 이상 턴이 거절될 때만 생긴다. 턴은 계속되고 다른 상태는 바뀌지 않는다. 이를 받아들이고, ARCHITECTURE §4에 "새 버전은 다른 버전의 답을 바꾸지 않는다"의 예외로 적는다.
  - `chain_return`은 소켓 거절이 아니다. 판정 시점(턴 끝 뒤)에 정해지는 `HandoffReason`으로 카드에만 쓴다.
- 대화 기록 `origin`(`HandoffOrigin`)
  - `kind: "handoff"`는 그대로 둔다. 이전 빌드의 검사가 이것을 요구하고 모르는 키는 무시한다.
  - 더하는 필드
    - `via: "handoff" | "send"`
    - `chain: string[]`: 1–5개의 대화 ID. 0단계 대화부터 보낸 대화까지이고, 마지막 항목은 `conversationId`와 같다. 각 항목의 길이 한도는 `LIMITS.label`이다.
  - 단계는 `chain.length`다. 필드가 없는 기존 기록은 `via: "handoff"`, `chain: [conversationId]`로 읽는다.
- 대화 기록 이벤트
  - `handoff.requested`/`handoff.resolved`에 `via`를 더한다.
  - `send`의 결과는 `{outcome: "sent", target: {conversationId, canvas}, queued: boolean}`이다. `target.conversationId`는 실제로 간 대화다.
  - 이전 빌드는 `sent`를 읽지 못해 그 대화의 기록 전체를 읽지 못한다. ARCHITECTURE §7의 하위 호환 문단에 이것을 적는다.
- 큐 행(`QueuedItem`, `drafts.ts`)에 `origin`을 더한다.
  - `origin`이 있는 행은 앵커가 비어 있어야 하고 `{{n}}` 마커로 읽지 않는다. 사람 행의 `anchorTokens` 검사와 따로 둔다.
  - 이렇게 해야 에이전트 글의 `{{1}}`이 drafts.json을 "unreadable"로 만들지 않는다.

### 앱 main

- `conversation/handoff.ts`(순수 규칙)
  - `handoffEligibility`
    - 지금 판정 뒤에 연쇄 판정: `chain_limit`(단계 5) → `chain_one`(1단계 이상이고 이번 턴에 이미 받은 요청이 있음).
    - 받은 요청만 센다. 즉시 거절된 요청은 세지 않는다. 받았다가 판정에서 거절된 요청은 센다.
    - `handoff_turn`은 더 이상 내지 않는다. enum에는 남긴다.
  - `handoffDecision`
    - "턴 시작 때 스냅샷에 없던 캔버스" 조건을 지운다. 정확히 하나로 나열, 자기 캔버스 아님만 남는다.
    - `send`는 `latestConversation`으로 대상을 정한다. 그 대화가 `chain`에 있으면 `chain_return`이다. 없으면 새 대화를 시작한다.
  - 새 `latestConversation(root, canvas, summaries)`
    - 같은 root에서 `sameCanvas`(ID 우선)로 그 캔버스의 대화를 고른다.
    - Doan 연결이고 provider가 로그인된 대화 가운데 `lastActivityAt`이 가장 최근인 것. 같으면 conversationId 순서로 고정한다.
    - 패널이 보여 주는 대화(`pickShownConversation`)와 다를 수 있다.
  - `handoffGuidanceFor`: 입력을 `startedBy`에서 단계로 바꾼다. 0단계는 지금 가이드, 1–4단계는 받은 턴 가이드, 5단계는 없음.
  - `missedHandoffs`: 0단계 턴만 대상이다.
  - `handoffQueueOutcome`
    - 단일 기존 캔버스 `handoff`가 `started`면 지금처럼 move다.
    - `sent`가 섞이거나 `send`로 새 대화가 시작된 경우는 source다.
    - 취소는 지금 규칙을 따른다.
  - `handoffNoticeKind`: send 알림 변형을 판별자 필드로 더한다. 1단계 이상이거나 `send`면 화면을 옮기지 않는 종류다.
- `conversation/service.ts`
  - `requestSend`를 `requestHandoff` 옆에 둔다. `HandoffTurn`의 요청에 `via`를 넣는다. 같은 판정 시점, 정착 기한, 취소 규칙을 쓴다.
  - `send` 전달은 `submit`의 변형이다.
    - `drafts.hold`, `commandName`/`passthroughName` 판정, `checkReview`를 건너뛴다.
    - `user.message`에 `origin`을 붙이고, 프롬프트는 `handoffPrompt` 계열(`via`별 첫 문장)을 쓴다. `HandoffTurn`에 단계와 연쇄를 넣는다.
    - 수락 직전에 보낸 쪽 존재와 요청 상태를 다시 본다(`checkHandoffSource`와 같은 검사).
    - 받는 대화가 바빠 `busy`로 거절되면 큐로 넘긴다.
    - 받는 대화가 사용량 한도 상태(`scheduling(id)`)면 예약하지 않고 턴의 한도 실패로 끝낸다. 메시지는 큐 행으로 남는다.
  - 큐
    - `nextQueued`의 혼자 나가는 판정에 "origin 있음"을 더한다.
    - `flush`가 에이전트 행을 위 `send` 전달로 보낸다.
    - `sendNow`는 에이전트 행에 `bad_request`를 낸다.
    - `giveBack`과 재시작 merge는 에이전트 행을 초안으로 바꾸지 않고 큐에 남긴다. 재시작 뒤 큐에 에이전트 행만 남으면 저절로 나가지 않는다. 다음 done 턴 뒤에 나간다.
    - `drafts.move`(`moveQueue`)는 `origin` 있는 행을 옮기지 않는다.
  - 받는 대화를 사람이 보고 있는지(unseen)와 초안·포커스는 건드리지 않는다. 렌더러 상태는 main이 바꾸지 않는다.
- `conversation/prompt.ts`
  - `HANDOFF_GUIDANCE`(0단계)
    - 새 캔버스: 지금처럼 넘긴다.
    - 기존 캔버스: 사람이 지시했을 때만 `handoff`나 `send`를 쓴다. `send`의 쓰임을 한 문장으로 설명한다.
  - 받은 턴 가이드(1–4단계): "받은 메시지가 명시적으로 요청할 때만 `handoff`나 `send`를 한 번 쓰고, 보낸 곳으로 되돌려 보내지 않는다." 새 캔버스 자동 문장은 없다.
  - `handoffPrompt`의 첫 문장을 `via`별로 나눈다. `send`는 "대화 중간에 받은 메시지"로 쓴다.
- `runtime.ts` `answerLine`: `v: 8` 분기와 대화 토큰 허용. `HANDOFF_MESSAGES`에 새 코드 문구.
- 프로토타입 창: `conversation:handoff` 알림의 send 변형을 받고, 프로토타입 창은 지금처럼 아무것도 하지 않는다.

### 앱 renderer

- `threadItems.ts`는 이미 위치와 상관없이 `origin`이 있는 모든 `user.message`를 받은 버블로 그린다. 바뀌는 것은 메타 문구와 아이콘, 그룹 이름을 `via`별로 나누는 일이다(`handoffView.ts`).
- `summary.ts`의 `startedBy`는 첫 메시지만 본다. 대화 중간 `send`는 제목과 `startedBy`를 바꾸지 않는다.
- canvas 카드(`canvasCardText.ts`): `send` 상태 문구와 아이콘, 연쇄 거절 문구, 대상 대화 제목과 그 대화가 지워진 경우. 기존 기록의 `not_new`와 `handoff_turn` 문구는 남긴다.
- 큐 줄: 에이전트 행에 `send` 아이콘과 출처 이름을 둔다. 접근성 이름은 "Message from <source>: <summary>"다. ×만 있고 Send now는 없다. 색 왼쪽 선은 쓰지 않는다.
- Edit and resend: `origin`이 있는 메시지로 시작한 턴에는 없다. handoff 첫 턴의 규칙을 `origin` 전체로 넓힌다.
- 알림 토스트: send 변형의 문구(드래프트).

## 순수 함수 (`/tdd` 대상)

- `handoffEligibility`
  - 단계 0–5의 경계(4는 허용, 5는 `chain_limit`)
  - 1단계 이상의 두 번째 요청(`chain_one`). 0단계 다중 요청은 허용한다.
  - 즉시 거절은 세지 않는다.
  - Plan 모드, 자기 캔버스, `handoff`와 `send`를 섞은 같은 캔버스 중복
- `handoffDecision`
  - 기존 캔버스 시작
  - 나열 안 됨, 둘로 나열됨, 자기 캔버스
  - `send`의 대상: 쉼, 돌기, 없음(새 대화), 건너뛰기
  - `chain_return`: 대상이 `chain[0]`, 중간, 길이 4의 연쇄
- `latestConversation`: 대화 없음, 하나, 여럿, 같은 시각, legacy external과 로그아웃 건너뛰기, 다른 root, 이름이 바뀐 캔버스(ID 대조), 대상이 지금 도는 대화.
- `origin` 읽기와 다음 고리 만들기: 필드가 없는 기존 기록, `chain` 길이와 마지막 항목 검사.
- `handoffGuidanceFor`, `missedHandoffs`의 단계별 결과.
- `handoffQueueOutcome`: `sent`가 섞인 결과, `send`로 시작된 새 대화.
- 큐 규칙: `nextQueued`의 에이전트 행, `origin` 행 저장 검사(마커가 든 글), `moveQueue`가 에이전트 행을 남김, 재시작 merge.
- Go `send_rules.go`: 인자와 글자 규칙, 응답 읽기, 새 코드의 exit 코드, 이전 앱의 v1 `bad_request`.

## 결정 영향

- PRODUCT
  - §3 Out of scope 4의 handoff 예외, In scope 6
  - §4 Loop
  - §5 item 2 'Handoff'(판정, 연쇄, 화면 이동, 큐, Edit and resend, 제목)
  - item 1 큐 규칙(에이전트 행)
  - item 10 CLI
  - 'Canvas cards'
- ARCHITECTURE
  - §4 'Send over app-socket v8', 'Handoff over app-socket v5'의 거절 코드와 예외
  - §7 'Handoff'(판정, 키, 큐, 가이드), 하위 호환 문단, `prompt.ts`
  - §11 토큰 허용 목록
  - §12 CLI 출력 계약에 `doan send`
- 규약(ARCHITECTURE §1)과 `doan check` 영향 없음. 스킬 stub, 가이드, README의 CLI 설명은 바뀐다.

## PoC

- 따로 없다. 가이드 준수는 `/agent-eval` 시나리오로 확인한다.

## postmortem에서 가져온 주의

- 2026-11-18 "A handoff's first message that starts with a command name was drawn as a command turn": `send`로 온 메시지도 `origin`이 있으므로 `messageCommand`가 명령으로 읽지 않는다. 큐를 거쳐 나갈 때도 같다. `send` 전달은 명령 판정을 건너뛴다.
- 2026-11-18 "A handoff line after a turn's end kept the unseen dot on the conversation the person was looking at": 받는 대화를 사람이 보고 있으면 unseen 표시를 남기지 않는다.
- 2026-11-26 "A message queued behind a held send made the conversation's drafts unreadable two starts later"와 2026-11-05 "A Send now row refused back into the queue could vanish while main still held it": 에이전트 행은 `origin` 검사로 따로 저장한다. 재시작, 삭제, 거절 뒤에도 사라지거나 drafts를 깨뜨리지 않는지 테스트한다.
- 2026-10-28 "A send right after turn.done was refused as busy until the previous process group was gone": 받는 대화가 방금 끝난 경우의 `busy`는 큐로 넘긴다.
- 2026-11-13 "One missing handoff in an eval run was reported as three failed checks": 새 eval 시나리오의 판정은 요청 하나당 한 번만 센다.

## 드래프트 요청

- 경로 `.doan/canvases/canvas-message.html`, canvas id `canvas-message`, 폭 1440. 새 스타일 없이 기존 부품의 상태와 문구만 그린다.
- 프레임
  - `source-cards`: 보낸 쪽 canvas 카드
    - `send`의 대기, Sent to, Queued in, 대상 대화 삭제
    - 연쇄 거절 셋(`handoff`와 `send` 각각)
    - 기존 캔버스 `handoff`
  - `received`
    - 대화 중간에 들어온 `send` 버블: thread-polish 버블에 `send` 아이콘과 "Message from"
    - 그 버블의 턴 실패(Edit and resend 없음)
  - `queue`
    - 큐에 든 에이전트 행(×만)
    - 사람 행과 섞인 큐
    - 재시작 뒤 남은 에이전트 행
  - `toasts`
    - `send` 알림
    - 1단계 이상 `handoff` 알림
    - 섞인 묶음
