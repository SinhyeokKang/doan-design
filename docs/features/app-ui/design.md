# app-ui — design

## 레퍼런스 (출처)

- 톤: Sorcerer — github.com/gbrasil720/sorcerer (MIT, SwiftUI). 2026-10-22에 README와 스크린샷 `docs/screenshots/feed.png` · `new-experiment-brief.png`을 확인했다. 가져온 것은 어두운 중립색, 대문자 섹션 라벨, 촘촘한 밀도, 단축키 표시, 오렌지 하나다. README 배지 색 `F0773A` · `ECEBE4` · `8F8E87`을 토큰에 썼다. 모노스페이스는 쓰지 않는다(2026-10-22 사용자).
- 구성: Figma식 레이어 패널과 디자인 패널, 캔버스 위 프레임 이름과 선택 치수. 기억에 기댄 것이고 화면으로 다시 확인하지 않았다. 초안 머리말에도 그렇게 적었다.
- 검토만 하고 쓰지 않은 것: Intent(intentapp.dev, 밝은 톤), V2(Storybook식 아래 애드온 패널), V3(Sorcerer 배치 그대로). 사용자가 V1을 골랐다.

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| `design/` · `.doan/` (이 리포) | `doan init`, 초안 캔버스 `design/app-shell.html`, 토큰 CSS(위치는 아래 '토큰') |
| 앱 renderer | React + shadcn/ui + Tailwind로 다시 만든다. `viewport.ts` · `canvasMessage.ts` · `canvasView.ts`는 그대로 쓴다 |
| 앱 main | 메뉴 문구 영어, 메시지 상자 문구 영어, 창 수명주기(macOS), Reopen IPC |
| 앱 preload | `reopenFolder(path)` 하나를 더한다 |
| 앱 shell | `reopen(path)`: 저장된 경로를 다시 읽고 감시를 다시 건다 |
| 빌드 | `electron.vite.config.ts`에 React · Tailwind 플러그인. CSP는 tasks 0 결과에 따른다 |
| e2e | 선택자를 role과 접근 이름으로 바꾸고, 문구 기대값을 영어로 바꾼다 |
| CLI · MCP · 스킬 · 형식 | 바뀌지 않는다 |

## 흐름

1. **화면 구조 (V1)**: `App` → `TopBar` · `Sidebar`(`ProjectTree`, `FrameList`) · `CanvasPane` · `RightPanel`(`CanvasTab`). 상태는 지금의 `main.ts`와 같은 모양으로 둔다: 폴더 목록(`FolderEntry[]`, main에서 IPC로 받음), 열린 캔버스, 레이아웃(마지막 `layout`), 화면 상태.
2. **CanvasPane과 명령형 경계**: `CanvasPane`은 컨테이너 div와 보드 래퍼 ref만 렌더하고, iframe 생성 · `src` 넣기 · `message` 수신 · 휠 · transform은 지금 `main.ts`의 명령형 코드를 옮긴 `CanvasController`가 맡는다. React에는 줌 %, 화면 상태, 프레임 목록, 갱신 시각처럼 화면 문구가 바뀌는 값만 콜백으로 올린다. transform은 rAF 안에서 DOM에 직접 쓴다.
   - 이 경계를 지키는 이유: 휠 이벤트마다 React가 다시 그리면 느리다. 또 canvas-view의 경쟁 상태 처리(새 iframe per load, 1초 no-layout 판단, `viewport` 높이 규칙)는 POSTMORTEM 두 건의 결과라 모양을 바꾸지 않는다.
3. **Activity**: 렌더러가 열린 캔버스별로 `{at, kind: "opened" | "reloaded"}`를 메모리에 쌓는다. 최근 50개만 두고 최근 것이 위다. 재시작하면 사라진다. 어떤 파일이 바뀌었는지는 알 수 없다(`servedRev`는 바뀐 파일을 싣지 않는다). 그래서 파일 이름은 보여 주지 않는다.
4. **Reopen**: Not found 항목의 Reopen → IPC `folders:reopen(path)` → shell이 `attach(folder)`(감시를 다시 걸고 `refresh`)를 다시 부른다. 경로 판정은 지금처럼 `readFolder`(Go `doan ls`)에 맡긴다. TS에서 경로를 새로 추측하지 않는다(POSTMORTEM 2026-10-22). Close는 지금의 닫기와 같다.
5. **창 수명주기**: `window-all-closed`에서 끝내지 않는다. `activate`(Dock 클릭)에서 창이 없으면 새로 만든다. shell(감시 · 서버)은 앱 수명과 같고 창과 상관없다. 새 창은 `folders:get`으로 목록을 다시 받는다. ⌘Q(`before-quit`)는 지금처럼 `shell.dispose`를 부른다.
6. **문구**: 영어 문자열을 컴포넌트 안에 둔다. 초안 프레임의 문구가 정본이고, 바꾸면 초안도 같이 바꾼다. 메뉴: View — Zoom In ⌘=, Zoom Out ⌘−, Actual Size ⌘0, Fit ⌘1, Reload Canvas ⌘R, Enter Full Screen.
7. **e2e**: 요소를 role과 접근 이름으로 찾는다(예: `button "Zoom in"`, `treeitem "login.html"`, `region "Canvas"`). 테스트 전용 속성은 제품 코드에 넣지 않는다(`/runtime-test` 'Prohibited', `/design-sync` 결정과 같음). 기존 기대값은 그대로 두고, 문구만 영어로 바꾼다. 문구가 바뀌어도 동작 기대값은 그대로라는 것을 diff로 보인다.

## 토큰

- 토큰은 CSS 변수 한 벌이다(`--bg`, `--panel`, `--text`, `--accent` …, 지금 `design/tokens.css`). Tailwind는 이 변수를 테마 값으로 참조하고, 색 값을 따로 갖지 않는다.
- 초안과 구현이 같은 토큰 파일을 써야 `/design-sync`가 토큰 이름까지 맞춰 볼 수 있다.
- **위치 (2026-10-22 사용자)**: `app/src/renderer/tokens.css`가 정본이다. `.doan/config.json`의 `tokenCss`를 이 경로로 바꾸고, 초안은 `../app/src/renderer/tokens.css`를 링크한다. 앱이 토큰을 바꾸면 초안이 바로 따라간다.
- 초안 속 예시 캔버스 색(`--mock-*`)은 사람이 검토하는 디자인을 흉내 낸 것이라 앱 토큰이 아니다. `design/mock.css`로 옮기고, `doan check`의 `hardcoded_color` 경고를 받아들인다(`tokenCss`가 아닌 링크 CSS의 hex는 경고된다, 2026-10-22 확인).

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

| 함수 | 위치 | 내용 |
|---|---|---|
| `projectRow(entry)` | `app/src/renderer/projectRow.ts` | `FolderEntry` → 행 표시값 `{name, status?: "Config error" \| "CLI error" \| "Not found" \| "Not initialized" \| "Reading…" \| "No canvases", detail?, actions: ("reopen" \| "close")[]}`. 문구 표를 한 곳에 둔다 |
| `pushActivity(log, event, max)` | `app/src/renderer/activity.ts` | 최근 순 정렬, 최대 개수 자르기, 캔버스 키(폴더 path + 캔버스 path)별 분리 |
| `canvasInfo(row, layout, entry)` | `app/src/renderer/canvasInfo.ts` | Canvas 탭 값(Path, ID, Width, Frames 수, Open · Resolved). 값이 없으면 "—" |
| `frameLabel(frame)` | 기존 `canvasView.ts` 옆 | 지금의 label 규칙을 영어로: `data-doan-title` → id → "(no id)" |
| `quitOnAllClosed(platform)` | `app/src/main/lifecycle.ts` | macOS에서는 `false`. 앱은 Mac 전용이지만 판단을 이름 있는 함수로 둬 테스트한다 |

`viewport.ts` · `canvasMessage.ts` · `canvasView.ts` · `canvasFrame.ts` · `canvasScript.ts`의 순수 함수와 테스트는 그대로 둔다.

## 형식 변경

없다. JSON Schema, `v`, CLI 응답, `folders.json`은 그대로다.

## 규약 영향

ARCHITECTURE §1 규약과 `doan check` 규칙은 바뀌지 않는다. 이 리포가 처음으로 doan 규약을 따르는 캔버스를 갖는다.

## 결정 영향

- **ARCHITECTURE §7**: "renderer는 #6까지 plain DOM" → React + shadcn/ui + Tailwind. "창을 닫으면 앱 종료" → macOS 관례. 메뉴 문구 영어. preload API에 `reopenFolder`가 더해진다. CSP는 tasks 0 결과에 따라 그대로이거나 범위를 적어 넓힌다.
- **PRODUCT §5**: 기능 분할에 `app-ui`를 #5와 #6 사이에 더한다(번호를 하나씩 미룰지, 5.5로 둘지는 승격 때 정한다). Dogfooding의 "#6부터 초안 루프"를 "app-ui부터"로 바꾼다. 앱 화면 문구는 영어, 폴더의 화면 이름은 Project, MVP 테마는 다크 단일.
- **PRODUCT §8**: "창 닫기 = 종료", "폴더를 찾을 수 없음 복구 안내" 두 항목을 닫는다.
- **ARCHITECTURE §3**: 캔버스 뷰의 규칙(새 iframe per load, 높이, 줌, 탐색, 메시지 신뢰)은 바뀌지 않는다. 구현 위치만 `CanvasController`로 옮긴다.

## PoC · 사전 확인

PRODUCT §6의 미통과 PoC에는 기대지 않는다. 대신 tasks 0에서 스택을 먼저 확인한다.

- React · Radix · Tailwind가 빌드한 렌더러 CSP(`default-src 'self'`)에서 위반 없이 도는가. 확인할 위험 두 가지: Radix의 스크롤 잠금(`react-remove-scroll`)이 `<style>` 요소를 넣는지, dev의 React Fast Refresh가 inline 스크립트를 넣는지.
- 실패하면 멈추고 사용자에게 묻는다(CSP를 넓힐지, 그 컴포넌트를 쓰지 않을지).

## POSTMORTEM에서 가져온 함정

- "Local server guarantees lived in comments and echoed constants, not in behavior": 변형 증명 표(canvas-view 11줄)를 새 화면에서 다시 돌린다. 줄마다 테스트가 빨개지는지 확인한다.
- "A linked 100vh canvas kept the inherited iframe height" · "A canvas link to a document without the canvas script left a dead board": `CanvasController`로 옮길 때 새 iframe per load와 1초 no-layout 판단을 그대로 둔다. e2e C7 · C9가 지킨다.
- "Guessing the repo root in TS…": Reopen은 Go의 판정을 다시 쓴다. TS에서 경로를 판단하지 않는다.
