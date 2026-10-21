# canvas-view — design

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 main (`app/src/main/`) | 캔버스 iframe에 스크립트 주입, 세션 권한 deny-all, IPC `senderFrame` 확인, 캔버스 iframe 탐색 제한, `design/` 밖 서빙 경로 감시 추가, 감시 이벤트에서 서빙 파일 변경 구분 |
| 앱 preload | 바뀌지 않는다. iframe과의 통신은 렌더러의 `postMessage`로 한다 |
| 앱 renderer (`app/src/renderer/`) | 사이드바(폴더 · 캔버스 · 프레임 목록) + 캔버스 뷰(보드 · 툴바), 줌·팬, 프레임 점프, 리로드, `doan:width` 누락 안내 |
| 빌드 (`electron.vite.config.ts`) | 렌더러 CSP에 `frame-src http://127.0.0.1:*` 추가 |
| e2e (`app/e2e/runtime.ts`) | 캔버스 뷰 단계 추가 |
| CLI · `doan mcp` · 스킬 · 형식 | 바뀌지 않는다. `doan ls`의 `width` · `frames`를 그대로 쓴다 |

## 흐름

1. 렌더러가 캔버스를 고르면 `CanvasRow.url`(이미 있음)을 `src`로 하는 iframe을 `sandbox="allow-scripts"`로 만든다. 폭은 `CanvasRow.width`(새 필드, `doan ls` `width`).
2. main이 그 iframe 프레임을 알아보고(창 메인 프레임의 직계 자식 + URL이 로컬 서버 토큰 경로 아래) 주입 스크립트를 실행한다. **주입 방법 (Q1 결정)**: main의 `WebFrameMain.executeJavaScript`. 서버는 디스크 바이트를 그대로 보낸다. 서로 다른 출처의 iframe(OOPIF)에서도 되는지는 PoC 1로 확인하고, 안 되면 서버 응답 삽입으로 바꾼다.
3. 주입 스크립트는 다음을 부모에게 `postMessage`로 보낸다.
   - `layout`: 콘텐츠 높이와 프레임 목록 `[{id, title?, x, y, width, height}]`(보드 좌표). 로드 직후, `document.fonts.ready` 뒤, `ResizeObserver`가 알릴 때마다 rAF 단위로 묶어 보낸다.
   - `wheel`: iframe 안에서 난 휠 이벤트를 `preventDefault()` 하고 `{dx, dy, ctrl, deltaMode, x, y}`(보드 좌표)로 넘긴다(Q3 결정). 오버레이로 입력을 가로채지 않으므로 캔버스의 hover 상태는 살아 있고, #6의 클릭 선택도 같은 주입 스크립트가 맡는다(ARCHITECTURE §3).
4. 렌더러는 `event.source === iframe.contentWindow`인 메시지만 받고, 내용은 `parseCanvasMessage`로 검증한 뒤 데이터로만 쓴다. 캔버스 스크립트도 같은 창에서 돌기 때문에 메시지를 위조할 수 있다. 위조해도 높이와 프레임 목록이 틀어질 뿐이고, 앱 UI나 디스크에는 닿지 못한다.
5. 줌·팬은 보드 래퍼에 `transform: translate(x, y) scale(s)`를 걸어 iframe 바깥에서 한다(ARCHITECTURE §3). 캔버스 HTML은 이를 모른다.
6. 프레임 목록 **출처 (Q2 결정)**: 주입 스크립트가 보낸 렌더된 DOM의 `[data-doan-frame]`, 문서 순서. 점프에 필요한 위치는 DOM에만 있고, 스크립트로 그린 프레임도 보인다. 그래서 `doan ls` `frames`(정적 HTML 기준)와 다를 수 있다. 빈 id와 중복 id도 화면에 있는 그대로 보여 주고, 고칠 일은 `doan check`(`empty_frame_id` · `duplicate_frame_id`)에 맡긴다.
7. 라이브 리로드: 감시자가 서빙 범위 안 파일의 변경을 따로 표시하고, shell은 그 폴더의 `servedRev`를 올려 `FolderEntry`에 싣는다. 렌더러는 열린 캔버스가 속한 폴더의 `servedRev`가 바뀌면 iframe `src`를 다시 넣는다. 같은 폴더의 다른 캔버스나 공유 CSS가 바뀌어도 리로드한다(공유 CSS 변경을 놓치지 않기 위해 감수). `.doan/` 변경(코멘트)은 리로드하지 않는다.
   - **`design/` 밖 서빙 경로도 감시한다 (Q4 결정)**: `doan ls` `result.scope` 중 `design`이 아닌 항목(`tokenCss`, `serve`)을 감시에 더한다. 디렉터리는 재귀, 파일은 그 파일이 든 디렉터리를 비재귀로 감시하고 파일 이름으로 거른다(에디터의 원자적 저장은 파일을 rename으로 바꿔 파일 단위 감시가 끊기기 때문). scope가 바뀌면 다시 읽을 때마다 감시 대상을 맞춘다. 이 항목들의 변경은 `servedRev`만 올리고 `doan ls`를 다시 돌리지 않는다(목록이 바뀌지 않으므로). 이 규칙은 ARCHITECTURE §13 "serve paths outside `design/` and `.doan/` are not watched"를 바꾼다.
8. 열린 캔버스가 다시 읽은 목록에서 사라지면(파일 삭제, 폴더 닫힘, 폴더 오류) 캔버스 뷰를 비우고 이유를 보여 준다.

## 화면 (디자인 초안 없음, plain DOM)

- **배치 (Q5 결정)**: 왼쪽 사이드바에 기존 폴더 · 캔버스 목록과, 열린 캔버스의 프레임 목록. 오른쪽에 캔버스 뷰와 툴바(축소 · 배율 % · 확대 · 맞춤).
- 단축키는 앱 문서에 포커스가 있을 때만 받는다. 포커스가 iframe 안에 있으면 키 이벤트는 캔버스로 간다(이번 범위에서 전달하지 않음).

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

| 함수 | 위치 | 내용 |
|---|---|---|
| `zoomAt(view, factor, point, limits)` | `app/src/renderer/viewport.ts` | 화면 좌표 `point`가 같은 보드 지점을 가리키도록 유지하며 배율을 바꾼다. 범위 밖이면 경계값으로 자른다 |
| `panBy(view, dx, dy)` | 〃 | 이동만. 보드가 화면 밖으로 완전히 나가지 않게 막을지는 아래 '정할 값' 참고 |
| `fitWidth(boardWidth, viewport, margin)` | 〃 | 보드 폭을 뷰포트 폭에 맞춘 배율과 위치(맨 위 정렬) |
| `fitRect(rect, viewport, margin, maxScale)` | 〃 | 프레임 사각형이 여백 안에 들어오는 배율(상한 `maxScale`)과 가운데 정렬 위치 |
| `boardToScreen` · `screenToBoard` | 〃 | 좌표 변환. iframe이 보낸 휠 좌표를 화면 좌표로 바꿀 때와 PoC 3(핀) 계산에 쓴다 |
| `wheelAction(input)` | 〃 | `{dx, dy, ctrl, deltaMode}` → `{zoom: factor}` 또는 `{pan: dx, dy}`. `ctrlKey`면 줌(`exp(-dy * k)`), 아니면 팬. `deltaMode`가 줄·페이지 단위면 px로 환산 |
| `parseCanvasMessage(data)` | `app/src/renderer/canvasMessage.ts` | `unknown` → `layout`·`wheel` 메시지 또는 `null`. 숫자는 유한하고 높이는 0 이상, 문자열은 비어 있지 않은 `id`, 배열 길이 상한. 그 밖의 키는 버린다 |
| `canvasRows` (확장) | `app/src/main/view.ts` | `width`를 `doan ls` 값 그대로 싣는다(양의 안전 정수일 때만). meta를 TS에서 다시 파싱하지 않는다 |
| `isCanvasFrame(url, base, parentIsMain)` · `allowFrameNavigation(url, base)` | `app/src/main/canvasFrame.ts` | 주입 대상과 탐색 허용 판단. `base`는 `http://127.0.0.1:<port>/t/<token>/` |

정할 값(구현 때 상수로 두고 테스트로 고정): 배율 범위 0.05–4, 버튼·단축키 한 단계 배율 1.25배, 맞춤 여백 32px, 프레임 점프 배율 상한 1(100%보다 크게 확대하지 않음), 팬 제한 없음.

## 형식 변경

없다. JSON Schema(ARCHITECTURE §11)와 `v`는 그대로다. 주입 스크립트와 렌더러 사이 메시지는 같은 앱 빌드 안의 내부 통신이라 공유 형식이 아니고, 스키마를 두지 않는다.

## 규약 영향

ARCHITECTURE §1 규약과 `doan check` 규칙은 바뀌지 않는다. `doan:width` 누락 안내는 기존 `missing_width` · `invalid_width`를 가리킬 뿐이다.

## 결정 영향

- **sandbox iframe, `allow-same-origin` 없음, iframe 바깥 transform, 주입 스크립트 + `postMessage`(ARCHITECTURE §3)**: 그대로 따른다. 주입 방법(Q1)은 새로 정할 결정이다.
- **서빙 범위 · 토큰 경로 · CORS(§3)**: 서버 코드는 바꾸지 않는다(Q1 결정). 캔버스 iframe의 탐색을 토큰 경로 아래로 묶어, 캔버스 안 링크가 외부 페이지를 앱 안에 띄우지 못하게 한다. 캔버스 안에 중첩된 iframe(예: 외부 임베드)은 막지 않는다(규약 9: 외부 리소스 허용).
- **감시(§13)**: `design/` 밖 서빙 경로를 감시 대상에 더한다(Q4). 콜백은 서빙 파일 변경 여부를 함께 알린다. 심링크 처리는 §13 규칙을 따른다: scope 항목은 이미 실제 경로라 그대로 감시한다.
- **보안 기본값(§7)**: 세션 권한 deny-all을 더한다. IPC 확인을 `event.sender === win.webContents`에서 `event.senderFrame === win.webContents.mainFrame`으로 좁힌다.

## PoC 의존

PRODUCT §6의 미통과 항목에 기댄다. 둘 다 task 0에서 먼저 돌린다.

- **PoC 1** (sandbox iframe + 주입 스크립트): Electron 45, `.scratch/`. `allow-same-origin` 없는 iframe에서 다음을 확인한다.
  - Q1 방식으로 주입이 되는가(서로 다른 출처의 iframe은 별도 프로세스(OOPIF)로 뜰 수 있다). 안 되면 서버 응답에 `<script>`를 끼우는 방식으로 다시 시도하고 결과를 기록한다.
  - 높이 측정: 일반 캔버스, `min-height: 100vh` 캔버스, 리로드 뒤 내용이 줄어든 캔버스. `scrollHeight`는 뷰포트보다 작아지지 않아서, iframe을 키운 뒤에는 줄어든 높이를 못 잴 수 있다. 측정 규칙(예: 리로드 때 높이 초기화, `body` 기준 측정)을 이 실험으로 정한다.
  - 휠·핀치 전달(Q3)이 커서가 iframe 위에 있을 때 작동하는가.
  - PoC 1 원래 기준인 클릭 선택과 하이라이트도 실험에서만 확인한다(#6 대비).
- **PoC 3** (줌 중 핀 위치): 주입 스크립트가 보낸 요소 사각형에 transform 레이어 안 표식을 붙이고, 줌·팬·리로드 뒤에도 요소에 붙어 있는지 본다.

## POSTMORTEM에서 가져온 함정

- "Local server guarantees lived in comments and echoed constants, not in behavior": 보안 테스트(권한 거부, 탐색 차단, `senderFrame`)는 관찰한 동작으로 단언하고, 각 테스트가 코드 변형으로 빨개지는지 확인한다. 예: deny 핸들러를 지우면 e2e의 권한 요청 단계가 실패해야 한다.
- "Guessing the repo root in TS ... re-created a discovery rule differently": 폭은 `doan ls` `width`만 쓰고 TS에서 meta를 다시 읽지 않는다. 프레임 목록을 DOM에서 가져오는 것(Q2)은 Go 규칙을 다시 만드는 것이 아니라 화면에 실제로 그려진 것을 읽는 것이다. 그래서 TS 쪽은 `[data-doan-frame]` 선택 외에 거르거나 고치는 규칙을 두지 않는다.
- "Sorting file names does not sort the ids derived from them": 프레임 목록은 다시 정렬하지 않는다. DOM 문서 순서를 그대로 쓴다.
