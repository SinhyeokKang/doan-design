# 프리셋 드로어 구조 — design

이 feature는 develop에 이미 있는 화면의 새 모습을 요청하는 redesign feature다(AGENTS.md 'Workflow' `/design-draft` 예외). 기존 드래프트(`.doan/canvases/project-skill-drawer.html`, `provider-commands.html`)는 고치지 않고 새 드래프트 파일을 그린다. 이 feature의 브랜치가 머지될 때까지 새 드래프트가 이 화면의 기준이다.

## 영향 범위

- **앱(renderer)**: `app/src/renderer/ComposerParts.tsx`(Presets popover, `popover-search`, 탭 `group-tabs`), `app/src/renderer/styles.css`(`.preset-popover`의 폭 600/691/809와 탭 규칙), 탭 키보드 동작을 담은 순수 함수(구현 때 위치 확인).
- **형식, CLI, 스킬**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- 탭 view 함수: Suggested, Doan presets, 있으면 Project, 있으면 Commands(지금 `view.tabs`를 만드는 곳).
- Doan presets 목록 view 함수: 그룹별 섹션(머리와 행), catalog 순서. 검색 결과를 섹션으로 묶는 함수.
- 키보드: 행 사이 위·아래 이동이 섹션 머리를 건너뛴다.
- 폭: 스킬·명령 유무와 무관한 고정 폭(CSS 테스트로 고정).

## 구조 (사용자 결정)

- 탭: Suggested, Doan presets, Project(스킬이 있을 때), Commands(명령이 있을 때). 최대 네 개라 폭을 고정할 수 있다.
- Doan presets 탭: 그룹 다섯 개를 catalog 순서대로 섹션 머리(그룹 아이콘 + 이름)와 함께 한 목록으로 늘어놓는다. 섹션 머리는 sticky이고 접기는 없다. 섹션 머리는 목록 행이 아니라 listbox 안의 group 이름이다(`role="group"`과 `aria-labelledby`, 키보드 이동은 행만 지난다).
- 검색: 탭을 넘어 찾고, 결과를 같은 섹션 머리(그룹, Project, Commands)로 묶는다.

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
  - `structure`: 새 구조(탭 네 개, Doan presets 탭의 섹션 목록과 sticky 머리)와 지금 모습 809 px 비교
  - `states`: 스킬·명령 없음, 스킬만, 명령까지, 검색 중(분류를 넘는 결과), 결과 없음, 불러오는 중, 읽기 실패, 키보드 포커스
  - `search`: 새 검색 입력과 MCP Server URL 입력을 나란히(같은 크기 확인)
  - `composers`: Home, Overview, 캔버스 대화 패널, 프로토타입 창에서 연 모습(좁은 폭 포함)
- **정할 것**: 고정 폭 값, 섹션 머리의 모양과 높이, Doan presets 탭의 아이콘.
