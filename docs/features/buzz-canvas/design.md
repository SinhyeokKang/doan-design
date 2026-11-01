# buzz-canvas — design

## 0. 초안

`/design-draft`가 새 파일 `.doan/canvases/buzz-canvas.html`을 그렸다(부모 공통 결정 11). 기존 `app-shell.html`·`select-inspect.html`·`revision-continuity.html`은 이력으로 두고 고치지 않는다. 프레임은 전체 창(1238×780, 사이드바 220px, 오른쪽에 캔버스 대화 패널 껍데기) 단위다.

| 프레임 | 내용 |
|---|---|
| `default` | 캔버스를 연 직후(Fit). 캔버스 헤더(캔버스 / 프레임 서랍, 배율), 회색 보드, 캔버스 대화 패널 껍데기(제목과 닫기, 한 줄 빈 본문), 도구모음(피커 눌림) |
| `frame-selected` | 프레임 선택 외곽선과 치수 캡슐 |
| `element-hover` | 요소 hover(점선)와 요소 선택(실선)이 함께, 피커 툴팁 |
| `drawer-open` | 서랍 팝오버. 지금 보는 프레임 표시("Viewing", 채움 없음), hover 행, 긴 제목 말줄임, 목록 스크롤 |
| `drawer-truncated` | 1,000개를 넘는 캔버스의 목록 끝 안내, 제목 없는 프레임(id) |
| `zoom-menu` | 배율 메뉴(Fit ⌘1, 100% ⌘0, 50%, 200%) |
| `no-frames` | 프레임이 0개인 읽힌 캔버스: 서랍만 비활성("No frames"), 배율은 동작 |
| `states` | 로딩, 로드 실패(Reload), 폭 없음, 목록에 없는 페이지, 프로젝트 문제 |
| `notices` | 선택 잃음 알림과 토스트가 함께 뜬 모습 |
| `panel-collapsed` | 패널을 접은 캔버스 페이지(캔버스가 창 오른쪽 끝까지, 캔버스 헤더 우상단에 "Show conversation") |
| `panel-resize` | 끌어서 넓힌 패널, 경계 손잡이의 hover 모습 |
| `agent-working` | 이 캔버스의 현재 대화가 일함: 가장자리 그라디언트, 점 필드, 위쪽 가운데 안내(점, 문구, Stop) |
| `agent-waiting` | 응답 대기 문구(점 정지)와 Open hover, 일하는 중 Stop을 누른 뒤의 "Stopping…" |
| `on-dark` · `on-violet` | 어두운 캔버스, violet이 많은 캔버스 위의 선택·hover·이동 하이라이트와 작업 표시 |
| `narrow` | 960×600. 긴 프레임 이름이 먼저 줄어들고, 컨트롤·안내가 겹치지 않음 |
| `conversation-menu` | 참고 프레임(구현 몫은 `buzz-canvas-conversation`): 대화 패널 헤더의 대화 드롭다운 모양. buzz-canvas의 `/design-sync`는 이 프레임을 비교하지 않는다 |

참고: Buzz에는 캔버스 화면이 없다. 컨트롤 모양은 doan 공용 컴포넌트(`ds/controls.css`, `ds/surfaces.css`)와 이미 출하된 Overview 헤더·오른쪽 패널에서 가져오고, 새 공용 프리미티브를 만들지 않는다. 외부 참고와 출처는 아래 각 절에 적었다(AGENTS.md 'Leave evidence for references').

### 확정 값 (2026-11-01, 사용자가 외관 확정)

- 확정: 사용자가 2026-11-01 초안의 외관을 확정했다. 이 절과 아래 값이 `/design-sync`의 기준이다.
- 보드 바탕은 연한 회색 `--surface-inset`이고, 캔버스 헤더는 흰색이다. 둘 사이에 구분선이 없고 헤더는 보드를 덮지 않는다(보드는 헤더 아래에서 시작한다). 이것이 부모 표 8번 "보드를 Panel 안에 둘지"의 답이다: 캔버스 패널(흰 헤더 + 회색 보드, 왼쪽 모서리 24px) 안에 둔다.
- 캔버스 헤더: Overview 헤더 상자(`.ov-head`, 56px, 안쪽 8/16). 위계는 Overview의 프로젝트 / 대화처럼 캔버스 / 프레임이다. 캔버스(사이드바와 같은 `PanelsTopLeft` 아이콘과 이름, subtle 글자·regular, `title`은 경로, 최대 40%) · `/` · 프레임 서랍(`ov-title` 트리거: "번호. 이름", ▾, standard·medium). 프레임 이름이 먼저 줄어든다. 프로젝트와 `n/N`은 넣지 않는다. 오른쪽에 − · 배율 값(메뉴) · +, 패널이 접혔을 때만 그 뒤에 1px 구분선 · 열기 버튼.
- 목록에 없는 페이지와 프로젝트 문제에서는 헤더에 캔버스 이름과 `/`가 없고 비활성 서랍("Frames")만 있다.
- 서랍 목록(320px)과 배율 메뉴(184px)는 Overview 대화 메뉴처럼 트리거 바로 아래에 연다.
- 보드 위에 뜨는 것: 작업 안내와 알림은 보드 위쪽 가운데(보드 위 끝에서 20px, 안내가 먼저), 도구모음은 아래 가운데(보드 아래 끝에서 12px, 40px 높이). 작업 안내와 알림은 오버레이라 캔버스 내용을 덮어도 되고 Fit 여백과 상관없다. 왼쪽 아래 변경 표시는 없다.
- 비활성 서랍: 로딩·실패·폭 없음·목록에 없는 페이지·프로젝트 문제에서는 "Frames", 프레임이 0개인 읽힌 캔버스에서만 "No frames".
- 알림은 `doan-notice doan-panel`(흰 채움)에 `--shadow-panel`. 상태 메시지의 Reload는 panel 변형. 토스트는 창 오른쪽 아래 16px.

## 1. 영향 범위

- **renderer**가 주로 바뀐다. main·preload·CLI·스킬·공유 형식(JSON Schema)은 바뀌지 않는다. 공유 파서 `app/src/restore/uiState.ts`(`parseUiState`)는 main의 ui-state 저장 검증에도 쓰이므로, `rightPanel` 필드를 더하면 main 저장소가 그 필드를 보존하는지 함께 확인한다.
  - `App.tsx`: `CanvasPane`의 헤더·서랍·배율·도구모음·알림·상태 메시지 마크업, 오른쪽 열(`.right-stack`)의 캔버스 대화 패널 껍데기, 열 폭 CSS 변수. `.zctl` 띠, Reload 버튼, 변경 표시(`.updated`와 `state.label`)를 지운다. 캔버스 페이지에서 `RightPanel`을 그리지 않고 코멘트 세션(`useComments`)을 열지 않는다. 그래서 코멘트 초안·핀(`CanvasController.drawPins`의 바인딩)·Review가 생기지 않고, Go > Next/Previous Resolved Comment는 Review가 없어 지금 규칙(`menuState` `resolvedNav`)대로 비활성으로 남는다.
  - `CanvasController.ts`: `selectFrame(index)`를 `selectFrame(index, id)`로 바꾼다(아래 '프레임 서랍'). 배율 메뉴의 50%·200%는 새 함수 없이 `zoomAt(view, scale / view.scale, center, ZOOM_LIMITS)`(`actualSize`와 같은 방식). Fit과 프레임 이동이 inset을 쓴다. 첫 Fit을 실제 보드 크기가 정해진 뒤로 미룬다(아래 '첫 Fit').
  - `viewport.ts`: `fitWidth`·`fitFrame`이 사방 같은 `margin` 대신 위·오른쪽·아래·왼쪽 inset을 받는다. `locateView`(코멘트 locate 전용)는 캔버스 페이지에서 부를 곳이 없어지므로 바꾸지 않는다.
  - `canvasConversationRows.ts`: 캔버스와 대화의 매칭 함수 `sameCanvas`를 export해 작업 표시가 같은 규칙을 쓴다(세 번째 복사본을 만들지 않는다).
  - `canvasView.ts`의 `bottomLabel`과 `CanvasState.label`은 쓰는 곳이 없어져 지운다. `activity.ts`는 남겨 둔 `RightPanel`의 Canvas info가 계속 쓰므로 남긴다.
  - `styles.css`: `.area`, `.mark`, `.dims`, 프레임 이동 하이라이트, `.canvas-status`, `.canvas-notices`/`.canvas-notice`, `.updated`, `.zctl`/`.zoom`, 워크스페이스 그리드 열 규칙을 새 규칙으로 바꾼다. 새 클래스는 `doan-` 접두어를 쓴다(공통 결정 9).
- **의존성은 더하지 않는다.** 패널 끌기는 직접 구현한다(2026-11-01 user). `react-resizable-panels` 4.14.5를 읽어 보니 상태 속성(`data-separator`), 키보드 단위(5%), Home/End 방향, % 단위 aria·저장이 이 design과 맞지 않고, 앱 셸 grid를 Group 구조로 다시 짜야 했다(tech 리뷰).
- **View 메뉴**(`app/src/main/index.ts`)와 `ViewCommand`는 그대로다. 배율 메뉴의 Fit·100%는 같은 명령(`fit`, `actualSize`)을 부른다.
- **선택 경로**: 서랍의 선택은 `pick-frame` → 캔버스 스크립트의 `select` → 기존 `selection:set`이다. `doan active`, 선택 수명, 앵커 규칙(ARCHITECTURE §3 'Selection and inspector')은 바뀌지 않는다.

## 2. 상호작용 규칙

### 프레임 서랍

- 버튼: 지금 보는 프레임(`CanvasState.currentFrame`)의 번호와 이름("3. Payment", `frameLabel`의 number·name — 제목, 없으면 id)과 ▾. 전체 개수는 보이지 않는다. 접근 이름은 "Frame <번호>: <이름>". `currentFrame`은 목록에 오른 프레임(최대 1,000개) 가운데 뷰 가운데에 가장 가까운 것이라, 1,000번째 뒤를 보고 있으면 가장 가까운 목록 프레임이 보인다.
- 비활성: 렌더된 보드가 없을 때(로딩, 실패, 폭 없음, 목록에 없는 페이지, 프로젝트 문제)는 "Frames", 프레임이 0개인 읽힌 캔버스에서는 "No frames". 다시 로드 중(`CanvasState.reloading`)에는 이전 layout으로 열어 두고, 고른 행은 아래 id 확인을 거친다.
- 목록: 팝오버 안의 roving tabindex 목록. 행은 `layout.frames` 순서(문서 순서)이고 번호와 이름을 보인다. 지금 보는 행은 채움 없이 "Viewing" 글자와 `aria-current="location"`으로 표시하고, 채움은 hover와 키보드 포커스에만 쓴다. 목록을 열면 지금 보는 행이 보이도록 스크롤하고 그 행에 포커스를 둔다. 긴 이름은 말줄임하고 전체 이름을 `title`로 둔다. 사이드바 트리와 같은 500ms typeahead가 있다. `layout.truncated`면 목록 끝에 "Showing the first 1,000 frames. Search all with Quick Open (⌘K)."를 둔다.
- 행을 고르면(클릭, Enter, Space) 목록을 닫고 `selectFrame(index, id)`를 부른다. 컨트롤러는 Quick Open의 `pendingFrame` 규칙처럼 해석한다: 그 index의 id가 같으면 그대로, 아니면 `findIndex(id)`, 그래도 없으면 아무것도 하지 않는다. 지금의 `selectFrame(index)`는 호출 시점의 `layout.frames[index]`를 잡아서, 서랍이 그린 행과 그 사이 다시 로드된 layout이 다르면 다른 프레임을 고르기 때문이다(POSTMORTEM 2026-10-25 'Navigation feedback read the previous React snapshot').
- 목록이 열린 사이 다시 로드로 행이 바뀌면 포커스 행을 frame id로 유지한다. 그 행이 없어지면 지금 보는 행으로, 목록이 비면 목록을 닫는다. 지금 보는 프레임이 바뀌어도 포커스는 움직이지 않고 "Viewing" 표시만 따라간다.

### 배율 컨트롤러

- − · 배율 값(메뉴 트리거) · + 순서다. 값은 정수 %다. 렌더된 보드가 없을 때만 "—"와 함께 모두 비활성이고, 프레임이 0개인 캔버스에서는 동작한다.
- 메뉴: Fit(⌘1), 100%(⌘0), 50%, 200%. 단축키 표기는 View 메뉴와 같다. 50%·200%는 뷰 가운데를 고정한다(−·+와 같은 기준).
- Reload 버튼은 없다. ⌘R, View > Reload Canvas, 로드 실패 화면의 Reload가 남는다.

### 도구모음

- 표면은 공용 `.doan-floating`(흰색 90% 유리, `--blur-sm`, `--shadow-panel`, 모서리 24px, 안쪽 4px, 1px 투명 테두리)이다. 메뉴·토스트와 같은 표면이라 어두운 캔버스 위에서는 살짝 회색으로 비친다(2026-11-01 user, 검수에서 새로 그린 `.cv-bar` 대신).
- 하단 가운데, `role="toolbar"`(이름 "Canvas tools")에 Tab 정지점 하나, ←/→로 도구 사이를 움직인다. 다음 자식이 도구를 더해도 Tab 순서가 바뀌지 않게 지금부터 이렇게 둔다. 이번에는 선택 피커 하나다: `aria-pressed="true"`, 툴팁 "Select". 누르면 아무것도 바뀌지 않는다. 빈 자리나 숨긴 버튼은 두지 않는다.

### 툴팁

- 아이콘만 있는 버튼은 공용 툴팁(`doan-tooltip`)으로 이름을 보인다: "Zoom out ⌘−", "Zoom in ⌘=", "Hide conversation", "Show conversation", "Select". 단축키 표기는 View 메뉴와 같다. 접근 이름은 `aria-label`이다.

### 보드 위 컨트롤과 트랙패드

- 도구모음, 작업 안내, 알림 위에서 두 손가락 스크롤·핀치를 하면 그 입력을 보드 뷰로 넘겨 팬·줌이 이어진다. 보드 위에 뜬 컨트롤이 팬·줌을 끊지 않게 하기 위해서다.

### Esc와 포커스

- Esc 우선순위: 열린 메뉴·팝오버를 닫는다 → (다음 자식이 기본이 아닌 도구를 더하면) 기본 도구로 돌아간다 → 선택을 해제한다.
- 메뉴가 열린 채 누른 Esc가 선택까지 지우지 않는 데는 새 코드가 필요 없다. 선택 해제는 `CanvasController.keydown`(window, bubble)이 하고 `event.defaultPrevented`이면 넘어가는데, Radix의 Esc 처리(`useEscapeKeydown`, document capture)가 닫으면서 `preventDefault()`를 부른다. 실제 앱 probe로 확인한다.
- 메뉴를 닫으면 포커스는 연 버튼으로 돌아온다. 서랍에서 프레임을 고른 뒤에도 서랍 버튼으로 돌아온다.
- 포커스된 컨트롤이 사라지거나 비활성이 되면(턴이 끝나 안내가 사라짐, 로드가 실패해 서랍이 비활성, 메뉴가 열린 채 캔버스가 바뀜) 포커스를 캔버스 region("Canvas", `tabindex=-1`)으로 옮긴다. 캔버스가 바뀐 경우에는 그 이동의 포커스 규칙을 따르고, 사라진 트리거로 되돌리지 않는다. "Stopping…"은 `disabled` 대신 `aria-disabled`라 포커스가 남는다.
- Tab 순서: 상단 바 → 사이드바 → 캔버스 헤더(서랍 → − → 배율 값 → + → 접혔을 때 Show conversation) → 보드 위(작업 안내의 Stop 또는 Open → 알림·상태 메시지의 동작 → 도구모음) → 경계 손잡이 → 패널(Hide conversation → 본문). 패널이 접혀 있으면 손잡이와 패널은 Tab 순서에서 빠진다. DOM 순서를 이에 맞춘다(ARCHITECTURE §3 'Actions and focus'의 "canvas" 안을 정한다).

### 여백(inset)과 첫 Fit

- 기준은 보드(`.area`)의 위 끝이다. Fit과 서랍·Quick Open 이동은 위 56px(헤더 높이만큼), 좌우 32px, 아래 64px(12 + 도구모음 40 + 12) 안에 프레임을 둔다. 높이가 안전 영역보다 큰 프레임은 위 inset에 맞춰 위에서부터 읽는다. 값은 `viewport.test.ts`가 고정한다.
- 첫 Fit: 지금은 `openShellCanvas`가 `controller.openCanvas`를 부르면 `load`가 그 순간의 `viewportSize()`로 Fit을 계산한다. Overview 아래에 깔린 캔버스 영역은 Overview 배치(오른쪽 280 고정)의 폭이라, 캔버스 페이지의 저장된 패널 폭이 다르거나 접혀 있으면 처음부터 잘리거나 치우친다. 첫 Fit은 Overview 덮개가 걷히고 캔버스 페이지의 열 폭이 적용된 뒤의 보드 크기로 계산한다(2026-11-01 user). 그 뒤 폭이 바뀌면 지금처럼 뷰의 왼쪽 위 기준을 유지하고 다시 맞추지 않는다.

### 오른쪽 패널: 캔버스 대화 패널 껍데기, 접기·펼치기와 폭

- 틀: 캔버스 페이지의 오른쪽 열은 캔버스 대화 패널 껍데기(새 컴포넌트)를 담는다. Overview 캔버스 대화 목록 패널의 프리미티브를 재사용한다: `aside.right.ov-right`와 제목 줄 `h2.phead.rp-head`(56px, label-sm 500, 안쪽 8/16) 그대로, 제목만 "Conversation"이다. 제목 줄 끝에 닫기 아이콘 버튼("Hide conversation", `PanelRightClose`)만 더한다. 본문은 한 줄 "Conversations about this canvas will show here."뿐이다(대화가 있든 없든 틀리지 않고, 껍데기가 대화 목록을 읽지 않는다). 헤더의 대화 드롭다운(이전 대화 찾기)은 초안의 `conversation-menu` 참고 프레임에만 있고 `buzz-canvas-conversation`이 구현한다. Overview의 오른쪽 패널(`CanvasConversations`)은 280px 고정 그대로다.
- 열기: 패널이 접혀 있을 때만 캔버스 헤더 오른쪽 끝에 "Show conversation"(`PanelRightOpen`) 아이콘 버튼이 생긴다. 두 버튼 모두 `aria-expanded`와 `aria-controls`로 패널을 가리킨다. 닫으면 포커스는 열기 버튼으로, 열면 닫기 버튼으로 간다. 접히면 캔버스 패널 오른쪽 모서리도 24px 둥글게 된다. 열기·닫기에만 짧은 전이를 걸고 끌기에는 걸지 않는다(끌기에 걸면 손잡이가 포인터를 늦게 따라간다, malmoi DESIGN '접기').
- 폭(2026-11-01 user, 창 폭 기준): 기본과 최소는 `max(320px, 28dvw)`(1238 창에서 약 347, 1440 창에서 약 403, 960 창에서 320), 최대는 `min(50dvw, 캔버스 패널이 360px 이상 남는 폭)`(1238 창에서 619, 960 창에서 356)이다. dvw는 앱 창 폭이고, 최대의 둘째 항은 측정한 셸 열(사이드바·여백을 뺀 폭)에서 계산한다. 최소가 최대보다 크면(아주 좁은 창) 최대를 쓴다. 창이 줄어 저장된 폭이 최대를 넘으면 최대로 보이되 저장값은 바꾸지 않는다.
- 구현: 워크스페이스 그리드의 세 번째 열 폭을 CSS 변수로 두고 손잡이를 직접 만든다. 라이브러리를 쓰지 않는다(§1).
- 경계 손잡이: 캔버스와 패널 사이 1px 구분선 위의 투명한 8px 띠. `role="separator"`, `aria-orientation="vertical"`, `aria-valuenow/min/max`(패널 px 폭), `aria-label="Resize conversation panel"`, `tabindex=0`. ←는 경계를 왼쪽으로 옮겨 패널을 넓히고 →는 좁힌다(16px씩). Home은 최대, End는 최소. 두 번 클릭하면 기본 폭(`max(320px, 28dvw)`)으로 돌아간다. 끌어서는 접히지 않는다(최소에서 멈추고, 접기는 버튼으로만). 끄는 중 Esc는 시작 폭으로 되돌린다. 끄는 동안에만 보드 위에 투명 덮개를 둬 캔버스 iframe이 포인터를 가져가지 않게 하고, 문서 전체에 `col-resize` 커서를 건다.
- 손잡이 모양(2026-11-01 user): malmoi `components/ui/resizable.tsx`와 그 DESIGN.md 'Resizer' 표(`~/code/malmoi` `6dcdd575`에서 읽음)의 시각을 따른다. 보이는 것은 가운데 4px `::after` 막대 하나이고, 위아래 끝이 사라지는 세로 그라디언트(투명 → `--affordance-accent` → 투명)다. 손잡이의 자체 상태 속성(`data-ui-state="hover|drag"`)일 때와 키보드 포커스일 때만 보인다. `touch-action: none`. accent는 공통 결정 2의 예외로 더한다.
- 기억: `UiState.rightPanel = { open, width }`(기기 전체, 캔버스별 아님). 공유 형식이 아닌 기기 안 ui-state라 `v`와 fixture 변경은 없다. 잘못된 값은 기본값으로 읽는다. 저장은 ui-state를 읽은 뒤에만 한다(`conversationByRoot`의 `memoryRead`와 같은 방식). 읽기 전에 저장하면 기본값이 저장값을 덮는다.

### 에이전트 작업 표시

- 참고와 출처: ego lite(citrolabs)의 에이전트 탭 표시. 사용자의 스크린샷과 설명(2026-11-01)을 따랐다. ego는 이 표시를 네이티브 `AgentTaskOverlayView`(`ego/browser/ui/views/frame/agent_task_overlay_view.cc`, 앱 바이너리 문자열로 확인)로 그려서 값을 읽지 못했다. 웹 토큰에서 읽은 값은 작업 막대 바탕 `--bg-agent-task-bar: #0009` 하나다. 공개 리포 `citrolabs/ego-lite`에는 브라우저 UI가 없다(2026-11-01 clone 확인).
- 조건: 이 캔버스의 현재 대화의 `phase`가 `running` 또는 `waiting`일 때. 현재 대화는 Overview의 캔버스 행과 같은 `sameCanvas`로 찾는다. 상태는 main의 대화 목록(`conversation:list`, `listChanged`)에서 읽으므로 다시 로드·재시작 뒤에도 같다. 목록 읽기가 한 번 성공한 뒤 일시적으로 실패하면 직전 상태를 유지하고 다음 `listChanged`가 고친다.
- 보이는 화면: 읽힌 캔버스가 있는 모든 상태(정상, 로딩, 로드 실패, 폭 없음). 에이전트가 HTML을 깨뜨린 순간에도 Stop이 필요해서다. 목록에 없는 페이지와 프로젝트 문제에서는 보이지 않는다.
- 보드 표시. 모두 `pointer-events: none`이라 선택·팬·줌을 막지 않는다.
  - 가장자리 그라디언트: 테두리 선 없이, 보드 가장자리에서 가장 진하고 약 15px 안에서 사라지는 accent 띠(안쪽 그림자 두 겹, 8px·accent 70%와 24px·accent 35%). 8초 주기로 숨쉰다(불투명도 0.55↔1). ego는 파랑이지만 doan은 accent violet을 쓴다.
  - 점 필드: malmoi KV의 `DotField`(`components/signin/dot-field.tsx`, 판정 `lib/signin/dot-field.ts`, malmoi `6dcdd575`)를 doan 코드로 다시 쓴다. 캔버스 2D, 12px 격자, 반지름 1.5→2(지름 3→4), 알파 0.08→0.3, 가상 커서 반경 320px, ㄹ자 자동 순회(320px/s, 5줄, 반경만큼 영역 밖에서 줄바꿈), 포인터는 받지 않는다. 반경 밖 점은 한 path로 묶어 한 번에 칠한다(malmoi R8, `partitionDots`). 색은 투명한 흰색(`--text-on-prominent`를 캔버스 요소의 계산된 `color`로 읽음). 동작 줄이기에서는 한 번만 그린다. 워크스페이스가 숨겨질 때(`setWorkspaceActive`), Overview가 덮을 때(`covered`), 창이 숨겨질 때 rAF 루프를 멈춘다(숨긴 화면에서는 rAF가 멈추지 않는다).
- 안내 캡슐: 움직이는 점 → 문구(`role="status"`는 문구 span에만) → 버튼 하나(sm). 일하는 중은 Stop, 응답 대기 중은 Open(2026-11-01 user).
  - 바탕: 툴팁(`.doan-tooltip`)의 `--affordance-prominent`를 60%(ego `--bg-agent-task-bar`와 같음), 글자 `--text-on-prominent`, `--blur-md` 블러, 알약 모서리, `--shadow-sm`. 투명도 줄이기에서는 불투명 검정. 캔버스 전용이고 공용 프리미티브로 올리지 않는다.
  - Stop·Open: `--text-on-prominent` 16% 채움의 흰 글자 버튼, hover 26%, 누름 34%. 공용 버튼의 hover·누름 규칙(명시도 0,4,0, 밝은 회색)이 흰 글자를 지우므로 안내 안 버튼 규칙이 그보다 무거워야 한다.
  - 점: accent 한 색(8px)이고, 2.4초 주기로 0.75배와 1.25배 사이를 오가며, 같은 주기로 accent 70% 고리가 8px까지 퍼지며 사라진다. 응답 대기와 동작 줄이기에서는 둘 다 멈춘다.
- 문구: 일함 "<Provider> is working", 응답 대기 "<Provider> needs your answer". Provider는 그 대화의 공급자 표시 이름이다. 960 창에서 패널을 최대로 넓혀도 문구가 먼저 말줄임되고 버튼은 줄지 않는다.
- Stop: 확인 없이 `interruptConversation({ conversationId })`. 누르면 "Stopping…"(`aria-disabled`)이 되고, 목록에서 그 턴이 끝날 때까지(`phase`가 `ended`) 유지한다. `interruptConversation`은 실패해도 reject하지 않고 `ConversationError`를 돌려주므로, 오류가 오면 Stop을 다시 활성으로 돌리고 공용 토스트로 알린다. 턴이 끝나면 표시 전체가 사라진다. 응답 대기 중에는 Stop이 없다. 멈추기는 대화 패널의 권한 요청에서 한다.
- Open(응답 대기 중): 패널이 접혀 있으면 펴고 패널로 포커스를 옮긴다. 펴져 있으면 패널로 포커스만 옮긴다. 그 권한 요청으로 스크롤하고 첫 선택지에 포커스를 주는 것은 `buzz-canvas-conversation`이 더한다. 그 전까지는 임시 상태줄(Stop 포함)이 캔버스 페이지에 남아 있으므로 멈추는 길은 사라지지 않는다. 접근 이름은 "Open the request".
- 답하기·실패 알림은 없다(대화 패널 몫, spec 비목표). 지금 캔버스 페이지에 뜨는 임시 상태줄은 그대로 있고, 그 상태줄에도 Stop이 있다. `buzz-canvas-conversation`이 상태줄을 대화 패널로 바꿀 때까지 둘이 함께 있다.
- 이 캔버스의 현재 대화가 실제로 일하는 상태에 닿는 경로는 좁다(PRODUCT §5 항목 1: 캔버스 대화는 아직 앱에서 이어 갈 수 없다. 승격 직후 대기열 메시지가 나가는 경우 등). 실제 앱에서 만들지 못하면 미검증으로 남긴다.

### 겹침 순서

- 아래에서 위로: 보드 → 오버레이(외곽선·치수·이동 하이라이트) → 작업 표시(그라디언트, 점 필드) → 보드 위 컨트롤(도구모음, 작업 안내, 알림) → 팝오버·메뉴 → 토스트. 캔버스 헤더는 보드 밖에 있다. 캔버스 페이지에 코멘트 핀은 없다.
- 워크스페이스의 토스트 여백(64px, POSTMORTEM 2026-10-27)은 `.zctl`이 오른쪽 아래에 있어서 생겼다. 오른쪽 아래가 비므로 16px로 돌리고, 도구모음과 겹치지 않는지 960 폭에서 잰다.

## 3. 순수 함수 (`/tdd` 대상)

| 함수 | 파일(안) | 경우 |
|---|---|---|
| `frameDrawerView(state)` | `app/src/renderer/frameDrawer.ts` | 프레임 0개("No frames"), 1개, 여럿; 지금 보는 프레임 없음/있음; 1,000개 넘는 캔버스(가장 가까운 목록 프레임); 제목 없는 프레임(id), id도 빈 프레임(`(no id)`); 중복 id(행 key); `truncated`; 렌더된 보드가 없는 다섯 상태("Frames", 비활성); 다시 로드 중(열림); 버튼 라벨과 접근 이름 |
| `zoomControlView(state)` | `app/src/renderer/zoomControl.ts` | 렌더된 보드 없음("—", 비활성); 프레임 0개(동작); 한계(0.05, 4)에서 −·+; 메뉴 항목과 단축키 표기; 50%·200%가 `zoomAt`에 넘기는 배수 |
| `fitWidth` · `fitFrame`의 inset 판 | `app/src/renderer/viewport.ts` | 위 56·좌우 32·아래 64; 안전 영역에 들어가는 프레임은 안전 영역 가운데; 안전 영역보다 큰 프레임은 위 inset에 맞춤; 크기 0 프레임; 안전 영역이 0 이하인 아주 낮은 창 |
| `panelWidth(saved, windowWidth, shellWidth)` · `nudgePanel(width, key, bounds)` | `app/src/renderer/rightPanelSize.ts` | 기본·최소 `max(320, 28%)`(960·1238·1440 창); 최대 `min(50%, 캔버스 360 남는 폭)`; 960 창의 최대(356); 최소가 최대보다 큰 창; 창이 줄 때 보이는 폭과 저장값 분리; 창이 넓어져 저장값이 새 최소보다 작을 때; ←(넓힘)/→/Home(최대)/End(최소); 두 번 클릭 초기화; 끌어서 최소 아래로 가도 최소에서 멈춤 |
| `rightPanel` 파싱 | `app/src/restore/uiState.ts` | 빠진 값, 잘못된 타입, 범위 밖 폭, 저장·읽기 왕복 |
| `dotGrid` · `dotScale` · `autoCursor` · `partitionDots` | `app/src/renderer/dotField.ts` | malmoi `lib/signin/dot-field.ts`의 경우를 doan 테스트로: 경계 포함, gap 0 이하, 반경 0, 반경 밖 기본값, ㄹ자 순회의 줄바꿈 연속성, 넘침, 안·밖 경계가 `dotScale`과 같음 |
| `agentPresence(list, canvas)` | `app/src/renderer/agentPresence.ts` | 현재 대화 없음; `running`; `waiting`; `ended`(표시 없음); 다른 캔버스의 대화; 프로젝트 대화; ID 없는 캔버스의 경로 매칭; 옮겨진 캔버스(ID 매칭); 목록 읽기 실패(직전 상태 유지, 첫 읽기 실패면 표시 없음); 공급자 이름과 문구; 목록에 없는 페이지·프로젝트 문제(표시 없음) |

## 4. 형식·규칙·결정 영향

- **형식 변경**: 없다. JSON Schema, `v`, CLI 응답, 앱 소켓 메시지는 그대로다. 캔버스 스크립트 메시지도 새로 생기지 않는다(`pick-frame`은 이미 있다). ui-state에 `rightPanel`이 더해지지만 공유 형식이 아니다.
- **규칙(ARCHITECTURE §1 Conventions, `doan check`)**: 없다.
- **구조 결정**: ARCHITECTURE §3 'Canvas view'의 고정값 "fit and frame-jump margin 32px"가 inset으로 바뀐다. 서빙 범위, sandbox iframe, 줌·팬을 iframe 밖 transform으로 하는 결정은 그대로다.
- **제품 결정**: PRODUCT §3·§4·§5 항목 2–5가 바뀐다(tasks Z1). 부모 공통 결정 2(accent 예외)와 6(보존 예외)이 바뀐다(tasks Z4).
- **PoC**: 필요 없다. `selectFrame`·`pick-frame`·`interruptConversation`·대화 목록은 구현돼 있다. 점 필드는 malmoi에서 같은 방식(캔버스 2D, 점 1만 3천 개까지 묶어 칠함)이 출하돼 있다. 실제 앱에서 서랍 경로를 처음 부르므로 `/runtime-test`에서 `doan active`까지 확인한다.

## 5. 문구 (영어, Doan clarify 프리셋을 읽고 정함)

- 서랍 버튼 접근 이름: "Frame 3: Payment" / 비활성: "Frames", "No frames"
- 잘린 목록 안내: "Showing the first 1,000 frames. Search all with Quick Open (⌘K)."
- 배율 메뉴: "Fit", "100%", "50%", "200%"; 트리거 접근 이름 "Zoom 64%, zoom options"
- 툴팁: "Select", "Zoom out ⌘−", "Zoom in ⌘=", "Hide conversation", "Show conversation"
- 손잡이 접근 이름: "Resize conversation panel"
- 작업 안내: "<Provider> is working", "<Provider> needs your answer", "Stop", "Stopping…"
- 대화 패널 빈 본문: "Conversations about this canvas will show here."
- 출하된 상태 문구(로드 실패, 폭 없음, 목록에 없는 페이지, 프로젝트 문제, 선택 잃음)는 그대로 쓴다.

## 6. POSTMORTEM에서 온 함정

- **2026-10-27 — Shell restyle lost navigation landmarks …(Recurrence: unlocked integration)**: 셸 inset을 바꾸자 `.zctl`이 토스트와 2px 겹쳤다. 컨트롤을 옮길 때 의존하는 표면(토스트, 알림, 작업 안내)의 실제 사각형을 960·1238 폭에서 함께 잰다. `rg -n 'toast|zctl' app/src/renderer/styles.css`.
- **2026-10-26 — A reloaded canvas stayed 150 px tall when its iframe was off-screen**: 서랍 이동이나 Fit 뒤 다시 로드할 때 iframe 위쪽이 화면 밖일 수 있다. 이동은 `measure`를 당겨서 다음 layout을 쓰는 기존 `jump` 경로를 그대로 쓴다. rAF에만 기대는 새 후속 메시지를 만들지 않는다.
- **2026-10-26 — A reload that never laid out left a new comment unblocked**: 서랍·배율의 비활성 조건은 `status === "loading"`만 보지 말고 `CanvasState.reloading`과 `failed`도 본다. 다시 로드 중에는 서랍을 열어 두고 id 확인에 맡긴다.
- **2026-10-25 — Navigation feedback read the previous React snapshot**: 서랍이 렌더한 프레임 목록과 고른 순간의 `layout`이 다를 수 있다. 그래서 `selectFrame(index, id)`로 id를 함께 넘긴다(위 '프레임 서랍').
- **2026-10-25 — Production CSS extraction concealed missing development styles**: 새 CSS는 개발과 프로덕션 빌드 모두에서 대표 요소의 computed style로 확인한다. iframe의 `prefers-color-scheme`과 computed `color-scheme`을 따로 본다.
- **2026-10-30 — Removing a shared dialog class silently disabled two focus guards**: `.zctl`, `.zoom`, `.canvas-notice`, `.updated`, `bottomLabel`을 지우거나 이름을 바꿀 때 셀렉터·이름 문자열 검색으로 다른 사용처(포커스 가드, 테스트, runtime 지원, 측정 스크립트)를 찾는다.
