# multi-handoff — design

## 결정 (사용자 확인 완료)

- **D1 상한**: 턴 하나가 시작하는 핸드오프 대화 수에 상한을 두지 않는다. 이유: 사용자가 "몇 개든"이라고 했고, 핸드오프는 사람이 보낸 메시지의 턴에서만 생긴다.
- **D2 큐**: 모든 요청이 해결된 뒤 한 번만 처리한다. 요청이 하나면 지금과 같다. 둘 이상이면 취소가 하나라도 있으면 초안, 아니면 소스. 이유: 메시지가 어느 캔버스를 향하는지 Doan이 알 수 없고, Stop이나 sign-out 직후 큐가 전송되면 안 된다.
- **D3 화면**: 시작된 것이 둘 이상이면 이동하지 않는다. 소스 캔버스 페이지에 있으면 아무것도 띄우지 않고, 다른 곳이면 요약 토스트 하나(“<source file> handed off to <n> canvases”, Open은 소스). 이유: 큐가 소스로 가므로 화면도 소스에 둬야 맞고, 요청 순서는 에이전트가 정한 것이라 사람이 관심 있는 캔버스라는 보장이 없다.
- **D4 누락 줄**: “Didn’t hand off to <file>. The agent didn’t ask to.” + Open(그 캔버스, Quick Open 경로). 아이콘은 기존 거절 줄과 같은 `ban`. 이유: 기존 핸드오프 줄과 같은 첫 단어로 훑어 읽을 수 있고, Open은 Doan이 이미 제공하는 이동이라 에이전트를 깨우겠다는 약속이 아니다(clarify preset).
- **D5 안내 범위**: 이번 턴에 만든 모든 새 캔버스에 핸드오프한다. 사람이 하지 말라고 하거나 머물라고 할 때만 예외다. 그런 턴에도 누락 줄은 사실대로 나온다.

## 영향받는 구성 요소

### 앱 main (`app/src/main/conversation/`)

- `handoff.ts`
  - `HandoffAsker.requested: boolean` → `requested: readonly string[]`(이 턴에 받은 경로들). `already_requested`는 같은 경로가 이미 있을 때만 쓴다. 검사 순서는 지금과 같다.
  - `handoffDecision`은 요청 하나 단위 그대로 재사용한다.
  - 새 순수 함수 `missedHandoffs`, `handoffQueueOutcome`, `handoffNoticeKind` (아래).
- `service.ts`
  - `HandoffTurn.request?` → `requests: { path; text; state: "taken" | "judging" | "starting" | "resolved"; decision? }[]`, 새 필드 `guided: boolean`(턴을 보낼 때 `HANDOFF_GUIDANCE`를 받았는지), `edits: Set<string>`.
  - `receive()`: edit 활동 경로를 `evidence`뿐 아니라 그 대화의 `HandoffTurn.edits`에도 넣는다(지금은 프로젝트 턴의 `evidence`에만 넣는다).
  - 판정: 턴이 done으로 끝나면 요청마다 `handoffDecision`을 부른다. 하나라도 `wait`이면 새로고침이나 마감(`promotionDeadline`)까지 기다리고, 모두 결정되면 시작할 요청을 요청 순서대로 하나씩 `await`해 시작한다. 이렇게 순서를 고정해야 `refreshed()`가 다시 판정할 때 이미 `starting`인 요청을 또 시작하지 않는다. 동시 `start` 경합은 이유가 아니다. `start()`는 `entries` 읽기와 `acceptStart`를 같은 틱에 하므로 다른 캔버스에 대한 동시 시작은 이미 안전하다.
  - `checkHandoffSource`는 턴 상태 대신, 지금 시작하는 요청이 `starting`인지와 소스가 current인지 본다. 요청 사이의 `await` 뒤에도 같은 검사를 다시 한다(POSTMORTEM 2026-10-27).
  - `start()`의 `moveQueue`를 `HandoffStart`에서 떼어 낸다. 큐는 마지막 요청이 해결될 때 `handoffQueueOutcome`의 결과로 한 번만 처리한다(`move`면 그때 유일한 대상 대화로 옮긴다). `resolveHandoff`는 요청 하나의 `handoff.resolved`만 쓰고, 큐 처리와 `waiters` 해제는 턴 단위로 한 번 한다.
  - 알림: 모든 요청이 해결된 뒤 `handedOff`를 턴마다 한 번 부른다. 시작된 대상이 하나면 지금 `HandoffNotice`, 둘 이상이면 `targets` 목록을 실은 알림(`handoffNoticeKind`).
  - `judge()`의 `contested`: 해결 안 된 요청이 하나라도 있는 핸드오프 턴의 모든 요청 경로와, 그 턴의 스냅샷에 없는 목록 캔버스를 넣는다.
  - `stopRuns`, 보관, `dropHandoff`, 실패한 기록: 남은 요청을 모두 취소하거나 버린다.
  - 누락 판정: `guided`인 턴이 done으로 끝나면, 핸드오프 판정과 같은 마감에 `missedHandoffs`를 한 번 부르고, 결과마다 `handoff.missed`를 쓴다. 이 대기는 큐와 `working`을 붙잡지 않는다. 그래서 `HandoffTurn`과 따로 `missedWaits: Map<conversationId, { turnId; timer; ... }>`에 둔다(다음 send가 `handoffTurns`를 덮어써도 남는다). `delete`·`archive`·`quit`·`dropHandoff`가 이 대기를 함께 지운다. 쓰기 직전에 메타데이터가 있고 current인지, 기록이 쓰기를 받는지 다시 확인한다. 삭제된 history를 `append`가 다시 만들지 않게 하기 위해서다.
  - Send now: `!current?.request` 조건을 없애서, 요청이 있었어도 끼어든 메시지의 프롬프트에 안내를 남긴다.
- `project.ts`: edit 경로(절대 경로나 공급자가 보고한 모양)를 목록 캔버스로 바꾸는 `canvasesAt`를 export해서 `missedHandoffs`가 재사용한다. 새로 구현하지 않는다.
- `types.ts`: `handoff.resolved`에 `canvas: { path }` 추가, 새 이벤트 `handoff.missed { canvas: Canvas }`(path와 id. 나중에 사라짐·이름 변경을 ID로 판정하기 위해서다).
- `store.ts`: 이벤트 검증에 위 필드와 타입을 추가한다. 경로 없는 `handoff.resolved`도 계속 받는다.
- `state.ts`: `handoffs`를 턴 안에서 경로별로 접는다. 재시작 때 대기 중인 요청은 모두 cancelled로 접는다. 이 필드는 파일 밖에서 읽는 곳이 없으므로 변경을 최소로 한다.
- `summary.ts`: `handoff.missed`도 `handoff.resolved`처럼 unseen 계산에서 뺀다.
- `prompt.ts`: `HANDOFF_GUIDANCE` 문구(spec 완료 조건 6).
- `runtime.ts`: `HANDOFF_MESSAGES.already_requested`를 "This turn already handed off to this canvas."로 바꾼다.
- `index.ts`: 다중 대상 알림을 렌더러로 전달한다.

### 렌더러 (`app/src/renderer/`)

- `threadItems.ts`
  - 핸드오프 줄 키를 `h${turnId}` → `h${turnId}:${path}`로 바꾼다. 같은 턴의 두 번째 요청을 버리지 않는다(지금은 `threadItems.ts:265`에서 버린다).
  - `handoff.resolved`는 `canvas.path`로 줄을 찾고, 경로가 없으면 그 턴의 유일한 줄에 붙인다.
  - `handoff.missed`는 `handoff` 줄의 새 outcome `missed`로 그린다. 그 턴의 마지막 핸드오프 줄 뒤, 없으면 그 턴의 끝에 둔다. 이벤트가 다음 사용자 메시지 뒤에 도착해도 턴 위치에 둔다.
- `handoffView.ts`
  - `missed` 문구와 Open(D4).
  - 다중 대상 알림: 소스 캔버스 페이지면 아무것도 하지 않고, 아니면 요약 토스트를 띄운다(`handoffToastText`의 n개 형태). Open은 소스다.
- `ConversationThread.tsx` `HandoffLine`: Open의 `aria-label`을 “Open <file>”로 한다.
- `App.tsx`: 다중 대상 알림을 처리한다. 알림은 턴마다 하나뿐이라, 새 알림이 오면 기다리던 이전 알림을 토스트로 바꾸는 지금 동작(App.tsx 1600 부근)과 충돌하지 않는다.

### CLI (`cli/internal/cli/handoff_rules.go`)

- `already_requested`의 next step(`:90`)을 "This turn already requested a handoff to this canvas; hand off each other new canvas once"로, 메시지(`:136`)를 "This turn already requested a handoff to this canvas"로 바꾼다. 요청·응답 형식은 그대로다.

### eval

- 프롬프트를 바꾸는 커밋에서 R8d·R9b·R10의 `prompt.md`와 R10 `rubric.md`를 새 `turnPrompt`대로 함께 갱신한다. `prompt.test.ts`가 둘을 비교한다. ARCHITECTURE §14의 "앱 문구를 따르는 프롬프트는 테스트로 비교한다"에 해당하므로 같은 id 안에서 고치고, 회차 기록에 적는다(선례 `4144551b`).
- 새 시나리오 R11: 새 캔버스 두 개를 만들고 각각 이어서 작업하라는 요청. `checks.ts`는 경로가 다른 수락 요청 두 개와, 각 요청이 그 캔버스를 쓴 뒤에 왔는지 본다. 헬퍼는 `eval/lib/handoff.ts`에 둔다.
- fake app(`eval/lib/socket.ts`)의 `already_requested`는 같은 경로일 때만 낸다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `handoffEligibility(ask, asker)`: `requested` 경로 배열 기준 `already_requested`, 그 밖의 순서는 그대로.
- `missedHandoffs({ root, edits, listed, snapshot, requested, source, current })` → 누락 캔버스 목록. 조건은 spec 완료 조건 7.
- `handoffQueueOutcome(resolutions)` → `"move" | "source" | "draft"` (D2).
- `handoffNoticeKind(started)` → 없음 / 단일 / 다중 (D3).
- `handoffMove` 계열: 다중 알림에서 소스 페이지면 아무것도 하지 않고, 아니면 토스트.
- `foldConversation`의 핸드오프 접기(경로별, 경로 없는 기존 `handoff.resolved`, `missed`).
- `threadItems`의 핸드오프 줄(경로별 키, `missed` 위치).
- `handoffLineText`의 `missed` 문구와 Open, `handoffToastText`의 다중 형태.

## 형식 변경

- 이벤트 JSONL v1: `handoff.resolved.canvas?: {path}`(새 기록은 항상 씀), 새 타입 `handoff.missed { canvas: Canvas }`.
  - 이벤트 기록에는 JSON Schema가 없다(`schema/`에 없음). 원천은 `types.ts`와 `store.ts` 검증이고 `v`는 올리지 않는다.
  - 이전 빌드는 `handoff.resolved`의 추가 필드를 그대로 읽는다. 하지만 `handoff.missed` 줄은 알 수 없는 타입이라 그 history 전체를 손상으로 읽는다. 핸드오프 요청이 없어도 누락 줄이 생긴 캔버스 대화면 모두 해당한다. ARCHITECTURE §7 'Events'가 이미 허용하는 범위(이전 빌드로 돌아가는 것은 지원하지 않음)이고, 승격 때 이 결과를 문장으로 적는다.
- 앱 소켓 v5, CLI 응답: 없음.
- main→renderer `conversation:handoff`: 다중 대상 형태가 추가된다.

## 규약 영향

- ARCHITECTURE §1 규약, `doan check` 규칙: 없음.

## 결정 영향

- PRODUCT §3 Out of scope 4의 예외가 "새 대화 하나"에서 "새 캔버스마다 하나"로 넓어진다(사용자 승인). Doan이 메시지를 쓰거나 요청 없는 캔버스에 대화를 시작하지 않는다는 경계는 그대로다.
- 앱 소켓 경계(토큰, 키): 그대로다. 키는 여전히 대화를 가리킬 뿐이다.

## 관련 POSTMORTEM

- 2026-10-27 'Awaited conversation work outlived its current turn': `await` 뒤에 현재 메타데이터와 live 식별을 다시 확인한다.
  - 요청을 차례로 시작하는 동안 소스가 보관되거나 Stop되면, 남은 요청은 `checkHandoffSource`로 취소된다.
  - 누락 판정 타이머는 대화가 삭제·보관된 뒤에 history를 쓰지 않는다.
  - 둘 다 회귀 테스트로 고정한다.
- 2026-11-09 'A deny on userData silently beat the allows…': Codex Ask first에서 승인된 escalated `doan handoff`가 runtime 파일을 읽어야 한다. 한 턴에 두 번 실행해도 같은 경로이므로 새 위험은 없지만, 실제 앱 확인에서 Codex Ask first로 두 번 실행해 본다(승인 두 번이 정상이다).

## PoC 의존

- 없음. "에이전트가 새 캔버스마다 핸드오프를 실행하는지"는 프롬프트에 달려 있으므로 `/agent-eval` R11로 측정한다.
- 누락 줄은 edit 활동 경로에 의존한다.
  - Claude Code와 Codex도 셸로 만든 파일은 command 활동이라 경로가 없다(`transport.ts`).
  - Claude Code·Codex가 아닌 공급자의 edit 보고는 확인되지 않았다(ARCHITECTURE §7 'Project conversations and promotion' "Edit evidence is unconfirmed for other providers").
  - 이 한계는 PRODUCT·ARCHITECTURE에 적고, 미확인 공급자는 BACKLOG에 새 줄로 남긴다.
