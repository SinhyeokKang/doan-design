# multi-handoff — design

## 결정 (사용자 확인 완료)

- **D1 상한**: 턴 하나가 시작하는 핸드오프 대화 수에 상한을 두지 않는다. 이유: 사용자가 "몇 개든"이라고 했고, 핸드오프는 사람이 보낸 메시지의 턴에서만 생긴다.
- **D2 큐**: 요청이 하나면 지금처럼 큐가 새 대화로 옮겨 간다. 요청이 둘 이상이면 모든 요청이 해결된 뒤 큐는 소스 대화로 간다. 단, 하나도 시작하지 못하고 전부 취소됐으면 초안으로 돌려준다. 이유: 메시지가 어느 캔버스를 향하는지 Doan이 알 수 없다.
- **D3 화면 이동과 토스트**: 시작된 핸드오프 중 요청 순서가 가장 앞선 것 하나만 지금 규칙(이동 또는 토스트)을 따른다. 나머지는 이동도 토스트도 없이 소스 스레드의 줄과 Open으로만 알린다. 이유: 토스트 n개는 소음이고, 줄에 Open이 이미 있다.
- **D4 누락 표시 문구**: “Made <file> without handing off.” 아이콘 `ban`, 액션 없음. (clarify preset 적용: 일어난 사실 하나만 말하고, Doan이 제공하지 않는 다음 행동은 약속하지 않는다.)

## 영향받는 구성 요소

- **앱 main** (`app/src/main/conversation/`)
  - `handoff.ts`: `HandoffAsker.requested: boolean` → `requested: readonly string[]`(이 턴에 받은 경로들). `already_requested`는 같은 경로가 이미 있을 때만. `handoffDecision`은 요청 하나 단위 그대로 쓴다. 새 순수 함수 `missedHandoffs`.
  - `service.ts`: `HandoffTurn.request?` → `requests: HandoffRequestState[]`(요청마다 `path`, `text`, `state`). `ended`·`judgeHandoff`·`startHandoff`·`resolveHandoff`·`handoffPending`·`stopRuns`·`judge`의 `contested` 계산을 요청 배열 기준으로 바꾼다. 턴 단위 대기(`waiters`, 큐 보류)는 모든 요청이 `resolved`가 될 때 풀린다. 시작은 요청 순서대로 하나씩 `await`한다(같은 루트의 `start` 동시 실행과 `has_conversation` 경합을 피한다). 누락 표시 판정은 요청이 없거나 일부만 있어도 done 턴마다 같은 마감(`promotionDeadline`)에 한 번 한다.
  - `types.ts`: `handoff.resolved`에 `canvas: { path }` 추가, 새 이벤트 `handoff.missed { canvas: { path } }`.
  - `store.ts`: 이벤트 검증에 위 두 필드/타입 추가. 경로 없는 `handoff.resolved`도 계속 받는다.
  - `state.ts`: `handoffs: Record<turnId, HandoffFold>` → 턴 안에서 경로별로. 재시작 접기는 대기 중인 요청을 모두 cancelled로.
  - `summary.ts`: `handoff.missed`도 `handoff.resolved`처럼 unseen 계산에서 뺀다.
  - `prompt.ts`: `HANDOFF_GUIDANCE` 문구 변경. `service.ts` Send now 경로에서 `!current?.request` 조건 제거.
- **렌더러** (`app/src/renderer/`)
  - `threadItems.ts`: 핸드오프 줄 키를 `h${turnId}` → `h${turnId}:${path}`. `handoff.resolved`는 `canvas.path`로 줄을 찾고, 없으면 그 턴의 유일한 줄. `handoff.missed`는 새 줄 종류(또는 `handoff` 줄의 새 outcome `missed`).
  - `handoffView.ts`: `missed` 문구(D4). D3 규칙은 main이 `HandoffNotice`에 `primary: boolean`을 실어 보내고, 렌더러는 `primary`가 아니면 이동·토스트를 하지 않는다.
- **CLI** (`cli/internal/cli/handoff_rules.go`): `already_requested` 메시지를 "이 캔버스로는 이미 요청했다"는 뜻으로 바꾼다. 요청·응답 형식은 그대로.
- **eval**: R10의 `prompt.md`는 새 `HANDOFF_GUIDANCE`를 따라 갱신, 새 시나리오 R10b(새 캔버스 두 개 → 경로가 다른 수락 요청 두 개). fake app(`eval/lib/socket.ts`)의 `already_requested`는 같은 경로일 때만.
- **형식**: 앱 소켓 v5 변화 없음. 이벤트 JSONL v1에 필드와 타입 추가(ARCHITECTURE §7 'Events': 이전 빌드가 새 줄을 손상으로 읽는 것은 지원 범위 밖).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `handoffEligibility(ask, asker)`: `requested` 배열 기준 `already_requested`.
- `missedHandoffs({ listed, snapshot, edits, requested, source })` → 이번 턴이 편집한 새 캔버스 중 요청이 없는 경로 목록(목록에 하나뿐인 캔버스, 소스 캔버스 제외).
- `handoffQueueOutcome(resolutions)` → `"move" | "source" | "draft"` (D2).
- `handoffPrimary(requests)` → 시작된 것 중 가장 앞선 요청(D3).
- `foldConversation`의 핸드오프 접기(경로별, 경로 없는 기존 `handoff.resolved` 호환).
- `threadItems`의 핸드오프 줄(경로별 키, `missed` 줄).
- `handoffLineText`의 `missed` 문구.

## 형식 변경

- 이벤트 JSONL v1: `handoff.resolved.canvas?: {path}`(새 기록은 항상 씀), 새 타입 `handoff.missed`. JSON Schema 원천이 아닌 `types.ts` + `store.ts` 검증이라 `v`는 올리지 않는다.
- 앱 소켓 v5, CLI 응답: 없음. `HandoffNotice`(main→renderer IPC)에 `primary` 추가.

## 규약 영향

- ARCHITECTURE §1 규약, `doan check` 규칙: 없음.

## 결정 영향

- PRODUCT §3 Out of scope 4의 예외가 "새 대화 하나" → "새 캔버스마다 하나"로 넓어진다(사용자 승인, 2026-11-13 대화). Doan이 메시지를 쓰거나 요청 없는 캔버스에 대화를 시작하지 않는다는 경계는 그대로다.
- 앱 소켓 경계(토큰, 키): 그대로. 키는 여전히 대화를 가리킬 뿐이다.

## 관련 POSTMORTEM

- 2026-10-27 'Awaited conversation work outlived its current turn': `await` 뒤에 현재 메타데이터와 live 식별을 다시 확인한다. 요청을 차례로 시작하는 동안 소스가 보관되거나 Stop되면 남은 요청은 `checkHandoffSource`로 취소되어야 한다. 회귀 테스트로 고정한다.
- 2026-11-09 'A deny on userData silently beat the allows…': Codex Ask first에서 승인된 escalated `doan handoff`가 runtime 파일을 읽어야 한다. 한 턴에 여러 번 실행해도 같은 경로이므로 새 위험은 없지만, 실제 앱 확인에서 Codex Ask first로 두 번 실행해 본다.

## PoC 의존

- 없음. 다만 "에이전트가 새 캔버스마다 핸드오프를 실행하는지"는 프롬프트에 달려 있으므로 `/agent-eval` R10b로 측정한다.
- `handoff.missed`는 활동 기록의 edit 경로에 의존한다. ACP 공급자(Cursor, Antigravity, Copilot)가 새 파일 생성을 edit 활동으로 보고하는지는 확인되지 않았다(BACKLOG 'Canvas handoff surfaces not verified'). 보고하지 않으면 그 공급자에서는 누락 표시가 나오지 않는다. 이 한계를 ARCHITECTURE에 적는다.
