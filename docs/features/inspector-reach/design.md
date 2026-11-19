# inspector 넓히기 — design

## 영향 받는 구성 요소

### (B) 선택 버블의 Inspect — 앱(renderer)

- 버블은 React가 아니라 controller DOM이다: `makeBubble`, `placeSize`, `makePlay`(`app/src/renderer/CanvasController.ts:2263-2350`), 배치는 `sizeBubblePlace`(`sizeBubble.ts:18`, 순수). Add to message는 App이 `.bubble-host`에 portal로 넣는다(`BubbleAdd.tsx`, `App.tsx:2620`).
- Inspect도 Add to message처럼 App이 portal로 넣는다. 열기는 `foldInspector`(`App.tsx:2381`)를 그대로 부른다. 보임 조건은 `inspectorShown`(`App.tsx:2243`)의 반대.
- 버튼이 사라질 때 포커스는 `moveBubbleFocus`(`CanvasController.ts:2290`)의 규칙에 새 버튼의 대상을 더한다.
- 측정값: `docs/design/prototype.md:64-65`('Size bubble with Play', 'Bubble placement'), inspector 열기 규칙은 `docs/design/canvas.md:219-223`.

### (A) export 파일의 inspector — CLI(Go) + 뷰어 JS

- export는 CLI만 만든다(`cli/internal/export/`, 앱은 `doan export`를 부른다: `canvasExport.ts:9`). 뷰어는 `cli/internal/export/viewer/{shell.html,shell.css,shell.js,lib.js,measure.js}`를 `//go:embed`로 넣는다(`assemble.go:18`).
- 캔버스는 `<iframe sandbox="allow-scripts" srcdoc>`(opaque origin)에 들어가고, `measure.js`가 캔버스 head에 들어가 `postMessage`로만 말한다(ARCHITECTURE §3 'Exported canvas and viewer').
- 앱 inspector는 main이 CDP(`CSS.getMatchedStylesForNode`)로 값을 읽는다(`app/src/main/inspector.ts`). 브라우저에는 CDP가 없으므로, 뷰어에서는 `measure.js` 쪽(캔버스 안)이 CSSOM으로 값을 모아 보내야 한다.
- 다시 쓸 수 있는 것: `app/src/main/inspect.ts`의 순수 함수(`inspectRows`, `resolveVars`, `longhandSource`, `colorHex`, `collapseBox`)와 `app/src/renderer/inspectorRows.ts`(`rowDisplay`, `rowCopyText` 등). 다만 `inspectRows`는 CDP `MatchedStyles` 모양을 받으므로 CSSOM 어댑터가 선택자 매칭과 우선순위 정렬을 직접 해야 한다.
- 뷰어 JS는 앱 소스를 손으로 복사하고 `app/src/main/exportViewer.test.ts`가 각 복사본을 앱 소스와 비교해 고정한다. 새로 복사하는 함수도 같은 방식으로 고정한다.
- 선택·hover: `canvasScript.ts`의 순수 helper(`frameStep`, `escapeTarget`, `elementSelector`)는 복사할 수 있다. 클릭·hover 처리기는 앱의 seq·anchor 프로토콜에 묶여 있어 뷰어용으로 새로 쓴다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

1. (B) `bubbleItems(state): Item[]` — 버블의 버튼 목록과 순서(Play, 크기, Add to message, Inspect)와 Inspect의 보임·사용 가능 여부(inspector 접힘, yield 이유).
2. (A) `cssomMatched(element, sheets): MatchedStyles` — CSSOM 규칙에서 CDP와 같은 모양의 matched styles를 만든다(선택자 매칭, 우선순위, `@layer`, 상속). PoC가 실패하면 `computedRows(computed)`로 바꿀지 사용자에게 다시 묻는다.
3. (A) 뷰어용 `inspectRows`와 `rowDisplay`/`rowCopyText` 복사본(앱 소스와 고정 테스트).
4. (A) 뷰어 선택 단계: 앱의 `frameStep`과 같은 규칙.

## 형식 변경

- JSON Schema(ARCHITECTURE §11 'Shared formats')는 바뀌지 않는다.
- export 파일 내용이 바뀐다(뷰어 JS·CSS가 늘어난다). 출력 고정 테스트(`TestAssembleOutputIsPinned`)를 새 출력으로 갱신하고, 늘어나는 바이트를 기록한다.

## Conventions 영향

없다. 캔버스 conventions와 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 4 'Inspector'의 "only the person opens it, with Show inspector in the canvas header … no agent, menu item or shortcut does": 버블의 Inspect가 두 번째 열기 경로가 된다. 사람이 여는 것이라 "only the person"은 그대로다.
- PRODUCT §5 item 4의 "only on the canvas page (not the Overview, the prototype window or the export viewer)": export 뷰어를 뺀다.
- PRODUCT §5 item 3 'Export and viewer'의 "There is no selection, hover, picking, conversation or Reload": selection과 hover를 뺀다. ARCHITECTURE §3 'Exported canvas and viewer'의 "Left out: selection, hover …"도 같이 고친다.
- ARCHITECTURE §3 'Canvas rendering'은 앱 inspector가 CDP를 쓰는 이유로 "canvases under their own CSP and sheets without CORS"를 든다. 뷰어의 CSSOM 방식은 이 한계를 그대로 가진다(아래 PoC). 앱의 방식은 바뀌지 않는다.
- ARCHITECTURE §3 'Untrusted messages': 캔버스 자신의 스크립트가 `measure.js`의 메시지를 흉내 낼 수 있다. 뷰어 inspector가 받는 값도 신뢰하지 않는 데이터로 다룬다(텍스트로만 그린다).

## 이전 사고에서 가져온 주의점 (docs/postmortem/)

- 2026-11 hover가 잘린 요소 밖으로 그려진 사고(`docs/postmortem/2026-11.md:13-15`): 뷰어의 hover·선택 표시도 clip을 따라야 한다. 테스트 캔버스에 잘린 넓은 요소를 넣는다.
- 2026-11 툴바 버튼이 포커스를 가져가 Space가 막힌 사고(`docs/postmortem/2026-11.md:162`): 버블의 Inspect도 포인터 누름으로 포커스를 가져가지 않는지 확인한다.

## PoC 의존 (먼저 확인)

1. opaque-origin `srcdoc` iframe 안에서 `data:`로 바꾼 스타일시트의 `cssRules`를 Chromium과 Safari 모두에서 읽을 수 있는지. 못 읽으면 D1의 '앱과 같은 값'은 불가능하고 계산된 값만 남는다.
2. 외부 URL 스타일시트(CDN 등)는 CORS 때문에 읽지 못한다. 그 규칙에서 온 값을 어떻게 보일지(계산된 값으로 대신, 또는 출처 없음 표시).
3. 뷰어 JS가 늘어나는 크기(지금 Geist를 빼서 약 93 KB를 아낄 만큼 무게를 따진다).
