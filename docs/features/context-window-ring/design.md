# context-window-ring — design

용어: **context 값**은 한 대화에서 provider가 보고한 "context window에 든 토큰 수(used)"와 "context window 크기(size)"의 쌍이다. **링**은 docked composer의 context 링이고, 헤더의 사용량 링(provider-usage)은 **사용량 링**이라고 쓴다.

선행 조건: provider-usage PR이 main에 병합된 뒤 시작한다(spec 머리말). 아래의 `AgentUsageButton.tsx`·`agentUsageView.ts`·`--border-track`은 그 PR의 것이다.

## 조사 결과(2026-11-05, 실행하지 않고 타입·스키마·번들로 확인)

context 값을 실제 대화에서 받아 본 provider는 없다. 로그인, 모델 호출, 프로필의 세션 파일 읽기 어느 것도 하지 않았다. 이미 저장소에 있는 ACP 트래픽 fixture 두 개(Copilot·Cursor, 2026-10-28 기록)는 읽었다.

| provider | 값의 출처 | 모양 | 상태 |
|---|---|---|---|
| Claude Code (SDK 0.3.312, 최소 CLI 2.1.284) | (a) 스트림: 최상위(`parent_tool_use_id` 없음) `assistant` 메시지의 `message.usage`(`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `@anthropic-ai/sdk` `BetaUsage`)와 `result`의 `modelUsage[model].contextWindow`(`sdk.d.ts:1475-1494`, `:6098`). (b) control request `getContextUsage({detail})` = `get_context_usage`(`sdk.d.ts:3105-3121`, `:4053-4100`) | (b)는 `totalTokens`, `maxTokens`, `rawMaxTokens`, `percentage`, 분류별 행. `'summary'`는 "마지막 응답의 usage와 로컬 추정"으로 답하고 분류별 token-count 호출을 하지 않는다. `rawMaxTokens`는 autocompact 창으로, 1M 모델에서는 더 작은 압축 정책 창(예: 200K)일 수 있다(`sdk.d.ts:3890-3905`) | (a)는 대화가 이미 받는 frame이다. `message.model`이 `modelUsage`의 키와 같은 문자열인지는 확인하지 않았다(키는 raw model 문자열이고 `canonicalModel`과 다를 수 있다, `sdk.d.ts:1495-1498`). (b)가 2.1.284에 있는지 확인하지 않았다 |
| Codex (스키마 0.166.0, 최소 0.158.0) | app-server 알림 `thread/tokenUsage/updated` (`codex-schema/v2/ThreadTokenUsageUpdatedNotification.json`) | `{threadId, turnId, tokenUsage: {last, total, modelContextWindow: int \| null}}`, `last`·`total`은 `{inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, totalTokens, cacheWriteInputTokens?}` | `thread/resume`·`thread/start` 응답과 `turn/completed`에는 토큰 값이 없다(같은 스키마 폴더 확인). 알림이 `turn/completed`보다 먼저 오는지, 0.158.0에 있는지 확인하지 않았다. 지금 `transport.ts`는 이 알림을 읽지 않는다 |
| GitHub Copilot (1.0.105, 최소 1.0.89) | ACP `session/update`의 `sessionUpdate: "usage_update"` `{used, size, cost?}`, `session/prompt` 응답의 `usage` | changelog 1.0.78: "Expose token usage in ACP prompt results and live usage_update notifications"(`~/Library/Caches/copilot/pkg/darwin-arm64/1.0.105/changelog.json`). `runtime.node`에 `usage_update` 문자열이 있다 | 최소 1.0.89가 1.0.78보다 새로우므로 모든 지원 버전에 있어야 한다. 2026-10-28에 기록한 실제 트래픽(`app/src/main/conversation/fixtures/acp-copilot.json`)의 prompt 응답에는 `usage`(`inputTokens` 40758, `cachedReadTokens` 등)가 있으나 window 크기는 없다. 그 fixture에는 `usage_update`가 없는데, fixture를 줄일 때 뺐는지 오지 않았는지는 모른다. 보내는 코드는 읽지 못했다(바이너리의 JS가 압축되어 있음) |
| Antigravity (ACP 서버 1.3.0) | ACP `usage_update` `{used, size}` | 서버 소스(`agy_acp_server.par`의 `AgyAdapter._maybe_send_usage_update`): `used`는 SDK 누적 사용량의 직전 대비 증가분(마지막 모델 호출의 크기), `size`는 모델의 window. window를 모르는 모델이면 보내지 않는다("skipping usage_update") | 직전 값이 없으면 누적 합계를 그대로 `used`로 보낸다. Doan은 턴마다 서버를 새로 띄우고 `session/load`하므로(`acpRunner.ts:22-24`), 다시 연 세션의 첫 값이 그 턴의 context인지 세션 누적인지 확인하지 않았다 |
| Cursor (2026.10.22) | 없음 | 번들된 ACP 스키마(`8096.index.js`, zod)에는 `usage_update`와 prompt 응답 `usage`가 있으나, Cursor의 ACP 서버 코드(`7096.index.js`)는 `{stopReason: "end_turn"}`만 돌려주고, 보내는 `sessionUpdate` 목록에 `usage_update`가 없다. TUI의 context 표시(`8008.index.js` `contextWindowSize`)는 ACP로 나가지 않는다 | 2026-10-28에 기록한 실제 트래픽(`fixtures/acp-cursor.json`)의 prompt 응답도 `{stopReason: "end_turn"}`뿐이다. 다만 그 fixture도 줄인 것이라 `usage_update`가 없었음을 보장하지 않는다 |

참고(기억, 확인하지 않음): Codex TUI의 "context left"는 window에서 고정 기준값을 뺀 비율로 계산한다고 알고 있다. Doan은 따르지 않고 원시 비율을 쓴다(결정 4).

## 영향받는 구성 요소

app(Electron + TS)만 바뀐다. CLI(Go)·skills·guide·`doan check`·공유 JSON Schema는 바뀌지 않는다.

### 1. 값 읽기(main, transport)

- 상태: `TransportState`(Claude·Codex)와 `AcpTransport`에 그 턴에서 받은 마지막 context 값 `context?: { used: number; size: number }`을 둔다. 다음 턴은 비어서 시작한다.
- 내보내기: transport 함수가 턴의 terminal event(`turn.done`, `turn.failed`)를 낼 때, 상태에 값이 있으면 **terminal 바로 앞에** `{ type: "context.usage", used, size }` 하나를 낸다. 턴마다 많아야 하나다. service가 직접 쓰는 terminal(Stop의 `interrupted`, 앱 종료, crash 접기, `service.ts:522`·`:537`)에는 붙이지 않는다. service는 terminal 뒤의 event를 버리므로(`service.ts:402`), 값은 terminal 뒤에 올 수 없다.
- 값 검사: `used`·`size`는 음이 아닌 safe integer, `size ≥ 1`. 아니면 그 값은 버린다(턴은 그대로).
- **Claude**(`normalizeClaude`, `transport.ts:121`): 최상위 `assistant` frame마다 `used = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`와 `message.model`을 상태에 둔다. 하위 agent frame은 이미 버린다(`transport.ts:122`). terminal `result`(`:158`)에서 `modelUsage[model].contextWindow`를 `size`로 붙인다. 키가 맞지 않거나 window가 없으면 값이 없다. 스트리밍 frame의 usage가 중간값일 수 있으나 input 쪽은 요청 시작 때 정해진다고 보고, P1에서 확인한다. 이 길은 새 control request가 없어 턴 끝에 CLI 입력을 더 열어 두지 않는다(POSTMORTEM 2026-10-28, `runners.ts:54-57` `TURN_USAGE_MS`). P1에서 1M 모델의 압축 창 때문에 `getContextUsage`와 크게 다르면 결정 4를 다시 묻고, 답에 따라 이 항목을 바꾼다.
- **Codex**(`normalizeCodex`, `transport.ts:244`): `thread/tokenUsage/updated` 가운데 `threadId`·`turnId`가 지금 턴(`CodexContext`)과 같은 것만 읽는다(POSTMORTEM 2026-10-27 'Codex ingress'). `modelContextWindow`가 null이면 값이 없다. `used`는 기본으로 `last.totalTokens`이고 P2가 고정한다. `turn/completed`(`:296`)에서 terminal 앞에 낸다. 알림이 `turn/completed` 뒤에 오면(P2) 이 설계로는 값을 남기지 못하므로, 그때는 결정 3을 다시 묻는다.
- **ACP**(`normalizeAcp`, `acp.ts:138`): `usage_update`의 `used`·`size`를 상태에 둔다. `acpPromptDone`(`:170`)과 실패 경로(`acpPromptFailed`, `acpEnded`)가 terminal 앞에 낸다. `acpRunner.ts`는 `prompting` 중인 그 세션의 update만 넘기므로(`acpRunner.ts:64`) 다른 세션의 값은 들어오지 않는다. provider로 나누지 않는다: Cursor는 보내지 않아 값이 없고, Antigravity는 window를 모르면 보내지 않는다.
- legacy external 대화(터미널 세션)도 같은 runner와 transport를 쓰므로 값이 남는다. provider나 owner로 나누는 분기를 두지 않는다.

### 2. 기록(main, store)

- `EventPayload`에 `{ type: "context.usage"; used: number; size: number }`를 더한다(`types.ts:37`). service는 다른 비terminal event처럼 기록하고 보낸다(`conversation:event`). 새 IPC 채널은 없다.
- `store.ts`의 `payload()`(`:79`)에 새 type의 검사를 더한다. 검사가 없으면 읽기에서 손상으로 본다.
- 턴마다 한 줄이 늘고, 기록 상한(`CONVERSATION_HISTORY_BYTES`)과 append 경로는 그대로 쓴다(POSTMORTEM 2026-10-27 'Successful appends crossed the history reader's byte limit').
- 이 event는 thread에 그리지 않는다(`threadItems.ts:152`처럼 건너뜀). `foldConversation`(`state.ts:32`)의 턴 상태, unseen(마지막 seq는 그 뒤의 terminal), preview, summary는 바뀌지 않는다.

### 3. UI(renderer)

- 값: 호스트(`CanvasConversationPanel.tsx:434`, `ProjectOverview.tsx:406`)가 보이는 대화의 thread event(`ConversationStore.thread(id).events`)에서 마지막 `context.usage`를 읽어 `DockedComposer`에 새 prop `context`로 넘긴다. 새 대화 상태면 null이다. 보관된(archived) 대화도 마지막 값을 보인다.
- 링 primitive: `AgentUsageButton.tsx`의 `Ring`(SVG, `pathLength` 100, `--border-track` track, `--affordance-prominent` 값, 70% 이상이면 `--border-danger`)을 공유 컴포넌트로 빼고, 크기만 바꿔 쓴다. 사용량 링의 마크업과 측정값(DESIGN.md 'Agent usage' Measured contracts)은 그대로여야 한다. 색 기준 `DANGER`(`agentUsageView.ts`)도 같은 값을 쓴다(결정 6).
- 크기: 16px(`--size-icon`, 결정 7). 24px 링(viewBox 24, r 11, stroke 2)을 그대로 줄이면 stroke도 같이 가늘어지므로, 작은 링의 반지름·stroke는 `/design-draft`에서 정하고 `/design-sync`에서 잰다.
- 자리: 카드 안, Send 바로 왼쪽(결정 1). `.docked .composer-card`의 grid 영역(`styles.css:676`·`:681`)에 `ring`을 Send 왼쪽에 더한다. capsule에서도 box에서도 Send는 오른쪽 끝에 남는다. 링이 없으면 영역은 0폭이다.
- 이름과 글: 링은 `role="img"`, 이름 "Context window: 42% used". tooltip은 공유 tooltip으로 "42% of context used" 한 줄과 "84K of 200K tokens" 한 줄. 100%를 넘으면 실제 비율(예: "104% of context used")을 쓴다. 토큰 수는 1,000 미만이면 그대로, 1M 미만이면 "84K", 그 이상이면 "1.2M".
- 링은 갱신 때 움직임(transition)을 넣지 않는다(provider-usage의 링과 같음).

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. Claude: `normalizeClaude`의 context 상태(최상위 frame만, `modelUsage` 키 맞추기, window 없음, 숫자 검사)와 terminal 앞의 `context.usage` 하나.
2. Codex: `thread/tokenUsage/updated`의 `threadId`·`turnId` 검사, `modelContextWindow` null, `used` 계산, `turn/completed` 앞에 내기, 다른 턴의 알림 무시.
3. ACP: `usage_update` 읽기, `acpPromptDone`·`acpPromptFailed`·`acpEnded`가 terminal 앞에 내기, 값 없는 턴은 내지 않음.
4. `store.ts` `payload()`의 `context.usage` 검사(음수, 소수, `size` 0, 빠진 필드 거부).
5. renderer `contextRing(events)` → `{ percent, used, size } | null`: 마지막 `context.usage`, 없으면 null, 100% 초과 자르기(링)와 실제 비율(글).
6. 이름·tooltip 글과 토큰 수 표기(`tokenText`).
7. 공유 링의 색 단계(사용량 링과 같은 `DANGER`).

파일 이름: 컴포넌트와 순수 함수 모듈은 대소문자만 다른 이름을 쓰지 않는다(POSTMORTEM 2026-10-25 'A TS helper hid its TSX component'). 예: 컴포넌트 `ContextRing.tsx`, 순수 함수 `contextWindow.ts`.

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11): 없다. 대화 event는 TypeScript만 읽는 device-local 포맷이다.
- 대화 event JSONL v1에 `context.usage` type을 더한다. `v`는 올리지 않는다: `question.request` 등을 더할 때와 같이, 이 type을 모르는 이전 build는 그 줄을 손상으로 읽고, 이전 build로 돌아가는 것은 지원하지 않는다(ARCHITECTURE §7 'Events').
- fixture: P1–P4의 실제 frame에서 개인 정보를 지운 사본을 transport 테스트 입력으로 둔다(위치는 `/tdd`에서 기존 `app/src/main/conversation/fixtures/`를 따른다). Go는 읽지 않는다.

## 관례 영향

ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 바뀌지 않는다. guide·CLI 출력·skill stub이 그대로이므로 `/agent-eval`은 필요 없다.

## 결정 영향

- **append-only event**: 지킨다. 값은 새 event로 더하고 이전 event를 고치지 않는다.
- **턴마다 terminal 하나**(ARCHITECTURE §7 'Permissions and terminals'): 지킨다. `context.usage`는 terminal이 아니고 terminal 앞에만 온다.
- **사람의 메시지만 agent 작업을 시작함**(PRODUCT §3 Out of scope 4): 지킨다. 대화가 이미 받는 출력만 읽고 새 요청을 보내지 않는다.
- **턴 끝의 다음 send 대기**(POSTMORTEM 2026-10-28, `EXIT_WAIT_MS`): 스트림에서 읽으므로 Claude CLI의 입력을 더 열어 두지 않는다. 결정 4를 다시 물어 `getContextUsage`로 바꾸면 provider-usage의 턴 끝 조회(`TURN_USAGE_MS` 3초)와 함께 부르고 같은 상한 안에 넣어야 한다.
- **renderer import 경계**(POSTMORTEM 2026-10-30): renderer는 `types.ts`의 type만 import한다. `contextWindow.ts`는 main 모듈을 값으로 import하지 않는다.

## PoC 의존

아래는 확인하지 않은 가정이고, 구현 전에 P가 먼저 확인한다. 모두 사람의 승인과 로그인한 Doan 연결(이 기기의 공용 프로필 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`)이 필요하다. 짧은 대화 턴은 모델 요청이므로 사람의 메시지로 시작한다(dev 앱에서 사람이 보내거나, 사람이 승인한 일회성 스크립트).

- **P1 Claude**: (a) 최상위 `assistant` frame의 `message.usage`와 `message.model`, `result.modelUsage`의 키와 `contextWindow`. `message.model`이 키와 같은가. (b) (a)로 계산한 비율과 같은 시점의 `getContextUsage({detail: "summary"})`의 `percentage`·`rawMaxTokens` 비교, 200K 모델과 1M 모델(계정이 허락하면). (c) 최소 CLI 2.1.284에서 (a)의 필드와 (b)의 control request가 있는가. (d) 압축(`compact_boundary`) 뒤의 값.
- **P2 Codex**: (a) `thread/tokenUsage/updated`가 `turn/completed`보다 먼저 오는가. (b) `last`의 각 값과 `modelContextWindow`, `used`로 쓸 값(같은 thread를 Codex TUI로 열어 보이는 "context left"와 비교). (c) 0.158.0과 0.166.0에서 오는가. (d) 다시 연 thread(`thread/resume`)의 첫 턴에서 오는가.
- **P3 Copilot**: Doan의 `--acp --stdio` 모드에서 (a) `usage_update`가 오는가(1.0.89와 설치본), (b) prompt 응답보다 먼저 오는가, (c) `used`·`size`의 값.
- **P4 Antigravity**: (a) Doan의 모델에서 `usage_update`가 오는가, (b) `session/load`로 다시 연 세션의 첫 값이 그 턴의 context인가 세션 누적인가(누적이면 Antigravity는 값을 버린다).
- **P5 Cursor**: 실제 턴에서 `usage_update`도 prompt 응답의 `usage`도 오지 않음을 확인한다.

어느 provider든 값이 terminal 뒤에만 오면 그 provider는 값이 없는 것으로 두고 결정 3을 다시 묻는다. P1에서 Claude의 원시 비율이 1M 모델의 압축 창 때문에 `getContextUsage`와 크게 다르면 결정 4를 다시 묻는다.

## POSTMORTEM에서 가져온 함정

- **2026-10-28 'A send right after turn.done was refused as busy'**: 턴 끝에 Claude CLI의 입력을 더 열어 두면 다음 send가 기다린다. 스트림에서 읽어 control request를 더하지 않는다.
- **2026-10-27 'SDK process death reached failure classification before group release'**: terminal event는 턴마다 하나다. `context.usage`는 terminal 앞에만 내고, terminal을 새로 만들지 않는다.
- **2026-10-27 'Codex ingress confused unowned requests and notification errors'**: 알림은 `threadId`·`turnId`로 지금 턴의 것인지 먼저 가린다.
- **2026-10-27 'Successful appends crossed the history reader's byte limit'**: 새 event도 같은 상한과 append 경로를 쓴다.
- **2026-10-30 'A renderer import of a main module left the built app's window blank'**: renderer의 새 모듈은 main을 type으로만 import한다(`rendererImports.test.ts`).
- **2026-10-25 'A TS helper hid its TSX component on case-insensitive macOS'**: 컴포넌트와 순수 함수 모듈의 이름을 대소문자 밖에서도 다르게 짓는다.

## 읽은 design preset

`doan design-skill --json`(목록), `shape`.

## 결정

사람이 아래 여덟 가지를 정했다. P의 결과에 따라 다시 묻는 항목은 그 결정에 적었다.

1. **자리는 카드 안, Send 바로 왼쪽**(사람). box 모양에서는 아래 줄 오른쪽, capsule에서는 입력 칸과 Send 사이. tray는 320px panel에서 이미 label을 줄이는 폭 단계(384·288)가 있다.
2. **값이 없으면 링을 숨긴다**(사람). 새 대화, 첫 턴 전, 이 기능 전의 대화, Cursor, window를 모르는 Antigravity 모델이 해당한다. provider나 대화 종류로 나누지 않고 "기록된 값이 있으면 보임" 하나로 정한다. 늘 빈 링이 되는 provider를 숨긴 provider-usage 결정할 점 14와 같다.
3. **턴이 끝날 때 한 번 갱신한다**(사람). 값은 terminal 바로 앞에 기록하고, 턴이 도는 동안 링은 바뀌지 않는다. 어떤 provider의 값이 terminal 뒤에만 오면(P) 이 결정을 다시 묻는다.
4. **링 값은 provider가 보고한 used ÷ size의 원시 비율**(사람). Claude는 스트림의 usage와 `modelUsage.contextWindow`, Codex는 `last`와 `modelContextWindow`, ACP는 `usage_update`. 새 control request가 없어 턴 끝 대기가 늘지 않는다. P1에서 1M 모델의 압축 창 때문에 Claude 값이 `getContextUsage`와 크게 다르면 이 결정을 다시 묻는다.
5. **값은 대화 event `context.usage`로 기록한다**(사람). 앱을 다시 시작해도 마지막 값이 보인다. Claude와 ACP는 턴 사이에 프로세스가 없어 대화를 다시 열 때 값을 읽을 길이 없고, renderer는 이미 event를 받으므로 새 채널이 필요 없다.
6. **링 색은 사용량 링과 같은 두 단계**(사람): 70% 미만 기본 색, 70% 이상 danger(provider-usage 결정할 점 15).
7. **링 크기는 16px**(`--size-icon`, 사람). 반지름과 stroke는 `/design-draft`에서 정한다.
8. **누르지 않는 표시**(사람). hover tooltip과 이름만 있고 Tab 순서에 들지 않는다. popover는 두지 않는다.
