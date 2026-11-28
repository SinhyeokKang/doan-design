# 프리셋 드로어 구조 — design

이 feature는 develop에 이미 있는 화면의 새 모습을 요청하는 redesign feature다(AGENTS.md 'Workflow' `/design-draft` 예외). 기존 드래프트(`.doan/canvases/project-skill-drawer.html`, `provider-commands.html`)는 고치지 않고 새 드래프트 파일을 그린다. 이 feature의 브랜치가 머지될 때까지 새 드래프트가 이 화면의 기준이다.

## 영향 범위

- **앱(renderer)**:
  - `app/src/renderer/homeComposer.ts` `presetListView`: 탭과 섹션을 만든다. 탭을 Suggested·Doan presets·Project·Commands로, Doan presets 탭의 섹션을 그룹별로 바꾼다. 검색 경로(`if (query)`)와 `/` 목록(`opts.slash`)은 그대로 둔다.
  - `app/src/renderer/ComposerParts.tsx`: Presets popover, 탭 `group-tabs`(`tabKey`), 행 목록. `SearchField`는 `/` 목록(`SlashPresets`)과 공유하므로, 크기는 드로어에서만 바뀌게 prop이나 분기를 둔다. 섹션 머리는 `role="group"` 요소 안에 두어 sticky가 자기 섹션 범위에서 밀려나게 한다. listbox 이름은 Doan presets 탭에서 "Doan presets"(지금은 첫 섹션 이름 "Start"로 읽힌다), tablist 이름("Preset groups")은 새 문구로 바꾼다(문구는 `clarify` preset으로 정한다). 탭을 바꾸면 `popover-list`의 scrollTop을 0으로 한다.
  - `app/src/renderer/styles.css`: `.preset-popover:not(.slash-popover)` 500 px 고정, 탭은 폭을 채운다(`flex: 1 1 auto`)(691/809 규칙과 `has-skills`·`has-commands` 폭 제거), 탭 규칙을 `.preset-popover` 아래로 좁힌다(`.group-tabs.shell-modes`는 Quick Open과 공유), 좁을 때 탭 라벨 말줄임, sticky 머리와 `.popover-list`의 `scroll-padding-block-start`(`.ap[data-cramped]`의 같은 패턴).
- **형식, CLI, 스킬**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `presetListView`의 탭과 섹션: 있으면 Suggested, Doan presets, 있으면 Project, 있으면 Commands. 탭이 하나면 탭 없음. Doan presets 섹션은 catalog 그룹 순서, 모르는 그룹은 뒤, 그룹 없는 옛 CLI는 머리 없는 한 섹션. notice(loading, error, olderCli)와 스킬이 함께 있을 때의 구조. 검색은 지금처럼 머리 없는 점수순 한 섹션.
- 키보드는 지금 동작 그대로라 새 규칙이 없다(행 id가 섹션을 넘어 이어지고 머리는 포커스를 받지 않는다). red 대상이 아니라 회귀 테스트로 유지한다.
- 폭: 스킬·명령 유무와 무관한 500 px, 탭이 폭을 채움(CSS 테스트로 고정).

## 구조 (사용자 결정)

- 탭: Suggested(항목이 있을 때), Doan presets, Project(스킬이 있을 때), Commands(명령이 있을 때). 최대 네 개라 500 px로 고정할 수 있다(사용자 결정, 탭이 폭을 채운다). 하나뿐이면 탭 줄이 없다.
- Doan presets 탭: 그룹 다섯 개를 catalog 순서대로 섹션 머리(그룹 아이콘 + 이름)와 함께 한 목록으로 늘어놓는다. 섹션 머리는 sticky이고 접기는 없다. 섹션 머리는 목록 행이 아니라 listbox 안의 group 이름이다(`role="group"`과 `aria-labelledby`, 키보드 이동은 행만 지난다).
- 검색: 지금과 같다(탭을 넘어 찾는 점수순 한 목록, 탭 줄 숨김).

## 검색 입력

- 드로어의 `popover-search` 입력만 `data-ui-size="sm"`에서 기본 크기(MCP Server URL 입력과 Quick Open 검색창과 같은 `doan-input`)로 바꾼다. 검색 아이콘 크기와 자리, 아이콘 자리 왼쪽 여백(`styles.css`의 `.popover-search` padding)도 맞춘다(드래프트에서 측정값). `/` 목록의 검색창은 그대로다.

## postmortem에서 가져온 주의점

- 구현 때 `rg -n -i 'preset|popover|tab' docs/postmortem/`로 이 화면의 항목을 다시 확인한다(포털 pointer 규칙 2026-11-18, 목록 닫기 규칙).

## 형식, 규약, 결정에 미치는 영향

- PRODUCT 변경(승격 때): §5 item 1 'Design presets'의 "a searchable list with Suggested and five group tabs", 'Project skills'의 "adds a "Project" tab … and widens only while there are skills", 'Built-in commands'의 "adds a "Commands" tab"을 새 구조로 바꾼다.
- PRODUCT: 'Project skills'의 "the preset group tab icons are accent-coloured and the Project tab icon grey"도 새 구조로 고친다.
- `docs/design/conversation.md`: 'Project skill drawer'의 Popover·Tabs 줄, 'Provider commands'의 'Commands tab'·'Popover with commands'(809) 줄을 새 값으로 바꾼다.
- `docs/DESIGN.md`의 accent 자리 목록("preset group tab icons (the Project tab staying neutral)").
- README의 Presets 이미지: `.doan/canvases/readme-features.html`의 해당 프레임을 고쳐 `docs/assets/readme/`로 다시 내보낸다(AGENTS.md 'Documents' README 줄).

## 읽은 design preset

- 없음(드래프트 단계에서 `shape`, `layout`, `critique`를 읽는다).

## 드래프트 요청

`/design-draft preset-drawer-layout`로 새 드래프트 `.doan/canvases/preset-drawer-layout.html`(캔버스 id `preset-drawer-layout`)을 그린다.

- **프레임**:
  - `structure`: 새 구조(탭 네 개, Doan presets 탭의 섹션 목록과 sticky 머리)와 지금 모습 809 px 비교
  - `states`: Suggested 없음(탭 줄 없음), 스킬·명령 없음, 스킬만, 명령까지, 모르는 그룹, 그룹 없는 옛 CLI, 검색 중(점수순 한 목록, 탭 줄 숨김), 결과 없음, 불러오는 중, 읽기 실패, notice와 스킬이 함께, 키보드 포커스가 sticky 머리 바로 아래 행
  - `search`: 새 검색 입력과 MCP Server URL 입력을 나란히(같은 크기 확인)
  - `composers`: Home, Overview, 캔버스 대화 패널, 프로토타입 창에서 연 모습(좁은 창에서 탭 라벨 말줄임)
- **정할 것**: 섹션 머리의 모양·높이·바탕(90% 흰 glass 위에서 아래 행이 비치지 않게), 목록 최대 높이(지금 276 px로는 머리 다섯 개와 행이 4개 남짓만 보인다), Doan presets 탭의 아이콘, tablist와 listbox 이름 문구.

## 드래프트에서 정한 것 (사용자)

- 폭 500 px, 탭이 폭을 가득 채운다. 프리셋 설명은 지금처럼 한 줄 말줄임(전체는 tooltip).
- 섹션 머리: 기존 `doan-menu-head`에 14 px 그룹 아이콘(metadata 색), 바탕 `--surface-popover`(불투명). sticky와 `role="group"`은 Doan presets 탭의 그룹 섹션에만 쓰고, 머리가 하나인 탭(Suggested, Project, Commands)은 develop처럼 평범한 머리다.
- 목록 최대 높이 336 px, 짧은 창에서는 `--radix-popover-content-available-height`로 드로어가 줄고 목록이 먼저 줄어든다. `scroll-padding-block-start`는 머리 높이와 같다.
- Doan presets 탭 아이콘 lucide `LibraryBig`(accent, `GROUP_ICONS`에 추가). tablist 이름 "Categories", listbox 이름 "Doan presets". 모르는 그룹 머리는 키 그대로.
- 프리셋을 읽지 못했는데 스킬·명령이 있으면 develop처럼 탭 없이 notice 아래에 Project·Commands 섹션을 쌓는다.
