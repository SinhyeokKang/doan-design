# picker-default-labels — design

## 결정(사람, 2026-11-06)

1. **모델**: 고르지 않았을 때 트리거는 실제로 쓸 모델의 이름이고, 메뉴의 그 행에 "Recommended" 표시를 붙인다. 정하지 못하면 "Model".
2. **노력**: 아는 기본 레벨의 이름, 모르면 "Effort". 메뉴에 기본값으로 돌아가는 행을 더한다.
3. **권한**: Default 모드의 이름을 "Ask first"로 바꾼다. "Auto"는 Claude Code의 auto 권한 모드와 겹치므로 쓰지 않는다(ARCHITECTURE §7 'Permission modes': `auto`를 Default로 읽는다).
4. **Claude의 `default` 행**: 메뉴에서 뺀다. 고르지 않은 상태가 그 행과 같은 뜻(계정 기본 모델)이기 때문이다. 예전에 그 행을 골라 저장된 `default`는 '목록에 없는 모델은 provider 기본'(PRODUCT §5 item 0) 규칙으로 고르지 않은 상태가 된다.
5. **Settings**: 권한 행만 "Ask first"를 따른다. Model·Effort 행은 "Default"를 두고 뒤에 지금의 추천 값을 붙인다(예: `Default · Opus 5.5`, `Default · Medium`). 고정한 값처럼 읽히지 않게 하기 위해서다.
6. **노력 메뉴 기본값 행**: 이름 "Default", 아래 한 줄 설명(Codex `Medium for this model`, Claude `Chosen by Claude Code`).

## 1. 영향받는 구성 요소

### 앱 main (`app/src/main/conversation/`)

- `models.ts`
  - `ModelOption`에 `recommended?: true`를 더한다. 목록 하나에 많아야 한 행이다.
  - `parseClaudeModels`: 행의 `resolvedModel`을 읽는다. `value === "default"` 행의 `resolvedModel`과 같은 값을 가진 첫 번째 다른 행에 `recommended`를 붙이고(2026-11-06: `default` → `claude-opus-5-5` → `opus` "Opus 5.5"), `default` 행은 목록에서 뺀다(결정 4). 맞는 행이 없으면 아무 행에도 붙이지 않고 `default` 행은 그래도 뺀다.
  - `parseCodexModels`와 새 `codexRecommended(models, configuredModel)`: `config/read`의 `model`이 목록에 있으면 그 행, 없으면(null이거나 목록에 없음) `isDefault` 행에 붙인다.
  - `parseAcpModels`: 지금의 `default`(`currentModelId`) 행에 붙인다.
  - `ModelList`·`ModelsReply`의 모양은 행의 선택 필드만 늘어난다.
- `runners.ts` `listModels`의 Codex 길: `model/list`와 같은 app-server에서 `config/read {cwd}`를 한 번 더 부른다. 프롬프트도 thread도 없다. permission Default 읽기(ARCHITECTURE §7 'Permission modes' Codex)와 같은 요청이다. 실패하면 config 모델이 없는 것으로 보고 `isDefault`를 쓴다.
- 새 lease나 새 읽기 길은 없다(POSTMORTEM 2026-10-30).

### 앱 renderer (`app/src/renderer/`)

- `homeComposer.ts`
  - renderer 쪽 `ModelOption`(`homeComposer.ts:218`)에 `recommended?: true`.
  - `ModelRow`의 `model` 행에 `recommended: boolean`. 목록을 읽기 전의 `default` 행(`homeComposer.ts:278`)은 지금처럼 남지만 이름이 "Model"이다(§5).
  - 트리거 글: 고른 모델이 있으면 그 이름(지금과 같음). 없으면 `recommended` 행의 이름, 그것도 없으면 "Model". 접근성 이름은 §5.
  - 노력: 고른 레벨이 있으면 그 이름(지금과 같음). 없으면 고른 모델의 `defaultEffort`(Codex)의 이름, 없으면 "Effort". `effort.options` 맨 앞에 `{id: "default", …}` 행을 더한다. 고르면 `onPick(null)`로 노력을 비운다.
- `ComposerParts.tsx`: `AgentPicker`의 모델 행에 "Recommended" 표시(글 또는 badge, 초안에서 정함). `EffortPicker`의 RadioGroup에 기본값 행(value `""`)을 더한다. 지금 `effort ?? ""`가 RadioGroup의 값이므로(`ComposerParts.tsx:348`) 그 행이 고르지 않은 상태와 맞물린다.
- `permissionPicker.ts` `MODES.default`: label "Ask first", 설명은 provider별 함수(§5).
- `dockedRules.ts:176` `dockedPicker`: 다른 provider일 때의 "Default"를 같은 규칙의 글로 바꾼다.
- `SettingsAgents.tsx`: Model 행은 고정하지 않았으면 `Default · <추천 모델 이름>`(모르면 `Default`), Effort 행은 `Default · <기본 레벨>`(모르면 `Default`), Permission 행은 composer와 같은 "Ask first"(결정 5).
- fast-mode(구현 중)가 `modelPickerView`의 `effort`와 `EffortPicker`를 고친다. 이 feature는 fast-mode가 병합된 뒤에 시작하고 그 모양 위에서 고친다.

### CLI·skill·shared schema

- 바뀌지 않는다.

## 2. 순수 함수로 떼어 낼 부분(`/tdd` 대상)

1. `parseClaudeModels`의 `resolvedModel`과 `recommended`.
2. `codexRecommended(models, configuredModel)`과 `config/read` 답의 `model` 읽기.
3. `parseAcpModels`의 `recommended`.
4. `modelPickerView`의 트리거 글·접근성 이름(고른 것, 추천, "Model"), `ModelRow.recommended`.
5. 노력 트리거 글(고른 레벨, `defaultEffort`, "Effort")과 기본값 행.
6. `permissionPickerView`의 "Ask first"와 provider별 설명.
7. `dockedPicker`의 글.

## 3. 형식 변경

- shared JSON Schema: 없음.
- IPC `conversation:models` 응답의 모델 행에 `recommended?: true`. 저장 형식(index, ui-state, preferences)은 바뀌지 않는다. 권한 id `default`도 그대로다.

## 4. Settings > New conversations

Settings의 Model·Effort 행에서 "Default"는 "고정하지 않음 = 그때그때 provider 기본"이라는 뜻이다. composer와 같은 규칙으로 실제 모델 이름만 보이면 고정한 것처럼 읽히므로, "Default" 뒤에 지금의 추천 값을 붙인다(결정 5). 권한은 모드 이름이므로 "Ask first"를 그대로 쓴다.

## 5. 문구(clarify preset을 읽고 정함, 초안에서 다듬는다)

UI 문구는 영어다.

| 자리 | 지금 | 바뀐 뒤 |
|---|---|---|
| 모델 트리거(고르지 않음) | `Default` | 추천 모델 이름, 모르면 `Model` |
| 모델 트리거 접근성 이름 | `Agent: <provider>, model Default` | `Agent: <provider>, model <name>, recommended` / `Agent: <provider>, model not chosen` |
| 모델 메뉴 표시 | 없음 | 그 행에 `Recommended` |
| 목록 읽기 전 모델 행 | `Default` | `Model`과 같은 뜻의 행(초안에서 정함) |
| 노력 트리거(고르지 않음) | `Default` | Codex 기본 레벨 이름(예: `Medium`), 모르면 `Effort` |
| 노력 메뉴 기본값 행 | 없음 | `Default`, 설명 Codex `Medium for this model`(레벨 이름은 그 모델의 기본값), Claude `Chosen by Claude Code` |
| Settings Model·Effort(고정 안 함) | `Default` | `Default · Opus 5.5`, `Default · Medium`(모르면 `Default`) |
| 권한 Default 이름 | `Default` | `Ask first` |
| 권한 Default 설명 | `Follows Doan’s <provider> settings` | Claude: `Asks before editing files or running commands`. Codex: `Asks before running outside the sandbox`. ACP: `Uses <provider>’s default mode`. 그 뒤에 Doan 설정을 따른다는 사실을 짧게 남긴다(초안에서 정함) |

Claude Code의 Default 모드는 파일 편집과 명령 전에 묻는다. Codex의 Default는 project 신뢰에 따라 정책이 다르다(신뢰하지 않으면 read-only + on-request, 신뢰하면 workspace-write + on-request). 그래서 Codex 설명은 sandbox를 기준으로 쓴다. ACP 서버의 기본 모드는 provider마다 다르므로 이름만 같고 설명은 일반적으로 쓴다.

## 6. 결정·규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check`: 영향 없음.
- 보내는 값과 저장 형식이 바뀌지 않으므로 append-only 이벤트, index 규칙과 무관하다.

## 7. POSTMORTEM에서 가져온 함정

- **2026-11-02 "A picked model was forgotten …"**: 고정 기본값(Settings)이 기억한 모델을 덮는 규칙이 있다. 트리거 글은 "실제로 쓸 모델"을 보여야 하므로, 고정 기본값이 있으면 그 모델의 이름이 추천 이름보다 먼저다. `defaultModel`(`homeComposer.ts:230`)이 정한 모델을 기준으로 글을 정한다.
- **2026-10-30 "A model list read made sign-out ask to stop conversations"**: `config/read`는 이미 있는 목록 읽기 lease 안에서 부른다.

## 8. PoC

- 없음. 필요한 사실은 2026-11-06에 프롬프트 없이 확인했다(spec 문제 2, `.scratch/project-skill-drawer/labels-probe.mjs`·`config-read.mjs`).
- 확인하지 않은 것: project `.claude/settings.json`의 `model`이 Claude `default` 행의 `resolvedModel`에 반영되는지. 반영되지 않으면 그런 project에서 트리거 이름이 실제 모델과 다를 수 있다. R1에서 본다.

## 9. 초안 요청(`/design-draft picker-default-labels`)

새 파일 `.doan/canvases/picker-default-labels.html`.

- `triggers`: Home 도구 행과 docked tray에서 고르지 않은 세 트리거(Claude, Codex, 목록 읽기 전). 고른 상태와 나란히.
- `menus`: 모델 메뉴의 Recommended 표시, 노력 메뉴의 기본값 행, 권한 메뉴의 Ask first 행과 설명(Claude, Codex, ACP).
- `docked-widths`: 새 글로 384·288 단계가 넘치지 않는지(가장 긴 이름 "GPT-5.6-Terra"·"Extra high" 기준).
- `settings`: Settings > New conversations의 세 행(결정 5).

상태: 초안 전.
