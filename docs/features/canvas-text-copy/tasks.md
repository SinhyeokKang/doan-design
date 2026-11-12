# canvas-text-copy — tasks

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다.

실제 앱 probe(작업 1, 6)는 `app/runtime/README.md`의 경로를 따른다: `npm --prefix app run build`, `go build -o <tmp>/doan ./cli/cmd/doan`, Playwright `_electron.launch`, `isolatedEnv`(`app/runtime/environment.ts`), 전후 `realState`·`assertRealState`(`app/runtime/real-state.ts`), `suiteGuard`(`app/runtime/harness.ts`)의 `finally`에서 `restoreClipboard`(`app/runtime/clipboard.ts`, 시작 때 `saveClipboard`). Edit > Copy는 `app/runtime/windows.ts`의 메뉴 helper로 누르고, ⌘C를 어떤 입력 경로로 눌렀는지(Playwright 키 입력인지, 네이티브 입력인지) 보고서에 적는다. probe 파일은 `.scratch/runtime-test/canvas-text-copy/`에 두고 커밋하지 않는다.

1. [x] **PoC (design.md 'PoC 의존' 1–5).**
   - 결과(날짜, Electron 버전, 스크린숏 경로, 관찰)를 design.md 'PoC 의존' 아래에 적는다. 1·2·3이 실패하면 멈추고 사용자에게 묻는다. 3의 대체 경로나 5의 `text-point`가 필요하면 design.md를 고친다.
   - 확인: 다섯 항목 각각의 관찰이 design.md에 있다.
   - **커밋 경계**: `docs(feature): record canvas-text-copy PoC result` (design.md만).
2. [x] **초안 (`/design-draft`).** overlay 하이라이트(accent 반투명)를 밝은 캔버스, 진한 캔버스(#050507), 보라 캔버스(#5b21b6) 위에 그린다. 요소 선택 표시와 hover 표시가 함께 있는 경우, 여러 줄 범위, 드래그 중 텍스트 커서도 그린다. 경로 `.doan/canvases/canvas-text-copy.html`.
   - 확인: `doan check`·`doan ls`가 통과하고, 사용자가 앱에서 초안을 확인했다.
3. [x] **테스트 (`/tdd`).** design.md '순수 함수' 1–8.
   - `textDragState`: 화면 3.99px는 `press`, 4px는 `drag`. 한 번 `drag`면 원점 복귀도 `drag`.
   - `textBoundary`: 가장 안쪽 프레임, 프레임 밖 노트, 프레임을 담은 행(빈 공간)은 경계 없음.
   - 상한 자르기: 정확히 상한, 상한+1, astral 문자로 넘는 경우에 서로게이트를 자르지 않는다.
   - `textCopy`: `defaultPrevented`면 `null`, 캔버스 페이지가 아니거나 overlay(모달·메뉴)가 열려 있으면 `null`, 빈 텍스트는 `null`.
   - `escapeStep`: pick, capture, 편집 필드, Hand가 먼저이고, 그다음 `clearText`, 그다음 `stepSelection`.
   - `parseCanvasMessage` `text-range`: 상한 초과 `text`·`rects`는 버림, 잘못된 타입 거부.
   - `CanvasController.test.ts`:
     - 지우기: 다음 주 버튼 누름, 여백 클릭, Hand, Picker, Capture area, 다시 불러오기(문서 토큰 변경), 전환·닫기, 그릴 수 없는 상태, 캔버스 페이지 떠남, 앱 선택 생김.
     - 지우지 않음: Space, 휠 팬, 핀치, 줌, 오른쪽·Ctrl 누름.
     - 늦은 메시지: 마지막 `clear-text`보다 오래된 `epoch`, 이전 문서 토큰, Hand·Picker·Capture area 중의 `text-range`는 버린다.
     - 드래그 중 V·H·Space 무시, Esc는 드래그를 끝내고 지움, 드래그 중 Following 점프 없음.
     - 놓을 때 캔버스 영역 포커스(pick 중 제외), 드래그 시작에서 앱 선택 접기.
   - `canvasScript.test.ts` "canvasScript selection input" 하네스:
     - 시작 조건: 주 버튼만, ⌘·⌥·Ctrl·Shift 없음, `picking !== null`이면 시작 안 함, 텍스트가 아닌 대상, padding 누름은 시작, input·textarea·contenteditable은 시작 안 함.
     - 드래그 뒤 `click`이 `choose`를 부르지 않는다.
     - 끝나는 경우: `pointerup`, `pointercancel`, `lostpointercapture`, `blur`, `clear-text`, pick 시작. 끝난 뒤의 `pointermove`가 범위를 다시 만들지 않는다.
     - 드래그 동안 캔버스 리스너가 `pointerdown`·`mousedown`·`mouseup`·`click`·`dblclick`을 받지 않는다.
     - `copy` 리스너: 범위가 있으면 `text/plain`만 넣고 막는다. 없으면 두지 않는다.
     - 드래그가 끝나면 hover 중복 제거 값이 비워진다.
   - 확인: `npm --prefix app test`에서 새 사례가 빨간색이다.
   - **커밋 경계**: `test: pin canvas text drag, copy and clearing`.
4. [ ] **구현 (`/implement`).** `canvasScript.ts`, `canvasMessage.ts`, `CanvasController.ts`, `canvasTool.ts`, `canvasTextCopy.ts`, overlay 스타일. 'Input direction' 주석을 고친다. PoC 3의 대체 경로가 필요하면 main의 Edit 메뉴도 바꾼다.
   - 확인: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`가 통과한다.
   - **커밋 경계**: `feat: select and copy canvas text by dragging in Select`.
5. [ ] **초안과 맞추기 (`/design-sync`).** 작업 2 초안의 overlay 하이라이트와 실제 앱을 computed style로 비교하고 DESIGN.md에 측정값을 적는다.
   - 확인: `/design-sync` 보고서. 초안과 다른 값은 DESIGN.md 'Documented deviations'에 있거나 고쳐졌다.
6. [ ] **실제 앱 확인 (`/runtime-test`).** 위 경로로 짧은 probe를 돌린다. probe 캔버스는 레이아웃마다 한 페이지로 둔다.
   - 드래그: 하이라이트가 보이고, 드래그 동안 초안의 `pointerdown`·`mousedown`·`mouseup`·`click`·`focus` 카운터가 늘지 않는다. 대상은 링크 텍스트, `<button>` 라벨, `<label for>`(체크박스가 바뀌지 않음), `<summary>`, `draggable` 요소와 이미지를 지나는 드래그다. 줌 25%와 400%에서 짧은 누름은 클릭으로 남는다.
   - 드래그 전후 `doan active --json`(격리한 `DOAN_RUNTIME`)이 같다.
   - 범위는 시작 프레임을 넘지 않는다. `user-select: none` 텍스트도 선택된다. input·textarea·중첩 iframe에서는 시작하지 않는다.
   - 복사: ⌘C와 Edit > Copy가 범위 텍스트를 넣는다. 컴포저에 포커스가 있거나 말풍선에 선택이 있는 채로 끌어도 캔버스 텍스트가 들어간다. 그 뒤 앱 텍스트를 선택하면 하이라이트가 사라지고 앱 텍스트가 들어간다. ⌥-클릭 뒤(캔버스 프레임 포커스)도 같다. 모달이 열리면 넣지 않는다.
   - 지우기: 다음 누름, 여백 클릭, Esc 순서, Hand, Picker, Capture area(캡처 이미지에 하이라이트 없음), 드래그 중 캔버스 파일 다시 쓰기(live reload), 드래그 중 `doan open`으로 전환, 캔버스 페이지 떠남. Space와 휠 팬 뒤에는 남는다.
   - 드래그 중 Space·H·V는 무시되고, 놓은 뒤에는 지금처럼 동작한다.
   - hover: 놓으면 포인터가 멈춘 채로 돌아오고, 드래그 뒤 같은 요소로 한 번에 점프해도 돌아온다(POSTMORTEM 2026-10-23).
   - Tab: fold 아래에 포커스 가능한 컨트롤이 있는 probe 캔버스에서 드래그 뒤 Tab을 누른다(POSTMORTEM 2026-11-02).
   - 확인: `/runtime-test` 보고서와 스크린숏, `assertRealState` 통과, 클립보드 복원 확인.
7. [ ] **최종 게이트 (`/verify`).** `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: PASS.
8. [ ] **승격과 정리.**
   - PRODUCT §5 item 4: Select 텍스트 드래그, 범위, 복사, 지우는 때, hover 재계산("a text drag ending").
   - PRODUCT §5 'Text edit menu': 선택 가능한 곳 목록에 캔버스 텍스트(Select 드래그)를 더한다.
   - PRODUCT §5 item 2: Esc 사슬, Following의 드래그, Capture area와 Hand·Picker의 지우기.
   - ARCHITECTURE §3 'Selection and inspector': 'Input'에 스크립트 범위와 overlay와 복사 경로를, 'Untrusted messages'에 `text-range` 위조 범위를, 'Ordering'에 `epoch`와 문서 토큰을, 'Caps'에 `MAX_COPY_TEXT`와 사각형 상한을 쓴다.
   - DESIGN.md: overlay 하이라이트 측정값(작업 5).
   - BACKLOG: 자동 스크롤 없음, 더블클릭 단어 선택 없음, Shadow DOM 텍스트 제외, RTL·세로쓰기 미검증, 남은 미검증 항목.
   - `docs/features/canvas-text-copy/`를 지운다.
   - 확인: 문서만 바뀌므로 대상만 확인한다.
     - `rg -n "text-range" docs/ARCHITECTURE.md`가 'Untrusted messages'와 'Ordering' 문장을 출력한다.
     - `rg -n "MAX_COPY_TEXT" docs/ARCHITECTURE.md`가 'Caps' 문장을 출력한다.
     - `rg -n "a text drag ending" docs/PRODUCT.md`가 §5 item 4 문장을 출력한다.
     - `test ! -e docs/features/canvas-text-copy`가 성공한다.
     - `rg -n "canvas-text-copy" app cli docs --glob '!docs/features/**'`가 아무것도 출력하지 않는다.
   - **커밋 경계**: 문서마다 따로 (`docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(backlog): …`, `docs(feature): remove canvas-text-copy`).
