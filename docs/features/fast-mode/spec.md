# fast-mode — spec

사람의 요청: "codex fast 모드 gui로 지원 가능?", 이어서 "묶어서 가야겠군", "toggle 개념으로 가자"(2026-11-06).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7에 걸리지 않는다. 앱이 이미 시작하는 대화(In scope 6)의 실행 옵션 하나를 더한다. 계정·서버·git·자동 깨우기와 관계없다.
- PRODUCT §5 item 1 'Agent and model picker', item 0 'New conversations'(Last used), item 2 'Handoff'는 모델·effort·permission만 정한다. Fast는 아직 정하지 않은 항목이라, 마지막 작업에서 PRODUCT에 현재 규칙으로 올린다(tasks Z1).

## 사용자

- **사람(앱 사용자)**: Home, project Overview, 캔버스 conversation panel의 composer에서 Claude·Codex 대화를 Fast로 돌릴지 켜고 끈다. Claude가 켠 턴을 Fast로 돌리지 않았다고 알려 주면 스레드에서 그 사실을 보고, 이유가 계속되는 경우에는 Fast가 꺼진 것을 본다.
- **에이전트(CLI·skill)**: 바뀌는 것이 없다. Fast는 provider의 실행 옵션이고 turn prompt에 들어가지 않는다.

## 문제(지금 관찰된 사실)

1. **앱에서 Fast를 켤 수 없다.** composer 도구 행은 Attach · Presets · 에이전트와 모델 · Effort · Permission · Send이고(PRODUCT §5 item 1 'Composer'), Effort 메뉴는 모델의 레벨만 고른다(`app/src/renderer/ComposerParts.tsx:342` `EffortPicker`). 앱 코드와 문서 어디에도 service tier나 fast mode가 없다(`rg -n "serviceTier|fastMode" app/src docs`는 이 feature 문서 밖에서 결과가 없다).
2. **두 provider는 모델마다 Fast를 제공한다(2026-11-06 확인).**
   - Codex 0.166.0: app-server `model/list`가 모델마다 `serviceTiers`를 돌려준다. 이 계정의 공개 모델 8개 모두 `{id: "priority", name: "Fast"}` 하나를 가졌고, 설명은 모델마다 다르다("2x speed, increased usage", "1.5x speed", "1.5x speed, increased usage"). `defaultServiceTier`는 모두 null이었다. `turn/start`의 `serviceTierForTurn`은 그 턴에만 쓰이고 thread의 티어를 바꾸지 않으며, 표준 속도는 `"default"`다(`codex app-server generate-json-schema`: `v2/ModelListResponse.json`, `v2/TurnStartParams.json`). 턴이 실제로 어떤 티어로 돌았는지 알려 주는 알림이나 응답 필드는 스키마에 없다(`ServerNotification.json`에서 티어 필드는 `thread/settings/updated.serviceTier` 하나뿐이다).
   - Claude Code 2.1.318 / Agent SDK 0.3.312: `supportedModels()`의 행마다 `supportsFastMode`가 있다. 이 계정에서는 `default`, `opus`, `claude-opus-5`, `claude-opus-4-8`이 true였고 나머지는 값이 없었다. SDK `Options.settings`(flag 계층)의 `fastMode: true`로 켜고, 결과 메시지가 `fast_mode_state`(`off`·`cooldown`·`on`)와 `fast_mode_disabled_reason`을 보낸다(`app/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` `FastModeState`, `FastModeDisabledReason`, `SDKResultSuccess`). SDK로 실행하면 flag 계층에서 켜지 않는 한 `sdk_opt_in_required`로 꺼진다(CLI 번들의 판정 코드). CLI 자체 문구는 "same model, faster output"과 "Fast mode requires usage credits"다(CLI 번들 문자열).
3. **나머지 provider는 토글로 묶을 수 없다.** Cursor는 ACP에서 바뀐 bracket 값을 거부하고(ARCHITECTURE §7 'Models'), Copilot 1.0.105는 Fast가 `claude-opus-4.8-fast` 같은 별도 모델 ID다(`copilot help config`). 두 provider는 목록에 Fast 모델이 있으면 지금처럼 모델 피커에서 고른다. Antigravity는 Fast가 있는지 확인하지 못했다.

## 완료 조건

### Fast 스위치

- Claude 또는 Codex를 고른 composer에서 Effort 메뉴가 보이고 그 모델이 Fast를 지원하면, 레벨 목록 아래에 구분선과 Fast 스위치 행이 있다. 그 밖에는 행이 없다.
  - Claude: 모델 행의 `supportsFastMode === true`. Codex: 모델의 `serviceTiers`에 Fast 티어가 있다(판별 규칙은 tasks P1에서 확정한다).
  - 스위치 아래에 설명 한 줄을 보인다. Codex는 그 티어의 `description`, Claude는 Claude Code 문구를 옮긴 `Same model, faster output. Requires usage credits.`(design §6). Fast 행이 있으면 메뉴 폭은 280px이고, 관찰한 설명은 두 줄 안에서 끝난다. 설명은 말줄임하지 않는다. 행의 Fast 아이콘은 스위치가 켜졌을 때만 보이고, 꺼져도 이름 위치는 그대로다.
- 스위치는 체크 상태를 갖는 메뉴 항목이다. Enter·Space·클릭으로 바꾸고, 바꿔도 메뉴는 열린 채이며 focus는 그 행에 남는다. 레벨을 고르면 지금처럼 닫힌다.
- 스위치를 켜면 Effort 트리거의 레벨 라벨 뒤에 accent 색의 Fast 아이콘이 붙는다. 아이콘은 폭이 좁아져도 줄어들지 않는다. 트리거의 접근성 이름과 tooltip은 design §6의 문구(`Effort: High, Fast on` / `Fast off`)다. Home(sm)과 도킹된 composer(xs) 모두 tooltip을 보인다. 도킹된 composer가 287px 이하라 라벨을 숨겨도 아이콘과 tooltip이 상태를 알려 준다.
- 스위치가 보이지 않는 상태에서는 Fast를 보내지 않는다. 모델 목록을 아직 읽지 않았거나 읽지 못한 경우, Effort 레벨이 없는 모델, Fast를 지원하지 않는 모델, ACP provider가 여기에 해당한다. 저장된 Fast가 켜져 있어도 마찬가지다.
- Settings > Agents 'New conversations'의 Effort 행에는 Fast가 보이지 않는다.
- 터미널 세션(legacy-external)의 고정 트리거에는 Fast 아이콘이 붙지 않는다. 새 대화로 바꾸면 그 provider의 Last used Fast가 다시 보인다.

### 전송과 기억

- 스위치를 켠 상태에서 보낸 턴은 Fast를 요청한다. Claude는 그 실행의 settings에 `fastMode: true`를 넣고, Codex는 그 턴의 `turn/start`에 Fast 티어를 담는다. 끈 상태의 턴은 표준 속도로 돈다. Codex는 doan 소유 대화의 모든 턴에 그 턴의 티어(Fast 또는 `"default"`)를 명시한다. 카탈로그 기본값이 Fast인 모델도 끈 턴은 표준이다.
- Fast는 대화의 선택이다. effort처럼 대화 index에 저장되고, 그 대화의 이후 턴과 앱 재시작 뒤의 턴에 적용된다. 기존 대화의 composer는 저장된 Fast를 보인다. 실행 중에 바꾼 Fast는 다음 턴부터 적용된다.
- queue의 메시지는 나갈 때 저장된 Fast로 나간다. Send now로 보낸 메시지는 실행 중인 턴의 Fast를 따른다.
- Fast를 지원하지 않는 모델로 바꾸면 그 턴부터 Fast 없이 나간다. 대화의 Fast는 남아 있어서, 지원하는 모델로 돌아오면 다시 켜진 채로 보이고 다시 요청된다.
- 핸드오프로 시작한 새 대화는 원래 대화의 Fast를 물려받는다. Last used는 바꾸지 않는다(PRODUCT §5 item 2 'Handoff'와 같다).
- Last used에는 provider별 Fast가 하나 있다. 스위치를 바꿀 때와 Fast가 자동으로 꺼질 때만 기록되고, 보내기만으로는 기록되지 않는다. 모델을 바꿔도 남는다. 새 대화의 composer는 그 provider의 Last used Fast로 시작하고, 고른 모델이 지원할 때만 켜진 것으로 보인다. Settings > Agents 'New conversations'에 고정 기본값이 있어도 Fast는 Last used를 따른다.
- 터미널 세션 이어 하기(resume, legacy-external)와 ACP provider는 Fast를 받지 않는다. queue와 Send now 요청도 Fast를 담지 않는다. main은 이런 요청에 Fast가 있으면 `bad_request`로 거부한다.

### Fast로 돌지 않은 턴(Claude)

- Fast를 요청한 Claude 턴이 끝났거나(done) 실패했는데(failed) 결과의 `fast_mode_state`가 `on`이 아니면, 스레드의 그 턴에 한 줄 알림이 남는다. 결과에 값이 없으면(오래된 CLI) 알림을 남기지 않는다. Stop, 앱 종료, crash로 끝난 턴에도 남기지 않는다.
- 이유가 계속되는 경우(플랜에 없음, 추가 사용량 꺼짐, 모델 미지원, 조직이 막음)에는 Fast가 자동으로 꺼진다. 그 대화의 Fast와 그 provider의 Last used Fast가 꺼지고, 알림은 `Fast was turned off.` 뒤에 이유를 말한다.
- 그 밖의 경우(rate limit 뒤 잠시 멈춤, 이유 없음)는 스위치를 켜 둔 채 `Fast wasn't used for this turn.`를, 이유가 있으면 이유와 함께 보인다.
- 알림은 다시 열어도, 앱을 재시작해도 그대로 보인다. 재시작 뒤 기록을 다시 읽는다고 Fast가 또 꺼지지는 않는다.
- Codex는 실제로 쓰인 티어를 알려 주지 않으므로 알림을 남기지 않는다.

## 비목표

- Cursor·Copilot·Antigravity의 Fast 토글. 이들의 Fast 모델은 모델 피커에서 고른다.
- Settings > Agents 'New conversations'의 Fast 기본값 행과 preferences 저장.
- Effort 레벨이 없는 모델의 Fast 스위치.
- Fast가 쓰는 추가 사용량을 Agent usage나 composer에 따로 보이는 것. 턴마다 Fast 요청 여부를 기록하는 것.
- 한 턴만 Fast로 보내는 제품 기능과 Codex의 다른 티어 선택.
- 에이전트가 CLI로 Fast를 읽거나 바꾸는 것.
