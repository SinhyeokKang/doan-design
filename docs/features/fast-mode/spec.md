# fast-mode — spec

사람의 요청: "codex fast 모드 gui로 지원 가능?", 이어서 "묶어서 가야겠군", "toggle 개념으로 가자"(2026-11-06).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7에 걸리지 않는다. 앱이 이미 시작하는 대화(In scope 6)의 실행 옵션 하나를 더한다. 계정·서버·git·자동 깨우기와 관계없다.
- PRODUCT §5 item 1 'Agent and model picker'와 'New conversations'가 모델·effort·permission만 정한다. Fast는 아직 정하지 않은 항목이라, 마지막 작업에서 PRODUCT에 현재 규칙으로 올린다(tasks Z1).

## 사용자

- **사람(앱 사용자)**: Home, project Overview, 캔버스 conversation panel의 composer에서 Claude·Codex 대화를 Fast로 돌릴지 켜고 끈다. 켠 턴이 Fast로 돌지 않았다고 provider가 알려 주면 스레드에서 그 사실을 본다.
- **에이전트(CLI·skill)**: 바뀌는 것이 없다. Fast는 provider의 실행 옵션이고, 프롬프트에 들어가지 않는다(ARCHITECTURE §7 'Input and prompt': model과 effort도 프롬프트에 들어가지 않는다).

## 문제(지금 관찰된 사실)

1. **앱에서 Fast를 켤 수 없다.** composer 도구 행은 Attach · Presets · 에이전트와 모델 · Effort · Permission · Send이고(PRODUCT §5 item 1 'Composer'), Effort 메뉴는 모델의 레벨만 고른다(`app/src/renderer/ComposerParts.tsx:342` `EffortPicker`). 앱 코드와 문서 어디에도 service tier나 fast mode가 없다(`rg -n "serviceTier|fastMode" app/src docs` 결과 없음).
2. **두 provider는 모델마다 Fast를 제공한다(2026-11-06 확인).**
   - Codex 0.166.0: app-server `model/list`가 모델마다 `serviceTiers`를 돌려준다. 이 계정의 공개 모델 8개 모두 `{id: "priority", name: "Fast"}` 하나를 가졌고, 설명은 모델마다 다르다("2x speed, increased usage", "1.5x speed", "1.5x speed, increased usage"). `thread/start`·`turn/start`가 `serviceTier`를 받고, `turn/start`는 그 턴에만 쓰는 `serviceTierForTurn`도 받는다(`codex app-server generate-json-schema`: `v2/ModelListResponse.json`, `v2/TurnStartParams.json`).
   - Claude Code 2.1.318 / Agent SDK 0.3.312: `supportedModels()`의 행마다 `supportsFastMode`가 있다. 이 계정에서는 `default`, `opus`, `claude-opus-5`, `claude-opus-4-8`이 true였고 나머지는 값이 없었다. SDK `Options.settings`(flag 계층)의 `fastMode: true`로 켜고, 결과 메시지가 `fast_mode_state`(`off`·`cooldown`·`on`)와 `fast_mode_disabled_reason`을 보낸다(`app/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` `FastModeState`, `FastModeDisabledReason`, `SDKResultSuccess`). SDK로 실행하면 flag 계층에서 켜지 않는 한 `sdk_opt_in_required`로 꺼진다(CLI 번들의 판정 코드).
3. **나머지 provider는 토글로 묶을 수 없다.** Cursor는 ACP에서 바뀐 bracket 값을 거부하고(ARCHITECTURE §7 'Models'), Copilot 1.0.105는 Fast가 `claude-opus-4.8-fast` 같은 별도 모델 ID다(`copilot help config`). 두 provider는 목록에 Fast 모델이 있으면 지금처럼 모델 피커에서 고른다. Antigravity는 Fast가 있는지 확인하지 못했다.

## 완료 조건

### Fast 스위치

- Claude 또는 Codex를 고른 composer에서, 고른 모델이 Fast를 지원하면 Effort 메뉴의 레벨 목록 아래에 구분선과 Fast 스위치 행이 있다. 모델이 Fast를 지원하지 않으면 행이 없다.
  - Claude: 모델 행의 `supportsFastMode === true`. Codex: 모델의 `serviceTiers`에 Fast 티어가 있다(tasks P1에서 판별 규칙을 확정한다).
  - Codex 행은 그 티어의 설명을 스위치 아래 한 줄로 보인다. 설명이 없는 provider(Claude)는 이름만 보인다.
- 스위치를 켜면 Effort 트리거의 레벨 라벨 뒤에 Fast 아이콘이 붙는다. 트리거의 접근성 이름에 Fast 상태가 들어간다. 도킹된 composer가 좁아 라벨을 숨겨도(287px 이하) 아이콘과 tooltip이 상태를 알려 준다.
- 스위치를 바꿔도 메뉴는 닫히지 않는다. 레벨을 고르면 지금처럼 닫힌다.
- Effort 레벨이 없는 모델에는 이번에 스위치를 두지 않는다(관찰된 조합이 없다, 비목표).

### 전송과 기억

- 켠 상태로 보낸 턴은 Fast를 요청한다. Claude는 그 실행의 settings에 `fastMode: true`, Codex는 그 턴의 `turn/start`에 Fast 티어를 담는다. 끈 상태의 턴은 표준 속도로 돈다. Codex는 앞 턴의 티어가 다음 턴에 남을 수 있으므로 끈 턴도 표준 티어를 명시한다(tasks P1에서 값을 확정한다).
- Fast는 대화의 선택이다. effort처럼 대화 index에 저장되고, 그 대화의 이후 턴과 queue로 나가는 턴, 앱 재시작 뒤의 턴에도 적용된다. Fast를 지원하지 않는 모델로 바꾸면 그 턴부터 꺼진 것으로 보낸다.
- 사람이 바꾼 Fast는 provider별 Last used에 남는다. 새 대화의 composer는 그 provider의 Last used Fast로 시작하고, 고른 모델이 지원할 때만 켜진 것으로 보인다. Settings > Agents 'New conversations'에 고정 기본값이 있어도 Fast는 Last used를 따른다.
- 터미널 세션 이어 하기(legacy-external)와 ACP provider는 Fast를 받지 않는다. main은 그런 요청에 Fast가 있으면 `bad_request`로 거부한다.

### Fast로 돌지 않은 턴

- Fast를 켜고 보낸 턴이 Fast로 돌지 않았다고 provider가 알려 주면, 스레드의 그 턴에 한 줄 알림이 남는다. 알림은 Fast가 쓰이지 않았다는 사실과, provider가 이유를 주면 그 이유를 짧게 말한다. 스위치는 켜진 채로 둔다.
  - Claude: 결과 메시지의 `fast_mode_state`가 `on`이 아니면 알림을 남긴다. 이유는 `fast_mode_disabled_reason` 또는 `cooldown`에서 고른다.
  - Codex: 턴이 어떤 티어로 돌았는지 알려 주는 신호가 있으면 쓴다. 없으면 Codex는 알림을 남기지 않는다(tasks P1에서 확인).
- 알림은 다시 열어도, 앱을 재시작해도 그대로 보인다.

## 비목표

- Cursor·Copilot·Antigravity의 Fast 토글. 이들의 Fast 모델은 모델 피커에서 고른다.
- Settings > Agents 'New conversations'의 Fast 기본값 행과 preferences 저장.
- Effort 레벨이 없는 모델의 Fast 스위치.
- Fast가 쓰는 추가 사용량을 Agent usage나 composer에 따로 보이는 것.
- Codex `serviceTierForTurn`(한 턴만 Fast)과 Codex의 다른 티어 선택.
- 에이전트가 CLI로 Fast를 읽거나 바꾸는 것.
