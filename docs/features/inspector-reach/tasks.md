# inspector 넓히기 — tasks

(B)와 (A)는 따로 `/ship`하고 (B)를 먼저 머지한다. 각 `/ship`은 커밋 경계를 따른다.

## (B) 선택 버블의 Show inspector — 첫 `/ship`

1. **디자인 초안**: `/design-draft`로 Show inspector가 들어간 선택 버블(접힘, 열림 뒤, yield 비활성, 프레임·요소 선택, 화면 가장자리 배치)을 새 파일 `.doan/canvases/inspector-reach-bubble.html`에 그린다. 사용자가 앱에서 확인한다.
   - 확인: `doan check` 통과(`.doan/canvases/inspector-reach-bubble.html`), 사용자 확인.
   - ── 커밋 경계 (`docs(design):` 초안) ──
2. **`bubbleItems`, `bubbleAction`** 순수 함수와 테스트(열 보임일 때 없음, 접힘, yield 비활성과 이유, Play 유무, host 클릭이 동작별로 나뉨).
   - 확인: `npm --prefix app test` 초록.
   - ── 커밋 경계 (`test:` → `feat:`) ──
3. **버블 연결**: `data-bubble-action` 분배, App portal, `foldInspector` 호출, 포커스(`moveBubbleFocus`, `awaitBubbleReturn`에 `"inspect"`, 버블이 사라지면 헤더 Show inspector, inspector가 돌아오면 Hide inspector), `mousedown` `preventDefault`.
   - 테스트: Show inspector를 눌러도 Add to message가 실행되지 않음, Hand 전환·선택 해제·Reload 중 버블이 사라질 때 포커스.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
3a. **앱 element menu 가로 스크롤**(출하 앱 화면 수정, 뷰어는 (A)에서 같은 규칙을 생성 코드로 받는다): `treeScrollLeft` 순수 함수와 테스트(얕은 행은 0, 깊은 행은 아이콘 시작이 보이게, 이미 보이면 그대로), `ElementMenu`의 `overflow-x`와 열기·키보드 이동 때 `scrollLeft`.
   - 확인: `npm --prefix app test` 초록.
4. **`/design-sync`, `/runtime-test`**: 버블 측정을 `docs/design/prototype.md` 'Size bubble with Play'에 기록하고, 실제 앱에서 열기·포커스·yield·Hand 전환, 10단계 깊이 요소를 고른 뒤 element menu가 가로로 스크롤돼 선택 행 이름이 보이는지를 확인한다.
   - 확인: `docs/design/prototype.md` 'Size bubble with Play'에 새 버튼 값이 있다, `/runtime-test` PASS.
5. **최종 게이트와 승격(B)**: `node .agents/skills/verify/scripts/verify.mjs`, PRODUCT §5 item 2('Size bubble')와 item 4('Inspector'의 열기 문장, element menu 가로 스크롤)와 `docs/design/canvas.md` 'Element menu'를 현재 규칙으로 고친다.
   - 확인: verify PASS.
   - ── 커밋 경계 (`feat:`, `docs(PRODUCT):`) ──

## (A) export 파일의 inspector — 두 번째 `/ship`

6. **PoC**: `.scratch/inspector-reach/`에서 design.md 'PoC 의존'의 다섯 항목을 확인한다. 통과 기준은 fixture 캔버스들에서 CSSOM 경로와 CDP 경로의 `inspectRows` 출력이 같은 것이다. 결과는 design.md에 적는다. 일부만 같거나 WebKit이 규칙을 읽지 못하면 계산된 값으로 물러설지(행 단위인지 전체인지) 사용자에게 묻는다.
   - 확인: command undecided — needs user confirmation (예: `node .scratch/inspector-reach/probe.mjs`를 정해 사용자 승인을 받는다).
   - ── 커밋 경계 (`docs(feature):` PoC 결과) ──
7. **디자인 초안**(PoC 전에 먼저 그려 두었다. PoC 결과로 바뀌면 `--revise`): `/design-draft`로 export 뷰어의 Show inspector, inspector 열(빈 상태, 값, 외부 시트 행, 복사 상태 줄, element menu), 선택·hover, yield를 새 파일 `.doan/canvases/inspector-reach-viewer.html`에 그린다(`.doan/canvases/export-viewer-chrome.html`은 고치지 않는다).
   - 확인: `doan check` 통과(`.doan/canvases/inspector-reach-viewer.html`), 사용자 확인.
   - ── 커밋 경계 (`docs(design):` 초안) ──
8. **생성 스크립트와 순수 함수**: TS 소스에서 `viewer/inspect.js`를 만드는 스크립트(`--check` 포함), `cssomMatched`, shell 메시지 검증.
   - 테스트: 생성물이 소스와 같음, 위조 메시지(잘못된 모양, 너무 많은 행, 긴 문자열, HTML 문자열)를 거부하거나 텍스트로만 그림.
   - 확인: `npm --prefix app test` 초록, `go test ./...` 통과, 생성 스크립트 `--check` 통과(스크립트 이름은 이 task에서 정해 AGENTS.md 'Commands'에 더한다).
   - ── 커밋 경계 (`test:` → `feat:`) ──
9. **뷰어 연결**: `measure.js`의 선택·hover·값 수집(inspector가 열렸을 때만), 텍스트 드래그 규칙, `shell.js`의 inspector 열과 element menu, Esc 순서, overlayOpen 표. 출력 고정 테스트 갱신과 크기 기록.
   - 테스트 캔버스: 빈 캔버스, 잘린 넓은 요소, `@media`·`@import`·외부 CSS, Option-click과 Hand·Space, 고른 요소가 스크립트로 사라짐.
   - 확인: `go test ./...` 통과(`TestAssembleOutputIsPinned`, `TestExportAllocationIsBounded`, 프로토타입 출력 digest가 바뀌지 않음), `go vet ./...` 통과, `node eval/run.ts --self-test --scenarios X1,X2` self-test PASS.
10. **`/design-sync`과 브라우저 확인**: 실제 캔버스로 export한 파일을 Chromium과 WebKit에서 열어 접힘 상태(지금과 같음), 열림 상태의 선택·hover·값·복사, JavaScript 없을 때를 확인하고, 측정을 `docs/design/canvas.md` 'Canvas row menu and export viewer'에 기록한다. 실제 Safari는 실행하지 않는다면 BACKLOG 'Not verified in the real app'에 남긴다.
    - 확인: command undecided — needs user confirmation (브라우저 확인 스크립트), `docs/design/canvas.md`의 측정 기록.
    - ── 커밋 경계 (`feat:`) ──
11. **최종 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
    - 확인: verify PASS.
12. **승격**: PRODUCT §2 마지막 문단, §3 In scope 8, §5 item 3('Export and viewer'), item 4('Inspector', 'Measuring')와 ARCHITECTURE §3('Exported canvas and viewer'의 선택·hover와 생성 규칙)을 현재 규칙으로 고쳐 쓰고(근거는 커밋 메시지), 새 디자인 섹션이 생기면 DESIGN.md 색인을 고친 뒤 `docs/features/inspector-reach/`를 지운다.
    - 확인: `grep -rn "inspector-reach" docs/ app/ cli/` 결과 없음.
    - ── 커밋 경계 (`docs(PRODUCT):`, `docs(ARCHITECTURE):` 문서별) ──
