# inspector 넓히기 — spec

## 사용자

- **사람(캔버스 페이지)**: Select로 요소를 고른 뒤, 헤더까지 가지 않고 선택 버블에서 바로 inspector를 연다.
- **사람(export 파일을 받은 사람)**: Doan 없이 브라우저로 연 export 파일에서 요소를 골라 스타일 값을 본다. 개발자에게 넘긴 디자인 파일에서 값을 확인하는 용도다.
- **에이전트**: 변화 없다. inspector 값은 지금처럼 CLI 출력에 나오지 않는다(PRODUCT §5 item 4 'Inspector', "Not offered").

## 문제 (관찰된 사실)

- 캔버스 페이지에서 inspector는 캔버스 헤더의 Show inspector로만 열린다(PRODUCT §5 item 4 'Inspector': "only the person opens it, with Show inspector in the canvas header … no agent, menu item or shortcut does"). 요소를 고른 자리(선택 버블: Play, 크기, Add to message)에는 inspector로 가는 길이 없다.
- export 파일의 뷰어에는 선택, hover, inspector가 없다(PRODUCT §5 item 3 'Export and viewer': "There is no selection, hover, picking, conversation or Reload"; item 4: inspector는 "not the Overview, the prototype window or the export viewer"). 파일을 받은 사람은 값을 볼 수 없다.

## 완료 조건

### (B) 선택 버블의 Inspect

1. 캔버스 페이지에서 Select로 요소나 프레임을 고르면 뜨는 선택 버블의 맨 오른쪽(Add to message 뒤)에 Inspect 버튼이 있다. inspector가 접혀 있을 때만 보인다.
2. Inspect를 누르면 inspector가 열리고(Show inspector와 같은 동작, 같은 저장 설정), 버튼은 사라진다. 포커스는 Hide inspector로 간다(지금 열기 규칙).
3. inspector가 좁은 창 때문에 물러나 있으면(yield) Inspect는 보이되 쓸 수 없고, 툴팁과 접근 설명에 Show inspector와 같은 이유("No room for the inspector. Widen the window, or narrow or hide the conversation.")를 보인다.
4. 버블에서 버튼이 사라질 때 포커스 이동은 지금 버블 규칙을 따른다(PRODUCT §5 item 2 'Size bubble').

### (A) export 파일의 inspector

5. export 파일의 뷰어에서 Select로 요소를 고를 수 있고, hover가 다음 클릭 대상을 표시한다. 선택 규칙은 앱의 Select와 같다(PRODUCT §5 item 4 'Selection': 프레임 먼저, 한 번 더 누르면 한 단계 안으로, ⌘-click은 바로 요소, Esc는 한 단계 밖으로, Option-click은 캔버스로 통과). 지금 뷰어의 "Select leaves the canvas to work as it does"는 없어지고, 캔버스의 필드·버튼은 Option-click으로 쓴다.
6. 뷰어 헤더에 Show inspector가 있고, 열면 오른쪽 열에 고른 요소의 값이 앱 inspector와 같은 묶음·순서로 나온다. 값은 앱과 같다: 캔버스가 정한 값과 그 변수 이름·출처. 단 tasks의 PoC가 이를 확인해야 하고, Safari 등에서 규칙을 읽지 못하면 계산된 값으로 물러설지 다시 묻는다.
7. 행을 누르면 그 값이 복사된다(앱과 같다). 값은 읽기 전용이다.
8. 파일은 지금처럼 네트워크 없이 열리고, 크기 한도(50 MiB)와 출력 고정 테스트 규칙을 지킨다. JavaScript가 없을 때(Quick Look 등)는 지금과 같다.
9. 프로토타입 파일(`--prototype`)에는 inspector가 없다.

## 비목표

- 프로토타입 창의 inspector.
- 여러 요소 동시 값, hover 요소의 값(PRODUCT §5 item 4 "Not offered"는 그대로).
- export 뷰어의 picking, 대화, Reload.
- 값 편집.
- export 뷰어의 선택 버블(크기, Add to message). 뷰어에는 대화가 없다.

## PRODUCT에서 바뀌는 결정 (사용자 요청으로 바꾼다)

- item 4 'Inspector': "only … with Show inspector"(B), "not … the export viewer"(A).
- item 3 'Export and viewer': "no selection, hover", "Select leaves the canvas to work as it does"(A).
