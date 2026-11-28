# 프리셋 드로어 구조 — design

이 feature는 develop에 이미 있는 화면의 새 모습을 요청하는 redesign feature다(AGENTS.md 'Workflow' `/design-draft` 예외). 기존 드래프트(`.doan/canvases/project-skill-drawer.html`, `provider-commands.html`)는 고치지 않고 새 드래프트 파일을 그린다. 이 feature의 브랜치가 머지될 때까지 새 드래프트가 이 화면의 기준이다.

## 영향 범위

- **앱(renderer)**: `app/src/renderer/ComposerParts.tsx`(Presets popover, `popover-search`, 탭 `group-tabs`), `app/src/renderer/styles.css`(`.preset-popover`의 폭 600/691/809와 탭 규칙), 탭 키보드 동작을 담은 순수 함수(구현 때 위치 확인).
- **형식, CLI, 스킬**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- 분류 목록과 순서(Suggested, 그룹 다섯 개, 있으면 Project, 있으면 Commands)를 만드는 view 함수: 지금 `view.tabs`를 만드는 곳을 새 구조에 맞춘다.
- 분류 이동의 키보드 규칙(고른 구조에 따라: 세로 목록이면 위·아래, 드롭다운이면 메뉴 규칙).
- 폭: 스킬·명령 유무와 무관한 고정 폭(CSS 테스트로 고정).

## 구조 후보 (드래프트에 그려 사용자가 고른다)

- **A. 왼쪽 분류 목록**: 드로어 안 왼쪽에 분류를 세로로 늘어놓고(아이콘 + 이름), 오른쪽에 행 목록. 분류가 늘어도 아래로만 길어진다. macOS 설정·Finder 사이드바와 같은 모양.
- **B. 분류 드롭다운**: 검색 옆에 분류 선택 버튼(지금 분류 이름 + chevron)을 두고 메뉴로 고른다. 폭이 가장 좁지만 분류를 한눈에 볼 수 없다.
- **C. 한 목록, 분류 머리**: 탭 없이 모든 행을 분류 머리와 함께 한 목록으로 스크롤한다. 위쪽에 아이콘만 있는 바로가기 줄을 둘 수 있다.
- 드래프트는 세 후보를 같은 데이터(스킬과 명령이 모두 있는 경우)로 나란히 그리고, 고른 뒤 그 후보의 모든 상태를 그린다.

## 검색 입력

- `popover-search`의 입력을 `data-ui-size="sm"`에서 기본 크기(MCP Server URL 입력과 같은 `doan-input`)로 바꾼다. 검색 아이콘 크기와 자리도 맞춘다(드래프트에서 측정값).

## postmortem에서 가져온 주의점

- 구현 때 `rg -n -i 'preset|popover|tab' docs/postmortem/`로 이 화면의 항목을 다시 확인한다(포털 pointer 규칙 2026-11-18, 목록 닫기 규칙).

## 형식, 규약, 결정에 미치는 영향

- PRODUCT 변경(승격 때): §5 item 1 'Design presets'의 "a searchable list with Suggested and five group tabs", 'Project skills'의 "adds a "Project" tab … and widens only while there are skills", 'Built-in commands'의 "adds a "Commands" tab"을 새 구조로 바꾼다.
- `docs/design/conversation.md` 'Popover'·'Tabs' 줄의 측정값을 새 값으로 바꾼다.

## 읽은 design preset

- 없음(드래프트 단계에서 `shape`, `layout`, `critique`를 읽는다).

## 드래프트 요청

`/design-draft preset-drawer-layout`로 새 드래프트 `.doan/canvases/preset-drawer-layout.html`(캔버스 id `preset-drawer-layout`)을 그린다.

- **프레임**:
  - `options`: 구조 후보 A, B, C를 같은 데이터로 나란히(지금 모습 809 px도 비교로)
  - `states`(후보를 고른 뒤): 스킬·명령 없음, 스킬만, 명령까지, 검색 중(분류를 넘는 결과), 결과 없음, 불러오는 중, 읽기 실패, 키보드 포커스
  - `search`: 새 검색 입력과 MCP Server URL 입력을 나란히(같은 크기 확인)
  - `composers`: Home, Overview, 캔버스 대화 패널, 프로토타입 창에서 연 모습(좁은 폭 포함)
- **정할 것**: 고정 폭 값, 분류 목록의 폭과 모양, 키보드 이동.
