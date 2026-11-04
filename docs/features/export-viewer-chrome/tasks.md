# export-viewer-chrome — tasks

순서: UI 초안 → 순수 함수 → viewer 셸(마크업·CSS·이벤트) → 브라우저 확인 → 문서 승격.

## U. UI 초안

- [ ] U0. `/design-draft`로 새 초안 `.doan/canvases/export-viewer-chrome.html`을 그린다: 내보낸 파일의 content panel과 툴바(Select 눌림, Hand 눌림, 끄는 중), 960px 창. 요청은 design.md '초안 요청'에 있다. 기존 `canvas-row-menu.html`의 `viewer-shell` 프레임은 고치지 않는다. 사람이 앱에서 확인한다.
  - 승인된 예외: `/design-draft`와 `/design-sync`는 main에 있는 화면을 redesign child에서만 다시 그리게 한다. viewer는 main에 있고 이 feature는 redesign child가 아니지만, 사람이 이 feature에 한해 새 초안을 그리고 C2가 그 초안을 기준으로 측정하는 것을 승인했다.
  - 검증: 그리기 전과 비교해 `doan check --json --repo .`에 새 error 수준 finding이 없다. `doan ls --json --repo .`가 이 캔버스의 프레임으로 `viewer-select`, `viewer-hand`, `viewer-dragging`만 보인다. 사람의 확인을 design.md에 적는다.

── commit: `docs(design): draft export-viewer-chrome` ──

## A. 순수 함수 (`lib.js`)

- [ ] A1. `toolShortcut`·`editableTarget`(과 그 도우미) 복사, `panScroll`, `layerShown`, viewer의 Esc 판정, `toolbarMove`, `parseMessage`의 `key`. `wheelAction`은 바꾸지 않는다.
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

- [ ] B1. `shell.html`·`shell.css`: content panel, `#board` 밖에 둔 툴바 마크업과 inline SVG 아이콘, 끌기 표면 커서, JavaScript 없는 화면에서 툴바 숨김.
  - 검증: `npm --prefix app test`. 기존 파일 규칙(`https?:`·`url(`·`@import` 없음, placeholder 수)과 새 테스트(먼저 red)가 통과한다. 새 테스트: panel·툴바 CSS 값이 앱 `tokens.css`·`styles.css` 값과 같다(지금 없는 테스트), 툴바는 `.js`가 없으면 숨는다, 툴바는 Select·Hand 항목(이름·키·`aria-keyshortcuts`·순서)과 `Canvas tools` 이름만 앱과 같다. `go test ./...`(`assemble_test.go`).
- [ ] B2. `shell.js`·`measure.js`: 도구 상태, 끌기 표면(iframe `pointer-events`)과 `#board` 끌기, Space, V/H/Esc(부모 포커스와 iframe `key` 메시지), Space 해제 규칙, Hand의 일반 휠, 툴바 ←/→와 tooltip, 도구·키가 없다고 적은 주석 고치기.
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

- [ ] C1. 브라우저 확인: 이 브랜치의 CLI(`go build -o <tmp>/doan ./cli/cmd/doan`)로 내보낸 파일을 Playwright Chromium·WebKit으로 연다. 캔버스는 넷을 쓴다: 보드보다 큰 캔버스, 입력 칸이 있는 캔버스, 버튼이 있는 캔버스, 프레임이 없는 캔버스. 항목마다 기대 결과가 맞으면 통과다.
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
