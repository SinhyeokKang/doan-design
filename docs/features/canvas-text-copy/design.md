# canvas-text-copy — design

## 방향

누름은 지금처럼 캔버스로 보내지 않는다. 텍스트 선택은 브라우저 기본 동작이 아니라 캔버스 스크립트가 `document.caretPositionFromPoint`와 Selection API로 직접 만든다. 복사는 앱 문서의 `copy` 이벤트에서 캔버스 스크립트가 미리 알려 둔 텍스트를 쓴다.

검토한 대안:
- **텍스트 위 누름만 캔버스로 통과**: 브라우저 기본 선택(더블클릭 단어 선택 포함)을 그대로 얻지만, 같은 누름이 초안의 `mousedown`·`pointerdown` 리스너, `:active`, 포커스에 닿는다. 탭 라벨 같은 텍스트를 긁으면 초안의 동작이 일어나고, 포커스가 iframe으로 들어가 V·H·Esc·Space 처리가 ⌥-클릭 경로처럼 바뀐다. "plain press never reaches the canvas" 규칙이 막는 것을 다시 여는 것이라 제외한다.
- **⌥-드래그 안내만 추가**: 코드 변경이 가장 적지만, ⌥ 누름은 초안을 실제로 움직이고 사용자가 원한 "Select에서 바로 긁기"가 아니다.

## 영향 받는 구성요소

- **앱(injected canvas script)**: `app/src/main/canvasScript.ts`.
  - `pointerdown`(capture)은 지금처럼 `preventDefault`·`stopPropagation`한다. 그 자리에서 누른 점의 캐럿(`caretPositionFromPoint`)이 텍스트 노드이고 선택할 수 있는 텍스트면(아래 '선택 대상') 후보로 기억한다.
  - `pointermove`에서 누른 자리부터 끌기 거리 기준을 넘으면 텍스트 드래그로 바뀐다. 그때부터 hover를 숨기고, 포인터 자리의 캐럿까지 `Selection.setBaseAndExtent`로 범위를 갱신한다. 포인터 캡처(`setPointerCapture`)로 iframe 밖으로 나간 움직임과 놓기도 받는다.
  - 텍스트 드래그로 끝난 누름의 `click`은 요소를 선택하지 않는다(지금처럼 막고, `choose`를 부르지 않는다).
  - 선택이 바뀔 때 선택 텍스트(`Selection.toString()`, 상한 적용)를 앱에 메시지로 보낸다. 선택이 비면 빈 값을 보낸다.
  - 다음 누름, `clear-text` 명령, 문서 unload에서 선택을 지운다.
- **앱(renderer)**: `app/src/renderer/canvasMessage.ts`(새 메시지 파싱), `CanvasController.ts`(캔버스 텍스트 상태, 지우기 명령: Hand 전환, Space, Picker, Capture area, 캔버스 전환·닫기, Esc), 복사 처리(앱 문서 `copy` 리스너, `copyText.ts`와 `chipField.ts`의 기존 `copy` 처리와 순서 맞추기).
- **앱(main)**: 바뀌지 않는다. Edit > Copy는 `role: "copy"`로 포커스된 프레임(앱 문서)에 `copy`를 보내므로 renderer의 `copy` 리스너가 받는다(PoC 2).
- **CLI(Go)**, **스킬**, **가이드**, `doan active`, app-socket, export viewer: 바뀌지 않는다.

## 선택 대상

- 시작점: 누른 점의 캐럿이 `Text` 노드이고, 그 글자 범위의 사각형이 누른 점을 담는다(줄 끝 너머의 빈 곳을 누르면 시작하지 않는다). 계산된 `user-select`가 `none`이면 시작하지 않는다.
- 제외: `input`, `textarea`, `select`의 값, contenteditable은 지금처럼 inert(누름이 가지 않으므로 포커스·편집 없음), 중첩 iframe 안(스크립트가 없다), `<template>` 안.
- 끝점: 포인터 자리의 캐럿. 캐럿이 없으면(빈 곳) 마지막 끝점을 유지한다. 범위가 프레임 경계를 넘는 것은 막지 않는다. 브라우저 Selection이 문서 순서로 범위를 만든다.

## 복사

- 캔버스 스크립트는 선택이 바뀔 때 텍스트를 보낸다(메시지 상한은 기존 selection `text` 상한 방식, 코드 포인트 기준). 상한을 넘으면 메시지를 보내지 않고(기존 'Caps' 규칙처럼 자르지 않는다) 앱은 선택이 없는 것으로 본다. 상한은 `/tdd`에서 정하고 ARCHITECTURE §3 'Caps'에 적는다.
- renderer의 `copy` 리스너(앱 문서, capture 아님, 기존 필드 처리 뒤): `event.defaultPrevented`이거나 앱 쪽에 선택(`getSelection()`이 비지 않음)이나 포커스된 편집 필드가 있으면 아무것도 하지 않는다. 캔버스 페이지이고 캔버스 텍스트가 있으면 `clipboardData.setData("text/plain", text)`와 `preventDefault`.
- 텍스트는 캔버스가 쓸 수 있는 데이터다(ARCHITECTURE §3 'Untrusted text'). 일반 텍스트로만 클립보드에 넣고, HTML로 그리거나 해석하지 않는다.

## Esc

- 텍스트 선택이 있으면 Esc는 먼저 텍스트 선택만 지운다. 요소 선택 단계는 다음 Esc부터다(사용자 결정, 2026-11-12). 텍스트 선택이 없으면 지금 Esc 규칙 그대로다.

## 사용자 결정 (2026-11-12)

1. 목적은 복사뿐이다. 대화 인용은 하지 않는다.
2. 누름은 캔버스로 보내지 않고 스크립트가 선택을 그린다('방향').
3. 텍스트 드래그는 요소 선택을 바꾸지 않는다. 움직이지 않은 클릭만 요소를 선택한다.
4. Esc는 텍스트 선택을 먼저 지운다.
5. 더블클릭 단어 선택은 이번에 넣지 않는다. 더블클릭은 지금처럼 클릭 두 번(프레임 단계 두 번)이다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

1. `textDragState(start, point, threshold)` → 아직 클릭인지, 텍스트 드래그로 바뀌었는지. 기준 거리 경계값.
2. `textCopy({ canvasText, appSelection, editableFocused, defaultPrevented, onCanvasPage })` → 넣을 텍스트 또는 `null`.
3. `escapeIntent({ hasCanvasText, … })` → 텍스트 지우기인지 요소 단계인지.
4. `parseCanvasMessage`의 새 메시지(텍스트 상한, 타입 검사).
5. 텍스트를 지우는 상태 전이(Hand, Space, Picker, Capture area, 전환·닫기) → `clear-text`를 보낼지.

## 형식 변경

- 캔버스 ↔ renderer 메시지 하나(선택 텍스트)와 renderer → 캔버스 명령 하나(`clear-text`)가 는다. ARCHITECTURE §3이 말하듯 내부 메시지라 JSON Schema, socket, CLI 계약에 없다. 형식 버전 변경 없음.

## 관례 영향

없다. ARCHITECTURE §1과 `doan check` 규칙은 바뀌지 않는다.

## 결정 영향

- PRODUCT §5 item 4 "Ordinary clicks suppress canvas actions; Option-click uses the canvas"와 ARCHITECTURE §3 'Input'("only trusted primary clicks select")은 지킨다. 누름은 여전히 캔버스로 가지 않는다. 새 동작은 그 위에 스크립트가 그리는 텍스트 선택이다.
- `canvasScript.ts`의 'Input direction' 주석("text selection … stay inert")은 "브라우저 기본 텍스트 선택은 inert, 스크립트가 그리는 드래그 선택만"으로 바꾼다.
- PRODUCT §5 'Text edit menu'의 "Besides fields, text can be selected … only where it is worth copying" 목록에 캔버스 안 텍스트(Select 드래그)를 더한다. "Inside the canvas iframe … there is no menu"는 그대로다.
- PRODUCT §5 item 2 'Toolbar'와 Capture area: 텍스트 선택을 지우는 때를 더한다. 캡처 이미지에는 선택 하이라이트가 없다(Capture area 시작이 선택을 지운다).
- 서빙 범위, sandbox iframe, 토큰 경로 같은 구조 결정은 건드리지 않는다.

## PoC 의존

`/tdd` 전에 격리 앱에서 확인한다.

1. 포커스가 앱 문서에 있는 채로(iframe이 포커스를 받지 않은 채) 캔버스 OOPIF에서 `Selection.setBaseAndExtent`로 만든 선택이 화면에 보이는지, 어떤 색으로 보이는지(Chromium은 포커스 없는 프레임의 선택을 inactive 색으로 그린다). 안 보이거나 거의 안 보이면 멈추고 사용자에게 묻는다(대안: 선택 범위를 앱이 overlay로 그리기).
2. 앱 문서에 선택이 없을 때 ⌘C와 Edit > Copy(`role: "copy"`)가 앱 문서에 `copy` 이벤트를 보내고, 리스너의 `clipboardData.setData`가 시스템 클립보드에 들어가는지.
3. `pointerdown`을 `preventDefault`한 뒤에도 `setPointerCapture`와 `pointermove`가 iframe 밖까지 이어지는지, 드래그 중 Chromium이 기본 선택이나 드래그 앤 드롭을 시작하지 않는지.
4. 드래그 중 iframe 가장자리에서 보드가 자동 스크롤되지 않는다는 것을 확인하고 받아들이는지(이번 범위에서 자동 스크롤은 하지 않는다).

## POSTMORTEM에서 가져온 함정

- **2026-10-23 — Hover stayed hidden across direct reentry and Alt focus transfer**: ARCHITECTURE §3 'Evidence limits'가 이 사례를 든다("pointer and focus tests prove only their exercised sequences (hover re-entry and Alt focus transfer once regressed with passing tests)"). → 드래그 중 hover 숨김과 드래그 뒤 hover 복귀를 실제 앱 probe로 확인한다. 단위 테스트만으로 끝내지 않는다.
- **2026-11-02 — Tab walked into the draft, drew its focus rings and scrolled the floating tools away**: "A runtime probe of a canvas page presses Tab through it at least once with a focusable control below the fold." → 이번 변경은 포커스를 iframe으로 옮기지 않는다. probe에서 드래그 뒤 Tab과 V·H·Space가 그대로인지 본다.
- **2026-10-27 — Runtime clipboard capture constructed an item with no MIME types** (와 2026-11-12 재발): probe가 클립보드를 쓰면 `app/runtime/clipboard.ts`의 공유 helper로 사용자의 클립보드를 저장하고 되돌린다.

## 디자인 프리셋

새 화면, 문구, 토큰이 없어 읽은 프리셋이 없다. 선택 하이라이트는 Chromium 기본 표시를 쓴다(PoC 1 결과에 따라 다시 정함).
