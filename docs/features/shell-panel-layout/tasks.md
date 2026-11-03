# shell-panel-layout — tasks

한 번의 `/ship`으로 진행한다. 맨 앞에 PoC를 두고, 커밋마다 순수 함수 → 셸(I/O) → UI 순서로 간다. `── 커밋 N ──` 줄이 커밋 경계이며 그 위의 task가 그 커밋에 들어간다. 각 task의 마지막 줄이 검증 방법이다.

## PoC

- [ ] T0. ⌘B가 메뉴 단축키로 오는지 확인한다(design §7). `.scratch/shell-panel-layout/cmdb-poc/`에 작은 Electron 앱을 두고(앱의 `node_modules` Electron), `format*` beforeinput을 막는 contenteditable, 일반 `<input>`, iframe, `CmdOrCtrl+B` 메뉴 항목을 넣는다. 각 요소에 포커스를 둔 채 네이티브 ⌘B를 보내 click 로그가 한 번 찍히는지, 입력 내용에 서식이 생기지 않는지 본다. 결과(요소별 받음/못 받음)를 T9 아래 'T0 결과'에 적고 design §2.4 '단축키와 메뉴'의 갈래를 고른다. 데스크톱이 잠겨 네이티브 키를 보낼 수 없으면 '입력창이 직접 넘김' 갈래로 진행하고, 두 번 토글되지 않는지는 T11에서 다시 본다.
  - 검증: `app/node_modules/.bin/electron .scratch/shell-panel-layout/cmdb-poc`로 PoC 창을 띄우고, 요소마다 포커스를 둔 뒤 `osascript -e 'tell application "System Events" to keystroke "b" using command down'`로 네이티브 ⌘B를 보낸다(실행하는 터미널에 손쉬운 사용 권한 필요). 요소별 click 로그 횟수와 입력 내용을 'T0 결과'에 적는다.

## 1. 캔버스 대화 패널 최소 폭

- [x] T1. `rightPanelSize.ts`: `panelBounds` 최소 280 고정, `canvasPanelDefault(window)`, `panelWidth(saved, bounds, fallback)`, Overview 기본 280 상수(design §3-1). 기존 `rightPanelSize.test.ts`의 "the default and the minimum are max(320, 28%)" 기대를 기본 폭과 최소 폭으로 나눠 고친다.
  - 검증: `npm --prefix app test`에서 `rightPanelSize.test.ts`가 새 기대로 red → green.
- [x] T2. App이 캔버스 대화 패널 기본 폭으로 `canvasPanelDefault`를 쓰게 연결한다. 280에서 패널 머리, 메뉴, 스레드, docked 입력창, 터미널 세션 선택 카드, 추천 프롬프트가 넘치면 그 CSS만 고친다(design §2.2).
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck` 통과. 실제 앱 확인은 T11.

── 커밋 1: `feat(app): let the canvas conversation panel narrow to 280px` ──

## 2. Overview New conversation 버튼

- [x] T3. Overview 헤더 끝의 New conversation 버튼(design §2.1). `ProjectOverview.test.tsx`에 버튼 이름, 대화가 보일 때 새 대화 상태로 바뀌고 입력창이 포커스를 받음, 새 대화 상태에서는 포커스만 받음을 고정한다.
  - 검증: `npm --prefix app test`에서 `ProjectOverview.test.tsx`의 새 테스트가 red → green.

── 커밋 2: `feat(app): add a New conversation button to the Overview header` ──

## 3. Overview 오른쪽 패널 폭 조절

- [x] T4. `restore/uiState.ts`에 `overviewPanel.width` 파싱(캔버스 패널 폭과 같은 범위 검사, design §3-4).
  - 검증: `npm --prefix app test`에서 `uiState.test.ts`의 새 테스트가 red → green.
- [x] T5. Overview 오른쪽 패널의 핸들, 따로 기억하는 폭, 공유 한계, 읽기 전 변경 우선, 저장(design §2.3). App 테스트에 두 패널 폭이 서로 바뀌지 않음, 더블클릭하면 280, 읽기가 끝나기 전에는 저장을 보내지 않음을 고정한다.
  - 검증: `npm --prefix app test`에서 App 테스트(`App.conversationPanel.test.tsx` 또는 같은 방식의 새 파일)가 red → green.

── 커밋 3: `feat(app): resize the Overview's canvas conversations panel` ──

## 4. 사이드바 숨기기/보이기

- [ ] T6. `sidebarToggleView(hidden, slots)`(design §3-2): 라벨, 아이콘, 점 우선순위, `canvas` 슬롯 무시.
  - 검증: `npm --prefix app test`에서 `sidebarSize.test.ts`(또는 새 테스트 파일)가 red → green.
- [ ] T7. `main/menuState.ts`의 `toggleSidebar`(design §3-3).
  - 검증: `npm --prefix app test`에서 `menuState.test.ts`가 모달·첫 실행에서 꺼짐, 페이지 잠금에서 켜짐으로 red → green.
- [ ] T8. `restore/uiState.ts`의 `sidebar.hidden` 파싱과 `sidebar` 필드의 부분 값(`width`만, `hidden`만, 둘 다 잘못됨)(design §3-4).
  - 검증: `npm --prefix app test`에서 `uiState.test.ts`의 새 테스트가 red → green.
- [ ] T9. 사이드바 숨기기/보이기 연결(design §2.4): View 메뉴 항목과 `MenuCommand`·`MenuInputs`·`menu:state` 검증, `TopBar` 버튼과 점·툴팁, 루트 속성과 셸 CSS, 숨길 때 unmount, 포커스 이동, 저장과 읽기 전 규칙, 측정 효과 의존성. T0이 '못 받음'이면 입력창 keydown이 ⌘B를 넘긴다. App 테스트에 버튼과 메뉴 명령의 토글, 사이드바 안 포커스에서 숨기면 버튼으로 포커스, 열린 프로젝트 메뉴가 숨김 뒤 다시 나타나지 않음, 숨긴 동안 슬롯 신호에 따른 이름, 읽기 전 저장 없음을 고정한다.
  - T0 결과: (T0에서 적는다)
  - 검증: `npm --prefix app test`의 새 테스트가 red → green, `npm --prefix app run typecheck` 통과.

── 커밋 4: `feat(app): hide and show the sidebar` ──

## 검증

- [ ] T10. 공용 게이트.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과.
- [ ] T11. `/runtime-test`: 격리된 실제 앱에서 spec 완료 기준 1–10을 짧게 확인한다.
  - 1238 × 780과 960 × 600, 사이드바 보임/숨김 각각에서 헤더(신호등·사이드바 버튼·Back·Forward·탭 캡슐), Overview 헤더, 캔버스 페이지 표면(헤더·에이전트 notice·캔버스 notice·토스트·도구 줄)의 사각형이 겹치지 않음.
  - 280 캔버스 패널의 스크린샷, Overview 핸들과 포털 메뉴 하나 이상의 스크린샷(POSTMORTEM 2026-11-02 'Every Overview menu opened under the Overview itself').
  - 재시작 뒤 두 패널 폭과 숨김 상태, 숨긴 채 재시작할 때의 깜박임 여부, 숨긴 동안 다른 프로젝트 Home 대화의 신호에 따른 점과 이름.
  - ⌘B는 네이티브 키 입력으로 입력창·일반 입력·캔버스 iframe에서 한 번씩 확인한다. 데스크톱이 잠겨 있으면 메뉴 항목 클릭으로 대신하고 미검증으로 남긴다.
  - 검증: `/runtime-test` 보고서에서 각 기준의 결과와 스크린샷 경로. 확인하지 못한 표면은 미검증으로 적는다.

## 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 승격하고 이 디렉터리를 지운다. 문서마다 커밋을 나누고, 근거는 커밋 메시지에 쓴다.
  - `docs/PRODUCT.md`(영문): §5 항목 1 사이드바 문장(숨기기, ⌘B와 View 메뉴, 이 기기에 기억, 숨긴 동안 버튼의 점과 신호, 자동으로 열지 않음), §5 항목 2 'Conversation panel' 'Width'(최소 280), §5 항목 3 'Project Overview'(헤더의 New conversation 버튼, Canvas conversations 패널의 폭 조절과 따로 기억하는 폭).
  - `docs/ARCHITECTURE.md`(영문): §7 'Navigation persistence and IPC'의 선택 필드 목록(`overviewPanel`, `sidebar.hidden`), §7 'App menu'(View > Hide/Show Sidebar ⌘B, T0 결과가 '못 받음'이면 입력창이 ⌘B를 넘기는 이유).
  - `docs/DESIGN.md`(영문): 'App shell'(헤더 버튼 자리와 Back·Forward 위치, 숨김 레이아웃, 점), 'Project Overview'(Panels, Header의 버튼, 핸들), 'Canvas area and right panel'의 'Panel width'·'No overlap', 'Canvas conversation panel'의 'Narrow'. 측정하지 못한 값은 'Not verified'에 둔다.
  - `docs/BACKLOG.md`: T11에서 확인하지 못한 표면(네이티브 ⌘B 등)이 있으면 적는다.
  - 마지막으로 `docs/features/shell-panel-layout/`를 지운다.
  - 검증: `rg -n "28dvw" docs/PRODUCT.md docs/DESIGN.md`가 기본 폭 문맥에서만 나오고, `docs/features/shell-panel-layout/`가 없다.
