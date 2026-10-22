# canvas-view — design

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 main (`app/src/main/`) | 앱 메뉴 정의, 캔버스 iframe에 스크립트 주입, 세션 권한 deny-all, IPC 발신 프레임 확인, 캔버스 iframe 탐색 제한, `design/` 밖 서빙 경로 감시, 서빙 파일 변경 구분과 `servedRev` |
| 앱 preload | 메뉴 명령을 받는 리스너 하나(`onViewCommand`)를 더한다. iframe과의 통신은 렌더러의 `postMessage`로 한다 |
| 앱 renderer (`app/src/renderer/`) | 사이드바(폴더 · 캔버스 · 프레임 목록) + 캔버스 뷰(보드 · overlay · 툴바), 줌·팬, 프레임 점프, 리로드, 화면 상태 |
| 빌드 (`electron.vite.config.ts`) | 렌더러 CSP에 `frame-src http://127.0.0.1:*` 추가 |
| e2e (`app/e2e/runtime.ts`) | 캔버스 뷰 단계 추가 |
| CLI · `doan mcp` · 스킬 · 형식 | 바뀌지 않는다. `doan ls`의 `width` · `scope`를 그대로 쓴다 |

## 흐름

1. **열기**: 렌더러가 캔버스를 고르면 iframe 요소를 새로 만들고(`sandbox="allow-scripts"`), `src`에 `CanvasRow.url`, 폭에 `CanvasRow.width`(새 필드, `doan ls` `width`)를 넣는다. 열린 캔버스의 키는 `(폴더 path, 캔버스 path)`다. URL은 폴더를 닫았다 다시 열면 folder key가 바뀌므로 키로 쓰지 않는다.
2. **주입 (Q1 결정)**: main이 `WebFrameMain.executeJavaScript`로 주입 스크립트를 실행한다. 서버는 디스크 바이트를 그대로 보낸다.
   - 대상: 부모가 앱 창의 메인 프레임이고, URL이 로컬 서버 토큰 경로 아래인 프레임.
   - 시점: 내비게이션마다 프레임을 새로 얻어 주입한다. 리로드 때는 렌더 프레임이 바뀔 수 있으므로 매번 다시 찾는다. 프레임이 이미 사라져 `executeJavaScript`가 reject되면 무시한다. 어느 이벤트(프레임 `dom-ready`, `did-frame-navigate` 등)에서 주입할지는 PoC 1에서 정한다. 외부 CDN을 기다리는 `did-frame-finish-load`는 늦을 수 있어 후보에서 뺀다.
   - 서버 삽입 대신 이 방식을 고른 근거: `#4`에서 다듬은 서버 코드를 바꾸지 않는다. 또 캔버스의 `<meta http-equiv="Content-Security-Policy">`가 inline script를 막아도 `executeJavaScript`는 동작한다.
3. **주입 스크립트 → 렌더러** (`postMessage(msg, "*")`):
   - `layout`: `{href, height, frames: [{id, title?, x, y, width, height}], truncated}`. 좌표는 보드 좌표다. 로드 직후, `document.fonts.ready` 뒤, `ResizeObserver`(크기)나 `MutationObserver`(위치만 바뀌는 재배치)가 알릴 때마다 rAF 단위로 묶어 보낸다. 프레임 1,000개, 문자열 200자를 넘으면 잘라서 보내고 `truncated: true`로 표시한다.
   - `wheel` (Q3 결정): iframe 안의 휠 이벤트를 `{dx, dy, ctrl, meta, deltaMode, x, y}`로 넘긴다. `x` · `y`는 `clientX + scrollX`(보드 좌표)다. 높이가 맞춰지기 전에는 iframe에 내부 스크롤이 있기 때문이다.
     - Ctrl 또는 Cmd가 눌렸으면 늘 `preventDefault()`하고 넘긴다(줌).
     - 그 밖의 휠은, 커서 아래 조상 중 그 방향으로 더 스크롤할 수 있는 요소가 있으면 넘기지 않고 브라우저에 맡긴다(내부 스크롤). 없으면 `preventDefault()`하고 넘긴다(팬).
4. **렌더러 → 주입 스크립트**: 프레임 점프 직전에 `{type: "measure"}`를 보내고, 다음 `layout`을 받아 위치를 쓴다. 위치가 낡지 않게 하기 위해서다. #6 선택도 이 채널을 쓴다.
5. **메시지 신뢰**: 렌더러는 `event.source === iframe.contentWindow`이고 `event.origin === "null"`인 메시지만 받는다. 내용은 `parseCanvasMessage`로 검증한 뒤 데이터로만 쓴다(텍스트는 `textContent`로만). 캔버스 스크립트도 같은 창에서 돌기 때문에 메시지를 위조할 수 있다. 위조해도 높이와 프레임 목록, 열린 캔버스 표시가 틀어질 뿐이고 앱 UI나 디스크에는 닿지 못한다.
6. **줌·팬**: 보드 래퍼에 `transform-origin: 0 0; transform: translate(x, y) scale(s)`를 걸어 iframe 바깥에서 한다(ARCHITECTURE §3). 화면 좌표의 기준은 캔버스 뷰 컨테이너의 왼쪽 위다.
   - 보드 래퍼는 `[iframe, overlay]` 두 층이다. overlay는 #7 핀이 올라갈 자리로, 지금은 비어 있고 `pointer-events: none`이다.
   - 휠 입력은 두 경로로 들어온다. iframe 위에서는 주입 스크립트가 넘긴 `wheel`이 오고, iframe 밖 여백이나 overlay 위에서는 렌더러가 직접 받는다. 두 경로 모두 같은 `wheelAction`을 거친다.
   - iframe 안 포인터 이벤트는 주입 스크립트가 가진다. 드래그 팬은 이번에 없다. 나중에 Space+드래그를 넣을 때는 주입 스크립트가 Space 상태와 드래그를 넘기는 방식으로 한다. #6의 클릭 선택과 충돌하지 않게 하기 위해서다.
7. **앱 메뉴 (리뷰 결정)**: main이 앱 메뉴를 직접 정의한다. '보기' 메뉴에 확대(Cmd+=) · 축소(Cmd+-) · 실제 크기(Cmd+0) · 맞춤(Shift+1) · 캔버스 다시 읽기(Cmd+R)를 두고, 각 항목은 IPC로 렌더러에 명령을 보낸다. 페이지 줌 role(`zoomIn` · `zoomOut` · `resetZoom`)과 `reload` role은 넣지 않는다. 네이티브 메뉴 accelerator는 포커스가 iframe 안에 있어도 동작한다(PoC 1에서 확인). 앱 · 편집 · 창 메뉴는 표준 role로 둔다.
8. **프레임 목록 (Q2 결정)**: 주입 스크립트가 보낸 렌더된 DOM의 `[data-doan-frame]`, 문서 순서. 점프에 필요한 위치는 DOM에만 있고, 스크립트로 그린 프레임도 보인다. 그래서 `doan ls` `frames`(정적 HTML 기준)와 다를 수 있다(spec '사용자'). 빈 id와 중복 id도 화면에 있는 그대로 보여 주고, 고칠 일은 `doan check`(`empty_frame_id` · `duplicate_frame_id`)에 맡긴다. 점프는 목록 순번(index)으로 대상을 잡는다.
9. **라이브 리로드**:
   - `servedRev`는 shell의 `Folder`에 둔다. `refresh`가 오래된 `doan ls` 결과를 버릴 때(`read !== folder.reads`) 증가분까지 사라지면 안 되기 때문이다.
   - 감시자는 디바운스 구간 동안 "다시 읽기 필요(`design/` · `.doan/`)"와 "서빙 파일 변경(`design/` · `tokenCss` · `serve`)" 두 플래그를 누적한다. 실행 중에 들어온 변경으로 한 번 더 도는 경우(`again`)에도 플래그를 잃지 않는다.
   - `design/`가 바뀌면 `doan ls`를 다시 돌리고, 그 결과와 함께 `servedRev`를 올린 `FolderEntry`를 한 번에 발행한다. 그래야 `width`가 바뀐 리로드가 옛 폭으로 뜨지 않는다.
   - `tokenCss` · `serve`만 바뀌면 `doan ls`를 돌리지 않고, `servedRev`만 올려 바로 발행한다.
   - 다시 읽은 scope가 이전과 다르면(config의 `serve` 변경 등) `server.updateFolder`를 한 **뒤에** `servedRev`를 올린다. 리로드가 새 scope로 서빙되게 하기 위해서다.
   - 렌더러는 `canvasViewUpdate`가 `reload`를 돌려줄 때 iframe `src`를 다시 넣는다. 같은 폴더의 다른 캔버스나 공유 CSS가 바뀌어도 리로드한다(공유 CSS 변경을 놓치지 않기 위해 감수).
10. **`design/` 밖 서빙 경로 감시 (Q4 결정)**:
    - `doan ls` `result.scope` 중 `design`이 아닌 항목(`tokenCss`, `serve`)을 감시에 더한다. 디렉터리는 재귀로, 파일은 그 파일이 든 디렉터리를 비재귀로 감시하고 파일 이름으로 거른다(에디터의 원자적 저장은 파일을 rename으로 바꿔 파일 단위 감시가 끊기기 때문). 다시 읽을 때마다 scope에 맞춰 감시 대상을 고친다.
    - 겹침 규칙: `.doan/` 아래 경로의 변경은 늘 "서빙 파일 변경"으로 치지 않는다(코멘트를 쓸 때마다 캔버스가 다시 뜨지 않게). `design/` 안에 있는 scope 항목은 이미 재귀 감시 중이라 따로 감시하지 않는다.
    - `design`이 심링크면 scope에는 실제 경로(예: `docs/design`)가 나온다. 이 항목은 "`design`이 아닌 항목"으로 걸러져 재귀 감시된다. §13은 심링크된 `design/`을 감시하지 않으므로, 이렇게 해야 그 캔버스의 변경을 놓치지 않는다.
    - 아직 없는 `serve` 경로는 scope에 없으므로 감시하지 않는다. 다음 읽기 때 scope에 나타나면 그때부터 감시한다(§13 기존 규칙과 같음).
    - 이 규칙은 ARCHITECTURE §13의 "serve paths outside `design/` and `.doan/` are not watched"를 바꾼다.
11. **화면 갱신 (`canvasViewUpdate`)**: 폴더 목록이 갱신될 때마다 렌더러는 `canvasViewUpdate(prev, entries, open)`로 할 일을 정한다. 결과는 다음 중 하나다.
    - `reload`: 열린 폴더의 `servedRev`가 바뀌었고 폴더가 `list` 상태.
    - `resize`: `width`만 바뀜.
    - `clear(reason)`: 그 캔버스가 `list`에서 빠짐, 폴더 닫힘, `notFound`.
    - `errorLine(message)`: 폴더가 `error` · `cliError`. 화면은 그대로 둔다.
    - `none`: 그 밖. 코멘트 수만 바뀐 경우가 여기에 든다.
    - 캔버스 뷰(iframe)는 사이드바를 다시 그리는 트리(`replaceChildren`) 밖에 둔다. 위 결과가 `reload` · `resize` · `clear`일 때만 iframe을 건드린다.
12. **iframe 안 탐색 (리뷰 결정: 같은 폴더 키 아래)**: 캔버스 안 링크로 같은 폴더의 다른 문서로 이동할 수 있다. 렌더러는 `layout.href`를 그 폴더의 `CanvasRow.url`과 비교한다. 일치하는 캔버스가 있으면 열린 캔버스 표시를 그 캔버스로 바꾸고, 없으면 "목록에 없는 문서입니다"를 띄운다. 해시 이동은 그대로 둔다.
13. **사이드바 상태 유지**: 캔버스와 프레임 항목은 `<button>`이다. 열린 캔버스와 마지막에 누른 프레임에 `aria-current="true"`를 단다. 다시 그린 뒤에는 열린 캔버스 키로 표시와 포커스를 되살린다. 툴바 버튼에는 `aria-label`("축소", "확대", "맞춤")을 붙인다.

## 보안

- **권한**: `session.setPermissionRequestHandler`(거부), `setPermissionCheckHandler`(`false`), `setDevicePermissionHandler`(`false`). Electron은 핸들러가 없으면 앱 자신의 메인 프레임에 권한을 허용한다. 캔버스 iframe은 Permissions Policy(opaque origin, `allow` 속성 없음) 때문에 핸들러에 닿기 전에 막힌다. 그래서 이 핸들러가 지키는 대상은 주로 앱 메인 프레임이고, 테스트도 앱 메인 프레임에서 한다.
- **IPC 발신 프레임**: 기존 `event.sender === win.webContents` 확인은 그대로 두고, 발신 프레임이 그 창의 메인 프레임이라는 조건을 AND로 더한다. 비교는 `WebFrameMain` 객체 동일성(`===`) 대신 `senderFrame`이 있고 `parent === null`인지로 한다(프레임 교체나 `null` 때문에 객체 비교가 불안정할 수 있음). 판단은 순수 함수 `fromAppFrame`으로 떼어 낸다. 캔버스 iframe에는 preload가 없어 IPC를 보낼 수 없으므로, 이 확인은 e2e로 관찰할 수 없고 단위 테스트로 검증한다.
- **탐색 제한 (2026-10-22 사용자 결정: `initiator` 규칙)**: `will-frame-navigate`에서 캔버스 iframe의 탐색을 제한한다. 외부 URL로 가는 탐색은 URL만으로는 캔버스 프레임인지 알 수 없으므로 프레임 관계로 판단한다.
  - 제한 대상은 닫힌 쪽으로 판단한다(fail closed). `details.frame`이 `null`이면 거부한다. 손자 프레임임이 증명된 경우(`frame.parent`가 있고 `frame.parent.parent`도 `null`이 아님)만 제한을 건너뛴다. 그 밖의 프레임은 부모가 `null`인 경우까지 모두 `allowFrameNavigation`을 거친다. `frame.parent === mainFrame` 같은 객체 비교로 대상을 고르면, 비교가 어긋날 때 캔버스 프레임이 손자로 취급되어 제한이 풀리기 때문이다.
  - "앱 메인 프레임이 시작한 탐색"(`fromApp`)은 `details.initiator`가 있고 `initiator.parent === null`인 경우다. `fromAppFrame`과 같은 판단이고, 객체 동일성은 쓰지 않는다. 창은 팝업을 거부하므로 부모 없는 initiator는 그 창의 메인 프레임이다. initiator가 `null`이거나 없으면 앱이 시작하지 않은 것으로 본다.
  - 허용: `fromApp`이고 새 URL이 토큰 경로 아래인 경우(폴더 키는 따지지 않는다). `fromApp`이 아니면, 현재 URL이 토큰 URL이고 새 URL이 그와 같은 `/t/<token>/<folder key>/` 아래인 경우만 허용한다.
  - 그 밖은 거부한다(캔버스가 시작한 다른 폴더 키로의 탐색, 토큰 밖, 다른 호스트·포트, `data:` · `javascript:` 등). 판단은 순수 함수 `allowFrameNavigation(current, next, base, fromApp)`로 떼어 낸다.
  - 증명된 손자 프레임(캔버스 안에 중첩된 iframe, 예: 외부 임베드)은 제한하지 않는다(규약 9: 외부 리소스 허용).
  - 이 규칙에서는 같은 iframe의 `src`를 다른 폴더 키로 바꾸는 것도 허용된다. 그래도 흐름 1처럼 캔버스를 열 때마다 iframe을 새로 만든다.
- **iframe `src`의 출처**: 렌더러는 iframe `src`를 `CanvasRow.url`로만 넣는다. `layout.href`나 그 밖에 캔버스가 보낸 값으로 `src`를 만들지 않는다. 앱 메인 프레임이 시작한 탐색은 폴더 키와 관계없이 허용되므로, 캔버스가 위조한 값으로 `src`를 넣으면 캔버스가 다른 폴더 키로 이동할 수 있기 때문이다.
- **CSP**: 렌더러 CSP에 `frame-src http://127.0.0.1:*`를 더한다. 포트가 실행마다 바뀌기 때문에 포트를 고정할 수 없다.
- **#7 메모**: 권한을 모두 거부하면 렌더러의 `navigator.clipboard.writeText`도 막힐 수 있다. #7의 문장 복사는 main의 `clipboard`를 IPC로 쓴다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

| 함수 | 위치 | 내용 |
|---|---|---|
| `zoomAt(view, factor, point, limits)` | `app/src/renderer/viewport.ts` | 화면 좌표 `point`가 같은 보드 지점을 가리키도록 유지하며 배율을 바꾼다. 범위 밖이면 경계값으로 자른다 |
| `panBy(view, dx, dy)` | 〃 | 이동만. 팬 제한 없음 |
| `fitWidth(boardWidth, viewport, margin)` | 〃 | 보드 폭을 뷰포트 폭에 맞춘 배율(상한 1)과 위치(맨 위 정렬) |
| `fitFrame(rect, viewport, margin)` | 〃 | 배율 min(1, 프레임 폭 맞춤). 프레임이 뷰포트보다 높으면 위쪽 맞춤, 낮으면 세로 가운데. 크기 0인 프레임은 현재 배율을 유지하고 그 지점을 가운데에 둔다 |
| `resizeKeep(view, oldViewport, newViewport)` | 〃 | 창 크기 변경. 배율과 뷰포트 왼쪽 위가 가리키는 보드 지점을 유지한다 |
| `boardToScreen` · `screenToBoard` | 〃 | 좌표 변환. iframe이 보낸 휠 좌표를 화면 좌표로 바꿀 때와 PoC 3(핀) 계산에 쓴다 |
| `wheelAction(input)` | 〃 | `{dx, dy, ctrl, meta, deltaMode}` → `{zoom: factor}` 또는 `{pan: dx, dy}`. Ctrl 또는 Cmd면 줌(`exp(-dy * k)`, 한 번에 [1/1.25, 1.25]로 자름), 아니면 팬. `deltaMode` 1(줄) · 2(페이지)는 px로 환산 |
| `parseCanvasMessage(data)` | `app/src/renderer/canvasMessage.ts` | `unknown` → `layout` · `wheel` 메시지 또는 `null`. 숫자는 유한해야 하고 높이는 0 이상. 잘못된 프레임 항목은 그 항목만 버리고, 빈 `id`는 살린다. 프레임 1,000개, 문자열 200자를 넘으면 자르고 `truncated`를 세운다. 그 밖의 키는 버린다 |
| `acceptCanvasMessage(event, frameWindow)` | `app/src/renderer/canvasMessage.ts` | 흐름 5의 수신 조건(`source`, `origin === "null"`)을 통과하면 `parseCanvasMessage` 결과를, 아니면 `null`을 돌려준다. 변형 증명 대상 |
| `canvasViewUpdate(prev, entries, open)` | `app/src/renderer/canvasView.ts` | 흐름 11의 결과(`reload` · `resize` · `clear(reason)` · `errorLine` · `none`) |
| `canvasRows` (확장) | `app/src/main/view.ts` | `width`를 `doan ls` 값 그대로 싣는다(양의 안전 정수일 때만). meta를 TS에서 다시 파싱하지 않는다 |
| `isCanvasFrame(url, base, parentIsMain)` · `allowFrameNavigation(current, next, base, fromApp)` | `app/src/main/canvasFrame.ts` | 주입 대상과 탐색 허용 판단. `base`는 `http://127.0.0.1:<port>/t/<token>/`. `isCanvasFrame`의 `parentIsMain`은 부모가 있고 그 부모의 `parent`가 `null`인지다(객체 비교 아님). `fromApp`은 보안 절의 initiator 판단이다. 탐색 제한을 건너뛰는 것은 증명된 손자 프레임뿐이고, `parentIsMain`이 거짓이라는 이유만으로 건너뛰지 않는다(보안 절 '탐색 제한') |
| `fromAppFrame(event, win)` | `app/src/main/canvasFrame.ts` | IPC 발신 확인(보안 절) |

정할 값(구현 때 상수로 두고 테스트로 고정): 배율 범위 0.05–4, 버튼·메뉴 한 단계 1.25배, 휠 이벤트 한 번 상한 1.25배, 맞춤 여백 32px, 맞춤 · 프레임 점프 배율 상한 1, 팬 제한 없음, 첫 `layout` 대기 5초, 프레임 1,000개, 문자열 200자, 높이 초깃값 150px, 높이 상한 200,000px(PoC 1에서 정함. 측정 규칙은 'PoC 의존'의 'PoC 결과').

## 형식 변경

없다. JSON Schema(ARCHITECTURE §11)와 `v`는 그대로다. 주입 스크립트와 렌더러 사이 메시지는 같은 앱 빌드 안의 내부 통신이라 공유 형식이 아니고, 스키마를 두지 않는다.

## 규약 영향

ARCHITECTURE §1 규약과 `doan check` 규칙은 바뀌지 않는다. `doan:width` 누락 안내는 기존 `missing_width` · `invalid_width`를 가리킬 뿐이다.

## 결정 영향

- **sandbox iframe, `allow-same-origin` 없음, iframe 바깥 transform, 주입 스크립트 + `postMessage`(ARCHITECTURE §3)**: 그대로 따른다. 새 결정은 주입 방법(Q1: main `executeJavaScript`), 입력 전달(Q3: 주입 스크립트가 휠을 넘기고 내부 스크롤은 통과), 보드의 overlay 층, 앱 메뉴다.
- **서빙 범위 · 토큰 경로 · CORS(§3)**: 서버 코드는 바꾸지 않는다(Q1). 캔버스 iframe의 탐색은 처음 연 폴더의 서빙 경로 아래로 묶는다.
- **감시(§13)**: `design/` 밖 서빙 경로를 감시 대상에 더하고(Q4), 콜백은 두 플래그를 알린다. `.doan/` 아래는 리로드 대상이 아니다.
- **보안 기본값(§7)**: 세션 권한 deny-all을 더하고, IPC 확인에 발신 프레임 조건을 더한다. 앱 메뉴를 직접 정의하므로 §7에 메뉴 구성도 적는다. ARCHITECTURE §3 103행의 미래형 문장("When feature #5 loads…")은 승격 때 현재형 결정으로 바꾼다.

## PoC 의존

PRODUCT §6의 미통과 항목에 기댄다. 둘 다 task 0에서 먼저 돌린다. 하나라도 실패하면 멈추고 사용자에게 재결정을 요청한다.

- **PoC 1** (sandbox iframe + 주입 스크립트): Electron 45, `.scratch/`. `allow-same-origin` 없는 iframe에서 확인한다. 각 항목은 통과·실패로 기록한다.
  1. 주입: `executeJavaScript`가 서로 다른 출처의 iframe(OOPIF)에서 동작한다. 어느 이벤트에서 주입했는지, 리로드 뒤 다시 주입되는지도 적는다. 서버 응답 삽입으로만 되면 실패다.
  2. 높이: 아래 다섯 사례에서 측정값이 콘텐츠 높이와 ±1px 안이고 안정된다. 측정 규칙(예: 리로드 때 높이 초기화, `body` 기준 측정)과 높이 상한을 여기서 정한다.
     - 일반 캔버스
     - `min-height: 100vh` 캔버스
     - `min-height: 100vh` + `padding`, 또는 `height: calc(100vh + N)` 캔버스. iframe을 키울 때마다 콘텐츠도 커지는 경우로, 무한히 늘지 않고 멈춰야 한다
     - 리로드 뒤 내용이 줄어든 캔버스
     - 아주 긴 캔버스(약 50,000px)를 배율 0.05로 볼 때. 렌더링과 메모리를 확인한다
  3. 휠: 커서가 iframe 위에 있을 때 일반 휠과 `ctrlKey` 휠이 렌더러로 전달된다. 배율 0.25와 4에서 iframe 위와 여백 위의 팬 거리가 같다(transform이 delta에 주는 영향 측정). 스크롤 가능한 내부 요소 위에서는 그 요소가 스크롤된다.
  4. 메뉴 단축키: 포커스가 iframe 안에 있을 때 메뉴 accelerator(Cmd+=, Cmd+0, Shift+1)가 동작하고 페이지 줌이 일어나지 않는다.
  5. 탐색: 렌더러가 새 iframe에 넣는 첫 `src`가 `will-frame-navigate`에서 허용되고, 캔버스 안 링크로 다른 폴더 키나 토큰 밖으로 가는 탐색은 거부된다.
  6. 선택: PoC 1 원래 기준인 클릭 선택과 하이라이트(#6 대비). 결과는 #6의 근거로 PRODUCT §6에 남긴다.
- **PoC 3** (줌 중 핀 위치): 주입 스크립트가 보낸 요소 사각형에 overlay 층의 표식을 붙인다. 줌 · 팬 · 리로드 뒤에도 표식과 요소의 오차가 1px 이하인지 본다.

### PoC 결과 (2026-10-22, 항목 5만 설계 규칙대로는 실패, `initiator` 규칙으로 통과)

자세한 관찰은 PRODUCT §6에 있다. 뒤 배치가 따를 값과 주의점만 여기 적는다.

- **주입 이벤트**: webContents `did-frame-navigate`(`isMainFrame`이 false인 것)에서 `webFrameMain.fromId(frameProcessId, frameRoutingId)`로 프레임을 얻고, `isCanvasFrame`을 통과하면 `executeJavaScript`를 실행한다. 이때 문서는 `readyState` `loading`이므로, 스크립트는 `DOMContentLoaded` 뒤에 관찰자를 건다. 리로드와 캔버스 안 링크 이동 때마다 다시 주입됐다. 프레임 `dom-ready`도 동작했지만 프레임마다 리스너를 따로 관리해야 해서 쓰지 않는다. `frame-created`는 아직 `about:blank`라 쓸 수 없다.
- **주입 스크립트 형태**: `executeJavaScript`는 코드 문자열을 받는다. PoC는 import나 바깥 변수를 쓰지 않는 함수 하나를 문자열로 읽어 `(${src})(opts); void 0;`로 감싸 실행했다. 실제 앱도 번들러가 바깥 참조를 끌어들이지 않도록 스크립트를 자기완결적으로 둔다. 스크립트는 캔버스의 main world에서 돈다. `WebFrameMain`에는 isolated world 실행이 없어서, 캔버스 스크립트가 주입 스크립트의 전역을 볼 수 있다(흐름 5의 위조 가능 전제와 같다).
- **주입 스크립트 위치와 빌드 (B3)**: 원본은 `app/src/main/canvasScript.ts`의 함수 `canvasScript`다. main 번들 안에서 `canvasScriptSource()`가 `Function.prototype.toString()`으로 문자열을 만들고, `(canvasScript)({nextHeight, canScrollAxis, clipText}); void 0;` 꼴로 감싼다. 순수 도우미(높이 고정 판단 `nextHeight`, 스크롤 가능 판단 `canScrollAxis`, 문자열 자르기 `clipText`)는 같은 파일에서 따로 export해 단위 테스트하고, 바깥 변수를 참조하지 않도록 인자로 넘긴다. 이렇게 하면 별도 빌드 설정이나 `?raw` import 없이 타입 검사를 받는다. 자기완결성은 `canvasScript.test.ts`가 새 `vm` 컨텍스트에서 문자열을 실행해 확인한다. 빌드된 앱에서도 주입과 `layout` 수신을 B3 프로브로 확인했다.
- **높이 측정 규칙**:
  - 렌더러는 `src`를 넣을 때마다(열기 · 리로드) iframe 높이를 150px로 초기화한다. 초기화하지 않으면 `min-height: 100vh` 캔버스는 이전 높이보다 줄어들 수 없다.
  - 렌더러는 직전 `layout`과 `href`가 다른 `layout`이 와도 150px로 초기화한다. 캔버스 안 링크로 새 문서가 열린 경우다. 이 문서는 이전 높이를 물려받으므로, 초기화하지 않으면 위와 같은 문제가 생긴다. PoC는 링크 이동 뒤의 높이를 확인하지 않았다.
  - 주입 스크립트는 `Math.ceil(document.documentElement.getBoundingClientRect().height)`를 `height`로 보낸다. `scrollHeight`는 쓰지 않는다. CSSOM 표준에서 `scrollHeight`는 `clientHeight`(뷰포트 높이)보다 작아지지 않기 때문이다. 이 근거는 표준 동작이고, PoC에서 따로 측정해 남기지 않았다.
  - 고정: 자기 리사이즈 직후에도 문서가 `innerHeight` + 1보다 크면, 내용이 뷰포트를 따라 커지는 캔버스로 보고 직전 높이로 고정한다. "자기 리사이즈 직후"는 `innerHeight`가 직전에 보낸 높이 ±1로 바뀐 뒤다. `innerHeight`가 바뀌지 않았으면 고정하지 않는다.
  - 고정은 그 문서가 끝날 때까지 풀리지 않는다. 다음 로드나 새 `href`로 인한 초기화(위)가 있어야 다시 잰다. 그 사이 늦게 뜬 이미지나 DOM 변경으로 생긴 증감은 반영하지 않는다.
  - 높이 상한 200,000px는 렌더러가 건다. 주입 스크립트는 자르지 않은 값을 보낸다. 200,000px 보드도 배율 0.05에서 렌더링됐고, 앱 전체 메모리는 약 45MB 늘었다.
  - 한계: `height: calc(100vh + N)`처럼 고정점이 없는 캔버스는 첫 측정값에서 멈추고 아래가 잘린다. PoC의 `calcvh`(hero `calc(100vh + 200px)` + 300px 프레임)는 650에 고정됐고, 문서는 1150이 되어 500px가 잘렸다. hero의 200px와 두 번째 프레임 300px 전체다. `min-height: 100vh` + `padding: 40px`도 580에 고정되어 아래 padding 80px가 잘렸다.
  - 한계: 고정된 높이보다 아래에 있는 프레임도 `layout.frames`에는 나온다(위 `calcvh`의 두 번째 프레임은 y 850). 이 프레임으로 점프하면 아무것도 보이지 않는다. 렌더러가 이런 프레임을 어떻게 다룰지는 B4에서 정한다.
  - 한계: 리사이즈와 다음 측정 사이에 다른 이유로 1px 넘게 자라면 보통 캔버스도 고정될 수 있다. 이 오판은 받아들인다.
  - 흐름 밖(absolute) 요소가 `html` 높이를 넘는 경우는 확인하지 않았다.
- **첫 `layout`은 동기로 보낸다**: iframe이 화면 밖에 있으면 rAF가 멈춰, rAF로 묶은 `layout`이 화면에 다시 보일 때까지 오지 않았다. 시작 시점의 `layout`과 `measure` 응답은 rAF를 거치지 않고 바로 보낸다.
- **휠 delta**: iframe이 받는 `deltaX` · `deltaY`는 배율(0.25 · 1 · 4)과 관계없이 화면 px다. `wheelAction`에 그대로 넣고, 배율을 곱하거나 나누지 않는다. `clientX + scrollX`는 배율 1에서 보드 좌표와 정확히 맞았다. `clientX`가 정수라서, 배율이 크면 보드 1px(화면에서는 배율만큼의 px)까지 어긋날 수 있다(배율 4에서 12.5 대신 12). 커서 기준 줌의 0 어긋남은 배율 1에서 1.25로 갈 때만 쟀다.
- **메뉴 단축키**: 실제 OS 키 입력(System Events)으로는 iframe에 포커스가 있어도 동작했다. Playwright `keyboard.press`(CDP 합성 키)는 네이티브 메뉴에 닿지 않으므로, e2e는 main에서 메뉴 항목을 직접 실행해 확인한다.
  - 한계: Shift+1은 `!` 입력과 같은 키라서, 캔버스 안 입력란(나중에는 #7 코멘트 입력란)에 `!`를 칠 때 메뉴가 키를 가로챌 수 있다. PoC는 확인하지 않았다. B3에서 확인한다.
- **탐색과 `initiator` (2026-10-22 사용자 결정: `initiator` 규칙 채택, 판단 방식은 보안 절 '탐색 제한')**: Electron 45의 `will-frame-navigate`는 `details.initiator`를 준다. 렌더러가 넣은 `src`의 initiator는 앱 메인 프레임(부모 없음)이고, 캔버스 안 링크의 initiator는 캔버스 프레임이다. 첫 탐색의 `details.frame.url`은 `about:blank`이고 부모는 창의 메인 프레임이다.
  - 보안 절의 규칙("현재 URL이 `about:blank`면 토큰 경로 아래 허용")에는 구멍이 두 개 있었다.
    - 캔버스가 스스로 `about:blank`로 이동하면(`location.href`, `target=_self` 링크) `will-frame-navigate`가 오지 않는다. 그 프레임에서 시작한 다른 폴더 키로의 탐색이 이 규칙으로 허용됐다. PoC에서는 Playwright가 그 문서에서 스크립트를 실행했다. 캔버스 내용만으로 그렇게 할 수 있는지는 확인하지 못했다.
    - CSP에 막힌 링크 뒤 main이 보는 프레임 URL은 막힌 URL(`https://example.com/`)이다. 그래서 같은 iframe에 `src`를 다시 넣는 리로드가 거부되고, 캔버스가 오류 페이지에 남았다.
  - 채택한 규칙: initiator가 창의 메인 프레임이고 새 URL이 토큰 경로 아래면 허용하고, 그 밖에는 토큰 URL에서 같은 폴더 키로 가는 탐색만 허용한다. 이 규칙에서는 두 구멍이 모두 막혔고, 나머지 사례는 결과가 같았다. 다른 점은 같은 iframe의 `src`를 다른 폴더 키로 바꾸는 것이 허용된다는 것뿐이다. 설계 규칙의 결과는 `results/t5-default.json`, 채택한 규칙의 결과는 `t5-app.json` · `t5c-app.json` · `t5d-app.json`에 있다(모두 `.scratch/poc1-canvas/`).
  - PoC는 initiator를 `details.initiator === mainFrame` 객체 비교로 판단했다. 구현은 `fromAppFrame`처럼 `initiator.parent === null`로 판단한다(보안 절). `allowFrameNavigation`에는 이 값이 `fromApp` 인자로 들어간다.
  - 흐름 1처럼 캔버스를 열 때마다 iframe을 새로 만든다.
  - 다른 호스트 · `data:`로 가는 탐색은 렌더러 CSP `frame-src`가 먼저 막는다. 이때 `will-frame-navigate`는 오지 않고, 프레임은 `chrome-error://chromewebdata/`에 남아 주입도 `layout`도 없다. 렌더러는 첫 `layout` 대기(5초)로 이 상태를 처리한다. 해시 이동에는 `will-frame-navigate`가 오지 않는다.
- **PoC가 다루지 않은 경우**: 아래는 시험하지 않았다. B3 · B4가 테스트로 맡는다.
  - `details.initiator`가 `null`이거나 없는 탐색(브라우저가 시작한 탐색, initiator 프레임이 이미 사라진 경우). 규칙상 앱이 시작하지 않은 것으로 본다.
  - `details.frame === null`. 코드에서는 거부하지만 실제로 관찰하지 못했다.
  - 손자 프레임: 손자가 `target=_parent`로 캔버스를 이동하려는 경우(물려받은 sandbox 탐색 플래그가 막을 것으로 본다), 손자가 `/t/<token>/<다른 폴더 키>/…`를 불러오는 경우(손자는 제한하지 않으므로 다른 폴더의 캔버스를 임베드할 수 있을 것으로 본다).
  - 창 메인 프레임의 리로드, 렌더러 프로세스 재시작 뒤의 initiator 판단.
  - 빠르게 이어지는 탐색. `details.frame.url`은 대기 중인 URL이 아니라 확정된 URL이다.
  - 새 규칙에서도 캔버스가 스스로 `about:blank`로 이동할 수 있다(`will-frame-navigate`가 오지 않는다). 그러면 캔버스는 빈 화면에 낡은 프레임 목록이 남고 주입도 없다. `layout`이 이미 왔으므로 첫 `layout` 대기(5초)로도 잡히지 않는다. 이때 렌더러 상태는 B4에서 정한다.
  - 캔버스가 자기 자신을 `javascript:` URL로 이동하는 경우(`will-frame-navigate`가 오지 않을 것으로 본다).
- **e2e 주의**: Playwright `boundingBox()`는 배율이 걸린 iframe 안 요소의 배율을 반영하지 않는다(배율 0.25에서 폭 120, 실제 30). iframe 안 요소의 화면 위치는 `layout` 좌표와 보드 transform으로 계산한다.

## POSTMORTEM에서 가져온 함정

- "Local server guarantees lived in comments and echoed constants, not in behavior": 보안 테스트는 관찰한 동작으로 단언하고, 각 테스트가 코드 변형으로 빨개지는지 확인한다(tasks 7의 변형 표). 권한 테스트는 Permissions Policy가 먼저 막는 캔버스 iframe이 아니라 앱 메인 프레임에서 한다. 그래야 핸들러를 지웠을 때 실패한다.
- "Guessing the repo root in TS ... re-created a discovery rule differently": 폭은 `doan ls` `width`만 쓰고 TS에서 meta를 다시 읽지 않는다. scope도 `doan ls` `result.scope`만 쓰고 config를 직접 읽지 않는다. 프레임 목록을 DOM에서 가져오는 것(Q2)은 Go 규칙을 다시 만드는 것이 아니라 화면에 실제로 그려진 것을 읽는 것이다. 그래서 TS 쪽은 `[data-doan-frame]` 선택 외에 거르거나 고치는 규칙을 두지 않는다.
- "Sorting file names does not sort the ids derived from them": 프레임 목록은 다시 정렬하지 않는다. DOM 문서 순서를 그대로 쓴다.
