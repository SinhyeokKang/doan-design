# context-window-ring — design

용어: **context 값**은 한 대화에서 provider가 보고한 "마지막 모델 호출의 input 토큰 수, cache 포함(used)"과 "context window 크기(size)"의 쌍이다(결정 9). **링**은 docked composer의 context 링이고, 헤더의 사용량 링(provider-usage)은 **사용량 링**이라고 쓴다.

아래의 `AgentUsageButton.tsx`·`agentUsageView.ts`·`--border-track`은 main에 병합된 provider-usage(PR #98)의 것이다.

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
- 내보내기: 한 곳에서만 붙인다. `finish()`(`transport.ts:14`, Claude·Codex)와 `finishAcp()`(`acp.ts:164`)가 **실제로 내는** event가 `turn.done`이나 `turn.failed`이고 `state.context`가 있으면, 그 terminal **바로 앞에** `{ type: "context.usage", used, size }` 하나를 낸다. 두 함수는 `state.stop`이 있으면 받은 event 대신 `interrupted`를 내므로, 받은 event가 아니라 낼 event로 판단한다. `finishAcp()`에서는 `flush` event 뒤, terminal 앞이다. terminal이 이미 났으면(`state.terminal`) 둘 다 아무것도 내지 않으므로 턴마다 많아야 하나다. 아래 provider 항목은 상태에 값을 두는 곳만 적는다.
- 값이 없는 terminal: transport를 거치지 않는 terminal에는 붙지 않는다.
  - service가 직접 쓰는 것: Stop의 `interrupted`(`service.ts:481`), 로그아웃의 run 정리(`stopRuns`, `service.ts:522`), 앱 종료의 `appQuit`(`service.ts:537`), 그리고 읽을 때의 crash 접기(`state.ts:85`).
  - runner가 직접 내는 것: Claude 스트림이 terminal 없이 끝난 `turn.failed`(`runners.ts:367`), Codex protocol 실패의 `turn.failed` `session_unavailable`(`runners.ts:97`), 죽은 Codex 서버로의 send(`runners.ts:178`), Codex Stop의 `interrupted`(`runners.ts:183`).
  - service는 terminal 뒤의 event를 버리므로(`service.ts:402`), 값은 terminal 뒤에 올 수 없다.
- 값 검사: `used`·`size`는 음이 아닌 safe integer, `size ≥ 1`. 아니면 그 값은 버린다(턴은 그대로).
- **Claude**(`normalizeClaude`, `transport.ts:121`): 최상위 `assistant` frame마다 `used = input_tokens + cache_creation_input_tokens + cache_read_input_tokens`와 `message.model`을 상태에 둔다. 하위 agent frame은 이미 버린다(`transport.ts:122`). terminal `result`(`:158`)에서 `modelUsage[model].contextWindow`를 `size`로 상태에 더한다. steer 대기가 끝난 `endSteerWait`(`:28`)와 `terminal_reason: aborted_tools`의 `turn.failed`(`:159`)도 `finish()`를 거치므로 같은 규칙을 따른다. 키가 맞지 않거나 window가 없으면 값이 없다. 스트리밍 frame의 usage가 중간값일 수 있으나 input 쪽은 요청 시작 때 정해진다고 보고, P1에서 확인한다. 이 길은 새 control request가 없어 턴 끝에 CLI 입력을 더 열어 두지 않는다(POSTMORTEM 2026-10-28, `runners.ts:54-57` `TURN_USAGE_MS`). P1에서 1M 모델의 압축 창 때문에 `getContextUsage`와 크게 다르면 결정 4를 다시 묻고, 답에 따라 이 항목을 바꾼다.
- **Codex**(`normalizeCodex`, `transport.ts:244`): `thread/tokenUsage/updated` 가운데 `threadId`·`turnId`가 지금 턴(`CodexContext`)과 같은 것만 읽는다(POSTMORTEM 2026-10-27 'Codex ingress'). `modelContextWindow`가 null이면 값이 없다. `used`는 `last`의 input 쪽 필드다(결정 9). `totalTokens`는 output을 포함하므로 쓰지 않는다. `inputTokens`에 `cachedInputTokens`·`cacheWriteInputTokens`가 이미 들었는지는 P2가 확인하고, 결정 9의 뜻에 맞는 필드를 고정한다. 한 턴에 알림이 여러 번 오면 마지막 값만 남는다. `turn/completed`(`:296`)와 `error` 알림(`willRetry`가 true가 아님, `:301`)은 `finish()`를 거친다. 알림이 `turn/completed` 뒤에 오면(P2) 이 설계로는 값을 남기지 못하므로, 그때는 결정 3을 다시 묻는다.
- **ACP**(`normalizeAcp`, `acp.ts:138`): `usage_update`의 `used`·`size`를 상태에 두고, 여러 번 오면 마지막 값만 남는다. `used`는 provider가 보고한 값을 그대로 쓴다. ACP는 `used`의 뜻을 정하지 않으므로 결정 9와 다를 수 있다(Antigravity는 마지막 모델 호출의 크기, Copilot은 P3이 확인). `acpPromptDone`(`:170`)·`acpPromptFailed`(`:176`)·`acpEnded`(`:179`)는 `finishAcp()`를 거친다. `stopReason: "cancelled"`는 `interrupted`를 내므로 값이 없다. `acpRunner.ts`는 `prompting` 중인 그 세션의 update만 넘기므로(`acpRunner.ts:64`) 다른 세션의 값은 들어오지 않는다. provider로 나누지 않는다: Cursor는 보내지 않아 값이 없고, Antigravity는 window를 모르면 보내지 않는다.
- legacy external 대화(터미널 세션을 이어 가는 대화)도 같은 runner와 transport를 쓰므로 값이 남고, 같은 규칙으로 링이 보인다(spec 완료 조건 4). provider나 owner로 나누는 분기를 두지 않는다.

### 2. 기록(main, store)

- `EventPayload`에 `{ type: "context.usage"; used: number; size: number }`를 더한다(`types.ts:37`). service는 다른 비terminal event처럼 기록하고 보낸다(`conversation:event`). 새 IPC 채널은 없다.
- `store.ts`의 `payload()`(`:79`)에 새 type의 검사를 더한다. 검사가 없으면 읽기에서 손상으로 본다.
- 턴마다 한 줄이 늘고, 기록 상한(`CONVERSATION_HISTORY_BYTES`)과 append 경로는 그대로 쓴다(POSTMORTEM 2026-10-27 'Successful appends crossed the history reader's byte limit').
- 이 event는 thread에 그리지 않는다. `app/src/renderer/threadItems.ts`와 `conversationStrip.ts`의 `switch`에는 이 type의 `case`가 없고 `default`도 없으므로 건너뛴다. `foldConversation`(`state.ts:32`)의 턴 상태, unseen(마지막 seq는 그 뒤의 terminal), preview, summary는 바뀌지 않는다.

### 3. UI(renderer)

- 값: 호스트(`CanvasConversationPanel.tsx:434`, `ProjectOverview.tsx:406`)가 보이는 대화의 thread event(`ConversationStore.thread(id).events`)에서 마지막 `context.usage`를 읽어 `DockedComposer`에 새 prop `context`로 넘긴다. 새 대화 상태이거나 아직 thread가 없으면(`thread(id)`가 null, `conversationStore.ts:77`) null이다. 보관된(archived) 대화도 마지막 값을 보인다. 캔버스가 사라져 composer가 상태 줄로 바뀌면(`DockedComposer.tsx:339` `canvasGone`) 링도 없다.
- 공유 링 컴포넌트: main의 `Ring`(`AgentUsageButton.tsx:19-26`)은 `RingView`(provider, logo, full)를 받아 provider 로고 `<img className="usage-logo">`까지 그리고, 크기는 `.usage`에 묶인 CSS(`styles.css`의 `.usage-ring` 24px, `.usage .usage-ring > svg`)가 정한다. 그래서 크기만 바꿔 쓸 수 없다. 대신 SVG(track과 값)만 그리는 공유 컴포넌트를 뺀다. 예: `ProgressRing({ value: number | null; danger: boolean; className: string; children?: ReactNode })`와 wrapper `<span>`에 넘기는 `data-*`. `danger`가 true면 `data-band="full"`을 단다. `pathLength` 100과 `strokeDasharray`, 12시 시작은 지금과 같다.
  - 사용량 링은 `ProgressRing`에 `className="usage-ring"`, `data-provider`, `danger={ring.full}`을 주고 로고 `<img>`를 children으로 넘긴다. 마크업(class, `data-provider`, `data-band`, 로고)과 측정값(DESIGN.md 'Agent usage' Measured contracts, "Logo 14 × 14 in every ring")은 그대로다.
  - context 링은 children 없이 쓴다(로고 없음).
  - 색 기준 `DANGER`(`agentUsageView.ts:9`, 지금은 export하지 않음)를 공유 링 모듈로 옮겨 export하고, `agentUsageView.ts`는 그것을 import한다(결정 6).
- 크기: 16px(`--size-icon`, 결정 7). 사용량 링의 CSS는 `.usage`와 `.usage-ring`에 묶여 있으므로 context 링은 자기 class(예: `.context-ring`)로 크기와 stroke 색(`--border-track`, `--affordance-prominent`, `data-band="full"`이면 `--border-danger`)을 정한다. 24px 링(viewBox 24, r 11, stroke 2)을 그대로 줄이면 stroke가 1.33px로 가늘어지므로, 작은 링은 stroke 2px, 중심 반지름 7로 바깥 끝을 16px 상자 끝에 맞춘다(결정 12). 공유 primitive의 viewBox 24로는 r 10.5, stroke-width 3이다.
- 자리: 카드 아래 tray(`DockedComposer.tsx`의 `.composer-tray`)의 마지막 자식, 곧 tray 오른쪽 끝(결정 1). 카드와 `send` grid 영역은 바뀌지 않는다. `.docked .composer-tray`는 `justify-content: flex-end`이고 model trigger가 `margin-left: auto`이므로, effort·permission이 없는 provider나 terminal session의 고정 tray(`props.fixed`)에서도 마지막 자식은 tray 오른쪽 끝에 붙는다. tray는 줄바꿈하지 않는다(container 규칙: 384 미만에서 Permission, 288 미만에서 Effort가 아이콘만 남고 model label이 마지막에 줄어든다). 링은 줄어들지 않으므로(`flex: none`) 링이 있으면 좁은 panel에서 model label이 더 일찍 줄어든다(초안 296에서 "Opu…"). 값이 없으면 링 요소가 없어 tray의 DOM과 배치가 이 기능 전과 같다. 마지막 picker와 링 사이는 최소 8px(tray gap 4 + 링의 시작 여백 `--space-1` 4)이고, 링 뒤에는 tray의 12px end padding이 있다(결정 13).
- 이름과 글: 링에는 보이는 글자나 숫자가 없다(결정 10). 링은 `role="img"`이고 접근 이름과 tooltip 첫 줄은 같은 글이다: "Context window 42% used · last turn"("last turn"은 값이 기록된 턴, 결정 11). tooltip 둘째 줄은 "84K of 200K tokens"이고 같은 글을 `aria-description`으로 준다. 선례: `role="img"`와 `aria-label`의 span(`ConversationLine.tsx:11`, `ShellSidebar.tsx:123`). tooltip은 공유 tooltip이고 trigger는 focus를 받지 않는 span이다(선례 `CanvasAgent.tsx:69`). tooltip은 tray 링 위에 열리고, 캔버스 panel에서는 window 오른쪽 끝에 밀려 시작 쪽으로 옮겨진다(Radix collision). tooltip은 링 위 4px(공유 기본 `sideOffset`)에 열린다(결정 14). 두 줄 모두 tooltip의 같은 흰 caption 글씨다(결정 16). 글의 퍼센트는 버림한다(69.9%는 "69%", 결정 15). 색은 반올림하지 않은 비율로 정하므로 글이 "70%"인데 기본 색인 경우가 없다. 100%를 넘으면 실제 비율(예: "104% used")을 쓴다. 토큰 수는 1,000 미만이면 그대로, 1M 미만이면 "84K", 그 이상이면 "1.2M".
- 누름: 링을 눌러도 아무것도 열리지 않는다(dialog·popover 없음, 결정 8). 모든 정보는 tooltip에 있다.
- 링은 갱신 때 움직임(transition)을 넣지 않는다(provider-usage의 링과 같음).

## 순수 함수로 뺄 부분(`/tdd` 대상)

1. Claude: `normalizeClaude`의 context 상태(최상위 frame만, `modelUsage` 키 맞추기, window 없음, 숫자 검사)와 terminal 앞의 `context.usage` 하나.
2. Codex: `thread/tokenUsage/updated`의 `threadId`·`turnId` 검사, `modelContextWindow` null, `used` 계산, `turn/completed` 앞에 내기, 다른 턴의 알림 무시.
3. ACP: `usage_update` 읽기, `acpPromptDone`·`acpPromptFailed`·`acpEnded`가 terminal 앞에 내기, 값 없는 턴은 내지 않음.
4. `store.ts` `payload()`의 `context.usage` 검사(음수, 소수, `size` 0, 빠진 필드 거부).
5. renderer `contextRing(events)` → `{ percent, used, size } | null`: 마지막 `context.usage`, 없으면 null, 100% 초과 자르기(링)와 실제 비율(tooltip과 이름).
6. 이름·tooltip 글(첫 줄과 접근 이름이 같은 글, "· last turn")과 토큰 수 표기(`tokenText`).
7. 공유 링의 색 단계: 반올림하지 않은 비율 `>= DANGER`, 사용량 링과 같은 export된 `DANGER`.

파일 이름: 컴포넌트와 순수 함수 모듈은 대소문자만 다른 이름을 쓰지 않는다(POSTMORTEM 2026-10-25 'A TS helper hid its TSX component'). 예: 공유 링 `ProgressRing.tsx`, 컴포넌트 `ContextRing.tsx`, 순수 함수 `contextWindow.ts`.

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
- **P2 Codex**: (a) `thread/tokenUsage/updated`가 `turn/completed`보다 먼저 오는가. (b) `last`의 각 값과 `modelContextWindow`, 결정 9의 뜻(마지막 호출의 input 토큰, cache 포함)에 맞는 필드: `inputTokens`가 `cachedInputTokens`·`cacheWriteInputTokens`를 이미 포함하는가(같은 thread를 Codex TUI로 열어 보이는 "context left"와도 비교). (c) 0.158.0과 0.166.0에서 오는가. (d) 다시 연 thread(`thread/resume`)의 첫 턴에서 오는가.
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

사람이 아래 열여섯 가지를 정했다(12–16은 초안 검토에서). P의 결과에 따라 다시 묻는 항목은 그 결정에 적었다.

1. **자리는 tray 오른쪽 끝**(사람, 2026-11-05 초안 검토). 카드 아래 tray(Attach · Pick · model · effort · permission)의 마지막에, provider가 보이는 picker 수와 상관없이 오른쪽 끝(composer의 오른쪽 아래 모서리)에 둔다. tray가 여러 줄이 되면 마지막 줄의 끝이다(지금 tray는 줄바꿈하지 않는다). 카드의 Send 영역은 바뀌지 않는다.
2. **값이 없으면 링을 숨긴다**(사람). 새 대화, 첫 턴 전, 이 기능 전의 대화, Cursor, window를 모르는 Antigravity 모델이 해당한다. provider나 대화 종류로 나누지 않고 "기록된 값이 있으면 보임" 하나로 정한다. 늘 빈 링이 되는 provider를 숨긴 provider-usage 결정할 점 14와 같다.
3. **턴이 끝날 때 한 번 갱신한다**(사람). 값은 terminal 바로 앞에 기록하고, 턴이 도는 동안 링은 바뀌지 않는다. 어떤 provider의 값이 terminal 뒤에만 오면(P) 이 결정을 다시 묻는다.
4. **링 값은 provider가 보고한 used ÷ size의 원시 비율**(사람). Claude는 스트림의 usage와 `modelUsage.contextWindow`, Codex는 `last`의 input 쪽 필드와 `modelContextWindow`, ACP는 `usage_update`. 새 control request가 없어 턴 끝 대기가 늘지 않는다. P1에서 1M 모델의 압축 창 때문에 Claude 값이 `getContextUsage`와 크게 다르면 이 결정을 다시 묻는다.
5. **값은 대화 event `context.usage`로 기록한다**(사람). 앱을 다시 시작해도 마지막 값이 보인다. Claude와 ACP는 턴 사이에 프로세스가 없어 대화를 다시 열 때 값을 읽을 길이 없고, renderer는 이미 event를 받으므로 새 채널이 필요 없다.
6. **링 색은 사용량 링과 같은 두 단계**(사람): 70% 미만 기본 색, 70% 이상 danger(provider-usage 결정할 점 15). 반올림하지 않은 비율을 같은 `>= DANGER`로 비교한다.
7. **링 크기는 16px**(`--size-icon`, 사람). 반지름과 stroke는 `/design-draft`에서 정한다.
8. **누르지 않는 표시**(사람). 눌러도 아무것도 열리지 않는다(dialog·popover 없음). 모든 정보는 hover tooltip에 있고, 접근 이름과 `aria-description`이 같은 글을 준다. Tab 순서에 들지 않는다.
9. **used는 마지막 모델 호출의 input 토큰(cache 포함)**(사람). 모든 provider에 같은 뜻이다. Claude는 `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, Codex는 `last`의 input 쪽 필드(output이 든 `totalTokens`는 쓰지 않음), ACP는 provider가 보고한 `used`를 그대로 쓰고 그 뜻이 다를 수 있음을 적어 둔다.
10. **링에는 글자나 숫자가 없다**(사람). 비율은 tooltip과 접근 이름에만 있다.
11. **tooltip 첫 줄은 값이 언제의 것인지 보인다**(사람). 예: "42% used · last turn".
12. **링 stroke는 2px, 중심 반지름 7**(사람, 초안 검토). viewBox 24로 r 10.5, stroke-width 3. 24px 기하를 그대로 줄인 1.33px는 쓰지 않는다.
13. **마지막 picker와 링 사이는 최소 8px**(사람, 초안 검토). tray gap 4 + 링 시작 여백 4, 링 뒤는 tray의 12px end padding.
14. **tooltip은 링 위 4px**(사람, 초안 검토). 공유 tooltip의 기본 offset.
15. **퍼센트 글은 버림**(사람, 초안 검토). 이름과 tooltip 모두. 색은 반올림하지 않은 비율 `>= 70`으로 정한다(결정 6).
16. **tooltip 두 줄은 같은 흰 caption 글씨**(사람, 초안 검토). 새 token을 더하지 않는다.

사용자 확정(2026-11-05): 초안 확인. `.doan/canvases/context-window-ring.html`(frame `place-capsule`, `place-box`, `ring-states`, `ring-geometry`, `ring-tooltip`)을 사람이 확인했다.
