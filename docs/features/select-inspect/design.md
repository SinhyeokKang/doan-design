# select-inspect — design

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 형식 (`schema/`) | 런타임 파일 `runtime.v1`, 소켓 메시지 `app-socket.v1`을 새로 둔다. 각 스키마에 절대 `$id`를 붙인다. `comment-event.v1`의 `target.element` 정의만 `$defs`로 옮겨 소켓 스키마가 `$ref`로 함께 쓴다(받아들이는 문서는 같으므로 `v`는 그대로) |
| 스키마 로더 (`app/src/formats`, `cli/internal/formats`) | 모든 스키마를 먼저 등록한 뒤 컴파일한다. Go는 외부 파일을 읽지 않게 로더를 막는다 |
| 캔버스 스크립트 (`app/src/main/canvasScript.ts`) | hover · 클릭 선택, 키 전달, 앵커(선택자 · html · text · 조상 경로), 인스펙터 값 수집, 앵커로 다시 선택, 선택 사각형 다시 보내기(`scroll` 포함) |
| 앱 main (`index.ts`) | 단일 인스턴스, 유닉스 소켓 서버, `runtime.json` 쓰기 · 지우기, 선택 저장소(앱 전체에 하나), IPC `selection:set` |
| 앱 preload | `setSelection(selection \| null)` 하나를 더한다 |
| 앱 renderer | `CanvasController`가 오버레이(hover · 선택 표시 · 치수)를 명령형으로 그린다. 오른쪽 패널 인스펙터(React). Frames 목록의 `pickedFrame`을 선택으로 바꾼다 |
| CLI (Go) | `doan active`, 런타임 파일 읽기, 소켓 클라이언트, `Context` 확장, 종료 코드 3 계열 |
| `doan mcp` | `active` 도구(`repo?`) |
| 스킬 본문 (`cli/internal/cli/skill.md`) | 규칙 C 복원, 명령 표와 MCP 표에 `active`, `active`의 `html` · `text`도 데이터 |
| `design/` | Codex가 그린 초안 캔버스(아래 '초안 요청') |

## 흐름

### 1. 입력 (캔버스 스크립트)

- 스크립트는 캡처 단계에서 `isTrusted`인 포인터 이벤트만 다룬다. 캔버스 스크립트가 스스로 부른 `el.click()`은 그대로 지나간다. 그래서 기존 e2e의 `clickLink`(`app/e2e/runtime.ts:922`, `link.click()`)도 지금처럼 링크를 따라간다.
- ⌥ 없는 `pointerdown` · `mousedown` · `click` · `dblclick`은 기본 동작과 전파를 막는다. 막아야 텍스트 드래그 선택, 입력 칸 포커스, `:focus` 스타일이 생기지 않는다. 더블클릭은 클릭과 같다. 오른쪽 클릭(두 손가락 탭, Ctrl-클릭)은 선택을 바꾸지 않는다(#7 컨텍스트 메뉴 자리).
- ⌥클릭은 막지 않고 선택도 바꾸지 않는다(2026-10-22 사용자, Q1). Chromium이 ⌥클릭한 링크를 다운로드로 처리하면 sandbox(`allow-downloads` 없음)가 막아 아무 일도 없을 수 있다. tasks 0에서 실제 마우스로 확인하고, 그렇다면 ⌥클릭한 `a[href]`만 스크립트가 `preventDefault` 뒤 `location.assign(href)`로 이동시킨다. 이 이동도 그대로 `will-frame-navigate` 관문을 지난다(ARCHITECTURE §3).
- 클릭 대상이 요소이면 `select`를 보낸다. 대상이 `html` · `body`(프레임 밖 빈 곳)이면 `clear`를 보낸다. 대상이 `[data-doan-frame]` 요소 자체(자식이 아닌 빈 영역)이면 프레임 선택이다. SVG 안의 요소는 그 요소, shadow DOM 안이면 host, 캔버스 안 중첩 iframe은 iframe 요소 자체가 선택된다(안에는 스크립트가 없다).
- **키 전달**: 캔버스를 클릭하면 포커스가 iframe으로 가서 앱 renderer의 `keydown`이 Esc를 받지 못한다. 스크립트가 편집 가능한 요소(`input` · `textarea` · `select` · contenteditable) 밖에서 눌린 Esc를 `key {key: "Escape"}`로 보내고, renderer는 자기 `keydown`과 같은 처리로 받는다. 메뉴 accelerator로 두지 않는다: 앱 전체의 Esc를 가로채 Radix 툴팁 닫기와 #7 작성 취소를 깨고, Playwright 키가 닿지 않는다(PoC 1 항목 4). #7 단축키도 이 채널을 쓴다.

### 2. hover

- `pointermove`를 rAF로 묶어 `hover {href, seq, viewport, rect | null}`을 보낸다. 포인터가 iframe 밖으로 나가면(`pointerleave`) `null`이다.
- 휠 팬 · 확대 중에는 hover를 숨기고 다음 `pointermove`에서 다시 보인다(커서 아래 요소가 바뀌어도 `pointermove`가 오지 않는다). ⌥를 누르고 있으면(`altKey`) hover를 숨겨 지금은 캔버스 동작이라는 것을 보인다. 선택된 요소 위에서는 선택 표시만 보인다.
- 커서 모양은 캔버스 CSS 그대로 둔다(캔버스 DOM을 건드리지 않는다).

### 3. 표시는 화면 좌표 오버레이 (renderer)

- hover · 선택 사각형과 치수 라벨(`252 × 32`)은 iframe 밖 `.overlay`에 그린다. 지금 `.overlay`는 `.board`의 형제로 transform 밖에 있다(`App.tsx`, `styles.css`). ARCHITECTURE §3의 "board wrapper holding [iframe, overlay]"는 낡은 설명이라 승격 때 고친다.
- 캔버스 DOM에 넣지 않는 이유: 스크립트 자신의 MutationObserver가 `layout`을 다시 보내고, 인스펙터가 읽는 계산값과 `html` 앵커도 오염된다.
- `CanvasController`가 보드 좌표 사각형을 화면 좌표로 바꿔 `applyView`에서 동기로 그린다. 선은 1px, 라벨 글자 크기는 배율과 무관하다. 치수 라벨의 숫자는 캔버스 CSS px다. React는 오버레이를 그리지 않는다(일반 휠 팬은 React를 다시 그리지 않는다, ARCHITECTURE §3).

### 4. 사각형과 메시지 순서

- 사각형은 iframe 상자 기준 좌표(`getBoundingClientRect` 그대로)다. 캔버스 문서가 iframe 안에서 스크롤되는 경우(높이 상한 · 고정)에도 보이는 위치와 맞는다. PoC 3에서 보드 좌표 사각형은 배율과 무관하게 0.563px 안에서 맞았다.
- 스크립트는 선택한 요소를 기억하고, `layout`을 보낼 때마다 그 사각형을 `selected?: rect`로 함께 보낸다. 다시 보내는 계기에 캡처 단계 `scroll`을 더한다(캔버스 안 스크롤러는 canvas-view Q3로 스크롤된다).
- 렌더러 → 스크립트 메시지(`select-anchor` · `clear` · `pick-frame`)는 `seq`를 싣는다. 스크립트는 `select` · `hover` · `layout.selected`에 마지막으로 받은 `seq`를 되돌려 주고, 렌더러는 현재 `seq`가 아닌 메시지를 버린다. 사람이 캔버스에서 클릭하면 스크립트가 `seq`를 올려 보낸다. 이렇게 막는 경우: Esc 뒤 이미 오던 `layout.selected`가 선택을 되살림, 사람이 클릭한 뒤 도착한 `select-anchor` 응답이 클릭을 덮음.
- 모든 메시지는 `href`와 `viewport`를 싣고, 렌더러는 지금 문서가 아니거나 `viewport`가 현재 iframe 높이와 1px 넘게 다르면 버린다(`layoutHeight`와 같은 규칙).
- 요소가 DOM에서 빠지면 스크립트는 같은 앵커로 한 번 다시 찾는다(프레임워크가 노드를 바꿔 끼운 경우). 그래도 없으면 `selected: null`을 보내고 렌더러는 선택을 푼다.

### 5. 프레임 선택과 Frames 목록

- Frames 목록에서 프레임을 누르거나 Enter를 치면 지금처럼 이동하고 그 프레임이 선택된다(`pick-frame {seq, index, id}`; 스크립트는 그 index의 요소 id가 `id`와 같을 때만 `select`로 답한다).
- 프레임은 렌더된 DOM 기준이다(2026-10-22 사용자, Q2; PRODUCT §8 질문을 닫는다). 앱 Frames 목록과 같은 출처이고, 스크립트가 그린 프레임도 고를 수 있다. 그래서 `doan active`의 프레임 id가 `doan ls` 프레임에 없을 수 있고, 스킬 본문이 그 경우를 설명한다.
- 요소를 선택하면 가장 가까운 `[data-doan-frame]` 조상이 함께 실린다. 1,000개 상한(`layout.frames`) 밖의 프레임 안 요소도 프레임 id를 싣는다.
- `pickedFrame`(지금 `Sidebar.tsx`의 `aria-current`)을 선택으로 바꾼다(2026-10-22 사용자, 리뷰 R3). 프레임 행의 `aria-current`는 "선택된 프레임, 또는 선택된 요소를 감싼 프레임"이다. 선택된 요소는 그 프레임 아래 하위 행으로 보인다. 선택을 풀면 표시도 사라진다.

### 6. 다시 불러오기와 앵커로 선택

- 같은 캔버스를 다시 불러오면(라이브 리로드 · ⌘R) 렌더러가 새 문서의 첫 `layout` 뒤에 `select-anchor {seq, frame?, doanId?, selector?}`를 보낸다. 스크립트는 `data-doan-id`(문서에 하나뿐일 때) → 선택자 순서로, 프레임은 프레임 id로 찾는다(2026-10-22 사용자, Q3).
- 스크립트가 그린 요소는 첫 `layout` 때 아직 없을 수 있다. 그래서 못 찾으면 바로 포기하지 않고 `load` · `fonts.ready` 뒤와 첫 `layout`부터 1초까지의 `layout`마다 다시 찾는다. 그래도 없으면 `select null`로 답하고 렌더러는 선택을 푼다.
- 선택을 못 찾아 풀리면 canvas notice 줄에 "The selected element is no longer in the canvas."를 다음 선택이나 캔버스 바뀜까지 보인다.
- 다른 캔버스로 가면 다시 찾지 않고 푼다. 이 메시지 이름을 `select-anchor`로 짓는 이유: #7에서 코멘트 목록의 대상을 선택하고 그곳으로 갈 때 그대로 쓴다.

### 7. 상태별 선택

| 상태 | 선택 표시 | 선택 | 패널 |
|---|---|---|---|
| 다시 불러오기 시작 ~ `select-anchor` 응답 | 숨김 | 유지 | 직전 값 유지 |
| 다시 찾기 실패 | — | 해제 | Canvas, notice 줄 |
| 5초 로드 실패 | — | 해제 | Canvas |
| 일시 오류(`errorLine`, 화면 유지) | 유지 | 유지 | 유지 |
| 목록에 없는 문서 · 다른 캔버스 열기 · 캔버스 닫힘 | — | 해제 | Canvas 또는 빈 패널 |
| 프로젝트 닫힘 · Not found · Not initialized | — | 해제 | 빈 패널 |
| 창 숨김 | 유지 | 유지 | 유지 |
| renderer 다시 불러옴 · 죽음 | — | main이 해제 | — |

### 8. 오른쪽 패널

- 선택 없음: 지금 Canvas 패널 그대로(region 이름 "Canvas info"). 빈 줄 안내 "Click an element or frame to inspect it. Frames are also listed in the sidebar." #7에서 캔버스 코멘트가 아래에 붙는다.
- 요소 선택: 머리(태그 · 선택자 · 프레임 · 조상 경로), 인스펙터 섹션, (#7) 그 요소의 코멘트. Canvas 정보는 숨긴다. region 이름 "Inspector".
- 프레임 선택: 머리(id · title · implements), 그 프레임 요소의 인스펙터.
- **조상 경로**(2026-10-22 사용자, 리뷰 R4): `hero › form › button › span`. 각 항목은 버튼이고, 누르거나 Enter를 치면 그 조상이 선택된다(`select-anchor`). 경로는 가장 가까운 프레임까지, 프레임이 없으면 `body` 바로 아래까지이고 최대 32개다.
- 상호작용 요소(`a` · `button` · `input` · `select` · `textarea` · contenteditable)를 선택했을 때만 머리에 "⌥-click to follow this link" 또는 "⌥-click to use it"을 보인다.
- 긴 값은 한 줄 말줄임과 툴팁(전체 값). 패널 텍스트는 선택해 ⌘C로 복사할 수 있다. 토큰이 다른 토큰을 가리키면 선언에 쓴 이름을 보이고 사슬은 툴팁에 둔다. `border-width`가 0이면 border 색은 "—"다. 상태는 색만이 아니라 텍스트로도 보인다(접근성, e2e가 이름으로 읽음).
- 영어 문구 제안(초안이 정본): "Hardcoded", "Unknown source"(툴팁 "Set by a stylesheet doan can't read, such as a CDN"), "Default", "Inherited from <tag>", "Hover state".

### 9. 키보드

- Tab 순서는 지금처럼 위 막대 → 사이드바 → 캔버스 → 오른쪽 패널이다(PRODUCT §7 app-ui).
- 키보드로 닿는 것: Frames 목록의 프레임 선택(Enter), 조상 경로, Esc 해제. 캔버스 안 요소를 키보드만으로 고를 수는 없다(비목표).
- 캔버스를 클릭한 뒤에는 포커스가 iframe에 있어 Tab이 캔버스 안의 링크와 입력 칸을 먼저 돈다. 한계로 둔다.

### 10. 인스펙터 값 (PoC 2가 확정)

- 선택할 때 한 번 모은다(이후 페이지 스크립트가 바꾼 값은 다시 선택해야 반영된다). 계산값은 `getComputedStyle`이다.
- 토큰 이름 찾기(ARCHITECTURE §3 결정: 스크립트가 모은다): 시트의 규칙 중 `el.matches(rule.selectorText)`인 것과 `style` 속성에서 그 속성의 선언을 모은다. 각 선언값의 `var(--x)`를 그 요소의 계산된 사용자 속성으로 풀어 계산값과 대조하고, 일치하는 후보가 하나면 그것, 여럿이면 cascade 순서(`!important` → specificity → 순서)로 가른다. 직접 specificity 파서를 짜는 비용을 줄이려는 것이다. 상속 속성(글자색 · 글꼴)은 요소에 선언이 없으면 조상으로 올라간다("Inherited from <tag>").
- **읽을 수 없는 시트**: 캔버스 문서의 origin이 `null`이라 로컬 `<link>` 시트도 `cssRules`가 `SecurityError`일 수 있다. 그러면 스크립트가 `fetch(sheet.href)`로 읽고(범위 안 200 응답에는 `ACAO: null`이 있어 읽힌다, PoC 4) `new CSSStyleSheet().replaceSync(text)`로 파싱한다. `@import`는 같은 방식으로 따라간다. "알 수 없음"은 그래도 읽을 수 없는 시트(CDN 등)가 이겼을 수 있을 때만이다.
- 표시 상태는 넷이다(2026-10-22 사용자, 리뷰 R2): 토큰(`--brand` → `#4f46e5`), 하드코딩(작성자 선언이 리터럴), 알 수 없음, 기본값(작성자 선언 없음; 표시 없이 흐린 값).
- 클릭 순간 대상은 `:hover`(경우에 따라 `:active`) 상태다. 이긴 선언의 선택자에 상태 의사 클래스가 있으면 그 행에 "Hover state"를 붙인다. PoC 2가 이 방식으로 충분한지 본다.
- PoC 2는 위 방식과 CDP `CSS.getMatchedStylesForNode`(`webContents.debugger`)의 결과를 같은 사례에서 비교한다. 스크립트 방식이 기준을 못 넘으면 멈추고 사용자에게 묻는다(CDP로 바꾸면 ARCHITECTURE §3 결정이 바뀐다).

### 11. 선택 저장소 (main)

- 선택은 앱 전체에 하나다(2026-10-22 사용자, 리뷰 R1). 렌더러가 선택이 바뀔 때마다 IPC `selection:set(selection | null)`을 보낸다. selection의 `root`(프로젝트 경로)와 `canvas.path` · `canvas.id`는 캔버스 메시지가 아니라 렌더러 상태(main이 보낸 `CanvasRow`)에서 채운다.
- main은 발신 프레임을 지금의 IPC와 같이 확인하고, `app-socket.v1`의 selection 스키마로 검증한 뒤 메모리에 하나만 둔다. 그 프로젝트가 닫히거나, renderer가 다시 불러와지거나 죽으면(`render-process-gone`, main frame 재탐색) 지운다.
- 창이 숨어 있어도 main이 답하므로 `doan active`는 창 없이도 동작한다(app-ui 창 수명주기).
- PRODUCT §7(2026-10-21) "`active` is per folder"와 ARCHITECTURE §13 "the frame or element the human last selected in that folder"는 "지금 선택이 그 프로젝트의 것일 때만 돌려준다"로 바뀐다. 승격 때 고친다.

### 12. 런타임 파일과 소켓 (main)

- 앱은 `app.requestSingleInstanceLock()`으로 하나만 뜬다. 두 번째 실행은 첫 앱의 창을 보이고 끝난다. 그래서 `runtime.json`을 두 인스턴스가 덮어쓰지 않는다.
- 소켓은 `mkdtemp(<tmpdir>/doan-)`(0700) 안에 연다. userData 아래에 두지 않는 이유: macOS `sun_path`는 104바이트이고, e2e의 임시 `--user-data-dir`는 이를 넘을 수 있다.
- 토큰은 `randomBytes(32)` hex다. `<userData>/runtime.json`(0600, 임시 파일에 쓰고 이름 바꾸기)에 `{v: 1, socket, token}`을 적는다. 버전은 `v` 하나다.
- 연결마다 요청 한 줄(상한 64 KiB)을 받고 응답 한 줄을 보낸 뒤 닫는다. 2초 안에 줄이 오지 않으면 닫는다. 토큰은 길이가 같은지 먼저 보고 `timingSafeEqual`로 비교한다(길이가 다르면 예외가 난다).
- 앱을 끝낼 때(`will-quit`) 동기로 지운다: 소켓, 그리고 `readFileSync`로 내용이 자기 것인지 확인한 `runtime.json`. 비동기 정리는 프로세스가 먼저 끝날 수 있다(지금 `void shell?.dispose()`).

### 13. `doan active` (Go)

- 저장소를 지금처럼 찾는다(`--repo` 또는 위로 탐색).
- 런타임 파일은 `DOAN_RUNTIME`(절대 경로)이 있으면 그 파일, 없거나 빈 문자열이면 `~/Library/Application Support/doan/runtime.json`이다(2026-10-22 사용자, Q4). 상대 경로는 `usage_error`다. 앱이 `--user-data-dir`로 뜨면 `runtime.json`도 그 아래에 쓰므로, e2e와 dev는 이 변수로 실제 앱과 겹치지 않는다.
- 명령 본문은 env · 홈 · 소켓을 직접 만지지 않는다(ARCHITECTURE §12 Structure). `Run`이 `DOAN_RUNTIME`과 홈 디렉터리로 경로를 정해 `Context.RuntimePath`에 넣고, 소켓 연결은 `Context.Dial`로 한다. 테스트는 가짜 `Dial`을 넣는다.
- 요청은 `{v: 1, token, root}`이다. `root`는 Go가 찾은 실제 루트이고, 앱은 그 문자열을 `doan ls` `result.root`로 저장해 둔 프로젝트 경로와 그대로 비교한다. TS에서 루트를 다시 추측하지 않는다(POSTMORTEM 2026-10-22 '루트 추측').
- 응답을 스키마로 검증한 뒤 `result`로 돌려준다. `ExitCode`(`envelope.go`)에 `project_not_open` → 3을 더한다.

| 상황 | CLI 코드 | exit |
|---|---|---|
| 런타임 파일 없음 · JSON 아님 · 스키마 위반 | `app_not_running` | 3 |
| 런타임 파일 `v` ≠ 1 | `app_protocol_mismatch` | 3 |
| 연결 실패(ENOENT · ECONNREFUSED) · 2초 시간 초과 · 응답 없이 닫힘 | `app_not_running` | 3 |
| 응답 `v` ≠ 1 | `app_protocol_mismatch` | 3 |
| 응답이 JSON 아님 · 스키마 위반 | `internal_error` | 1 |
| 앱 오류 `bad_token` (남은 `runtime.json`이 새 앱 것과 다름) | `app_not_running` | 3 |
| 앱 오류 `bad_request` | `internal_error` | 1 |
| 앱 오류 `project_not_open` | `project_not_open` | 3 |

- `nextSteps`: `app_not_running` → "Ask the user to open Doan." 에이전트 sandbox가 소켓을 막았을 수 있으니 MCP `active`를 쓰라는 안내도 더한다(tasks 9 결과에 따라 문구 확정). `project_not_open` → "Ask the user to open this project in Doan."

### 14. 결과 모양 (ARCHITECTURE §12에 산문으로 추가)

- `doan active` → `{repo, selection?}`. `selection`은 `{canvas: {path, id?}, frame?: {id, title?}, element?: {doanId?, selector, html, truncated?, text?}}`이다. 선택이 없거나 다른 프로젝트의 것이면 빠진다(`ok: true`).
- `element`는 comment-event `target.element`와 같은 정의라 #7이 그대로 쓴다.

### 15. MCP `active`

- 인자 `repo?`. 다른 도구처럼 `cli.Run`에 `--json`으로 넘긴다(ARCHITECTURE §5). `DOAN_RUNTIME`은 서버를 띄운 환경에서 물려받고, 도구 인자로는 받지 않는다.

## 길이 상한

캔버스는 메시지를 위조할 수 있으므로(ARCHITECTURE §3) 상한은 렌더러 `parseCanvasMessage`가 지키고(넘으면 메시지를 버림), main과 Go는 `app-socket` 스키마로 다시 본다. comment-event v1 정의는 바꾸지 않고, `app-socket` 스키마에서 `allOf: [{$ref}, {상한}]`으로만 좁힌다.

| 값 | 상한 |
|---|---|
| `doanId` · 프레임 `id` · `title` | 200 UTF-16 단위(`layout`과 같음) |
| `selector` | 1,000 UTF-16 단위 |
| `html` | 2,000 코드 포인트, 넘으면 스크립트가 잘라 `truncated: true` |
| `text` | 500 코드 포인트, 스크립트가 공백을 접고 자름 |
| 인스펙터 값 하나 · 토큰 이름 | 500 UTF-16 단위 |
| 조상 경로 | 32개 |
| 소켓 요청 줄 · Go가 읽는 응답 줄 | 64 KiB |

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

캔버스 스크립트 쪽은 지금처럼 `canvasScript`에 인자로 넘기는 자기 완결 함수다.

- `elementSelector(chain)`: 조상 사슬(`{tag, doanId?, frameId?, indexOfType}`)에서 선택자를 만든다. 가장 가까운 `data-doan-id` 또는 `data-doan-frame` 조상을 기준으로 `:nth-of-type` 경로를 잇는다. 경계: 속성 값의 따옴표 · 역슬래시 이스케이프, 같은 id 중복(check 오류인 캔버스), 기준 조상 없음, SVG 태그 이름.
- `ancestorPath(chain)`: 조상 경로 항목(라벨과 앵커), 32개 상한.
- `clipHtml(html, 2000)`: 코드 포인트 2,000에서 자르고 서로게이트 쌍을 쪼개지 않으며 `truncated`를 알린다(ARCHITECTURE §2 `html` 규칙).
- `textQuote(text, 500)`: 공백을 접고 코드 포인트 500에서 자른다.
- `tokenOf(value)`: 선언값에서 `var(--x)` 이름을 읽는다(대체값 안의 중첩 `var()`, 대소문자 구별).
- `pickDeclaration(candidates, computed)`: 후보 선언(`{value, resolved, important, specificity?, order, state?}`)과 계산값으로 이긴 선언과 표시 상태를 고른다.
- `inspectRows(values)`: 패널 행(토큰 · 하드코딩 · 알 수 없음 · 기본값, 상속, hover 상태, border 너비 0이면 색 "—").
- 렌더러: `parseCanvasMessage` 확장(`hover` · `select` · `clear` · `key` · `layout.selected`, 상한), `seq`와 `href` · `viewport`로 메시지를 받을지 정하는 함수, 오버레이 사각형 계산(`viewport.ts`의 보드 → 화면 변환 재사용), '상태별 선택' 표의 결정 함수(`canvasView.ts`와 같은 모양).
- main: `parseSocketRequest(line)`, `socketResponse(selection, root)`, `runtimeFile(socket, token)`, 토큰 비교.
- Go: `readRuntime(bytes)`(config 읽기 순서와 같게: JSON → 객체 → `v` → 스키마), 소켓 결과 → CLI 코드 매핑(위 표).

## 형식 변경

- 새 스키마(JSON Schema 2020-12, ARCHITECTURE §11). 모든 객체 `additionalProperties: false`.
  - `schema/runtime.v1.schema.json`: `{v: 1, socket, token}`. `socket`은 절대 경로, `token`은 64자리 소문자 hex.
  - `schema/app-socket.v1.schema.json`: 요청 `{v: 1, token, root}`, 응답 `{v: 1, ok: true, result: {selection?}}` 또는 `{v: 1, ok: false, error: {code, message}}`(`code`는 `bad_token` · `bad_request` · `project_not_open`). selection은 위 '결과 모양'에 `root`를 더한 것이고, `element`는 comment-event `$defs`를 `$ref`하며 '길이 상한'으로 좁힌다.
- `comment-event.v1`: `target.element` 정의만 `$defs`로 옮긴다. `target.frame`은 문자열이고 selection의 `frame`은 `{id, title?}`라 모양이 다르다. 받아들이는 문서는 바뀌지 않으므로 `v`는 1 그대로이고, 기존 fixture가 모두 그대로 통과해야 한다.
- 스키마마다 절대 `$id`를 붙이고 그 id로 `$ref`한다. 지금 로더는 교차 파일 `$ref`를 못 읽는다: TS는 `ajv.compile(schema)`만 하고, Go는 `AddResource` 직후 바로 컴파일한다. TS는 모든 스키마를 `addSchema`한 뒤 `getSchema`로 꺼내고, Go는 모든 리소스를 먼저 등록한 뒤 컴파일하며 외부를 읽지 않는 `UseLoader`를 둔다.
- fixture: `schema/fixtures/runtime/` · `schema/fixtures/app-socket/`의 valid · invalid. TS와 Go가 같은 파일을 읽는다.
- `cli-envelope.v1`: 바뀌지 않는다. `project_not_open`은 `error.code` 패턴 안이다.
- `runtime.json`은 기계마다 다른 파일이라 git으로 옮기지 않는다(ARCHITECTURE §10). 스키마로 두는 이유는 쓰는 쪽(TS)과 읽는 쪽(Go)이 다르기 때문이다.

## 관례 영향

- 캔버스 관례와 `doan check` 규칙은 바뀌지 않는다. `data-doan-id`는 여전히 권장이고, 없으면 선택자 · html · text가 앵커가 된다.
- 에이전트 규칙 C를 ARCHITECTURE §1 문구로 되돌린다. 스킬 본문에 `doan active` 예시와 결과 해석을 더한다: 선택 없음이면 사용자에게 묻기, `project_not_open`이면 앱에서 프로젝트를 열어 달라고 하기, 프레임 id가 `doan ls`에 없으면 스크립트가 그린 프레임일 수 있음, MCP 표의 `active`.
- 규칙 A를 넓힌다: `active` 결과의 `html` · `text`도 캔버스(CDN 스크립트 포함)가 만들 수 있으므로 데이터로 다룬다.

## 결정 영향과 보존

- **sandbox iframe**: `allow-same-origin`을 주지 않는다. 선택 · 인스펙터 값은 모두 스크립트의 `postMessage`로 온다. 렌더러는 `source` · `origin`을 확인하고 `parseCanvasMessage`로 상한까지 검증한다. main은 IPC로 받은 selection을 스키마로 다시 검증한다. 텍스트는 `textContent`로만 쓴다.
- **캔버스 안 링크 이동**(PRODUCT §7 2026-10-22): 일반 클릭이 선택이 되어 ⌥클릭으로 옮겨 간다. 관문(`will-frame-navigate`)은 그대로다. 승격 때 §7에 적는다.
- **`active`는 프로젝트별**(PRODUCT §7 2026-10-21): 선택이 앱 전체에 하나가 되어 "그 프로젝트의 선택일 때만"으로 바뀐다(흐름 11).
- **로컬 서버 · 서빙 범위**: 바뀌지 않는다. 소켓은 HTTP 서버와 별개이고 캔버스에서 닿지 않는다. 스크립트의 `fetch(sheet.href)`는 이미 허용된 범위 안 읽기다(ARCHITECTURE §3 CORS의 받아들인 결과).
- **토큰을 다루지 않음(GitHub)**: 해당 없음. 소켓 토큰은 실행마다 새로 만드는 로컬 비밀이다.
- **git 조작 없음 · append-only 이벤트**: 해당 없음. 선택은 디스크에 쓰지 않는다.
- **캔버스 바이트 그대로 서빙 · 주입은 `executeJavaScript`**: 그대로다. 스크립트만 커진다.

## PoC 의존 (tasks 0)

- **PoC 2 (인스펙터 토큰 이름)**: 첫 사례는 링크한 로컬 `tokens.css`의 `cssRules` 접근과, 막히면 `fetch` + `replaceSync` 대체다. 이어서: 단축 속성(`padding: var(--a) var(--b)`)의 각 변, 상속 속성, `@media` · `@layer` · `@supports` 안 규칙, 중첩 CSS, 실제 CDN 시트, 스크립트가 만든 `<style>`, 토큰이 다른 토큰을 가리킬 때, 클릭 시점의 `:hover` · `:active` 규칙, 선언 없는 기본값. 같은 사례를 CDP `CSS.getMatchedStylesForNode`로도 읽어 비교한다.
- **PoC 6 소켓 절반**: 통과 기준은 PRODUCT §6 그대로("`runtime.json`으로 연결해 `active`를 받는다")이고, 창 숨김, 틀린 토큰, 지워진 소켓 파일, 앱이 죽어 남은 `runtime.json`, 두 번째 인스턴스 실행도 본다.
- **입력 확인**: 실제 마우스 ⌥클릭(Playwright `click({modifiers: ["Alt"]})`)으로 링크 이동 · 버튼 · 입력이 되는지, ⌥ 없는 `mousedown`을 막았을 때 iframe 포커스와 Esc 전달이 어떻게 되는지. ⌥클릭 링크가 다운로드로 막히면 흐름 1의 `location.assign` 대체를 쓴다.

## POSTMORTEM에서 가져올 함정

- **'linked 100vh canvas' (2026-10-22)**: 캔버스가 재는 값은 렌더러가 바꾸는 입력과 함께 와야 한다. 모든 메시지에 `href` · `viewport` · `seq`를 싣고, 오래된 메시지가 늦게 오는 경우를 테스트한다(흐름 4).
- **'dead board' (2026-10-22)**: 스크립트 없는 문서에서는 선택 메시지가 오지 않는다. "목록에 없는 문서"가 되면 선택을 풀고 패널을 비우는 e2e 단계를 둔다.
- **'local server guarantees' (2026-10-21)**: 소켓 보안은 상수가 아니라 관찰한 상태로 확인한다(`runtime.json`과 소켓 디렉터리의 실제 권한, 틀린 토큰 거절). 각 보안 테스트는 변형으로 빨개지는 것을 본다.
- **'guessing the repo root' (2026-10-22)**: 앱은 루트를 추측하지 않는다. CLI가 보낸 `root`와 Go가 준 `result.root`를 문자열로만 비교한다.
- **'fresh-iframe rule' (2026-10-22)**: 선택 처리를 넣으며 `CanvasController.load`를 건드리면 C7 구조 검사를 포함한 변형 증명을 다시 돌린다.
- **'zero-mismatch table' (2026-10-22)**: 인스펙터 행 안의 토큰 칩 · 색 견본 · 상태 표시, 조상 경로 항목은 자식 요소로 따로 짝짓는다.

## 초안 요청 (Codex)

PRODUCT §5 Dogfooding: 이번에는 Codex가 그리고 Claude Code가 구현 · `/design-sync`를 한다. `/orchestrate`의 Codex 워커가 `/design-draft`로 그린다(Q5). Codex에게는 문장으로 풀어 주지 않고 파일을 준다: 이 기능의 spec · design, `design/app-shell.html`, `app/src/renderer/tokens.css`, `design/mock.css`, `doan ls --json` · `doan check --json` 출력.

- 새 캔버스 `design/select-inspect.html`(id `select-inspect`). `app-shell.html`은 구현이 main에 들어간 뒤라 바꾸지 않는다(design-sync: 이미 구현한 화면의 새 초안은 변경 요청이다).
- 토큰은 `../app/src/renderer/tokens.css`만 쓰고, 검토 대상 예시 화면의 색은 `mock.css`를 쓴다. 영어 문구, 다크 단일 테마, 시스템 sans 하나(PRODUCT §7 app-ui 결정).
- 오른쪽 패널은 흐름 8대로 한 패널이다. `app-shell.html` 'After #6 · #7' 프레임의 탭은 "미정"으로 그린 것이라 따르지 않는다. 모드 전환은 그리지 않는다(Q1).
- 이미 main에 있는 화면(Canvas 패널, 사이드바, 위 막대)은 지금 구현을 그대로 옮겨 그린다. 다르게 그리고 싶은 점은 그리지 말고 변경 요청으로 따로 적는다.
- 프레임 id(이 목록이 tasks 1의 검증 기준이다):
  - `no-selection`: 선택 없음, 지금의 Canvas 패널과 빈 줄 안내(옮겨 그림, `/design-sync` 대상 아님)
  - `hover`: hover 표시, ⌥를 누르고 있을 때(hover 숨김)
  - `element-selected`: 요소 선택 표시 · 치수 라벨 · 사이드바 하위 행 · 패널 머리와 조상 경로
  - `frame-selected`: 프레임 선택 표시와 패널
  - `inspector-states`: 토큰 · 하드코딩 · 알 수 없음 · 기본값 · 상속 · hover 상태가 섞인 인스펙터, `data-doan-id` 없는 요소
  - `long-values`: 긴 font-family · 여러 겹 shadow · 긴 선택자 · 긴 조상 경로
  - `interactive-element`: 링크 · 입력을 선택했을 때의 ⌥ 안내
  - `selection-lost`: 다시 불러온 뒤 선택이 사라졌을 때의 notice 줄, 목록에 없는 문서
- 각 프레임의 `data-doan-implements`는 지금 있는 파일만 가리킨다(`app/src/renderer/RightPanel.tsx` · `Sidebar.tsx` · `CanvasController.ts` · `App.tsx`, `app/src/main/canvasScript.ts`). 없는 파일을 가리키면 `doan check`가 `implements_not_found` 오류를 낸다.
