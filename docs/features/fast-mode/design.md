# fast-mode — design

## 결정(사람, 2026-11-06)

1. **provider**: Claude와 Codex만 토글을 둔다. 둘은 모델마다 Fast 지원 여부를 목록으로 알려 준다. Cursor·Copilot은 Fast가 모델 ID 쪽에 있어서 지금처럼 모델 피커에서 고른다(spec 문제 3).
2. **위치**: 도구 행에 버튼을 더하지 않고 Effort 메뉴 안에 둔다. 레벨 목록 아래 구분선 다음에 Fast 스위치 행을 두고, 켜져 있으면 Effort 트리거에 Fast 아이콘을 붙인다.
3. **기억**: 대화와 provider별 Last used에 남긴다. Settings 'New conversations'의 기본값 행은 만들지 않는다. 고정 기본값이 있어도 Fast는 Last used를 따른다.
4. **Fast로 돌지 않은 턴**: provider가 알려 주면 스레드의 그 턴에 한 줄 알림을 남긴다. 스위치는 켜진 채로 둔다.

## 1. 영향받는 구성 요소

- **앱 main** (`app/src/main/conversation/`)
  - `models.ts`: `ModelOption`에 `fast?: { description?: string }`를 더한다. main만 쓰는 Codex 티어 id는 `ModelCatalog`가 따로 들고 있고 renderer로 보내지 않는다. `parseClaudeModels`는 `supportsFastMode === true`, `parseCodexModels`는 Fast 티어(P1 규칙)를 읽는다. `ModelCatalog.accepts`가 `fast`를 받아, 이번 실행이 받은 목록에서 그 모델이 Fast를 지원할 때만 `true`를 받아들인다. `ModelCatalog.fastTier(root, runtime, model)`이 Codex 티어 id를 돌려준다.
  - `ipc.ts` `validateSendExtras`/`SendExtras`: `fast?: boolean`. Claude·Codex의 doan 소유 대화만 받는다. 그 밖(ACP, resume, legacy-external)에서 `fast`가 오면 `bad_request`다. model·effort와 같이 사람이 바꿨을 때만 renderer가 보낸다(ARCHITECTURE §7 'IPC contract').
  - `service.ts` `StartRequest`·`TurnChoice`·`choice()`: `fast?: true`. 저장된 선택에 합치고, queue로 나가는 턴은 저장된 값을 쓴다. 모델이 바뀌어 Fast를 지원하지 않으면 그 턴의 `TurnChoice`에서 뺀다.
  - `store.ts` `MetadataBase`: `fast?: true`. `true`가 아닌 값은 그 필드만 꺼짐으로 읽는다. 새 빌드의 값이 index 전체를 무효로 만들면 안 되기 때문이다(permissionMode와 같은 예외, ARCHITECTURE §7 'Permission modes' Storage). 다음 저장에서 그 값은 빠진다.
  - `runners.ts`
    - Claude: 실행마다 `query()` options에 `settings: { fastMode: true }`를 넣는다(켠 턴만). 끈 턴은 넣지 않는다. SDK 실행은 flag 계층에서 켜지 않으면 `sdk_opt_in_required`로 꺼지므로 프로필이나 프로젝트 설정이 켜 둘 수 없다(P2에서 확인). Claude는 턴마다 프로세스를 새로 열고 resume는 기본값으로 돌아가므로, model·effort처럼 매번 넣는다.
    - Codex: `turn/start`에 매 턴 `serviceTier`를 명시한다. 켠 턴은 모델의 Fast 티어 id, 끈 턴은 표준 값(P1에서 확정). Codex의 `turn/start` 덮어쓰기는 다음 턴과 `thread/resume`까지 남는다(ARCHITECTURE §7 'Permission modes' Codex, 'Models' effort). 그래서 끈 턴도 비워 두면 앞 턴의 Fast가 남는다고 본다.
  - `transport.ts`: Claude 결과 메시지에서 `fast_mode_state`·`fast_mode_disabled_reason`을 읽어, Fast를 요청한 턴이 `on`이 아니면 `fast.unused` 이벤트를 하나 만든다. Codex는 P1이 신호를 찾았을 때만 같은 이벤트를 만든다.
  - `types.ts` `ConversationEvent`: `{ type: "fast.unused"; reason?: FastUnusedReason }`. 턴당 최대 하나, 그 턴의 terminal 이벤트 앞에 둔다(`context.usage`와 같은 자리).
- **앱 renderer** (`app/src/renderer/`)
  - `homeComposer.ts` `modelPickerView`: `effort` view에 `fast: { on: boolean; description?: string } | null`을 더한다. 트리거의 `label`·`ariaLabel`에 Fast 상태를 반영한다. Settings > Agents도 같은 함수로 Effort 행을 그리므로(`SettingsAgents.tsx:206`), Settings는 `fast`를 그리지 않는다(결정 3).
  - `ComposerParts.tsx` `EffortPicker`: RadioGroup 아래에 `DropdownMenu.Separator`와 스위치 행을 둔다. 스위치 행은 `DropdownMenu.CheckboxItem`으로 만들고 `onSelect`에서 `preventDefault`를 불러 메뉴를 열어 둔다. 트리거에는 `fast.on`일 때 lucide `Zap` 아이콘을 붙인다.
  - `rememberChoice.ts` `ComposerChoice`·`rememberChoice`: `fast?: boolean`. `HomeMemory.models[provider]`에 `fast?: true`를 provider 단위로 둔다(모델을 바꿔도 남는다). `preferenceAfterPick`은 `fast`를 무시한다(결정 3).
  - `restore/uiState` `HomeMemory` 검증에 `fast`를 더한다.
  - `dockedSupport.ts` `DockedPick`, `HomeComposerView.tsx`, `DockedComposer.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`: `onPickFast`를 effort와 같은 길로 잇는다.
  - 스레드: `fast.unused`를 그 턴 안의 한 줄 알림으로 그린다. 문구는 순수 함수 `fastUnusedText(reason)`가 만든다.
- **CLI·skill·shared schema**: 바뀌지 않는다.

## 2. 순수 함수로 떼어 낼 부분(`/tdd` 대상)

1. `parseClaudeModels`·`parseCodexModels`의 `fast` 읽기와 `codexFastTier(row)`: Codex 모델 행에서 Fast 티어 id와 설명을 고른다. 티어가 없거나 모양이 틀리면 `undefined`.
2. `ModelCatalog.accepts(root, runtime, model, effort, fast)`와 `fastTier(...)`.
3. `validateSendExtras`의 `fast` 규칙(provider, owner, 모양).
4. 저장된 선택과 새 선택을 합쳐 이번 턴의 `fast`를 정하는 규칙(service의 `choice`, 모델 변경 시 제거).
5. `store.ts` metadata 읽기의 `fast` 예외(`true`만 켜짐, 그 밖은 꺼짐이고 index는 유효).
6. runner 인자 빌더: `claudeFastSettings(fast)`, `codexServiceTier(fast, tier)`.
7. `claudeFastOutcome(result, requested)`: 결과 메시지와 요청 여부로 `fast.unused` 이벤트 또는 `null`.
8. `store.ts` 이벤트 검증의 `fast.unused`(알려진 reason만).
9. `modelPickerView`의 `effort.fast`와 트리거 라벨·접근성 이름.
10. `rememberChoice`·`defaultFast(memory, provider, model)`.
11. `fastUnusedText(reason)`.

## 3. 형식 변경

- **shared JSON Schema**(ARCHITECTURE §11): 바뀌지 않는다. conversation 이벤트와 index는 schema 밖에서 `store.ts`가 검증한다.
- **conversation 이벤트 JSONL v1**: `fast.unused` 타입이 늘어난다. `context.usage` 때처럼 v를 올리지 않는다. 이 타입보다 오래된 빌드는 그 줄을 손상으로 읽는다. 이전 빌드로 돌아가는 것은 지원하지 않는다(ARCHITECTURE §7 'Events').
- **conversation index v2**: 선택 필드 `fast?: true`. 버전은 그대로이고, 알 수 없는 값은 꺼짐으로 읽는다(§1 store.ts).
- **ui-state** `home.models[provider].fast?: true`. ui-state는 저장할 때 파일 전체를 바꾸므로, `fast`를 빼고 저장하면 지워진다(POSTMORTEM 2026-11-01).
- **IPC** `conversation:start`·`conversation:send`: `fast?: boolean`. `conversation:models` 응답의 모델 행: `fast?: { description?: string }`.

## 4. 규약·결정 영향

- ARCHITECTURE §1 'Conventions'와 `doan check` 규칙: 영향 없음.
- 구조 결정: 토큰을 다루지 않는다는 결정, append-only 이벤트, git 작업 없음은 그대로다. `fast.unused`는 덧붙이기만 하고 이전 이벤트를 고치지 않는다.
- Codex 덮어쓰기가 다음 턴까지 남는 문제는 permission mode와 같은 방식으로 매 턴 명시해서 막는다.
- 프롬프트: Fast는 `turnPrompt`에 들어가지 않는다(ARCHITECTURE §7 'Input and prompt').

## 5. POSTMORTEM에서 가져온 함정

- **2026-11-02 "A picked model was forgotten"**: 기억은 고른 곳에서 남겨야 한다. Fast 스위치도 `onRemember`를 거치게 하고, 새 `startConversation`·`sendConversation` 호출 경로가 `fast`를 빠뜨리지 않는지 확인한다. 검색: `rg -n "startConversation\(|onRemember" app/src/renderer --glob '!*.test.*'`.
- **2026-11-01 "A ui-state save sent before the startup read…"**: ui-state는 저장할 때 파일 전체를 바꾼다. `fast`를 일부러 빼서 보호하려 하지 않는다. 빠진 필드는 삭제로 읽힌다.
- **2026-10-30 "A model list read made sign-out ask to stop conversations"**: Fast 정보는 이미 있는 모델 목록 읽기에서 함께 받는다. 새 lease나 새 읽기를 만들지 않는다.

## 6. 문구(clarify preset을 읽고 정함)

UI 문구는 영어다. 기존 Effort 메뉴의 말투(짧은 명사, 제목 대문자 없음)를 따른다.

| 자리 | 문구 |
|---|---|
| 스위치 행 이름 | `Fast` |
| 스위치 아래 설명 | Codex 티어의 `description` 그대로. Claude는 없음(provider가 주지 않은 주장을 Doan이 만들지 않는다) |
| 트리거 접근성 이름 | `Effort: High, Fast on` / Fast를 지원하는데 꺼져 있으면 `Effort: High, Fast off` / 지원하지 않으면 지금과 같음 |
| 스레드 알림 | `Fast mode wasn't used for this turn.` 뒤에 이유 한 문장 |
| 이유 `free` | `Your plan doesn't include it.` |
| 이유 `extra_usage_disabled` | `Extra usage is turned off for this account.` |
| 이유 `model_not_allowed` | `It isn't available for this model.` |
| 이유 `preference` | `A settings policy turned it off.` |
| 이유 `cooldown` | `It's paused after a rate limit.` |
| 그 밖의 이유·이유 없음 | 이유 문장 없음 |

`FastUnusedReason`은 위 다섯 값을 정규화한 것이다(`plan`, `extra_usage`, `model`, `policy`, `cooldown`). Claude의 나머지 값(`network_error`, `unknown`, `not_first_party`, `disabled_by_env`, `sdk_opt_in_required`, `pending`)은 reason 없이 기록한다.

## 7. 초안 요청(`/design-draft fast-mode`)

새 파일 `.doan/canvases/fast-mode.html`. composer와 메뉴의 현재 모양은 앱 코드와 `docs/DESIGN.md`를 기준으로 한다.

- `effort-menu`: Effort 메뉴의 세 경우. Codex 모델(레벨 + 구분선 + 설명이 있는 Fast 스위치, 꺼짐과 켜짐), Claude opus(설명 없는 스위치), Fast를 지원하지 않는 모델(지금과 같은 메뉴).
- `trigger`: Effort 트리거 꺼짐과 켜짐. Home 도구 행(`sm`)과 도킹된 composer(`xs`), 287px 이하에서 라벨이 숨은 상태와 tooltip.
- `thread-notice`: 이유가 있는 알림, 이유가 없는 알림. 턴의 답 아래 어디에 놓이는지.

상태: 초안 전.

## 8. PoC 의존

- **P1 Codex**(실제 Codex 계정과 모델 요청이 필요하다): (a) `turn/start`의 `serviceTier`가 다음 턴과 `thread/resume`까지 남는지, 표준으로 되돌리는 값이 `"default"`인지 `null`인지. (b) Fast 티어를 id `priority`로 판별할지, 이름 `Fast`나 다른 규칙으로 판별할지. (c) 턴이 실제로 어떤 티어로 돌았는지, 거부됐는지 알려 주는 알림이나 응답 필드가 있는지.
- **P2 Claude**(실제 Claude 계정과 모델 요청이 필요하다): (a) `settings: { fastMode: true }`로 opus 실행의 결과 `fast_mode_state`가 `on`인지. (b) 넣지 않은 실행이 `off`인지, 프로필이나 프로젝트의 `fastMode: true`가 이를 바꾸지 않는지. (c) resume한 실행에서도 같은지. (d) 지원하지 않는 모델에 켰을 때 모델이 바뀌는지(SDK 문서의 "enabling fast mode when that promotes the model").
- P1·P2 결과가 design §1과 다르면 구현 전에 이 문서를 고친다.
