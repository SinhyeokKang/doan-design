# export-viewer-chrome — tasks

순서: UI 초안 → 순수 함수 → viewer 셸(마크업·CSS·이벤트) → 브라우저 확인 → 문서 승격.

## U. UI 초안

- [x] U0. `/design-draft`로 새 초안 `.doan/canvases/export-viewer-chrome.html`을 그린다: 내보낸 파일의 content panel과 툴바(Select 눌림, Hand 눌림, 끄는 중), 960px 창. 요청은 design.md '초안 요청'에 있다. 기존 `canvas-row-menu.html`의 `viewer-shell` 프레임은 고치지 않는다. 사람이 앱에서 확인한다.
  - 승인된 예외: `/design-draft`와 `/design-sync`는 main에 있는 화면을 redesign child에서만 다시 그리게 한다. viewer는 main에 있고 이 feature는 redesign child가 아니지만, 사람이 이 feature에 한해 새 초안을 그리고 C2가 그 초안을 기준으로 측정하는 것을 승인했다.
  - 검증: 그리기 전과 비교해 `doan check --json --repo .`에 새 error 수준 finding이 없다. `doan ls --json --repo .`가 이 캔버스의 프레임으로 `viewer-select`, `viewer-hand`, `viewer-dragging`만 보인다. 사람의 확인을 design.md에 적는다.

── commit: `docs(design): draft export-viewer-chrome` ──

## A. 순수 함수 (`lib.js`)

- [x] A1. `toolShortcut`·`editableTarget`(과 그 도우미) 복사, `panScroll`, `layerShown`, viewer의 Esc 판정, `toolbarMove`, `parseMessage`의 `key`. `wheelAction`은 바꾸지 않는다.
  - 검증: `npm --prefix app test` — `exportViewer.test.ts`에 새 테스트를 먼저 넣어 red, 구현 뒤 green. 테스트 내용:
    - 같은 이벤트 표를 앱과 viewer의 `toolShortcut`·`editableTarget`에 넣어 값이 같다. 표에 넣을 행: V/H/Space, 한국어 자판(`code`만 같은 key), repeat, `isComposing`, keyCode 229, ⌘·⌃·⌥, `defaultPrevented`, input·textarea·select·contenteditable target, button·`menuitem`·`option` target, 모든 keyup의 Space-up.
    - `panScroll`: 스크롤 범위 안에서는 `viewport.ts`의 `panBy`와 값이 같고, 범위를 넘는 증분은 0과 최대 스크롤에서 멈춘다. 캔버스가 보드보다 좁은 방향(최대 스크롤 0)으로는 움직이지 않는다.
    - 메뉴가 열려 있을 때 V·H(`code`)는 메뉴가 처리한 키로 막힌다(`popupKey` 또는 같은 역할).
    - `layerShown`은 캔버스가 그려지기 전에 거짓이다.
    - Esc 판정: Hand에서만, 편집 대상과 `defaultPrevented`이면 아니다.
    - `toolbarMove`는 끝에서 멈춘다.
    - 잘못된 `key` 메시지(형식 오류, Space·V·H·Escape 외의 키)를 거부한다.
    - 기존 `wheelAction` 골든이 그대로 통과한다. `lib.js` DOM 금지 규칙을 통과한다.

── commit: `feat: add Hand tool rules to the export viewer` ──

## B. viewer 셸

- [x] B1. `shell.html`·`shell.css`: content panel, `#board` 밖에 둔 툴바 마크업과 inline SVG 아이콘, 끌기 표면 커서, JavaScript 없는 화면에서 툴바 숨김.
  - 검증: `npm --prefix app test`. 기존 파일 규칙(`https?:`·`url(`·`@import` 없음, placeholder 수)과 새 테스트(먼저 red)가 통과한다. 새 테스트: panel·툴바 CSS 값이 앱 `tokens.css`·`styles.css` 값과 같다(지금 없는 테스트), 툴바는 `.js`가 없으면 숨는다, 툴바는 Select·Hand 항목(이름·키·`aria-keyshortcuts`·순서)과 `Canvas tools` 이름만 앱과 같다. `go test ./...`(`assemble_test.go`).
- [x] B2. `shell.js`·`measure.js`: 도구 상태, 끌기 표면(iframe `pointer-events`)과 `#board` 끌기, Space, V/H/Esc(부모 포커스와 iframe `key` 메시지), Space 해제 규칙, Hand의 일반 휠, 툴바 ←/→와 tooltip, 도구·키가 없다고 적은 주석 고치기.
  - 검증: `npm --prefix app test`. 기존 규칙(message listener 하나, `textContent`만)과, `exportViewer.test.ts`의 기존 소스 고정 테스트 방식으로 넣은 새 테스트(먼저 red)가 통과한다. 새 테스트:
    - `shell.js`·`measure.js`가 키를 `toolShortcut`으로 판정한다.
    - iframe의 `pointer-events`는 `layerShown`의 결과로만 바뀐다.
    - pointercancel·lostpointercapture가 끌기를 끝낸다.
    - 창 blur는 `!document.hasFocus()`일 때만 Space를 놓고, iframe `load`에서도 놓는다.
    - iframe이 보낸 Space-down은 `document.activeElement`가 iframe일 때만 받는다.
    - `measure.js`는 blur·pagehide에서 Space-up을 보낸다.
  - `go test ./...`, `go vet ./...`.

── commit: `feat: give the export viewer the canvas panel and the Hand tool` ──

## C. 확인

- [x] C1. 브라우저 확인: 이 브랜치의 CLI(`go build -o <tmp>/doan ./cli/cmd/doan`)로 내보낸 파일을 Playwright Chromium·WebKit으로 연다. 캔버스는 넷을 쓴다: 보드보다 큰 캔버스, 입력 칸이 있는 캔버스, 버튼이 있는 캔버스, 프레임이 없는 캔버스. 항목마다 기대 결과가 맞으면 통과다.
    - panel 값이 spec 완료 조건 1과 같다.
    - 툴바: 기본 Select 눌림, 버튼·V·H로 바뀜, Tab은 눌린 도구 하나에 선다, ←/→는 끝에서 멈춘다, hover·포커스에 tooltip이 뜬다.
    - Hand 끌기와 Space 끌기(부모 포커스, 캔버스 안 포커스)가 보기를 옮긴다. Hand의 일반 휠은 이동하고 ⌘/Ctrl-휠은 확대한다.
    - 끌기는 스크롤 가장자리에서 멈춘다. Fit 상태처럼 캔버스가 보드보다 좁은 방향으로 끌면 보기가 움직이지 않는다.
    - 캔버스 안 입력 칸에서 V·H·Space는 글자로 들어간다. 캔버스 안 버튼에 포커스가 있을 때 Space는 그 버튼을 누른다.
    - Esc(부모 포커스, 캔버스 안 포커스)가 Hand를 Select로 바꾼다. 메뉴가 열려 있으면 메뉴만 닫는다.
    - 메뉴가 열려 있을 때 V·H를 눌러도 도구가 바뀌지 않는다.
    - 툴바 버튼을 마우스로 누른 직후 Space는 그 버튼을 누르고 이동하지 않는다(앱과 같다).
    - 포커스가 캔버스 안에 있을 때 ⇧1·⇧0은 viewer 확대를 바꾸지 않는다.
    - Space를 누른 채 창을 떠나면 Space가 풀린다. 끄는 중 V·H는 pointerup 뒤에 적용된다.
    - 캔버스가 그려지기 전에는 끌기가 아무것도 옮기지 않는다. 프레임이 없는 캔버스에서도 툴바가 동작한다.
    - Tab이 캔버스 안 컨트롤로 가도 툴바는 제자리에 있다. JavaScript를 끈 화면에서 panel은 보이고 툴바는 없다.
    - Fit 뒤 캔버스 맨 위가 툴바에 가리지 않는다. 클래식 스크롤바에서 툴바와 가로 스크롤바가 겹치는지 적는다.
    - 늘어난 viewer 바이트를 적는다.
  - 실제 Safari는 열 수 있으면 확인하고, 아니면 미확인으로 적는다. 실물 트랙패드도 같다.
  - 검증: 명령 미정 — `.scratch` probe(Playwright로 `doan export` 결과 열기). 항목별 통과·실패와 스크린샷 경로를 이 파일에 적는다. Z1이 이 파일을 지우므로, 미확인 항목은 Z1에서 DESIGN.md와 BACKLOG로 옮긴다.
  - **결과 (VIEW 배치, `007f560a`)**: `node .scratch/export-viewer-chrome/probe.mjs`가 이 브랜치 CLI로 내보낸 캔버스 넷(`big` 2400px·프레임 6개, `input`, `button`, `noframes`)을 1280×800 창의 Playwright 1.64.1 Chromium(chromium-1248)·WebKit(webkit-2370)에서 열었다. 52개 확인(브라우저마다 26개)이 모두 통과했다(`probe-run1.log`). 수정 1차(캔버스에서 온 Esc) 뒤 CLI를 다시 빌드해 다시 내보내고 다시 돌렸다. 확인 58개(브라우저마다 29개)가 모두 통과했다(`.scratch/export-viewer-chrome/results-chromium-webkit.json`, `probe-fix1.log`). 수정 전 빌드(`c6970260`)에서는 새 Esc 확인과 그 뒤 메뉴 확인이 브라우저마다 실패했다(`probe-old-build.log`). 스크린샷은 `.scratch/export-viewer-chrome/shots/<browser>-{select-fit,tooltip-hover,tooltip-keyboard,dragging,tab-far,no-js}.png`이다.
    - panel: 통과. 두 브라우저 모두 panel이 (8, 8, 1264×784), 네 모서리 24px, 흰 바탕, 창 바탕 `rgb(241, 241, 242)`, 헤더 56px, 보드 `rgb(245, 245, 246)`이다.
    - 툴바: 통과. 92×50, panel 아래에서 20px, 가운데. 기본 Select, 버튼·V·H로 바뀐다. Tab은 눌린 도구 하나에만 선다. ←/→는 끝에서 멈추고, 키보드 포커스와 hover에 tooltip(`SelectV`/`HandH`)이 버튼 4px 위 가운데에 뜬다. 누른 뒤에는 포인터가 나갔다 들어와야 다시 뜬다(Radix와 같다).
    - Hand 끌기, Space 끌기(부모 포커스·캔버스 안 포커스): 통과. Hand의 일반 휠은 이동하고, Ctrl-휠은 확대한다(100% → 125%).
    - 가장자리: 통과. 스크롤 0에서 더 끌어도 0이고, Fit에서는 최대 가로 스크롤이 0이라 가로로 움직이지 않는다.
    - 입력 칸·버튼: 통과. input·textarea·contenteditable에 V·H·Space가 글자로 들어간다. 캔버스 안 버튼에 포커스가 있으면 Space가 그 버튼을 누르고 이동하지 않는다. WebKit은 클릭으로 버튼에 포커스를 주지 않아서 probe가 포커스를 직접 줬다.
    - Esc: 통과. 부모 포커스와 캔버스 안 포커스 모두 Hand를 Select로 바꾼다. 메뉴가 열려 있으면 첫 Esc는 메뉴만 닫고, 두 번째 Esc가 Select로 바꾼다. 포커스가 캔버스 안에 있고 툴바 tooltip이 열려 있어도 Esc 한 번에 Select로 바뀌고 tooltip은 남는다(앱의 `escape(false)`와 같다).
    - 메뉴가 열려 있을 때 V·H: 통과. 확대 메뉴와 Frames 목록 모두 도구가 바뀌지 않는다.
    - 툴바 버튼을 누른 직후 Space: 통과. 두 브라우저(Playwright)에서 포커스가 버튼에 남아 Space가 버튼을 누르고 이동하지 않는다.
    - 캔버스 안 포커스에서 ⇧1: 통과. 확대가 100%로 남는다.
    - Space 해제: 캔버스 안에서 Space를 누른 채 포커스가 부모로 가면 풀린다(통과). 창을 떠나는 경우는 Playwright가 페이지마다 focus를 에뮬레이션해 재현할 수 없었다. 그래서 `document.hasFocus()`가 거짓인 blur를 보내 handler만 확인했다(통과, 모의). 끄는 중 V와 Esc는 pointerup 뒤에 Select로 바뀐다(통과). 끄는 중 Space를 떼도 끌기는 pointerup까지 이어지고, 그 뒤 이동 표면이 내려간다(통과).
    - 그려지기 전: 통과. 첫 layout을 잡아 둔 동안 도구는 바뀌고, 끌기는 스크롤을 옮기지 않고, 눌러 둔 Space는 그려진 뒤로 이어지지 않는다. 프레임 없는 캔버스(`No frames`)에서도 툴바와 끌기가 동작한다.
    - Tab과 JavaScript 없는 화면: 통과. 캔버스 아래쪽 컨트롤로 Tab하면 `#board`만 스크롤되고(약 2,690px) 툴바와 panel은 그대로다. WebKit은 Safari처럼 Tab이 버튼을 건너뛰어 아래쪽 입력 칸으로 확인했다. JavaScript를 끄면 panel은 보이고 툴바·tooltip은 `display: none`이다.
    - Fit과 스크롤바: 통과. Fit 뒤 캔버스 맨 위는 보드 위에서 80px, 툴바 위쪽은 보드 아래에서 70px이다. 프레임으로 이동한 뒤 프레임 아래(679)가 툴바 위(722)보다 위에 있다. headless 기본 스크롤바는 overlay(0px)다. `--hide-scrollbars`를 뺀 Chromium(`scrollbar.mjs`, `shots/chromium-classic-scrollbar.png`)에서는 클래식 가로 스크롤바가 15px이고, 툴바 아래(772)와 스크롤바 위(777) 사이에 5px가 남아 겹치지 않는다. 클래식 스크롤바의 양 끝은 panel의 둥근 모서리에 잘린다.
    - viewer 바이트: 내보낸 파일마다 26,237 B가 늘었다(`9a748b00` CLI 대비, 예: `big` 72,756 → 98,993 B. 수정 1차 전에는 25,955 B). `lib.js`가 페이지 스크립트와 캔버스 srcdoc에 한 번씩 들어가기 때문이다.
    - 확인하지 못한 것: 실제 Safari, 실물 트랙패드(관성 스크롤, pinch), 실제 창 전환에서의 Space 해제, 실제 Safari에서 툴바 버튼을 클릭한 뒤의 Space(Safari는 클릭으로 버튼에 포커스를 주지 않으므로 이동할 것으로 보이지만 확인하지 않았다).
- [ ] C2. `/design-sync`에 준하는 측정(U0의 승인된 예외로 U0 초안이 기준이다): viewer는 앱 화면이 아니므로 초안과 내보낸 파일을 같은 Playwright 브라우저에서 computed style로 비교하고 DESIGN.md 'Canvas row menu and export viewer'에 적는다.
  - 검증: 측정값이 초안과 일치(차이는 DESIGN.md에 이유와 함께).
- [ ] C3. `node .agents/skills/verify/scripts/verify.mjs --eval`. `--eval`이 X1을 포함한 전체 self-test를 돌린다(X1은 viewer 바이트를 고정하지 않지만 출력 형식을 확인한다).
  - 검증: verify exit 0(그 안의 `self-test PASS` 포함).

`/agent-eval` 실제 라운드는 생략한다. guide·CLI 명령·응답·`doan check` 규칙이 바뀌지 않고, X1은 같은 CLI로 다시 내보낸 바이트를 비교하므로 viewer 변경과 무관하다. 출력 파일 내용은 바뀌므로 self-test로 확인한다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT §5 item 3 'Export and viewer': Select·Hand 도구, Space, V/H/Esc, panel.
  - ARCHITECTURE §3 'Exported canvas and viewer': 넘기는 키(Space, V, H, Escape), 끄는 동안 iframe `pointer-events: none`, Space 해제 규칙, 복사본 목록에 `canvasTool.ts`·`editableTarget`.
  - DESIGN.md: C2 측정값, Viewer header·board 행 갱신, C1에서 확인하지 못한 것은 'Not verified'에.
  - BACKLOG: 내보낸 파일의 미확인 항목(실제 Safari 등)에 C1에서 확인하지 못한 툴바·끌기 동작을 더한다. 그리고 결정 안 된 항목을 하나 더한다: 툴바 버튼을 마우스로 누르면 포커스가 버튼에 남아 Space가 이동 대신 버튼을 누른다(앱과 viewer 모두). 마우스로 누른 뒤 포커스를 캔버스 영역으로 옮기는 공통 수정은 이 feature 범위 밖이다.
  - 그리고 `docs/features/export-viewer-chrome/`를 지운다.
  - 검증:
    - `grep -n 'no selection, tools' docs/PRODUCT.md`에 줄이 없고, `grep -n 'Select and Hand' docs/PRODUCT.md`가 한 줄을 보인다.
    - `sed -n '/^### Exported canvas and viewer/,/^##/p' docs/ARCHITECTURE.md | grep 'Left out'`의 줄에 `key forwarding`이 없다. 같은 범위에 `canvasTool.ts`와 `Escape`가 있다.
    - `grep -n 'Space' docs/BACKLOG.md`가 툴바 버튼 포커스 항목을 보인다.
    - `docs/features/export-viewer-chrome/`가 없다.

── commit: `docs(product): Hand tool in the export viewer` / `docs(architecture): export viewer key forwarding` / `docs(design): measure the export viewer panel and tools` / `docs(feature): remove export-viewer-chrome docs` ──
