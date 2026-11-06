# model-drawer-older — design

## 1. 분류 규칙 (순수 함수)

`app/src/main/conversation/models.ts`에 `olderIds(entries: {id, name, isDefault}[]): Set<string>`를 둔다. 각 provider 파서(`parseClaudeModels`·`parseCodexModels`·`parseAcpModels`)는 `unique`로 중복을 지운 뒤 이 함수를 부르고, 결과에 든 ID의 `ModelOption`에 `older: true`를 붙인다. 입력을 평평하게 받아서 Claude의 `resolvedModel`(결과에 싣지 않는 원시 필드)을 파서가 넘길 수 있고, 테스트도 쉽다.

1. **이름**: 비교용 이름이다. Claude Code는 행의 `resolvedModel`(별칭 `opus` → `claude-opus-5-5`)이고, 없으면 `value`다. 나머지는 ID다. 모든 이름에서 끝의 `[...]`(Cursor 괄호 파라미터, Claude의 `[1m]` 같은 꼬리)를 뗀다.
2. **계열과 버전**: 이름을 `-`로 나눈다. `\d+(\.\d+)*`에 맞는 조각은 버전 숫자열에 이어 붙이고(`5.6` → 5, 6), 나머지 조각은 계열 이름이 된다. 단, 8자리(YYYYMMDD)와 4자리(MMDD) 숫자 조각은 날짜로 보고 버전에도 계열에도 넣지 않는다. 날짜가 버전으로 읽히면 같은 세대의 날짜 없는 ID를 이겨 최신 행을 접기 때문이다.
   - `claude-opus-4-8` → 계열 `claude-opus`, 버전 [4, 8]
   - `claude-haiku-4-5-20251001` → `claude-haiku` [4, 5]
   - `gpt-6.1-sol` → `gpt-sol` [6, 1], `gpt-5.6-terra` → `gpt-terra` [5, 6]
   - `gemini-3.8-flash-high` → `gemini-flash-high` [3, 8]
   - `deepseek-v41-flash-1017` → `deepseek-v41-flash`, 버전 없음
3. **판정**: 버전이 있는 이름끼리 계열마다 가장 큰 버전을 찾는다. 비교는 조각별 숫자 비교이고, 앞 조각이 모두 같으면 짧은 쪽이 작다([6] < [6, 1], [5] < [5, 5]). 계열 최댓값보다 작은 버전이 이전이다. 동점은 모두 현재다.
4. **기본 행**: provider의 기본 행도 최댓값 계산에 들어간다(Claude `default`의 `resolvedModel` `claude-opus-5-5`가 `claude-opus` 계열의 최댓값이 된다. 빼면 짝 행이 이미 지워져서 `claude-opus-4-8`이 현재로 남는다). 기본 행 자신은 버전이 작아도 이전이 되지 않는다.
5. **예외**: 버전 숫자 조각이 없는 이름(`auto`, `default`, `kimi-k3`, `glm-5p3`)은 현재다.
6. 목록 순서는 바꾸지 않는다. 메뉴는 현재 모델을 원래 순서대로 보여주고, 이전 모델도 원래 순서대로 접는다.

실측 결과(spec 표의 데이터, `.scratch/model-drawer-older/family.py`로 계산):

- Claude: 현재 Default(Opus 5.5)·Fable 5.1·Sonnet 5.5·Haiku 5.5. 이전 8개.
- Codex: 현재 6.1-Sol·6-Astra·6.1 Terra·6-Luna. 이전 6-Sol·5.6×3.
- Cursor: 현재 25, 이전 22. 현재에 남는 의외의 행: `gpt-5.5`(계열 `gpt`가 `gpt-sol` 등과 다르다), `glm-5.2`(`glm-5p3`의 `5p3`은 버전으로 읽지 않는다), `gemini-3.1-pro`(계열에서 하나뿐). 해석하지 못한 이름은 현재에 남긴다는 안전 쪽 결과라 받아들인다.
- Antigravity: 3개 모두 현재(계열이 effort 접미사로 갈린다).

규칙은 provider 이름 규칙에 기대는 추정이다. 이름 규칙이 바뀌면 이전 모델이 현재에 섞일 수는 있지만, 모델이 메뉴에서 사라지지는 않는다.

## 2. 메뉴 (renderer)

- **행은 나누지 않는다.** `homeComposer.ts`의 renderer 쪽 `ModelOption` 사본(`homeComposer.ts:222`)에 `older?: true`를 더하고, `ModelRow`(model kind)와 `SettingsModelRow`에도 `older?: true`를 붙인다. `rows`는 지금처럼 모든 모델을 담는다. 컴포넌트는 그릴 때만 접힌 행을 거른다. 그래서 고르기와 체크 찾기(`ComposerParts.tsx` `onValueChange`의 `group.rows.some`, `group.rows.find(row => row.selected)`, `newConversationSettings.ts` `settingsModelPick`의 `menu.rows.find`)는 그대로 맞는다. 배열을 나누면 이 세 곳이 이전 모델을 찾지 못해 Default로 돌아간다.
- `olderSelected`는 `rows.some(r => r.older && r.selected)`로 계산한다.
- `ComposerParts.tsx` `AgentPicker`, `SettingsAgents.tsx` Model 메뉴: 그룹 끝에 "Older models" 줄을 그리고, 누르면 같은 메뉴 안 그 줄 아래에 이전 모델 행을 펼친다. 다시 누르면 접는다. 메뉴는 닫히지 않는다(Radix `Item`의 `onSelect`에서 `preventDefault`. radix-ui 1.8.1의 `MenuItem`은 이때 닫지 않는다. Fast 행 `ComposerParts.tsx:377`과 같은 방식). 서브메뉴 안은 2026-11-06 시안 비교 뒤 사용자가 버렸다(같은 자리에서 펼치기가 쉽고 편하다).
- **펼침 상태**: 메뉴 컴포넌트가 provider별로 가진다(펼친 provider와 사람이 토글한 provider). 메뉴가 닫히면 버린다. 메뉴를 열 때와 목록이 도착할 때, 사람이 아직 토글하지 않은 그룹 가운데 이전 모델이 선택된 그룹을 펼친다. 그룹마다 따로 펼치고 접는다.
- **줄**: RadioItem이 아니라 값이 없는 `Item`이다(`textValue="Older models"`, 개수가 typeahead에 섞이지 않게). 이전 모델 행은 지금 모델 행과 같은 RadioItem이다. 줄의 React key는 펼침 상태와 무관하게 고정한다. key가 바뀌면 포커스가 Content로 튄다.
- **키보드**: 줄에서 Enter·Space는 토글, →는 펼치기, ←는 접기. 이전 모델 행에서 ←는 포커스를 줄로 옮기고 접는다(macOS 아웃라인 disclosure의 관례. 서브메뉴가 아니므로 Radix의 →/← 동작과 겹치지 않는다). 토글 뒤 포커스는 줄에 남는다.
- **줄 자리 고정**(사용자 결정, uxui 리뷰 🔴): 에이전트·모델 메뉴는 `side="top"`이라 아래 끝이 trigger에 붙는다. 그래서 펼쳐서 메뉴가 길어지면 줄이 위로 밀려 포인터 아래에 이전 모델 행이 오고, 다시 누르면 그 모델이 골라지며 메뉴가 닫힌다. 토글 직전 줄의 viewport top을 재고, 레이아웃이 바뀐 뒤 메뉴의 `scrollTop`을 고쳐 줄을 같은 자리에 둔다. 펼친 메뉴 전체가 384px 상한 안에 들어가 스크롤할 범위가 없으면 이 보정이 불가능하다. 그때는 줄이 펼친 높이만큼 위로 움직인다. 이 경우를 `/runtime-test`에서 재고(예: Codex 하나만 연결해 4행을 펼침), 문제가 되면 지휘자가 사람에게 보고한다. Settings 메뉴는 `side="bottom"`이라 위쪽 끝이 고정되어 같은 문제가 없다.
- **스크롤**: Radix DropdownMenu는 열 때 체크된 행으로 스크롤하지 않는다. 열 때 체크된 행을 `scrollIntoView({block: "nearest"})`한다. 펼친 뒤에는 줄 자리 고정을 지키는 범위에서 첫 이전 모델 행이 보이게 한다.
- **문구**(clarify 프리셋 기준): 줄 라벨 "Older models", 끝에 개수(metadata ink), 체크 자리에 chevron(접힘 아래, 펼침 위). 접근 이름은 보이는 라벨이 앞에 오도록 "Older models (Cursor), 22"이다(WCAG 2.5.3, docked 이름의 `(<provider>)` 형식과 같다). `aria-expanded`가 상태를 전한다.
- 이전 모델이 선택된 그룹을 사람이 접으면 메뉴 안에 체크가 없다. 트리거가 모델 이름을 보이므로 그대로 둔다.
- **Settings 구분선**: 지금처럼 Default 행 뒤에만 둔다(`SettingsAgents.tsx`의 `index < menu.rows.length - 1` 조건은 Default 행에만 쓰인다). 줄과 이전 모델 행 앞뒤에는 구분선이 없다.
- 메뉴 높이 상한(384px, `ds/surfaces.css`)은 바꾸지 않는다.

## 3. 시안 요청

- 경로·id: `.doan/canvases/model-drawer-older.html`, `model-drawer-older`, 폭 1760.
- frame:
  - `inline` — 에이전트·모델 메뉴. 타일: 모두 접힘, Cursor 이전 모델 펼침, 이전 모델(Codex GPT-6-Sol)을 고른 채 메뉴를 엶.
  - `settings` — Settings 'New conversations' Model 메뉴(Codex). 타일: 접힘, 펼침, 이전 모델 고정.
- 사용자가 2026-11-06 두 안(같은 자리에서 펼치기, 서브메뉴)을 비교하고 펼치기를 골랐다. 서브메뉴 frame은 지웠다.
- 목록은 §1 실측 결과를 쓴다. Copilot은 목록이 없어 그리지 않는다. 공유 메뉴는 앱에서 384px에서 잘리고 스크롤되지만, 시안은 비교를 위해 내용을 펼쳐 그린다.

## 영향 범위

- **app (main)**: `models.ts`의 `olderIds`, 세 파서, `ModelOption`. `ModelCatalog`·IPC는 필드 하나를 그대로 넘긴다. `parseClaudeModels`는 `resolvedModel`을 분류에만 쓰고 결과에 싣지 않는다.
- **app (renderer)**: `homeComposer.ts`(renderer 쪽 `ModelOption` 사본, `ModelRow`, `modelPickerView`), `newConversationSettings.ts`, `ComposerParts.tsx`, `SettingsAgents.tsx`, `styles.css`.
- **CLI·skill·형식**: 없음.

## 순수 함수 (`/tdd` 대상)

- `olderIds(entries)` — 계열·버전 분류, 조각별 비교와 짧은 접두사, 동점, 날짜 조각, `[...]` 떼기, 버전 없는 이름, 기본 행이 최댓값에 들어가되 접히지 않음, 빈 목록, 모두 해석 불가. 실측 세 목록(Claude·Codex·Cursor, `.scratch/model-drawer-older/`의 원시 응답에서 개인 정보 없이 옮김)을 fixture로 고정한다.
- 파서 세 개가 `unique` 뒤에 `older`를 붙이는지(Claude는 `resolvedModel` 기준).
- `modelPickerView`·`settingsModelMenu`가 `rows`에 모든 모델을 남기고 `older`를 싣는지, 이전 모델을 고르면 그 ID가 고른 값이 되는지(Default로 돌아가지 않음).
- 펼침 상태 규칙(열 때·목록 도착 때 자동으로 펼칠 그룹, 사람의 토글 우선)과 줄 자리 고정에 쓰는 scroll 보정 계산은 순수 함수로 빼서 테스트한다.

## 형식 변경

없다. `ModelOption`은 IPC 응답 타입이고 JSON Schema(ARCHITECTURE §11) 대상이 아니다. 저장 형식은 그대로다.

## 컨벤션·결정 영향

- ARCHITECTURE §1 컨벤션·`doan check`: 없음.
- PRODUCT §5 item 1 'Agent and model picker'의 "Models are those the provider listed"는 유지된다(모두 나열하되 일부를 접는다). 마지막 task에서 접는 규칙을 그 항목과 item 0 'New conversations'에 쓴다.
- ARCHITECTURE §7 'Models'에 분류가 이름 규칙에 기대는 추정이라는 점을 쓴다.

## POSTMORTEM에서 가져온 함정

- 2026-11-06 "A menu's 'nothing chosen' value shared its string with a real model id": "Older models" 줄은 RadioItem 값을 갖지 않게 한다. 이전 모델 행은 지금처럼 kind-tagged 값을 쓴다.
- 2026-11-06 picker-default-labels(1): Claude `default` 행은 기본 행이라 항상 현재다. 분류가 이 행을 접으면 Opus 5.5로 가는 길이 사라진다.
- 2026-11-06 "The Codex model list stayed the previous account's": 분류는 목록과 함께 계산되므로 계정 교체 뒤 다시 읽은 목록에서 다시 계산된다. 별도 캐시를 두지 않는다.
- Overview 포털 메뉴가 그려지지 않은 사례(POSTMORTEM 'Overview's model and effort pickers did not open'): 펼친 메뉴가 Overview에서도 그려지는지 `/runtime-test`에서 스크린샷으로 판정한다(그 항목의 Prevention: `elementFromPoint`를 근거로 삼지 않는다).

## PoC 의존

없다. 목록 구조는 2026-11-06 실측으로 확인했다. Copilot 유료 계정 목록은 보지 못했다(규칙은 같다).

## 읽은 디자인 프리셋

`shape`, `clarify`.
