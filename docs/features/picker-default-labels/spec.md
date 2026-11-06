# picker-default-labels — spec

사람의 요청: "모델, 권한 레이블. Default 말고 그냥 Recommended, Auto 이렇게 하는게 좀 더 직관적으로 뭔지 알 것 같은데. 노력은 Default밖에 없나", 이어서 "목표는 선택하지 않았을 때, 버튼 레이블만 보고 어떤 역할의 서랍인지 직관적으로 파악할 수 있게 하는 것"(2026-11-06).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7에 걸리지 않는다. 이미 있는 composer 피커와 Settings > New conversations의 글, 노력 메뉴와 Settings Model 메뉴의 기본값 행 하나씩을 바꾼다.
- PRODUCT의 문장이 바뀐다: §5 item 1 'Agent and model picker'와 'Permission picker'(`Default · Accept edits · …`), item 0 'New conversations'("Model offers Default …"), 그리고 권한 모드를 "Default"로 부르는 다른 문장들. 마지막 작업에서 고친다(tasks Z1).

## 사용자

- **사람(앱 사용자)**: Home, project Overview, 캔버스 conversation panel의 composer와 Settings > New conversations에서 아무것도 고르지 않은 상태로 모델·노력·권한 트리거를 본다. 글만 보고 각 트리거가 무엇을 고르는 서랍인지 알아야 한다.
- **에이전트(CLI·skill)**: 바뀌는 것이 없다. Doan이 보내는 값(model, effort, permission mode)도 바뀌지 않는다.

## 문제(지금 관찰된 사실)

1. **목록을 받으면 composer는 기본 행을 고른 것으로 친다.** `defaultModel`(`homeComposer.ts:230-235`)은 고른 모델이 없으면 목록에서 `default` 플래그가 붙은 행을 고르고, 세 composer가 그 id를 보낸다(`HomeComposerView.tsx:237,405`, `ProjectOverview.tsx:148,248`, `CanvasConversationPanel.tsx:244,378`). 플래그가 붙는 행은 provider마다 다르다.
   - Claude: `default` 행(`parseClaudeModels`의 `r.value === "default"`)이다. 이름은 SDK의 `displayName` "Default (recommended)"이고, 보내는 값은 `"default"`다.
   - Codex: `isDefault` 행이다. 이름은 모델 이름(예: GPT-6-Luna)이다.
   - ACP: `currentModelId` 행이다.
2. **그래서 이름에 "Default"가 남는 자리는 다섯이다.**
   - 모델 트리거: 목록을 읽기 전이거나 읽지 못했을 때 provider 로고와 "Default"(`homeComposer.ts:278,284`). Claude는 목록을 받은 뒤에도 "Default (recommended)"다.
   - 노력 트리거: 레벨을 고르지 않았을 때 게이지 아이콘과 "Default"(`homeComposer.ts:290`).
   - 권한: Default 모드의 이름 "Default", 설명 "Follows Doan’s <provider> settings"(`permissionPicker.ts:14`).
   - 터미널 세션의 고정 트리거: 노력과 권한이 "Default"(`DockedComposer.tsx:419-421`).
   - Settings > New conversations의 Model 행: 고정하지 않았으면 "Default"(`SettingsAgents.tsx:203`).
   - 아이콘이 다르긴 하지만, 글로는 서랍을 구별할 수 없다.
3. **노력 메뉴와 Settings Model 메뉴에는 "고르지 않음"으로 돌아가는 행이 없다.** 노력 메뉴는 모델의 레벨만 나열한다(`ComposerParts.tsx:348` `EffortPicker`). 그래서 composer에서 한 번 레벨을 고르면 돌아갈 수 없다. Settings Model 메뉴는 목록이 있으면 모델 행만 보인다(`SettingsAgents.tsx:248`). Codex와 ACP는 한 번 고정하면 풀 수 없고, Claude는 "Default (recommended)" 행이 그 역할을 대신한다.
4. **Doan이 아는 사실(2026-11-06, 프롬프트 없이 확인).**
   - Claude Code 2.1.318의 `supportedModels()`에서 `default` 행의 `resolvedModel`은 `claude-opus-5-5`다. 같은 `resolvedModel`을 가진 `opus` 행의 이름은 "Opus 5.5"다. Claude는 모델별 기본 노력 레벨을 주지 않는다.
   - Codex 0.166.0의 `model/list`는 모델마다 `defaultReasoningEffort`(이 계정은 모두 medium)를 준다. Doan은 레벨을 고르지 않은 send 턴에 그 값을 보낸다(ARCHITECTURE §7 'Models'). start(첫 턴)는 보내지 않는다(`ipc.ts:139-143`).

## 완료 조건

### 모델

- Claude 목록의 `default` 행 이름은 그 `resolvedModel`과 같은 다른 행의 이름이다(예: "Opus 5.5"). 그 다른 행(`opus`)은 composer 메뉴에서 빠진다. 보내는 값은 지금처럼 `"default"`다. 맞는 행이 없으면 지금 이름을 그대로 둔다.
- 메뉴에서 `default` 플래그가 붙은 행(Claude `default`, Codex `isDefault`, ACP `currentModelId`)은 이름 뒤에 작은 글 "Default"를 단다(Frame drawer의 "Viewing"과 같은 모양).
- 목록을 읽기 전이거나 읽지 못했을 때 트리거는 "Model"이다. 메뉴 안의 그 행 이름은 "Default"다(provider 그룹 머리가 provider를 말한다).
- 접근성 이름: 보이는 모델이 기본 행이면 끝에 ", default"를 붙인다(Home `Agent: <provider>, model <name>, default`, docked `Model: <name>, default (<provider>)`). 목록이 없으면 `Agent: <provider>, model not chosen`, docked `Model: not chosen (<provider>)`.

### 노력

- 레벨을 고르지 않았을 때 트리거는 Codex면 그 모델의 `defaultReasoningEffort`의 레벨 이름(예: "Medium"), 모르면(Claude, `defaultReasoningEffort`가 없는 모델) "Effort"다.
- 메뉴 맨 위에 "Default" 행이 있다. 아래 한 줄 설명은 Codex `<Level> for this model`(예: `Medium for this model`), Claude `Set by Claude Code`다. 그 행을 고르면 노력을 보내지 않는 상태로 돌아간다. 고르지 않은 상태에서는 그 행이 체크된다.
- 접근성 이름: 고르지 않았으면 `Effort: Medium, default`, 모르면 `Effort: default`.
- 노력 트리거가 보이는 조건("Effort appears only for a model with levels")은 바꾸지 않는다.
- 알려진 한계: start(첫 턴)는 `defaultReasoningEffort`를 보내지 않는다. 그래서 Codex config에 `model_reasoning_effort`가 있으면 첫 턴은 트리거의 레벨과 다를 수 있다. Doan 프로필은 그 값이 없다.

### 권한

- Default 모드의 이름이 "Ask first"다. 트리거, 메뉴 행, Settings 행, 접근성 이름이 모두 이 이름을 쓴다. 다른 세 모드의 이름은 그대로다.
- 메뉴 행 설명: Claude `Asks before edits and commands unless allowed`, Codex `Asks before going outside its sandbox`, ACP `Asks when <provider> needs approval`.
- 저장되는 모드 id(`default`)와 보내는 값은 바뀌지 않는다.
- 알려진 한계: Claude가 plan 승인 뒤 `auto`·`dontAsk`로 바뀐 턴은 Default로 읽히므로(ARCHITECTURE §7 'Permission modes') 그 턴 동안 트리거가 "Ask first"를 보이지만 Claude는 묻지 않는다.

### 터미널 세션(legacy-external)

- 고정 트리거의 글이 "Terminal session" · "Effort" · "Permission"이다. tooltip "Set in your terminal"과 접근성 이름("set by the terminal session")은 그대로다.

### Settings > New conversations

- Model 메뉴 맨 위에 늘 "Default" 행이 있고, 아래 설명은 지금 기본 행의 모델 이름이다(목록이 없으면 설명 없음). 그 행을 고르면 고정을 푼다. Claude의 `default` 행은 이 메뉴에서만 빠진다(위 행과 같은 뜻이다).
- 고정하지 않았을 때 Model 트리거는 `Default · <기본 모델 이름>`, Effort 트리거는 `Default · <레벨>`이다. 모르면 "Default"다.
- Permission은 "Ask first"를 쓴다.

### 공통

- Home, project Overview, 캔버스 conversation panel, 기존 대화의 docked 트리거가 같은 규칙을 쓴다.
- 도킹된 tray의 폭 단계(384·288)는 새 글에서도 넘치지 않는다.

## 비목표

- 보내는 model·effort·permission 값 바꾸기(start 첫 턴의 노력 포함).
- 모델을 고르지 않았을 때 노력 트리거 보이기.
- Claude의 기본 노력 레벨 알아내기(provider가 주지 않는다).
- Codex config의 모델 읽기(`config/read`). Doan은 `isDefault` 모델을 보내므로 그 이름이 실제 모델이다.
- 피커의 아이콘, 순서 바꾸기.
