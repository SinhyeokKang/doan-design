# inspector 넓히기 — spec

## 사용자

- **사람(캔버스 페이지)**: Select로 요소를 고른 뒤, 헤더까지 가지 않고 선택 버블에서 바로 inspector를 연다.
- **사람(export 파일을 받은 사람)**: Doan 없이 브라우저로 연 export 파일에서 inspector를 열고 요소를 골라 스타일 값을 본다. 개발자에게 넘긴 디자인 파일에서 값을 확인하는 용도다. inspector를 열지 않은 수신자에게는 지금과 달라지는 것이 없다.
- **에이전트**: 변화 없다. inspector 값은 지금처럼 CLI 출력에 나오지 않는다(PRODUCT §5 item 4 'Inspector', "Not offered").

## 문제 (관찰된 사실)

- 캔버스 페이지에서 inspector는 캔버스 헤더의 Show inspector로만 열린다(PRODUCT §5 item 4 'Inspector': "only the person opens it, with Show inspector in the canvas header … no agent, menu item or shortcut does"). 요소를 고른 자리(선택 버블: Play, 크기, Add to message)에는 inspector로 가는 길이 없다.
- export 파일의 뷰어에는 선택, hover, inspector가 없다(PRODUCT §5 item 3 'Export and viewer': "There is no selection, hover, picking, conversation or Reload"; item 4: inspector는 "not the Overview, the prototype window or the export viewer"). 파일을 받은 사람은 값을 볼 수 없다.

## 완료 조건

### (B) 선택 버블의 Show inspector

1. 캔버스 페이지에서 선택 버블이 보일 때, inspector 열이 보이지 않으면(접힘 또는 yield) 버블 맨 오른쪽(Add to message 뒤)에 아이콘 버튼이 있다. 아이콘은 헤더의 Show inspector와 같은 lucide `sliders-horizontal`이고, 접근 이름과 툴팁도 "Show inspector"다. inspector 열이 보이면 버튼은 없다.
2. 누르면 inspector가 열리고(헤더의 Show inspector와 같은 동작, 같은 저장 설정), 버튼은 사라지고, 포커스는 Hide inspector로 간다(지금 열기 규칙). 포인터로 눌러도 포커스를 빼앗지 않는다(누르는 순간에는 지금 포커스가 그대로다).
3. inspector가 좁은 창 때문에 물러나 있으면(yield) 버튼은 보이되 쓸 수 없고(`aria-disabled`), 툴팁과 접근 설명에 Show inspector와 같은 이유("No room for the inspector. Widen the window, or narrow or hide the conversation.")를 보인다. 창이 넓어져 inspector가 돌아오면 버튼은 사라지고, 버튼에 있던 포커스는 Hide inspector로 간다.
4. 버튼에 포커스가 있는 채 버블이 사라지면(선택 해제, Hand로 전환 등) 포커스는 헤더의 Show inspector로 간다. Play와 Add to message의 지금 규칙(PRODUCT §5 item 2 'Size bubble')은 그대로다.
5. 버블의 다른 버튼(Play, Add to message)은 이 버튼을 눌러도 실행되지 않는다.

6. 앱 inspector의 element menu(요소 트리)는 가로로 스크롤한다. 깊이마다 24px씩 들여쓰는 행이 메뉴보다 넓어지면(깊이 약 10단계부터) 이름을 자르거나 줄바꿈하지 않고 메뉴 안쪽이 가로로 스크롤된다. 메뉴를 열면 선택된 행의 아이콘과 이름이 보이도록 가로 위치를 맞추고, 키보드로 행을 옮기면 그 행의 이름이 보이게 따라간다. 지금은 깊은 요소의 이름이 보이지 않는다(2026-11-19 사용자 관찰). 뷰어의 element menu도 같은 규칙이다.

### (A) export 파일의 inspector

7. 뷰어 헤더에 Show inspector가 있다. 파일을 열 때 inspector는 항상 접혀 있고, 열림 상태는 저장하지 않는다. 브라우저 창이 좁으면 앱처럼 물러나고(yield) Show inspector는 이유와 함께 쓸 수 없다.
8. inspector가 접혀 있는 동안 뷰어는 지금과 같다: Select에서 캔버스의 필드·버튼·스크롤이 그대로 동작하고 선택·hover가 없다.
9. inspector가 열려 있는 동안 Select는 앱과 같은 선택 규칙을 따른다(PRODUCT §5 item 4 'Selection': 프레임 먼저, 한 번 더 누르면 한 단계 안으로, ⌘-click은 바로 요소, Option-click은 캔버스로 통과). hover는 다음 클릭 대상을 표시하고, 잘린 요소의 표시는 잘린 범위를 따른다. 캔버스 텍스트는 앱의 텍스트 드래그 규칙(PRODUCT §5 item 4)대로 드래그해 고르고 ⌘C로 복사한다.
10. Esc: Hand에서는 Select로 돌아간다(지금 규칙). Select에서 선택이 있으면 한 단계 밖으로 나간다.
11. inspector 열에는 고른 요소의 값이 앱 inspector와 같은 묶음·순서로 나온다. 값은 앱과 같다: 캔버스가 정한 값과 그 변수 이름·출처. 다만 CSSOM이 앱과 같은 출처를 내지 못하는 행(같은 규칙의 var() shorthand 뒤 longhand, 외부 시트)은 토큰 없이 계산된 값만 보인다(PoC 결과와 2026-11-19 사용자 결정, design.md). 앱 inspector의 element menu(요소 트리)도 있어, 키보드로 요소를 고를 수 있다.
12. 행을 누르면 그 값이 복사되고, 성공·실패는 inspector 안의 상태 줄(`aria-live`)로 알린다. 값은 읽기 전용이다.
13. 상태: 고른 요소가 캔버스 스크립트로 사라지면 빈 상태로 돌아간다. 외부 스타일시트(CORS로 읽지 못하는 시트)에서 온 값의 행은 다른 행과 똑같이 브라우저가 적용한 값만 보인다(토큰 이름 없음, 표시·안내 없음, 2026-11-19 사용자 결정).
14. 파일은 지금처럼 네트워크 없이 열리고, 크기 한도(50 MiB)와 출력 고정 테스트 규칙을 지킨다. JavaScript가 없을 때(Quick Look 등)는 지금과 같다. 프로토타입 파일(`--prototype`)의 출력은 바뀌지 않는다.

## 비목표

- 프로토타입 창과 프로토타입 파일의 inspector.
- 여러 요소 동시 값, hover 요소의 값(PRODUCT §5 item 4 "Not offered"는 그대로).
- export 뷰어의 picking, 대화, Reload, 측정(Option 측정), 선택 버블.
- 값 편집.
- 뷰어 inspector 폭 조절과 열림 상태 저장.

## PRODUCT에서 바뀌는 결정 (사용자 요청으로 바꾼다)

- item 4 'Inspector': "only … with Show inspector in the canvas header"(B), "only on the canvas page (not … the export viewer)"(A).
- item 2 'Size bubble': "holds, in order, a small Play button, the size and Add to message"와 포커스 이동 규칙(B).
- item 3 'Export and viewer': "There is no selection, hover, picking, conversation or Reload", "Select leaves the canvas to work as it does"(A: inspector가 열렸을 때만 달라진다).
- item 4 'Measuring': "The prototype window and viewer have no selection and so no measurement"(A: 뷰어는 inspector가 열렸을 때 선택이 있다. 측정은 여전히 없다).
- §2 마지막 문단과 §3 In scope 8: 파일 수신자가 '보는 사람'에서 값을 확인하는 사람까지 넓어진다(A).
