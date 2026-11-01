# buzz-canvas — design

## 0. 초안

`/design-draft`가 새 파일 `.doan/canvases/buzz-canvas.html`을 그린다(부모 공통 결정 11). 기존 `app-shell.html`·`select-inspect.html`·`revision-continuity.html`은 이력으로 두고 고치지 않는다. 프레임은 전체 창(1238×780, 사이드바 220px, 오른쪽 패널은 지금의 280px Inspector/Comments 자리를 회색 블록으로) 단위로 그린다.

| 프레임 | 내용 |
|---|---|
| `board-options` | 보드 바탕 시안 2–3개를 나란히(예: 패널 안 `--surface-inset` 무늬 없음, `--surface-inset` + 16px 점, 흰 Panel 그대로). 흰 바탕 캔버스와 어두운 캔버스를 각각 줌아웃해서 보드 경계가 보이는지 비교한다. 사용자가 하나를 고르면 나머지는 지운다 |
| `default` | 캔버스를 연 직후(Fit). 서랍 닫힘, 배율 컨트롤러, 도구모음(피커 눌림), 변경 표시 |
| `frame-selected` | 프레임 선택 외곽선과 치수 캡슐 |
| `element-hover` | 요소 hover(점선)와 요소 선택(실선)이 함께 |
| `drawer-open` | 서랍 팝오버. 지금 보는 프레임 표시, hover·키보드 포커스 행, 제목 없는 프레임(id), 긴 제목 말줄임, 목록 스크롤 |
| `drawer-truncated` | 1,000개를 넘는 캔버스의 목록 끝 안내 |
| `zoom-menu` | 배율 메뉴(Fit ⌘1, 100% ⌘0, 50%, 200%) |
| `no-frames` | 프레임이 없는 캔버스: 서랍과 배율 컨트롤러의 비활성 모습 |
| `states` | 로딩, 로드 실패(Reload), 폭 없음, 목록에 없는 페이지, 프로젝트 문제 메시지 |
| `notices` | 선택 잃음 알림, 오류 알림, 토스트가 동시에 뜬 모습 |
| `on-dark` · `on-violet` | 어두운 캔버스, violet이 많은 캔버스 위의 선택·hover·이동 하이라이트(부모 design '조사 메모: 캔버스 영역') |
| `narrow` | 960×600. 서랍의 긴 이름이 먼저 줄어드는지, 컨트롤·알림·토스트가 겹치지 않는지 |

참고: Buzz에는 캔버스 화면이 없다. 컨트롤 모양은 Buzz의 공용 프리미티브(버튼, 메뉴, 팝오버, 툴팁)와 doan 공용 컴포넌트(`ds/controls.css`, `ds/surfaces.css`)에서 가져오고, 새 프리미티브를 만들지 않는다. 그 밖의 디자인 도구를 참고하면 출처를 이 절에 적는다(AGENTS.md 'Leave evidence for references').

## 1. 영향 범위

- **app renderer만** 바뀐다. main, preload, CLI, 스킬, 형식은 바뀌지 않는다.
  - `App.tsx`의 `CanvasPane`: 서랍, 배율 컨트롤러, 도구모음, 알림, 상태 메시지, 변경 표시의 마크업. `.zctl` 띠와 Reload 버튼을 지운다.
  - `CanvasController.ts`: 서랍이 쓰는 `selectFrame(index)`는 이미 있다(이동 + `pick-frame` + 초안 가드 `transition`). 지금 호출하는 곳이 없으므로 서랍이 처음 쓰는 곳이 된다. 배율 메뉴의 50%·200%를 위해 `zoomTo(scale)`(뷰 가운데 기준)을 더한다. Fit·이동·locate가 쓰는 여백을 새 inset으로 바꾼다.
  - `viewport.ts`: `fitWidth`·`fitFrame`·`locateView`가 사방 같은 `margin` 대신 위·오른쪽·아래·왼쪽 inset을 받는다.
  - `styles.css`: `.area`, `.mark`, `.dims`, 프레임 이동 하이라이트, `.canvas-status`, `.canvas-notices`/`.canvas-notice`, `.updated`, `.zctl`/`.zoom` 규칙을 새 컨트롤 규칙으로 바꾼다. 새 클래스는 `doan-` 접두어를 쓴다(공통 결정 9).
- **View 메뉴**(`app/src/main/index.ts`)와 `ViewCommand`는 그대로다. 배율 메뉴의 Fit·100%는 같은 명령(`fit`, `actualSize`)을 부른다.
- **선택 경로**: 서랍의 선택은 `pick-frame` → 캔버스 스크립트의 `select` → 기존 `selection:set`이다. `doan active`, 선택 수명, 앵커 규칙(ARCHITECTURE §3 'Selection and inspector')은 바뀌지 않는다.

## 2. 컨트롤 규칙

### 프레임 서랍

- 버튼: 지금 보는 프레임(`CanvasState.currentFrame`)의 이름(`frameLabel` — 제목, 없으면 id), 위치 `n/N`, ▾. 접근 이름은 "Frame: <이름>, <n> of <N>". 지금 보는 프레임이 없으면(프레임 0개) 버튼은 비활성이고 "No frames"를 보인다. 로딩·실패·폭 없음·목록에 없는 페이지에서도 비활성이다.
- 목록: Radix 팝오버에 roving tabindex 목록. 행은 `layout.frames` 순서(문서 순서)이고 번호와 이름을 보인다. 지금 보는 프레임 행에 표시가 있고, 목록을 열면 그 행이 보이도록 스크롤하고 그 행에 포커스를 둔다. 긴 이름은 말줄임하고 전체 이름을 `title`로 둔다. `layout.truncated`면 목록 끝에 "Showing the first 1,000 frames. Use Quick Open (⌘K) to search." 같은 안내를 둔다(문구는 초안에서 확정, 아래 '문구').
- 행을 고르면(클릭, Enter, Space) 목록을 닫고 `controller.selectFrame(index)`를 부른다. 초안 가드가 거절하면 이동도 선택도 일어나지 않는다(기존 `transition` 규칙).
- 지금 보는 프레임이 바뀌어도 열린 목록의 포커스는 움직이지 않는다. 표시만 따라간다.

### 배율 컨트롤러

- − · 배율 값(메뉴 트리거) · + 순서다. 값은 지금처럼 정수 %이고, 프레임이 없으면 "—"와 함께 모두 비활성이다.
- 메뉴: Fit(⌘1), 100%(⌘0), 50%, 200%. 단축키 표기는 View 메뉴와 같다. 50%·200%는 `zoomTo(0.5)`·`zoomTo(2)`이고 뷰 가운데를 고정한다(−·+와 같은 기준).
- Reload 버튼은 없다. ⌘R, View > Reload Canvas, 로드 실패 화면의 Reload가 남는다.

### 도구모음

- 하단 가운데, 아이콘 버튼 한 줄. 이번에는 선택 피커 하나다: `aria-pressed="true"`, 툴팁 "Select". 누르면 아무것도 바뀌지 않는다(이미 기본 도구). 도구가 하나뿐이어도 다음 자식이 버튼을 더할 수 있도록 줄 컨테이너를 쓰되, 빈 자리나 숨긴 버튼은 두지 않는다.

### Esc와 포커스

- 서랍·배율 메뉴가 열린 채 Esc를 누르면 메뉴만 닫는다. App의 Esc 선택 해제(ARCHITECTURE §3 'Clear and keyboard')가 같은 키에 반응하지 않아야 한다. 메뉴의 Esc 처리에서 전파를 멈추거나, App의 Esc 처리가 열린 Radix 메뉴 안의 키를 건너뛴다(구현에서 고르되 테스트로 고정한다).
- 메뉴를 닫으면 포커스는 연 버튼으로 돌아온다. 서랍에서 프레임을 고른 뒤에도 서랍 버튼으로 돌아온다.
- Tab 순서는 상단 바 → 사이드바 → 캔버스 영역(서랍 → 배율 컨트롤러 → 도구모음) → 오른쪽 패널이다(ARCHITECTURE §3 'Actions and focus'의 "canvas" 안을 정한다).

### 여백(inset)

- Fit, 서랍·Quick Open 이동, 코멘트 locate는 위 inset(서랍·배율 컨트롤러 아래 끝 + 간격)과 아래 inset(도구모음 위 끝 + 간격) 안에 프레임을 둔다. 좌우는 지금처럼 32px다. 값은 초안에서 정하고 `viewport.test.ts`가 고정한다.
- 높이가 안전 영역보다 큰 프레임은 지금처럼 위에서부터 읽는다(위 inset에 맞춤).

### 겹침 순서

- 아래에서 위로: 보드 → 오버레이(외곽선·치수·이동 하이라이트) → 코멘트 핀 → 컨트롤(서랍·배율·도구모음)·알림·변경 표시 → 팝오버·메뉴 → 토스트. 포커스된 핀은 지금처럼 컨트롤 아래다(DESIGN 'Comments' Pins).
- 워크스페이스의 토스트 여백(64px, POSTMORTEM 2026-10-27)은 `.zctl`이 오른쪽 아래에 있어서 생겼다. 오른쪽 아래가 비면 다시 정하되, 도구모음과 겹치지 않는지 960 폭에서 잰다.

## 3. 순수 함수 (`/tdd` 대상)

| 함수 | 파일(안) | 경우 |
|---|---|---|
| `frameDrawerView(state)` | `app/src/renderer/frameDrawer.ts` | 프레임 0개, 1개, 여럿; 지금 보는 프레임 없음/있음; 제목 없는 프레임(id), id도 빈 프레임(`(no id)`); `truncated`; 로딩·실패·폭 없음·목록에 없는 페이지에서 비활성과 이유; 버튼 라벨과 접근 이름 |
| `zoomControlView(state)` | `app/src/renderer/zoomControl.ts` | 프레임 없음("—", 비활성); 한계(0.05, 4)에서 −·+ 활성 여부(지금 동작 유지); 메뉴 항목과 단축키 표기 |
| `fitWidth` · `fitFrame` · `locateView`의 inset 판 | `app/src/renderer/viewport.ts` | 위·아래 inset이 다를 때 Fit의 y; 안전 영역에 들어가는 프레임은 안전 영역 가운데; 안전 영역보다 큰 프레임은 위 inset에 맞춤; 크기 0 프레임; 안전 영역이 0 이하인 아주 낮은 창 |
| `zoomTo(view, scale, center, limits)` | `viewport.ts` | 50%·200%; 한계 밖 값은 한계로; 가운데 점 고정 |

## 4. 형식·규칙·결정 영향

- **형식 변경**: 없다. JSON Schema, `v`, CLI 응답, 앱 소켓 메시지는 그대로다. 캔버스 스크립트 메시지도 새로 생기지 않는다(`pick-frame`은 이미 있다).
- **규칙(ARCHITECTURE §1 Conventions, `doan check`)**: 없다.
- **구조 결정**: ARCHITECTURE §3 'Canvas view'의 고정값 "fit and frame-jump margin 32px"가 inset으로 바뀐다. 승격 때 고친다. 서빙 범위, sandbox iframe, 줌·팬을 iframe 밖 transform으로 하는 결정은 그대로다.
- **제품 결정**: PRODUCT §5 항목 3의 "Frame jumps are available through Quick Open"에 서랍(이동하고 선택함)이 더해진다. "The sidebar has no frame rows"는 그대로다. 항목 2의 줌 컨트롤 서술, 항목 4의 "an ordinary click selects"는 그대로다.
- **PoC**: 필요 없다. `selectFrame`과 `pick-frame`은 구현돼 있고 단위 테스트가 있다(`CanvasController.test.ts`). 실제 앱에서 이 경로를 서랍으로 처음 부르므로 `/runtime-test`에서 `doan active`까지 확인한다.

## 5. 문구 (영어, Doan clarify 프리셋으로 다듬음)

초안 단계에서 `go run ./cli/cmd/doan design-skill clarify --json`을 읽고 확정한다. 후보:

- 서랍 버튼 접근 이름: "Frame: Sign in, 3 of 12" / 비활성: "No frames"
- 잘린 목록 안내: "Showing the first 1,000 frames. Search all with Quick Open (⌘K)."
- 배율 메뉴: "Fit", "100%", "50%", "200%"; 트리거 접근 이름 "Zoom 64%, zoom options"
- 피커 툴팁: "Select"

## 6. POSTMORTEM에서 온 함정

- **2026-10-27 — Shell restyle lost navigation landmarks …(재발: unlocked integration)**: 셸 inset을 바꾸자 `.zctl`이 토스트와 2px 겹쳤다. 컨트롤을 옮길 때 의존하는 표면(토스트, 핀, 알림)의 실제 사각형을 960·1238 폭에서 함께 잰다. `rg -n 'toast|zctl' app/src/renderer/styles.css`.
- **2026-10-26 — A reloaded canvas stayed 150 px tall when its iframe was off-screen**: 서랍 이동이나 Fit 뒤 다시 로드할 때 iframe 위쪽이 화면 밖일 수 있다. 이동은 `measure`를 당겨서 다음 layout을 쓰는 기존 `jump` 경로를 그대로 쓴다. rAF에만 기대는 새 후속 메시지를 만들지 않는다.
- **2026-10-26 — A reload that never laid out left a new comment unblocked**: 서랍의 비활성 조건은 `status === "loading"`만 보지 말고 `CanvasState.reloading`과 `failed`도 본다. 다시 로드 중에는 이전 layout의 프레임 목록이 남아 있으므로 서랍을 열 수 있게 둘지, 막을지 초안에서 정하고 `frameDrawerView`가 고정한다.
- **2026-10-25 — Navigation feedback read the previous React snapshot**: 서랍이 렌더한 프레임 목록과 고른 순간의 `layout`이 다를 수 있다. `selectFrame`은 index와 id를 함께 확인하므로(`pick-frame`) 서랍은 행의 index만 넘기지 말고 id가 같은지 확인되는 경로를 쓴다(이미 `transition`의 두 번째 인자가 확인한다).
- **2026-10-25 — Production CSS extraction concealed missing development styles**: 새 CSS는 개발과 프로덕션 빌드 모두에서 대표 요소의 computed style로 확인한다. iframe의 `prefers-color-scheme`과 computed `color-scheme`을 따로 본다.
- **2026-10-30 — Removing a shared dialog class silently disabled two focus guards**: `.zctl`, `.zoom`, `.canvas-notice`, `.updated`를 지우거나 이름을 바꿀 때 셀렉터 문자열 검색으로 다른 사용처(포커스 가드, 테스트, e2e 지원, 측정 스크립트)를 찾는다. `grep -rn "zctl\|\.zoom\b\|canvas-notice\|\.updated\b" app/src app/runtime`.
