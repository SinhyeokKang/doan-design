# app-ui — design

## 레퍼런스 (출처)

- 톤: Sorcerer — github.com/gbrasil720/sorcerer (MIT, SwiftUI). 2026-10-22에 README와 스크린샷 `docs/screenshots/feed.png` · `new-experiment-brief.png`을 확인했다. 가져온 것은 어두운 중립색, 대문자 섹션 라벨, 촘촘한 밀도, 단축키 표시, 오렌지 하나다. README 배지 색 `F0773A` · `ECEBE4` · `8F8E87`을 토큰에 썼다. 모노스페이스는 쓰지 않는다(2026-10-22 사용자).
- 구성: Figma식 레이어 패널과 디자인 패널, 캔버스 위 프레임 이름과 선택 치수. 기억에 기댄 것이고 화면으로 다시 확인하지 않았다. 초안 머리말에도 그렇게 적었다.
- 검토만 하고 쓰지 않은 것: Intent(intentapp.dev, 밝은 톤), V2(Storybook식 아래 애드온 패널), V3(Sorcerer 배치 그대로). 사용자가 V1을 골랐다.

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| `design/` · `.doan/` (이 리포) | `doan init`, 초안 캔버스 `design/app-shell.html`(영어), `design/mock.css`, 토큰 위치(아래 '토큰') |
| 앱 renderer | React + shadcn/ui + Tailwind로 다시 만든다. `viewport.ts` · `canvasMessage.ts`는 그대로 쓴다. `canvasView.ts`는 문구(`cliErrorText`, `updatedText`)를 영어로 바꾸고 `frameLabel`을 다시 정의한다(아래 '순수 함수'). 진입 `main.ts`는 JSX 없이 `App.tsx`를 import한다(초안 Main의 `data-doan-implements="app/src/renderer/main.ts"`가 깨지지 않게). `index.html`은 `lang="en"`, `styles.css`는 지금처럼 `<link>`로 둔다 |
| 앱 main | `index.ts`: 메뉴(File 추가) · 메시지 상자 문구 영어, 창 숨기기 수명주기, 창 크기 · `hiddenInset`, Reopen IPC, `webContents.send` 앞 `isDestroyed()` 가드. `view.ts`: `CanvasRow`에 `id?` · `resolved`를 더하고(`canvasRows`가 `open`과 같은 검사 규칙으로 읽음), `openDecision` 문구 영어. `shell.ts`: 거절 문구 영어 |
| 앱 preload | `reopenFolder(path)`를 더한다. `onFolders` · `onViewCommand`는 해제 함수를 돌려준다(dev StrictMode가 effect를 두 번 돌려도 리스너가 겹치지 않게) |
| 앱 shell | `reopen(path)`: 항목을 loading으로 보낸 뒤 저장된 경로를 다시 읽고 감시를 다시 건다 |
| 빌드 | `electron.vite.config.ts`에 React · Tailwind 플러그인과 `@/` alias, `tsconfig.json`에 `jsx`와 `paths`, `components.json`. CSP는 task 1 결과에 따른다 |
| e2e | role · 접근 이름 · ARIA 상태로 읽고, 문구 기대값을 영어로 바꾼다(아래 흐름 9) |
| 테스트 기대값 | `shell.test.ts` · `view.test.ts` · `canvasView.test.ts`의 한국어 기대값이 영어로 바뀐다 |
| CLI · MCP · 스킬 · 형식 | 바뀌지 않는다. `CanvasRow`는 IPC 타입이고 공유 형식이 아니다 |

## 흐름

1. **화면 구조 (V1)**: `App` → `TopBar` · `Sidebar`(`ProjectTree`, `FrameList`) · `CanvasPane` · `RightPanel`(머리글 "Canvas", 탭 없음). 상태는 지금의 `main.ts`와 같은 모양으로 둔다: 폴더 목록(`FolderEntry[]`, main에서 IPC로 받음), 열린 캔버스, 레이아웃(마지막 `layout`), 화면 상태. IPC 구독은 preload가 돌려주는 해제 함수로 effect 정리 때 푼다.
2. **CanvasPane과 명령형 경계**: `CanvasPane`은 컨테이너 div와 보드 래퍼 ref만 렌더한다. iframe 생성 · `src` 넣기 · `message` 수신 · 휠 · transform은 지금 `main.ts`의 명령형 코드를 옮긴 `CanvasController`가 맡는다.
   - React는 보드 래퍼의 자식을 소유하지 않는다. iframe은 컨트롤러가 붙인다. 래퍼에는 `key` 변경이나 조건부 렌더를 쓰지 않는다.
   - transform은 지금처럼 동기로 DOM에 직접 쓴다(rAF로 바꾸지 않는다. e2e `waitView`와 frame jump 타이밍이 그대로여야 한다).
   - React에는 화면 문구가 바뀌는 값만 콜백으로 올린다: 반올림한 줌 %가 바뀔 때, 화면 상태, 프레임 목록, 갱신 시각. 팬에서는 콜백을 부르지 않는다. 이 조건은 컨트롤러 단위 테스트로 고정한다.
   - 컨트롤러는 `dispose()`에서 `message` · `wheel` 리스너와 `loadTimer` · `answerTimer`를 정리한다.
   - 이 경계를 지키는 이유: 휠 이벤트마다 React가 다시 그리면 느리다. 또 canvas-view의 경쟁 상태 처리(새 iframe per load, 1초 no-layout 판단, `viewport` 높이 규칙)는 POSTMORTEM 두 건의 결과라 모양을 바꾸지 않는다.
3. **Activity**: 렌더러가 열린 캔버스별로 `{at, kind: "opened" | "reloaded"}`를 메모리에 쌓는다. 최근 50개만 두고 최근 것이 위다. 창을 숨겨도 남고(흐름 5), 앱을 끝내면 사라진다. 어떤 파일이 바뀌었는지는 알 수 없다(`servedRev`는 바뀐 파일을 싣지 않는다). 그래서 파일 이름은 보여 주지 않는다.
   - 기록 시점: load의 첫 `layout`이 도착한 시각. 실패한 load(no-layout, 5초 응답 없음)는 기록하지 않는다.
   - Opened: 목록에서 캔버스를 고른 load, 캔버스 안 링크로 목록에 있는 다른 캔버스가 열린 경우(`markShown`, 그 캔버스 키로). Reloaded: 같은 캔버스의 다시 읽기(라이브 리로드, ⌘R, 실패 화면의 다시 읽기, 폭 없는 resize).
   - 시각은 로케일과 상관없이 24시간 `HH:MM:SS`다. 아래 왼쪽 "Updated HH:MM:SS"도 같은 형식이다.
4. **Reopen**: Not found · CLI error 항목의 Reopen → IPC `folders:reopen(path)`(`typeof path === "string"` 검사와 발신 프레임 확인은 다른 IPC와 같다) → shell이 항목을 `loading`으로 바꿔 알린 뒤 `attach(folder)`(감시를 다시 걸고 `refresh`)를 다시 부른다. 열려 있지 않은 경로는 무시한다. 연달아 누르면 `attach`가 이전 watcher를 닫으므로 감시는 하나만 남는다. 경로 판정은 지금처럼 `readFolder`(Go `doan ls`)에 맡긴다. TS에서 경로를 새로 추측하지 않는다(POSTMORTEM 2026-10-22). `open()`을 다시 쓰지 않는 이유: 폴더가 없으면 메시지 상자를 띄우고, realpath가 바뀌었으면 다른 경로를 새로 저장할 수 있다. Close는 지금의 닫기와 같다.
5. **창 수명주기 (숨기기)**: 창의 `close`에서 `preventDefault()` 후 `hide()`한다. 단 `before-quit`이 세운 종료 표시가 있으면 그대로 닫는다. `activate`(Dock 클릭)와 File > Open Project…(⌘O)는 숨은 창을 `show()`한다. `activate`는 창이 아직 없으면(`start()`가 `startShell`을 기다리는 중) 아무것도 하지 않는다. 창은 `start()` 끝에서 한 번만 만든다. shell(감시 · 서버)은 앱 수명과 같다. ⌘Q는 지금처럼 `will-quit`에서 `shell.dispose`를 부른다. 창이 숨어 있을 때 View 메뉴 명령은 숨은 렌더러에 가고 보이는 변화는 없다(받아들임).
6. **창**: 기본 1238×780, 최소 960×600, `titleBarStyle: "hiddenInset"`. 위 막대는 끌기 영역이고 그 안의 버튼은 끌기에서 뺀다. 신호등 위치는 `/design-sync`에서 잰다.
7. **문구**: 영어 문자열을 컴포넌트 안에 둔다. 초안 프레임의 문구가 정본이고, 바꾸면 초안도 같이 바꾼다.
   - 메뉴: File — Open Project… ⌘O, Close Window ⌘W. View — Zoom In ⌘=, Zoom Out ⌘−, Actual Size ⌘0, Fit ⌘1, Reload Canvas ⌘R, Enter Full Screen. ⌘W는 창만 숨기고 프로젝트는 닫지 않는다. 프로젝트 닫기는 행의 Close로만 한다. Electron `windowMenu` 역할에 Close가 없다는 것은 문서 기억이라 task 1에서 확인한다.
   - 열기 버튼은 사이드바 · 첫 실행 · 메뉴 모두 "Open Project…"다.
   - 열린 캔버스가 사라질 때(`clear`의 reason): `closed`는 빈 상태 "Pick a canvas from the list"로 돌아간다. `notFound`는 "The project <name> is gone or moved. Reopen it from the sidebar."이고, `uninitialized`는 "The project <name> is not initialized. Run doan init in a terminal."이다(2026-10-22 사용자). `missing`은 지금 문구를 영어로 옮긴다.
   - 캔버스가 열려 있지 않을 때: 오른쪽 패널 "No canvas open", 위 막대는 프로젝트 이름만, 폭 칩 "—", Reload와 − · + · Fit은 disabled. unlisted 문서에서는 마지막 목록 캔버스의 정보에 Frames "—".
   - 그 밖: 프로젝트 오류 칩은 "Error"이고 detail은 CLI의 `message`다. CLI error의 detail은 이유만 둔다(예: "Timed out after 10 s"). Not found의 detail은 "<path> is gone or moved. Restore it and Reopen, or Close it."이다. "Couldn't load the canvas"에는 "Run doan check in a terminal"을 덧붙인다.
   - 접근 이름(아이콘만 있는 요소):

     | 요소 | 접근 이름 |
     |---|---|
     | 프로젝트 행의 × | `Close project <name>` |
     | − · + · Fit | `Zoom out` · `Zoom in` · `Fit` |
     | 줌 % | `Zoom <n>%` |
     | 열린 코멘트 수 배지 | `<n> open comments` |
     | Reload | `Reload canvas` |
     | 캔버스 영역 | region `Canvas` |
     | 오른쪽 패널 | region `Canvas info` |

8. **사이드바 트리와 포커스**:
   - Radix에는 Tree가 없어서 `role="tree"` · `treeitem` · `aria-expanded` · 키보드 이동을 직접 만든다. ↑↓는 포커스만 옮기고 캔버스를 열지 않는다. ←→는 접고 편다. Enter · Space · 클릭으로 연다. roving tabindex를 쓴다. 열린 캔버스는 `aria-current="true"`다.
   - 상태가 있는 행(오류 등)은 펼친 채로 둔다. 펼침 상태는 메모리에만 둔다. Close 뒤 포커스는 다음 행으로 간다. 목록이 갱신돼도 포커스는 같은 행에 남는다(지금 `render` · `renderFrames`의 포커스 복원을 옮긴다).
   - 표시 이름: 프로젝트는 basename이고, 겹치면 부모 폴더를 붙인다(`app/doan-design`). 캔버스는 `design/` 기준 상대 경로다(`a/login.html`). 전체 경로는 툴팁과 오른쪽 패널 Path에 둔다. 접근 이름은 표시 이름과 같다.
   - Frames 목록의 React key는 index다(id가 겹치거나 비어 있을 수 있다. e2e 픽스처에 `dup` ×2가 있다).
   - Tab 순서: 위 막대 → 사이드바 → 캔버스 영역 → 오른쪽 패널. iframe 안으로 들어가는 Tab 동작은 task 1에서 확인해 적는다. 렌더러 단축키를 iframe에서 전달하는 원칙은 #6에서 정한다.
9. **e2e**: 요소와 상태를 role, 접근 이름, ARIA 상태로 읽는다. 테스트 전용 속성은 제품 코드에 넣지 않는다(`/runtime-test` 'Prohibited', `/design-sync` 결정과 같음).
   - 지금 읽는 것의 대체: `data-path` → 행 툴팁 또는 오른쪽 패널 Path, `data-state` → 상태 칩 문구, 열린 항목 → `aria-current`, 펼침 → `aria-expanded`, `#board` transform → `region "Canvas"` 안 보드 요소의 computed style.
   - 초안 때문에 바뀌는 기대값(동작이 아니라 표시): `frameLabel`의 `mono` 제거(C6의 `[label, mono]`), 코멘트 수가 문구 "열린 코멘트 1"에서 배지 `1 open comments`로, 프레임 행이 id와 title을 나란히. 나머지 동작 기대값은 그대로이고, diff로 그것을 보인다.
   - 창 다시 열기: `app.evaluate`로 창을 `close()`하고 `isVisible()`이 false인지 본 뒤, `app.emit("activate")`를 보내 같은 창이 다시 보이는지 본다(Playwright는 Dock을 누를 수 없다). ⌘W는 지금처럼 main에서 메뉴 항목을 누른다.
10. **`/design-sync` 교차 (2026-10-22 사용자)**: 구현 워커(Codex)가 측정하고 구현을 고친다. 리뷰 단계는 Claude가 맡는다. 초안을 그린 쪽(Claude)이 구현을 고치면 "Codex가 초안만 보고 그대로 구현할 수 있나"는 실험이 흐려지기 때문이다. 관찰(대조표의 불일치 수와 종류, Codex가 초안을 어떻게 읽었는지)은 task 9에서 PRODUCT §5 Dogfooding에 날짜와 함께 남긴다.

## 토큰

- 토큰은 CSS 변수 한 벌이다(`--bg`, `--panel`, `--text`, `--accent` …, 지금 `design/tokens.css`). Tailwind는 이 변수를 테마 값으로 참조하고, 색 값을 따로 갖지 않는다.
- shadcn 연결: `shadcn init`이 만든 `:root` 색 블록(`--background: oklch(…)` 등)은 지운다. shadcn 이름(`background`, `foreground`, `popover`, `input`, `ring` …)은 `styles.css`의 `@theme inline`에서 우리 토큰으로 매핑한다.
- `tokens.css`에는 순수 `:root` 변수만 둔다. Tailwind 지시어와 `@import`는 넣지 않는다. 이 파일은 캔버스에 그대로 서빙되고 `doan check`가 스캔한다. `@import`한 파일은 서빙 범위 밖이라 `css_not_served`가 된다(ARCHITECTURE §1).
- 초안과 구현이 같은 토큰 파일을 써야 `/design-sync`가 토큰 이름까지 맞춰 볼 수 있다.
- **위치 (2026-10-22 사용자)**: `app/src/renderer/tokens.css`가 정본이다. `.doan/config.json`의 `tokenCss`를 이 경로로 바꾸고, 초안은 `../app/src/renderer/tokens.css`를 링크한다. 앱이 토큰을 바꾸면 초안이 바로 따라간다. `tokenCss`가 `design/` 밖이어도 서빙 범위와 `css_not_served`를 통과한다(ARCHITECTURE §1 · §12, feature-review에서 확인).
- 초안 속 예시 캔버스 색(`--mock-*`)은 사람이 검토하는 디자인을 흉내 낸 것이라 앱 토큰이 아니다. `design/mock.css`로 옮기고, `doan check`의 `hardcoded_color` 경고를 받아들인다(`tokenCss`가 아닌 링크 CSS의 hex는 경고된다, 2026-10-22 확인).
- `doan check`는 앱 코드를 보지 않는다. 렌더러의 색은 grep으로 검사한다(task 5).

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

| 함수 | 위치 | 내용 |
|---|---|---|
| `projectRow(entry)` | `app/src/renderer/projectRow.ts` | `FolderEntry` → 행 표시값 `{status?: "Error" \| "CLI error" \| "Not found" \| "Not initialized", hint?: "Reading…" \| "No canvases", detail?: 조각 배열(문자열과 코드 조각, 예: "Run `doan init`"), actions: ("reopen" \| "close")[]}`. 칩(status)과 힌트 줄(hint)을 나눈다. `reopen`은 notFound · cliError만 갖는다. 문구 표를 한 곳에 둔다 |
| `projectNames(paths)` | 같은 파일 | 경로 목록 → 표시 이름. basename이 겹치면 부모 폴더를 붙인다 |
| `canvasName(path)` | 같은 파일 | `design/a/login.html` → `a/login.html` |
| `pushActivity(log, event, max)` | `app/src/renderer/activity.ts` | 최근 순 정렬, 최대 개수 자르기, 캔버스 키(폴더 path + 캔버스 path)별 분리. 시각 형식(24시간 `HH:MM:SS`)도 여기 둔다 |
| `canvasInfo(row, layout)` | `app/src/renderer/canvasInfo.ts` | Canvas 패널 값(Path, ID, Width, Frames 수, Open · Resolved). 값이 없으면 "—". `layout.truncated`이면 Frames는 "1,000+" |
| `frameLabel(frame)` | 기존 `app/src/renderer/canvasView.ts` 안 | `{id: string, title?: string}`을 돌려준다. 빈 id는 "(no id)". `mono`는 없앤다(모노스페이스를 쓰지 않음) |

`viewport.ts` · `canvasMessage.ts` · `canvasView.ts`(위에서 바꾸는 것 말고) · main의 `canvasFrame.ts` · `canvasScript.ts`의 순수 함수와 테스트는 그대로 둔다. 창 수명주기는 이름 있는 함수로 떼지 않고 e2e와 변형 줄로 고정한다.

## 형식 변경

없다. JSON Schema, `v`, CLI 응답, `folders.json`은 그대로다. `CanvasRow`에 `id?` · `resolved`가 더해지지만 IPC 타입이고, `doan ls`가 이미 주는 값이다(ARCHITECTURE §12).

## 규약 영향

ARCHITECTURE §1 규약과 `doan check` 규칙은 바뀌지 않는다. 이 리포가 처음으로 doan 규약을 따르는 캔버스를 갖는다.

## 결정 영향

- **ARCHITECTURE §7**: "renderer는 #6까지 plain DOM" → React + shadcn/ui + Tailwind(2026-10-22 사용자). "창을 닫으면 앱 종료" → 창 숨기기. 메뉴 문구 영어와 File 메뉴. preload API에 `reopenFolder`가 더해지고 구독은 해제 함수를 돌려준다. 창 크기와 `hiddenInset`. CSP는 task 1 결과에 따라 그대로이거나 범위를 적어 넓힌다.
- **ARCHITECTURE §3**: 캔버스 뷰의 규칙(새 iframe per load, 높이, 줌, 탐색, 메시지 신뢰)은 바뀌지 않는다. 구현 위치만 `CanvasController`로 옮긴다. "목록에 없는 문서입니다"를 영어 문구로 바꾸고, Mutation proof에 새 줄을 더한다.
- **PRODUCT §5**: 기능 분할 표의 #5 다음 행에 `app-ui`를 번호 없이 더한다. Dogfooding의 "#6부터 초안 루프"를 "app-ui부터"로 바꾸고, 교차 실험의 관찰을 적는다. 앱 화면 문구는 영어, 폴더의 화면 이름은 Project, MVP 테마는 다크 단일.
- **PRODUCT §7**: "plain DOM until #6 picks a UI framework" 두 행과 "`/design-sync` used from #6" 행을 대체하는 결정 행을 더한다.
- **PRODUCT §8**: 창 닫기 = 종료와 "folder not found" 복구 안내를 묶은 bullet 하나를 닫는다.
- **AGENTS.md**: 'Workflow'의 `/design-sync` 줄 "Use it from #6 on"을 "from app-ui on"으로. 'Commands'의 `--repo .` 예외를 "이 리포 `design/` 초안을 확인하는 읽기 전용 `ls` · `check`"로 넓힌다(task 0).

## PoC · 사전 확인

2026-10-22에 task 1을 `.scratch/app-ui-stack/`에서 실행했다. 기존 앱의 electron-vite 설정과 보안 옵션(`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)을 복사하고, 별도 임시 userData와 `127.0.0.1` iframe 서버를 썼다. `app/`은 바꾸지 않았다. 아래 결과와 사용자 결정이 이 문서 앞부분의 ScrollArea · React 플러그인 도입 계획보다 우선한다.

### 최초 실행과 사용자 결정

- 최초 고정 버전: React · React DOM `19.3.1`, `radix-ui` `1.8.1`, Radix Tooltip `1.4.1`, Radix ScrollArea `1.4.0`, `@vitejs/plugin-react` `6.1.2`. `shadcn` `4.22.1`로 Tooltip · ScrollArea를 생성했다.
- 빌드: Tooltip 1개와 ScrollArea Viewport 1개가 마운트됐으나, ScrollArea가 삽입한 인라인 `<style>` 때문에 `style-src-elem` 위반이 **1건** 발생했다.
- dev: React Fast Refresh의 인라인 preamble에서 `script-src-elem` 위반이 **1건** 발생했다. 이어서 `@vitejs/plugin-react can't detect preamble` 오류가 나서 Tooltip · ScrollArea 모두 마운트되지 않았다. 따라서 최초 dev 결과는 컴포넌트가 열린 상태의 통과 결과가 아니다.
- 이 실패에서 멈추고 Orca 질문으로 결정을 요청했다. **2026-10-22 사용자 결정**(코디네이터 전달): Radix ScrollArea를 쓰지 않고 사이드바와 패널은 기본 스크롤(`overflow`)과 CSS 스크롤바를 쓴다. `@vitejs/plugin-react`를 쓰지 않고 Vite의 기본 JSX 변환(automatic runtime)을 쓴다. dev는 Fast Refresh 대신 전체 페이지 새로고침을 받아들인다. 빌드와 dev CSP는 둘 다 유지한다.
- 최초 타입 검사에서는 TypeScript `7.0.2`가 제거된 `baseUrl` 옵션과 상대 경로가 아닌 `paths` 값을 거절했다. `baseUrl`을 넣지 않고 `"@/*": ["./src/renderer/*"]`를 쓰자 통과했다.

### 최종 고정 버전

기존 도구 버전은 유지하고, 새 패키지는 실행 시 npm 기본 안정판 태그로 설치한 뒤 정확한 버전으로 고정했다. `save-exact=true`와 lockfile을 썼으며 직접 의존성의 `^` · `~`는 **0건**이다. React 플러그인은 최종 설치 트리에서 제거됐다. Radix ScrollArea는 `radix-ui`의 전이 의존성으로 남지만 렌더러에서 ScrollArea 컴포넌트를 사용하지 않는다.

| 패키지 | 정확한 버전 |
|---|---|
| `class-variance-authority` | `0.7.1` |
| `clsx` | `2.1.1` |
| `cn` | `0.5.0` |
| `lucide-react` | `1.61.0` |
| `radix-ui` | `1.8.1` |
| `react` | `19.3.1` |
| `react-dom` | `19.3.1` |
| `tailwind-merge` | `3.7.0` |
| `@tailwindcss/vite` | `4.3.3` |
| `@types/node` | `24.19.2` |
| `@types/react` | `19.3.0` |
| `@types/react-dom` | `19.3.0` |
| `electron` | `45.0.0` |
| `electron-vite` | `6.0.0` |
| `playwright` | `1.64.1` |
| `shadcn` | `4.22.1` |
| `tailwindcss` | `4.3.3` |
| `typescript` | `7.0.2` |
| `vite` | `8.3.4` |

shadcn 생성본은 `Tooltip`을 `radix-ui`에서, `cn`을 `cn` 패키지에서 가져왔다. 생성본의 이 import를 임의로 바꾸지 않았다. Radix Tooltip의 실제 전이 버전은 `1.4.1`이다.

### 재검증 결과

| 확인 항목 | 빌드 | dev |
|---|---|---|
| `securitypolicyviolation` | **0건** | **0건** |
| 열린 Tooltip / 기본 스크롤 컨테이너 | 각각 1개 | 각각 1개 |
| React 실행 오류 | 0건 | 0건 |
| 기본 스크롤 | `overflow-y: auto`, 보이는 높이 94px / 내용 720px | 같은 값 |
| CSP | `default-src 'self'; frame-src http://127.0.0.1:*` | `default-src 'self' http://localhost:5173 ws://localhost:5173; frame-src http://127.0.0.1:*` |

- preload에서 HTML 파싱 전에 `securitypolicyviolation` 리스너를 붙였다. `styles.css`는 `<link>`로 로드했다. dev는 electron-vite `resolveConfig`의 renderer 설정으로 Vite 서버를 띄우고 실제 Electron 창을 연결했다.
- `npm run typecheck`(`tsc --noEmit`, TypeScript `7.0.2`): **통과, exit 0**. `App.tsx`와 shadcn Tooltip 생성본을 함께 검사했다.
- `npm run build`: **통과, exit 0**. React 플러그인이 없으므로 의존성의 `use client` 지시어에 대한 `MODULE_LEVEL_DIRECTIVE` 경고가 **46건** 있다. 이 앱은 클라이언트 렌더러이며 빌드·실행은 통과했다. 경고를 숨기는 설정은 넣지 않았다.
- `npm install --no-audit --no-fund`: **통과, exit 0, peer 경고 0건**. `fsevents@2.3.3`의 설치 스크립트 미승인 경고는 1건이다. 승인 설정은 바꾸지 않았다.
- alias: tsconfig는 `"@/*": ["./src/renderer/*"]`, Vite는 `@` → `src/renderer` 절대 경로, `components.json`은 `@/components` · `@/components/ui` · `@/lib/utils` · `@/lib` · `@/hooks`다. TSX에서 alias import가 타입 검사와 빌드·dev 실행을 통과했다.
- dev에서 `App.tsx`를 바꾸자 Vite가 `page reload App.tsx`를 출력했고 main frame이 다시 탐색했다. 새 문서에서도 열린 Tooltip 1개와 기본 스크롤 컨테이너 1개, CSP 위반 0건을 확인했다. 파일은 원래 내용으로 복원했다.
- Electron `45.0.0`의 `fileMenu` 기본 항목은 **Close Window**(`close`, `CommandOrControl+W`) 하나다. `windowMenu`는 **Minimize**(`CommandOrControl+M`) · **Zoom** · 구분선 · **Bring All to Front**이고 Close는 없다. Open Project…는 따로 추가해야 한다.
- iframe 직전 버튼에 포커스를 둔 뒤 Tab을 누르면 iframe 첫 버튼 → iframe 입력 → iframe 마지막 버튼 → iframe 뒤 버튼으로 이동한다. 빌드·dev 모두 같았다. iframe은 `sandbox="allow-scripts"`였고 `allow-same-origin`은 없었다. 앱 전체의 Tab 순서와 iframe 내부 단축키 전달은 이 실험에서 검증하지 않았다.
- 근거: `.scratch/app-ui-stack/evidence/initial-runtime.json`(최초 실패), `runtime.json`(최종 빌드·dev), `dev-reload.json`(dev 전체 새로고침), `checks.json` · `install.log` · `typecheck.log` · `build.log`. `build.png` · `dev.png`도 열어 확인했다. 재사용할 버전 · 설정 diff · `components.json`은 `.scratch/handoff-B.md`에 적었다.

## POSTMORTEM에서 가져온 함정

- "Local server guarantees lived in comments and echoed constants, not in behavior": ARCHITECTURE §3 'Canvas view'의 Mutation proof 10항목을 새 화면에서 다시 돌린다. 줄마다 테스트가 빨개지는지 확인한다.
- "A linked 100vh canvas kept the inherited iframe height" · "A canvas link to a document without the canvas script left a dead board": `CanvasController`로 옮길 때 새 iframe per load와 1초 no-layout 판단을 그대로 둔다. e2e C7 · C9가 지킨다.
- "Guessing the repo root in TS…": Reopen은 Go의 판정을 다시 쓴다. TS에서 경로를 판단하지 않는다.
