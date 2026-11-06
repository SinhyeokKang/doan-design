# picker-default-labels — design

## 결정(사람, 2026-11-06)

1. **모델**: 목록을 받으면 composer가 기본 행을 고르는 지금 방식을 그대로 쓴다. Claude `default` 행의 이름만 실제 모델 이름(`resolvedModel`이 같은 행의 이름, 예: "Opus 5.5")으로 바꾸고, 그 같은 모델의 다른 행은 메뉴에서 뺀다. 보내는 값은 `"default"` 그대로라 계정·설정의 기본을 계속 따른다. 목록이 없으면 트리거는 "Model"이다.
2. **기본 표시 단어**: 모델 메뉴의 기본 행 표시, 노력 메뉴의 기본값 행, Settings의 `Default · X`가 모두 "Default"를 쓴다. "Recommended"는 쓰지 않는다. ACP의 지금 모델이나 사람이 고른 설정에는 맞지 않는 말이기 때문이다.
3. **노력**: 아는 기본 레벨의 이름, 모르면 "Effort". 메뉴 맨 위에 "Default" 행과 설명을 둔다.
4. **권한**: Default 모드의 이름을 "Ask first"로 바꾼다. "Auto"는 Claude Code의 auto 권한 모드와 겹치므로 쓰지 않는다(ARCHITECTURE §7 'Permission modes': `auto`를 Default로 읽는다). 설명은 provider마다 짧고 사실대로 쓴다(§5).
5. **Settings**: Model 메뉴 맨 위에 늘 "Default" 행(설명은 지금 기본 모델 이름)을 두고, Claude의 `default` 행은 Settings 메뉴에서만 뺀다. 고정하지 않았을 때의 트리거는 `Default · <값>`이다. Permission은 "Ask first"다.
6. **터미널 세션 고정 트리거**: 값을 모르는 자리는 서랍 이름을 보인다: "Effort", "Permission".
7. **docked tray 간격**(사람, 2026-11-06, 초안 round 3): tray의 모든 컨트롤(Attach, Pick, 모델, 노력, 권한) 사이를 2px, 마지막 피커와 context ring 사이를 4px로 줄인다(출시: 4px, 링 앞 8px). 이 간격은 이미 출시된 tray를 바꾸므로 B2(`/design-sync`)에서 재고, Z1에서 DESIGN.md의 tray 측정값을 고친다.
8. **docked 단계**(사람, 2026-11-06, 초안 round 4): 모델 이름이 끝까지 보이도록 권한은 내용 폭 432 아래(출시 384), 노력은 384 아래(출시 288)에서 아이콘만 보인다. 모델 라벨은 320 아래에서 줄어든다. 경계는 가장 긴 라벨 조합("GPT-5.6-Terra", "Extra high"+Fast 아이콘, "Ask first")을 초안에서 잰 값이다: 라벨 모두 432, 권한 아이콘 381, 둘 다 아이콘 320. B2에서 실제 앱으로 다시 잰다.

## 1. 영향받는 구성 요소

### 앱 main (`app/src/main/conversation/`)

- `models.ts` `parseClaudeModels`만 바뀐다. 행의 `resolvedModel`(SDK `ModelInfo.resolvedModel?: string`, `sdk.d.ts:1441`)을 읽는다. `value === "default"` 행에 대해, 같은 `resolvedModel`을 가진 첫 번째 다른 행이 있으면 다음처럼 한다.
  - `default` 행의 `label`을 그 행의 이름으로 바꾼다.
  - 그 다른 행을 목록에서 뺀다.
  - 맞는 행이 없으면 `default` 행을 지금처럼 둔다. `default` 플래그와 id `"default"`는 그대로다.
- 이 변경으로 `ModelCatalog.accepts`·`validateSendExtras`·저장된 값은 영향을 받지 않는다. 저장된 `"opus"`는 이제 목록에 없으므로, 기존 규칙('목록에 없는 모델은 provider 기본', PRODUCT §5 item 0)에 따라 기본 행으로 읽힌다. 같은 모델이다.
- Codex·ACP와 IPC 응답 모양은 바뀌지 않는다. `config/read`를 부르지 않는다.

### 앱 renderer (`app/src/renderer/`)

- `homeComposer.ts`
  - renderer 쪽 `ModelOption`(`homeComposer.ts:218`)에 `defaultEffort?: string`을 더한다. IPC는 이미 이 값을 싣는다.
  - `ModelRow`의 `model` 행에 `isDefault: boolean`(그 행의 `default` 플래그). 메뉴의 "Default" 표시와 접근성 이름 꼬리에 쓴다.
  - 목록을 읽기 전 행(`homeComposer.ts:278`)의 이름은 "Default"로 남는다. 트리거 글만 바뀐다: 고른 모델(자동으로 고른 기본 행 포함)이 없으면 "Model"(`:284`).
  - 노력: 고른 레벨이 없으면 트리거 글은 고른 모델의 `defaultEffort` 레벨 이름, 없으면 "Effort"(`:290`). `effort` view에 `options`와 따로 `unset: {label: "Default", description, selected}`를 둔다. options에 넣으면 Settings가 자기 Default 라디오와 함께 두 번 그린다(`SettingsAgents.tsx:257-258`).
- `ComposerParts.tsx`
  - `AgentPicker`: `isDefault` 행 이름 뒤에 작은 글 "Default"를 단다. Frame drawer의 "Viewing" 모양을 따른다(caption, metadata 잉크, 이름 뒤 inline). badge 컴포넌트는 새로 만들지 않는다.
  - `EffortPicker`: RadioGroup 맨 앞에 `unset` 행(value `""`)을 둔다. 지금 RadioGroup 값이 `effort ?? ""`(`ComposerParts.tsx:354`)이므로 고르지 않은 상태와 맞물린다. 고르면 `onPick("")`이다. 세 호출부는 받은 값을 저장하는데, `""`는 `defaultEffort`의 `includes`에서 걸러져 노력을 보내지 않는 상태가 된다(`homeComposer.ts:240`). `onPick`의 시그니처는 바꾸지 않는다. 기존 대화에서는 모델만 보내므로 service가 저장된 노력을 지운다(`service.ts:293`). 행이 두 줄이므로 check-slot을 위쪽에 맞춘다(`.perm-item`과 같다).
- `permissionPicker.ts` `MODES.default`: label "Ask first", description은 provider를 받아 §5의 문장을 고른다. `permissionPickerView`는 이미 provider를 받는다(`permissionPicker.ts:44`).
- `dockedRules.ts:176` `dockedPicker`: 다른 provider일 때의 "Default" 분기는 실제로 닿지 않지만(기존 대화의 `chosen`은 늘 그 provider다), 글은 "Model"로 맞춘다. 접근성 이름 형식은 spec '모델'을 따른다.
- `DockedComposer.tsx:419-421`: 터미널 세션 고정 트리거의 글 "Effort", "Permission"(결정 6).
- `SettingsAgents.tsx`: Model 메뉴 맨 위 "Default" 행(설명 = 기본 행 이름), Claude `default` 행 빼기, 트리거 `Default · <값>`, Permission "Ask first"(결정 5). Effort 행의 기준 모델은 지금처럼 `listed.find(item => item.default)`다(`SettingsAgents.tsx:208`). Claude `default` 행이 목록에 남으므로 그대로 동작한다.
- fast-mode(구현 중)가 `modelPickerView`의 `effort`와 `EffortPicker`를 고친다. Claude `default` 행은 `supportsFastMode: true`이므로, 고르지 않은 Claude composer에서도 Fast 행이 그대로 보인다. 이 feature는 fast-mode가 병합된 뒤에 그 모양 위에서 시작한다.

### CLI·skill·shared schema

- 바뀌지 않는다.

## 2. 순수 함수로 떼어 낼 부분(`/tdd` 대상)

1. `parseClaudeModels`의 `resolvedModel` 읽기와 `default` 행 이름·짝 행 빼기.
2. `modelPickerView`: 트리거 글("Model"), `ModelRow.isDefault`, 접근성 이름.
3. 노력 트리거 글(고른 레벨, `defaultEffort`, "Effort")과 `unset` 행, 접근성 이름.
4. `permissionPickerView`의 "Ask first"와 provider별 설명.
5. `dockedPicker`의 글과 접근성 이름.
6. Settings 글: `settingsModelLabel`·`settingsEffortLabel`(`Default · <값>`)과 Settings Model 메뉴 행 목록(맨 위 Default, Claude `default` 행 빼기)을 `SettingsAgents.tsx` 밖의 순수 함수로 뗀다.

## 3. 형식 변경

- 없다. IPC 응답 모양, 저장 형식(index, ui-state, preferences), 권한 id `default`는 그대로다.

## 4. 결정·규약 영향

- ARCHITECTURE §1 'Conventions'와 `doan check`: 영향 없음.
- 보내는 값이 바뀌지 않으므로 이벤트·index 규칙과 무관하다.

## 5. 문구(clarify preset을 읽고 정함, 초안에서 다듬는다)

UI 문구는 영어다.

| 자리 | 지금 | 바뀐 뒤 |
|---|---|---|
| 모델 트리거, 목록 없음 | `Default` | `Model` |
| Claude 기본 행 | `Default (recommended)` | 실제 모델 이름(예: `Opus 5.5`) + 표시 `Default` |
| 메뉴의 기본 행 표시 | 없음 | 이름 뒤 작은 글 `Default` |
| 모델 접근성 이름 | `Agent: <provider>, model <name>` | 기본 행이면 `…, default`, 목록 없음 `…, model not chosen` |
| 노력 트리거, 고르지 않음 | `Default` | Codex 기본 레벨(예: `Medium`), 모르면 `Effort` |
| 노력 메뉴 기본값 행 | 없음 | `Default`, 설명 Codex `Medium for this model`, Claude `Set by Claude Code` |
| 노력 접근성 이름 | `Effort: Default` | `Effort: Medium, default` / `Effort: default` |
| 권한 Default 이름 | `Default` | `Ask first` |
| 권한 Default 설명 | `Follows Doan’s <provider> settings` | Claude `Asks before edits and commands unless allowed`, Codex `Asks before going outside its sandbox`, ACP `Asks when <provider> needs approval` |
| 터미널 고정 트리거 | `Default`, `Default` | `Effort`, `Permission` |
| Settings Model·Effort, 고정 안 함 | `Default` | `Default · Opus 5.5`, `Default · Medium`(모르면 `Default`) |
| Settings Model 메뉴 맨 위 | 없음(Claude는 기본 행) | `Default`, 설명 = 기본 모델 이름 |

## 6. POSTMORTEM에서 가져온 함정

- **2026-11-02 "A picked model was forgotten …"**: 고정 기본값(Settings)은 기억한 모델보다 먼저다. 트리거 글은 `defaultModel`(`homeComposer.ts:230`)이 정한 모델을 기준으로 한다. Settings의 맨 위 Default 행은 고정을 푸는 길이며, Last used 규칙은 바꾸지 않는다.

## 7. PoC

- 없다. 필요한 사실은 2026-11-06에 프롬프트 없이 확인했다(spec 문제 4, `.scratch/project-skill-drawer/labels-probe.mjs`).
- R1에서 볼 것:
  - Copilot의 `currentModelId` `auto` 행 이름이 트리거에 "Auto"로 보이는지. 그렇다면 권한에서 피한 "Auto"와 겹치는지.
  - ACP 기본 모드(Cursor `agent`, Copilot `agent` + allow_all off, Antigravity `default`)가 실제로 묻는지. 묻지 않으면 "Ask first"와 맞지 않는다.

## 8. 초안 요청(`/design-draft picker-default-labels`)

새 파일 `.doan/canvases/picker-default-labels.html`.

- `triggers`: Home 도구 행과 docked tray. 목록 없음("Model"), Claude 기본(Opus 5.5 · Ask first), Codex 기본(GPT-6-Luna · Medium · Ask first), 고른 상태와 나란히. 터미널 고정 트리거.
- `menus`: 모델 메뉴의 기본 표시, 노력 메뉴의 Default 행(Codex, Claude), 권한 메뉴의 Ask first 행과 세 설명.
- `docked-widths`: 384~400과 288에서 "Ask first + GPT-6-Luna + Extra high"가 넘치지 않는지.
- `settings`: Settings > New conversations의 세 행과 Model 메뉴 맨 위 Default 행.

상태: 초안 round 2, 사람 확인 전. round 2(사람, 2026-11-06)에서 노력 메뉴와 트리거에 fast-mode의 Fast 행과 아이콘을 넣었다(이 feature는 fast-mode 병합 뒤 시작한다). Chromium 렌더링: 권한 설명 세 개는 280px 메뉴에서 두 줄이다. docked에서 "Extra high"+Fast 아이콘+"Ask first"이면 모델 라벨이 420(내용 396)에서 "GPT…", 360·288에서 "G…"까지 줄어든다. 384·288 단계를 옮길지는 B2(`/design-sync`)에서 정한다.
