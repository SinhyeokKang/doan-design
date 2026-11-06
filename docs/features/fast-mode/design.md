# fast-mode — design

## 결정(사람, 2026-11-06)

1. **provider**: Claude와 Codex만 토글을 둔다. 둘은 모델마다 Fast 지원 여부를 목록으로 알려 준다. Cursor·Copilot은 Fast가 모델 ID 쪽에 있어서 지금처럼 모델 피커에서 고른다(spec 문제 3).
2. **위치**: 도구 행에 버튼을 더하지 않고 Effort 메뉴 안에 둔다. 레벨 목록 아래 구분선 다음에 Fast 스위치 행을 두고, 켜져 있으면 Effort 트리거에 Fast 아이콘을 붙인다.
3. **기억**: 대화와 provider별 Last used에 남긴다. Settings 'New conversations'의 기본값 행은 만들지 않는다. 고정 기본값이 있어도 Fast는 Last used를 따른다. Last used는 스위치를 바꿀 때와 자동으로 꺼질 때만 기록한다.
4. **Fast로 돌지 않은 턴**: provider가 알려 주면 스레드의 그 턴에 한 줄 알림을 남긴다. 이유가 계속되는 경우에는 그 대화와 그 provider의 Last used에서 Fast를 자동으로 끈다. 그 밖의 경우에는 켜 둔 채로 둔다.
5. **모델 변경**: Fast를 지원하지 않는 모델로 바꿔도 대화의 Fast는 남긴다. 지원하는 모델로 돌아오면 다시 켜진다.
6. **핸드오프**: 새 대화는 원래 대화의 Fast를 물려받는다.
7. **Claude 설명**: Claude Code 자체 문구로 설명을 둔다(§6).
8. **조직 정책**: 조직이 Fast를 막은 경우(`preference`)도 계속되는 이유로 보고 자동으로 끈다.
9. **행 아이콘**: 메뉴의 Fast 행은 스위치 상태와 관계없이 항상 Fast 아이콘으로 시작한다. 켜짐과 꺼짐은 스위치만 보인다. 트리거의 아이콘은 켜졌을 때만 붙는다.
10. **메뉴 폭**: Fast 행이 있으면 Effort 메뉴는 280px(Permission 메뉴의 폭)이고, 없으면 200px 그대로다. 설명이 두 줄 안에서 끝나게 하기 위해서다. provider가 준 Codex 설명은 Doan이 줄이지 않는다.
11. **아이콘 색**: 트리거, 메뉴 행, 스레드 알림의 Fast 아이콘을 모두 accent(`--affordance-accent`, Send와 같은 violet)로 칠한다. 글자는 지금의 색 그대로다.
12. **미리 비활성**: Claude 모델 목록 읽기가 계정 단위 이유(플랜, 추가 사용량, 조직)를 알려 주면, Fast 행을 비활성으로 두고 설명 자리에 그 이유를 보인다. 트리거에는 아이콘이 없고 Fast를 보내지 않는다. 턴 중에야 드러나는 이유는 결정 4대로 자동으로 끈다(사람, 2026-11-06, P2 관찰 뒤).

## 1. 영향받는 구성 요소

### 앱 main (`app/src/main/conversation/`)

- `models.ts`: `ModelOption`에 `fast?: { description?: string; unavailable?: FastUnusedReason }`를 더한다. `parseClaudeModels`는 `supportsFastMode === true`를 읽는다. Claude 목록 읽기는 `query()` options에 `settings: { fastMode: true }`를 넣고 `initializationResult()`의 `fast_mode_disabled_reason`을 읽는다. 프롬프트는 보내지 않는다. 그 값이 계정 단위 이유(`free`, `extra_usage_disabled`, `preference`)이면 Fast를 지원하는 모든 모델 행의 `fast.unavailable`에 정규화한 reason(`plan`, `extra_usage`, `policy`)을 넣는다(결정 12). flag 없이 읽으면 이유가 늘 `sdk_opt_in_required`라서 쓸모가 없다(P2). `parseCodexModels`는 Fast 티어(P1 규칙)와 그 `description`을 읽는다. `ModelCatalog.accepts(root, runtime, model, effort, fast)`는 이번 실행이 받은 목록에서 그 모델이 Fast를 지원할 때만 `fast: true`를 받아들인다.
  - Codex Fast 티어는 `serviceTiers`에서 id가 `"priority"`인 항목이고, 보낼 때도 상수 `"priority"`를 쓴다(P1). main 전용 티어 map은 없다. 이름 `Fast`와 deprecated `additionalSpeedTiers`는 판별에 쓰지 않는다.
  - `ModelCatalog.accepts`는 `fast.unavailable`이 있는 모델의 `fast: true`도 거부한다. 목록은 연결과 설치 버전 단위로 캐시되므로, 계정 설정을 바꿔도 다시 읽기 전까지는 반영되지 않는다(BACKLOG 후보, R1에서 확인).
- `ipc.ts`
  - `SendExtras`·`validateSendExtras`: `fast?: boolean`. Claude·Codex의 doan 소유 대화만 받는다. 판정 모델은 요청의 model, 없으면 대화에 저장된 model(`service.sendTarget().model`), 둘 다 없으면 목록의 기본 행(Claude `default`, Codex `isDefault`)이다. 이번 실행에 목록이 없거나 그 모델이 Fast를 지원하지 않는데 `fast: true`가 오면 `bad_request`다. `fast`만 바뀐 send도 받는다(model 없이 effort만 오는 경우는 지금처럼 거부한다).
  - resume 거부(`ipc.ts:145`)와 queue 거부(`ipc.ts:170`)에 `raw.fast`를 더한다. Send now(`conversation:sendQueuedNow`)도 받지 않는다.
  - **이번 턴의 유효 Fast**를 ipc가 계산한다: 저장되거나 새로 고른 Fast가 켜져 있고, 이번 턴 모델이 이번 실행의 목록에서 Fast를 지원하며 `unavailable`이 없을 때만 true다. effort의 `defaultEffort`와 같은 길(`ipc.ts:159-162`)로 service에 넘긴다. 목록이 아직 없으면 Claude는 지원 여부를 모르므로 false다. Codex는 상수 티어를 쓰더라도 지원 여부를 모르므로 false다(spec '스위치가 보이지 않는 상태에서는 보내지 않는다'와 같다).
- `service.ts`
  - `StartRequest`·`TurnChoice`·`choice()`·저장 metadata에 `fast?: true`를 더한다. 저장되는 값은 사람의 선택이다(결정 5). runner에 가는 값은 ipc가 계산한 유효 Fast다. Claude는 `Prepared`로(`service.ts:297` `...chosen`, `runners.ts:295`), Codex는 `TurnChoice`로 간다.
  - queue로 나가는 턴은 `QueueOptions`의 콜백으로 같은 판정을 받는다(`defaultEffort`와 같은 자리, `service.ts:83`·`service.ts:774`).
  - 핸드오프(`startHandoff`)는 `choice(m)`을 그대로 넘기므로 `fast`를 물려받는다(결정 6).
  - 자동 끔: 계속되는 이유의 `fast.unused`를 기록한 턴에서 대화의 `fast`를 지운다. 이벤트 기록과 같은 흐름에서 index를 쓴다.
- `store.ts` `MetadataBase`: `fast?: true`. 검증은 `fromHome?: true`와 같다(`store.ts:45`). 값이 하나뿐이라 permissionMode 같은 예외가 필요 없다.
- `summary.ts` `ConversationSummary`: `fast?: true`. 기존 대화의 composer가 이 값으로 스위치를 그린다(`ProjectOverview.tsx:147`, `CanvasConversationPanel.tsx:243`).
- `runners.ts`
  - Claude: 유효 Fast가 true인 실행만 `query()` options에 `settings: { fastMode: true }`를 넣는다. Claude는 턴마다 프로세스를 새로 열고 resume는 기본값으로 돌아가므로, model·effort처럼 매번 넣는다. 끈 실행은 넣지 않는다. SDK 실행은 flag 계층에서 켜지 않으면 `sdk_opt_in_required`로 꺼지고, 프로젝트 `.claude/settings.json`의 `fastMode: true`도 이를 바꾸지 않는다(P2 b·b2). resume한 실행도 같다(P2 c).
  - Codex: doan 소유 턴에만 `turn/start`에 `serviceTierForTurn`을 명시한다. 켠 턴은 Fast 티어 id, 끈 턴은 `"default"`다. `serviceTierForTurn`은 thread의 티어를 바꾸지 않으므로, 앞 턴의 값이 다음 턴이나 `thread/resume`에 남는 문제가 없다(P1 a: `serviceTierForTurn` 뒤 resume의 `serviceTier`는 null, `serviceTier` 뒤에는 `"priority"`). legacy-external 턴은 아무것도 보내지 않아서 터미널 세션의 설정이 그대로 남는다(permission과 같다, ARCHITECTURE §7 'Permission modes').
- `transport.ts`: Claude result 처리(`transport.ts:188`)에서 요청 여부(`TransportState`의 새 필드)와 결과의 `fast_mode_state`·`fast_mode_disabled_reason`으로 `fast.unused`를 만든다. done·failed 결과만 판정하고, 값이 없으면 만들지 않는다. steer 때문에 한 Doan 턴에 result가 여럿이면 마지막 result로 판정한다. 이벤트 순서는 `fast.unused` → `context.usage` → terminal이다.
- `types.ts` `ConversationEvent`: `{ type: "fast.unused"; reason?: FastUnusedReason; turnedOff?: true }`. 턴당 최대 하나다. `turnedOff`는 계속되는 이유일 때 붙는다.

### 앱 preload

- `app/src/preload/index.ts`: start·send 요청 타입에 `fast?: boolean`.

### 앱 renderer (`app/src/renderer/`)

- `homeComposer.ts`
  - renderer 쪽 `ModelOption`(`homeComposer.ts:218`, main과 다른 타입)에 `fast?: { description?: string }`.
  - `ModelChoice`에 선택 필드 `fast?: boolean`. `modelPickerView`의 `effort` view에 `fast: { on: boolean; description?: string } | null`. `choice.fast`가 없으면(Settings) `fast: null`이다.
  - `effort.label`은 레벨만 담는다. Fast는 `ariaLabel`과 `fast`에만 반영한다. Settings는 `label`을 화면 문구로 쓰므로(`SettingsAgents.tsx:206`, `:252`) Settings는 바뀌지 않는다.
- `ComposerParts.tsx` `EffortPicker`: Fast 행이 있을 때 메뉴에 280px 클래스를 더한다(결정 10). RadioGroup 아래에 `DropdownMenu.Separator`와 `DropdownMenu.CheckboxItem` 행을 둔다(`menuitemcheckbox`, VoiceOver는 checked/unchecked로 읽는다). 모양은 행 끝에 `aria-hidden` 스위치 모양 span을 그린다. `.doan-switch`는 `button[role="switch"]`라 menuitem 안에 넣을 수 없다. 레벨의 체크 표시와 구분되도록 체크 표시는 쓰지 않는다. 설명은 `aria-describedby`로 잇는다. `onSelect`에서 `preventDefault`를 불러 메뉴를 열어 둔다. 행은 항상 Fast 아이콘으로 시작한다(결정 9). 트리거에는 `fast.on`일 때 lucide `Zap` 아이콘을 붙이고 `flex-shrink: 0`이다. 두 아이콘 모두 `--affordance-accent`다(결정 11). sm·xs 모두 `IconTip`으로 `ariaLabel`을 보인다.
- `rememberChoice.ts`: `rememberFast(memory, provider, on)`. `home.models[provider]`는 모델을 고를 때마다 통째로 바뀌므로(`rememberChoice.ts:25`) Fast는 거기에 두지 않는다. `home.permissions`처럼 provider 단위로 `home.fast`에 둔다. `rememberChoice`는 보내기만으로 Fast를 기록하지 않는다. `preferenceAfterPick`은 `fast`를 무시한다(결정 3).
- `app/src/restore/uiState.ts` `HomeMemory`·`parseHome`: `fast?: Partial<Record<Provider, true>>`를 `permissions`(`uiState.ts:37-39`)와 같은 방식으로 읽는다. 읽지 않으면 다음 저장에서 지워진다(POSTMORTEM 2026-11-01).
- `dockedSupport.ts` `DockedPick`과 field 목록(`dockedSupport.ts:54`), `HomeComposerView.tsx`, `DockedComposer.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`: `onPickFast`를 effort와 같은 길로 잇는다. 새 대화 start는 보이는 상태의 Fast를 보낸다. 기존 대화 send는 사람이 바꾼 경우만 보낸다. 세 composer의 `onRemember` effect 의존 배열에 `fast`를 넣는다(`HomeComposerView.tsx:246`, `ProjectOverview.tsx:167`, `CanvasConversationPanel.tsx:264`).
- 자동 끔의 Last used: `turnedOff`가 있는 `fast.unused`를 받은 host가 그 provider의 `home.fast`를 끈다. 이번 실행에서 실시간으로 받은 이벤트만 반영한다. 구독 시점의 snapshot이나 기록 재생에서 온 이벤트는 반영하지 않는다(재시작 뒤 사람이 다시 켠 값을 덮지 않게, spec '재시작 뒤 … 또 꺼지지는 않는다').
- 스레드(`threadItems.ts`, `ConversationThread.tsx`): `fast.unused`를 그 턴 안의 한 줄 알림으로 그린다. 문구는 renderer 쪽 순수 함수 `fastUnusedText(event)`가 만든다. renderer는 main 모듈을 값으로 import하지 않는다(타입만, POSTMORTEM 2026-10-30 renderer import).

### CLI·skill·shared schema

- 바뀌지 않는다.

## 2. 순수 함수로 떼어 낼 부분(`/tdd` 대상)

1. `parseClaudeModels`·`parseCodexModels`의 `fast` 읽기, Codex Fast 티어 판별.
2. `ModelCatalog.accepts(root, runtime, model, effort, fast)`.
3. `validateSendExtras`의 `fast` 규칙(provider, owner, 판정 모델, 목록 없음), resume·queue 거부.
4. 이번 턴의 유효 Fast를 정하는 규칙(저장된 선택, 새 선택, 이번 턴 모델, 목록).
5. `store.ts` metadata의 `fast` 검증과 `fast.unused` 검증(알려진 reason, `turnedOff`).
6. runner 인자 빌더: `claudeFastSettings(fast)`, `codexServiceTierForTurn(owner, fast)`.
7. `claudeFastOutcome(result, requested)`: 결과와 요청 여부로 `fast.unused` 또는 `null`.
8. `modelPickerView`의 `effort.fast`와 `ariaLabel`, `label` 불변.
9. `rememberFast`, `defaultFast(memory, provider, model)`, `parseHome`의 `fast`.
10. 자동 끔 반영 여부(실시간 이벤트만): `shouldTurnOffFast(event, live)`.
11. `fastUnusedText(event)`.

## 3. 형식 변경

- **shared JSON Schema**(ARCHITECTURE §11): 바뀌지 않는다. conversation 이벤트와 index는 schema 밖에서 `store.ts`가 검증한다.
- **conversation 이벤트 JSONL v1**: `fast.unused` 타입이 늘어난다. `context.usage` 때처럼 v를 올리지 않는다. 이 타입보다 오래된 빌드는 그 줄을 손상으로 읽는다. 이전 빌드로 돌아가는 것은 지원하지 않는다(ARCHITECTURE §7 'Events').
- **conversation index v2**: 선택 필드 `fast?: true`. 버전은 그대로다.
- **ui-state** `home.fast?: Partial<Record<Provider, true>>`. ui-state는 저장할 때 파일 전체를 바꾸므로, 읽기에서 빠뜨리면 지워진다(POSTMORTEM 2026-11-01).
- **IPC**: `conversation:start`·`conversation:send`에 `fast?: boolean`, `conversation:models` 응답의 모델 행에 `fast?: { description?: string }`, `conversation:list` 요약에 `fast?: true`.

## 4. 규약·결정 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향 없음.
- 구조 결정: 토큰을 다루지 않는다는 결정, append-only 이벤트, git 작업 없음은 그대로다. `fast.unused`는 덧붙이기만 하고 이전 이벤트를 고치지 않는다. 자동 끔은 index를 바꾸는 일이고, 이벤트를 고치지 않는다.
- Codex 덮어쓰기가 다음 턴까지 남는 문제는 `serviceTierForTurn`으로 처음부터 피한다. legacy-external 턴에는 보내지 않는다.
- 프롬프트: Fast는 `turnPrompt`에 들어가지 않는다.

## 5. POSTMORTEM에서 가져온 함정

- **2026-11-02 "A picked model was forgotten"**: 기억은 고른 곳에서 남겨야 한다. Fast 스위치도 `onRemember`를 거치게 하고, start·send 호출 경로가 `fast`를 빠뜨리지 않는지 확인한다. 검색: `rg -n "startConversation\(|sendConversation\(|onRemember" app/src/renderer --glob '!*.test.*'`.
- **2026-11-01 "A ui-state save sent before the startup read…"**: ui-state는 저장할 때 파일 전체를 바꾼다. `fast`를 일부러 빼서 보호하려 하지 않는다. 빠진 필드는 삭제로 읽힌다. 시작 시 읽기가 끝나기 전에 Fast를 바꿔도 save가 나가면 안 된다.
- **2026-10-30 "A model list read made sign-out ask to stop conversations"**: Fast 정보는 이미 있는 모델 목록 읽기에서 함께 받는다. 새 lease나 새 읽기를 만들지 않는다.

## 6. 문구(clarify preset을 읽고 정함)

UI 문구는 영어다. 기존 Effort 메뉴의 말투(짧은 명사)를 따르고, 용어는 `Fast` 하나로 쓴다.

| 자리 | 문구 |
|---|---|
| 스위치 행 이름 | `Fast` |
| 스위치 아래 설명(Codex) | 티어의 `description` 그대로 |
| 스위치 아래 설명(Claude) | `Same model, faster output. Requires usage credits.` — Claude Code 2.1.318 번들의 "same model, faster output", "Fast mode requires usage credits"를 옮겼다. CLI 문구가 바뀌면 다시 확인한다 |
| 트리거 접근성 이름·tooltip | `Effort: High, Fast on` / 지원하는데 꺼짐 `Effort: High, Fast off` / 지원하지 않음은 지금과 같음 |
| 알림(계속되는 이유, 자동 끔) | `Fast was turned off.` 뒤에 이유 한 문장 |
| 알림(그 밖) | `Fast wasn't used for this turn.` 뒤에 이유가 있으면 한 문장 |
| 이유 `plan` (`free`) | `Your plan doesn't include it.` |
| 이유 `extra_usage` (`extra_usage_disabled`) | `Extra usage is turned off for this account.` |
| 이유 `model` (`model_not_allowed`) | `It isn't available for this model.` |
| 이유 `policy` (`preference`) | `Your organization turned it off.` — CLI 번들에서 `preference`는 `policySettings.fastMode === false`이고, CLI 문구는 "disabled by your organization"이다 |
| 이유 `cooldown` (`fast_mode_state: "cooldown"`) | `It's paused after a rate limit.` |

`FastUnusedReason`은 위 다섯 값이다. 계속되는 이유는 `plan`, `extra_usage`, `model`, `policy`이고 `turnedOff`를 붙인다. Claude의 나머지 값(`network_error`, `unknown`, `not_first_party`, `disabled_by_env`, `sdk_opt_in_required`, `pending`)은 reason 없이 기록하고 자동으로 끄지 않는다.

메뉴 머리말 `Effort · <model>`과 메뉴 접근성 이름은 바꾸지 않는다. 구분선 아래 행의 접근성 이름이 `Fast`라서 읽는 데 혼동이 없다.

## 7. 초안 요청(`/design-draft fast-mode`)

새 파일 `.doan/canvases/fast-mode.html`. composer와 메뉴의 현재 모양은 앱 코드와 `docs/DESIGN.md`를 기준으로 한다.

- `effort-menu`: Effort 메뉴의 세 경우. Codex 모델(레벨 + 구분선 + 두 줄로 줄바꿈된 설명의 Fast 스위치, 꺼짐과 켜짐), Claude opus(Claude 설명), Fast를 지원하지 않는 모델(지금과 같은 메뉴). 메뉴 폭은 200px을 유지하고 설명은 줄바꿈한다.
- `trigger`: Effort 트리거 꺼짐과 켜짐. Home 도구 행(`sm`)과 도킹된 composer(`xs`). Fast 켜짐 + "Extra high"로 216–384px 사이에서 라벨이 숨는 경계(384·288)가 그대로인지, 모델 라벨이 넘치지 않는지. tooltip.
- `thread-notice`: 자동으로 꺼진 알림, 켜 둔 채의 알림(이유 있음·없음). 턴의 답 아래 어디에 놓이는지.
  - 모양(사람, 2026-11-06): 턴 안의 접힌 activity 줄이다. 그 턴의 답 아래에 Fast 아이콘과 subtle 글자로 두고, 길면 줄을 바꾼다. 대화 단위 marker(가운데 줄)는 쓰지 않는다. 실패한 턴에서는 끝 알림 앞에 온다.

- round 2(사람, 2026-11-06): 결정 9–11을 반영했다. round 3에서 결정 9를 "행 아이콘은 항상"으로 바꿨다. Chromium 렌더링에서 280px 메뉴의 설명은 Codex "2x speed, increased usage"가 1줄, Claude 문구가 2줄이었다.

상태: 사람 확인(2026-11-06, round 3 확정).

## 8. PoC 결과(2026-11-06, `.scratch/fast-mode/`)

- **P1 Codex 0.166.0**(프로브 `p1-codex.mjs`, 모델 `gpt-5.6-luna`, effort low, "Reply with exactly OK" 4턴):
  - (a) `serviceTierForTurn: "priority"`와 `"default"`를 모두 받았고 턴은 completed였다. `serviceTierForTurn` 턴 뒤의 다음 턴과 새 app-server의 `thread/resume`에서 `serviceTier`는 null이었다. `serviceTier: "priority"` 턴 뒤의 resume는 `"priority"`였다. 그래서 `serviceTierForTurn`만 쓴다.
  - (b) 모든 공개 모델의 티어가 id `priority`, 이름 `Fast` 하나였다. 판별은 id `priority`로 한다.
  - (c) 턴 동안 받은 모든 프레임(`turn/*`, `item/*`, `thread/tokenUsage/updated`, `account/rateLimits/updated` 등)에 티어 필드가 없었고 `thread/settings/updated`도 오지 않았다. 실제로 Fast로 돌았는지는 알 수 없다. 이 계정에서 Fast를 거부한 턴은 없었다.
- **P2 Claude Code 2.1.318 / SDK 0.3.312**(프로브 `p2-claude.mjs`·`p2-init.mjs`, "Reply with exactly OK" 6턴):
  - (a) 이 계정은 추가 사용량이 꺼져 있어서 `on`을 보지 못했다. flag를 넣은 opus 실행은 `fast_mode_state: "off"`, 이유 `extra_usage_disabled`였다. flag가 받아들여졌다는 증거는 이유가 `sdk_opt_in_required`에서 바뀐 것이다. **`on` 상태와 `cooldown`은 확인하지 못했다.**
  - (b) flag 없는 실행은 `sdk_opt_in_required`였다. (b2) 프로젝트 `.claude/settings.json`의 `fastMode: true`도 `sdk_opt_in_required`였다.
  - (c) resume한 실행도 flag 유무에 따라 같은 결과였다.
  - (d) sonnet에 flag를 넣어도 모델은 `claude-sonnet-5-5` 그대로였고, 이유는 `model_not_allowed`가 아니라 `extra_usage_disabled`였다(계정 단위 이유가 먼저 나온다).
  - 추가: `system/init`도 같은 `fast_mode_state`·`fast_mode_disabled_reason`을 싣는다. 프롬프트 없는 `initializationResult()`도 flag를 넣으면 `extra_usage_disabled`를 돌려준다(결정 12의 근거).
