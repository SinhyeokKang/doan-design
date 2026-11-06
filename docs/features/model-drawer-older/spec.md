# model-drawer-older — spec

모델 서랍(에이전트·모델 선택 메뉴)에서 provider마다 최신 모델만 기본으로 보여주고, 이전 세대 모델은 접어 둔다.

## 사용자

- **사람**: Home·Project Overview·canvas 패널·docked composer의 에이전트·모델 선택 메뉴와 Settings > Agents 'New conversations'의 Model 메뉴를 쓰는 사람. 최신 모델을 바로 고르고, 이전 모델은 한 번 더 열어서 고른다.
- **에이전트**: 영향 없다. CLI·skill·전송하는 모델 ID는 그대로다.

## 문제 (2026-11-06 실측, 실제 HOME 계정)

PRODUCT §5 item 1 'Agent and model picker'는 provider가 나열한 모델을 전부 보여준다. 에이전트·모델 선택 메뉴는 연결된 provider 그룹을 한 메뉴에 이어 붙이므로, 이전 세대가 섞이면 메뉴가 길어진다.

| provider | 지금 메뉴 행 | 이전 세대 |
|---|---|---|
| Claude Code (`supportedModels`, 13행 → 짝 행 제거 후 12) | 12 | 전체 ID 8개(`claude-opus-4-8`, `claude-sonnet-5` 등). 별칭 `opus`·`fable`·`sonnet`·`haiku`가 각 계열의 최신이다 |
| Codex 0.166.0 (`model/list`) | 8 | `gpt-6-sol`, `gpt-5.6-sol/terra/luna`. 숨김·세대 필드는 없고 설명문에만 "Previous/Older generation"이 있다 |
| Cursor (ACP `session/new`) | 47 | Opus 6개 세대, Sonnet 5개, Gemini Flash 6개 등. 순서는 최신순이 아니다(`claude-haiku-5-5`가 33번째) |
| Antigravity 1.3.0 | 3 | 없음(같은 모델의 effort 3단계) |
| GitHub Copilot (무료 계정) | 0 | 목록이 오지 않아 확인하지 못했다 |

원시 데이터는 세션 스크래치(`codex-models.out`, `cursor-acp.out`)에 있다. 아래 규칙을 이 데이터에 적용하면 Claude 12→4, Codex 8→4, Cursor 47→25, Antigravity 3→3이다.

## 완료 조건

1. provider 목록의 각 모델은 **현재** 아니면 **이전**이다. 규칙은 design.md §1이다. 해석할 수 없는 ID는 항상 현재다.
2. provider의 기본 모델 행(Claude Code `default`, Codex `isDefault`, ACP current model)은 이전으로 분류되지 않는다.
3. 에이전트·모델 선택 메뉴의 각 provider 그룹은 현재 모델만 펼쳐 보이고, 이전 모델은 그룹 끝의 "Older models" 한 줄 아래에 접힌다. 이전 모델이 없는 그룹에는 그 줄이 없다. 접는 방식(같은 자리에서 펼치기 또는 서브메뉴)은 `/design-draft` 시안 비교 뒤 사용자가 정한다.
4. 이전 모델을 골라 두었으면 트리거는 그 모델 이름을 그대로 보여주고, 메뉴를 열면 그 모델이 선택된 상태로 보인다(펼치기 안: 펼친 채로 연다. 서브메뉴 안: "Older models" 줄에 고른 모델 이름을 보조 문구로 보인다).
5. Settings > Agents 'New conversations'의 Model 메뉴에도 같은 분류와 접는 방식을 적용한다.
6. 전송하는 모델 ID, 저장 형식, Last used, 기본값 규칙(PRODUCT §5 item 0 'New conversations')은 바뀌지 않는다. 이전 모델도 지금처럼 고르고 보낼 수 있다.
7. 키보드만으로 이전 모델을 열고 고를 수 있고, 접힌 줄의 접근성 이름이 접힘·펼침 상태와 개수를 전한다.

## 하지 않는 것

- provider 그룹 자체를 접거나 고른 provider만 펼치기, Cursor 모델을 회사별로 묶기. Cursor는 규칙 적용 뒤에도 25행이 남지만 이번에는 그대로 둔다(사용자 결정). 더 줄이는 일은 승격 task에서 BACKLOG에 남긴다.
- 모델 검색·즐겨찾기·사용자가 직접 숨기기.
- Codex 설명문("Previous generation")이나 provider별 하드코딩 목록으로 분류하기. 문구·목록은 provider가 바꾸면 틀린다.
- Effort 메뉴·Permission 메뉴 변경. Cursor 괄호 파라미터(effort·fast·context) 노출.
- Copilot 유료 계정 목록 확인(무료 계정으로는 목록이 오지 않는다). 규칙은 Copilot에도 같게 적용된다.
