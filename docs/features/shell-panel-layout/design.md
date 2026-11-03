# shell-panel-layout — design

동작과 완료 기준은 [spec.md](./spec.md)에 있다. 여기서는 어디를 어떻게 바꾸는지 적는다. 파일 경로는 `app/src/` 아래다.

## 1. 영향받는 구성 요소

- **app (renderer)**: `rightPanelSize.ts`, `sidebarSize.ts`, `App.tsx`(`TopBar`, 폭 상태와 측정, 셸 렌더), `ProjectOverview.tsx`(헤더), `ConversationPanel.tsx`의 `ResizeHandle`(재사용, 변경 없음 목표), `styles.css`, `ShellSidebar.tsx`(숨길 때 열린 메뉴와 포커스).
- **app (main)**: `main/index.ts`(View 메뉴 항목, `MenuCommand`, `MenuInputs`, `menu:state` 입력 검증, 전체 화면 상태 알림), `main/menuState.ts`(활성 여부).
- **app (restore)**: `restore/uiState.ts`(`UiState`의 `sidebar`, 새 `overviewPanel` 필드 파싱).
- **app (preload)**: `setMenuState` 입력 타입이 바뀐다(`MenuInputs`에 필드 하나). 전체 화면 상태를 읽고 구독하는 API가 더해진다.
- **CLI(Go) / 스킬 / 앱 소켓 / `.doan/config.json` / 코멘트 이벤트 / `runtime.json`**: 바뀌지 않는다.

## 2. 항목별 설계

### 2.1 Overview의 New conversation 버튼

- `ProjectOverview.tsx` 헤더 끝에 캔버스 패널과 같은 마크업을 둔다: `button.doan-icon-button` + `SquarePen`, `aria-label="New conversation"`, 공용 `Tooltip`. `.ov-head`는 flex이므로 버튼 앞에 늘어나는 빈칸을 두거나 버튼에 `margin-left: auto`를 준다. 제목 칸(`.ov-title-wrap`, `min-width: 0`)이 먼저 줄어든다.
- 동작은 기존 경로를 그대로 부른다. Overview 안에서 제목 메뉴의 New conversation이 하는 일(`choose(NEW)`에 해당)과 같고, 이미 새 대화 상태이면 입력창 포커스만 준다. 캔버스 패널의 `startNewConversation(current, select, focus)`를 같이 쓴다(현재 `CanvasConversationPanel.tsx`에 있다. 두 곳이 쓰게 되면 공용 위치로 옮길지는 구현에서 정하되, 새 추상화는 만들지 않는다).
- App의 `newConversation()`(⌘N)은 바꾸지 않는다. 버튼과 ⌘N이 같은 결과를 내는지는 테스트로 묶는다.

### 2.2 캔버스 대화 패널의 최소 폭

`rightPanelSize.ts`를 이렇게 바꾼다.

- `panelBounds(windowWidth, shellWidth)`: `max`는 지금 식 그대로(`floor(min(window × 0.5, shell − 360))`, 0 이상). `min = min(280, max)`. 창 비율 최소(`WINDOW_SHARE_MIN`)는 최소에서 빠진다.
- 기본 폭은 최소와 분리한다. `canvasPanelDefault(windowWidth) = round(max(320, window × 0.28))`. `FLOOR = 320`과 `0.28`은 기본 폭 상수로 남고, 최소 상수 `PANEL_MIN = 280`을 새로 둔다.
- `panelWidth(saved, bounds, fallback)`: 저장값이 없거나 숫자가 아니면 `fallback`, 그다음 `[min, max]`로 자른다. 호출하는 쪽이 패널마다 기본 폭을 넘긴다(캔버스: `canvasPanelDefault(window)`, Overview: 280).
- 더블클릭은 지금처럼 `onResize(undefined)`로 저장값을 지우고, 보이는 폭은 기본 폭이 된다.
- 280에서 입력창: docked 입력창은 좁은 트레이를 Permission → Effort 순서로 아이콘만 남긴 뒤 모델 라벨을 말줄임한다(PRODUCT 'Permission picker'). 이 규칙이 280에서도 넘치지 않는지는 probe에서 확인하고, 넘치면 그 화면 CSS만 고친다. 캡슐 placeholder는 이미 한 줄 말줄임이다.

### 2.3 Overview 오른쪽 패널의 폭 조절

- **상태.** App에 `overviewPanel` 저장값(`number | undefined`)을 캔버스 패널(`rightPanel.width`)과 따로 둔다. ui-state 읽기 전에 사람이 바꾼 값이 이기는 규칙(`panelTouched`, `sidebarTouched`와 같은 방식)을 그대로 쓴다.
- **측정.** 지금 `measure()`는 Overview 아래에 깔린 `.doan-canvas-panel`의 왼쪽 가장자리부터 셸 오른쪽 안쪽 여백까지를 잰다. 캔버스 패널은 Overview 아래에서도 레이아웃에 남으므로(DESIGN 'Overview placement') 같은 값을 Overview 한계에도 쓴다. 한계는 `panelBounds(window, shell)` 하나를 두 패널이 같이 쓴다.
- **칸 폭.** 지금은 Overview일 때 `--doan-right-width`를 지워서 `:root`의 280이 적용된다. 바꾼 뒤에는 Overview에서도 `panelWidth(overviewSaved, bounds, 280)`을 `--doan-right-width`에 쓴다. 드래그 중 미리보기는 같은 속성에 직접 쓴다(`previewPanel`과 같은 방식). 접기 애니메이션(`data-panel-motion`)은 Overview 폭 변경에 켜지 않는다.
- **핸들.** `ResizeHandle`을 `.right-stack` 시작 가장자리에 둔다. 라벨은 "Resize canvas conversations"이다. 핸들은 `z-index: 4`인데 Overview(`.ov`)는 `z-index: 1`로 캔버스 패널 위에 있으므로, 핸들이 `.ov`와 `.right-stack` 경계에서 포인터를 받는지, Overview의 포털 메뉴(제목·워크트리·모델·effort·프리셋)가 핸들 위에 그려지는지 확인한다(POSTMORTEM 2026-11-02 'Every Overview menu opened under the Overview itself': 새 쌓임 층은 포털 메뉴와 비교하고, probe에서 그 화면의 포털 메뉴를 하나 이상 열어 스크린샷으로 판단한다).
- **키보드.** `nudgePanel`(edge `"start"`)을 그대로 쓴다: ←는 넓히고 →는 좁히며, Home은 최대, End는 최소다.

### 2.4 사이드바 숨기기/보이기

#### 상태와 저장

- App에 `sidebarHidden`(boolean)을 둔다. 저장은 ui-state의 `sidebar` 필드를 넓혀 `sidebar?: { width?: number; hidden?: true }`로 한다. 지금 파서는 `width`가 없으면 필드를 버리므로 `restore/uiState.ts`의 파싱을 고친다: `width`는 지금 규칙으로 검사하고, `hidden`은 `true`일 때만 남기며, 둘 다 없으면 필드를 만들지 않는다.
- 읽기 전 규칙: 읽기가 끝나기 전 사람이 토글하면 그 값이 이긴다(`sidebarTouched`와 같은 방식). 읽기가 끝나기 전에는 저장을 보내지 않는다(POSTMORTEM 2026-11-01 'A ui-state save sent before the startup read could replace every remembered field': 교체형 저장소의 클라이언트는 첫 읽기가 끝나기 전에 아무것도 보내지 않고, 첫 저장에서 읽은 값을 합친다. 필드를 빼서 보호하지 않는다).
- 예전 앱은 `hidden`을 모르므로 저장할 때 버릴 수 있다. ARCHITECTURE §7 'Navigation persistence and IPC'가 이미 받아들인 성질이다.

#### 레이아웃

- 숨김은 루트 요소의 속성 하나로 표시한다(예: `document.documentElement`의 `data-sidebar="hidden"`). 지금 사이드바 폭이 루트 변수 `--doan-sidebar-width`로 모든 셸 그리드에 퍼지는 것과 같은 길이다. 숨기면 첫 칸을 `0`으로 두고, 사이드바 뒤 본문의 8px 시작 여백(`.workspace > .doan-canvas-panel`, `.workspace > .ov`, `.workspace > .strip-slot`, `.home-panel`, 그리고 Settings·Add Projects·Project Settings 셸의 같은 여백)을 0으로 둔다. 찾는 명령: `rg -n "margin-left: (8px|var\(--space-2\))" app/src/renderer/styles.css`와 각 페이지 셸 클래스.
- 사이드바(`ShellSidebar`)와 사이드바 핸들(`.doan-sidebar-handle`)은 숨기면 렌더하지 않는다(unmount). 이유: DOM에 남겨 두고 감추면 열린 Radix 메뉴가 포털에 남거나 다시 나타날 수 있다(POSTMORTEM 2026-11-01 'A frame drawer list closed by a disabled trigger reopened by itself': 열림을 다른 플래그로 가리면 낡은 의도가 남는다). unmount하면 메뉴가 함께 닫히고 Tab 순서에서도 빠진다. 사이드바의 펼침·그룹 상태는 App과 ui-state에 있어서 잃지 않는다. 목록 스크롤 위치는 다시 보일 때 처음부터 시작할 수 있다(받아들임, probe에서 기록).
- 버튼의 `aria-controls`는 사이드바가 보일 때만 붙인다(숨기면 가리킬 요소가 없다). `aria-expanded`는 보임/숨김을 따른다.
- 전환은 캔버스 패널 접기와 같은 `grid-template-columns` 전환을 쓰고 `prefers-reduced-motion`에서 없앤다(spec '결정' 6). 드래그와 창 크기 변경에는 켜지 않는다.
- 사이드바 폭이나 숨김이 바뀌면 캔버스 칸의 시작이 움직이므로 패널 측정을 다시 한다. 지금 `measure` 효과는 `[shownSidebar]`에만 의존하므로 숨김 상태도 의존성에 넣는다. 캔버스 뷰는 `CanvasController`의 `ResizeObserver`가 칸 크기 변화를 따라간다. 숨길 때 배율·위치가 사이드바 폭을 바꿀 때와 같이 유지되는지 probe에서 확인한다.

#### 헤더

- `TopBar`에서 `traffic-space` 다음, `.shell-history` 앞에 버튼을 둔다. 버튼은 `.shell-history` 버튼과 같은 32px `doan-icon-button` `data-ui-placement="chrome"`(모서리 10, hover 6% 채움)이고, 헤더의 drag 영역에서 빠지는 no-drag 규칙을 같이 받는다. 지금 Back이 있는 x104에 이 버튼이 오고, Back·Forward는 36px(32 + 간격 4) 오른쪽으로 간다.
- 960 × 600: 가운데 탭 캡슐(371.26px, 가운데 정렬)의 왼쪽 끝은 약 x294이고, 버튼 셋의 끝은 약 x208이다. 겹치지 않을 것으로 보지만 probe에서 실제 사각형으로 확인한다(POSTMORTEM 2026-10-27 'Shell restyle lost navigation landmarks' 재발 항목: 셸 여백을 바꾸면 의존하는 표면의 실제 사각형을 비교한다).
- 툴팁: "Hide sidebar" / "Show sidebar"와 키 표시 ⌘B. 캔버스 도구 툴팁의 `.doan-kbd`(sm)를 쓴다.
- 점: 접힌 패널의 Show conversation 점과 같은 `data-badge` 규칙(8px `--affordance-accent`, 위·끝에서 4, 2px 테두리 링)을 쓴다. 헤더 배경은 네이티브 반투명 재질이라 Show conversation의 흰 헤더와 다르므로, 링 색이 어울리는지 스크린샷으로 판단한다. 다르게 해야 하면 DESIGN에 이유와 함께 적는다.

#### 점 신호

- 사이드바가 그리는 슬롯 맵(`sidebarSlots(withTerminalSlots(run.slots(), work, entries), entries, shownCanvas)`)에서 `kind`가 `permission`, `working`, `unseen`인 값만 본다. 캔버스 notice(`kind: "canvas"`)는 넣지 않는다(spec '결정' 2). 터미널 작업은 `working`(`source: "terminal"`)으로 이미 들어 있다.
- 사이드바가 보일 때는 점을 계산하지 않는다(`null`).
- Settings 페이지의 사이드바는 카테고리를 보여 주고 슬롯이 없다. 숨긴 상태의 점은 같은 슬롯 맵을 따르므로 Settings 페이지에서도 붙는다(spec '결정' 1).

#### 단축키와 메뉴

- `main/index.ts` View 메뉴 맨 앞에 `{ label: hidden ? "Show Sidebar" : "Hide Sidebar", accelerator: "CmdOrCtrl+B", enabled: enabled.toggleSidebar, click: command("toggleSidebar") }`와 구분선을 둔다. `MenuCommand`에 `"toggleSidebar"`를 더하고, renderer의 `onMenuCommand`가 받아 토글한다.
- 라벨이 상태를 따르므로 `MenuInputs`에 `sidebarHidden?: boolean`을 더하고, `setMenuInputs`의 같음 비교와 `menu:state` 입력 검증에 넣는다. 메뉴는 지금처럼 입력이 바뀔 때 다시 만든다.
- `menuState`: `toggleSidebar = !modalOpen && !wizardOpen`. 페이지 잠금(`locked`)에서는 켠다(spec '결정' 5). 지금은 잠금이면 모든 항목을 끄는 첫 분기가 있으므로, 이 항목만 그 분기 밖에서 정한다.
- **⌘B와 텍스트 입력.** macOS Electron에서는 페이지가 처리한 키가 메뉴 key equivalent로 가지 않는다(`main/index.ts` `editHistory` 주석). Chromium은 contenteditable에서 ⌘B를 ToggleBold 편집 명령으로 처리할 수 있고, 입력창은 그 결과인 `formatBold` beforeinput을 막을 뿐이다(`chipField.ts`). 그래서 입력창에 포커스가 있을 때 메뉴 단축키가 오지 않을 수 있다. T0 PoC 결과에 따라 둘 중 하나로 간다.
  - 메뉴가 받는다: 추가 코드 없음.
  - 메뉴가 못 받는다: 입력창(`ChipField`의 keydown)이 ⌘B(다른 수식키 없음, 조합 중 아님)에서 `preventDefault`하고 App이 넘긴 토글 콜백을 부른다. 이때 메뉴는 그 키를 받지 않으므로 두 번 토글되지 않는다. 일반 `<input>`과 캔버스 iframe도 PoC에서 같이 본다.
- Playwright 키는 네이티브 단축키에 닿지 않는다(ARCHITECTURE §7 'App menu'). 자동 probe는 메뉴 항목을 main에서 클릭하고, ⌘B 자체는 네이티브 키 입력(System Events keystroke)으로만 확인한다. 데스크톱이 잠겨 있으면 미검증으로 남기고 BACKLOG에 적는다.

#### 포커스

- 숨기기 직전 `document.activeElement`가 사이드바 안에 있으면, 숨긴 뒤 Show sidebar 버튼에 포커스를 준다. 사이드바에서 열린 메뉴의 포털 안에 포커스가 있던 경우도 사이드바 안으로 본다(메뉴 콘텐츠는 `body` 끝에 있으므로 `.shell-side-menu` 같은 클래스로 판단한다).
- 그 밖에는 포커스를 옮기지 않는다. 보일 때도 옮기지 않는다.
- 사이드바를 전제로 한 기존 포커스 규칙(캔버스를 휴지통으로 옮긴 뒤 다음 행으로, 행 메뉴 Esc 뒤 트리거로)은 사이드바가 보일 때만 해당한다. 숨긴 동안 그 흐름은 사이드바 메뉴에서만 시작되므로 생기지 않는다.

### 2.5 전체 화면에서의 헤더

- main이 메인 창의 `enter-full-screen`·`leave-full-screen`에서 renderer로 전체 화면 여부(boolean)를 보낸다. renderer가 처음 그릴 때와 창을 다시 보일 때 쓰도록 지금 값을 읽는 invoke도 둔다(구독보다 먼저 이벤트가 오면 최신 값이 이긴다). 채널 이름과 preload 모양은 기존 `work:changed`·`deep-link:open` 구독 방식을 따른다. 메인 창 main frame만 받는다(기존 sender 검사).
- App은 루트 요소에 `data-fullscreen` 속성을 두고, CSS가 `.shell-top .traffic-space`의 폭을 0으로 만든다. 헤더 `padding: 0 8px`는 그대로라 첫 버튼이 x8에 온다. 전환 애니메이션은 두지 않는다(macOS 전환 중에 바뀐다).
- 상태는 저장하지 않는다. 운영체제의 창 상태라서 ui-state에 넣지 않는다.
- 사이드바 숨김 레이아웃, 탭 캡슐 가운데 정렬, 캔버스 페이지 표면은 바뀌지 않는다. 헤더의 drag 영역도 그대로다.

## 3. 순수 함수로 뺄 부분 (`/tdd` 대상)

1. `rightPanelSize.ts`
   - `panelBounds(window, shell)`: 최소 280 고정, 최대는 지금 식, 최소 > 최대이면 둘 다 최대.
   - `canvasPanelDefault(window)`: `round(max(320, window × 0.28))`.
   - `panelWidth(saved, bounds, fallback)`: 저장값 없음 → fallback, 그다음 한계 안으로. 저장값은 바꾸지 않는다.
   - Overview 기본값 상수 280.
2. `sidebarSize.ts`(또는 같은 자리의 새 함수): `sidebarToggleView(hidden, slots)` → `{ label, icon: "hide" | "show", badge: "permission" | "working" | "unseen" | null }`. 보일 때는 badge가 늘 `null`이고, 숨겼을 때는 `permission` > `working` > `unseen` 순으로 하나를 고르며 `canvas` 슬롯은 무시한다. 라벨은 "Hide sidebar" / "Show sidebar" / "Show sidebar, needs your answer" / "Show sidebar, agent working" / "Show sidebar, new activity".
3. `main/menuState.ts` `menuState(...)`: `toggleSidebar`가 모달과 첫 실행에서만 꺼지고 잠금에서는 켜진다.
4. `restore/uiState.ts` 파싱: `sidebar.hidden`(true만), `sidebar.width`만 있거나 `hidden`만 있는 경우, 둘 다 잘못된 경우, `overviewPanel.width`(캔버스 패널 폭과 같은 범위 검사).
5. 숨길 때 포커스 판단: `sidebarFocusAfterHide(activeInSidebar: boolean)` 정도로 작다. 함수로 뺄 만큼 크지 않으면 App 테스트로 대신한다.

## 4. 형식 변경

- JSON Schema 원본(ARCHITECTURE §11 'Shared formats')은 바뀌지 않는다. `v`도, TS·Go 공용 fixture도 바뀌지 않는다.
- 바뀌는 것은 기기 로컬 `ui-state.json`의 선택 필드 두 개(`sidebar.hidden`, `overviewPanel`)다. ARCHITECTURE §7 'Navigation persistence and IPC'가 말하는 대로 공유 형식이 아니다.
- IPC: `menu:state` 입력에 `sidebarHidden`이 더해진다. main → renderer 전체 화면 알림과 읽기 invoke가 더해진다. 앱 내부 IPC이고 CLI 계약(ARCHITECTURE §12)과 앱 소켓 버전은 바뀌지 않는다.

## 5. 관례 영향

- ARCHITECTURE §1 'Conventions'(캔버스 관례, 에이전트 규칙)는 바뀌지 않는다. 새 `doan check` 규칙도 없다.

## 6. 결정 영향

- 서빙 범위, sandbox iframe, append-only 이벤트, 토큰을 다루지 않음, git 조작 없음 같은 구조 결정은 건드리지 않는다.
- 이미 정해진 규칙 중 바뀌는 것(사용자 결정):
  - PRODUCT §5 항목 2 'Conversation panel' 'Width'와 DESIGN 'Panel width': 최소가 `max(320px, 28dvw)`에서 280px 고정으로 바뀐다. 기본 폭은 그대로다.
  - DESIGN 'Project Overview' 'Panels'의 "right panel 280"과 `App.tsx` 주석 "The Overview keeps its own 280px column": 280은 기본 폭이 되고 폭을 바꿀 수 있게 된다.
  - PRODUCT §5 항목 1의 사이드바 문장: 숨기기가 더해진다.
- ARCHITECTURE §7 'App menu'에 View > Hide/Show Sidebar(⌘B)가 더해진다. ⌘B가 입력창에서 메뉴로 가지 않으면 그 처리 방식도 비자명한 제약으로 적는다.

## 7. PoC 의존

- **⌘B가 메뉴 단축키로 오는가.** 입력창(contenteditable, `format*` beforeinput을 막음), 일반 `<input>`, 캔버스 iframe에 포커스가 있을 때 네이티브 ⌘B가 `CmdOrCtrl+B` 메뉴 항목의 click을 부르는지 아직 확인한 적이 없다. BACKLOG도 ⌘L·⌘N의 네이티브 key equivalent를 미검증으로 남겨 두었다. 그래서 T0을 먼저 한다: `.scratch/` 안의 작은 Electron 앱(앱의 `node_modules` Electron 사용)에 같은 contenteditable 처리와 메뉴 항목을 두고, System Events keystroke로 ⌘B를 보내 click 로그와 입력 내용의 서식을 본다. 결과에 따라 2.4 '단축키와 메뉴'의 두 갈래 중 하나를 고른다.
- 그 밖의 가정은 이미 앱에 있는 동작(리사이즈 핸들, 루트 변수 폭, ui-state 선택 필드, 슬롯 맵)에 기댄다.

## 8. 참고와 출처

- 사이드바 토글 단축키 ⌘B와 View 메뉴 항목 "Hide Sidebar / Show Sidebar"는 사용자가 정했다.
- 전체 화면에서 신호등 자리를 비우는 동작(2.5)은 사용자가 다른 macOS 앱(전체 화면에서 왼쪽 UI를 신호등이 없어진 만큼 당김)을 보고 요청했다(2026-11-03 사용자 스크린샷). 특정 앱의 코드나 값은 가져오지 않았다.
- 리사이즈 핸들의 모양은 이미 DESIGN 'References'가 적은 malmoi `components/ui/resizable.tsx`(malmoi `6dcdd575`)를 따른다. 새 출처는 없다.
- 읽은 디자인 프리셋: `layout`(`go run ./cli/cmd/doan design-skill layout --json`). 앱 표면에서는 익숙한 구조와 접을 수 있는 사이드바가 기대되는 패턴이라는 점, 좁은 폭에서 무엇이 줄고 무엇이 남는지 정해 두라는 점을 반영했다(완료 기준 2·4·9).
