# model-drawer-older — spec

모델 서랍(에이전트·모델 선택 메뉴)에서 provider마다 최신 모델만 기본으로 보여주고, 이전 세대 모델은 접어 둔다.

## 사용자

- **사람**: Home·Project Overview·canvas 패널·docked composer의 에이전트·모델 선택 메뉴와 Settings > Agents 'New conversations'의 Model 메뉴를 쓰는 사람. 최신 모델을 바로 고르고, 이전 모델은 한 번 더 열어서 고른다. terminal session의 고정 trigger("Terminal session")는 메뉴가 없으므로 바뀌지 않는다.
- **에이전트**: 영향 없다. CLI·skill·전송하는 모델 ID는 그대로다.

## 문제 (2026-11-06 실측, 실제 HOME 계정)

PRODUCT §5 item 1 'Agent and model picker'는 provider가 나열한 모델을 전부 보여준다. 에이전트·모델 선택 메뉴는 연결된 provider 그룹을 한 메뉴에 이어 붙이므로, 이전 세대가 섞이면 메뉴가 길어진다.

| provider | 지금 메뉴 행 | 이전 세대 |
|---|---|---|
| Claude Code 2.1.318 (`supportedModels`, 13행 → 짝 행 제거 후 12) | 12 | 전체 ID 8개(`claude-opus-4-8`, `claude-sonnet-5` 등). 별칭 `opus`·`fable`·`sonnet`·`haiku`가 각 계열의 최신이다 |
| Codex 0.166.0 (`model/list`) | 8 | `gpt-6-sol`, `gpt-5.6-sol/terra/luna`. 숨김·세대 필드는 없고 설명문에만 "Previous/Older generation"이 있다 |
| Cursor (ACP `session/new`) | 47 | Opus 6개 세대, Sonnet 5개, Gemini Flash 6개 등. 순서는 최신순이 아니다(`claude-haiku-5-5`가 33번째) |
| Antigravity 1.3.0 | 3 | 없음(같은 모델의 effort 3단계) |
| GitHub Copilot (무료 계정) | 0 | 목록이 오지 않아 확인하지 못했다 |

원시 응답과 측정 script는 main checkout의 `.scratch/model-drawer-older/`에 있다(`claude-models.out`, `codex-models.out`, `cursor-acp.out`, `family.py`). design §1의 규칙을 이 데이터에 적용하면 Claude 12→4, Codex 8→4, Cursor 47→25, Antigravity 3→3이다.

## 완료 조건

1. provider 목록의 각 모델은 **현재** 아니면 **이전**이다. 규칙은 design.md §1이다. 버전 숫자 조각이 없는 이름은 항상 현재다.
2. provider의 기본 모델 행(Claude Code `default`, Codex `isDefault`, ACP current model)은 이전으로 분류되지 않는다.
3. 에이전트·모델 선택 메뉴의 각 provider 그룹은 현재 모델만 보이고, 이전 모델은 그룹 끝의 "Older models" 줄에 접힌다. 이전 모델이 없는 그룹에는 그 줄이 없다. 줄을 누르면 같은 메뉴 안에 이전 모델이 펼쳐지고, 다시 누르면 접힌다(사용자 결정: 서브메뉴 대신 같은 자리에서 펼치기). 위로 열린 메뉴(composer의 에이전트·모델 메뉴)에서는 이전 모델이 줄 바로 위에 펼쳐지고 줄은 그룹 끝에 남는다. 아래로 열린 메뉴(Settings Model 메뉴)에서는 줄 아래에 펼쳐진다(사용자 결정: 실측에서 위로 열린 메뉴가 펼친 만큼 줄을 위로 밀어, 같은 자리를 다시 누르면 이전 모델이 골라졌다). 메뉴는 닫히지 않는다. 그룹마다 따로 펼치고 접으며, 메뉴가 닫히면 펼침 상태를 잊는다.
4. 펼치거나 접어도 "Older models" 줄은 화면에서 같은 자리에 있다(사용자 결정, design §2 '줄 자리 고정'). 펼친 뒤 첫 이전 모델 행이 보이도록 메뉴가 스크롤된다.
5. 이전 모델을 골라 두었으면 트리거는 그 모델 이름을 그대로 보여주고, 메뉴는 그 그룹을 펼친 채 열리며 체크된 행이 보이도록 스크롤된다. 메뉴를 연 뒤 목록이 도착하면, 사람이 아직 펼치거나 접지 않은 그룹에 한해 같은 규칙으로 펼친다.
6. Settings > Agents 'New conversations'의 Model 메뉴에도 같은 분류와 펼치기를 적용한다. Default 행은 맨 위에 그대로 있고 접히지 않는다.
7. 전송하는 모델 ID, 저장 형식, Last used, 기본값 규칙(PRODUCT §5 item 0 'New conversations')은 바뀌지 않는다. 이전 모델도 지금처럼 고르고 보낼 수 있다.
8. 키보드: 줄에서 Enter·Space·→는 펼치고, Enter·Space·←는 접는다. 이전 모델 행에서 ←를 누르면 포커스가 줄로 가고 접힌다. 토글 뒤 포커스는 줄에 남는다. 펼친 이전 모델 행은 보이는 순서대로 화살표로 닿는다(위로 열린 메뉴는 ↑, 아래로 열린 메뉴는 ↓로 줄에 가장 가까운 이전 모델 행). 줄의 접근 이름은 "Older models (Cursor), 22"이고 `aria-expanded`가 펼침 상태를 전한다.

### 줄의 상태

| 상태 | 보이는 것 |
|---|---|
| 목록을 읽는 중·읽지 못함·provider를 실행할 수 없음 | 지금처럼 Default 행이나 상태 문구. 줄 없음 |
| 이전 모델이 없는 목록(Antigravity, 목록 0행인 Copilot) | 줄 없음 |
| 접힘 | 현재 모델, 그 아래 "Older models"와 개수, 아래쪽 chevron |
| 펼침 | 이전 모델(위로 열린 메뉴는 줄 위, 아래로 열린 메뉴는 줄 아래), 위쪽 chevron |
| 이전 모델을 고름 | 그 그룹이 펼친 채 열리고 체크된 행이 보임. 사람이 그 그룹을 접으면 메뉴 안에 체크가 없지만 트리거가 모델 이름을 보인다 |
| 고른 모델이 목록에 없음 | 지금처럼 트리거 "Model", 어느 그룹도 저절로 펼치지 않음 |

규칙상 한 provider의 모델이 모두 이전이 되는 일은 없다. 계열마다 최대 버전이 현재로 남고 기본 행도 현재이기 때문이다.

## 하지 않는 것

- provider 그룹 자체를 접거나 고른 provider만 펼치기, Cursor 모델을 회사별로 묶기. Cursor는 규칙 적용 뒤에도 25행이 남지만 이번에는 그대로 둔다(사용자 결정). 더 줄이는 일은 승격 task에서 BACKLOG에 남긴다.
- 모델 검색·즐겨찾기·사용자가 직접 숨기기. 접힌 행은 그려지지 않으므로 typeahead로 찾을 수 없다. 이것은 받아들인다.
- Codex 설명문("Previous generation")이나 provider별 하드코딩 목록으로 분류하기. 문구·목록은 provider가 바꾸면 틀린다.
- Effort 메뉴·Permission 메뉴 변경. Cursor 괄호 파라미터(effort·fast·context) 노출.
- Copilot 유료 계정 목록 확인(무료 계정으로는 목록이 오지 않는다). 규칙은 Copilot에도 같게 적용된다.
