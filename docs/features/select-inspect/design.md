# select-inspect — design

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 형식 (`schema/`) | 런타임 파일 `runtime.v1`, 소켓 메시지 `app-socket.v1`을 새로 둔다. `comment-event.v1`의 `target` 정의를 `$defs`로 옮겨 소켓 스키마가 `$ref`로 함께 쓴다(뜻은 같으므로 `v`는 그대로) |
| 캔버스 스크립트 (`app/src/main/canvasScript.ts`) | hover · 클릭 선택, 앵커(선택자 · html · text), 인스펙터 값 수집, 선택한 요소의 사각형 다시 보내기 |
| 앱 main | 유닉스 소켓 서버, `runtime.json` 쓰기 · 지우기, 프로젝트별 선택 저장소, IPC `selection:set` |
| 앱 preload | `setSelection(folder, selection \| null)` 하나를 더한다 |
| 앱 renderer | 오버레이에 hover · 선택 표시, 오른쪽 패널 인스펙터, 사이드바 선택 표시. 레이아웃은 초안을 따른다 |
| CLI (Go) | `doan active`, 런타임 파일 읽기, 소켓 클라이언트, 종료 코드 3 계열 |
| `doan mcp` | `active` 도구(`repo?`) |
| 스킬 본문 (`cli/internal/cli/skill.md`) | 규칙 C 복원, 명령 표와 MCP 표에 `active` |
| `design/` | Codex가 그린 초안 캔버스(아래 '초안 요청') |

## 흐름

1. **hover와 선택 (캔버스 스크립트)**: 스크립트가 캡처 단계에서 `pointermove` · `pointerdown` · `click`을 받는다. hover는 rAF로 묶어 `hover {href, rect | null}`을 보내고, 클릭은 기본 동작과 전파를 막고 `select {href, target, rect, inspect}`를 보낸다. 클릭은 항상 선택이다. ⌥(Alt)를 누른 채 클릭하면 스크립트가 막지 않아 캔버스 자체 동작(링크 이동, 버튼, 입력)이 원래대로 일어나고, 선택은 바뀌지 않는다(2026-10-22 사용자, Q1). 모드 상태가 없으므로 초안에 모드 전환을 그리지 않는다. canvas-view의 캔버스 안 링크 이동은 ⌥클릭으로 쓴다.
2. **표시는 보드 위 오버레이**: 선택 · hover 사각형과 치수(`252 × 32`)는 iframe 밖 오버레이(canvas-view에서 #7 핀 자리로 비워 둔 층)에 그린다. 캔버스 DOM에 요소를 넣으면 스크립트 자신의 MutationObserver가 `layout`을 다시 보내고, 인스펙터가 읽는 계산값과 `html` 앵커도 오염된다. 사각형은 보드 좌표이고 PoC 3에서 배율과 무관하게 0.563px 안에서 맞았다.
3. **선택 사각형 갱신**: 스크립트는 선택한 요소를 기억하고, `layout`을 보낼 때마다 그 요소의 사각형을 함께 보낸다(`selected?: rect`). 요소가 DOM에서 빠지면 `selected: null`을 보내고 렌더러는 선택을 푼다.
   - 같은 캔버스를 다시 불러오면(라이브 리로드 · ⌘R) 렌더러가 새 문서의 첫 `layout` 뒤에 `{type: "reselect", frame?, doanId?, selector?}`를 보낸다. 스크립트는 `data-doan-id`(문서에 하나뿐일 때) → 선택자 순서로, 프레임은 프레임 id로 다시 찾아 `select`로 답한다. 못 찾으면 `select null`로 답하고 렌더러는 선택을 푼다(2026-10-22 사용자, Q3). 다른 캔버스로 가면 다시 찾지 않고 푼다.
4. **프레임 선택**: 사이드바 Frames 목록에서 프레임을 누르면 지금처럼 이동하고, 그 프레임이 선택된다(렌더러 → 스크립트 `{type: "pick-frame", index}`, 스크립트가 같은 `select`로 답한다). 캔버스에서 프레임 요소 자체를 클릭한 경우(자식이 아닌 빈 영역)에도 프레임 선택이다. 요소를 선택하면 그 요소를 감싼 가장 가까운 `[data-doan-frame]`이 함께 실린다. 프레임은 렌더된 DOM 기준이다(2026-10-22 사용자, Q2; PRODUCT §8 질문을 닫는다). 앱 Frames 목록과 같은 출처이고, 스크립트가 그린 프레임도 고를 수 있다. 그래서 `doan active`의 프레임 id가 `doan ls` 프레임에 없을 수 있고, 스킬 본문이 그 경우를 설명한다.
5. **인스펙터 값 (PoC 2가 확정)**: 선택할 때 한 번 모은다. 계산값은 `getComputedStyle`이다. 토큰 이름은 ARCHITECTURE §3 결정대로 스크립트가 `document.styleSheets`의 규칙과 `style` 속성에서 그 요소에 맞는 선언을 찾아 cascade 순서(`!important` → specificity → 순서)로 이긴 선언의 `var(--x)`를 읽는다. 상속 속성(글자색 · 글꼴)은 요소에 선언이 없으면 조상으로 올라간다. `cssRules`가 막힌 시트(CDN)가 있으면 그 시트에서 이겼을 수 있는 값은 "알 수 없음"이다. 표시 상태는 셋이다: 토큰(`--brand` → `#4f46e5`), 하드코딩, 알 수 없음. PoC 2에서 이 방식이 기준을 못 넘으면 멈추고 사용자에게 묻는다.
6. **선택 저장소 (main)**: 렌더러가 선택이 바뀔 때마다 IPC `selection:set(folder, selection | null)`을 보낸다. main은 발신 프레임을 지금의 IPC와 같이 확인하고, 선택을 `app-socket.v1`의 selection 스키마로 검증한 뒤 프로젝트 경로별로 하나씩 메모리에 둔다. 프로젝트를 닫으면 지운다. 창이 숨어 있어도 main이 답하므로 `doan active`는 창 없이도 동작한다(app-ui 창 수명주기).
7. **런타임 파일과 소켓 (main)**: 앱이 뜨면 `mkdtemp(<tmpdir>/doan-)`(0700) 안에 소켓을 열고, 토큰(`randomBytes(32)` hex)과 함께 `<userData>/runtime.json`(0600, 임시 파일에 쓰고 이름 바꾸기)에 적는다. 소켓을 userData 아래에 두지 않는 이유: macOS `sun_path`는 104바이트이고, e2e의 임시 `--user-data-dir`는 이를 넘을 수 있다. 앱을 끝낼 때(`will-quit`) 소켓과, 내용이 자기 것일 때만 `runtime.json`을 지운다. 연결마다 요청 한 줄을 받고 응답 한 줄을 보낸 뒤 닫는다. 토큰은 `timingSafeEqual`로 비교한다.
8. **`doan active` (Go)**: 저장소를 지금처럼 찾는다(`--repo` 또는 위로 탐색). 런타임 파일은 `DOAN_RUNTIME`(절대 경로)이 있으면 그 파일, 없으면 `~/Library/Application Support/doan/runtime.json`이다(2026-10-22 사용자, Q4). 앱이 `--user-data-dir`로 뜨면 `runtime.json`도 그 아래에 쓰므로, e2e와 dev는 이 변수로 실제 앱과 겹치지 않는다. 상대 경로 `DOAN_RUNTIME`은 `usage_error`다. 런타임 파일을 읽고(없거나 깨졌으면 `app_not_running`, `v`나 `protocol`이 다르면 `app_protocol_mismatch`), 소켓에 `{v: 1, token, method: "active", root}`를 보낸다. `root`는 Go가 찾은 실제 루트이고, 앱은 그 문자열을 `doan ls` `result.root`로 저장해 둔 프로젝트 경로와 그대로 비교한다. TS에서 루트를 다시 추측하지 않는다(POSTMORTEM 2026-10-22 '루트 추측'). 연결 실패 · 2초 시간 초과 → `app_not_running`. 응답을 스키마로 검증한 뒤 `result`로 돌려준다.
9. **결과 모양 (ARCHITECTURE §12에 산문으로 추가)**: `doan active` → `{repo, selection?}`. `selection`은 `{canvas: {path, id?}, frame?: {id, title?}, element?: {doanId?, selector, html, truncated?, text?}, selectedAt}`이고, 아무것도 선택하지 않았으면 빠진다(`ok: true`). 그 프로젝트가 앱에 열려 있지 않으면 새 코드 `project_not_open`(exit 3, `nextSteps`: 앱에서 이 프로젝트를 열라고 사용자에게 부탁)이다. `element`는 comment-event `target.element`와 같은 정의라 #7이 그대로 쓴다.
10. **MCP `active`**: 인자 `repo?`. 다른 도구처럼 `cli.Run`에 `--json`으로 넘긴다(ARCHITECTURE §5). `DOAN_RUNTIME`은 서버를 띄운 환경에서 물려받는다. 도구 인자로는 받지 않는다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

캔버스 스크립트 쪽은 지금처럼 `canvasScript`에 인자로 넘기는 자기 완결 함수다.

- `elementSelector(chain)`: 조상 사슬(`{tag, doanId?, frameId?, indexOfType}`)에서 선택자를 만든다. 가장 가까운 `data-doan-id` 또는 `data-doan-frame` 조상을 기준으로 `:nth-of-type` 경로를 잇는다. 경계: 속성 값의 따옴표 · 역슬래시 이스케이프, 같은 id 중복(check 오류인 캔버스), 기준 조상 없음.
- `clipHtml(html, 2000)`: 코드 포인트 2,000에서 자르고 서로게이트 쌍을 쪼개지 않으며 `truncated`를 알린다(ARCHITECTURE §2 `html` 규칙).
- `textQuote(text)`: 공백을 접고 길이를 자른다(상한은 스키마와 같이 정한다).
- `specificity(selector)`: 선택자 목록에서 그 요소에 맞는 것 중 가장 높은 값. `:is()` · `:where()` · `:not()` 포함.
- `winningDeclaration(candidates)`: `{important, specificity, order, value}` 목록에서 cascade 승자.
- `tokenOf(value)`: 선언값에서 `var(--x)` 이름을 읽는다(대체값 안의 중첩 `var()`, 대소문자 구별).
- `inspectRows(computed, declared)`: 패널에 보일 행(토큰 · 하드코딩 · 알 수 없음, 0 값과 `normal` 표시).
- 렌더러: `parseCanvasMessage` 확장(`hover` · `select` · `layout.selected`), 오버레이 사각형 계산(`viewport.ts`의 보드 → 화면 변환 재사용), 선택이 `layout` · 다시 불러오기 · 캔버스 바뀜에서 어떻게 되는지(`canvasView.ts`와 같은 결정 함수).
- main: `parseSocketRequest(line)`, `activeResponse(store, root, now)`, `runtimeFile(socket, token)`.
- Go: `readRuntime(bytes)`(config 읽기 순서와 같게: JSON → 객체 → `v` → 스키마), 소켓 오류 → 오류 코드 매핑.

## 형식 변경

- 새 스키마(JSON Schema 2020-12, ARCHITECTURE §11):
  - `schema/runtime.v1.schema.json`: `{v: 1, protocol: 1, socket, token, pid}`. `socket`은 절대 경로, `token`은 64자리 소문자 hex.
  - `schema/app-socket.v1.schema.json`: 요청 `{v: 1, token, method: "active", root}`, 응답 `{v: 1, ok: true, result: {selection?}}` 또는 `{v: 1, ok: false, error: {code, message}}`. selection의 `element`는 comment-event `$defs`를 `$ref`한다. 모든 객체 `additionalProperties: false`.
- `comment-event.v1`: `target`(frame · element) 정의를 `$defs`로 옮긴다. 받아들이는 문서는 바뀌지 않으므로 `v`는 1 그대로이고, 기존 fixture가 모두 그대로 통과해야 한다.
- fixture: `schema/fixtures/runtime/` · `schema/fixtures/app-socket/`의 valid · invalid. TS와 Go가 같은 파일을 읽는다.
- `cli-envelope.v1`: 바뀌지 않는다. `project_not_open`은 `error.code` 패턴 안이다.
- `runtime.json`은 기계마다 다른 파일이라 git으로 옮기지 않는다(ARCHITECTURE §10). 스키마로 두는 이유는 쓰는 쪽(TS)과 읽는 쪽(Go)이 다르기 때문이다.

## 관례 영향

- 캔버스 관례와 `doan check` 규칙은 바뀌지 않는다. `data-doan-id`는 여전히 권장이고, 없으면 선택자 · html · text가 앵커가 된다.
- 에이전트 규칙 C를 ARCHITECTURE §1 문구로 되돌린다. 스킬 본문에 `doan active` 예시, 결과 해석(선택 없음이면 사용자에게 묻기, `project_not_open`이면 앱에서 프로젝트를 열어 달라고 하기), MCP 표의 `active`를 더한다.

## 결정 영향과 보존

- **sandbox iframe**: `allow-same-origin`을 주지 않는다. 선택 · 인스펙터 값은 모두 스크립트의 `postMessage`로 온다. 캔버스가 메시지를 위조할 수 있으므로(ARCHITECTURE §3) 렌더러는 `source` · `origin`을 확인하고 `parseCanvasMessage`로 길이 상한까지 검증한다. main은 IPC로 받은 selection을 스키마로 다시 검증한다. 텍스트는 `textContent`로만 쓴다.
- **로컬 서버 · 서빙 범위**: 바뀌지 않는다. 소켓은 HTTP 서버와 별개이고 캔버스에서 닿지 않는다.
- **토큰을 다루지 않음(GitHub)**: 해당 없음. 소켓 토큰은 실행마다 새로 만드는 로컬 비밀이다.
- **git 조작 없음 · append-only 이벤트**: 해당 없음. 선택은 디스크에 쓰지 않는다.
- **캔버스 바이트 그대로 서빙 · 주입은 `executeJavaScript`**: 그대로다. 스크립트만 커진다.

## PoC 의존

- **PoC 2 (인스펙터 토큰 이름)**: 아직 통과하지 않았다. tasks 0에서 먼저 한다. 기록할 것: 단축 속성(`padding: var(--a) var(--b)`)의 각 변 추적, 상속 속성, `@media` · `@layer` · `@supports` 안 규칙, 중첩 CSS, CDN 시트(`cssRules` 접근 시 `SecurityError` 여부), `<style>`이 스크립트로 만든 규칙, 토큰이 다른 토큰을 가리킬 때.
- **PoC 6 소켓 절반**: tasks 0에서 먼저 한다. 통과 기준은 PRODUCT §6 그대로("`runtime.json`으로 연결해 `active`를 받는다")이고, 창을 숨긴 상태, 잘못된 토큰, 지워진 소켓 파일, 앱이 죽어 남은 `runtime.json`도 본다.

## POSTMORTEM에서 가져올 함정

- **'linked 100vh canvas' (2026-10-22)**: 캔버스가 재는 값은 렌더러가 바꾸는 입력과 함께 와야 한다. `hover` · `select` · `layout.selected`는 `href`를 싣고, 렌더러는 지금 문서가 아닌 메시지를 버린다. 계획한 순서만이 아니라 오래된 메시지가 늦게 오는 경우를 테스트한다.
- **'dead board' (2026-10-22)**: 스크립트 없는 문서에서는 선택 메시지가 오지 않는다. "목록에 없는 문서"가 되면 선택을 풀고 패널을 비우는 e2e 단계를 둔다.
- **'local server guarantees' (2026-10-21)**: 소켓 보안은 상수가 아니라 관찰한 상태로 확인한다(`runtime.json`과 소켓 디렉터리의 실제 권한, 틀린 토큰 거절). 각 보안 테스트는 변형으로 빨개지는 것을 본다.
- **'guessing the repo root' (2026-10-22)**: 앱은 루트를 추측하지 않는다. CLI가 보낸 `root`와 Go가 준 `result.root`를 문자열로만 비교한다.
- **'fresh-iframe rule' (2026-10-22)**: 선택 처리를 넣으며 `CanvasController.load`를 건드리면 변형 증명을 다시 돌린다.
- **'zero-mismatch table' (2026-10-22)**: 인스펙터 행 안의 토큰 칩 · 색 견본 · 하드코딩 표시는 자식 요소로 따로 짝짓는다.

## 초안 요청 (Codex)

PRODUCT §5 Dogfooding: 이번에는 Codex가 그리고 Claude Code가 구현 · `/design-sync`를 한다. `/orchestrate`의 Codex 워커가 `/design-draft`로 그린다(Q5). Codex에게는 문장으로 풀어 주지 않고 파일을 준다: 이 기능의 spec · design, `design/app-shell.html`, `app/src/renderer/tokens.css`, `design/mock.css`, `doan ls --json` · `doan check --json` 출력.

- 새 캔버스 `design/select-inspect.html`(id `select-inspect`). `app-shell.html`은 구현이 main에 들어간 뒤라 바꾸지 않는다(design-sync: 이미 구현한 화면의 새 초안은 변경 요청이다).
- 토큰은 `../app/src/renderer/tokens.css`만 쓰고, 검토 대상 예시 화면의 색은 `mock.css`를 쓴다. 영어 문구, 다크 단일 테마, 시스템 sans 하나(PRODUCT §7 app-ui 결정).
- 오른쪽 패널은 PRODUCT §5 4대로 한 패널이다(인스펙터 + #7에서 그 요소의 코멘트). `app-shell.html` 'After #6 · #7' 프레임의 탭은 "미정"으로 그린 것이라 따르지 않아도 된다.
- 그릴 상태: 선택 없음(지금의 Canvas 정보), hover, 요소 선택(토큰 · 하드코딩 · 알 수 없음 · 상속 값이 섞인 인스펙터), 프레임 선택, `data-doan-id` 없는 요소, 긴 값(긴 font-family, 여러 겹 shadow, 긴 선택자), 선택한 요소가 다시 불러온 뒤 사라짐, 목록에 없는 문서, 사이드바의 선택 표시, 선택 표시의 치수 라벨. ⌥클릭으로 캔버스 동작을 쓸 수 있다는 안내가 어디에 보일지도 그린다.
- 각 프레임에 `data-doan-implements`를 단다.
