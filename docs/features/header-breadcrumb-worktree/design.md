# 헤더 브레드크럼과 워크트리 — design

## 영향 받는 구성 요소

- **앱(renderer)만** 바뀐다. CLI, skill, 형식은 바뀌지 않는다.
- 새 공용 컴포넌트 `WorktreeSwitch`(이름은 구현 때 정한다): 항상 셀렉트(메뉴 버튼)와 그 메뉴. 메뉴 행 목록은 호출하는 곳이 걸러서 넘긴다(캔버스 헤더만 거른다). 지금 세 곳의 메뉴 코드(`ShellSidebar.tsx:487-493`, `ProjectOverview.tsx:373-402`)를 이 컴포넌트로 모은다. Home의 트레이(`HomeComposerView.tsx:658-677`)는 비목표라 그대로 둔다.
- `CanvasHeader.tsx`: 앞에 프로젝트 조각과 `WorktreeSwitch`를 더한다. 프로젝트 이름과 워크트리 목록은 App의 `cards`(`App.tsx:949`)와 `loadedRoot`에서 받는다.
- `ShellSidebar.tsx`: 프로젝트 행의 읽기 전용 칩(`shell-branch`)을 `WorktreeSwitch`로 바꾼다. 행 전체가 버튼(Overview 열기)이므로, 셀렉트는 행 버튼 안에 중첩되지 않게 형제 요소로 둔다. "…" 메뉴의 Worktrees 구역은 남긴다(문제 오버레이가 Overview를 덮을 때의 복구 경로이고, 그 메뉴의 다른 동작이 선택된 워크트리를 따른다).
- `ProjectOverview.tsx`: 브랜치 칩을 `WorktreeSwitch`로 바꾼다.
- 이동: 사이드바는 `enter(root)`(`App.tsx:829`) → 기억된 캔버스 또는 Overview, Overview 칩은 `showShellOverview(root)`(`App.tsx:2626`). 캔버스 헤더의 이동은 `fallbackWorktree`(`shellNavigation.ts:31-38`: 같은 경로가 목록에 있으면 그 캔버스, 아니면 Overview)를 쓴다. 메뉴는 각 워크트리의 캔버스 목록(`cards`의 행이 가진 canvases)에서 같은 경로가 있는 워크트리만 보인다. 목록을 아직 읽지 못한 워크트리는 보이지 않는다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. `worktreeLabel(row): string` — 브랜치, 폴더 이름, `detached <sha7>` 규칙. 지금 `ProjectOverview.tsx:359`와 `homeCards.ts:88`에 흩어진 규칙을 하나로 모은다.
2. `worktreeSwitchModel(card, currentRoot, only?: (row) => boolean): { label; rows: Row[] }` — 행(라벨, `~` 경로, 체크, 문제 행 복구 동작)을 만든다. `only`가 있으면 그 조건을 만족하는 행과 현재 행만 남긴다. 숨겨진 자동 등록 워크트리(`shownFolders`, `shellNavigation.ts:41`)는 세지 않는다.
3. `canvasCrumbs(card, root, canvas): Crumb[]` — 프로젝트, 워크트리, 캔버스 조각과 각각의 접근 이름·툴팁.
4. `hasCanvas(row, canvasPath): boolean` — 캔버스 헤더 메뉴의 거르기 조건. 이동 대상은 기존 `fallbackWorktree`를 쓴다.

## 형식 변경

없다.

## Conventions 영향

없다.

## 결정 영향

- PRODUCT §5 item 2 'Canvas header'의 구성 문장을 바꾼다(브레드크럼 추가).
- PRODUCT §5 item 1 사이드바 문단과 'Project menu': 칩이 셀렉트가 된다. "A project menu selects a registered worktree" 문장을 결정에 맞게 고친다.
- PRODUCT §5 item 3 'Header'(Overview): "with one it is read-only"를 없애고 항상 셀렉트로 고친다.
- PRODUCT §3 Out of scope 6(Git 동작): 바뀌지 않는다. 등록된 워크트리 사이를 오갈 뿐 브랜치를 바꾸지 않는다.

## 이전 사고에서 가져온 주의점

- `ShellSidebar.test.tsx:58-64`는 `styles.css`에 `.crumbs`·`.branch` 규칙이 없음을 확인한다(이전 셸의 브레드크럼 잔재). 새 클래스 이름은 이 둘을 피한다.
- 2026-10 composer confirm dialog 재발(`docs/postmortem/2026-10.md:25`): 같은 UI를 여러 곳이 따로 만들면 한쪽만 고쳐진다. 세 곳이 `WorktreeSwitch` 하나를 쓰는지 테스트로 고정한다.
- 2026-11 Retry 상태 초기화(`docs/postmortem/2026-11.md:258-262`): 문제 행 복구 동작의 Retry는 `retryButton`/`useRetry`를 쓴다.

## 폭

- 캔버스 헤더는 56 px 높이, 캔버스 이름은 최대 40 %이고, 960×600에서 이미 프레임 이름이 먼저 줄어든다(`docs/design/canvas.md` 'Canvas area and right panel'). 조각이 둘 늘어나므로 줄임 순서와 최대 폭은 `/design-draft`에서 정하고 `/design-sync`로 측정한다.

## PoC 의존

없다. 기존 컴포넌트를 모으고 옮기는 일이다.
