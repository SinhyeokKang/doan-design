# inspector 넓히기 — design

(B)와 (A)는 서로 다른 파일을 바꾸므로 따로 `/ship`한다. (B)를 먼저 머지한다. (A)는 PoC 결과에 따라 사용자에게 다시 물을 수 있어서 (B)를 막지 않게 한다.

## (B) 선택 버블의 Show inspector — 앱(renderer)

- 버블은 React가 아니라 controller DOM이다: `makeBubble`, `placeSize`, `makePlay`(`app/src/renderer/CanvasController.ts:2263-2350`), 배치는 `sizeBubblePlace`(`sizeBubble.ts:18`, 순수). Add to message는 App이 `.bubble-host`에 portal로 넣는다(`BubbleAdd.tsx`, `App.tsx:2620`).
- `.bubble-host`의 click 리스너 하나가 host 안의 어떤 클릭이든 `bubbleAdd.onAdd()`를 부른다(`CanvasController.ts:2329`). 새 버튼을 같은 host에 넣으면 누를 때 Add to message가 실행된다. 그래서 버튼마다 `data-bubble-action`을 달고 리스너가 `closest("[data-bubble-action]")`로 나눠 보낸다.
- 열기는 `foldInspector`(`App.tsx:2381`)를 그대로 부른다. 보임 조건은 열이 보이지 않는 것이다(`inspectorShown`, `App.tsx:2243`의 반대). yield일 때의 비활성 이유는 `headerShowButtons.ts:13`(순수)의 Show inspector와 같은 값을 쓴다.
- 포커스: `moveBubbleFocus`(`CanvasController.ts:2290`)와 `awaitBubbleReturn`(`:2309`)의 `"play" | "add"`에 `"inspect"`를 더한다. 버블이 사라질 때의 `onFocusLost`는 헤더의 Show inspector로 보낸다. 포인터 누름은 `mousedown` `preventDefault`로 포커스를 가져가지 않는다(툴바와 같은 규칙).
- 측정값: `docs/design/prototype.md:64-65`('Size bubble with Play', 'Bubble placement'), inspector 열기 규칙은 `docs/design/canvas.md:219-223`.

## (A) export 파일의 inspector — CLI(Go) + 뷰어 JS

- export는 CLI만 만든다(`cli/internal/export/`, 앱은 `doan export`를 부른다: `app/src/main/canvasExport.ts:9`). 뷰어는 `cli/internal/export/viewer/{shell.html,shell.css,shell.js,lib.js,measure.js}`를 `//go:embed`로 넣는다(`assemble.go:18`).
- 캔버스는 `<iframe sandbox="allow-scripts" srcdoc>`(opaque origin)에 들어가고, `measure.js`가 캔버스 head에 들어가 `postMessage`로만 말한다(ARCHITECTURE §3 'Exported canvas and viewer').
- 앱 inspector는 main이 CDP(`CSS.getMatchedStylesForNode`)로 값을 읽는다(`app/src/main/inspector.ts`). 브라우저에는 CDP가 없으므로, 뷰어에서는 `measure.js` 쪽(캔버스 안)이 CSSOM으로 값을 모아 행을 계산한다.
- CSSOM으로 CDP와 같은 결과를 내려면 다음을 직접 만들어야 한다(`inspectRows`가 CDP에 기대는 부분, `inspect.ts:47-74`): cascade 순서 정렬, `matchingSelectors`, specificity(`:is`·`:where`·`:has`), `@layer` 순서, `@media`·`@container`·`@supports` 평가, nesting, var()가 든 shorthand의 longhand 전개(CSSOM은 그 longhand에 `""`를 준다). PoC가 이것을 확인한다.
- 코드 가져오기: `app/src/main/inspect.ts`(617줄)와 `app/src/renderer/inspectorRows.ts`(225줄)의 순수 부분은 손으로 복사하지 않고, 스크립트가 TS 소스에서 `cli/internal/export/viewer/inspect.js`를 생성하고 `--check`로 차이를 잡는다(`app/scripts/doanyGolden.mjs`와 같은 방식). 기존 손 복사본(`lib.js`, `exportViewer.test.ts`가 고정)은 그대로 둔다. 선택 helper(`frameStep`, `escapeTarget`, `elementSelector`, `visibleRect` `canvasScript.ts:92`)도 생성 대상에 넣는다. 클릭·hover 처리기는 앱의 seq·anchor 프로토콜에 묶여 있어 뷰어용으로 새로 쓴다. ARCHITECTURE에 이 생성 규칙을 새로 적는다.
- 메시지 신뢰: 행 계산은 `measure.js`가 하고, 보내는 것은 `InspectRow[]`다. 캔버스 자신의 스크립트가 같은 페이지에서 메시지를 흉내 낼 수 있으므로(ARCHITECTURE §3 'Untrusted messages') shell은 `parseMessage`(`lib.js:134`)에서 행 수와 문자열 길이 상한, seq를 검사하고 `textContent`로만 그린다.
- 선택은 inspector가 열렸을 때만 켠다. 접혀 있으면 `measure.js`는 클릭·hover를 가로채지 않는다.
- Esc 순서: 전달된 Esc(`escapeSelects`)와 함께, Hand면 Select로, Select에서 선택이 있으면 한 단계 밖으로.
- 새 메뉴(element menu)와 inspector 열은 뷰어의 overlayOpen 표에 넣는다(2026-10 재발 기록).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. (B) `bubbleItems(state): Item[]` — 버블의 버튼 목록과 순서(Play, 크기, Add to message, Show inspector)와 Show inspector의 보임·사용 가능 여부(열 보임, 접힘, yield 이유).
2. (B) `bubbleAction(target): "play" | "add" | "inspect" | null` — host 클릭을 동작으로 나누기.
3. (A) `cssomMatched(element, sheets): MatchedStyles` — CSSOM 규칙에서 CDP와 같은 모양의 matched styles를 만든다. PoC가 일부 경우만 같게 나오면 그 행을 어떻게 보일지 사용자에게 다시 묻는다.
4. (A) 생성되는 `inspectRows`, `rowDisplay`, `rowCopyText`, 선택 단계(`frameStep`) — 생성 스크립트 `--check`로 앱 소스와 같은지 고정.
5. (A) shell의 행 메시지 검증(행 수·길이 상한, seq).

## 형식 변경

- JSON Schema(ARCHITECTURE §11 'Shared formats')는 바뀌지 않는다.
- export 파일 내용이 바뀐다(뷰어 JS·CSS가 늘어난다). 출력 고정 테스트(`TestAssembleOutputIsPinned`)를 새 출력으로 갱신하고, 늘어나는 바이트를 기록한다. 늘어나는 양의 상한은 PoC에서 잰 값을 보고 정한다. 프로토타입 파일 출력은 바뀌지 않는다.

## Conventions 영향

없다. 캔버스 conventions와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- spec 'PRODUCT에서 바뀌는 결정'의 문장들.
- ARCHITECTURE §3 'Exported canvas and viewer'의 "Left out: selection, hover …"를 고치고, 생성 규칙을 더한다.
- ARCHITECTURE §3 'Canvas rendering'은 앱 inspector가 CDP를 쓰는 이유로 "canvases under their own CSP and sheets without CORS"를 든다. 뷰어의 CSSOM 방식은 이 한계를 그대로 가진다(외부 시트 행 표시). 앱의 방식은 바뀌지 않는다.

## 이전 사고에서 가져온 주의점 (docs/postmortem/)

- 2026-11 hover가 잘린 요소 밖으로 그려진 사고(`docs/postmortem/2026-11.md:10-17`): 뷰어의 hover·선택 표시도 clip을 따라야 한다(`visibleRect`). 테스트 캔버스에 잘린 넓은 요소를 넣는다.
- 2026-11 툴바 버튼이 포커스를 가져가 Space가 막힌 사고(`docs/postmortem/2026-11.md:160-166`): 버블의 Show inspector와 뷰어의 Show inspector도 포인터 누름으로 포커스를 가져가지 않는다.
- `docs/postmortem/2026-11.md:51-57`: srcdoc 관련 수정은 `isolate.js`와 `measure.js`에 함께 넣고 복사본을 고정한다.

## PoC 의존 (먼저 확인)

1. 통과 기준: fixture 캔버스들(변수, `@layer`, `@media`, `@container`, `:is`·`:where`·`:has`, nesting, var() shorthand, `@import`, 외부 시트 하나)에서 뷰어 CSSOM 경로의 `inspectRows` 출력이 앱 CDP 경로의 출력과 같다. Chromium은 `exportViewer.test.ts`가 이미 쓰는 `launchElectronDom`으로, WebKit은 Playwright로 확인한다. 실제 Safari는 실행하지 않는다는 점을 기록한다.
2. opaque-origin `srcdoc` iframe 안에서 `data:`로 바꾼 스타일시트의 `cssRules`를 Chromium과 WebKit 모두에서 읽는가.
3. 외부 URL 스타일시트(CORS)에서 온 값을 어떻게 보일지.
4. `file://`로 연 파일에서 클립보드 쓰기가 Safari(WebKit)에서 되는가.
5. 뷰어 JS가 늘어나는 크기.

## 초안 요청 (`/design-draft`)

- (B) 캔버스: `.doan/canvases/inspector-reach-bubble.html`, id `inspector-reach-bubble`, `doan:width` 1600. 새 파일이다.
  - `bubble-element` — 요소 선택, inspector 접힘: 크기, Add to message, Show inspector(아이콘).
  - `bubble-frame-play` — 재생할 수 있는 프레임 선택: Play, 크기, Add to message, Show inspector.
  - `bubble-yield` — 좁은 창에서 inspector가 물러남: Show inspector 비활성과 이유 툴팁.
  - `bubble-open` — inspector 열림: 버블에 Show inspector 없음, 오른쪽에 inspector 열.
  - `bubble-edge` — 선택이 보드 아래 가장자리에 있어 버블이 위로 뒤집힘(버튼이 하나 늘어난 폭).
  - 그대로 베끼는 출하 화면: 캔버스 페이지와 버블 `docs/design/prototype.md` 'Size bubble with Play'·'Bubble placement', `docs/design/canvas.md` 'Canvas inspector', 코드 `CanvasController.ts`, `BubbleAdd.tsx`, `InspectorPanel.tsx`.
- (A) 캔버스: `.doan/canvases/inspector-reach-viewer.html`, id `inspector-reach-viewer`, `doan:width` 1600. 새 파일이다. PoC보다 먼저 그리고(2026-11-19 사용자 결정), PoC 결과로 바뀌면 `--revise`로 고친다.
  - `viewer-folded` — inspector 접힘: 지금 뷰어 그대로에 헤더의 Show inspector만 더함.
  - `viewer-open-empty` — inspector 열림, 선택 없음: 빈 상태 문구(요소를 누르면 값이 나오고 Option-click은 캔버스로 간다는 안내).
  - `viewer-selected` — 요소 선택과 다른 요소 hover, inspector 열에 값(변수 이름·출처), element menu 트리거.
  - `viewer-element-menu` — element menu(요소 트리)가 열린 상태.
  - `viewer-external-row` — 외부 스타일시트에서 온 값의 행이 섞인 inspector(다른 행과 똑같이 값만 보인다).
  - `viewer-copy-status` — 행을 눌러 복사한 뒤 상태 줄(성공, 실패 두 타일).
  - `viewer-text-select` — inspector가 열린 Select에서 캔버스 텍스트를 드래그해 고른 상태.
  - `viewer-yield` — 좁은 브라우저 창: inspector가 물러나고 Show inspector가 이유와 함께 비활성.
  - 그대로 베끼는 출하 화면: export 뷰어 `docs/design/canvas.md` 'Canvas row menu and export viewer'와 `cli/internal/export/viewer/shell.html`·`shell.css`(초안 `.doan/canvases/export-viewer-chrome.html`은 고치지 않는다), inspector 열 `docs/design/canvas.md` 'Canvas inspector'와 `InspectorPanel.tsx`.

## 초안 리뷰에서 정한 것 (2026-11-19, 사용자)

- 외부 시트 행: 표시 없이 값만. 브라우저가 적용한 값을 다른 행처럼 보이고, 토큰 이름·출처 표시·목록 위 안내를 두지 않는다. PoC 3은 이런 행에서 토큰을 보일 수 있는지만 확인한다.
- 뷰어: Show inspector는 줌 뒤 구분선 다음, 툴팁은 버튼 아래. 빈 상태 문구는 "Option-click (Alt-click)"을 함께 쓴다. 복사 실패는 "This browser blocked copying. Open the file in another browser." yield는 창 폭 657px 미만, "No room for the inspector. Widen the browser window.", 열이 돌아오면 선택도 되살린다. 마크는 기본 accent.
- 버블(B): 리뷰 지적 없음, 초안대로.
- 버블 초안 확정: `.doan/canvases/inspector-reach-bubble.html`(커밋 `b894096b8`)을 사용자가 앱에서 확인하고 확정했다(2026-11-19).
