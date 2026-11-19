# 헤더 브레드크럼과 워크트리 — design

## 영향 받는 구성 요소

- **앱(renderer)만** 바뀐다. CLI, skill, 형식은 바뀌지 않는다.
- 새 공용 컴포넌트 `WorktreeSwitch`(이름은 구현 때 정한다): 항상 셀렉트(메뉴 버튼)와 그 메뉴. 행 목록과 각 행의 활성 여부는 호출하는 곳이 정해서 넘긴다(캔버스 헤더만 비활성 행을 만든다). 지금 두 곳의 메뉴 코드(`ShellSidebar.tsx:487-493`, `ProjectOverview.tsx:373-402`)를 이 컴포넌트로 모은다. 문제 행 판정은 이미 있는 `worktreeChoice`(`ProjectOverview.tsx:114`)를 다시 쓴다. Home의 트레이(`HomeComposerView.tsx:658-677`)는 비목표라 그대로 둔다.
- `CanvasHeader.tsx`: 앞에 프로젝트 조각과 `WorktreeSwitch`를 더한다. 프로젝트 이름과 워크트리 목록은 App의 `cards`(`App.tsx:949`)와 `loadedRoot`에서 받는다. 등록된 root마다 watcher와 읽기가 따로 있고(`shell.ts:214`, `:227`), list 행은 자기 `canvases`를 가진다(`view.ts:65`). 그래서 각 워크트리에 그 캔버스가 있는지 판단할 데이터가 이미 있다.
- `ShellSidebar.tsx`: 프로젝트 행의 읽기 전용 칩(`shell-branch`, `:476`)을 `WorktreeSwitch`로 바꾼다. 행은 버튼이 아니라 roving tabindex를 쓰는 `div role="treeitem"`(`:467`, 누르면 `toggle`, `:470`)이고 "…" 버튼(`shell-more`, `:480`)이 이미 그 안에 있다. 셀렉트도 "…"와 같은 패턴을 따른다: `tabIndex={active ? 0 : -1}`, click·keydown `stopPropagation`(←/→ 접기와 typeahead가 셀렉트에 걸리지 않게). 잠금 중에는 `aria-disabled`. "…" 메뉴의 Worktrees 구역은 남긴다(문제 오버레이가 Overview를 덮을 때의 복구 경로이고, 그 메뉴의 다른 동작이 선택된 워크트리를 따른다).
- `ProjectOverview.tsx`: 브랜치 칩을 `WorktreeSwitch`로 바꾼다.
- 이동:
  - 사이드바: `enter(root)`(`App.tsx:829`) → 기억된 캔버스 또는 Overview(지금과 같다).
  - Overview 칩: `showShellOverview(root)`(호출 `App.tsx:2626`, 정의 `:842`)(지금과 같다).
  - 캔버스 헤더: `App.tsx:925-930`의 패턴(행에서 같은 경로를 찾으면 `openShellCanvas`, 없으면 그 자리)을 따른다. `fallbackWorktree`(`shellNavigation.ts:31-38`)는 사라진 워크트리를 대신할 곳을 고르는 함수라 쓰지 않는다. 캔버스가 사라졌으면 `openShellCanvas`의 지금 동작(토스트, 제자리, `App.tsx:838`)을 그대로 쓴다. 줌과 보던 위치는 새 캔버스에 그대로 넘기고, 선택은 해제한다.
- 같은 캔버스는 경로로 찾는다(사용자 결정). 앱 복원의 `sameCanvas`는 ID를 먼저 보지만(PRODUCT §5 item 1), 이 이동은 "같은 파일의 다른 브랜치 모습"을 보려는 것이라 경로가 맞다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `worktreeLabel(row): string` — 브랜치, 폴더 이름, `detached <sha7>` 규칙. 지금 `ProjectOverview.tsx:359`와 `homeCards.ts:88`에 흩어진 규칙을 하나로 모은다. Home 트레이도 이 함수를 쓰지만 규칙이 같아 보이는 라벨은 바뀌지 않는다.
2. `worktreeSwitchModel(card, currentRoot, rowState?: (row) => RowState): { label; rows: Row[] } | null` — 행(라벨, `~` 경로, 체크, 문제 행 복구 동작 또는 비활성 이유)을 만든다. Git이 아니면 `null`(셀렉트 없음). 숨겨진 자동 등록 워크트리(`shownFolders`, `shellNavigation.ts:41`)는 넣지 않는다.
3. `headerRowState(row, canvasPath): RowState` — 캔버스 헤더용: 그 경로가 목록에 있으면 활성, 없으면 "No <canvas> here", 읽는 중이면 "Reading…", 문제면 그 상태. 경로를 문자열로 비교한다.
4. `headerMove(row, canvasPath): { kind: "canvas"; root; path } | { kind: "stay" }` — 캔버스 헤더 이동 대상.
5. `canvasCrumbs(card, root, canvas): Crumb[]` — 프로젝트, 워크트리, 캔버스 조각과 각각의 접근 이름·툴팁. 목록에 없는 페이지와 프로젝트 문제일 때는 캔버스 이름 없이(PRODUCT §5 item 2 'Canvas header') 셀렉트 비활성 이유를 담는다.

## 형식 변경

없다.

## Conventions 영향

없다.

## 결정 영향

- PRODUCT §5 item 2 'Canvas header'의 구성 문장을 바꾼다(브레드크럼 추가).
- PRODUCT §5 item 1 사이드바 문단: 프로젝트 행의 브랜치 칩이 셀렉트가 된다. 'Project menu'의 "A project menu selects a registered worktree"는 그대로 맞고, 사이드바 셀렉트를 더한다.
- PRODUCT §5 item 3 'Header'(Overview): "with one it is read-only"를 없애고 Git 프로젝트에서는 항상 셀렉트로 고친다.
- PRODUCT §3 Out of scope 6(Git 동작): 바뀌지 않는다. 등록된 워크트리 사이를 오갈 뿐 브랜치를 바꾸지 않는다.

## 이전 사고에서 가져온 주의점

- `ShellSidebar.test.tsx:58-64`는 `styles.css`에 `.crumbs`·`.branch` 규칙이 없음을 확인한다(이전 셸의 브레드크럼 잔재). 새 클래스 이름은 이 둘을 피한다.
- 2026-10 composer confirm dialog 재발(`docs/postmortem/2026-10.md:25`): 같은 UI를 여러 곳이 따로 만들면 한쪽만 고쳐진다. 세 곳이 `WorktreeSwitch` 하나를 쓰는지 테스트로 고정한다.
- 2026-11 Retry 상태 초기화(`docs/postmortem/2026-11.md:258-262`): 문제 행 복구 동작의 Retry는 `retryButton`/`useRetry`를 쓴다.
- 2026-11-01 'The canvas agent indicator kept another worktree’s conversation and its Stop'(`docs/postmortem/2026-11.md:1137`): 두 워크트리가 같은 캔버스 경로를 가질 때 경로만으로 상태를 묶으면 다른 워크트리의 것이 남는다. 캔버스의 정체성은 root를 포함해야 한다. 캔버스 헤더 이동 뒤 열린 캔버스·대화 패널·선택·Back/Forward가 새 root를 가리키는지, 두 root를 오가는 테스트로 고정한다.
- 메뉴가 열려 있는 동안 읽기가 끝나 행이 활성으로 바뀌어도 포커스가 튀지 않는지 테스트한다.

## 폭

- 캔버스 헤더는 56 px 높이, 캔버스 이름은 최대 40 %이고, 960×600에서 이미 프레임 이름이 먼저 줄어든다(`docs/design/canvas.md` 'Canvas area and right panel'). 조각이 둘 늘어나므로 줄임 순서와 최대 폭은 `/design-draft`에서 정하고 `/design-sync`로 측정한다.

## PoC 의존

없다. 기존 컴포넌트를 모으고 옮기는 일이다.
