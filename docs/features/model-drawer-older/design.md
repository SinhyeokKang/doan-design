# model-drawer-older — design

## 1. 분류 규칙 (순수 함수)

`app/src/main/conversation/models.ts`에 `markOlder(models, nameOf)`를 둔다. 각 provider 파서(`parseClaudeModels`·`parseCodexModels`·`parseAcpModels`)가 결과에 적용하고, `ModelOption`에 `older?: true`를 붙인다.

1. **이름**: 모델의 비교용 이름이다. Claude Code는 행의 `resolvedModel`(별칭 `opus` → `claude-opus-5-5`)이고, 없으면 `value`다. 나머지는 ID에서 끝의 `[...]`(Cursor 괄호 파라미터)를 뗀 값이다.
2. **계열과 버전**: 이름을 `-`로 나눈다. `\d+(\.\d+)*`에 맞는 조각은 버전 숫자열에 이어 붙이고(`5.6` → 5, 6), 나머지 조각은 계열 이름이 된다.
   - `claude-opus-4-8` → 계열 `claude-opus`, 버전 [4, 8]
   - `gpt-6.1-sol` → `gpt-sol` [6, 1], `gpt-5.6-terra` → `gpt-terra` [5, 6]
   - `gemini-3.8-flash-high` → `gemini-flash-high` [3, 8]
3. **판정**: 버전이 있는 모델끼리 계열마다 가장 큰 버전(숫자열 사전순)을 찾는다. 그보다 작은 버전이 이전이다. 동점은 모두 현재다.
4. **예외**: 버전이 없는 이름(`auto`, `default`, `kimi-k3`, `glm-5p3`)은 현재다. provider의 기본 모델 행도 현재다.
5. 목록 순서는 바꾸지 않는다. 메뉴는 현재 모델을 원래 순서대로 보여주고, 이전 모델도 원래 순서대로 접는다.

실측 결과(spec 표의 데이터):

- Claude: 현재 Default(Opus 5.5)·Fable 5.1·Sonnet 5.5·Haiku 5.5. 이전 8개.
- Codex: 현재 6.1-Sol·6-Astra·6.1 Terra·6-Luna. 이전 6-Sol·5.6×3.
- Cursor: 현재 25, 이전 22. 현재에 남는 의외의 행: `gpt-5.5`(계열 `gpt`가 `gpt-sol` 등과 다르다), `glm-5.2`(`glm-5p3`의 `5p3`은 버전으로 읽지 않는다), `gemini-3.1-pro`(계열에서 하나뿐). 해석하지 못한 이름은 현재에 남긴다는 안전 쪽 결과라 받아들인다.
- Antigravity: 3개 모두 현재(계열이 effort 접미사로 갈린다).

규칙은 provider 이름 규칙에 기대는 추정이다. 이름 규칙이 바뀌면 이전 모델이 현재에 섞일 수는 있지만, 모델이 메뉴에서 사라지지는 않는다.

## 2. 메뉴 (renderer)

- `homeComposer.ts` `modelPickerView`: `ProviderGroup`에 `older: ModelRow[]`을 더해 `rows`(현재)와 나눈다. 이전 모델이 선택된 상태면 `olderSelected`(그 행)를 둔다.
- `newConversationSettings.ts` `settingsModelMenu`: 같은 방식으로 `rows`와 `older`로 나눈다.
- `ComposerParts.tsx` `AgentPicker`, `SettingsAgents.tsx` Model 메뉴: 그룹 끝에 "Older models" 줄을 그린다. 시안 두 안:
  - **A. 같은 자리에서 펼치기**: 줄을 누르면(Enter/Space 포함) 그 아래 이전 모델 행이 펼쳐진다. 메뉴는 닫히지 않는다. 이전 모델이 선택된 상태로 열면 펼친 채로 연다. 펼침 상태는 메뉴가 닫히면 잊는다.
  - **B. 서브메뉴**: Radix `DropdownMenu.Sub`. hover·→ 키로 열린다. 이전 모델이 선택돼 있으면 줄의 보조 문구가 그 이름이다.
- 문구(clarify 프리셋 기준): 줄 라벨 "Older models", 끝에 개수(metadata ink). 접근성 이름 "Older Cursor models, 22"; 펼치기 안은 `aria-expanded`로 상태를 전한다.
- 메뉴 높이: 공유 메뉴는 이미 스크롤된다(DESIGN.md Home 'Menus'). 높이 상한은 바꾸지 않는다.

## 3. 시안 요청

- 경로·id: `.doan/canvases/model-drawer-older.html`, `model-drawer-older`, 폭 1760.
- frame:
  - `inline` — 안 A 같은 자리에서 펼치기. 타일: 모두 접힘, Cursor 이전 모델 펼침, 이전 모델(Codex GPT-6-Sol)을 고른 채 메뉴를 엶.
  - `submenu` — 안 B 서브메뉴. 타일: 모두 접힘, Cursor 서브메뉴 열림, 이전 모델(Codex GPT-6-Sol)을 고른 채 메뉴를 엶.
  - `settings` — Settings 'New conversations' Model 메뉴(Codex)에 안 A와 안 B.
- 목록은 §1 실측 결과를 쓴다. Copilot은 목록이 없어 그리지 않는다. 공유 메뉴는 앱에서 384px에서 잘리고 스크롤되지만, 시안은 비교를 위해 내용을 펼쳐 그린다.

## 영향 범위

- **app (main)**: `models.ts` 파서와 `ModelOption`. `ModelCatalog`·IPC는 필드 하나를 그대로 넘긴다. `parseClaudeModels`는 `resolvedModel`을 분류에만 쓰고 결과에 싣지 않는다.
- **app (renderer)**: `homeComposer.ts`, `newConversationSettings.ts`, `ComposerParts.tsx`, `SettingsAgents.tsx`, `styles.css`.
- **CLI·skill·형식**: 없음.

## 순수 함수 (`/tdd` 대상)

- `markOlder(models, nameOf)` — 계열·버전 분류, 동점, 버전 없는 이름, 기본 행 예외, 순서 유지. 실측 세 목록(Claude·Codex·Cursor)을 fixture로 고정한다.
- 파서 세 개가 `older`를 붙이는지(Claude는 `resolvedModel` 기준).
- `modelPickerView`·`settingsModelMenu`의 현재/이전 분리와 이전 모델 선택 상태.

## 형식 변경

없다. `ModelOption`은 IPC 응답 타입이고 JSON Schema(ARCHITECTURE §11) 대상이 아니다. 저장 형식은 그대로다.

## 컨벤션·결정 영향

- ARCHITECTURE §1 컨벤션·`doan check`: 없음.
- PRODUCT §5 item 1 'Agent and model picker'의 "Models are those the provider listed"는 유지된다(모두 나열하되 일부를 접는다). 마지막 task에서 접는 규칙을 그 항목과 item 0 'New conversations'에 쓴다.
- ARCHITECTURE §7 'Models'에 분류가 이름 규칙에 기대는 추정이라는 점을 쓴다.

## POSTMORTEM에서 가져온 함정

- 2026-11-06 "A menu's 'nothing chosen' value shared its string with a real model id": 접힌 줄과 서브메뉴는 RadioItem 값을 갖지 않게 한다. 이전 모델 행은 지금처럼 kind-tagged 값을 쓴다.
- 2026-11-06 picker-default-labels(1): Claude `default` 행은 기본 행이라 항상 현재다. 분류가 이 행을 접으면 Opus 5.5로 가는 길이 사라진다.
- 2026-11-06 "The Codex model list stayed the previous account's": 분류는 목록과 함께 계산되므로 계정 교체 뒤 다시 읽은 목록에서 다시 계산된다. 별도 캐시를 두지 않는다.
- Overview 포털 메뉴가 그려지지 않은 사례(POSTMORTEM 'Overview's model and effort pickers did not open'): 서브메뉴 안은 포털 안의 두 번째 포털이므로 Overview에서 실제로 그려지는지 `/runtime-test`로 확인한다.

## PoC 의존

없다. 목록 구조는 2026-11-06 실측으로 확인했다. Copilot 유료 계정 목록은 보지 못했다(규칙은 같다).

## 읽은 디자인 프리셋

`shape`, `clarify`.
