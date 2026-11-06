# picker-default-labels — spec

사람의 요청: "모델, 권한 레이블. Default 말고 그냥 Recommended, Auto 이렇게 하는게 좀 더 직관적으로 뭔지 알 것 같은데. 노력은 Default밖에 없나", 이어서 "목표는 선택하지 않았을 때, 버튼 레이블만 보고 어떤 역할의 서랍인지 직관적으로 파악할 수 있게 하는 것"(2026-11-06).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7에 걸리지 않는다. 이미 있는 composer 피커의 글과, 그 글을 정하는 데 필요한 provider 설정 읽기만 바꾼다.
- PRODUCT §5 item 1 'Agent and model picker'("without a list no model is sent", "Effort appears only for a model with levels")와 'Permission picker'("Default · Accept edits · Plan (read-only) · Full access"), item 0 'New conversations'("Model offers Default or that provider's models")의 문장이 바뀐다. 마지막 작업에서 PRODUCT를 고친다(tasks Z1).

## 사용자

- **사람(앱 사용자)**: Home, project Overview, 캔버스 conversation panel의 composer에서 아무것도 고르지 않은 상태로 트리거 세 개(모델, 노력, 권한)를 본다. 글만 보고 각 트리거가 무엇을 고르는 서랍인지 알아야 한다.
- **에이전트(CLI·skill)**: 바뀌는 것이 없다. 보내는 값(model, effort, permission mode)도 바뀌지 않는다.

## 문제(지금 관찰된 사실)

1. **고르지 않은 세 트리거가 모두 "Default"다.**
   - 모델: 고른 모델이 없으면 provider 로고와 "Default"(`homeComposer.ts:284`, 목록을 읽기 전 행은 `:278`, 기존 대화의 docked 트리거는 `dockedRules.ts:176`, Settings 행은 `SettingsAgents.tsx:203`).
   - 노력: 고른 레벨이 없으면 게이지 아이콘과 "Default"(`homeComposer.ts:290`).
   - 권한: Default 모드의 이름이 "Default", 설명은 "Follows Doan’s <provider> settings"(`permissionPicker.ts:14`).
   - 아이콘이 다르긴 하지만, 글로는 세 서랍을 구별할 수 없다.
2. **"Default"가 실제로 무엇인지 Doan은 대부분 안다(2026-11-06 확인, 프롬프트 없음).**
   - Claude Code 2.1.318: `supportedModels()`의 `default` 행은 `displayName` "Default (recommended)", `resolvedModel` `claude-opus-5-5`이고, 같은 `resolvedModel`을 가진 `opus` 행의 이름이 "Opus 5.5"다. Claude는 모델별 기본 노력 레벨을 주지 않는다.
   - Codex 0.166.0: `model/list`의 `isDefault` 모델(이 계정은 GPT-6-Luna)과 모델마다 `defaultReasoningEffort`(medium)를 준다. `config/read {cwd}`는 config가 정한 `model`과 `model_reasoning_effort`를 돌려주고, 정하지 않았으면 null이다(Doan 프로필은 둘 다 null, `-c model=…`로 넘기면 그 값).
   - ACP: `session/new`의 `currentModelId`가 지금 모델이다(`parseAcpModels`의 `default`).
3. **노력 메뉴에는 기본값 행이 없다.** 메뉴는 모델의 레벨만 나열한다(`ComposerParts.tsx:342` `EffortPicker`). 그래서 composer에서 한 번 레벨을 고르면 "고르지 않음"으로 돌아갈 수 없다. Settings > New conversations에는 Default 라디오가 있다(`SettingsAgents.tsx:254`).

## 완료 조건

### 모델

- 고른 모델이 없을 때 트리거는 그 provider가 실제로 쓸 모델의 이름을 보인다.
  - Claude: 목록의 `default` 행의 `resolvedModel`과 같은 다른 행의 이름(예: "Opus 5.5").
  - Codex: `config/read`의 `model`이 있으면 목록에서 그 모델의 이름, 없으면 `isDefault` 모델의 이름.
  - ACP: `currentModelId` 모델의 이름.
  - 위로 정하지 못하면(목록을 읽기 전, 읽기 실패, 이름을 찾지 못함) 트리거는 "Model"이다.
- Claude 메뉴에서 "Default (recommended)" 행(계정 기본 모델 alias)은 빠진다. 예전에 그 행을 골라 저장된 값은 고르지 않은 상태로 읽힌다.
- 메뉴에서 그 모델 행에 "Recommended" 표시가 붙는다. 표시는 행의 모양이고 선택(체크)이 아니다. 고른 것이 없을 때 체크된 행은 없다(지금과 같다).
- 보내는 값은 바뀌지 않는다. 고르지 않았으면 지금처럼 모델을 보내지 않는다.
- 접근성 이름: 고르지 않았을 때 "Agent: <provider>, model <이름>, recommended"(이름을 모르면 "…, model not chosen").

### 노력

- 고른 레벨이 없을 때 트리거는 Doan이 그 턴에 실제로 보낼 레벨의 이름을 보인다. Codex는 고른 모델의 `defaultReasoningEffort`다. 레벨을 고르지 않은 Codex 턴은 그 값을 보내기 때문이다(ARCHITECTURE §7 'Models'). config의 `model_reasoning_effort`는 쓰지 않는다. 모델을 고르지 않으면 노력 트리거가 없으므로 config 값이 보일 자리도 없다. 모르면(Claude, 목록 없음) "Effort"다.
- 메뉴 맨 위에 기본값으로 돌아가는 행 "Default"가 있고, 아래 설명이 무엇의 기본인지 말한다(Codex `Medium for this model`, Claude `Chosen by Claude Code`). 그 행을 고르면 노력을 보내지 않는 상태로 돌아간다.
- 트리거가 보이는 조건("Effort appears only for a model with levels")은 바꾸지 않는다.

### 권한

- Default 모드의 이름이 "Ask first"다. 트리거, 메뉴 행, Settings 행, 접근성 이름이 모두 이 이름을 쓴다. 다른 세 모드의 이름은 그대로다.
- 메뉴 행의 설명은 provider마다 실제 동작을 말한다(design §5). Doan 프로필이나 project 설정이 묻지 않게 해 두었으면 이름과 다르게 동작할 수 있다는 사실을 설명이 감추지 않는다.
- 저장되는 모드 id(`default`)와 보내는 값은 바뀌지 않는다.

### Settings > New conversations

- Permission 행은 "Ask first"를 쓴다. Model·Effort 행은 고정하지 않았을 때 "Default" 뒤에 지금의 추천 값을 붙인다(예: `Default · Opus 5.5`, `Default · Medium`). 모르면 "Default"다.

### 공통

- Home, project Overview, 캔버스 conversation panel, 기존 대화의 docked 트리거가 같은 규칙을 쓴다. 터미널 세션의 고정 트리거는 지금 그대로다("Terminal session", "Default", "Set in your terminal").
- 도킹된 tray의 폭 단계(384·288)는 새 글에서도 넘치지 않는다. 필요하면 단계를 다시 잰다.

## 비목표

- 고르지 않았을 때 모델이나 노력을 명시적으로 보내기.
- 모델을 고르지 않았을 때 노력 트리거를 보이기.
- Claude의 기본 노력 레벨 알아내기(provider가 주지 않는다).
- 피커의 아이콘, 순서, 메뉴 구조 바꾸기(노력 메뉴의 기본값 행 하나만 더한다).
- Settings > New conversations의 행 구조 바꾸기.
